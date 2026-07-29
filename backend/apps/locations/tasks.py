from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.notifications.delivery import NotificationProviderError, send_configured_email

try:
    from celery import shared_task
except ImportError:  # pragma: no cover - mirrors the local notification fallback.
    class _FallbackTask:
        def __init__(self, function):
            self.function = function

        def __call__(self, *args, **kwargs):
            return self.function(*args, **kwargs)

        def delay(self, *args, **kwargs):
            return self(*args, **kwargs)

    def shared_task(function=None, **_kwargs):
        return _FallbackTask(function) if function else lambda wrapped: _FallbackTask(wrapped)


@shared_task(
    autoretry_for=(NotificationProviderError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def deliver_geocoding_usage_alert(alert_id: int) -> str:
    """Deliver one generic, idempotent owner alert without persisting its address."""
    from apps.locations.models import GeocodingUsageAlert

    with transaction.atomic():
        alert = (
            GeocodingUsageAlert.objects.select_for_update()
            .select_related("usage")
            .filter(pk=alert_id)
            .first()
        )
        if alert is None or alert.delivery_state == GeocodingUsageAlert.DeliveryState.SENT:
            return "skipped"
        if alert.delivery_state == GeocodingUsageAlert.DeliveryState.DELIVERING:
            return "in_progress"
        alert.delivery_state = GeocodingUsageAlert.DeliveryState.DELIVERING
        alert.delivery_attempted_at = timezone.now()
        alert.save(update_fields=["delivery_state", "delivery_attempted_at", "updated_at"])

    owner_email = getattr(settings, "GEOAPIFY_USAGE_ALERT_EMAIL", "").strip()
    if not owner_email:
        _mark_alert_failed(alert_id)
        return "configuration_missing"

    try:
        send_configured_email(
            to_email=owner_email,
            subject=f"Geoapify daily geocoding usage: {alert.usage.outbound_request_count}",
            text_body=(
                f"Geoapify reached the {alert.threshold}-request daily geocoding threshold "
                f"on {alert.usage.usage_date}. Aggregate usage is "
                f"{alert.usage.outbound_request_count} outbound requests."
            ),
            html_body=(
                f"<p>Geoapify reached the {alert.threshold}-request daily geocoding threshold "
                f"on {alert.usage.usage_date}.</p><p>Aggregate usage is "
                f"{alert.usage.outbound_request_count} outbound requests.</p>"
            ),
            idempotency_key=f"geoapify-usage:{alert.usage.usage_date}:{alert.threshold}",
        )
    except NotificationProviderError:
        _mark_alert_failed(alert_id)
        raise

    with transaction.atomic():
        alert = GeocodingUsageAlert.objects.select_for_update().filter(pk=alert_id).first()
        if alert is not None:
            alert.delivery_state = GeocodingUsageAlert.DeliveryState.SENT
            alert.delivered_at = timezone.now()
            alert.save(update_fields=["delivery_state", "delivered_at", "updated_at"])
    return "sent"


def _mark_alert_failed(alert_id: int) -> None:
    from apps.locations.models import GeocodingUsageAlert

    GeocodingUsageAlert.objects.filter(pk=alert_id).exclude(
        delivery_state=GeocodingUsageAlert.DeliveryState.SENT
    ).update(delivery_state=GeocodingUsageAlert.DeliveryState.FAILED, updated_at=timezone.now())


@shared_task
def run_geocoding_retention_cleanup(batch_size: int = 100) -> dict[str, int]:
    from apps.locations.cleanup import cleanup_expired_geocoding_usage

    return {"deleted_geocoding_usage_days": cleanup_expired_geocoding_usage(limit=batch_size)}
