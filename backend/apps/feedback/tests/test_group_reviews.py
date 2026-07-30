from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, HostProfile, User
from apps.feedback.models import Review, ReviewGroup
from apps.feedback.services import FeedbackError, revealed_received_reviews, submit_review
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property


class DelegatedAgencyReviewTests(TestCase):
    def setUp(self):
        self.host = self._user("host", User.Role.HOST); HostProfile.objects.create(user=self.host, city="Sofia")
        self.agency_user = self._user("agency", User.Role.AGENCY); self.agency = AgencyProfile.objects.create(user=self.agency_user, company_name="Agency", city="Sofia")
        self.member = self._user("member", User.Role.CLEANER); CleanerProfile.objects.create(user=self.member, display_name="Member", verification_status=CleanerProfile.VerificationStatus.VERIFIED)
        AgencyMembership.objects.create(agency=self.agency, cleaner=self.member, invited_by=self.agency_user, status=AgencyMembership.Status.ACTIVE)
        property_obj = Property.objects.create(host=self.host, name="Flat", city="Sofia")
        start = timezone.now() - timedelta(hours=2)
        self.job = create_cleaning_job_record(property=property_obj, host=self.host, title="Turnover", scheduled_start=start, scheduled_end=start + timedelta(hours=1), status=CleaningJob.Status.COMPLETED)
        application = CleanerApplication.objects.create(job=self.job, cleaner=self.agency_user, status=CleanerApplication.Status.ACCEPTED)
        Assignment.objects.create(job=self.job, cleaner=self.agency_user, assigned_member=self.member, application=application, completed_at=timezone.now())

    def _user(self, username, role):
        return User.objects.create_user(username=username, email=f"{username}@example.test", password="Password123!", role=role, account_status=User.AccountStatus.APPROVED, email_verified_at=timezone.now())

    def test_delegated_assignment_has_two_party_reviews_and_no_new_agency_group(self):
        host_review = submit_review(
            job=self.job, reviewer=self.host, reviewee=self.member, rating=5
        )
        member_review = submit_review(
            job=self.job, reviewer=self.member, reviewee=self.host, rating=4
        )

        self.assertFalse(ReviewGroup.objects.filter(job=self.job).exists())
        self.assertEqual(
            set(Review.objects.filter(job=self.job).values_list("reviewer_id", "reviewee_id")),
            {(self.host.id, self.member.id), (self.member.id, self.host.id)},
        )
        self.assertEqual(revealed_received_reviews(self.host).filter(job=self.job).count(), 1)
        self.assertEqual(host_review.reviewee_id, self.member.id)
        self.assertEqual(member_review.reviewee_id, self.host.id)

    def test_agency_cannot_participate_in_delegated_member_reviews(self):
        with self.assertRaises(FeedbackError):
            submit_review(
                job=self.job,
                reviewer=self.host,
                reviewee=self.agency_user,
                rating=5,
            )
        with self.assertRaises(FeedbackError):
            submit_review(
                job=self.job,
                reviewer=self.agency_user,
                reviewee=self.host,
                rating=5,
            )
