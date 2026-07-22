from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class NotificationEvent(TimeStampedModel):
    """Recipient-specific canonical event used as the delivery outbox."""

    event_type = models.CharField(max_length=120, db_index=True)
    contract_version = models.PositiveSmallIntegerField(default=1)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_events",
    )
    language = models.CharField(max_length=8, default="bg")
    occurrence_key = models.CharField(max_length=255)
    deduplication_key = models.CharField(max_length=64, unique=True, editable=False)
    destination = models.CharField(max_length=500)
    metadata = models.JSONField(default=dict, blank=True)
    source_entity_type = models.CharField(max_length=64, blank=True)
    source_entity_id = models.CharField(max_length=100, blank=True)
    request_id = models.CharField(max_length=100, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_type", "created_at"], name="notif_event_type_created_idx"),
            models.Index(fields=["recipient", "created_at"], name="notif_event_recipient_idx"),
        ]


class NotificationDelivery(TimeStampedModel):
    class Channel(models.TextChoices):
        IN_APP = "in_app", "In-app"
        EMAIL = "email", "Email"

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        SENT = "sent", "Sent"
        RETRYABLE_FAILED = "retryable_failed", "Retryable failed"
        FINAL_FAILED = "final_failed", "Final failed"
        SKIPPED = "skipped", "Skipped"

    event = models.ForeignKey(
        NotificationEvent,
        on_delete=models.CASCADE,
        related_name="deliveries",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_deliveries",
    )
    channel = models.CharField(max_length=16, choices=Channel.choices)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED)
    deduplication_key = models.CharField(max_length=64, unique=True, editable=False)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    processing_started_at = models.DateTimeField(null=True, blank=True)
    last_attempted_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    final_failed_at = models.DateTimeField(null=True, blank=True)
    provider_external_id = models.CharField(max_length=255, blank=True)
    error_category = models.CharField(max_length=64, blank=True)
    error_code = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "channel"],
                name="uq_notification_delivery_event_channel",
            ),
            models.CheckConstraint(
                condition=models.Q(attempt_count__gte=0),
                name="notification_delivery_attempt_count_nonnegative",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "channel", "created_at"], name="notif_delivery_queue_idx"),
            models.Index(fields=["status", "created_at"], name="notif_delivery_status_idx"),
        ]


class NotificationDeliveryAttempt(models.Model):
    delivery = models.ForeignKey(
        NotificationDelivery,
        on_delete=models.CASCADE,
        related_name="attempts",
    )
    attempt_number = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=24,
        choices=NotificationDelivery.Status.choices,
        default=NotificationDelivery.Status.PROCESSING,
    )
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error_category = models.CharField(max_length=64, blank=True)
    error_code = models.CharField(max_length=100, blank=True)
    provider_external_id = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["delivery_id", "attempt_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["delivery", "attempt_number"],
                name="uq_notification_delivery_attempt_number",
            )
        ]


class OperatorNotificationAlert(models.Model):
    """Non-recursive operator-visible record for one final delivery failure."""

    delivery = models.OneToOneField(
        NotificationDelivery,
        on_delete=models.PROTECT,
        related_name="operator_alert",
    )
    alert_code = models.CharField(max_length=64, default="notification_delivery_final_failed")
    created_at = models.DateTimeField(auto_now_add=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acknowledged_notification_alerts",
    )

    class Meta:
        ordering = ["-created_at"]


class Notification(TimeStampedModel):
    class Channel(models.TextChoices):
        IN_APP = "in_app", "In-app"
        EMAIL = "email", "Email"
        SMS = "sms", "SMS"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(max_length=120)
    channel = models.CharField(max_length=20, choices=Channel.choices, default=Channel.IN_APP)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    deduplication_key = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        unique=True,
        editable=False,
    )
    event = models.OneToOneField(
        NotificationEvent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="in_app_notification",
        editable=False,
    )
    delivery = models.OneToOneField(
        NotificationDelivery,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="in_app_notification",
        editable=False,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} - {self.title}"
