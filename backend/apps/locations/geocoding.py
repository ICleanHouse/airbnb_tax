from __future__ import annotations

import json
import math
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache


class GeocodingUnavailable(Exception):
    """The configured provider cannot safely complete a lookup."""


class GeocodingProviderRateLimited(Exception):
    """The shared provider budget is exhausted for the current time window."""


def search_locations(*, query: str, locale: str) -> list[dict[str, object]]:
    return _lookup(
        path="search",
        params={
            "text": query,
            "filter": "countrycode:bg",
            "limit": 6,
            "lang": locale,
        },
        maximum_results=6,
    )


def reverse_geocode(*, latitude: float, longitude: float, locale: str) -> list[dict[str, object]]:
    return _lookup(
        path="reverse",
        params={"lat": latitude, "lon": longitude, "lang": locale},
        maximum_results=1,
    )


def _lookup(*, path: str, params: dict[str, object], maximum_results: int) -> list[dict[str, object]]:
    api_key = getattr(settings, "GEOAPIFY_API_KEY", "").strip()
    if not api_key:
        raise GeocodingUnavailable

    _consume_provider_budget()
    request_params = {**params, "format": "geojson", "apiKey": api_key}
    request = Request(
        f"https://api-eu.geoapify.com/v1/geocode/{path}?{urlencode(request_params)}",
        headers={
            "Accept": "application/geo+json, application/json",
            "User-Agent": "HostCleanerMarketplace/1.0",
        },
    )
    try:
        with urlopen(request, timeout=getattr(settings, "GEOAPIFY_GEOCODING_TIMEOUT_SECONDS", 5.0)) as response:
            raw_response = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, OSError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GeocodingUnavailable from error

    features = raw_response.get("features") if isinstance(raw_response, dict) else None
    if not isinstance(features, list):
        raise GeocodingUnavailable

    normalized_results = []
    for feature in features:
        normalized = _normalize_feature(feature)
        if normalized is not None:
            normalized_results.append(normalized)
        if len(normalized_results) >= maximum_results:
            break
    return normalized_results


def _normalize_feature(feature: object) -> dict[str, object] | None:
    if not isinstance(feature, dict):
        return None
    geometry = feature.get("geometry")
    properties = feature.get("properties")
    if not isinstance(geometry, dict) or not isinstance(properties, dict):
        return None
    coordinates = geometry.get("coordinates")
    if (
        geometry.get("type") != "Point"
        or not isinstance(coordinates, list)
        or len(coordinates) < 2
    ):
        return None
    longitude, latitude = coordinates[:2]
    if not _is_finite_coordinate(latitude) or not _is_finite_coordinate(longitude):
        return None

    address = _first_text(properties, "formatted", "address_line1")
    if not address:
        return None
    return {
        "latitude": float(latitude),
        "longitude": float(longitude),
        "address": address,
        "city": _first_text(properties, "city", "town", "village", "county"),
        "neighborhood": _first_text(properties, "suburb", "neighbourhood", "district"),
    }


def _first_text(values: dict[str, object], *keys: str) -> str:
    for key in keys:
        value = values.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _is_finite_coordinate(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _consume_provider_budget() -> None:
    per_second_limit = max(1, int(getattr(settings, "GEOAPIFY_PROVIDER_REQUESTS_PER_SECOND", 4)))
    cache_key = f"geoapify:geocoding:budget:{int(time.time())}"
    if cache.add(cache_key, 1, timeout=2):
        return
    try:
        count = cache.incr(cache_key)
    except ValueError:
        count = 1
        cache.set(cache_key, count, timeout=2)
    if count > per_second_limit:
        raise GeocodingProviderRateLimited
