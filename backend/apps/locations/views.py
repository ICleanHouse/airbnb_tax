from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.locations.models import City, ServiceZone
from apps.locations.serializers import CitySerializer, ServiceZoneSerializer


class CityListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        cities = City.objects.filter(is_active=True).order_by("sort_order", "name_bg")
        return Response(CitySerializer(cities, many=True).data)


class CityZoneListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, city_slug: str):
        city = get_object_or_404(City, slug=city_slug, is_active=True)
        zones = city.zones.filter(is_active=True).order_by("sort_order", "name_bg")
        return Response(ServiceZoneSerializer(zones, many=True).data)


class CityZoneGeoJSONView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, city_slug: str):
        city = get_object_or_404(City, slug=city_slug, is_active=True)
        zones = (
            ServiceZone.objects.filter(city=city, city__is_active=True, is_active=True, geometry__isnull=False)
            .select_related("city", "geometry")
            .order_by("sort_order", "name_bg")
        )
        features = []
        for zone in zones:
            geometry = zone.geometry.simplified_geometry or zone.geometry.geometry
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "zone_id": zone.zone_id,
                        "city_slug": city.slug,
                        "zone_slug": zone.slug,
                        "name_bg": zone.name_bg,
                        "name_en": zone.name_en,
                        "zone_type": zone.zone_type,
                        "attribution": zone.geometry.attribution,
                    },
                    "geometry": geometry,
                }
            )
        return Response({"type": "FeatureCollection", "features": features})
