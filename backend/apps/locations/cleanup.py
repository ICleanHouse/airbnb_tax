from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.locations.models import GeocodingUsageDaily


def cleanup_expired_geocoding_usage(*, limit: int) -> int:
    """Delete bounded, aggregate-only Geoapify usage rows after their retention period."""
    retention_days = max(1, int(getattr(settings, "GEOAPIFY_USAGE_RETENTION_DAYS", 365)))
    cutoff = timezone.localdate() - timedelta(days=retention_days)
    ids = list(
        GeocodingUsageDaily.objects.filter(usage_date__lt=cutoff)
        .order_by("usage_date", "id")
        .values_list("id", flat=True)[: max(1, min(int(limit), 500))]
    )
    if not ids:
        return 0
    # Django's cascade count includes alert rows. The task reports only the
    # number of retained daily aggregates, keeping operational telemetry clear.
    GeocodingUsageDaily.objects.filter(id__in=ids).delete()
    return len(ids)
