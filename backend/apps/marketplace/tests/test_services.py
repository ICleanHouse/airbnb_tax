from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, HostProfile, User
from apps.feedback.services import submit_review
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.marketplace.services import (
    MarketplaceError,
    accept_application,
    complete_job,
    publish_job,
    reject_application,
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
        self.job = create_cleaning_job_record(
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
        notification = Notification.objects.get(
            user=self.cleaner,
            notification_type="assignment.created",
        )
        self.assertNotIn(self.job.title, notification.body)

    def test_accept_application_rejects_applicant_deactivated_after_applying(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        User.objects.filter(pk=self.cleaner.pk).update(is_active=False)

        with self.assertRaisesMessage(MarketplaceError, "Cleaner account must be active."):
            accept_application(application=application, accepted_by=self.host)

        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=self.job).exists())

    def test_accept_application_rejects_applicant_suspended_after_applying(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        User.objects.filter(pk=self.cleaner.pk).update(
            account_status=User.AccountStatus.SUSPENDED
        )

        with self.assertRaisesMessage(MarketplaceError, "Cleaner account must be approved."):
            accept_application(application=application, accepted_by=self.host)

        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=self.job).exists())

    def test_accept_application_rejects_applicant_unverified_after_applying(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        CleanerProfile.objects.filter(user=self.cleaner).update(
            verification_status=CleanerProfile.VerificationStatus.PENDING
        )

        with self.assertRaisesMessage(
            MarketplaceError,
            "Cleaner marketplace access must be active.",
        ):
            accept_application(application=application, accepted_by=self.host)

        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=self.job).exists())

    def test_accept_application_rejects_applicant_profile_removed_after_applying(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        CleanerProfile.objects.filter(user=self.cleaner).delete()

        with self.assertRaisesMessage(MarketplaceError, "Cleaner profile is required."):
            accept_application(application=application, accepted_by=self.host)

        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=self.job).exists())

    def test_accept_application_refetches_current_host_approval(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        User.objects.filter(pk=self.host.pk).update(
            account_status=User.AccountStatus.SUSPENDED
        )

        with self.assertRaisesMessage(MarketplaceError, "Account must be approved"):
            accept_application(application=application, accepted_by=self.host)

        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=self.job).exists())

    def test_accept_application_rejects_job_whose_start_has_passed(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        self.move_job_to_past()

        with self.assertRaisesMessage(
            MarketplaceError,
            "scheduled start must be in the future",
        ):
            accept_application(application=application, accepted_by=self.host)

        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=self.job).exists())

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

    def test_publish_refetches_locked_state_and_enforces_current_actor(self):
        stale_job = CleaningJob.objects.get(pk=self.job.pk)
        CleaningJob.objects.filter(pk=self.job.pk).update(status=CleaningJob.Status.OPEN)

        with self.assertRaisesMessage(MarketplaceError, "Only draft jobs can be published"):
            publish_job(stale_job, actor=self.host)

        other_host = User.objects.create_user(
            username="other-host",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        CleaningJob.objects.filter(pk=self.job.pk).update(status=CleaningJob.Status.DRAFT)
        with self.assertRaisesMessage(MarketplaceError, "approved job host or admin"):
            publish_job(self.job, actor=other_host)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, CleaningJob.Status.DRAFT)

    def test_submit_application_refetches_current_job_and_host_state(self):
        publish_job(self.job, actor=self.host)
        stale_open_job = CleaningJob.objects.get(pk=self.job.pk)
        User.objects.filter(pk=self.host.pk).update(
            account_status=User.AccountStatus.SUSPENDED
        )

        with self.assertRaisesMessage(MarketplaceError, "not available for applications"):
            submit_application(job=stale_open_job, cleaner=self.cleaner)
        self.assertFalse(CleanerApplication.objects.filter(job=self.job).exists())

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

    def test_rejected_application_notification_does_not_disclose_job_free_text(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)

        reject_application(application=application, rejected_by=self.host)

        notification = Notification.objects.get(
            user=self.cleaner,
            notification_type="application.rejected",
        )
        self.assertNotIn(self.job.title, notification.body)

    def test_cleaner_completion_unlocks_reviews(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        assignment = accept_application(application=application, accepted_by=self.host)
        self.move_job_to_past()

        # The cleaner marking done completes the job — no host confirmation step.
        completed = complete_job(job=self.job, completed_by=self.cleaner)
        assignment.refresh_from_db()
        self.assertEqual(completed.status, CleaningJob.Status.COMPLETED)
        self.assertIsNotNone(assignment.completed_at)
        worker_notification = Notification.objects.get(
            user=self.cleaner,
            notification_type="review.requested",
        )
        self.assertNotIn(self.job.title, worker_notification.body)

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
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        accept_application(application=application, accepted_by=self.host)
        self.move_job_to_past()

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
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        assignment = accept_application(application=application, accepted_by=self.host)
        self.move_job_to_in_progress()

        completed = complete_job(job=self.job, completed_by=self.cleaner)
        assignment.refresh_from_db()

        self.assertEqual(completed.status, CleaningJob.Status.COMPLETED)
        self.assertIsNotNone(assignment.completed_at)
        # The host can't complete it (there is no host completion step).
        with self.assertRaisesMessage(MarketplaceError, "Only the assigned cleaner"):
            complete_job(job=self.job, completed_by=self.host)

    def test_admin_completion_marks_both_sides_complete(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner)
        assignment = accept_application(application=application, accepted_by=self.host)
        self.move_job_to_past()

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
