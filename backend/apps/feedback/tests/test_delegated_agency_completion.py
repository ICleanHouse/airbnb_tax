from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.feedback.models import Review, ReviewGroup
from apps.feedback.services import FeedbackError, submit_review
from apps.feedback.tests._review_test_utils import ReviewScenarioMixin
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.services import MarketplaceError, complete_job
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.notifications.models import Notification


@override_settings(
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
)
class DelegatedAgencyCompletionNotificationTests(ReviewScenarioMixin, TestCase):
    def setUp(self):
        self.host = self.create_host("delegated-completion-host")
        self.property = self.create_property(self.host, "Delegated completion flat")
        self.agency_user, self.agency = self.create_agency("delegated-completion-agency")
        self.member = self.create_cleaner("delegated-completion-member")
        self.other_member = self.create_cleaner("delegated-completion-other-member")
        self.make_active_member(self.agency, self.member)
        self.make_active_member(self.agency, self.other_member)
        start = timezone.now() - timedelta(hours=2)
        self.job = create_cleaning_job_record(
            property=self.property,
            host=self.host,
            title="Delegated completion turnover",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=1),
            status=CleaningJob.Status.ASSIGNED,
        )
        self.application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.agency_user,
            status=CleanerApplication.Status.ACCEPTED,
        )
        self.assignment = Assignment.objects.create(
            job=self.job,
            cleaner=self.agency_user,
            assigned_member=self.member,
            application=self.application,
        )

    def test_completion_creates_group_and_routes_review_requests_to_all_participants(self):
        self.job = complete_job(job=self.job, completed_by=self.member)

        self.job.refresh_from_db()
        self.assignment.refresh_from_db()
        self.assertEqual(self.job.status, CleaningJob.Status.COMPLETED)
        self.assertEqual(self.assignment.assigned_member_id, self.member.id)
        group = ReviewGroup.objects.get(job=self.job)
        self.assertEqual(group.participant_ids, (self.host.id, self.agency_user.id, self.member.id))
        requests = Notification.objects.filter(notification_type="review.group_requested")
        self.assertEqual(set(requests.values_list("user_id", flat=True)), {self.host.id, self.agency_user.id, self.member.id})
        self.assertEqual(requests.get(user=self.host).metadata, {"destination": f"/host?reviewJob={self.job.id}"})
        self.assertEqual(requests.get(user=self.agency_user).metadata, {"destination": f"/agency?reviewJob={self.job.id}"})
        self.assertEqual(requests.get(user=self.member).metadata, {"destination": f"/cleaner?reviewJob={self.job.id}"})

    def test_all_three_group_participants_can_submit_reviews_for_each_counterpart(self):
        self.job = complete_job(job=self.job, completed_by=self.member)
        review_pairs = (
            (self.host, self.agency_user), (self.host, self.member),
            (self.agency_user, self.host), (self.agency_user, self.member),
            (self.member, self.host), (self.member, self.agency_user),
        )
        for reviewer, reviewee in review_pairs:
            submit_review(job=self.job, reviewer=reviewer, reviewee=reviewee, rating=5)

        self.assertEqual(
            set(Review.objects.filter(job=self.job).values_list("reviewer_id", "reviewee_id")),
            {(reviewer.id, reviewee.id) for reviewer, reviewee in review_pairs},
        )
        for reviewer, reviewee in ((self.other_member, self.host),):
            with self.subTest(reviewer=reviewer.username, reviewee=reviewee.username):
                with self.assertRaises(FeedbackError):
                    submit_review(
                        job=self.job,
                        reviewer=reviewer,
                        reviewee=reviewee,
                        rating=5,
                    )

    def test_duplicate_completion_and_rollback_do_not_create_extra_review_notifications(self):
        with transaction.atomic():
            complete_job(job=self.job, completed_by=self.member)
            transaction.set_rollback(True)
        self.assertFalse(Notification.objects.filter(notification_type="review.requested").exists())
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, CleaningJob.Status.ASSIGNED)

        complete_job(job=self.job, completed_by=self.member)
        before = Notification.objects.filter(notification_type="review.requested").count()
        with self.assertRaises(MarketplaceError):
            complete_job(job=self.job, completed_by=self.member)
        self.assertEqual(
            Notification.objects.filter(notification_type="review.requested").count(),
            before,
        )
