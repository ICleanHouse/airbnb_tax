from django.contrib import admin

from apps.locations.models import City, GeocodingUsageAlert, GeocodingUsageDaily, ServiceZone, ServiceZoneGeometry


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


class ReadOnlyUsageAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.fields)


@admin.register(GeocodingUsageDaily)
class GeocodingUsageDailyAdmin(ReadOnlyUsageAdmin):
    list_display = ("usage_date", "provider", "outbound_request_count", "updated_at")
    list_filter = ("provider", "usage_date")
    search_fields = ("=provider",)


@admin.register(GeocodingUsageAlert)
class GeocodingUsageAlertAdmin(ReadOnlyUsageAdmin):
    list_display = ("usage", "threshold", "delivery_state", "delivery_attempted_at", "delivered_at")
    list_filter = ("delivery_state", "threshold")
    search_fields = ("=usage__provider",)
