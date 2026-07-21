from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import (
    AgencyInvitation,
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    HostProfile,
    User,
)
from apps.connections.models import Connection
from apps.connections.services import (
    ConnectionError,
    accept_connection,
    request_connection,
    send_message,
)
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.services import (
    MarketplaceError,
    assign_member_to_assignment,
    create_favourite_cleaner,
)
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property


@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class VerificationAuthorizationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = self.make_host("host")
        self.cleaner = self.make_cleaner("cleaner")

    def make_host(self, username, status=User.AccountStatus.APPROVED):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=status,
        )
        HostProfile.objects.create(user=user)
        return user

    def make_cleaner(
        self,
        username,
        status=User.AccountStatus.APPROVED,
        verification=CleanerProfile.VerificationStatus.VERIFIED,
    ):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=status,
        )
        CleanerProfile.objects.create(
            user=user,
            display_name=username,
            verification_status=verification,
        )
        return user

    def make_agency(self, username="agency"):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        profile = AgencyProfile.objects.create(user=user, company_name=username)
        return user, profile

    def test_connection_request_requires_both_participants_to_be_eligible(self):
        pending_host = self.make_host("pending-host", User.AccountStatus.PENDING)
        pending_cleaner = self.make_cleaner(
            "pending-cleaner",
            verification=CleanerProfile.VerificationStatus.PENDING,
        )

        with self.assertRaises(ConnectionError):
            request_connection(requester=pending_host, addressee=self.cleaner)
        with self.assertRaises(ConnectionError):
            request_connection(requester=self.host, addressee=pending_cleaner)

        self.assertEqual(Connection.objects.count(), 0)

    def test_connection_acceptance_rechecks_both_participants(self):
        connection = Connection.objects.create(
            requester=self.host,
            addressee=self.cleaner,
            status=Connection.Status.PENDING,
        )
        self.host.account_status = User.AccountStatus.SUSPENDED
        self.host.save(update_fields=["account_status"])

        with self.assertRaises(ConnectionError):
            accept_connection(connection=connection, user=self.cleaner)

        connection.refresh_from_db()
        self.assertEqual(connection.status, Connection.Status.PENDING)

    def test_message_send_rechecks_both_participants_but_history_remains(self):
        connection = Connection.objects.create(
            requester=self.host,
            addressee=self.cleaner,
            status=Connection.Status.ACCEPTED,
        )
        self.cleaner.account_status = User.AccountStatus.SUSPENDED
        self.cleaner.save(update_fields=["account_status"])

        with self.assertRaises(ConnectionError):
            send_message(connection=connection, sender=self.host, body="new work")

        self.client.force_authenticate(self.host)
        response = self.client.get("/api/connections/")
        self.assertEqual(response.status_code, 200)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 1)

    def test_favourite_service_requires_eligible_host(self):
        pending_host = self.make_host("favourite-pending", User.AccountStatus.PENDING)

        with self.assertRaises(MarketplaceError):
            create_favourite_cleaner(host=pending_host, cleaner=self.cleaner)

    def test_hosts_use_public_cleaner_projection_not_private_profile(self):
        self.client.force_authenticate(self.host)

        private = self.client.get(
            f"/api/accounts/cleaners/{self.cleaner.cleaner_profile.id}/"
        )
        public = self.client.get(
            f"/api/accounts/public-cleaners/{self.cleaner.cleaner_profile.id}/"
        )

        self.assertEqual(private.status_code, 404)
        self.assertEqual(public.status_code, 200)
        self.assertNotIn("birth_date", public.data)

    def test_only_eligible_active_agency_membership_can_read_private_profile(self):
        agency_user, agency = self.make_agency()
        AgencyMembership.objects.create(agency=agency, cleaner=self.cleaner)
        self.client.force_authenticate(agency_user)

        allowed = self.client.get(
            f"/api/accounts/cleaners/{self.cleaner.cleaner_profile.id}/"
        )
        self.assertEqual(allowed.status_code, 200)

        agency_user.account_status = User.AccountStatus.SUSPENDED
        agency_user.save(update_fields=["account_status"])
        denied = self.client.get(
            f"/api/accounts/cleaners/{self.cleaner.cleaner_profile.id}/"
        )
        self.assertEqual(denied.status_code, 404)

    def test_agency_invitation_create_and_accept_recheck_agency_eligibility(self):
        agency_user, agency = self.make_agency("inviting-agency")
        agency_user.account_status = User.AccountStatus.SUSPENDED
        agency_user.save(update_fields=["account_status"])
        self.client.force_authenticate(agency_user)

        create_response = self.client.post(
            f"/api/accounts/agencies/{agency.id}/invite-cleaner/",
            {"email": self.cleaner.email},
            format="json",
        )
        self.assertEqual(create_response.status_code, 403)

        invitation = AgencyInvitation.objects.create(
            agency=agency,
            email=self.cleaner.email,
            token="verification-authorization-invite",
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.client.force_authenticate(self.cleaner)
        accept_response = self.client.post(
            f"/api/accounts/agency-invitations/{invitation.id}/accept/"
        )
        self.assertEqual(accept_response.status_code, 403)
        self.assertFalse(AgencyMembership.objects.filter(agency=agency).exists())

    def test_pending_cleaner_may_accept_membership_onboarding(self):
        agency_user, agency = self.make_agency("onboarding-agency")
        pending_cleaner = self.make_cleaner(
            "onboarding-cleaner",
            status=User.AccountStatus.PENDING,
            verification=CleanerProfile.VerificationStatus.PENDING,
        )
        invitation = AgencyInvitation.objects.create(
            agency=agency,
            email=pending_cleaner.email,
            token="pending-cleaner-onboarding",
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.client.force_authenticate(pending_cleaner)

        response = self.client.post(
            f"/api/accounts/agency-invitations/{invitation.id}/accept/"
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            AgencyMembership.objects.filter(
                agency=agency, cleaner=pending_cleaner
            ).exists()
        )

    def test_inactive_agency_cannot_delegate(self):
        agency_user, agency = self.make_agency("delegate-agency")
        AgencyMembership.objects.create(agency=agency, cleaner=self.cleaner)
        property_record = Property.objects.create(
            host=self.host, name="Flat", city="Sofia"
        )
        job = create_cleaning_job_record(
            property=property_record,
            host=self.host,
            title="Turnover",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
            status=CleaningJob.Status.ASSIGNED,
        )
        application = CleanerApplication.objects.create(
            job=job, cleaner=agency_user, status=CleanerApplication.Status.ACCEPTED
        )
        assignment = Assignment.objects.create(
            job=job, cleaner=agency_user, application=application
        )
        agency_user.is_active = False
        agency_user.save(update_fields=["is_active"])

        with self.assertRaises(MarketplaceError):
            assign_member_to_assignment(
                assignment=assignment,
                agency_user=agency_user,
                member=self.cleaner,
            )
