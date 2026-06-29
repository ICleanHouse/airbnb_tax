from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, HostProfile, User
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.services import (
    MarketplaceError,
    accept_application,
    accept_offer,
    assign_member_to_assignment,
    publish_job,
    reject_application,
    submit_application,
)
from apps.properties.models import Property


@override_settings(SENTRY_DSN="")
class MarketplaceAccountStatusGateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.job_counter = 0
        self.host = self.create_host("approved-host")
        self.property = Property.objects.create(
            host=self.host,
            name="Center Apartment",
            city="Sofia",
        )
        self.cleaner = self.create_cleaner(
            "approved-verified-cleaner",
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )

    def create_host(self, username, *, status=User.AccountStatus.APPROVED):
        host = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=status,
        )
        HostProfile.objects.create(user=host)
        return host

    def create_cleaner(
        self,
        username,
        *,
        status=User.AccountStatus.APPROVED,
        verification_status=CleanerProfile.VerificationStatus.PENDING,
        is_active=True,
    ):
        cleaner = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=status,
            is_active=is_active,
        )
        CleanerProfile.objects.create(
            user=cleaner,
            display_name=username,
            verification_status=verification_status,
        )
        return cleaner

    def create_agency(self, username="agency-user", *, status=User.AccountStatus.APPROVED):
        agency_user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=status,
        )
        agency = AgencyProfile.objects.create(
            user=agency_user,
            company_name="Agency One",
            city="Sofia",
        )
        return agency_user, agency

    def create_job(self, *, host=None, property=None, status=CleaningJob.Status.DRAFT):
        host = host or self.host
        property = property or self.property
        self.job_counter += 1
        start = timezone.now() + timedelta(days=self.job_counter)
        return CleaningJob.objects.create(
            property=property,
            host=host,
            title=f"Turnover {self.job_counter}",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            proposed_price=Decimal("45.00"),
            status=status,
        )

    def application_payload(self, job):
        return {
            "job_id": job.id,
            "proposed_price": "50.00",
            "message": "Available.",
        }

    def job_payload(self, property):
        start = timezone.now() + timedelta(days=30 + self.job_counter)
        return {
            "property_id": property.id,
            "title": "Blocked turnover",
            "scheduled_start": start.isoformat(),
            "scheduled_end": (start + timedelta(hours=2)).isoformat(),
            "proposed_price": "45.00",
        }

    def test_pending_rejected_and_suspended_hosts_cannot_create_property_or_jobs(self):
        blocked_statuses = [
            User.AccountStatus.PENDING,
            User.AccountStatus.REJECTED,
            User.AccountStatus.SUSPENDED,
        ]

        for status in blocked_statuses:
            with self.subTest(status=status):
                host = self.create_host(f"blocked-host-{status}", status=status)
                property = Property.objects.create(host=host, name=f"{status} Flat", city="Sofia")
                draft_job = self.create_job(host=host, property=property)
                self.client.force_authenticate(host)

                property_response = self.client.post(
                    "/api/properties/properties/",
                    {"name": "New Flat", "city": "Sofia"},
                    format="json",
                )
                create_job_response = self.client.post(
                    "/api/marketplace/jobs/",
                    self.job_payload(property),
                    format="json",
                )
                publish_response = self.client.post(
                    f"/api/marketplace/jobs/{draft_job.id}/publish/"
                )

                self.assertEqual(property_response.status_code, 403)
                self.assertEqual(create_job_response.status_code, 403)
                self.assertEqual(publish_response.status_code, 403)
                draft_job.refresh_from_db()
                self.assertEqual(draft_job.status, CleaningJob.Status.DRAFT)

    def test_pending_rejected_and_suspended_hosts_cannot_accept_or_reject_applications(self):
        blocked_statuses = [
            User.AccountStatus.PENDING,
            User.AccountStatus.REJECTED,
            User.AccountStatus.SUSPENDED,
        ]

        for status in blocked_statuses:
            with self.subTest(status=status):
                host = self.create_host(f"blocked-review-host-{status}", status=status)
                property = Property.objects.create(host=host, name=f"{status} Application Flat", city="Sofia")
                job = self.create_job(host=host, property=property, status=CleaningJob.Status.OPEN)
                application = submit_application(job=job, cleaner=self.cleaner)
                self.client.force_authenticate(host)

                accept_response = self.client.post(
                    f"/api/marketplace/applications/{application.id}/accept/"
                )
                reject_response = self.client.post(
                    f"/api/marketplace/applications/{application.id}/reject/"
                )

                self.assertEqual(accept_response.status_code, 404)
                self.assertEqual(reject_response.status_code, 404)
                application.refresh_from_db()
                job.refresh_from_db()
                self.assertEqual(application.status, CleanerApplication.Status.PENDING)
                self.assertEqual(job.status, CleaningJob.Status.OPEN)
                self.assertFalse(Assignment.objects.filter(job=job).exists())

    def test_session_retention_does_not_bypass_suspension_or_rejection(self):
        for status in [User.AccountStatus.SUSPENDED, User.AccountStatus.REJECTED]:
            with self.subTest(status=status):
                username = f"session-host-{status}"
                host = self.create_host(username)
                property = Property.objects.create(host=host, name=f"{status} Session Flat", city="Sofia")
                client = APIClient()
                self.assertTrue(client.login(username=username, password="Password123!"))

                host.account_status = status
                host.save(update_fields=["account_status"])

                property_response = client.post(
                    "/api/properties/properties/",
                    {"name": "Cookie Flat", "city": "Sofia"},
                    format="json",
                )
                job_response = client.post(
                    "/api/marketplace/jobs/",
                    self.job_payload(property),
                    format="json",
                )

                self.assertEqual(property_response.status_code, 403)
                self.assertEqual(job_response.status_code, 403)

    def test_approved_hosts_retain_marketplace_write_access(self):
        host = self.create_host("active-host")
        property = Property.objects.create(host=host, name="Active Flat", city="Sofia")
        draft_job = self.create_job(host=host, property=property)
        self.client.force_authenticate(host)

        property_response = self.client.post(
            "/api/properties/properties/",
            {"name": "Allowed Flat", "city": "Sofia"},
            format="json",
        )
        publish_response = self.client.post(f"/api/marketplace/jobs/{draft_job.id}/publish/")

        self.assertEqual(property_response.status_code, 201)
        self.assertEqual(publish_response.status_code, 200)
        draft_job.refresh_from_db()
        self.assertEqual(draft_job.status, CleaningJob.Status.OPEN)

    def test_only_approved_verified_cleaners_can_apply_via_service_and_api(self):
        job = self.create_job(status=CleaningJob.Status.OPEN)
        blocked_cleaners = [
            self.create_cleaner("pending-cleaner", status=User.AccountStatus.PENDING, verification_status=CleanerProfile.VerificationStatus.VERIFIED),
            self.create_cleaner("rejected-cleaner", status=User.AccountStatus.REJECTED, verification_status=CleanerProfile.VerificationStatus.VERIFIED),
            self.create_cleaner("suspended-cleaner", status=User.AccountStatus.SUSPENDED, verification_status=CleanerProfile.VerificationStatus.VERIFIED),
            self.create_cleaner("unverified-cleaner", verification_status=CleanerProfile.VerificationStatus.PENDING),
        ]

        for cleaner in blocked_cleaners:
            with self.subTest(cleaner=cleaner.username):
                with self.assertRaises(MarketplaceError):
                    submit_application(job=job, cleaner=cleaner)

                self.client.force_authenticate(cleaner)
                response = self.client.post(
                    "/api/marketplace/applications/",
                    self.application_payload(job),
                    format="json",
                )
                self.assertEqual(response.status_code, 400)

        self.client.force_authenticate(self.cleaner)
        response = self.client.post(
            "/api/marketplace/applications/",
            self.application_payload(job),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            CleanerApplication.objects.filter(job=job, cleaner=self.cleaner).count(),
            1,
        )

    def test_direct_offer_acceptance_requires_approved_verified_cleaner(self):
        blocked_cleaners = [
            self.create_cleaner("offer-rejected", status=User.AccountStatus.REJECTED, verification_status=CleanerProfile.VerificationStatus.VERIFIED),
            self.create_cleaner("offer-suspended", status=User.AccountStatus.SUSPENDED, verification_status=CleanerProfile.VerificationStatus.VERIFIED),
            self.create_cleaner("offer-unverified", verification_status=CleanerProfile.VerificationStatus.PENDING),
        ]

        for cleaner in blocked_cleaners:
            with self.subTest(cleaner=cleaner.username):
                job = self.create_job(status=CleaningJob.Status.OPEN)
                offer = CleanerApplication.objects.create(
                    job=job,
                    cleaner=cleaner,
                    origin=CleanerApplication.Origin.HOST_OFFERED,
                    status=CleanerApplication.Status.PENDING,
                )

                with self.assertRaises(MarketplaceError):
                    accept_offer(application=offer, cleaner=cleaner)

                offer.refresh_from_db()
                job.refresh_from_db()
                self.assertEqual(offer.status, CleanerApplication.Status.PENDING)
                self.assertEqual(job.status, CleaningJob.Status.OPEN)
                self.assertFalse(Assignment.objects.filter(job=job).exists())

    def test_verified_cleaner_can_accept_direct_offer(self):
        job = self.create_job(status=CleaningJob.Status.OPEN)
        offer = CleanerApplication.objects.create(
            job=job,
            cleaner=self.cleaner,
            origin=CleanerApplication.Origin.HOST_OFFERED,
            status=CleanerApplication.Status.PENDING,
        )

        assignment = accept_offer(application=offer, cleaner=self.cleaner)

        offer.refresh_from_db()
        job.refresh_from_db()
        self.assertEqual(offer.status, CleanerApplication.Status.ACCEPTED)
        self.assertEqual(job.status, CleaningJob.Status.ASSIGNED)
        self.assertEqual(assignment.cleaner, self.cleaner)

    def test_service_layer_rejects_non_approved_host_acceptance(self):
        host = self.create_host("service-suspended-host", status=User.AccountStatus.SUSPENDED)
        property = Property.objects.create(host=host, name="Service Gate Flat", city="Sofia")
        job = self.create_job(host=host, property=property, status=CleaningJob.Status.OPEN)
        application = submit_application(job=job, cleaner=self.cleaner)

        with self.assertRaisesMessage(MarketplaceError, "approved"):
            accept_application(application=application, accepted_by=host)
        with self.assertRaisesMessage(MarketplaceError, "approved"):
            reject_application(application=application, rejected_by=host)

        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=job).exists())

    def test_agency_assignment_rejects_non_workable_or_non_member_cleaners(self):
        agency_user, agency = self.create_agency()
        AgencyMembership.objects.create(agency=agency, cleaner=self.cleaner, invited_by=agency_user)
        job = self.create_job(status=CleaningJob.Status.OPEN)
        agency_application = CleanerApplication.objects.create(
            job=job,
            cleaner=agency_user,
            status=CleanerApplication.Status.PENDING,
        )
        assignment = accept_application(application=agency_application, accepted_by=self.host)

        cases = [
            (
                "pending",
                self.create_cleaner("agency-pending", status=User.AccountStatus.PENDING, verification_status=CleanerProfile.VerificationStatus.VERIFIED),
                AgencyMembership.Status.ACTIVE,
            ),
            (
                "rejected",
                self.create_cleaner("agency-rejected", status=User.AccountStatus.REJECTED, verification_status=CleanerProfile.VerificationStatus.VERIFIED),
                AgencyMembership.Status.ACTIVE,
            ),
            (
                "suspended",
                self.create_cleaner("agency-suspended", status=User.AccountStatus.SUSPENDED, verification_status=CleanerProfile.VerificationStatus.VERIFIED),
                AgencyMembership.Status.ACTIVE,
            ),
            (
                "unverified",
                self.create_cleaner("agency-unverified", verification_status=CleanerProfile.VerificationStatus.PENDING),
                AgencyMembership.Status.ACTIVE,
            ),
            (
                "inactive",
                self.create_cleaner("agency-inactive", verification_status=CleanerProfile.VerificationStatus.VERIFIED, is_active=False),
                AgencyMembership.Status.ACTIVE,
            ),
            (
                "revoked",
                self.create_cleaner("agency-revoked", verification_status=CleanerProfile.VerificationStatus.VERIFIED),
                AgencyMembership.Status.REVOKED,
            ),
            (
                "not-member",
                self.create_cleaner("agency-not-member", verification_status=CleanerProfile.VerificationStatus.VERIFIED),
                None,
            ),
        ]

        for label, member, membership_status in cases:
            with self.subTest(label=label):
                if membership_status is not None:
                    AgencyMembership.objects.create(
                        agency=agency,
                        cleaner=member,
                        invited_by=agency_user,
                        status=membership_status,
                    )

                with self.assertRaises(MarketplaceError):
                    assign_member_to_assignment(
                        assignment=assignment,
                        agency_user=agency_user,
                        member=member,
                    )

                assignment.refresh_from_db()
                self.assertIsNone(assignment.assigned_member)

        assigned = assign_member_to_assignment(
            assignment=assignment,
            agency_user=agency_user,
            member=self.cleaner,
        )
        self.assertEqual(assigned.assigned_member, self.cleaner)
