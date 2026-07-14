from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import HostProfile, User
from apps.marketplace.models import CleaningJob
from apps.properties.models import Property


@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class CalendarConflictPrivacyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = User.objects.create_user(
            username="calendar-owner",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.host)
        self.other_host = User.objects.create_user(
            username="calendar-other",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.other_host)
        self.property = Property.objects.create(host=self.host, name="Private Flat", city="Sofia")
        start = timezone.now() + timedelta(days=1)
        self.job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Private conflict",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            status=CleaningJob.Status.OPEN,
        )
        self.params = {
            "property_id": self.property.id,
            "starts_at": (start + timedelta(minutes=30)).isoformat(),
            "ends_at": (start + timedelta(hours=1)).isoformat(),
        }

    def test_anonymous_request_preserves_authentication_response(self):
        response = self.client.get("/api/calendars/conflicts/", self.params)
        self.assertEqual(response.status_code, 403)

    def test_unrelated_property_is_hidden_with_404(self):
        self.client.force_authenticate(self.other_host)
        response = self.client.get("/api/calendars/conflicts/", self.params)
        self.assertEqual(response.status_code, 404)

    def test_unrelated_property_with_reversed_range_is_still_hidden_with_404(self):
        self.client.force_authenticate(self.other_host)
        response = self.client.get(
            "/api/calendars/conflicts/",
            {
                "property_id": self.property.id,
                "starts_at": self.params["ends_at"],
                "ends_at": self.params["starts_at"],
            },
        )
        self.assertEqual(response.status_code, 404)

    def test_owner_receives_conflicts_with_private_no_store_headers(self):
        self.client.force_authenticate(self.host)
        response = self.client.get("/api/calendars/conflicts/", self.params)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [self.job.id])
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')

    def test_owned_invalid_range_is_business_validation_400(self):
        self.client.force_authenticate(self.host)
        response = self.client.get(
            "/api/calendars/conflicts/",
            {
                "property_id": self.property.id,
                "starts_at": self.params["ends_at"],
                "ends_at": self.params["starts_at"],
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_malformed_property_ids_are_filter_validation_400(self):
        self.client.force_authenticate(self.host)

        for property_id in ("not-an-integer", "0", "-1"):
            with self.subTest(property_id=property_id):
                response = self.client.get(
                    "/api/calendars/conflicts/",
                    {**self.params, "property_id": property_id},
                )
                self.assertEqual(response.status_code, 400)
