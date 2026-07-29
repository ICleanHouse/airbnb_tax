from django.db import models

from apps.core.models import TimeStampedModel


class City(TimeStampedModel):
    slug = models.SlugField(unique=True)
    name_bg = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    country_code = models.CharField(max_length=2, default="BG")
    center_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    center_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    default_zoom = models.PositiveSmallIntegerField(default=11)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ["sort_order", "name_bg"]
        verbose_name_plural = "cities"

    @property
    def center(self) -> list[float] | None:
        if self.center_lng is None or self.center_lat is None:
            return None
        return [float(self.center_lng), float(self.center_lat)]

    def __str__(self) -> str:
        return self.name_bg


class ServiceZone(TimeStampedModel):
    city = models.ForeignKey(City, related_name="zones", on_delete=models.CASCADE)
    slug = models.SlugField()
    name_bg = models.CharField(max_length=150)
    name_en = models.CharField(max_length=150, blank=True)
    zone_type = models.CharField(max_length=50, default="district")
    legacy_names = models.JSONField(default=list, blank=True)
    center_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    center_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=100)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["city", "slug"], name="unique_service_zone_per_city"),
        ]
        ordering = ["city__sort_order", "sort_order", "name_bg"]

    @property
    def zone_id(self) -> str:
        return f"{self.city.slug}:{self.slug}"

    @property
    def center(self) -> list[float] | None:
        if self.center_lng is None or self.center_lat is None:
            return None
        return [float(self.center_lng), float(self.center_lat)]

    def __str__(self) -> str:
        return f"{self.city.slug}: {self.name_bg}"


class ServiceZoneGeometry(TimeStampedModel):
    zone = models.OneToOneField(ServiceZone, related_name="geometry", on_delete=models.CASCADE)
    geometry = models.JSONField()
    simplified_geometry = models.JSONField(null=True, blank=True)
    source = models.CharField(max_length=150, blank=True)
    source_license = models.CharField(max_length=150, blank=True)
    source_url = models.URLField(blank=True)
    attribution = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name_plural = "service zone geometries"

    def __str__(self) -> str:
        return f"Geometry for {self.zone.zone_id}"


class GeocodingUsageDaily(TimeStampedModel):
    """Aggregate-only record of outbound provider calls for one Sofia-local day."""

    provider = models.CharField(max_length=40, default="geoapify")
    usage_date = models.DateField()
    outbound_request_count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "usage_date"],
                name="unique_geocoding_usage_provider_day",
            ),
        ]
        ordering = ["-usage_date", "provider"]

    def __str__(self) -> str:
        return f"{self.provider} geocoding usage for {self.usage_date}"


class GeocodingUsageAlert(TimeStampedModel):
    """Idempotent owner-alert outbox; never stores a recipient or lookup data."""

    class DeliveryState(models.TextChoices):
        PENDING = "pending", "Pending"
        DELIVERING = "delivering", "Delivering"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    usage = models.ForeignKey(
        GeocodingUsageDaily,
        on_delete=models.CASCADE,
        related_name="alerts",
    )
    threshold = models.PositiveIntegerField()
    delivery_state = models.CharField(
        max_length=20,
        choices=DeliveryState.choices,
        default=DeliveryState.PENDING,
    )
    delivery_attempted_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["usage", "threshold"],
                name="unique_geocoding_usage_alert_threshold",
            ),
        ]
        ordering = ["usage__usage_date", "threshold"]

    def __str__(self) -> str:
        return f"{self.usage.provider} usage alert {self.threshold} for {self.usage.usage_date}"
