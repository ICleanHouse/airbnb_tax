from datetime import timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.marketplace.models import CleaningJob
from apps.properties.models import Property, PropertyImage


class OpenJobLocationsViewTests(TestCase):
    """Public map markers for published cleaning work."""

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

        self.sofia_job = CleaningJob.objects.create(
            property=self.sofia_property,
            host=self.host,
            title="Turnover cleaning",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
            proposed_price=Decimal("45.00"),
            status=CleaningJob.Status.OPEN,
        )
        self.plovdiv_job = CleaningJob.objects.create(
            property=self.plovdiv_property,
            host=self.host,
            title="Guest checkout cleaning",
            scheduled_start=timezone.now() + timedelta(days=2),
            scheduled_end=timezone.now() + timedelta(days=2, hours=2),
            proposed_price=Decimal("50.00"),
            status=CleaningJob.Status.OPEN,
        )
        CleaningJob.objects.create(
            property=self.unpinned_property,
            host=self.host,
            title="Unpinned cleaning",
            scheduled_start=timezone.now() + timedelta(days=3),
            scheduled_end=timezone.now() + timedelta(days=3, hours=2),
            status=CleaningJob.Status.OPEN,
        )
        CleaningJob.objects.create(
            property=self.sofia_property,
            host=self.host,
            title="Draft cleaning",
            scheduled_start=timezone.now() + timedelta(days=4),
            scheduled_end=timezone.now() + timedelta(days=4, hours=2),
            status=CleaningJob.Status.DRAFT,
        )

    def test_locations_are_public_and_limited_to_open_pinned_jobs(self):
        res = self.api_client.get("/api/marketplace/open-job-locations/")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual([item["id"] for item in data], [self.sofia_job.id, self.plovdiv_job.id])
        self.assertEqual(
            set(data[0].keys()),
            {
                "id",
                "title",
                "scheduled_start",
                "scheduled_end",
                "currency",
                "proposed_price",
                "property_id",
                "property_name",
                "property_city",
                "property_neighborhood",
                "property_address",
                "property_image",
                "latitude",
                "longitude",
            },
        )
        self.assertNotIn("host", data[0])
        self.assertEqual(data[0]["property_id"], self.sofia_property.id)
        self.assertEqual(data[0]["property_address"], "1 Vitosha Boulevard")
        self.assertTrue(data[0]["property_image"].startswith("/media/property_images/"))
        self.assertEqual(data[0]["latitude"], 42.6977)
        self.assertEqual(data[0]["longitude"], 23.3219)

    def test_city_filter_narrows_locations(self):
        res = self.api_client.get("/api/marketplace/open-job-locations/?city=Plovdiv")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], self.plovdiv_job.id)
        self.assertEqual(data[0]["property_city"], "Plovdiv")

    def test_locations_are_available_to_hosts_cleaners_and_guests(self):
        for user in (None, self.host, self.cleaner):
            with self.subTest(user=getattr(user, "username", "guest")):
                self.api_client.force_authenticate(user=user)

                res = self.api_client.get("/api/marketplace/open-job-locations/")

                self.assertEqual(res.status_code, 200)
                self.assertEqual(len(res.json()), 2)

        self.api_client.force_authenticate(user=None)
