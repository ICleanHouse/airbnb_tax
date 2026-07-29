from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, HostProfile, User
from apps.marketplace.models import Assignment, AssignmentReleaseRequest, CleanerApplication, CleaningJob
from apps.marketplace.services import LifecycleConflict, create_assignment_release_request, resolve_assignment_release_request
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property


@override_settings(AGENCY_LIVE_RECOVERY_ENABLED=True, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AssignmentReleaseRequestTests(TestCase):
    def setUp(self):
        self.host = self._user("host", User.Role.HOST)
        HostProfile.objects.create(user=self.host, city="Sofia")
        self.agency_user = self._user("agency", User.Role.AGENCY)
        self.agency = AgencyProfile.objects.create(user=self.agency_user, company_name="Agency", city="Sofia")
        self.member = self._user("member", User.Role.CLEANER)
        CleanerProfile.objects.create(user=self.member, display_name="Member", verification_status=CleanerProfile.VerificationStatus.VERIFIED)
        AgencyMembership.objects.create(agency=self.agency, cleaner=self.member, invited_by=self.agency_user, status=AgencyMembership.Status.ACTIVE)
        property_obj = Property.objects.create(host=self.host, name="Flat", city="Sofia")
        start = timezone.now() + timedelta(days=2)
        self.job = create_cleaning_job_record(property=property_obj, host=self.host, title="Turnover", scheduled_start=start, scheduled_end=start + timedelta(hours=2), status=CleaningJob.Status.ASSIGNED)
        application = CleanerApplication.objects.create(job=self.job, cleaner=self.agency_user, status=CleanerApplication.Status.ACCEPTED)
        self.assignment = Assignment.objects.create(job=self.job, cleaner=self.agency_user, assigned_member=self.member, application=application)

    def _user(self, username, role):
        return User.objects.create_user(username=username, email=f"{username}@example.test", password="Password123!", role=role, account_status=User.AccountStatus.APPROVED, email_verified_at=timezone.now())

    def test_member_creates_one_append_only_pending_request_and_agency_can_decline(self):
        release = create_assignment_release_request(assignment=self.assignment, member=self.member, reason_code="unavailable", narrative="Cannot attend")
        self.assertEqual(release.status, AssignmentReleaseRequest.Status.PENDING)
        self.assertEqual(release.member_id, self.member.id)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.assigned_member_id, self.member.id)
        with self.assertRaises(LifecycleConflict):
            create_assignment_release_request(assignment=self.assignment, member=self.member, reason_code="unavailable", narrative="Duplicate")
        resolved = resolve_assignment_release_request(release=release, agency=self.agency_user, resolution="decline")
        self.assertEqual(resolved.status, AssignmentReleaseRequest.Status.DECLINED)

    @override_settings(AGENCY_LIVE_RECOVERY_ENABLED=False)
    def test_fail_closed_flag_blocks_release_before_mutation(self):
        with self.assertRaises(LifecycleConflict) as blocked:
            create_assignment_release_request(assignment=self.assignment, member=self.member, reason_code="unavailable", narrative="Cannot attend")
        self.assertEqual(blocked.exception.code, "agency_live_recovery_disabled")
        self.assertFalse(AssignmentReleaseRequest.objects.exists())
