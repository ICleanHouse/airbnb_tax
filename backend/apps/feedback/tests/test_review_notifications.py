from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.feedback.models import Review
from apps.feedback.services import submit_review
from apps.feedback.tests._review_test_utils import ReviewScenarioMixin
from apps.notifications.models import Notification


@override_settings(
    SENTRY_DSN="",
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
)
class ReviewNotificationTests(ReviewScenarioMixin, TestCase):
    def setUp(self):
        self.host = self.create_host("notify-host")
        self.cleaner = self.create_cleaner("notify-cleaner")
        self.other_cleaner = self.create_cleaner("notify-other-cleaner")
        self.property = self.create_property(self.host)
        self.job, self.assignment = self.create_job()

    def test_first_valid_review_prompts_counterpart_and_remains_hidden(self):
        review = submit_review(
            job=self.job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=5,
            comment="Excellent turnover.",
        )

        notification = Notification.objects.get(notification_type="review.requested")
        self.assertEqual(notification.user, self.cleaner)
        self.assertEqual(notification.metadata, {"job_id": self.job.id, "reviewee_id": self.host.id})
        self.assertNotIn(str(review.rating), str(notification.metadata))
        self.assertNotIn(review.comment, notification.body)

    def test_second_valid_review_sends_unlock_notifications_to_both_parties(self):
        submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)
        before_requested = Notification.objects.filter(notification_type="review.requested").count()

        second = submit_review(job=self.job, reviewer=self.cleaner, reviewee=self.host, rating=4)

        unlocks = Notification.objects.filter(notification_type="review.submitted")
        self.assertEqual(unlocks.count(), 2)
        self.assertEqual(set(unlocks.values_list("user_id", flat=True)), {self.host.id, self.cleaner.id})
        self.assertEqual(
            Notification.objects.filter(notification_type="review.requested").count(),
            before_requested,
        )
        for notification in unlocks:
            self.assertEqual(notification.metadata, {"job_id": self.job.id, "review_id": second.id})
            self.assertNotIn("Clean and punctual", notification.body)

    def test_invalid_duplicate_self_late_and_non_involved_attempts_create_no_notifications(self):
        submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)
        before_duplicate = Notification.objects.count()
        duplicate = self.api_post_review(self.host, job=self.job, reviewee=self.cleaner)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(Notification.objects.count(), before_duplicate)

        before_self = Notification.objects.count()
        self_review = self.api_post_review(self.host, job=self.job, reviewee=self.host)
        self.assertEqual(self_review.status_code, 400)
        self.assertEqual(Notification.objects.count(), before_self)

        late_job, _ = self.create_job(completed_at=timezone.now() - timedelta(days=15))
        before_late = Notification.objects.count()
        late = self.api_post_review(self.host, job=late_job, reviewee=self.cleaner)
        self.assertEqual(late.status_code, 400)
        self.assertEqual(Notification.objects.count(), before_late)

        before_non_involved = Notification.objects.count()
        non_involved = self.api_post_review(self.other_cleaner, job=self.job, reviewee=self.host)
        self.assertEqual(non_involved.status_code, 400)
        self.assertEqual(Notification.objects.count(), before_non_involved)

    def test_private_issue_does_not_create_public_review_content_notifications(self):
        submit_review(
            job=self.job,
            reviewer=self.host,
            reviewee=self.cleaner,
            rating=1,
            comment="Visible issue summary",
            private_note="Sensitive door code",
            is_private_issue=True,
        )

        self.assertFalse(Notification.objects.filter(notification_type="review.requested").exists())

    def test_duplicate_unlock_attempt_does_not_duplicate_unlock_notifications(self):
        submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)
        submit_review(job=self.job, reviewer=self.cleaner, reviewee=self.host, rating=4)
        before = Notification.objects.filter(notification_type="review.submitted").count()

        response = self.api_post_review(self.cleaner, job=self.job, reviewee=self.host, rating=3)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Notification.objects.filter(notification_type="review.submitted").count(), before)
        self.assertEqual(Review.objects.filter(job=self.job).count(), 2)
