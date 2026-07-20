from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, HostProfile, User
from apps.core.models import AuditLog
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.marketplace.services import MarketplaceError, accept_application, assign_member_to_assignment
from apps.notifications.models import Notification
from apps.properties.models import Property


@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class AgencyDelegationContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.job_counter = 0
        self.host = self.create_host("host")
        self.other_host = self.create_host("other-host")
        self.property = Property.objects.create(host=self.host, name="Central Flat", city="Sofia")
        self.agency_user, self.agency = self.create_agency("agency")
        self.agency.company_name = "PRIVATE_AGENCY_NAME_SENTINEL"
        self.agency.save(update_fields=["company_name"])
        self.other_agency_user, self.other_agency = self.create_agency("other-agency")
        self.member = self.create_cleaner("member-one")
        self.replacement = self.create_cleaner("member-two")
        self.unrelated_cleaner = self.create_cleaner("unrelated-cleaner")
        AgencyMembership.objects.create(
            agency=self.agency,
            cleaner=self.member,
            invited_by=self.agency_user,
            status=AgencyMembership.Status.ACTIVE,
        )
        AgencyMembership.objects.create(
            agency=self.agency,
            cleaner=self.replacement,
            invited_by=self.agency_user,
            status=AgencyMembership.Status.ACTIVE,
        )
        AgencyMembership.objects.create(
            agency=self.other_agency,
            cleaner=self.replacement,
            invited_by=self.other_agency_user,
            status=AgencyMembership.Status.ACTIVE,
        )
        self.assignment = self.create_accepted_agency_assignment()

    def create_host(self, username, *, status=User.AccountStatus.APPROVED):
        host = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=status,
        )
        HostProfile.objects.create(user=host, city="Sofia")
        return host

    def create_cleaner(
        self,
        username,
        *,
        status=User.AccountStatus.APPROVED,
        verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        is_active=True,
        with_profile=True,
    ):
        cleaner = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=status,
            is_active=is_active,
        )
        if with_profile:
            CleanerProfile.objects.create(
                user=cleaner,
                display_name=username,
                verification_status=verification_status,
            )
        return cleaner

    def create_agency(self, username, *, status=User.AccountStatus.APPROVED):
        agency_user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=status,
        )
        agency = AgencyProfile.objects.create(user=agency_user, company_name=username, city="Sofia")
        return agency_user, agency

    def create_accepted_agency_assignment(self):
        self.job_counter += 1
        start = timezone.now().replace(microsecond=0) + timedelta(days=self.job_counter)
        job = create_cleaning_job_record(
            property=self.property,
            host=self.host,
            title=f"Agency turnover {self.job_counter}",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            proposed_price=Decimal("45.00"),
            status=CleaningJob.Status.OPEN,
        )
        application = CleanerApplication.objects.create(
            job=job,
            cleaner=self.agency_user,
            status=CleanerApplication.Status.PENDING,
        )
        return accept_application(application=application, accepted_by=self.host)

    def assignment_effect_counts(self):
        return {
            "notifications": Notification.objects.filter(
                notification_type="agency.assignment.created",
                metadata__assignment_id=self.assignment.id,
            ).count(),
            "audits": AuditLog.objects.filter(
                action="assignment.member_assigned",
                entity_type="Assignment",
                entity_id=str(self.assignment.id),
            ).count(),
        }

    def assert_assignment_unchanged(self, *, assigned_member):
        self.assignment.refresh_from_db()
        self.assignment.job.refresh_from_db()
        self.assignment.application.refresh_from_db()
        self.assertEqual(self.assignment.assigned_member_id, assigned_member.id)
        self.assertEqual(self.assignment.job.status, CleaningJob.Status.ASSIGNED)
        self.assertEqual(self.assignment.application.status, CleanerApplication.Status.ACCEPTED)
        self.assertEqual(Assignment.objects.filter(job=self.assignment.job).count(), 1)
        self.assertEqual(
            Assignment.objects.filter(id=self.assignment.id, assigned_member=assigned_member).count(),
            1,
        )

    def test_agency_can_delegate_then_repeat_same_member_without_duplicate_side_effects(self):
        assigned = assign_member_to_assignment(
            assignment=self.assignment,
            agency_user=self.agency_user,
            member=self.member,
        )
        self.assertEqual(assigned.assigned_member_id, self.member.id)
        notification = Notification.objects.get(
            user=self.member,
            notification_type="agency.assignment.created",
        )
        self.assertNotIn(self.agency.company_name, notification.body)
        self.assertNotIn(self.assignment.job.title, notification.body)
        first_counts = self.assignment_effect_counts()

        repeated = assign_member_to_assignment(
            assignment=self.assignment,
            agency_user=self.agency_user,
            member=self.member,
        )

        self.assertEqual(repeated.assigned_member_id, self.member.id)
        self.assert_assignment_unchanged(assigned_member=self.member)
        self.assertEqual(self.assignment_effect_counts(), first_counts)

    def test_different_member_replacement_is_rejected_and_state_remains_unchanged(self):
        assign_member_to_assignment(
            assignment=self.assignment,
            agency_user=self.agency_user,
            member=self.member,
        )
        first_counts = self.assignment_effect_counts()

        with self.assertRaisesMessage(
            MarketplaceError,
            "Assignment has already been delegated to a cleaner member.",
        ):
            assign_member_to_assignment(
                assignment=self.assignment,
                agency_user=self.agency_user,
                member=self.replacement,
            )

        self.assert_assignment_unchanged(assigned_member=self.member)
        self.assertEqual(self.assignment_effect_counts(), first_counts)

    def test_stale_sequential_replacement_attempt_cannot_change_member(self):
        stale_assignment = Assignment.objects.get(id=self.assignment.id)
        assign_member_to_assignment(
            assignment=self.assignment,
            agency_user=self.agency_user,
            member=self.member,
        )
        first_counts = self.assignment_effect_counts()

        with self.assertRaises(MarketplaceError):
            assign_member_to_assignment(
                assignment=stale_assignment,
                agency_user=self.agency_user,
                member=self.replacement,
            )

        self.assert_assignment_unchanged(assigned_member=self.member)
        self.assertEqual(self.assignment_effect_counts(), first_counts)

    def test_replacement_with_invalid_or_unavailable_member_is_rejected_without_mutation(self):
        assign_member_to_assignment(
            assignment=self.assignment,
            agency_user=self.agency_user,
            member=self.member,
        )
        first_counts = self.assignment_effect_counts()
        invalid_members = [
            ("pending", self.create_cleaner("pending", status=User.AccountStatus.PENDING)),
            ("rejected", self.create_cleaner("rejected", status=User.AccountStatus.REJECTED)),
            ("suspended", self.create_cleaner("suspended", status=User.AccountStatus.SUSPENDED)),
            ("inactive", self.create_cleaner("inactive", is_active=False)),
            (
                "unverified",
                self.create_cleaner(
                    "unverified",
                    verification_status=CleanerProfile.VerificationStatus.PENDING,
                ),
            ),
            (
                "verification-rejected",
                self.create_cleaner(
                    "verification-rejected",
                    verification_status=CleanerProfile.VerificationStatus.REJECTED,
                ),
            ),
            (
                "verification-suspended",
                self.create_cleaner(
                    "verification-suspended",
                    verification_status=CleanerProfile.VerificationStatus.SUSPENDED,
                ),
            ),
            ("non-member", self.unrelated_cleaner),
        ]
        revoked_member = self.create_cleaner("revoked")
        AgencyMembership.objects.create(
            agency=self.agency,
            cleaner=revoked_member,
            invited_by=self.agency_user,
            status=AgencyMembership.Status.REVOKED,
        )
        invalid_members.append(("revoked", revoked_member))

        for label, member in invalid_members:
            with self.subTest(label=label):
                with self.assertRaises(MarketplaceError):
                    assign_member_to_assignment(
                        assignment=self.assignment,
                        agency_user=self.agency_user,
                        member=member,
                    )
                self.assert_assignment_unchanged(assigned_member=self.member)
                self.assertEqual(self.assignment_effect_counts(), first_counts)

    def test_api_replacement_attempts_are_rejected_without_private_data_or_side_effects(self):
        self.client.force_authenticate(self.agency_user)
        first = self.client.post(
            f"/api/marketplace/assignments/{self.assignment.id}/assign-member/",
            {"assigned_member_id": self.member.id},
            format="json",
        )
        self.assertEqual(first.status_code, 200)
        first_counts = self.assignment_effect_counts()

        repeat = self.client.post(
            f"/api/marketplace/assignments/{self.assignment.id}/assign-member/",
            {"assigned_member_id": self.member.id},
            format="json",
        )
        replacement = self.client.post(
            f"/api/marketplace/assignments/{self.assignment.id}/assign-member/",
            {"assigned_member_id": self.replacement.id},
            format="json",
        )

        self.assertEqual(repeat.status_code, 200)
        self.assertEqual(replacement.status_code, 400)
        self.assertEqual(
            replacement.data,
            {"detail": "Assignment has already been delegated to a cleaner member."},
        )
        self.assertNotIn(self.replacement.username, str(replacement.data))
        self.assertNotIn(str(self.replacement.id), str(replacement.data["detail"]))
        self.assert_assignment_unchanged(assigned_member=self.member)
        self.assertEqual(self.assignment_effect_counts(), first_counts)

    def test_other_identities_cannot_replace_assigned_member(self):
        assign_member_to_assignment(
            assignment=self.assignment,
            agency_user=self.agency_user,
            member=self.member,
        )
        first_counts = self.assignment_effect_counts()
        actors = [
            ("different-agency", self.other_agency_user, 404),
            ("host", self.host, 403),
            ("assigned-member", self.member, 403),
            ("unrelated-cleaner", self.unrelated_cleaner, 404),
        ]

        for label, actor, expected_status in actors:
            with self.subTest(label=label):
                self.client.force_authenticate(actor)
                response = self.client.post(
                    f"/api/marketplace/assignments/{self.assignment.id}/assign-member/",
                    {"assigned_member_id": self.replacement.id},
                    format="json",
                )
                self.assertEqual(response.status_code, expected_status)
                self.assert_assignment_unchanged(assigned_member=self.member)
                self.assertEqual(self.assignment_effect_counts(), first_counts)

        self.client.force_authenticate(None)
        anonymous_response = self.client.post(
            f"/api/marketplace/assignments/{self.assignment.id}/assign-member/",
            {"assigned_member_id": self.replacement.id},
            format="json",
        )
        self.assertEqual(anonymous_response.status_code, 403)
        self.assert_assignment_unchanged(assigned_member=self.member)
        self.assertEqual(self.assignment_effect_counts(), first_counts)
