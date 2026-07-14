from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, HostProfile, User
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob, FavouriteCleaner
from apps.marketplace.services import (
    MarketplaceError,
    accept_offer,
    decline_offer,
    offer_job,
    offer_job_to_cleaner,
)
from apps.notifications.models import Notification
from apps.properties.models import Property


class OfferServiceTests(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.host = User.objects.create_user(
            username="host",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.host)
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
        )
        self.other_cleaner = User.objects.create_user(
            username="cleaner2",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.other_cleaner,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
            display_name="Second Cleaner",
        )
        self.property = Property.objects.create(
            host=self.host,
            name="Center Apartment",
            city="Sofia",
            cleaning_instructions="Change linens.",
        )
        self.job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Turnover cleaning",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
            proposed_price=Decimal("45.00"),
        )

    def test_offer_job_creates_host_offered_application(self):
        private_offer_message = "PRIVATE_HOST_OFFER_MESSAGE_SENTINEL"
        application = offer_job(
            job=self.job,
            host=self.host,
            cleaner=self.cleaner,
            proposed_price=Decimal("55.00"),
            message=private_offer_message,
        )
        self.assertEqual(application.origin, CleanerApplication.Origin.HOST_OFFERED)
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertEqual(application.proposed_price, Decimal("55.00"))
        notification = Notification.objects.get(
            user=self.cleaner,
            notification_type="offer.received",
        )
        for private_value in (self.host.get_username(), self.job.title, private_offer_message):
            self.assertNotIn(private_value, notification.body)

        self.api_client.force_authenticate(self.cleaner)
        response = self.api_client.get("/api/notifications/notifications/")
        self.assertEqual(response.status_code, 200)
        for private_value in (self.host.get_username(), self.job.title, private_offer_message):
            self.assertNotIn(private_value, str(response.data))

    def test_offer_job_rejects_unverified_cleaner(self):
        unverified = User.objects.create_user(
            username="unverified",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(user=unverified)
        with self.assertRaises(MarketplaceError):
            offer_job(job=self.job, host=self.host, cleaner=unverified)

    def test_offer_job_rejects_inactive_verified_cleaner_in_service_and_api(self):
        inactive = User.objects.create_user(
            username="inactive-cleaner",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
            is_active=False,
        )
        CleanerProfile.objects.create(
            user=inactive,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )

        with self.assertRaises(MarketplaceError):
            offer_job(job=self.job, host=self.host, cleaner=inactive)
        self.assertFalse(CleanerApplication.objects.filter(cleaner=inactive).exists())
        self.assertFalse(Notification.objects.filter(user=inactive).exists())

        self.api_client.force_authenticate(self.host)
        response = self.api_client.post(
            f"/api/marketplace/jobs/{self.job.id}/offer/",
            {"cleaner_id": inactive.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(CleanerApplication.objects.filter(cleaner=inactive).exists())
        self.assertFalse(Notification.objects.filter(user=inactive).exists())

    def test_offer_job_rejects_non_owner_host(self):
        intruder = User.objects.create_user(
            username="intruder",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        with self.assertRaises(MarketplaceError):
            offer_job(job=self.job, host=intruder, cleaner=self.cleaner)

    def test_offer_job_refetches_current_host_and_cleaner_eligibility(self):
        User.objects.filter(pk=self.host.pk).update(
            account_status=User.AccountStatus.SUSPENDED
        )
        with self.assertRaisesMessage(MarketplaceError, "Account must be approved"):
            offer_job(job=self.job, host=self.host, cleaner=self.cleaner)

        User.objects.filter(pk=self.host.pk).update(
            account_status=User.AccountStatus.APPROVED
        )
        CleanerProfile.objects.filter(user=self.cleaner).update(
            verification_status=CleanerProfile.VerificationStatus.PENDING
        )
        with self.assertRaisesMessage(MarketplaceError, "Cleaner must be verified"):
            offer_job(job=self.job, host=self.host, cleaner=self.cleaner)

        self.assertFalse(CleanerApplication.objects.filter(job=self.job).exists())

    def test_offer_job_rejects_job_whose_start_has_passed(self):
        CleaningJob.objects.filter(pk=self.job.pk).update(
            scheduled_start=timezone.now() - timedelta(hours=3),
            scheduled_end=timezone.now() - timedelta(hours=1),
        )

        with self.assertRaisesMessage(
            MarketplaceError,
            "scheduled start must be in the future",
        ):
            offer_job(job=self.job, host=self.host, cleaner=self.cleaner)

        self.assertFalse(CleanerApplication.objects.filter(job=self.job).exists())

    def test_offer_job_to_cleaner_rejects_past_slot_without_creating_job(self):
        scheduled_start = timezone.now() - timedelta(hours=3)
        scheduled_end = timezone.now() - timedelta(hours=1)

        with self.assertRaisesMessage(
            MarketplaceError,
            "scheduled start must be in the future",
        ):
            offer_job_to_cleaner(
                host=self.host,
                cleaner=self.cleaner,
                property=self.property,
                scheduled_start=scheduled_start,
                scheduled_end=scheduled_end,
            )

        self.assertFalse(
            CleaningJob.objects.filter(
                property=self.property,
                scheduled_start=scheduled_start,
                scheduled_end=scheduled_end,
            ).exists()
        )

    def test_accept_offer_creates_single_assignment_and_rejects_siblings(self):
        offered = offer_job(job=self.job, host=self.host, cleaner=self.cleaner)
        sibling = offer_job(job=self.job, host=self.host, cleaner=self.other_cleaner)

        assignment = accept_offer(application=offered, cleaner=self.cleaner)

        self.job.refresh_from_db()
        offered.refresh_from_db()
        sibling.refresh_from_db()
        self.assertEqual(Assignment.objects.count(), 1)
        self.assertEqual(assignment.cleaner, self.cleaner)
        self.assertEqual(self.job.status, CleaningJob.Status.ASSIGNED)
        self.assertEqual(offered.status, CleanerApplication.Status.ACCEPTED)
        self.assertEqual(sibling.status, CleanerApplication.Status.REJECTED)
        self.assertEqual(
            Notification.objects.filter(user=self.host, notification_type="offer.accepted").count(),
            1,
        )

    def test_only_offered_cleaner_can_accept(self):
        offered = offer_job(job=self.job, host=self.host, cleaner=self.cleaner)
        with self.assertRaises(MarketplaceError):
            accept_offer(application=offered, cleaner=self.other_cleaner)

    def test_accept_offer_refetches_current_cleaner_eligibility(self):
        offered = offer_job(job=self.job, host=self.host, cleaner=self.cleaner)
        User.objects.filter(pk=self.cleaner.pk).update(
            account_status=User.AccountStatus.SUSPENDED
        )

        with self.assertRaisesMessage(MarketplaceError, "approved"):
            accept_offer(application=offered, cleaner=self.cleaner)

        offered.refresh_from_db()
        self.job.refresh_from_db()
        self.assertEqual(offered.status, CleanerApplication.Status.PENDING)
        self.assertEqual(self.job.status, CleaningJob.Status.DRAFT)
        self.assertFalse(Assignment.objects.filter(job=self.job).exists())

    def test_accept_offer_rejects_job_whose_start_has_passed(self):
        offered = offer_job(job=self.job, host=self.host, cleaner=self.cleaner)
        CleaningJob.objects.filter(pk=self.job.pk).update(
            scheduled_start=timezone.now() - timedelta(hours=3),
            scheduled_end=timezone.now() - timedelta(hours=1),
        )

        with self.assertRaisesMessage(
            MarketplaceError,
            "scheduled start must be in the future",
        ):
            accept_offer(application=offered, cleaner=self.cleaner)

        offered.refresh_from_db()
        self.job.refresh_from_db()
        self.assertEqual(offered.status, CleanerApplication.Status.PENDING)
        self.assertEqual(self.job.status, CleaningJob.Status.DRAFT)
        self.assertFalse(Assignment.objects.filter(job=self.job).exists())

    def test_decline_offer_sets_rejected_and_notifies_host(self):
        offered = offer_job(job=self.job, host=self.host, cleaner=self.cleaner)
        declined = decline_offer(application=offered, cleaner=self.cleaner)
        self.assertEqual(declined.status, CleanerApplication.Status.REJECTED)
        self.assertEqual(
            Notification.objects.filter(user=self.host, notification_type="offer.declined").count(),
            1,
        )

    def test_offer_accept_decline_through_api(self):
        self.api_client.force_authenticate(self.host)
        offer_res = self.api_client.post(
            f"/api/marketplace/jobs/{self.job.id}/offer/",
            {"cleaner_id": self.cleaner.id, "proposed_price": "60.00"},
            format="json",
        )
        self.assertEqual(offer_res.status_code, 201)
        application_id = offer_res.data["id"]
        self.assertEqual(offer_res.data["origin"], CleanerApplication.Origin.HOST_OFFERED)

        self.api_client.force_authenticate(self.cleaner)
        accept_res = self.api_client.post(
            f"/api/marketplace/applications/{application_id}/accept-offer/"
        )
        self.assertEqual(accept_res.status_code, 201)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, CleaningJob.Status.ASSIGNED)

    def test_offer_blocked_when_cleaner_assigned_same_property_same_day(self):
        # Fixed same-day window (09:00 / 13:00 local) so the two slots can't
        # straddle midnight regardless of when the test runs.
        day = (timezone.localtime(timezone.now()) + timedelta(days=2)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        morning_job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Morning turnover",
            scheduled_start=day,
            scheduled_end=day + timedelta(hours=2),
            proposed_price=Decimal("45.00"),
        )
        afternoon_job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Afternoon turnover",
            scheduled_start=day + timedelta(hours=4),
            scheduled_end=day + timedelta(hours=6),
            proposed_price=Decimal("40.00"),
        )

        # Cleaner accepts the morning offer → active assignment for that prop/day.
        offered = offer_job(job=morning_job, host=self.host, cleaner=self.cleaner)
        accept_offer(application=offered, cleaner=self.cleaner)

        # Same property + same day → second offer must be blocked.
        with self.assertRaises(MarketplaceError):
            offer_job(job=afternoon_job, host=self.host, cleaner=self.cleaner)

    def test_offer_blocked_when_cleaner_has_pending_offer_same_property_same_day(self):
        # A pending offer (not yet accepted) on the same property/day must also
        # block a second offer for a different time slot.
        day = (timezone.localtime(timezone.now()) + timedelta(days=3)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        morning_job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Morning turnover",
            scheduled_start=day,
            scheduled_end=day + timedelta(hours=2),
            proposed_price=Decimal("45.00"),
        )
        afternoon_job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Afternoon turnover",
            scheduled_start=day + timedelta(hours=4),
            scheduled_end=day + timedelta(hours=6),
            proposed_price=Decimal("40.00"),
        )

        # First offer is left pending (cleaner hasn't responded).
        offer_job(job=morning_job, host=self.host, cleaner=self.cleaner)

        with self.assertRaises(MarketplaceError):
            offer_job(job=afternoon_job, host=self.host, cleaner=self.cleaner)

    def test_offer_appears_on_both_calendars(self):
        offer_job(job=self.job, host=self.host, cleaner=self.cleaner)
        params = {
            "start": (timezone.now() - timedelta(days=1)).isoformat(),
            "end": (timezone.now() + timedelta(days=3)).isoformat(),
        }

        self.api_client.force_authenticate(self.cleaner)
        cleaner_res = self.api_client.get("/api/marketplace/calendar/", params)
        self.assertEqual(cleaner_res.status_code, 200)
        self.assertEqual(cleaner_res.data[0]["item_type"], "offer")

        self.api_client.force_authenticate(self.host)
        host_res = self.api_client.get("/api/marketplace/calendar/", params)
        self.assertEqual(host_res.status_code, 200)
        self.assertEqual(host_res.data[0]["item_type"], "offer")


class FavouriteCleanerApiTests(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.host = User.objects.create_user(
            username="favhost",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.host)
        self.cleaner = User.objects.create_user(
            username="favcleaner",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.cleaner,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
            display_name="Fav Cleaner",
        )

    def test_host_can_favourite_list_and_remove_cleaner(self):
        self.api_client.force_authenticate(self.host)

        create_res = self.api_client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": self.cleaner.id},
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)
        fav_id = create_res.data["id"]
        self.assertEqual(create_res.data["cleaner"], self.cleaner.id)

        list_res = self.api_client.get("/api/marketplace/favourites/")
        rows = list_res.data["results"] if isinstance(list_res.data, dict) else list_res.data
        self.assertEqual(len(rows), 1)

        del_res = self.api_client.delete(f"/api/marketplace/favourites/{fav_id}/")
        self.assertEqual(del_res.status_code, 204)
        self.assertEqual(FavouriteCleaner.objects.filter(host=self.host).count(), 0)

    def test_favouriting_is_idempotent(self):
        self.api_client.force_authenticate(self.host)
        first = self.api_client.post(
            "/api/marketplace/favourites/", {"cleaner_id": self.cleaner.id}, format="json"
        )
        second = self.api_client.post(
            "/api/marketplace/favourites/", {"cleaner_id": self.cleaner.id}, format="json"
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(FavouriteCleaner.objects.filter(host=self.host).count(), 1)

    def test_cleaner_cannot_create_favourites(self):
        self.api_client.force_authenticate(self.cleaner)
        res = self.api_client.post(
            "/api/marketplace/favourites/", {"cleaner_id": self.cleaner.id}, format="json"
        )
        self.assertIn(res.status_code, (403, 400))
