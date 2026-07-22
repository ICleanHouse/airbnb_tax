import logging
import random
from datetime import timedelta

from apps.notifications.delivery import NotificationProviderError, send_notification_email

try:
    from celery import shared_task
except ImportError:  # pragma: no cover - runs without Celery in local dev / tests.
    import functools as _functools

    class _FakeTaskSelf:
        """Minimal stand-in for Celery's bound-task ``self`` when bind=True."""
        max_retries = 3

        def retry(self, exc=None, **_kwargs):
            if exc is not None:
                raise exc

    class _FakeTask:
        def __init__(self, func, bind: bool = False):
            self._func = func
            self._bind = bind
            _functools.update_wrapper(self, func)

        def __call__(self, *args, **kwargs):
            if self._bind:
                return self._func(_FakeTaskSelf(), *args, **kwargs)
            return self._func(*args, **kwargs)

        def delay(self, *args, **kwargs):
            return self(*args, **kwargs)

        def apply(self, args=(), kwargs=None, **_options):
            return self(*(args or ()), **(kwargs or {}))

        def apply_async(self, args=(), kwargs=None, **_options):
            return self(*(args or ()), **(kwargs or {}))

    def shared_task(func=None, bind: bool = False, **_kwargs):  # type: ignore[misc]
        def decorator(f):
            return _FakeTask(f, bind=bind)
        if func is None:
            return decorator
        return _FakeTask(func, bind=bind)


logger = logging.getLogger("apps.notifications")


MAX_DELIVERY_ATTEMPTS = 4
PROCESSING_LEASE = timedelta(minutes=15)
RESEND_IDEMPOTENCY_WINDOW = timedelta(hours=23)


def _claim_delivery(delivery_id: int):
    from django.conf import settings
    from django.db import transaction
    from django.utils import timezone

    from apps.notifications.models import (
        NotificationDelivery,
        NotificationDeliveryAttempt,
        OperatorNotificationAlert,
    )

    with transaction.atomic():
        delivery = (
            NotificationDelivery.objects.select_for_update()
            .select_related("event", "recipient")
            .filter(id=delivery_id)
            .first()
        )
        if delivery is None or delivery.status in {
            NotificationDelivery.Status.SENT,
            NotificationDelivery.Status.SKIPPED,
            NotificationDelivery.Status.FINAL_FAILED,
        }:
            return None
        now = timezone.now()
        if (
            delivery.status == NotificationDelivery.Status.PROCESSING
            and delivery.processing_started_at
            and delivery.processing_started_at > now - PROCESSING_LEASE
        ):
            return None
        if delivery.status == NotificationDelivery.Status.PROCESSING:
            # A worker can disappear after the provider accepted an email but
            # before the local success write. Resend can safely accept the same
            # idempotency key for 24 hours; plain Django SMTP cannot. Outside
            # that guarantee we fail closed for operator investigation instead
            # of risking a duplicate message.
            provider = getattr(settings, "NOTIFICATION_EMAIL_PROVIDER", "django").lower()
            safe_to_replay = (
                provider == "resend"
                and delivery.processing_started_at
                and delivery.processing_started_at > now - RESEND_IDEMPOTENCY_WINDOW
            )
            if not safe_to_replay:
                NotificationDeliveryAttempt.objects.filter(
                    delivery=delivery,
                    attempt_number=delivery.attempt_count,
                    status=NotificationDelivery.Status.PROCESSING,
                ).update(
                    status=NotificationDelivery.Status.FINAL_FAILED,
                    finished_at=now,
                    error_category="provider_state",
                    error_code="ambiguous_delivery_result",
                )
                delivery.status = NotificationDelivery.Status.FINAL_FAILED
                delivery.processing_started_at = None
                delivery.error_category = "provider_state"
                delivery.error_code = "ambiguous_delivery_result"
                delivery.final_failed_at = now
                delivery.save(
                    update_fields=[
                        "status",
                        "processing_started_at",
                        "error_category",
                        "error_code",
                        "final_failed_at",
                        "updated_at",
                    ]
                )
                OperatorNotificationAlert.objects.get_or_create(delivery=delivery)
                logger.error(
                    "Ambiguous notification delivery result",
                    extra={
                        "event": "notification.delivery_final_failed",
                        "delivery_id": delivery.id,
                        "notification_event_type": delivery.event.event_type,
                        "channel": delivery.channel,
                        "attempt_number": delivery.attempt_count,
                        "delivery_result": "final_failed",
                        "error_code": "ambiguous_delivery_result",
                    },
                )
                return None
        delivery.attempt_count += 1
        delivery.status = NotificationDelivery.Status.PROCESSING
        delivery.processing_started_at = now
        delivery.last_attempted_at = now
        delivery.error_category = ""
        delivery.error_code = ""
        delivery.save(
            update_fields=[
                "attempt_count",
                "status",
                "processing_started_at",
                "last_attempted_at",
                "error_category",
                "error_code",
                "updated_at",
            ]
        )
        NotificationDeliveryAttempt.objects.create(
            delivery=delivery,
            attempt_number=delivery.attempt_count,
            status=NotificationDelivery.Status.PROCESSING,
        )
        return delivery


def _record_delivery_success(delivery_id: int, attempt_number: int, external_id: str) -> None:
    from django.db import transaction
    from django.utils import timezone

    from apps.notifications.models import NotificationDelivery, NotificationDeliveryAttempt

    with transaction.atomic():
        delivery = NotificationDelivery.objects.select_for_update().get(id=delivery_id)
        if delivery.status != NotificationDelivery.Status.PROCESSING:
            return
        now = timezone.now()
        NotificationDeliveryAttempt.objects.filter(
            delivery=delivery, attempt_number=attempt_number
        ).update(
            status=NotificationDelivery.Status.SENT,
            finished_at=now,
            provider_external_id=external_id,
        )
        delivery.status = NotificationDelivery.Status.SENT
        delivery.sent_at = now
        delivery.processing_started_at = None
        delivery.provider_external_id = external_id
        delivery.save(
            update_fields=[
                "status",
                "sent_at",
                "processing_started_at",
                "provider_external_id",
                "updated_at",
            ]
        )


def _record_delivery_failure(
    delivery_id: int,
    attempt_number: int,
    *,
    category: str,
    code: str,
    retryable: bool,
) -> bool:
    from django.db import transaction
    from django.utils import timezone

    from apps.notifications.models import (
        NotificationDelivery,
        NotificationDeliveryAttempt,
        OperatorNotificationAlert,
    )

    with transaction.atomic():
        delivery = NotificationDelivery.objects.select_for_update().get(id=delivery_id)
        if delivery.status != NotificationDelivery.Status.PROCESSING:
            return False
        final = not retryable or attempt_number >= MAX_DELIVERY_ATTEMPTS
        status = (
            NotificationDelivery.Status.FINAL_FAILED
            if final
            else NotificationDelivery.Status.RETRYABLE_FAILED
        )
        now = timezone.now()
        NotificationDeliveryAttempt.objects.filter(
            delivery=delivery, attempt_number=attempt_number
        ).update(
            status=status,
            finished_at=now,
            error_category=category,
            error_code=code,
        )
        delivery.status = status
        delivery.processing_started_at = None
        delivery.error_category = category
        delivery.error_code = code
        delivery.final_failed_at = now if final else None
        delivery.save(
            update_fields=[
                "status",
                "processing_started_at",
                "error_category",
                "error_code",
                "final_failed_at",
                "updated_at",
            ]
        )
        if final:
            OperatorNotificationAlert.objects.get_or_create(delivery=delivery)
        return not final


def _capture_unexpected_delivery_failure(delivery_id: int) -> None:
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("delivery_id", str(delivery_id))
            sentry_sdk.capture_message(
                "Unexpected notification delivery failure",
                level="error",
            )
    except Exception:
        return


@shared_task
def deliver_notification(delivery_id: int) -> int:
    from apps.core.logging import reset_log_context, set_log_context

    delivery = _claim_delivery(delivery_id)
    if delivery is None:
        return delivery_id
    tokens = set_log_context(request_id=delivery.event.request_id)
    attempt_number = delivery.attempt_count
    try:
        external_id = send_notification_email(delivery)
    except NotificationProviderError as exc:
        should_retry = _record_delivery_failure(
            delivery_id,
            attempt_number,
            category=exc.category,
            code=exc.code,
            retryable=exc.retryable,
        )
        logger.warning(
            "Notification delivery failed",
            extra={
                "event": "notification.delivery_failed",
                "delivery_id": delivery_id,
                "notification_event_type": delivery.event.event_type,
                "channel": delivery.channel,
                "attempt_number": attempt_number,
                "delivery_result": "retryable" if should_retry else "final_failed",
                "error_code": exc.code,
            },
        )
        if should_retry:
            countdown = min(900, 30 * (2 ** (attempt_number - 1))) + random.randint(0, 10)
            deliver_notification.apply_async(
                args=[delivery_id],
                countdown=countdown,
                headers={"request_id": delivery.event.request_id},
            )
    except Exception:
        _record_delivery_failure(
            delivery_id,
            attempt_number,
            category="unexpected",
            code="unhandled_provider_error",
            retryable=False,
        )
        _capture_unexpected_delivery_failure(delivery_id)
        logger.exception(
            "Unexpected notification delivery failure",
            extra={
                "event": "notification.delivery_failed",
                "delivery_id": delivery_id,
                "notification_event_type": delivery.event.event_type,
                "channel": delivery.channel,
                "attempt_number": attempt_number,
                "delivery_result": "final_failed",
                "error_code": "unhandled_provider_error",
            },
        )
    else:
        _record_delivery_success(delivery_id, attempt_number, external_id)
        logger.info(
            "Notification delivery sent",
            extra={
                "event": "notification.delivery_sent",
                "delivery_id": delivery_id,
                "notification_event_type": delivery.event.event_type,
                "channel": delivery.channel,
                "attempt_number": attempt_number,
                "delivery_result": "sent",
            },
        )
    finally:
        reset_log_context(tokens)
    return delivery_id


def _send_resend_email(*, api_key: str, from_email: str, to_email: str, subject: str, text: str, html: str) -> None:
    import json
    from urllib import error, request

    payload = json.dumps(
        {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": text,
            "html": html,
        }
    ).encode("utf-8")
    resend_request = request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "airbnb-tax-app/1.0",
        },
        method="POST",
    )
    try:
        with request.urlopen(resend_request, timeout=15) as response:
            if response.status >= 400:
                raise RuntimeError(f"Resend returned HTTP {response.status}")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend returned HTTP {exc.code}: {detail}") from exc


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_signup_email_code(self, verification_id: int) -> None:
    from django.conf import settings
    from django.core.exceptions import ImproperlyConfigured
    from django.template.loader import render_to_string

    from apps.accounts.models import SignupEmailVerification, signup_email_code_for_token

    if not getattr(settings, "EMAIL_VER_USER_SIGNUP", True):
        return

    try:
        verification = SignupEmailVerification.objects.get(id=verification_id)
    except SignupEmailVerification.DoesNotExist:
        return

    if verification.is_expired or verification.is_verified:
        return

    code = signup_email_code_for_token(verification.token)

    subject = "Your Host Cleaners confirmation code"
    text_body = (
        "Use this 6-digit code to confirm your Host Cleaners email address:\n\n"
        f"{code}\n\n"
        "This code expires in 10 minutes. If you did not request it, you can ignore this email."
    )
    html_body = render_to_string("notifications/signup_code_email.html", {"code": code})

    try:
        api_key = getattr(settings, "EMAIL_RESEND_APIKEY", "")
        from_email = getattr(settings, "EMAIL_RESEND_FROM_EMAIL", "")
        if not api_key:
            raise ImproperlyConfigured("EMAIL_RESEND_APIKEY is required for signup email confirmation.")
        if not from_email:
            raise ImproperlyConfigured("EMAIL_RESEND_FROM_EMAIL is required for signup email confirmation.")

        _send_resend_email(
            api_key=api_key,
            from_email=from_email,
            to_email=verification.email,
            subject=subject,
            text=text_body,
            html=html_body,
        )
    except Exception as exc:
        logger.error(
            "Signup confirmation code email failed",
            extra={
                "event": "resend.email_failed",
                "entity_type": "SignupEmailVerification",
                "entity_id": verification_id,
            },
        )
        raise self.retry(exc=exc)

