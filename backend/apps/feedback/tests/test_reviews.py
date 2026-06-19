from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, HostProfile, User
from apps.feedback.models import Review
from apps.feedback.services import (
    FeedbackError,
    refresh_cleaner_rating,
    revealed_received_reviews,
    submit_review,
)
from apps.marketplace.models import Assignment, CleaningJob
from apps.marketplace.services import MarketplaceError, complete_job
from apps.properties.models import Property


class ReviewFlowTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.host = User.objects.create_user(
            username="host", password="pw", role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.host)
        self.cleaner = User.objects.create_user(
            username="cleaner", password="pw", role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.cleaner, display_name="Cleaner One",
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        self.property = Property.objects.create(host=self.host, name="Flat", city="Sofia")
        self.job = CleaningJob.objects.create(
            property=self.property, host=self.host, title="Turnover",
            scheduled_start=timezone.now() - timedelta(hours=2),
            scheduled_end=timezone.now() - timedelta(hours=1),
            proposed_price=Decimal("40.00"),
            status=CleaningJob.Status.ASSIGNED,
        )
        self.assignment = Assignment.objects.create(job=self.job, cleaner=self.cleaner)

    # ── Completion ────────────────────────────────────────────────────────
    def test_cleaner_completion_completes_job(self):
        complete_job(job=self.job, completed_by=self.cleaner)
        self.job.refresh_from_db()
        self.assignment.refresh_from_db()
        self.assertEqual(self.job.status, CleaningJob.Status.COMPLETED)
        self.assertIsNotNone(self.assignment.completed_at)

    def test_host_cannot_mark_job_done(self):
        with self.assertRaises(MarketplaceError):
            complete_job(job=self.job, completed_by=self.host)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, CleaningJob.Status.ASSIGNED)

    # ── Review gating ─────────────────────────────────────────────────────
    def test_review_requires_completion(self):
        with self.assertRaises(FeedbackError):
            submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)

    def test_review_allowed_after_cleaner_completes(self):
        complete_job(job=self.job, completed_by=self.cleaner)
        self.job.refresh_from_db()
        review = submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)
        self.assertEqual(review.rating, 5)

    # ── Double-blind visibility ───────────────────────────────────────────
    def test_received_review_hidden_until_both_submit(self):
        complete_job(job=self.job, completed_by=self.cleaner)
        self.job.refresh_from_db()
        # Host reviews the cleaner; cleaner has not reviewed yet.
        submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)

        # Cleaner cannot yet see the review about them via the API.
        self.api.force_authenticate(self.cleaner)
        res = self.api.get("/api/feedback/reviews/")
        ids = [r["id"] for r in res.json()]
        received = Review.objects.get(reviewer=self.host, reviewee=self.cleaner)
        self.assertNotIn(received.id, ids)
        self.assertEqual(revealed_received_reviews(self.cleaner).count(), 0)

        # Once the cleaner also reviews the host, both are revealed.
        submit_review(job=self.job, reviewer=self.cleaner, reviewee=self.host, rating=4)
        res = self.api.get("/api/feedback/reviews/")
        ids = [r["id"] for r in res.json()]
        self.assertIn(received.id, ids)
        self.assertEqual(revealed_received_reviews(self.cleaner).count(), 1)

    def test_review_window_deadline_reveals_single_review(self):
        # Simulate a job completed 15 days ago (window closed) with only the
        # host's review submitted.
        self.job.status = CleaningJob.Status.COMPLETED
        self.job.save(update_fields=["status"])
        self.assignment.completed_at = timezone.now() - timedelta(days=15)
        self.assignment.cleaner_completed_at = self.assignment.completed_at
        self.assignment.host_completed_at = self.assignment.completed_at
        self.assignment.save()
        Review.objects.create(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)

        self.assertEqual(revealed_received_reviews(self.cleaner).count(), 1)

    # ── Rating reflects only revealed reviews ─────────────────────────────
    def test_rating_counts_only_revealed_reviews(self):
        complete_job(job=self.job, completed_by=self.cleaner)
        self.job.refresh_from_db()

        submit_review(job=self.job, reviewer=self.host, reviewee=self.cleaner, rating=5)
        self.cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(self.cleaner.cleaner_profile.average_rating, Decimal("0.00"))

        submit_review(job=self.job, reviewer=self.cleaner, reviewee=self.host, rating=4)
        refresh_cleaner_rating(self.cleaner)
        self.cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(self.cleaner.cleaner_profile.average_rating, Decimal("5.00"))
