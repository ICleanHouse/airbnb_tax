from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import TimeStampedModel


class CleaningBatch(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        OPEN = "open", "Open"
        ASSIGNED = "assigned", "Assigned"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    property = models.ForeignKey(
        "properties.Property",
        on_delete=models.CASCADE,
        related_name="cleaning_batches",
    )
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cleaning_batches",
    )
    title = models.CharField(max_length=255)
    month = models.DateField(help_text="Use the first day of the target month.")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-month", "title"]

    def __str__(self) -> str:
        return f"{self.title} ({self.month:%Y-%m})"


class TurnoverLineage(TimeStampedModel):
    property = models.ForeignKey(
        "properties.Property",
        on_delete=models.PROTECT,
        related_name="turnover_lineages",
    )
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="turnover_lineages",
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["property", "created_at"], name="lineage_property_created_idx"),
            models.Index(fields=["host", "created_at"], name="lineage_host_created_idx"),
        ]

    def __str__(self) -> str:
        return f"Turnover lineage {self.pk} for {self.property}"


class CleaningJob(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        OPEN = "open", "Open"
        ASSIGNED = "assigned", "Assigned"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    class CancellationReason(models.TextChoices):
        HOST_CHANGE = "host_change", "Host change"
        PROPERTY_UNAVAILABLE = "property_unavailable", "Property unavailable"
        CLEANER_UNAVAILABLE = "cleaner_unavailable", "Cleaner unavailable"
        ILLNESS = "illness", "Illness"
        SAFETY = "safety", "Safety concern"
        ACCESS = "access", "Access problem"
        NO_SHOW = "no_show", "No-show"
        SCHEDULING_ERROR = "scheduling_error", "Scheduling error"
        OTHER = "other", "Other"
        LEGACY_UNSPECIFIED = "legacy_unspecified", "Legacy unspecified"
        LEGACY_DISPUTE_WITHOUT_ASSIGNMENT = (
            "legacy_dispute_without_assignment",
            "Legacy dispute without assignment",
        )

    class CancellationNoticeBand(models.TextChoices):
        AT_LEAST_48_HOURS = "at_least_48_hours", "At least 48 hours"
        FROM_24_TO_48_HOURS = "24_to_48_hours", "24 to under 48 hours"
        UNDER_24_HOURS = "under_24_hours", "Under 24 hours"
        AFTER_START = "after_start", "After scheduled start"
        UNKNOWN = "unknown", "Unknown"

    property = models.ForeignKey(
        "properties.Property",
        on_delete=models.PROTECT,
        related_name="cleaning_jobs",
    )
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cleaning_jobs",
    )
    lineage = models.ForeignKey(
        TurnoverLineage,
        on_delete=models.PROTECT,
        related_name="attempts",
    )
    replaces_job = models.OneToOneField(
        "self",
        on_delete=models.PROTECT,
        related_name="replacement_job",
        null=True,
        blank=True,
    )
    batch = models.ForeignKey(
        CleaningBatch,
        on_delete=models.SET_NULL,
        related_name="jobs",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    scheduled_start = models.DateTimeField()
    scheduled_end = models.DateTimeField()
    currency = models.CharField(max_length=3, default="EUR")
    proposed_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    agreed_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    cleaning_instructions = models.TextField(blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="cancelled_cleaning_jobs",
        null=True,
        blank=True,
    )
    cancellation_reason_code = models.CharField(
        max_length=48,
        choices=CancellationReason.choices,
        blank=True,
    )
    cancellation_note = models.CharField(max_length=1000, blank=True)
    cancellation_notice_band = models.CharField(
        max_length=32,
        choices=CancellationNoticeBand.choices,
        blank=True,
    )

    class Meta:
        ordering = ["scheduled_start"]
        constraints = [
            models.UniqueConstraint(
                fields=["property", "scheduled_start", "scheduled_end"],
                condition=Q(status__in=["draft", "open", "assigned"]),
                name="uq_actionable_property_slot",
            ),
            models.UniqueConstraint(
                fields=["lineage"],
                condition=Q(status__in=["draft", "open", "assigned"]),
                name="uq_actionable_job_per_lineage",
            ),
            models.CheckConstraint(
                condition=Q(scheduled_end__gt=models.F("scheduled_start")),
                name="job_end_after_start",
            ),
            models.CheckConstraint(
                condition=~Q(id=models.F("replaces_job_id")),
                name="job_replacement_not_self",
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        status="cancelled",
                        cancelled_at__isnull=False,
                    )
                    & ~Q(cancellation_reason_code="")
                    & ~Q(cancellation_notice_band="")
                )
                | Q(
                    ~Q(status="cancelled"),
                    cancelled_at__isnull=True,
                    cancelled_by__isnull=True,
                    cancellation_reason_code="",
                    cancellation_note="",
                    cancellation_notice_band="",
                ),
                name="job_cancellation_fields_consistent",
            ),
        ]
        indexes = [
            models.Index(fields=["lineage", "scheduled_start"], name="job_lineage_start_idx"),
            models.Index(fields=["status", "scheduled_start"], name="job_status_start_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.title} - {self.scheduled_start:%Y-%m-%d %H:%M}"


class CleanerApplication(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"

    class Origin(models.TextChoices):
        CLEANER_APPLIED = "cleaner_applied", "Cleaner applied"
        HOST_OFFERED = "host_offered", "Host offered"

    job = models.ForeignKey(
        CleaningJob,
        on_delete=models.PROTECT,
        related_name="applications",
    )
    cleaner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cleaning_applications",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    origin = models.CharField(
        max_length=20, choices=Origin.choices, default=Origin.CLEANER_APPLIED
    )
    proposed_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["job", "cleaner"], name="unique_cleaner_application_per_job")
        ]

    def __str__(self) -> str:
        return f"{self.cleaner} -> {self.job} ({self.status})"


class Assignment(TimeStampedModel):
    job = models.OneToOneField(
        CleaningJob,
        on_delete=models.PROTECT,
        related_name="assignment",
    )
    cleaner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cleaning_assignments",
    )
    assigned_member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="agency_assigned_cleanings",
        null=True,
        blank=True,
    )
    application = models.OneToOneField(
        CleanerApplication,
        on_delete=models.SET_NULL,
        related_name="assignment",
        null=True,
        blank=True,
    )
    agreed_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    assigned_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    host_completed_at = models.DateTimeField(null=True, blank=True)
    cleaner_completed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.cleaner} assigned to {self.job}"


class JobLifecycleEvent(models.Model):
    class EventType(models.TextChoices):
        LEGACY_SNAPSHOT_IMPORTED = "legacy_snapshot_imported", "Legacy snapshot imported"
        LEGACY_DISPUTED_NORMALIZED = (
            "legacy_disputed_normalized",
            "Legacy disputed status normalized",
        )
        JOB_CREATED = "job_created", "Job created"
        JOB_PUBLISHED = "job_published", "Job published"
        JOB_ASSIGNED = "job_assigned", "Job assigned"
        JOB_COMPLETED = "job_completed", "Job completed"
        JOB_CANCELLED = "job_cancelled", "Job cancelled"
        JOB_RESCHEDULED = "job_rescheduled", "Job rescheduled"
        INCIDENT_REPORTED = "incident_reported", "Incident reported"
        REPLACEMENT_REQUESTED = "replacement_requested", "Replacement requested"
        REPLACEMENT_APPROVED = "replacement_approved", "Replacement approved"
        REPLACEMENT_DECLINED = "replacement_declined", "Replacement declined"
        REPLACEMENT_WITHDRAWN = "replacement_withdrawn", "Replacement withdrawn"
        DISPUTE_OPENED = "dispute_opened", "Dispute opened"
        DISPUTE_UPDATED = "dispute_updated", "Dispute updated"
        DISPUTE_RESOLVED = "dispute_resolved", "Dispute resolved"
        DISPUTE_DISMISSED = "dispute_dismissed", "Dispute dismissed"

    class Audience(models.TextChoices):
        ADMIN_ONLY = "admin_only", "Admin only"
        LINEAGE_HOST = "lineage_host", "Lineage host"
        JOB_PARTICIPANTS = "job_participants", "Job participants"

    lineage = models.ForeignKey(
        TurnoverLineage,
        on_delete=models.PROTECT,
        related_name="lifecycle_events",
    )
    job = models.ForeignKey(
        CleaningJob,
        on_delete=models.PROTECT,
        related_name="lifecycle_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="job_lifecycle_events",
        null=True,
        blank=True,
    )
    actor_role_snapshot = models.CharField(max_length=32, blank=True)
    event_type = models.CharField(max_length=48, choices=EventType.choices)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    reason_code = models.CharField(max_length=48, blank=True)
    audience = models.CharField(
        max_length=32,
        choices=Audience.choices,
        default=Audience.JOB_PARTICIPANTS,
    )
    occurred_at = models.DateTimeField(default=timezone.now)
    request_id = models.CharField(max_length=100, blank=True)
    idempotency_key = models.CharField(max_length=255, null=True, blank=True, unique=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["occurred_at", "id"]
        indexes = [
            models.Index(fields=["lineage", "occurred_at", "id"], name="event_lineage_time_idx"),
            models.Index(fields=["job", "occurred_at", "id"], name="event_job_time_idx"),
            models.Index(fields=["event_type", "occurred_at"], name="event_type_time_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Lifecycle events are append-only.")
        if self.job_id and self.lineage_id and self.job.lineage_id != self.lineage_id:
            raise ValidationError("Lifecycle event job and lineage must match.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Lifecycle events are append-only.")

    def __str__(self) -> str:
        return f"{self.event_type} for job {self.job_id}"


class FavouriteCleaner(TimeStampedModel):
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="favourite_cleaners",
    )
    cleaner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="favourited_by",
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["host", "cleaner"], name="unique_favourite_cleaner_per_host"
            )
        ]

    def __str__(self) -> str:
        return f"{self.host} ♥ {self.cleaner}"
