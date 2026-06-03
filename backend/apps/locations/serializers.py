from rest_framework import serializers

from apps.locations.models import City, ServiceZone


class CitySerializer(serializers.ModelSerializer):
    center = serializers.SerializerMethodField()

    class Meta:
        model = City
        fields = [
            "slug",
            "name_bg",
            "name_en",
            "country_code",
            "center",
            "default_zoom",
        ]
        read_only_fields = fields

    def get_center(self, obj: City):
        return obj.center


class ServiceZoneSerializer(serializers.ModelSerializer):
    city_slug = serializers.CharField(source="city.slug", read_only=True)
    zone_id = serializers.CharField(read_only=True)
    center = serializers.SerializerMethodField()

    class Meta:
        model = ServiceZone
        fields = [
            "id",
            "city_slug",
            "slug",
            "zone_id",
            "name_bg",
            "name_en",
            "zone_type",
            "legacy_names",
            "center",
            "is_active",
        ]
        read_only_fields = fields

    def get_center(self, obj: ServiceZone):
        return obj.center
