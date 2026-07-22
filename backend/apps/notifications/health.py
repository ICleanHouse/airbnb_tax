from __future__ import annotations

from apps.notifications.models import NotificationDelivery


def get_notification_health(*, include_runtime: bool = True) -> dict:
    queued = NotificationDelivery.objects.filter(
        status=NotificationDelivery.Status.QUEUED
    )
    oldest = queued.order_by("created_at").values_list("created_at", flat=True).first()
    health = {
        "worker_running": None,
        "queue_connected": None,
        "oldest_queued_at": oldest,
        "queued_count": queued.count(),
        "retryable_failed_count": NotificationDelivery.objects.filter(
            status=NotificationDelivery.Status.RETRYABLE_FAILED
        ).count(),
        "final_failed_count": NotificationDelivery.objects.filter(
            status=NotificationDelivery.Status.FINAL_FAILED
        ).count(),
    }
    if not include_runtime:
        return health

    from config.celery import app

    try:
        with app.connection_for_read() as connection:
            connection.ensure_connection(max_retries=0, timeout=1)
        health["queue_connected"] = True
    except Exception:
        health["queue_connected"] = False
    try:
        health["worker_running"] = bool(app.control.ping(timeout=1))
    except Exception:
        health["worker_running"] = False
    return health
