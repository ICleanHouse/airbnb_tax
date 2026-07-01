from datetime import timedelta
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import AgencyMembership, CleanerProfile, User
from apps.connections.models import Connection
from apps.core.models import AuditLog
from apps.feedback.models import Review
from apps.feedback.services import FeedbackError, refresh_cleaner_rating, submit_review
from apps.feedback.tests._review_test_utils import ReviewScenarioMixin
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.notifications.models import Notification


@override_settings(
    SENTRY_DSN="",
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
    EMAIL_NOTIF_HOST_JOB_COMPLETED=False,
)
class ReviewInvariantTests(ReviewScenarioMixin, TestCase):
    def setUp(self):
        self.host = self.create_host("host")
        self.cleaner = self.create_cleaner("cleaner")
        self.other_host = self.create_host("other-host")
        self.other_cleaner = self.create_cleaner("other-cleaner")
        self.property = self.create_property(self.host)
        self.job, self.assignment = self.create_job()

    def state_counts(self):
        self.cleaner.cleaner_profile.refresh_from_db()
        return {
            "reviews": Review.objects.count(),
            "notifications": Notification.objects.count(),
            "audits": AuditLog.objects.filter(action="review.submitted").count(),
            "average_rating": self.cleaner.cleaner_profile.average_rating,
            "rating_count": self.cleaner.cleaner_profile.completed_jobs_count,
        }

    def assert_state_unchanged(self, before):
        self.assertEqual(self.state_counts(), before)

    def test_host_duplicate_review_is_rejected_without_mutating_original_or_notifications(self):
        original = submit_review(
            job=self.job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=5,
            comment="Original public review.",
        )
        before = self.state_counts()

        response = self.api_post_review(
            self.host,
            job=self.job,
            reviewee=self.cleaner,
            rating=1,
            comment="Malicious retry should not overwrite.",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"detail": "You have already reviewed this job."})
        self.assert_no_sensitive_error_data(response, self.host, self.cleaner)
        self.assert_state_unchanged(before)
        original.refresh_from_db()
        self.assertEqual(original.rating, 5)
        self.assertEqual(original.comment, "Original public review.")

    def test_cleaner_duplicate_review_and_repeated_api_request_are_controlled(self):
        first = self.api_post_review(self.cleaner, job=self.job, reviewee=self.host, rating=4)
        before = self.state_counts()
        second = self.api_post_review(self.cleaner, job=self.job, reviewee=self.host, rating=2)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data, {"detail": "You have already reviewed this job."})
        self.assert_no_sensitive_error_data(second, self.host, self.cleaner)
        self.assert_state_unchanged(before)
        self.assertEqual(
            Review.objects.filter(job=self.job, reviewer=self.cleaner, reviewee=self.host).count(),
            1,
        )

    def test_database_unique_constraint_and_service_validation_agree(self):
        submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)

        with self.assertRaisesMessage(FeedbackError, "You have already reviewed this job."):
            submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=4)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Review.objects.create(
                    job=self.job,
                    reviewer=self.host,
                    reviewee=self.cleaner,
                    rating=3,
                )

    def test_database_race_integrity_error_is_returned_as_feedback_error(self):
        before = self.state_counts()

        with patch("apps.feedback.services.Review.objects.create", side_effect=IntegrityError("duplicate")):
            with self.assertRaisesMessage(FeedbackError, "You have already reviewed this job."):
                submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)

        self.assert_state_unchanged(before)

    def test_self_review_attempts_are_rejected_without_side_effects(self):
        cases = [
            ("host", self.host, self.host),
            ("cleaner", self.cleaner, self.cleaner),
        ]
        for label, reviewer, reviewee in cases:
            with self.subTest(label=label):
                before = self.state_counts()
                response = self.api_post_review(reviewer, job=self.job, reviewee=reviewee)

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data, {"detail": "Users cannot review themselves."})
                self.assert_no_sensitive_error_data(response, reviewer)
                self.assert_state_unchanged(before)

    def test_non_involved_users_and_relationships_alone_cannot_create_reviews(self):
        other_property = self.create_property(self.other_host, "Other Flat")
        other_property_host_job, _ = self.create_job(
            host=self.other_host,
            property=other_property,
            cleaner=self.other_cleaner,
        )
        withdrawn_application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.other_cleaner,
            status=CleanerApplication.Status.WITHDRAWN,
        )
        rejected_application = CleanerApplication.objects.create(
            job=other_property_host_job,
            cleaner=self.cleaner,
            status=CleanerApplication.Status.REJECTED,
        )
        Connection.objects.create(
            requester=self.other_host,
            addressee=self.cleaner,
            status=Connection.Status.ACCEPTED,
        )
        self.create_connection_or_favourite_context(self.host, self.other_cleaner)

        cases = [
            ("unrelated-host", self.other_host, self.cleaner, self.job),
            ("unrelated-cleaner", self.other_cleaner, self.host, self.job),
            ("host-from-other-property", self.other_host, self.cleaner, self.job),
            ("withdrawn-applicant", withdrawn_application.cleaner, self.host, self.job),
            ("rejected-applicant", rejected_application.cleaner, self.host, other_property_host_job),
            ("connection-only-host", self.other_host, self.cleaner, self.job),
            ("favourite-only-cleaner", self.other_cleaner, self.host, self.job),
        ]

        for label, reviewer, reviewee, job in cases:
            with self.subTest(label=label):
                before = self.state_counts()
                response = self.api_post_review(reviewer, job=job, reviewee=reviewee)

                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.data,
                    {"detail": "Only users involved in the job can review each other."},
                )
                self.assert_no_sensitive_error_data(response, reviewer, reviewee)
                self.assert_state_unchanged(before)

    def test_anonymous_users_cannot_create_reviews(self):
        response = self.api_post_review(None, job=self.job, reviewee=self.cleaner)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Review.objects.count(), 0)

    def test_non_involved_users_cannot_retrieve_private_review_details(self):
        review = submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)
        from rest_framework.test import APIClient

        api = APIClient()
        api.force_authenticate(self.other_host)

        response = api.get(f"/api/feedback/reviews/{review.id}/")

        self.assertEqual(response.status_code, 404)

    def test_only_consistent_completed_jobs_can_be_reviewed(self):
        incomplete_states = [
            CleaningJob.Status.DRAFT,
            CleaningJob.Status.OPEN,
            CleaningJob.Status.ASSIGNED,
            CleaningJob.Status.CANCELLED,
            CleaningJob.Status.DISPUTED,
        ]

        for status in incomplete_states:
            with self.subTest(status=status):
                job, _assignment = self.create_job(status=status, completed_at=None)
                before = self.state_counts()
                response = self.api_post_review(self.host, job=job, reviewee=self.cleaner)

                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.data,
                    {"detail": "Reviews are allowed only after the job is completed."},
                )
                self.assert_state_unchanged(before)

        inconsistent_job, _assignment = self.create_job(
            status=CleaningJob.Status.COMPLETED,
            completed_at=None,
            with_completion_timestamps=False,
        )
        before = self.state_counts()
        response = self.api_post_review(self.host, job=inconsistent_job, reviewee=self.cleaner)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"detail": "Reviewed job must have a completion timestamp."})
        self.assert_state_unchanged(before)

    def test_payload_date_manipulation_cannot_bypass_completion_or_window_checks(self):
        assigned_job, _ = self.create_job(status=CleaningJob.Status.ASSIGNED, completed_at=None)
        late_job, late_assignment = self.create_job(
            completed_at=timezone.now() - timedelta(days=15),
        )
        payload_overrides = {
            "created_at": timezone.now().isoformat(),
            "completed_at": timezone.now().isoformat(),
        }

        assigned_response = self.api_post_review(
            self.host,
            job=assigned_job,
            reviewee=self.cleaner,
            **payload_overrides,
        )
        late_response = self.api_post_review(
            self.host,
            job=late_job,
            reviewee=self.cleaner,
            **payload_overrides,
        )

        self.assertEqual(assigned_response.status_code, 400)
        self.assertEqual(late_response.status_code, 400)
        late_assignment.refresh_from_db()
        self.assertLess(late_assignment.completed_at, timezone.now() - timedelta(days=14))


@override_settings(
    SENTRY_DSN="",
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
)
class AgencyReviewParticipantTests(ReviewScenarioMixin, TestCase):
    def setUp(self):
        self.host = self.create_host("agency-host")
        self.property = self.create_property(self.host)
        self.agency_user, self.agency = self.create_agency("agency")
        self.member = self.create_cleaner("member")
        self.non_assigned_member = self.create_cleaner("non-assigned-member")
        self.former_member = self.create_cleaner("former-member")
        self.make_active_member(self.agency, self.member)
        self.make_active_member(self.agency, self.non_assigned_member)
        AgencyMembership.objects.create(
            agency=self.agency,
            cleaner=self.former_member,
            invited_by=self.agency_user,
            status=AgencyMembership.Status.REVOKED,
        )
        self.cleaner = self.member
        self.job, self.assignment = self.create_agency_job(assigned_member=self.member)

    def test_host_reviews_actual_assigned_member_for_agency_delegated_job(self):
        review = submit_review(job=self.job, reviewer=self.host, reviewee=self.member, rating=5)

        self.assertEqual(review.reviewee, self.member)

    def test_assigned_member_reviews_host_for_agency_delegated_job(self):
        review = submit_review(job=self.job, reviewer=self.member, reviewee=self.host, rating=4)

        self.assertEqual(review.reviewer, self.member)
        self.assertEqual(review.reviewee, self.host)

    def test_agency_account_is_not_review_participant_after_member_delegation(self):
        cases = [
            ("host-to-agency", self.host, self.agency_user),
            ("agency-to-host", self.agency_user, self.host),
        ]
        for label, reviewer, reviewee in cases:
            with self.subTest(label=label):
                with self.assertRaisesMessage(
                    FeedbackError,
                    "Only the host and assigned cleaner can review each other for this job.",
                ):
                    submit_review(job=self.job, reviewer=reviewer, reviewee=reviewee, rating=5)

    def test_agency_account_is_review_participant_before_member_delegation(self):
        undelegated_job, _assignment = self.create_agency_job(assigned_member=None)

        host_review = submit_review(
            job=undelegated_job,
            reviewer=self.host,
            reviewee=self.agency_user,
            rating=5,
        )
        agency_review = submit_review(
            job=undelegated_job,
            reviewer=self.agency_user,
            reviewee=self.host,
            rating=4,
        )

        self.assertEqual(host_review.reviewee, self.agency_user)
        self.assertEqual(agency_review.reviewer, self.agency_user)

    def test_non_assigned_and_former_members_are_denied(self):
        for member in [self.non_assigned_member, self.former_member]:
            with self.subTest(member=member.username):
                with self.assertRaises(FeedbackError):
                    submit_review(job=self.job, reviewer=member, reviewee=self.host, rating=5)
                with self.assertRaises(FeedbackError):
                    submit_review(job=self.job, reviewer=self.host, reviewee=member, rating=5)

        self.assertEqual(Review.objects.count(), 0)

    def test_manipulated_reviewee_id_cannot_target_agency_or_other_member(self):
        for reviewee in [self.agency_user, self.non_assigned_member, self.former_member, self.host]:
            with self.subTest(reviewee=reviewee.username):
                response = self.api_post_review(self.member, job=self.job, reviewee=reviewee)
                if reviewee == self.host:
                    self.assertEqual(response.status_code, 201)
                    Review.objects.all().delete()
                else:
                    self.assertEqual(response.status_code, 400)
                    self.assert_no_sensitive_error_data(response, self.member, reviewee)
