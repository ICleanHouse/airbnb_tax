from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlsplit

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.core.middleware import normalize_request_id
from apps.notifications.contracts import (
    DEFAULT_LANGUAGE,
    EVENT_CONTRACT_VERSION,
    SUPPORTED_LANGUAGES,
    get_event_spec,
)
from apps.notifications.models import (
    Notification,
    NotificationDelivery,
    NotificationDeliveryAttempt,
    NotificationEvent,
)
from apps.notifications.tasks import deliver_notification


User = get_user_model()
logger = logging.getLogger("apps.notifications")

ALLOWED_DESTINATION_PATHS = frozenset({"/admin", "/app", "/host", "/cleaner"})
ALLOWED_DESTINATION_QUERY_KEYS = frozenset(
    {"section", "appFilter", "reviewJob", "reviewId"}
)


class NotificationEventValidationError(ValueError):
    pass


@dataclass(frozen=True)
class NotificationEventRequest:
    event_type: str
    recipient_id: int
    occurrence_key: str
    destination: str
    source_entity_type: str = ""
    source_entity_id: str = ""
    request_id: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass(frozen=True)
class NotificationEventResult:
    event: NotificationEvent
    deliveries: tuple[NotificationDelivery, ...]
    created: bool


def _validate_destination(destination: str) -> str:
    parsed = urlsplit(destination)
    if (
        not destination.startswith("/")
        or destination.startswith("//")
        or parsed.scheme
        or parsed.netloc
        or parsed.fragment
        or parsed.path not in ALLOWED_DESTINATION_PATHS
    ):
        raise NotificationEventValidationError("Notification destination is not allowed.")
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key not in ALLOWED_DESTINATION_QUERY_KEYS or not value or len(value) > 64:
            raise NotificationEventValidationError("Notification destination query is not allowed.")
        if key in {"reviewJob", "reviewId"} and not value.isdecimal():
            raise NotificationEventValidationError("Notification destination identifier is invalid.")
    return destination


def _event_deduplication_key(request: NotificationEventRequest) -> str:
    raw = "|".join(
        (
            str(EVENT_CONTRACT_VERSION),
            request.event_type,
            str(request.recipient_id),
            request.occurrence_key,
        )
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _delivery_deduplication_key(event_key: str, channel: str) -> str:
    return hashlib.sha256(f"{event_key}|{channel}".encode("utf-8")).hexdigest()


def _queue_delivery_safely(delivery_id: int) -> None:
    try:
        deliver_notification.apply_async(args=[delivery_id])
    except Exception:
        NotificationDelivery.objects.filter(
            id=delivery_id,
            status=NotificationDelivery.Status.QUEUED,
        ).update(
            error_category="queue_unavailable",
            error_code="broker_publish_failed",
        )
        logger.exception(
            "Notification delivery could not be queued",
            extra={
                "event": "notification.queue_failed",
                "error_code": "broker_publish_failed",
            },
        )


@transaction.atomic
def emit_notification_event(request: NotificationEventRequest) -> NotificationEventResult:
    spec = get_event_spec(request.event_type)
    if spec is None:
        raise NotificationEventValidationError("Unknown notification event type.")
    if not request.occurrence_key or len(request.occurrence_key) > 255:
        raise NotificationEventValidationError("A bounded occurrence key is required.")
    destination = _validate_destination(request.destination)
    unexpected_metadata = set(request.metadata) - set(spec.allowed_metadata)
    if unexpected_metadata:
        raise NotificationEventValidationError("Notification metadata contains unapproved fields.")

    recipient = User.objects.get(id=request.recipient_id)
    language = (
        recipient.preferred_language
        if recipient.preferred_language in SUPPORTED_LANGUAGES
        else DEFAULT_LANGUAGE
    )
    event_key = _event_deduplication_key(request)
    event, created = NotificationEvent.objects.get_or_create(
        deduplication_key=event_key,
        defaults={
            "event_type": request.event_type,
            "contract_version": EVENT_CONTRACT_VERSION,
            "recipient": recipient,
            "language": language,
            "occurrence_key": request.occurrence_key,
            "destination": destination,
            "metadata": request.metadata,
            "source_entity_type": request.source_entity_type,
            "source_entity_id": request.source_entity_id,
            "request_id": normalize_request_id(request.request_id),
        },
    )
    if not created:
        return NotificationEventResult(
            event=event,
            deliveries=tuple(event.deliveries.order_by("channel")),
            created=False,
        )

    template = spec.templates[language]
    deliveries: list[NotificationDelivery] = []
    now = timezone.now()
    for channel in spec.channels:
        delivery = NotificationDelivery.objects.create(
            event=event,
            recipient=recipient,
            channel=channel,
            deduplication_key=_delivery_deduplication_key(event_key, channel),
        )
        deliveries.append(delivery)
        if channel == NotificationDelivery.Channel.IN_APP:
            attempt = NotificationDeliveryAttempt.objects.create(
                delivery=delivery,
                attempt_number=1,
                status=NotificationDelivery.Status.SENT,
                finished_at=now,
            )
            Notification.objects.create(
                user=recipient,
                event=event,
                delivery=delivery,
                notification_type=request.event_type,
                channel=Notification.Channel.IN_APP,
                title=template.title,
                body=template.body,
                metadata={"destination": destination},
                sent_at=now,
                deduplication_key=delivery.deduplication_key,
            )
            delivery.status = NotificationDelivery.Status.SENT
            delivery.attempt_count = attempt.attempt_number
            delivery.last_attempted_at = now
            delivery.sent_at = now
            delivery.save(
                update_fields=[
                    "status",
                    "attempt_count",
                    "last_attempted_at",
                    "sent_at",
                    "updated_at",
                ]
            )
        elif not recipient.email:
            delivery.status = NotificationDelivery.Status.SKIPPED
            delivery.error_category = "recipient_unavailable"
            delivery.error_code = "missing_email"
            delivery.save(
                update_fields=["status", "error_category", "error_code", "updated_at"]
            )
        else:
            transaction.on_commit(
                lambda delivery_id=delivery.id: _queue_delivery_safely(delivery_id)
            )

    return NotificationEventResult(event=event, deliveries=tuple(deliveries), created=True)


def create_notification(
    *,
    user: User,
    notification_type: str,
    title: str,
    body: str = "",
    channel: str = Notification.Channel.IN_APP,
    metadata: dict | None = None,
    deduplication_key: str | None = None,
) -> Notification:
    if deduplication_key:
        notification, _created = Notification.objects.get_or_create(
            deduplication_key=deduplication_key,
            defaults={
                "user": user,
                "notification_type": notification_type,
                "channel": channel,
                "title": title,
                "body": body,
                "metadata": metadata or {},
            },
        )
        return notification
    return Notification.objects.create(
        user=user,
        notification_type=notification_type,
        channel=channel,
        title=title,
        body=body,
        metadata=metadata or {},
        deduplication_key=deduplication_key,
    )


def create_notification_once(
    *,
    user: User,
    notification_type: str,
    title: str,
    body: str = "",
    channel: str = Notification.Channel.IN_APP,
    metadata: dict | None = None,
    deduplication_key: str,
) -> tuple[Notification, bool]:
    return Notification.objects.get_or_create(
        deduplication_key=deduplication_key,
        defaults={
            "user": user,
            "notification_type": notification_type,
            "channel": channel,
            "title": title,
            "body": body,
            "metadata": metadata or {},
        },
    )

