from __future__ import annotations

import json
from unittest.mock import patch
from urllib.parse import urlparse

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog


class FakeUpstreamResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


GEOAPIFY_FEATURE = {
    "type": "Feature",
    "properties": {
        "formatted": "Test street 1, Sofia",
        "city": "Sofia",
        "suburb": "Lozenets",
    },
    "geometry": {"type": "Point", "coordinates": [23.3219, 42.6977]},
}


@override_settings(
    GEOAPIFY_API_KEY="test-geoapify-key",
    GEOAPIFY_PROVIDER_REQUESTS_PER_SECOND=100,
)
class GeocodingApiTests(TestCase):
    search_url = "/api/locations/geocode/search/"
    reverse_url = "/api/locations/geocode/reverse/"

    def setUp(self):
        cache.clear()
        self.host = self.create_user("host", User.Role.HOST)
        self.admin = self.create_user("admin", User.Role.ADMIN)
        self.client = APIClient()

    @staticmethod
    def create_user(
        username: str,
        role: str,
        *,
        status: str = User.AccountStatus.APPROVED,
        is_active: bool = True,
        preferred_language: str = "en",
    ) -> User:
        return User.objects.create_user(
            username=f"{username}@example.test",
            email=f"{username}@example.test",
            role=role,
            account_status=status,
            is_active=is_active,
            preferred_language=preferred_language,
        )

    def post(self, url: str, payload: dict, *, user: User | None = None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        return client.post(url, payload, format="json")

    @staticmethod
    def fake_urlopen(_request, timeout: float):
        assert timeout > 0
        return FakeUpstreamResponse({"type": "FeatureCollection", "features": [GEOAPIFY_FEATURE]})

    @patch("apps.locations.geocoding.urlopen", side_effect=fake_urlopen.__func__)
    def test_approved_host_receives_normalized_search_results(self, _urlopen):
        response = self.post(self.search_url, {"query": "Test street, Sofia", "locale": "en"}, user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {
                "results": [{
                    "latitude": 42.6977,
                    "longitude": 23.3219,
                    "address": "Test street 1, Sofia",
                    "city": "Sofia",
                    "neighborhood": "Lozenets",
                }]
            },
        )
        self.assert_private_no_store(response)

    @patch("apps.locations.geocoding.urlopen", side_effect=fake_urlopen.__func__)
    def test_platform_admin_can_reverse_geocode(self, _urlopen):
        response = self.post(
            self.reverse_url,
            {"latitude": 42.6977, "longitude": 23.3219, "locale": "bg"},
            user=self.admin,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["city"], "Sofia")
        self.assert_private_no_store(response)

    @patch("apps.locations.geocoding.urlopen", side_effect=fake_urlopen.__func__)
    def test_geocoding_requests_use_the_eu_only_provider_endpoint(self, urlopen_mock):
        response = self.post(self.search_url, {"query": "Sofia", "locale": "en"}, user=self.host)

        self.assertEqual(response.status_code, 200)
        request = urlopen_mock.call_args.args[0]
        self.assertEqual(urlparse(request.full_url).netloc, "api-eu.geoapify.com")

    def test_anonymous_and_ineligible_accounts_are_denied(self):
        denied_users = (
            None,
            self.create_user("cleaner", User.Role.CLEANER),
            self.create_user("agency", User.Role.AGENCY),
            self.create_user("pending", User.Role.HOST, status=User.AccountStatus.PENDING),
            self.create_user("suspended", User.Role.HOST, status=User.AccountStatus.SUSPENDED),
            self.create_user("inactive", User.Role.HOST, is_active=False),
        )

        for user in denied_users:
            with self.subTest(user=user and user.username):
                response = self.post(self.search_url, {"query": "Sofia"}, user=user)
                self.assertEqual(response.status_code, 403)

    def test_invalid_search_and_out_of_country_coordinates_are_rejected_before_provider_call(self):
        invalid_requests = (
            (self.search_url, {"query": "ab"}),
            (self.search_url, {"query": "x" * 161}),
            (self.reverse_url, {"latitude": 55.0, "longitude": 23.3219}),
            (self.reverse_url, {"latitude": 42.6977, "longitude": 12.0}),
        )

        for url, payload in invalid_requests:
            with self.subTest(payload=payload):
                response = self.post(url, payload, user=self.host)
                self.assertEqual(response.status_code, 400)

    @override_settings(GEOAPIFY_API_KEY="")
    def test_missing_provider_configuration_fails_closed(self):
        response = self.post(self.search_url, {"query": "Sofia"}, user=self.host)

        self.assert_safe_unavailable(response)

    @patch("apps.locations.geocoding.urlopen", side_effect=OSError("PRIVATE-UPSTREAM-SENTINEL"))
    def test_provider_failure_is_safe_and_audit_metadata_is_redacted(self, _urlopen):
        response = self.post(
            self.search_url,
            {"query": "PRIVATE-ADDRESS-SENTINEL", "locale": "en"},
            user=self.host,
        )

        self.assert_safe_unavailable(response)
        audit_rows = list(
            AuditLog.objects.filter(entity_type="Geocoding")
            .values("action", "metadata")
        )
        self.assertEqual(
            audit_rows,
            [{"action": "geocoding.search.failed", "metadata": {"reason_code": "provider_unavailable"}}],
        )
        self.assertNotIn("PRIVATE-ADDRESS-SENTINEL", str(audit_rows))
        self.assertNotIn("PRIVATE-UPSTREAM-SENTINEL", str(audit_rows))

    @override_settings(GEOAPIFY_PROVIDER_REQUESTS_PER_SECOND=1)
    @patch("apps.locations.geocoding.urlopen", side_effect=fake_urlopen.__func__)
    def test_shared_provider_budget_throttles_without_logging_query_text(self, _urlopen):
        first = self.post(self.search_url, {"query": "Sofia"}, user=self.host)
        second = self.post(self.search_url, {"query": "PRIVATE-RATE-LIMIT-SENTINEL"}, user=self.admin)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.data["code"], "geocoding_provider_rate_limited")
        self.assertNotIn("PRIVATE-RATE-LIMIT-SENTINEL", str(second.data))

    def assert_safe_unavailable(self, response):
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "geocoding_unavailable")
        self.assertNotIn("PRIVATE", str(response.data))
        self.assert_private_no_store(response)

    def assert_private_no_store(self, response):
        self.assertIn("private", response["Cache-Control"])
        self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertEqual(response["Expires"], "0")
