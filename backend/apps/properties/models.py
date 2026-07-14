from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Property(TimeStampedModel):
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="properties",
    )
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500, blank=True)
    city = models.CharField(max_length=120)
    neighborhood = models.CharField(max_length=255, blank=True)
    service_zone = models.ForeignKey(
        "locations.ServiceZone",
        on_delete=models.SET_NULL,
        related_name="properties",
        null=True,
        blank=True,
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    country = models.CharField(max_length=120, default="Bulgaria")
    timezone = models.CharField(max_length=64, default="Europe/Sofia")
    description = models.TextField(blank=True)
    bedrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    square_meters = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    access_notes = models.TextField(blank=True)
    cleaning_instructions = models.TextField(blank=True)
    default_cleaning_duration_minutes = models.PositiveIntegerField(default=120)
    default_price_eur = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    class Meta:
        verbose_name_plural = "properties"
        ordering = ["city", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.city})"


class PropertyImage(TimeStampedModel):
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name="images",
    )
    image = models.ImageField(upload_to="property_images/%Y/%m/")
    caption = models.CharField(max_length=255, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"Image {self.id} for {self.property}"


class ExternalCalendarConnection(TimeStampedModel):
    class Provider(models.TextChoices):
        ICAL = "ical", "iCal"
        GOOGLE = "google", "Google Calendar"

    class Direction(models.TextChoices):
        IMPORT = "import", "Import"
        EXPORT = "export", "Export"
        TWO_WAY = "two_way", "Two-way"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        ERROR = "error", "Error"

    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name="calendar_connections",
    )
    provider = models.CharField(max_length=20, choices=Provider.choices)
    name = models.CharField(max_length=255)
    direction = models.CharField(max_length=20, choices=Direction.choices, default=Direction.IMPORT)
    feed_url = models.URLField(blank=True)
    external_calendar_id = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.name} - {self.provider}"


class Reservation(TimeStampedModel):
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name="reservations",
    )
    source = models.CharField(max_length=120, default="manual")
    external_uid = models.CharField(max_length=255, blank=True)
    guest_name = models.CharField(max_length=255, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["starts_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["property", "source", "external_uid"],
                name="unique_external_reservation_per_property",
                condition=~models.Q(external_uid=""),
            )
        ]

    def __str__(self) -> str:
        return f"{self.property} reservation {self.starts_at:%Y-%m-%d}"

