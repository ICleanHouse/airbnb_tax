from __future__ import annotations

from datetime import timedelta
from queue import Queue
from threading import Barrier, Thread
from unittest import skipUnless

from django.db import connection, connections, close_old_connections
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
from apps.core.models import AuditLog
from apps.marketplace.models import (
    Assignment,
    AssignmentReleaseRequest,
    CleanerApplication,
    CleaningJob,
    JobLifecycleEvent,
    ReplacementRequest,
)
from apps.marketplace.services import (
    LifecycleConflict,
    authorize_replacement_request,
    cancel_job,
    create_assignment_release_request,
    create_replacement_request,
    report_job_incident,
    resolve_assignment_release_request,
)
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.notifications.models import Notification
from apps.properties.models import Property


@override_settings(
    AGENCY_LIVE_RECOVERY_ENABLED=True,
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class AgencyRecoveryParityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = self._host("recovery-host")
        self.other_host = self._host("recovery-other-host")
        self.agency_user, self.agency = self._agency("recovery-agency")
        self.other_agency_user, self.other_agency = self._agency("recovery-other-agency")
        self.member = self._cleaner("recovery-member")
        self.other_member = self._cleaner("recovery-other-member")
        self.operator = User.objects.create_user(
            username="recovery-operator",
            email="recovery-operator@example.test",
            password="Password123!",
            role=User.Role.ADMIN,
            account_status=User.AccountStatus.APPROVED,
            is_staff=True,
        )
        AgencyMembership.objects.create(
            agency=self.agency,
            cleaner=self.member,
            invited_by=self.agency_user,
            status=AgencyMembership.Status.ACTIVE,
        )
        AgencyMembership.objects.create(
            agency=self.other_agency,
            cleaner=self.other_member,
            invited_by=self.other_agency_user,
            status=AgencyMembership.Status.ACTIVE,
        )
        self.property = Property.objects.create(
            host=self.host, name="Recovery flat", city="Sofia"
        )
        self.job, self.assignment, self.application = self._delegated_assignment()

    def _host(self, username: str) -> User:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=user, city="Sofia")
        return user

    def _agency(self, username: str) -> tuple[User, AgencyProfile]:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        return user, AgencyProfile.objects.create(
            user=user, company_name=username, city="Sofia"
        )

    def _cleaner(self, username: str) -> User:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=user,
            display_name=username,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        return user

    def _delegated_assignment(self):
        start = timezone.now().replace(microsecond=0) + timedelta(days=2)
        job = create_cleaning_job_record(
            property=self.property,
            host=self.host,
            title="Delegated recovery turnover",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            status=CleaningJob.Status.ASSIGNED,
        )
        application = CleanerApplication.objects.create(
            job=job,
            cleaner=self.agency_user,
            status=CleanerApplication.Status.ACCEPTED,
        )
        assignment = Assignment.objects.create(
            job=job,
            cleaner=self.agency_user,
            assigned_member=self.member,
            application=application,
        )
        return job, assignment, application

    def _cancel_and_report_incident(self):
        cancel_job(
            job=self.job,
            actor=self.agency_user,
            reason_code=CleaningJob.CancellationReason.CLEANER_UNAVAILABLE,
        )
        return report_job_incident(
            job=self.job,
            actor=self.agency_user,
            incident_type="attendance_failure",
            narrative="Private operational recovery context",
        )

    def _release_request(self):
        release = create_assignment_release_request(
            assignment=self.assignment,
            member=self.member,
            reason_code="unavailable",
            narrative="Private delegated-worker context",
        )
        return resolve_assignment_release_request(
            release=release,
            agency=self.agency_user,
            resolution="acted",
        )

    def test_agency_recovery_links_release_and_preserves_immutable_source_history(self):
        release = self._release_request()
        incident = self._cancel_and_report_incident()

        replacement = create_replacement_request(
            job=self.job,
            incident=incident,
            actor=self.agency_user,
            release_request=release,
        )

        self.job.refresh_from_db()
        self.assignment.refresh_from_db()
        self.application.refresh_from_db()
        release.refresh_from_db()
        self.assertEqual(self.job.status, CleaningJob.Status.CANCELLED)
        self.assertEqual(self.assignment.job_id, self.job.id)
        self.assertEqual(self.assignment.assigned_member_id, self.member.id)
        self.assertEqual(self.application.job_id, self.job.id)
        self.assertEqual(self.application.status, CleanerApplication.Status.ACCEPTED)
        self.assertEqual(release.replacement_request_id, replacement.id)
        self.assertEqual(replacement.status, ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION)
        self.assertIsNone(replacement.successor_id)
        self.assertEqual(
            JobLifecycleEvent.objects.filter(
                job=self.job,
                event_type=JobLifecycleEvent.EventType.REPLACEMENT_REQUESTED,
                metadata__replacement_request_id=replacement.id,
                metadata__incident_id=incident.id,
                metadata__release_request_id=release.id,
            ).count(),
            1,
        )
        self.assertEqual(
            AuditLog.objects.filter(
                action="job.replacement_requested",
                entity_id=str(replacement.id),
            ).count(),
            1,
        )

        authorized = authorize_replacement_request(
            replacement=replacement,
            actor=self.host,
            accept=True,
        )

        self.assertEqual(authorized.status, ReplacementRequest.Status.AUTHORIZED)
        self.assertEqual(authorized.successor.lineage_id, self.job.lineage_id)
        self.assertEqual(authorized.successor.replaces_job_id, self.job.id)
        self.assertEqual(authorized.successor.status, CleaningJob.Status.DRAFT)
        self.assertFalse(Assignment.objects.filter(job=authorized.successor).exists())
        self.assertEqual(
            CleaningJob.objects.filter(
                lineage=self.job.lineage,
                status__in=[
                    CleaningJob.Status.DRAFT,
                    CleaningJob.Status.OPEN,
                    CleaningJob.Status.ASSIGNED,
                ],
            ).count(),
            1,
        )

    def test_agency_request_requires_host_authorization_before_a_successor_exists(self):
        incident = self._cancel_and_report_incident()

        replacement = create_replacement_request(
            job=self.job,
            incident=incident,
            actor=self.agency_user,
        )

        self.assertEqual(replacement.status, ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION)
        self.assertIsNone(replacement.successor_id)
        with self.assertRaisesMessage(LifecycleConflict, "Only the host") as raised:
            authorize_replacement_request(
                replacement=replacement,
                actor=self.operator,
                accept=True,
            )
        self.assertEqual(raised.exception.code, "host_authorization_required")
        replacement.refresh_from_db()
        self.assertEqual(replacement.status, ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION)
        self.assertIsNone(replacement.successor_id)

    def test_only_assigned_agency_or_host_can_initiate_delegated_recovery(self):
        incident = self._cancel_and_report_incident()
        before = {
            "requests": ReplacementRequest.objects.count(),
            "events": JobLifecycleEvent.objects.count(),
            "audits": AuditLog.objects.count(),
            "notifications": Notification.objects.count(),
        }

        for actor in (self.member, self.other_agency_user, self.other_host):
            with self.subTest(actor=actor.username):
                with self.assertRaises(LifecycleConflict):
                    create_replacement_request(
                        job=self.job,
                        incident=incident,
                        actor=actor,
                    )
                self.assertEqual(ReplacementRequest.objects.count(), before["requests"])
                self.assertEqual(JobLifecycleEvent.objects.count(), before["events"])
                self.assertEqual(AuditLog.objects.count(), before["audits"])
                self.assertEqual(Notification.objects.count(), before["notifications"])

    def test_repeated_recovery_request_returns_controlled_conflict_without_side_effects(self):
        incident = self._cancel_and_report_incident()
        replacement = create_replacement_request(
            job=self.job,
            incident=incident,
            actor=self.agency_user,
        )
        before = {
            "requests": ReplacementRequest.objects.count(),
            "events": JobLifecycleEvent.objects.filter(
                event_type=JobLifecycleEvent.EventType.REPLACEMENT_REQUESTED
            ).count(),
            "audits": AuditLog.objects.filter(action="job.replacement_requested").count(),
            "notifications": Notification.objects.count(),
        }

        with self.assertRaises(LifecycleConflict) as raised:
            create_replacement_request(
                job=self.job,
                incident=incident,
                actor=self.agency_user,
            )

        self.assertEqual(raised.exception.code, "replacement_already_requested")
        self.assertEqual(ReplacementRequest.objects.count(), before["requests"])
        self.assertEqual(
            JobLifecycleEvent.objects.filter(
                event_type=JobLifecycleEvent.EventType.REPLACEMENT_REQUESTED
            ).count(),
            before["events"],
        )
        self.assertEqual(
            AuditLog.objects.filter(action="job.replacement_requested").count(),
            before["audits"],
        )
        self.assertEqual(Notification.objects.count(), before["notifications"])
        self.assertEqual(replacement.source_job_id, self.job.id)

    def test_recovery_api_links_the_resolved_release_request(self):
        release = self._release_request()
        incident = self._cancel_and_report_incident()
        self.client.force_authenticate(self.agency_user)

        response = self.client.post(
            f"/api/marketplace/jobs/{self.job.id}/replacement-requests/",
            {"incident_id": incident.id, "release_request_id": release.id},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION)
        self.assertEqual(response.data["release_request_id"], release.id)
        release.refresh_from_db()
        self.assertIsNotNone(release.replacement_request_id)


@skipUnless(connection.vendor == "postgresql", "PostgreSQL recovery locking verification")
@override_settings(
    AGENCY_LIVE_RECOVERY_ENABLED=True,
    CELERY_BROKER_URL="memory://",
    CELERY_RESULT_BACKEND="cache+memory://",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class PostgreSqlAgencyRecoveryConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        host = User.objects.create_user(
            username="recovery-pg-host",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=host, city="Sofia")
        self.agency_user = User.objects.create_user(
            username="recovery-pg-agency",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        agency = AgencyProfile.objects.create(
            user=self.agency_user,
            company_name="Recovery PostgreSQL agency",
            city="Sofia",
        )
        member = User.objects.create_user(
            username="recovery-pg-member",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=member,
            display_name="Recovery PostgreSQL member",
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        AgencyMembership.objects.create(
            agency=agency,
            cleaner=member,
            invited_by=self.agency_user,
            status=AgencyMembership.Status.ACTIVE,
        )
        property_obj = Property.objects.create(host=host, name="Recovery PG flat", city="Sofia")
        start = timezone.now().replace(microsecond=0) + timedelta(days=2)
        self.job = create_cleaning_job_record(
            property=property_obj,
            host=host,
            title="Recovery PostgreSQL turnover",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            status=CleaningJob.Status.ASSIGNED,
        )
        application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.agency_user,
            status=CleanerApplication.Status.ACCEPTED,
        )
        Assignment.objects.create(
            job=self.job,
            cleaner=self.agency_user,
            assigned_member=member,
            application=application,
        )
        cancel_job(
            job=self.job,
            actor=self.agency_user,
            reason_code=CleaningJob.CancellationReason.CLEANER_UNAVAILABLE,
        )
        self.incident = report_job_incident(
            job=self.job,
            actor=self.agency_user,
            incident_type="attendance_failure",
            narrative="Private PostgreSQL recovery context",
        )

    def test_concurrent_agency_recovery_attempts_create_one_request_and_one_conflict(self):
        barrier = Barrier(2)
        outcomes = Queue()

        def create_recovery_request():
            close_old_connections()
            try:
                job = CleaningJob.objects.get(pk=self.job.pk)
                incident = self.job.incidents.get(pk=self.incident.pk)
                actor = User.objects.get(pk=self.agency_user.pk)
                barrier.wait(timeout=10)
                replacement = create_replacement_request(
                    job=job,
                    incident=incident,
                    actor=actor,
                )
            except Exception as exc:  # Assert outcome in the main test thread.
                outcomes.put(("error", type(exc).__name__, getattr(exc, "code", None)))
            else:
                outcomes.put(("success", replacement.id))
            finally:
                connections["default"].close()

        threads = [Thread(target=create_recovery_request, daemon=True) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
            self.assertFalse(thread.is_alive(), "Concurrent recovery did not finish.")

        outcomes = [outcomes.get_nowait(), outcomes.get_nowait()]
        self.assertEqual(len([outcome for outcome in outcomes if outcome[0] == "success"]), 1, outcomes)
        self.assertEqual(
            [outcome for outcome in outcomes if outcome[0] == "error"],
            [("error", "LifecycleConflict", "replacement_already_requested")],
        )
        self.assertEqual(ReplacementRequest.objects.filter(source_job=self.job).count(), 1)
        self.assertEqual(
            JobLifecycleEvent.objects.filter(
                job=self.job,
                event_type=JobLifecycleEvent.EventType.REPLACEMENT_REQUESTED,
            ).count(),
            1,
        )
        self.assertEqual(
            AuditLog.objects.filter(action="job.replacement_requested").count(),
            1,
        )
