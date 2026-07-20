from datetime import timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.marketplace.models import CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property, PropertyImage


class OpenJobLocationsViewTests(TestCase):
    """Deprecated route remains a privacy-safe aggregate compatibility alias."""

    def setUp(self):
        self.api_client = APIClient()
        self.host = User.objects.create_user(
            username="host",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.cleaner = User.objects.create_user(
            username="cleaner",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        self.sofia_property = Property.objects.create(
            host=self.host,
            name="Center Apartment",
            address="1 Vitosha Boulevard",
            city="Sofia",
            neighborhood="Center",
            latitude=Decimal("42.697700"),
            longitude=Decimal("23.321900"),
        )
        self.plovdiv_property = Property.objects.create(
            host=self.host,
            name="Old Town Studio",
            address="Old Town",
            city="Plovdiv",
            neighborhood="Center",
            latitude=Decimal("42.135400"),
            longitude=Decimal("24.745300"),
        )
        self.unpinned_property = Property.objects.create(
            host=self.host,
            name="Missing Coordinates",
            address="Unknown",
            city="Sofia",
        )
        PropertyImage.objects.create(
            property=self.sofia_property,
            image=ContentFile(b"fake-image", name="property-main.jpg"),
            order=0,
        )

        self.sofia_job = create_cleaning_job_record(
            property=self.sofia_property,
            host=self.host,
            title="Turnover cleaning",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
            proposed_price=Decimal("45.00"),
            status=CleaningJob.Status.OPEN,
        )
        self.plovdiv_job = create_cleaning_job_record(
            property=self.plovdiv_property,
            host=self.host,
            title="Guest checkout cleaning",
            scheduled_start=timezone.now() + timedelta(days=2),
            scheduled_end=timezone.now() + timedelta(days=2, hours=2),
            proposed_price=Decimal("50.00"),
            status=CleaningJob.Status.OPEN,
        )
        create_cleaning_job_record(
            property=self.unpinned_property,
            host=self.host,
            title="Unpinned cleaning",
            scheduled_start=timezone.now() + timedelta(days=3),
            scheduled_end=timezone.now() + timedelta(days=3, hours=2),
            status=CleaningJob.Status.OPEN,
        )
        create_cleaning_job_record(
            property=self.sofia_property,
            host=self.host,
            title="Draft cleaning",
            scheduled_start=timezone.now() + timedelta(days=4),
            scheduled_end=timezone.now() + timedelta(days=4, hours=2),
            status=CleaningJob.Status.DRAFT,
        )

    def test_alias_is_public_aggregate_and_contains_no_marker_fields(self):
        res = self.api_client.get("/api/marketplace/open-job-locations/")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(set(data), {"cities"})
        self.assertEqual(data["cities"][0]["city_slug"], "sofia")
        self.assertEqual(data["cities"][0]["open_job_count"], 2)
        serialized = str(data)
        for private_value in [
            self.sofia_property.address,
            self.sofia_property.name,
            self.sofia_job.title,
            "property-main.jpg",
            "42.6977",
            "23.3219",
            "45.00",
        ]:
            self.assertNotIn(private_value, serialized)
        self.assertEqual(res["Deprecation"], "true")
        self.assertEqual(res["Sunset"], "Thu, 15 Oct 2026 00:00:00 GMT")
        self.assertEqual(res["Cache-Control"], "no-store")

    def test_city_filter_uses_canonical_catalog(self):
        res = self.api_client.get("/api/marketplace/open-job-locations/?city=sofia")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(len(data["cities"]), 1)
        self.assertEqual(data["cities"][0]["city_slug"], "sofia")

    def test_same_safe_aggregate_is_available_to_hosts_cleaners_and_guests(self):
        for user in (None, self.host, self.cleaner):
            with self.subTest(user=getattr(user, "username", "guest")):
                self.api_client.force_authenticate(user=user)

                res = self.api_client.get("/api/marketplace/open-job-locations/")

                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.json()["cities"][0]["open_job_count"], 2)

        self.api_client.force_authenticate(user=None)
