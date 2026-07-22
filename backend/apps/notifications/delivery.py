from __future__ import annotations

import json
from dataclasses import dataclass
from urllib import error, request
from urllib.parse import urlsplit

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from apps.notifications.contracts import get_event_spec
from apps.notifications.models import NotificationDelivery


@dataclass(frozen=True)
class NotificationProviderError(Exception):
    category: str
    code: str
    retryable: bool

    def __str__(self) -> str:
        return f"{self.category}:{self.code}"


def _frontend_destination(relative_destination: str) -> str:
    configured = getattr(settings, "FRONTEND_URL", "").rstrip("/")
    parsed = urlsplit(configured)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise NotificationProviderError("configuration", "invalid_frontend_url", False)
    return f"{parsed.scheme}://{parsed.netloc}{relative_destination}"


def _render_email(delivery: NotificationDelivery) -> tuple[str, str, str]:
    event = delivery.event
    spec = get_event_spec(event.event_type)
    if spec is None or event.language not in spec.templates:
        raise NotificationProviderError("contract", "template_unavailable", False)
    template = spec.templates[event.language]
    destination_url = _frontend_destination(event.destination)
    text = f"{template.email_body}\n\n{destination_url}\n"
    html = render_to_string(
        "notifications/event_email.html",
        {
            "title": template.title,
            "body": template.email_body,
            "destination_url": destination_url,
        },
    )
    return template.email_subject, text, html


def _send_with_django(
    *, to_email: str, subject: str, text_body: str, html_body: str, idempotency_key: str
) -> str:
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
        headers={"Resend-Idempotency-Key": idempotency_key},
    )
    message.attach_alternative(html_body, "text/html")
    try:
        sent = message.send(fail_silently=False)
    except Exception as exc:
        raise NotificationProviderError("provider_unavailable", "django_send_failed", True) from exc
    if sent != 1:
        raise NotificationProviderError("provider_unavailable", "django_not_accepted", True)
    return ""


def _resend_error_code(exc: error.HTTPError) -> str:
    try:
        payload = json.loads(exc.read().decode("utf-8", errors="replace"))
    except (ValueError, OSError):
        return "http_error"
    candidate = payload.get("name") or payload.get("code")
    if candidate in {
        "concurrent_idempotent_requests",
        "invalid_idempotent_request",
        "invalid_idempotency_key",
    }:
        return candidate
    return "http_error"


def _send_with_resend(
    *, to_email: str, subject: str, text_body: str, html_body: str, idempotency_key: str
) -> str:
    api_key = getattr(settings, "EMAIL_RESEND_APIKEY", "")
    from_email = getattr(settings, "EMAIL_RESEND_FROM_EMAIL", "")
    if not api_key or not from_email:
        raise NotificationProviderError("configuration", "resend_not_configured", False)
    payload = json.dumps(
        {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": text_body,
            "html": html_body,
        }
    ).encode("utf-8")
    outbound = request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
            "User-Agent": "host-cleaners/notification-delivery-v1",
        },
        method="POST",
    )
    try:
        with request.urlopen(outbound, timeout=15) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        code = _resend_error_code(exc)
        retryable = exc.code in {408, 425, 429} or exc.code >= 500
        if code == "concurrent_idempotent_requests":
            retryable = True
        if code in {"invalid_idempotent_request", "invalid_idempotency_key"}:
            retryable = False
        category = "provider_unavailable" if retryable else "provider_rejected"
        raise NotificationProviderError(category, code, retryable) from exc
    except (error.URLError, TimeoutError, OSError) as exc:
        raise NotificationProviderError("provider_unavailable", "network_error", True) from exc
    except (ValueError, TypeError) as exc:
        raise NotificationProviderError("provider_response", "invalid_response", True) from exc
    external_id = response_payload.get("id")
    if not isinstance(external_id, str) or len(external_id) > 255:
        raise NotificationProviderError("provider_response", "missing_message_id", True)
    return external_id


def send_notification_email(delivery: NotificationDelivery) -> str:
    recipient_email = delivery.recipient.email
    if not recipient_email:
        raise NotificationProviderError("recipient_unavailable", "missing_email", False)
    subject, text_body, html_body = _render_email(delivery)
    provider = getattr(settings, "NOTIFICATION_EMAIL_PROVIDER", "django").lower()
    send = {
        "django": _send_with_django,
        "resend": _send_with_resend,
    }.get(provider)
    if send is None:
        raise NotificationProviderError("configuration", "unsupported_email_provider", False)
    return send(
        to_email=recipient_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        idempotency_key=delivery.deduplication_key,
    )
