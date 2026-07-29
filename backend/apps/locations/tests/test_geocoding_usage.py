from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.locations.cleanup import cleanup_expired_geocoding_usage
from apps.locations.geocoding import (
    GeocodingDailyQuotaExceeded,
    _cache_key,
    search_locations,
)
from apps.locations.models import GeocodingUsageAlert, GeocodingUsageDaily
from apps.locations.tasks import deliver_geocoding_usage_alert


NORMALIZED_RESULT = {
    "latitude": 42.6977,
    "longitude": 23.3219,
    "address": "Test street 1, Sofia",
    "city": "Sofia",
    "neighborhood": "Lozenets",
}


@override_settings(
    GEOAPIFY_API_KEY="test-geoapify-key",
    GEOAPIFY_PROVIDER_REQUESTS_PER_SECOND=100,
    GEOAPIFY_DAILY_CREDIT_CAP=5,
    GEOAPIFY_CACHE_TTL_SECONDS=86400,
)
class GeocodingUsageTests(TestCase):
    def setUp(self):
        cache.clear()

    @patch("apps.locations.geocoding.urlopen")
    def test_normalized_result_cache_uses_hmac_key_and_avoids_second_provider_request(self, urlopen_mock):
        urlopen_mock.return_value.__enter__.return_value.read.return_value = b'{"features": []}'
        query = "PRIVATE-ADDRESS-SENTINEL"
        cache.set(
            _cache_key(path="search", params={"text": query, "filter": "countrycode:bg", "limit": 6, "lang": "en"}),
            [NORMALIZED_RESULT],
            timeout=86400,
        )

        results = search_locations(query=query, locale="en")

        self.assertEqual(results, [NORMALIZED_RESULT])
        urlopen_mock.assert_not_called()
        key = _cache_key(path="search", params={"text": query, "filter": "countrycode:bg", "limit": 6, "lang": "en"})
        self.assertNotIn(query, key)
        self.assertNotIn("42.6977", key)
        self.assertFalse(GeocodingUsageDaily.objects.exists())

    @patch("apps.locations.geocoding.urlopen")
    def test_provider_calls_increment_only_aggregate_daily_usage_and_create_deduplicated_alerts(self, urlopen_mock):
        urlopen_mock.return_value.__enter__.return_value.read.return_value = b'{"features": []}'

        for query in ("PRIVATE-ONE", "PRIVATE-TWO", "PRIVATE-THREE", "PRIVATE-FOUR", "PRIVATE-FIVE"):
            search_locations(query=query, locale="en")

        daily = GeocodingUsageDaily.objects.get()
        self.assertEqual(daily.provider, "geoapify")
        self.assertEqual(daily.outbound_request_count, 5)
        self.assertEqual(
            list(daily.alerts.values_list("threshold", "delivery_state")),
            [(4, GeocodingUsageAlert.DeliveryState.PENDING), (5, GeocodingUsageAlert.DeliveryState.PENDING)],
        )
        self.assertNotIn("PRIVATE-ONE", str(daily.__dict__))
        self.assertNotIn("PRIVATE", str(list(daily.alerts.values())))

    @patch("apps.locations.geocoding.urlopen")
    def test_daily_cap_blocks_any_further_provider_call(self, urlopen_mock):
        urlopen_mock.return_value.__enter__.return_value.read.return_value = b'{"features": []}'
        today = timezone.localdate()
        GeocodingUsageDaily.objects.create(
            provider="geoapify",
            usage_date=today,
            outbound_request_count=5,
        )

        with self.assertRaises(GeocodingDailyQuotaExceeded):
            search_locations(query="PRIVATE-CAPPED-ADDRESS", locale="en")

        urlopen_mock.assert_not_called()

    def test_cleanup_deletes_only_usage_and_alert_rows_past_twelve_months(self):
        old_daily = GeocodingUsageDaily.objects.create(
            provider="geoapify",
            usage_date=timezone.localdate() - timedelta(days=366),
            outbound_request_count=1,
        )
        GeocodingUsageAlert.objects.create(usage=old_daily, threshold=1)
        recent_daily = GeocodingUsageDaily.objects.create(
            provider="geoapify",
            usage_date=timezone.localdate() - timedelta(days=365),
            outbound_request_count=1,
        )

        deleted = cleanup_expired_geocoding_usage(limit=10)

        self.assertEqual(deleted, 1)
        self.assertFalse(GeocodingUsageDaily.objects.filter(pk=old_daily.pk).exists())
        self.assertTrue(GeocodingUsageDaily.objects.filter(pk=recent_daily.pk).exists())

    @override_settings(GEOAPIFY_USAGE_ALERT_EMAIL="owner@example.test")
    @patch("apps.locations.tasks.send_configured_email")
    def test_owner_alert_delivery_is_idempotent_and_never_persists_recipient(self, send_email):
        daily = GeocodingUsageDaily.objects.create(
            provider="geoapify",
            usage_date=timezone.localdate(),
            outbound_request_count=800,
        )
        alert = GeocodingUsageAlert.objects.create(usage=daily, threshold=800)

        self.assertEqual(deliver_geocoding_usage_alert(alert.id), "sent")
        self.assertEqual(deliver_geocoding_usage_alert(alert.id), "skipped")

        send_email.assert_called_once()
        self.assertEqual(send_email.call_args.kwargs["to_email"], "owner@example.test")
        alert.refresh_from_db()
        self.assertEqual(alert.delivery_state, GeocodingUsageAlert.DeliveryState.SENT)
        self.assertNotIn("owner@example.test", str(alert.__dict__))
