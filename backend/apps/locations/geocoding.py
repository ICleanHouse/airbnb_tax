from __future__ import annotations

import json
import hashlib
import hmac
import logging
import math
import time
from copy import deepcopy
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.locations.models import GeocodingUsageAlert, GeocodingUsageDaily

logger = logging.getLogger("apps.locations")


class GeocodingUnavailable(Exception):
    """The configured provider cannot safely complete a lookup."""


class GeocodingProviderRateLimited(Exception):
    """The shared provider budget is exhausted for the current time window."""


class GeocodingDailyQuotaExceeded(Exception):
    """The daily aggregate provider-call cap has been reached."""


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
    api_key = _configured_api_key()
    _ensure_daily_quota_available()
    cache_key = _cache_key(path=path, params=params)
    cached = cache.get(cache_key)
    if isinstance(cached, list):
        # Return a copy because locmem caches can otherwise hand a caller the
        # server-side cache value itself. Browser responses remain no-store.
        return deepcopy(cached)
    _consume_provider_budget()
    alert_ids = _reserve_daily_provider_credit()
    # A failed provider response is still an outbound provider call and must
    # retain its aggregate quota/alert evidence. Queue the idempotent outbox
    # before making that network request.
    _enqueue_usage_alerts(alert_ids)
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
    cache.set(
        cache_key,
        normalized_results,
        timeout=max(1, int(getattr(settings, "GEOAPIFY_CACHE_TTL_SECONDS", 86400))),
    )
    return normalized_results


def _configured_api_key() -> str:
    api_key = getattr(settings, "GEOAPIFY_API_KEY", "").strip()
    if not api_key:
        raise GeocodingUnavailable
    if getattr(settings, "APP_ENV", "local").lower() not in {"prod", "production"}:
        return api_key
    if not (
        getattr(settings, "GEOAPIFY_PRODUCTION_APPROVED", False)
        and getattr(settings, "GEOAPIFY_ATTRIBUTION", "").strip()
        and getattr(settings, "GEOAPIFY_MONTHLY_BUDGET_EUR", 0) >= 1
        and getattr(settings, "GEOAPIFY_USAGE_ALERT_EMAIL", "").strip()
        and int(getattr(settings, "GEOAPIFY_DAILY_CREDIT_CAP", 0)) > 0
        and int(getattr(settings, "GEOAPIFY_CACHE_TTL_SECONDS", 0)) > 0
    ):
        # Production remains fail-closed until the processor approval, notice,
        # attribution, owner contact and bounded technical safeguards exist.
        raise GeocodingUnavailable
    return api_key


def _cache_key(*, path: str, params: dict[str, object]) -> str:
    canonical = json.dumps(
        {"path": path, "params": params},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    secret = str(getattr(settings, "SECRET_KEY", "")).encode("utf-8")
    digest = hmac.new(secret, canonical, hashlib.sha256).hexdigest()
    return f"geocoding:normalized:v1:{digest}"


def _ensure_daily_quota_available() -> None:
    cap = max(1, int(getattr(settings, "GEOAPIFY_DAILY_CREDIT_CAP", 1000)))
    used = GeocodingUsageDaily.objects.filter(
        provider="geoapify", usage_date=timezone.localdate()
    ).values_list("outbound_request_count", flat=True).first()
    if used is not None and used >= cap:
        raise GeocodingDailyQuotaExceeded


def _reserve_daily_provider_credit() -> list[int]:
    """Atomically reserve one outbound call and create threshold outbox rows."""
    cap = max(1, int(getattr(settings, "GEOAPIFY_DAILY_CREDIT_CAP", 1000)))
    usage_date = timezone.localdate()
    try:
        with transaction.atomic():
            usage, _ = GeocodingUsageDaily.objects.select_for_update().get_or_create(
                provider="geoapify",
                usage_date=usage_date,
            )
            if usage.outbound_request_count >= cap:
                raise GeocodingDailyQuotaExceeded
            usage.outbound_request_count += 1
            usage.save(update_fields=["outbound_request_count", "updated_at"])
            thresholds = (max(1, (cap * 80 + 99) // 100), cap)
            alert_ids: list[int] = []
            for threshold in dict.fromkeys(thresholds):
                if usage.outbound_request_count >= threshold:
                    alert, created = GeocodingUsageAlert.objects.get_or_create(
                        usage=usage,
                        threshold=threshold,
                    )
                    if created:
                        alert_ids.append(alert.id)
            return alert_ids
    except IntegrityError:
        # A competing first request created the daily row. Retry through the
        # normal lock path; no request data is retained in this operation.
        return _reserve_daily_provider_credit()


def _enqueue_usage_alerts(alert_ids: list[int]) -> None:
    if not alert_ids:
        return
    from apps.locations.tasks import deliver_geocoding_usage_alert

    for alert_id in alert_ids:
        def dispatch(alert_id: int = alert_id) -> None:
            try:
                deliver_geocoding_usage_alert.delay(alert_id)
            except Exception:
                # Alert delivery must never re-expose a lookup or turn a
                # successful private lookup into an outage. The durable outbox
                # remains pending for the worker/retry path.
                logger.warning(
                    "Geocoding usage alert enqueue failed",
                    extra={"event": "geocoding.usage_alert.enqueue_failed"},
                )

        transaction.on_commit(dispatch)


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
