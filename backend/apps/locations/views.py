import logging

from django.shortcuts import get_object_or_404
from django.utils.cache import patch_vary_headers
from rest_framework import permissions, status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsApprovedHostOrPlatformAdmin
from apps.core.services import write_audit_log
from apps.locations.geocoding import (
    GeocodingProviderRateLimited,
    GeocodingUnavailable,
    reverse_geocode,
    search_locations,
)
from apps.locations.models import City, ServiceZone
from apps.locations.serializers import (
    CitySerializer,
    GeocodingReverseSerializer,
    GeocodingSearchSerializer,
    ServiceZoneSerializer,
)
from apps.locations.throttles import GeocodingUserThrottle

SOFIA_CANONICAL_ZONE_SLUGS = tuple(f"osm-{source_id}" for source_id in range(1, 145))
logger = logging.getLogger("apps.locations")


def _apply_private_no_store_headers(response):
    response["Cache-Control"] = "private, no-store"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    response["Clear-Site-Data"] = '"cache"'
    response["X-Content-Type-Options"] = "nosniff"
    response["Cross-Origin-Resource-Policy"] = "same-origin"
    patch_vary_headers(response, ["Cookie"])
    return response


class PrivateNoStoreResponseMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        return _apply_private_no_store_headers(response)


class GeocodingUserRateLimited(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "geocoding_rate_limited"


def _geocoding_message(request, code: str) -> str:
    is_bulgarian = getattr(request.user, "preferred_language", "en") == "bg"
    messages = {
        "geocoding_unavailable": (
            "Услугата за търсене на адреси временно не е достъпна. Въведете адреса и района ръчно.",
            "Address search is temporarily unavailable. Enter the address and district manually.",
        ),
        "geocoding_provider_rate_limited": (
            "Търсенето на адреси е временно ограничено. Опитайте отново след малко.",
            "Address search is temporarily limited. Please try again shortly.",
        ),
    }
    return messages[code][0 if is_bulgarian else 1]


class GeocodingBaseView(PrivateNoStoreResponseMixin, APIView):
    permission_classes = [IsApprovedHostOrPlatformAdmin]
    throttle_classes = [GeocodingUserThrottle]
    action_name = ""

    def throttled(self, request, wait):
        write_audit_log(
            actor=request.user,
            action=f"geocoding.{self.action_name}.throttled",
            entity_type="Geocoding",
            request=request,
            metadata={"reason_code": "user_rate_limited"},
        )
        raise GeocodingUserRateLimited(
            {
                "code": "geocoding_rate_limited",
                "detail": _geocoding_message(request, "geocoding_provider_rate_limited"),
            }
        )

    def _unavailable_response(self, request, *, reason_code: str):
        write_audit_log(
            actor=request.user,
            action=f"geocoding.{self.action_name}.failed",
            entity_type="Geocoding",
            request=request,
            metadata={"reason_code": reason_code},
        )
        logger.warning(
            "Geocoding lookup failed",
            extra={"event": f"geocoding.{self.action_name}.failed", "error_code": reason_code},
        )
        return Response(
            {"code": "geocoding_unavailable", "detail": _geocoding_message(request, "geocoding_unavailable")},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    def _provider_rate_limited_response(self, request):
        write_audit_log(
            actor=request.user,
            action=f"geocoding.{self.action_name}.throttled",
            entity_type="Geocoding",
            request=request,
            metadata={"reason_code": "provider_rate_limited"},
        )
        return Response(
            {
                "code": "geocoding_provider_rate_limited",
                "detail": _geocoding_message(request, "geocoding_provider_rate_limited"),
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    def _success_response(self, request, results: list[dict[str, object]]):
        write_audit_log(
            actor=request.user,
            action=f"geocoding.{self.action_name}.succeeded",
            entity_type="Geocoding",
            request=request,
            metadata={"result_count": len(results)},
        )
        return Response({"results": results})


class GeocodingSearchView(GeocodingBaseView):
    action_name = "search"

    def post(self, request):
        serializer = GeocodingSearchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            results = search_locations(**serializer.validated_data)
        except GeocodingProviderRateLimited:
            return self._provider_rate_limited_response(request)
        except GeocodingUnavailable:
            return self._unavailable_response(request, reason_code="provider_unavailable")
        return self._success_response(request, results)


class GeocodingReverseView(GeocodingBaseView):
    action_name = "reverse"

    def post(self, request):
        serializer = GeocodingReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            results = reverse_geocode(**serializer.validated_data)
        except GeocodingProviderRateLimited:
            return self._provider_rate_limited_response(request)
        except GeocodingUnavailable:
            return self._unavailable_response(request, reason_code="provider_unavailable")
        return self._success_response(request, results)


def _public_zone_catalog(zones, *, city: City):
    if city.slug == "sofia":
        return zones.filter(slug__in=SOFIA_CANONICAL_ZONE_SLUGS)
    return zones


class CityListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        cities = City.objects.filter(is_active=True).order_by("sort_order", "name_bg")
        return Response(CitySerializer(cities, many=True).data)


class CityZoneListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, city_slug: str):
        city = get_object_or_404(City, slug=city_slug, is_active=True)
        zones = _public_zone_catalog(city.zones.filter(is_active=True), city=city).order_by(
            "sort_order", "name_bg"
        )
        return Response(ServiceZoneSerializer(zones, many=True).data)


class CityZoneGeoJSONView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, city_slug: str):
        city = get_object_or_404(City, slug=city_slug, is_active=True)
        zones = _public_zone_catalog(
            ServiceZone.objects.filter(city=city, city__is_active=True, is_active=True, geometry__isnull=False)
            .select_related("city", "geometry"),
            city=city,
        ).order_by("sort_order", "name_bg")
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
