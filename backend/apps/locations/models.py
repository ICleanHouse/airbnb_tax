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
