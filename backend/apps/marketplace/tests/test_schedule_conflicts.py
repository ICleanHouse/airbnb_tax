import datetime as dt
from decimal import Decimal
from queue import Queue
from threading import Barrier, Thread
from unittest import skipUnless
from zoneinfo import ZoneInfo

from django.db import close_old_connections, connection, connections
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import (
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    HostProfile,
    User,
)
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.services import (
    MarketplaceError,
    accept_application,
    accept_offer,
    assign_member_to_assignment,
)
from apps.properties.models import Property


SOFIA = ZoneInfo("Europe/Sofia")
UTC = dt.timezone.utc
CONFLICT_CODE = "cleaner_schedule_conflict"
CONFLICT_DETAIL = "The cleaner is unavailable for this time range."
CONFLICT_RESPONSE = {"code": CONFLICT_CODE, "detail": CONFLICT_DETAIL}


class ScheduleConflictFactoryMixin:
    object_counter = 0

    def next_name(self, prefix):
        self.object_counter += 1
        return f"{prefix}-{self.object_counter}"

    def create_host(self, prefix="host"):
        username = self.next_name(prefix)
        host = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=host, city="Sofia")
        return host

    def create_cleaner(self, prefix="cleaner"):
        username = self.next_name(prefix)
        cleaner = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=cleaner,
            display_name=username,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        return cleaner

    def create_agency(self, prefix="agency"):
        username = self.next_name(prefix)
        agency_user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        agency = AgencyProfile.objects.create(
            user=agency_user,
            company_name=f"{username} private company",
            city="Sofia",
        )
        return agency_user, agency

    def create_property(self, *, host, prefix="property"):
        return Property.objects.create(
            host=host,
            name=self.next_name(prefix),
            city="Sofia",
            cleaning_instructions="Private property instructions.",
        )

    def create_job(
        self,
        *,
        property,
        scheduled_start,
        scheduled_end,
        status=CleaningJob.Status.OPEN,
        title_prefix="job",
    ):
        return CleaningJob.objects.create(
            property=property,
            host=property.host,
            title=self.next_name(title_prefix),
            description="Private job description.",
            cleaning_instructions="Private schedule instructions.",
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            proposed_price=Decimal("50.00"),
            status=status,
        )

    def create_application(self, *, job, worker, origin=CleanerApplication.Origin.CLEANER_APPLIED):
        return CleanerApplication.objects.create(
            job=job,
            cleaner=worker,
            origin=origin,
            status=CleanerApplication.Status.PENDING,
            proposed_price=Decimal("50.00"),
        )

    def create_occupied_assignment(
        self,
        *,
        worker,
        scheduled_start,
        scheduled_end,
        property,
        agency=None,
        cancelled_at=None,
        completed_at=None,
    ):
        job_status = (
            CleaningJob.Status.CANCELLED
            if cancelled_at is not None
            else CleaningJob.Status.COMPLETED
            if completed_at is not None
            else CleaningJob.Status.ASSIGNED
        )
        job = self.create_job(
            property=property,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            status=job_status,
            title_prefix="occupied-job",
        )
        return Assignment.objects.create(
            job=job,
            cleaner=agency or worker,
            assigned_member=worker if agency is not None else None,
            agreed_price=Decimal("50.00"),
            cancelled_at=cancelled_at,
            completed_at=completed_at,
        )

    def assert_schedule_conflict(self, callable_):
        with self.assertRaises(MarketplaceError) as caught:
            callable_()
        error = caught.exception
        self.assertEqual(type(error).__name__, "CleanerScheduleConflictError")
        self.assertEqual(getattr(error, "code", None), CONFLICT_CODE)
        self.assertEqual(str(error), CONFLICT_DETAIL)


@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class CleanerScheduleConflictTests(ScheduleConflictFactoryMixin, TestCase):
    def setUp(self):
        self.object_counter = 0
        self.client = APIClient()
        self.host = self.create_host()
        self.other_host = self.create_host("other-host")
        self.property = self.create_property(host=self.host)
        self.other_property = self.create_property(host=self.other_host, prefix="other-property")
        self.cleaner = self.create_cleaner()
        self.base = timezone.now().replace(microsecond=0) + dt.timedelta(days=30)

    def candidate_application(self, *, worker=None, start=None, end=None, property=None, origin=None):
        job = self.create_job(
            property=property or self.other_property,
            scheduled_start=start or self.base,
            scheduled_end=end or self.base + dt.timedelta(hours=2),
        )
        return self.create_application(
            job=job,
            worker=worker or self.cleaner,
            origin=origin or CleanerApplication.Origin.CLEANER_APPLIED,
        )

    def occupy_default_interval(self, *, worker=None, agency=None, **kwargs):
        return self.create_occupied_assignment(
            worker=worker or self.cleaner,
            agency=agency,
            property=kwargs.pop("property", self.property),
            scheduled_start=kwargs.pop("scheduled_start", self.base + dt.timedelta(minutes=30)),
            scheduled_end=kwargs.pop("scheduled_end", self.base + dt.timedelta(hours=2, minutes=30)),
            **kwargs,
        )

    def test_application_acceptance_rejects_overlap_at_another_property(self):
        self.occupy_default_interval()
        application = self.candidate_application()

        self.assert_schedule_conflict(
            lambda: accept_application(application=application, accepted_by=self.other_host)
        )
        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=application.job).exists())

    def test_application_acceptance_detects_existing_delegated_work(self):
        agency_user, _ = self.create_agency()
        self.occupy_default_interval(agency=agency_user)
        application = self.candidate_application()

        self.assert_schedule_conflict(
            lambda: accept_application(application=application, accepted_by=self.other_host)
        )

    def test_stale_application_is_revalidated_after_another_assignment_is_created(self):
        application = self.candidate_application()
        stale_application = CleanerApplication.objects.get(pk=application.pk)
        self.occupy_default_interval()

        self.assert_schedule_conflict(
            lambda: accept_application(application=stale_application, accepted_by=self.other_host)
        )

    def test_stale_direct_offer_is_revalidated_at_acceptance(self):
        offer = self.candidate_application(origin=CleanerApplication.Origin.HOST_OFFERED)
        stale_offer = CleanerApplication.objects.get(pk=offer.pk)
        self.occupy_default_interval()

        self.assert_schedule_conflict(
            lambda: accept_offer(application=stale_offer, cleaner=self.cleaner)
        )
        offer.refresh_from_db()
        self.assertEqual(offer.status, CleanerApplication.Status.PENDING)

    def test_agency_application_acceptance_does_not_check_agency_account_schedule(self):
        agency_user, _ = self.create_agency()
        existing_property = self.create_property(host=self.host, prefix="agency-existing-property")
        self.create_occupied_assignment(
            worker=agency_user,
            property=existing_property,
            scheduled_start=self.base + dt.timedelta(minutes=30),
            scheduled_end=self.base + dt.timedelta(hours=2, minutes=30),
        )
        application = self.candidate_application(worker=agency_user)

        assignment = accept_application(application=application, accepted_by=self.other_host)

        self.assertEqual(assignment.cleaner_id, agency_user.id)
        self.assertIsNone(assignment.assigned_member_id)
        self.assertEqual(Assignment.objects.filter(job=application.job).count(), 1)

    def test_agency_delegation_revalidates_member_schedule(self):
        agency_user, agency = self.create_agency()
        member = self.create_cleaner("member")
        AgencyMembership.objects.create(
            agency=agency,
            cleaner=member,
            invited_by=agency_user,
            status=AgencyMembership.Status.ACTIVE,
        )
        self.occupy_default_interval(worker=member)
        application = self.candidate_application(worker=agency_user)
        assignment = accept_application(application=application, accepted_by=self.other_host)

        self.assert_schedule_conflict(
            lambda: assign_member_to_assignment(
                assignment=assignment,
                agency_user=agency_user,
                member=member,
            )
        )
        assignment.refresh_from_db()
        self.assertIsNone(assignment.assigned_member_id)

    def test_non_overlapping_boundaries_are_allowed(self):
        existing_start = self.base + dt.timedelta(hours=4)
        existing_end = self.base + dt.timedelta(hours=6)
        candidates = {
            "back-to-back": (existing_end, existing_end + dt.timedelta(hours=2)),
            "fully-before": (self.base, self.base + dt.timedelta(hours=2)),
            "fully-after": (existing_end + dt.timedelta(hours=2), existing_end + dt.timedelta(hours=4)),
        }

        for label, (candidate_start, candidate_end) in candidates.items():
            with self.subTest(label=label):
                worker = self.create_cleaner(label)
                occupied_property = self.create_property(host=self.host, prefix=f"{label}-occupied")
                candidate_property = self.create_property(
                    host=self.other_host,
                    prefix=f"{label}-candidate",
                )
                self.create_occupied_assignment(
                    worker=worker,
                    property=occupied_property,
                    scheduled_start=existing_start,
                    scheduled_end=existing_end,
                )
                application = self.candidate_application(
                    worker=worker,
                    property=candidate_property,
                    start=candidate_start,
                    end=candidate_end,
                )

                assignment = accept_application(
                    application=application,
                    accepted_by=self.other_host,
                )

                self.assertEqual(assignment.cleaner_id, worker.id)

    def test_cancelled_assignment_releases_its_interval(self):
        self.occupy_default_interval(cancelled_at=timezone.now())
        application = self.candidate_application()

        assignment = accept_application(application=application, accepted_by=self.other_host)

        self.assertEqual(assignment.cleaner_id, self.cleaner.id)

    def test_completed_assignment_still_occupies_its_scheduled_interval(self):
        self.occupy_default_interval(completed_at=timezone.now())
        application = self.candidate_application()

        self.assert_schedule_conflict(
            lambda: accept_application(application=application, accepted_by=self.other_host)
        )

    def test_utc_and_sofia_aware_intervals_are_compared_as_instants(self):
        future_year = timezone.localtime().year + 2
        local_start = dt.datetime(future_year, 7, 20, 10, 0, tzinfo=SOFIA)
        local_end = local_start + dt.timedelta(hours=2)
        utc_start = local_start.astimezone(UTC) + dt.timedelta(hours=1)
        utc_end = local_end.astimezone(UTC) + dt.timedelta(hours=1)
        self.assertEqual(local_start.utcoffset(), dt.timedelta(hours=3))
        self.create_occupied_assignment(
            worker=self.cleaner,
            property=self.property,
            scheduled_start=utc_start,
            scheduled_end=utc_end,
        )
        application = self.candidate_application(start=local_start, end=local_end)

        self.assert_schedule_conflict(
            lambda: accept_application(application=application, accepted_by=self.other_host)
        )

    def test_sofia_fall_back_fold_is_compared_in_utc(self):
        future_year = timezone.localtime().year + 2
        last_day = dt.date(future_year, 10, 31)
        transition_day = 31 - ((last_day.weekday() + 1) % 7)
        occupied_start = dt.datetime(
            future_year,
            10,
            transition_day,
            3,
            15,
            tzinfo=SOFIA,
            fold=0,
        )
        occupied_end = dt.datetime(
            future_year,
            10,
            transition_day,
            3,
            45,
            tzinfo=SOFIA,
            fold=1,
        )
        candidate_start = dt.datetime(
            future_year,
            10,
            transition_day,
            3,
            30,
            tzinfo=SOFIA,
            fold=1,
        )
        candidate_end = dt.datetime(
            future_year,
            10,
            transition_day,
            4,
            30,
            tzinfo=SOFIA,
        )
        self.assertNotEqual(occupied_start.utcoffset(), occupied_end.utcoffset())
        self.assertLess(occupied_start.astimezone(UTC), candidate_end.astimezone(UTC))
        self.assertGreater(occupied_end.astimezone(UTC), candidate_start.astimezone(UTC))
        self.create_occupied_assignment(
            worker=self.cleaner,
            property=self.property,
            scheduled_start=occupied_start,
            scheduled_end=occupied_end,
        )
        application = self.candidate_application(start=candidate_start, end=candidate_end)

        self.assert_schedule_conflict(
            lambda: accept_application(application=application, accepted_by=self.other_host)
        )

    def assert_private_conflict_response(self, response, *, private_values):
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data, CONFLICT_RESPONSE)
        serialized = str(response.data)
        for private_value in private_values:
            self.assertNotIn(str(private_value), serialized)

    def test_application_accept_api_returns_stable_private_conflict(self):
        occupied = self.occupy_default_interval()
        application = self.candidate_application()
        self.client.force_authenticate(self.other_host)

        response = self.client.post(f"/api/marketplace/applications/{application.id}/accept/")

        self.assert_private_conflict_response(
            response,
            private_values=(
                occupied.job_id,
                occupied.job.title,
                occupied.job.property_id,
                occupied.job.property.name,
                occupied.job.host_id,
                occupied.job.host.username,
                occupied.job.scheduled_start.isoformat(),
                occupied.job.scheduled_end.isoformat(),
            ),
        )

    def test_direct_offer_accept_api_returns_stable_private_conflict(self):
        occupied = self.occupy_default_interval()
        offer = self.candidate_application(origin=CleanerApplication.Origin.HOST_OFFERED)
        self.client.force_authenticate(self.cleaner)

        response = self.client.post(
            f"/api/marketplace/applications/{offer.id}/accept-offer/"
        )

        self.assert_private_conflict_response(
            response,
            private_values=(
                occupied.job_id,
                occupied.job.title,
                occupied.job.property_id,
                occupied.job.property.name,
                occupied.job.host.username,
                occupied.job.scheduled_start.isoformat(),
            ),
        )

    def test_agency_delegation_api_returns_stable_private_conflict(self):
        agency_user, agency = self.create_agency()
        member = self.create_cleaner("api-member")
        AgencyMembership.objects.create(
            agency=agency,
            cleaner=member,
            invited_by=agency_user,
            status=AgencyMembership.Status.ACTIVE,
        )
        occupied = self.occupy_default_interval(worker=member)
        application = self.candidate_application(worker=agency_user)
        assignment = accept_application(application=application, accepted_by=self.other_host)
        self.client.force_authenticate(agency_user)

        response = self.client.post(
            f"/api/marketplace/assignments/{assignment.id}/assign-member/",
            {"assigned_member_id": member.id},
            format="json",
        )

        self.assert_private_conflict_response(
            response,
            private_values=(
                occupied.job_id,
                occupied.job.title,
                occupied.job.property_id,
                occupied.job.property.name,
                occupied.job.host.username,
                occupied.job.scheduled_end.isoformat(),
            ),
        )


@skipUnless(connection.vendor == "postgresql", "PostgreSQL row-locking coverage")
@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class CleanerScheduleConflictConcurrencyTests(
    ScheduleConflictFactoryMixin,
    TransactionTestCase,
):
    reset_sequences = True

    def setUp(self):
        self.object_counter = 0
        self.cleaner = self.create_cleaner("concurrent-cleaner")
        self.start = timezone.now().replace(microsecond=0) + dt.timedelta(days=30)
        self.application_ids = []
        self.host_ids = []
        self.job_ids = []
        for label in ("first", "second"):
            host = self.create_host(f"{label}-host")
            property = self.create_property(host=host, prefix=f"{label}-property")
            job = self.create_job(
                property=property,
                scheduled_start=self.start,
                scheduled_end=self.start + dt.timedelta(hours=2),
            )
            application = self.create_application(job=job, worker=self.cleaner)
            self.application_ids.append(application.id)
            self.host_ids.append(host.id)
            self.job_ids.append(job.id)

    def test_concurrent_overlapping_acceptances_produce_one_assignment_and_one_conflict(self):
        barrier = Barrier(2)
        results = Queue()

        def attempt_acceptance(application_id, host_id):
            close_old_connections()
            try:
                application = CleanerApplication.objects.get(pk=application_id)
                host = User.objects.get(pk=host_id)
                barrier.wait(timeout=10)
                assignment = accept_application(application=application, accepted_by=host)
            except Exception as exc:  # Results are asserted in the main test thread.
                results.put(
                    (
                        "error",
                        type(exc).__name__,
                        getattr(exc, "code", None),
                        str(exc),
                    )
                )
            else:
                results.put(("success", assignment.job_id))
            finally:
                connections["default"].close()

        threads = [
            Thread(
                target=attempt_acceptance,
                args=(application_id, host_id),
                daemon=True,
            )
            for application_id, host_id in zip(self.application_ids, self.host_ids, strict=True)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
            self.assertFalse(thread.is_alive(), "Concurrent acceptance did not finish.")

        outcomes = [results.get_nowait(), results.get_nowait()]
        successes = [outcome for outcome in outcomes if outcome[0] == "success"]
        errors = [outcome for outcome in outcomes if outcome[0] == "error"]
        self.assertEqual(len(successes), 1, outcomes)
        self.assertEqual(
            errors,
            [("error", "CleanerScheduleConflictError", CONFLICT_CODE, CONFLICT_DETAIL)],
        )
        self.assertEqual(Assignment.objects.filter(job_id__in=self.job_ids).count(), 1)
