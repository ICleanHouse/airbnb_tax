from django.contrib import admin

from apps.locations.models import City, ServiceZone, ServiceZoneGeometry


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ("name_bg", "name_en", "slug", "country_code", "is_active", "sort_order")
    list_filter = ("country_code", "is_active")
    search_fields = ("slug", "name_bg", "name_en")
    ordering = ("sort_order", "name_bg")


@admin.register(ServiceZone)
class ServiceZoneAdmin(admin.ModelAdmin):
    list_display = ("name_bg", "name_en", "city", "slug", "zone_type", "is_active", "sort_order")
    list_filter = ("city", "zone_type", "is_active")
    search_fields = ("slug", "name_bg", "name_en", "legacy_names")
    ordering = ("city__sort_order", "sort_order", "name_bg")


@admin.register(ServiceZoneGeometry)
class ServiceZoneGeometryAdmin(admin.ModelAdmin):
    list_display = ("zone", "source", "source_license", "source_url", "updated_at")
    search_fields = ("zone__slug", "zone__name_bg", "zone__name_en", "source", "source_license")
    readonly_fields = ("created_at", "updated_at")
