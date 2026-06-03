from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, User


def make_cleaner(
    *,
    email: str,
    display_name: str,
    verification_status: str = CleanerProfile.VerificationStatus.VERIFIED,
    account_status: str = User.AccountStatus.APPROVED,
    city: str = "",
    service_areas=None,
    average_rating: str = "0",
    completed_jobs_count: int = 0,
) -> CleanerProfile:
    user = User.objects.create_user(
        username=email,
        email=email,
        password="Password123!",
        first_name="Clean",
        last_name="Er",
        role=User.Role.CLEANER,
        account_status=account_status,
        phone_number="+359888123456",
    )
    return CleanerProfile.objects.create(
        user=user,
        display_name=display_name,
        verification_status=verification_status,
        city=city,
        service_areas=service_areas or [],
        average_rating=average_rating,
        completed_jobs_count=completed_jobs_count,
        birth_date="1990-01-01",
    )


class PublicCleanerDirectoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.list_url = reverse("public-cleaner-list")

    def test_lists_only_verified_and_approved_cleaners(self):
        approved = make_cleaner(email="ok@example.com", display_name="Approved Pro")
        make_cleaner(
            email="pending@example.com",
            display_name="Pending",
            verification_status=CleanerProfile.VerificationStatus.PENDING,
        )
        make_cleaner(
            email="unapproved@example.com",
            display_name="Unapproved",
            account_status=User.AccountStatus.PENDING,
        )

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        results = response.data["results"] if isinstance(response.data, dict) else response.data
        ids = [row["id"] for row in results]
        self.assertEqual(ids, [approved.id])

    def test_public_payload_hides_pii(self):
        make_cleaner(email="pii@example.com", display_name="No PII")

        response = self.client.get(self.list_url)

        results = response.data["results"] if isinstance(response.data, dict) else response.data
        row = results[0]
        for forbidden in ("email", "phone_number", "birth_date", "age", "sex", "user"):
            self.assertNotIn(forbidden, row)
        self.assertIn("display_name", row)
        self.assertIn("city", row)
        self.assertIn("average_rating", row)

    def test_filters_by_min_rating(self):
        low = make_cleaner(email="low@example.com", display_name="Low", average_rating="3.00")
        high = make_cleaner(email="high@example.com", display_name="High", average_rating="4.80")

        response = self.client.get(self.list_url, {"min_rating": "4"})

        results = response.data["results"] if isinstance(response.data, dict) else response.data
        ids = [row["id"] for row in results]
        self.assertIn(high.id, ids)
        self.assertNotIn(low.id, ids)

    def test_filters_by_service_area(self):
        sofia = make_cleaner(
            email="sofia@example.com", display_name="Sofia", service_areas=["Sofia Center"]
        )
        plovdiv = make_cleaner(
            email="plovdiv@example.com", display_name="Plovdiv", service_areas=["Plovdiv"]
        )

        response = self.client.get(self.list_url, {"service_area": "sofia"})

        results = response.data["results"] if isinstance(response.data, dict) else response.data
        ids = [row["id"] for row in results]
        self.assertEqual(ids, [sofia.id])
        self.assertNotIn(plovdiv.id, ids)

    def test_filters_by_city_uses_profile_city(self):
        sofia = make_cleaner(
            email="sofia-city@example.com",
            display_name="Sofia Center",
            city="Sofia",
            service_areas=["Център"],
        )
        make_cleaner(
            email="varna-city@example.com",
            display_name="Varna Center",
            city="Varna",
            service_areas=["Център"],
        )

        response = self.client.get(self.list_url, {"city": "Sofia"})

        results = response.data["results"] if isinstance(response.data, dict) else response.data
        ids = [row["id"] for row in results]
        self.assertEqual(ids, [sofia.id])

    def test_detail_embeds_received_reviews_without_pii(self):
        cleaner = make_cleaner(email="reviewed@example.com", display_name="Reviewed")

        from apps.feedback.models import Review
        from apps.marketplace.models import CleaningJob
        from apps.properties.models import Property

        host = User.objects.create_user(
            username="host@example.com",
            email="host@example.com",
            password="Password123!",
            first_name="Host",
            last_name="User",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        from django.utils import timezone
        from datetime import timedelta

        prop = Property.objects.create(host=host, name="Flat", address="1 St", city="Sofia")
        start = timezone.now()
        job = CleaningJob.objects.create(
            host=host,
            property=prop,
            title="Deep clean",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            status=CleaningJob.Status.COMPLETED,
        )
        Review.objects.create(
            job=job,
            reviewer=host,
            reviewee=cleaner.user,
            rating=5,
            comment="Spotless work",
        )

        detail_url = reverse("public-cleaner-detail", args=[cleaner.id])
        response = self.client.get(detail_url)

        self.assertEqual(response.status_code, 200)
        self.assertIn("reviews", response.data)
        self.assertEqual(len(response.data["reviews"]), 1)
        review = response.data["reviews"][0]
        self.assertEqual(review["rating"], 5)
        self.assertEqual(review["comment"], "Spotless work")
        self.assertIn("reviewer_name", review)
