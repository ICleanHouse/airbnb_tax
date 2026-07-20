from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CleanerProfile, HostProfile, User
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.marketplace.services import (
    MarketplaceError,
    accept_application,
    accept_offer,
    offer_job,
    publish_job,
    reject_application,
    submit_application,
)
from apps.properties.models import Property


class AssignmentAcceptanceInvariantTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(
            username="host",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.host)
        self.cleaner = self.create_cleaner("cleaner")
        self.other_cleaner = self.create_cleaner("cleaner2")
        self.property = Property.objects.create(
            host=self.host,
            name="Center Apartment",
            city="Sofia",
            cleaning_instructions="Change linens.",
        )
        self.job = create_cleaning_job_record(
            property=self.property,
            host=self.host,
            title="Turnover cleaning",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
            proposed_price=Decimal("45.00"),
        )

    def create_cleaner(self, username):
        cleaner = User.objects.create_user(
            username=username,
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=cleaner,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
            display_name=username.title(),
        )
        return cleaner

    def create_second_application(self):
        return submit_application(job=self.job, cleaner=self.other_cleaner, proposed_price=Decimal("47.00"))

    def assert_single_assignment_consistency(self, *, accepted_application, expected_cleaner):
        self.job.refresh_from_db()
        accepted_application.refresh_from_db()
        assignment = Assignment.objects.get(job=self.job)

        self.assertEqual(Assignment.objects.filter(job=self.job).count(), 1)
        self.assertEqual(self.job.status, CleaningJob.Status.ASSIGNED)
        self.assertEqual(self.job.agreed_price, assignment.agreed_price)
        self.assertEqual(assignment.application_id, accepted_application.id)
        self.assertEqual(assignment.cleaner_id, expected_cleaner.id)
        self.assertEqual(accepted_application.status, CleanerApplication.Status.ACCEPTED)
        self.assertFalse(
            CleanerApplication.objects.filter(
                job=self.job,
                status=CleanerApplication.Status.PENDING,
            ).exists()
        )

    def test_two_pending_applications_cannot_both_be_accepted(self):
        publish_job(self.job)
        first = submit_application(job=self.job, cleaner=self.cleaner, proposed_price=Decimal("50.00"))
        second = self.create_second_application()

        assignment = accept_application(application=first, accepted_by=self.host)

        with self.assertRaises(MarketplaceError):
            accept_application(application=second, accepted_by=self.host)

        second.refresh_from_db()
        self.assertEqual(assignment.application_id, first.id)
        self.assertEqual(second.status, CleanerApplication.Status.REJECTED)
        self.assert_single_assignment_consistency(accepted_application=first, expected_cleaner=self.cleaner)

    def test_repeating_acceptance_of_same_application_does_not_create_second_assignment(self):
        publish_job(self.job)
        application = submit_application(job=self.job, cleaner=self.cleaner, proposed_price=Decimal("50.00"))

        accept_application(application=application, accepted_by=self.host)

        with self.assertRaises(MarketplaceError):
            accept_application(application=application, accepted_by=self.host)

        self.assert_single_assignment_consistency(
            accepted_application=application,
            expected_cleaner=self.cleaner,
        )

    def test_stale_application_object_loaded_before_acceptance_cannot_bypass_invariant(self):
        publish_job(self.job)
        first = submit_application(job=self.job, cleaner=self.cleaner, proposed_price=Decimal("50.00"))
        second = self.create_second_application()
        stale_second = CleanerApplication.objects.get(id=second.id)

        accept_application(application=first, accepted_by=self.host)

        with self.assertRaises(MarketplaceError):
            accept_application(application=stale_second, accepted_by=self.host)

        second.refresh_from_db()
        self.assertEqual(second.status, CleanerApplication.Status.REJECTED)
        self.assert_single_assignment_consistency(accepted_application=first, expected_cleaner=self.cleaner)

    def test_rejected_application_cannot_later_be_accepted_for_open_job(self):
        publish_job(self.job)
        rejected = submit_application(job=self.job, cleaner=self.cleaner, proposed_price=Decimal("50.00"))
        reject_application(application=rejected, rejected_by=self.host)

        with self.assertRaisesMessage(MarketplaceError, "Only pending applications can be accepted."):
            accept_application(application=rejected, accepted_by=self.host)

        self.job.refresh_from_db()
        rejected.refresh_from_db()
        self.assertEqual(Assignment.objects.filter(job=self.job).count(), 0)
        self.assertEqual(self.job.status, CleaningJob.Status.OPEN)
        self.assertEqual(rejected.status, CleanerApplication.Status.REJECTED)

    def test_database_rejects_second_assignment_for_same_job(self):
        publish_job(self.job)
        first = submit_application(job=self.job, cleaner=self.cleaner, proposed_price=Decimal("50.00"))
        assignment = accept_application(application=first, accepted_by=self.host)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Assignment.objects.create(
                    job=self.job,
                    cleaner=self.other_cleaner,
                    agreed_price=Decimal("47.00"),
                )

        self.assert_single_assignment_consistency(accepted_application=first, expected_cleaner=self.cleaner)
        self.assertEqual(Assignment.objects.get(job=self.job).id, assignment.id)

    def test_direct_offer_acceptance_has_same_single_assignment_invariant(self):
        first_offer = offer_job(job=self.job, host=self.host, cleaner=self.cleaner, proposed_price=Decimal("50.00"))
        second_offer = offer_job(job=self.job, host=self.host, cleaner=self.other_cleaner, proposed_price=Decimal("47.00"))
        stale_second_offer = CleanerApplication.objects.get(id=second_offer.id)

        assignment = accept_offer(application=first_offer, cleaner=self.cleaner)

        with self.assertRaises(MarketplaceError):
            accept_offer(application=second_offer, cleaner=self.other_cleaner)
        with self.assertRaises(MarketplaceError):
            accept_offer(application=first_offer, cleaner=self.cleaner)
        with self.assertRaises(MarketplaceError):
            accept_offer(application=stale_second_offer, cleaner=self.other_cleaner)

        second_offer.refresh_from_db()
        self.assertEqual(assignment.application_id, first_offer.id)
        self.assertEqual(second_offer.status, CleanerApplication.Status.REJECTED)
        self.assert_single_assignment_consistency(accepted_application=first_offer, expected_cleaner=self.cleaner)
