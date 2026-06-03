from django.conf import settings
from django.db import models

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


class CleaningJob(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        OPEN = "open", "Open"
        ASSIGNED = "assigned", "Assigned"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        DISPUTED = "disputed", "Disputed"

    property = models.ForeignKey(
        "properties.Property",
        on_delete=models.CASCADE,
        related_name="cleaning_jobs",
    )
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cleaning_jobs",
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

    class Meta:
        ordering = ["scheduled_start"]
        constraints = [
            models.UniqueConstraint(
                fields=["property", "scheduled_start", "scheduled_end"],
                name="unique_property_job_time",
            )
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
        on_delete=models.CASCADE,
        related_name="applications",
    )
    cleaner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
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
        on_delete=models.CASCADE,
        related_name="assignment",
    )
    cleaner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cleaning_assignments",
    )
    assigned_member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
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
