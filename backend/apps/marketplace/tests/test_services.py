from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, HostProfile, User
from apps.feedback.services import FeedbackError, submit_review
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.services import (
    MarketplaceError,
    accept_application,
    complete_job,
    publish_job,
    submit_application,
    withdraw_application,
)
from apps.notifications.models import Notification
from apps.properties.models import Property


class MarketplaceServiceTests(TestCase):
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
        self.admin = User.objects.create_user(
            username="admin",
            password="password123",
            role=User.Role.ADMIN,
            account_status=User.AccountStatus.APPROVED,
            is_staff=True,
        )
        self.property = Property.objects.create(
            host=self.host,
            name="Center Apartment",
            city="Sofia",
            cleaning_instructions="Change linens and restock basics.",
        )
        self.job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Turnover cleaning",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
            proposed_price=Decimal("45.00"),
        )

    def move_job_to_past(self):
        self.job.scheduled_start = timezone.now() - timedelta(hours=3)
        self.job.scheduled_end = timezone.now() - timedelta(hours=1)
        self.job.save(update_fields=["scheduled_start", "scheduled_end", "updated_at"])

    def move_job_to_in_progress(self):
        self.job.scheduled_start = timezone.now() - timedelta(hours=1)
        self.job.scheduled_end = timezone.now() + timedelta(hours=1)
        self.job.save(update_fields=["scheduled_start", "scheduled_end", "updated_at"])

    def test_verified_cleaner_can_apply_and_host_can_accept(self):
        publish_job(self.job)

        application = submit_application(
            job=self.job,
            cleaner=self.cleaner,
            proposed_price=Decimal("50.00"),
            message="Available for this turnover.",
        )
        assignment = accept_application(
            application=application,
            accepted_by=self.host,
            agreed_price=Decimal("50.00"),
        )

        self.job.refresh_from_db()
        application.refresh_from_db()

        self.assertEqual(application.status, CleanerApplication.Status.ACCEPTED)
        self.assertEqual(self.job.status, CleaningJob.Status.ASSIGNED)
        self.assertEqual(assignment.cleaner, self.cleaner)
        self.assertEqual(Assignment.objects.count(), 1)
        self.assertEqual(Notification.objects.filter(user=self.cleaner).count(), 1)

    def test_host_cannot_create_duplicate_job_for_same_property_and_time(self):
        self.api_client.force_authenticate(self.host)
        payload = {
            "property_id": self.property.id,
            "title": "Duplicate turnover",
            "scheduled_start": self.job.scheduled_start.isoformat(),
            "scheduled_end": self.job.scheduled_end.isoformat(),
            "proposed_price": "45.00",
        }

        response = self.api_client.post("/api/marketplace/jobs/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("scheduled_start", response.data)
        self.assertEqual(CleaningJob.objects.filter(property=self.property).count(), 1)

    def test_unverified_cleaner_cannot_apply(self):
        unverified = User.objects.create_user(
            username="unverified",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(user=unverified)
        publish_job(self.job)

        with self.assertRaises(MarketplaceError):
            submit_application(job=self.job, cleaner=unverified)

    def test_cleaner_can_withdraw_pending_application(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)

        withdrawn = withdraw_application(application=application, withdrawn_by=self.cleaner)

        self.assertEqual(withdrawn.status, CleanerApplication.Status.WITHDRAWN)
        self.assertEqual(Notification.objects.filter(user=self.host, notification_type="application.withdrawn").count(), 1)

    def test_cleaner_can_withdraw_application_through_api(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        self.api_client.force_authenticate(self.cleaner)

        response = self.api_client.post(f"/api/marketplace/applications/{application.id}/withdraw/")

        application.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], CleanerApplication.Status.WITHDRAWN)
        self.assertEqual(application.status, CleanerApplication.Status.WITHDRAWN)

    def test_cleaner_completion_unlocks_reviews(self):
        self.move_job_to_past()
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        assignment = accept_application(application=application, accepted_by=self.host)

        # The cleaner marking done completes the job — no host confirmation step.
        completed = complete_job(job=self.job, completed_by=self.cleaner)
        assignment.refresh_from_db()
        self.assertEqual(completed.status, CleaningJob.Status.COMPLETED)
        self.assertIsNotNone(assignment.completed_at)

        # Host can review right away. Rating stays hidden until the cleaner also
        # reviews (double-blind), so it remains 0 after just the host's review.
        submit_review(
            job=completed, reviewer=self.host, reviewee=self.cleaner,
            rating=5, comment="Reliable and on time.",
        )
        self.cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(self.cleaner.cleaner_profile.average_rating, 0)

        # Once the cleaner also reviews, the pair is revealed and the rating updates.
        submit_review(
            job=completed, reviewer=self.cleaner, reviewee=self.host,
            rating=5, comment="Clear instructions.",
        )
        self.cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(self.cleaner.cleaner_profile.average_rating, 5)

    def test_cleaner_cannot_mark_completion_twice(self):
        self.move_job_to_past()
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        accept_application(application=application, accepted_by=self.host)

        complete_job(job=self.job, completed_by=self.cleaner)

        with self.assertRaises(MarketplaceError):
            complete_job(job=self.job, completed_by=self.cleaner)

    def test_future_job_cannot_be_marked_complete_before_start(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        accept_application(application=application, accepted_by=self.host)

        with self.assertRaisesMessage(MarketplaceError, "scheduled start time has passed"):
            complete_job(job=self.job, completed_by=self.cleaner)

        # The host no longer has a completion step — only the cleaner can.
        with self.assertRaisesMessage(MarketplaceError, "Only the assigned cleaner"):
            complete_job(job=self.job, completed_by=self.host)

    def test_cleaner_can_mark_in_progress_job_done(self):
        self.move_job_to_in_progress()
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        assignment = accept_application(application=application, accepted_by=self.host)

        completed = complete_job(job=self.job, completed_by=self.cleaner)
        assignment.refresh_from_db()

        self.assertEqual(completed.status, CleaningJob.Status.COMPLETED)
        self.assertIsNotNone(assignment.completed_at)
        # The host can't complete it (there is no host completion step).
        with self.assertRaisesMessage(MarketplaceError, "Only the assigned cleaner"):
            complete_job(job=self.job, completed_by=self.host)

    def test_admin_completion_marks_both_sides_complete(self):
        self.move_job_to_past()
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        assignment = accept_application(application=application, accepted_by=self.host)

        completed = complete_job(job=self.job, completed_by=self.admin)
        assignment.refresh_from_db()

        self.assertEqual(completed.status, CleaningJob.Status.COMPLETED)
        self.assertIsNotNone(assignment.host_completed_at)
        self.assertIsNotNone(assignment.cleaner_completed_at)
        self.assertIsNotNone(assignment.completed_at)

    def test_cleaner_calendar_tracks_open_application_and_assignment_states(self):
        publish_job(self.job)
        self.api_client.force_authenticate(self.cleaner)
        params = {
            "start": (timezone.now() - timedelta(days=1)).isoformat(),
            "end": (timezone.now() + timedelta(days=3)).isoformat(),
        }

        open_response = self.api_client.get("/api/marketplace/calendar/", params)
        self.assertEqual(open_response.status_code, 200)
        self.assertEqual(open_response.data[0]["item_type"], "open_job")
        self.assertTrue(open_response.data[0]["can_apply"])

        application = submit_application(job=self.job, cleaner=self.cleaner)
        application_response = self.api_client.get("/api/marketplace/calendar/", params)
        self.assertEqual(application_response.status_code, 200)
        self.assertEqual(application_response.data[0]["item_type"], "application")
        self.assertEqual(application_response.data[0]["application"], application.id)

        withdraw_application(application=application, withdrawn_by=self.cleaner)
        withdrawn_response = self.api_client.get("/api/marketplace/calendar/", params)
        self.assertEqual(withdrawn_response.status_code, 200)
        self.assertEqual(withdrawn_response.data[0]["item_type"], "open_job")
        self.assertTrue(withdrawn_response.data[0]["can_apply"])

        application = submit_application(job=self.job, cleaner=self.cleaner)
        assignment = accept_application(application=application, accepted_by=self.host)
        assignment_response = self.api_client.get("/api/marketplace/calendar/", params)
        self.assertEqual(assignment_response.status_code, 200)
        self.assertEqual(assignment_response.data[0]["item_type"], "assignment")
        self.assertEqual(assignment_response.data[0]["assignment"], assignment.id)
        self.assertFalse(assignment_response.data[0]["can_complete"])

        self.job.scheduled_start = timezone.now() - timedelta(hours=1)
        self.job.scheduled_end = timezone.now() + timedelta(hours=1)
        self.job.save(update_fields=["scheduled_start", "scheduled_end", "updated_at"])
        in_progress_response = self.api_client.get("/api/marketplace/calendar/", params)
        self.assertEqual(in_progress_response.status_code, 200)
        self.assertEqual(in_progress_response.data[0]["item_type"], "assignment")
        self.assertTrue(in_progress_response.data[0]["can_complete"])

        self.job.scheduled_start = timezone.now() - timedelta(hours=3)
        self.job.scheduled_end = timezone.now() - timedelta(hours=1)
        self.job.save(update_fields=["scheduled_start", "scheduled_end", "updated_at"])
        past_params = {
            "start": (timezone.now() - timedelta(days=1)).isoformat(),
            "end": (timezone.now() + timedelta(days=1)).isoformat(),
        }
        past_assignment_response = self.api_client.get("/api/marketplace/calendar/", past_params)
        self.assertEqual(past_assignment_response.status_code, 200)
        self.assertEqual(past_assignment_response.data[0]["item_type"], "assignment")
        self.assertTrue(past_assignment_response.data[0]["can_complete"])
