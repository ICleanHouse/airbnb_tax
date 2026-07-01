from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AuditLog
from apps.feedback.models import Review
from apps.feedback.services import (
    REVIEW_WINDOW_DAYS,
    FeedbackError,
    refresh_cleaner_rating,
    revealed_received_reviews,
    submit_review,
)
from apps.feedback.tests._review_test_utils import ReviewScenarioMixin
from apps.marketplace.models import CleaningJob
from apps.notifications.models import Notification


@override_settings(
    SENTRY_DSN="",
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
)
class ReviewWindowTests(ReviewScenarioMixin, TestCase):
    def setUp(self):
        self.host = self.create_host("window-host")
        self.cleaner = self.create_cleaner("window-cleaner")
        self.property = self.create_property(self.host)

    def test_submission_window_boundary_is_deterministic_and_timezone_aware(self):
        base = timezone.now().replace(microsecond=0)
        self.assertTrue(timezone.is_aware(base))
        moments = [
            ("before", base + timedelta(days=REVIEW_WINDOW_DAYS) - timedelta(microseconds=1), 201),
            ("exact", base + timedelta(days=REVIEW_WINDOW_DAYS), 201),
            ("after", base + timedelta(days=REVIEW_WINDOW_DAYS, microseconds=1), 400),
        ]

        for label, now_value, expected_status in moments:
            with self.subTest(label=label):
                job, _assignment = self.create_job(completed_at=base)
                with patch("apps.feedback.services.timezone.now", return_value=now_value):
                    response = self.api_post_review(self.host, job=job, reviewee=self.cleaner)

                self.assertEqual(response.status_code, expected_status)
                if expected_status == 400:
                    self.assertEqual(
                        response.data,
                        {"detail": "The review window for this job has closed."},
                    )

    def test_visibility_window_uses_assignment_completed_at_not_payload_dates(self):
        completed_at = timezone.now() - timedelta(days=REVIEW_WINDOW_DAYS, seconds=1)
        job, assignment = self.create_job(completed_at=completed_at)
        Review.objects.create(
            job=job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=5,
            created_at=timezone.now(),
        )

        self.assertEqual(revealed_received_reviews(self.cleaner).count(), 1)
        assignment.completed_at = timezone.now() - timedelta(days=REVIEW_WINDOW_DAYS) + timedelta(seconds=1)
        assignment.save(update_fields=["completed_at", "updated_at"])

        self.assertEqual(revealed_received_reviews(self.cleaner).count(), 0)

    def test_single_review_hidden_until_counterpart_or_deadline_then_stays_revealed(self):
        completed_at = timezone.now() - timedelta(hours=1)
        job, assignment = self.create_job(completed_at=completed_at)
        host_review = submit_review(job=job, reviewer=self.host, reviewee=self.cleaner, rating=5)

        self.assertNotIn(host_review, list(revealed_received_reviews(self.cleaner)))
        submit_review(job=job, reviewer=self.cleaner, reviewee=self.host, rating=4)
        self.assertIn(host_review, list(revealed_received_reviews(self.cleaner)))

        late_job, late_assignment = self.create_job(completed_at=timezone.now() - timedelta(hours=1))
        late_host_review = submit_review(
            job=late_job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=5,
        )
        late_assignment.completed_at = timezone.now() - timedelta(days=REVIEW_WINDOW_DAYS, seconds=1)
        late_assignment.save(update_fields=["completed_at", "updated_at"])
        self.assertIn(late_host_review, list(revealed_received_reviews(self.cleaner)))

        with self.assertRaisesMessage(FeedbackError, "The review window for this job has closed."):
            submit_review(job=late_job, reviewer=self.cleaner, reviewee=self.host, rating=3)

        self.assertIn(late_host_review, list(revealed_received_reviews(self.cleaner)))


@override_settings(
    SENTRY_DSN="",
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
)
class PrivateIssueVisibilityTests(ReviewScenarioMixin, TestCase):
    def setUp(self):
        self.host = self.create_host("private-host")
        self.cleaner = self.create_cleaner("private-cleaner")
        self.admin = self.create_host("admin-reviewer")
        self.admin.role = self.admin.Role.ADMIN
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save()
        self.property = self.create_property(self.host)
        self.job, self.assignment = self.create_job()

    def test_private_issue_never_appears_in_public_or_received_review_lists(self):
        private = submit_review(
            job=self.job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=1,
            comment="Public summary should not be shown as a public review.",
            private_note="Sensitive issue: spare key location.",
            is_private_issue=True,
        )
        submit_review(job=self.job, reviewer=self.cleaner, reviewee=self.host, rating=5)

        self.assertNotIn(private, list(revealed_received_reviews(self.cleaner)))

        cleaner_client = APIClient()
        cleaner_client.force_authenticate(self.cleaner)
        list_response = cleaner_client.get("/api/feedback/reviews/")
        self.assertEqual(list_response.status_code, 200)
        self.assertNotIn(private.id, [row["id"] for row in list_response.data])

        public_response = APIClient().get(
            f"/api/accounts/public-cleaners/{self.cleaner.cleaner_profile.id}/"
        )
        self.assertEqual(public_response.status_code, 200)
        rendered_public = str(public_response.data)
        self.assertNotIn("spare key", rendered_public)
        self.assertEqual(public_response.data["reviews"], [])

    def test_private_issues_do_not_affect_cleaner_rating_or_count(self):
        submit_review(
            job=self.job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=1,
            private_note="Internal-only complaint.",
            is_private_issue=True,
        )
        submit_review(job=self.job, reviewer=self.cleaner, reviewee=self.host, rating=5)
        refresh_cleaner_rating(self.cleaner)

        self.cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(self.cleaner.cleaner_profile.average_rating, Decimal("0.00"))

    def test_normal_users_do_not_receive_private_fields_from_serializer(self):
        response = self.api_post_review(
            self.host,
            job=self.job,
            reviewee=self.cleaner,
            rating=2,
            comment="Issue reported privately.",
            private_note="Door code was 1234.",
            is_private_issue=True,
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("private_note", response.data)
        self.assertNotIn("is_private_issue", response.data)
        self.assertNotIn("1234", str(response.data))

        host_client = APIClient()
        host_client.force_authenticate(self.host)
        own_list = host_client.get("/api/feedback/reviews/")
        self.assertEqual(own_list.status_code, 200)
        self.assertNotIn("private_note", str(own_list.data))
        self.assertNotIn("is_private_issue", str(own_list.data))

    def test_admin_visibility_for_private_issues_is_explicit(self):
        review = Review.objects.create(
            job=self.job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=1,
            comment="Needs moderation.",
            private_note="Sensitive moderation note.",
            is_private_issue=True,
        )
        admin_client = APIClient()
        admin_client.force_authenticate(self.admin)

        response = admin_client.get(f"/api/feedback/reviews/{review.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["private_note"], "Sensitive moderation note.")
        self.assertTrue(response.data["is_private_issue"])


@override_settings(
    SENTRY_DSN="",
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
)
class RatingRecalculationTests(ReviewScenarioMixin, TestCase):
    def setUp(self):
        self.host = self.create_host("rating-host")
        self.cleaner = self.create_cleaner("rating-cleaner")
        self.property = self.create_property(self.host)

    def test_ratings_include_only_revealed_public_reviews_with_stable_average(self):
        first_job, _ = self.create_job()
        second_job, second_assignment = self.create_job(completed_at=timezone.now() - timedelta(hours=1))
        private_job, _ = self.create_job()

        submit_review(job=first_job, reviewer=self.host, reviewee=self.cleaner, rating=5)
        refresh_cleaner_rating(self.cleaner)
        self.cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(self.cleaner.cleaner_profile.average_rating, Decimal("0.00"))

        submit_review(job=first_job, reviewer=self.cleaner, reviewee=self.host, rating=4)
        refresh_cleaner_rating(self.cleaner)
        self.cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(self.cleaner.cleaner_profile.average_rating, Decimal("5.00"))

        Review.objects.create(job=second_job, reviewer=self.host, reviewee=self.cleaner, rating=3)
        second_assignment.completed_at = timezone.now() - timedelta(days=REVIEW_WINDOW_DAYS, seconds=1)
        second_assignment.save(update_fields=["completed_at", "updated_at"])
        refresh_cleaner_rating(self.cleaner)
        self.cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(self.cleaner.cleaner_profile.average_rating, Decimal("4.00"))

        submit_review(
            job=private_job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=1,
            is_private_issue=True,
        )
        submit_review(job=private_job, reviewer=self.cleaner, reviewee=self.host, rating=5)
        refresh_cleaner_rating(self.cleaner)
        self.cleaner.cleaner_profile.refresh_from_db()

        self.assertEqual(self.cleaner.cleaner_profile.average_rating, Decimal("4.00"))
        self.assertEqual(self.cleaner.cleaner_profile.completed_jobs_count, 3)
