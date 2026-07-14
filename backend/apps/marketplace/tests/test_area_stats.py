from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, HostProfile, User
from apps.marketplace.models import CleaningJob
from apps.properties.models import Property


class AreaStatsViewTests(TestCase):
    """The public landing-page demand/supply stats endpoint."""

    def setUp(self):
        self.api_client = APIClient()
        self.host = User.objects.create_user(
            username="host",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.host, city="Sofia")
        self.cleaner = User.objects.create_user(
            username="cleaner",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.cleaner,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
            display_name="Verified Cleaner",
            city="Sofia",
        )
        # An unverified cleaner that must NOT be counted.
        self.pending_cleaner = User.objects.create_user(
            username="cleaner_pending",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.pending_cleaner,
            verification_status=CleanerProfile.VerificationStatus.PENDING,
            display_name="Pending Cleaner",
            city="Sofia",
        )
        self.property = Property.objects.create(
            host=self.host,
            name="Center Apartment",
            city="Sofia",
        )
        self.open_job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Turnover cleaning",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
            proposed_price=Decimal("45.00"),
            status=CleaningJob.Status.OPEN,
        )
        # A draft job that should not show in open_jobs.
        CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Draft cleaning",
            scheduled_start=timezone.now() + timedelta(days=2),
            scheduled_end=timezone.now() + timedelta(days=2, hours=2),
            status=CleaningJob.Status.DRAFT,
        )

    def test_stats_are_public_and_aggregate_only(self):
        res = self.api_client.get("/api/marketplace/area-stats/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # Only counts — no identities leak through.
        self.assertEqual(
            set(data.keys()),
            {
                "city",
                "verified_cleaners",
                "active_hosts",
                "open_jobs",
                "jobs_this_week",
                "jobs_this_month",
            },
        )
        self.assertEqual(data["verified_cleaners"], 1)  # pending cleaner excluded
        self.assertEqual(data["active_hosts"], 1)
        self.assertEqual(data["open_jobs"], 1)  # draft excluded
        self.assertEqual(res["Cache-Control"], "no-store")
        self.assertEqual(res["Clear-Site-Data"], '"cache"')

    def test_canonical_city_slug_filter_narrows_counts_without_echoing_input(self):
        res = self.api_client.get("/api/marketplace/area-stats/?city=sofia")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["city"], "sofia")
        self.assertEqual(data["verified_cleaners"], 1)
        self.assertEqual(data["active_hosts"], 1)
        self.assertEqual(data["open_jobs"], 1)

    def test_malformed_city_is_400_and_unknown_canonical_slug_is_404(self):
        malformed = self.api_client.get("/api/marketplace/area-stats/", {"city": "Sofia"})
        unknown = self.api_client.get("/api/marketplace/area-stats/", {"city": "plovdiv"})

        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(malformed.json()["code"], "invalid_city_filter")
        self.assertEqual(unknown.status_code, 404)
        self.assertEqual(unknown.json()["code"], "city_not_found")
        for response in (malformed, unknown):
            self.assertEqual(response["Cache-Control"], "no-store")
            self.assertEqual(response["Clear-Site-Data"], '"cache"')
