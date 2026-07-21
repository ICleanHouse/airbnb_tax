from __future__ import annotations

from django.contrib.auth import get_user_model

from apps.notifications.models import Notification


User = get_user_model()


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

