from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, HostProfile, User
from apps.feedback.models import Review, ReviewGroup
from apps.feedback.services import FeedbackError, revealed_received_reviews, submit_review
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.services import complete_job
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.notifications.models import Notification
from apps.properties.models import Property


class DelegatedAgencyReviewTests(TestCase):
    def setUp(self):
        self.host = self._user("host", User.Role.HOST); HostProfile.objects.create(user=self.host, city="Sofia")
        self.agency_user = self._user("agency", User.Role.AGENCY); self.agency = AgencyProfile.objects.create(user=self.agency_user, company_name="Agency", city="Sofia")
        self.member = self._user("member", User.Role.CLEANER); CleanerProfile.objects.create(user=self.member, display_name="Member", verification_status=CleanerProfile.VerificationStatus.VERIFIED)
        AgencyMembership.objects.create(agency=self.agency, cleaner=self.member, invited_by=self.agency_user, status=AgencyMembership.Status.ACTIVE)
        property_obj = Property.objects.create(host=self.host, name="Flat", city="Sofia")
        start = timezone.now() - timedelta(hours=2)
        self.job = create_cleaning_job_record(property=property_obj, host=self.host, title="Turnover", scheduled_start=start, scheduled_end=start + timedelta(hours=1), status=CleaningJob.Status.ASSIGNED)
        application = CleanerApplication.objects.create(job=self.job, cleaner=self.agency_user, status=CleanerApplication.Status.ACCEPTED)
        Assignment.objects.create(job=self.job, cleaner=self.agency_user, assigned_member=self.member, application=application)
        self.job = complete_job(job=self.job, completed_by=self.member)

    def _user(self, username, role):
        return User.objects.create_user(username=username, email=f"{username}@example.test", password="Password123!", role=role, account_status=User.AccountStatus.APPROVED, email_verified_at=timezone.now())

    def test_delegated_assignment_has_an_immutable_three_party_review_group(self):
        group = ReviewGroup.objects.get(job=self.job)
        self.assertEqual(group.participant_ids, (self.host.id, self.agency_user.id, self.member.id))

        for rating, (reviewer, reviewee) in enumerate(
            (
                (self.host, self.agency_user),
                (self.host, self.member),
                (self.agency_user, self.host),
                (self.agency_user, self.member),
                (self.member, self.host),
                (self.member, self.agency_user),
            ),
            start=1,
        ):
            submit_review(job=self.job, reviewer=reviewer, reviewee=reviewee, rating=(rating % 5) + 1)

        self.assertEqual(
            set(Review.objects.filter(job=self.job).values_list("reviewer_id", "reviewee_id")),
            {
                (self.host.id, self.agency_user.id), (self.host.id, self.member.id),
                (self.agency_user.id, self.host.id), (self.agency_user.id, self.member.id),
                (self.member.id, self.host.id), (self.member.id, self.agency_user.id),
            },
        )
        self.assertEqual(Review.objects.filter(job=self.job, group=group).count(), 6)
        self.assertEqual(revealed_received_reviews(self.host).filter(job=self.job).count(), 2)
        self.assertEqual(
            set(
                Notification.objects.filter(notification_type="review.group_revealed").values_list(
                    "user_id", flat=True
                )
            ),
            {self.host.id, self.agency_user.id, self.member.id},
        )
        self.member.cleaner_profile.refresh_from_db()
        self.assertEqual(self.member.cleaner_profile.average_rating, 0)

    def test_only_the_three_immutable_group_participants_can_review(self):
        outsider = self._user("outsider", User.Role.CLEANER)
        with self.assertRaises(FeedbackError):
            submit_review(job=self.job, reviewer=outsider, reviewee=self.host, rating=5)
