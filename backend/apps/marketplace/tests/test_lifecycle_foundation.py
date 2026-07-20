from datetime import timedelta
from unittest.mock import patch

from django.contrib import admin
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AgencyProfile, CleanerProfile, User
from apps.core.models import AuditLog
from apps.marketplace.models import Assignment, CleaningJob, JobLifecycleEvent, TurnoverLineage
from apps.marketplace.services import (
    LifecycleConflict,
    cancel_job,
    complete_job,
    create_cleaning_job,
    derive_available_job_actions,
    publish_job,
)
from apps.marketplace.throttles import LifecycleWriteThrottle
from apps.notifications.models import Notification
from apps.properties.models import Property


class LifecycleFoundationBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = User.objects.create_user(
            username="lifecycle-host",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.cleaner = User.objects.create_user(
            username="lifecycle-cleaner",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.cleaner,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        self.other_cleaner = User.objects.create_user(
            username="other-cleaner",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.other_cleaner,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        self.agency = User.objects.create_user(
            username="lifecycle-agency",
            password="password123",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        AgencyProfile.objects.create(user=self.agency, company_name="Recovery Agency")
        self.admin = User.objects.create_user(
            username="lifecycle-admin",
            password="password123",
            role=User.Role.ADMIN,
            account_status=User.AccountStatus.APPROVED,
            is_staff=True,
        )
        self.property = Property.objects.create(
            host=self.host,
            name="Lineage Apartment",
            address="Private address",
            city="Sofia",
            cleaning_instructions="Private property instructions",
        )
        self.start = timezone.now() + timedelta(days=2)
        self.end = self.start + timedelta(hours=2)

    def create_job(self, **overrides):
        values = {
            "property": self.property,
            "host": self.host,
            "title": "Turnover attempt",
            "scheduled_start": self.start,
            "scheduled_end": self.end,
        }
        values.update(overrides)
        status = values.pop("status", CleaningJob.Status.DRAFT)
        job = create_cleaning_job(actor=values.pop("host"), **values)
        if status != CleaningJob.Status.DRAFT:
            CleaningJob.objects.filter(pk=job.pk).update(status=status)
            job.refresh_from_db()
        return job


class LifecycleConstraintTests(LifecycleFoundationBase):
    def test_created_job_has_exactly_one_lineage_and_creation_event(self):
        job = self.create_job()

        self.assertIsNotNone(job.lineage_id)
        self.assertEqual(job.lineage.host_id, self.host.id)
        self.assertEqual(job.lineage.property_id, self.property.id)
        self.assertTrue(
            JobLifecycleEvent.objects.filter(
                job=job,
                lineage=job.lineage,
                event_type=JobLifecycleEvent.EventType.JOB_CREATED,
            ).exists()
        )

    def test_cancelled_history_may_share_exact_slot_but_actionable_jobs_may_not(self):
        first = self.create_job()
        cancel_job(job=first, actor=self.host, reason_code="host_change")

        second = self.create_job(title="Replacement-slot attempt")
        self.assertNotEqual(first.lineage_id, second.lineage_id)

        other_lineage = TurnoverLineage.objects.create(property=self.property, host=self.host)
        with self.assertRaises(IntegrityError), transaction.atomic():
            CleaningJob.objects.create(
                lineage=other_lineage,
                property=self.property,
                host=self.host,
                title="Conflicting actionable attempt",
                scheduled_start=self.start,
                scheduled_end=self.end,
            )

    def test_lineage_allows_only_one_actionable_attempt(self):
        first = self.create_job()

        with self.assertRaises(IntegrityError), transaction.atomic():
            CleaningJob.objects.create(
                lineage=first.lineage,
                property=self.property,
                host=self.host,
                title="Second actionable attempt",
                scheduled_start=self.start + timedelta(hours=3),
                scheduled_end=self.end + timedelta(hours=3),
            )

    def test_replacement_cannot_reference_itself(self):
        job = self.create_job()
        job.replaces_job_id = job.id
        with self.assertRaises(IntegrityError), transaction.atomic():
            job.save(update_fields=["replaces_job", "updated_at"])

    def test_lifecycle_events_cannot_be_updated_or_deleted(self):
        job = self.create_job()
        event = job.lifecycle_events.get(
            event_type=JobLifecycleEvent.EventType.JOB_CREATED
        )

        event.reason_code = "rewritten"
        with self.assertRaisesMessage(ValidationError, "append-only"):
            event.save()
        with self.assertRaisesMessage(ValidationError, "append-only"):
            event.delete()


class CancellationServiceTests(LifecycleFoundationBase):
    def test_publication_records_timestamp_event_and_audit(self):
        job = self.create_job()

        publish_job(job, actor=self.host)

        job.refresh_from_db()
        self.assertEqual(job.status, CleaningJob.Status.OPEN)
        self.assertIsNotNone(job.published_at)
        self.assertTrue(
            JobLifecycleEvent.objects.filter(
                job=job,
                event_type=JobLifecycleEvent.EventType.JOB_PUBLISHED,
                from_status=CleaningJob.Status.DRAFT,
                to_status=CleaningJob.Status.OPEN,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                action="job.published",
                entity_id=str(job.id),
            ).exists()
        )

    def test_completion_remains_terminal_and_records_lifecycle_event(self):
        start = timezone.now() - timedelta(hours=2)
        job = self.create_job(
            status=CleaningJob.Status.ASSIGNED,
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=1),
        )
        Assignment.objects.create(job=job, cleaner=self.cleaner)

        complete_job(job=job, completed_by=self.cleaner)

        job.refresh_from_db()
        self.assertEqual(job.status, CleaningJob.Status.COMPLETED)
        self.assertTrue(
            JobLifecycleEvent.objects.filter(
                job=job,
                event_type=JobLifecycleEvent.EventType.JOB_COMPLETED,
            ).exists()
        )

    def test_host_cancellation_is_atomic_and_idempotent(self):
        job = self.create_job(status=CleaningJob.Status.ASSIGNED)
        assignment = Assignment.objects.create(job=job, cleaner=self.cleaner)

        result = cancel_job(
            job=job,
            actor=self.host,
            reason_code="host_change",
            note="Private context",
        )
        retry = cancel_job(
            job=job,
            actor=self.host,
            reason_code="host_change",
            note="Private context",
        )

        job.refresh_from_db()
        assignment.refresh_from_db()
        self.assertEqual(result.id, retry.id)
        self.assertEqual(job.status, CleaningJob.Status.CANCELLED)
        self.assertIsNotNone(job.cancelled_at)
        self.assertIsNotNone(assignment.cancelled_at)
        self.assertEqual(
            JobLifecycleEvent.objects.filter(
                job=job, event_type=JobLifecycleEvent.EventType.JOB_CANCELLED
            ).count(),
            1,
        )
        self.assertEqual(
            AuditLog.objects.filter(action="job.cancelled", entity_id=str(job.id)).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.cleaner, notification_type="job.cancelled"
            ).count(),
            1,
        )
        event = JobLifecycleEvent.objects.get(
            job=job, event_type=JobLifecycleEvent.EventType.JOB_CANCELLED
        )
        self.assertNotIn("Private context", str(event.metadata))
        audit = AuditLog.objects.get(action="job.cancelled", entity_id=str(job.id))
        self.assertNotIn("Private context", str(audit.metadata))
        notification = Notification.objects.get(
            user=self.cleaner,
            notification_type="job.cancelled",
        )
        self.assertNotIn("Private context", notification.body)
        self.assertNotIn("Private context", str(notification.metadata))

    def test_conflicting_cancellation_retry_returns_transition_conflict(self):
        job = self.create_job()
        cancel_job(job=job, actor=self.host, reason_code="host_change")

        with self.assertRaisesMessage(LifecycleConflict, "already cancelled") as raised:
            cancel_job(job=job, actor=self.host, reason_code="scheduling_error")

        self.assertEqual(raised.exception.code, "transition_conflict")

    def test_direct_cleaner_can_cancel_assigned_job(self):
        job = self.create_job(status=CleaningJob.Status.ASSIGNED)
        Assignment.objects.create(job=job, cleaner=self.cleaner)

        cancel_job(job=job, actor=self.cleaner, reason_code="cleaner_unavailable")

        job.refresh_from_db()
        self.assertEqual(job.status, CleaningJob.Status.CANCELLED)

    def test_agency_recovery_write_fails_before_mutation(self):
        job = self.create_job(status=CleaningJob.Status.ASSIGNED)
        Assignment.objects.create(job=job, cleaner=self.agency)
        before = (JobLifecycleEvent.objects.count(), Notification.objects.count())

        with self.assertRaises(LifecycleConflict) as raised:
            cancel_job(job=job, actor=self.agency, reason_code="cleaner_unavailable")

        job.refresh_from_db()
        self.assertEqual(raised.exception.code, "agency_recovery_not_supported")
        self.assertEqual(job.status, CleaningJob.Status.ASSIGNED)
        self.assertEqual(before, (JobLifecycleEvent.objects.count(), Notification.objects.count()))

    def test_available_actions_are_server_derived(self):
        job = self.create_job(status=CleaningJob.Status.ASSIGNED)
        Assignment.objects.create(job=job, cleaner=self.cleaner)

        self.assertIn("cancel", derive_available_job_actions(job=job, actor=self.host))
        self.assertIn("cancel", derive_available_job_actions(job=job, actor=self.cleaner))
        self.assertNotIn("cancel", derive_available_job_actions(job=job, actor=self.other_cleaner))

    def test_host_cancels_agency_attempt_without_overwriting_member(self):
        job = self.create_job(status=CleaningJob.Status.ASSIGNED)
        assignment = Assignment.objects.create(
            job=job,
            cleaner=self.agency,
            assigned_member=self.cleaner,
        )

        cancel_job(job=job, actor=self.host, reason_code="host_change")

        assignment.refresh_from_db()
        self.assertEqual(assignment.assigned_member_id, self.cleaner.id)
        self.assertIsNotNone(assignment.cancelled_at)
        self.assertSetEqual(
            set(
                Notification.objects.filter(
                    notification_type="job.cancelled"
                ).values_list("user_id", flat=True)
            ),
            {self.agency.id, self.cleaner.id},
        )


class LifecycleApiTests(LifecycleFoundationBase):
    def test_property_deletion_cannot_cascade_lifecycle_history(self):
        job = self.create_job()
        self.client.force_authenticate(self.host)

        response = self.client.delete(f"/api/properties/properties/{self.property.id}/")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "property_deletion_blocked_lifecycle_history")
        self.assertTrue(CleaningJob.objects.filter(id=job.id).exists())

    def test_delete_is_replaced_by_cancellation(self):
        job = self.create_job()
        self.client.force_authenticate(self.host)

        response = self.client.delete(f"/api/marketplace/jobs/{job.id}/")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json(),
            {
                "code": "job_deletion_replaced_by_cancellation",
                "detail": "Use the cancellation action for this job.",
                "fields": {},
            },
        )
        self.assertTrue(CleaningJob.objects.filter(id=job.id).exists())

    def test_inaccessible_cancel_returns_404_before_payload_validation(self):
        job = self.create_job()
        self.client.force_authenticate(self.other_cleaner)

        response = self.client.post(
            f"/api/marketplace/jobs/{job.id}/cancel/", {"reason_code": "not-a-code"}, format="json"
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "not_found")

    def test_invalid_cancellation_input_uses_stable_400_response(self):
        job = self.create_job()
        self.client.force_authenticate(self.host)

        response = self.client.post(
            f"/api/marketplace/jobs/{job.id}/cancel/",
            {"reason_code": "not-a-code"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_input")
        self.assertIn("reason_code", response.json()["fields"])

    def test_completed_job_cancellation_uses_stable_409_response(self):
        job = self.create_job(status=CleaningJob.Status.COMPLETED)
        self.client.force_authenticate(self.host)

        response = self.client.post(
            f"/api/marketplace/jobs/{job.id}/cancel/",
            {"reason_code": "host_change"},
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "job_already_terminal")

    def test_cancel_endpoint_uses_stable_error_shape_and_is_idempotent(self):
        job = self.create_job()
        self.client.force_authenticate(self.host)
        payload = {"reason_code": "host_change", "note": "Plans changed"}

        first = self.client.post(f"/api/marketplace/jobs/{job.id}/cancel/", payload, format="json")
        second = self.client.post(f"/api/marketplace/jobs/{job.id}/cancel/", payload, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["id"], second.json()["id"])

    def test_available_actions_endpoint_returns_authoritative_actions(self):
        job = self.create_job()
        self.client.force_authenticate(self.host)

        response = self.client.get(
            f"/api/marketplace/jobs/{job.id}/available-actions/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["job_id"], job.id)
        self.assertEqual(
            response.json()["available_actions"],
            ["edit", "publish", "cancel"],
        )

    @patch.object(LifecycleWriteThrottle, "rate", "1/hour", create=True)
    def test_lifecycle_throttle_uses_stable_429_response(self):
        cache.clear()
        first_job = self.create_job()
        second_job = self.create_job(
            scheduled_start=self.start + timedelta(hours=4),
            scheduled_end=self.end + timedelta(hours=4),
        )
        self.client.force_authenticate(self.host)

        first = self.client.post(
            f"/api/marketplace/jobs/{first_job.id}/cancel/",
            {"reason_code": "host_change"},
            format="json",
        )
        throttled = self.client.post(
            f"/api/marketplace/jobs/{second_job.id}/cancel/",
            {"reason_code": "host_change"},
            format="json",
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(throttled.status_code, 429)
        self.assertEqual(
            throttled.json(),
            {
                "code": "rate_limited",
                "detail": "Too many lifecycle requests. Try again later.",
                "fields": {},
            },
        )

    def test_agency_cancel_endpoint_is_explicit_and_has_no_partial_mutation(self):
        job = self.create_job(status=CleaningJob.Status.ASSIGNED)
        Assignment.objects.create(job=job, cleaner=self.agency)
        self.client.force_authenticate(self.agency)
        before = (JobLifecycleEvent.objects.count(), Notification.objects.count())

        response = self.client.post(
            f"/api/marketplace/jobs/{job.id}/cancel/",
            {"reason_code": "invalid-on-purpose"},
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "agency_recovery_not_supported")
        job.refresh_from_db()
        self.assertEqual(job.status, CleaningJob.Status.ASSIGNED)
        self.assertEqual(before, (JobLifecycleEvent.objects.count(), Notification.objects.count()))

    def test_ineligible_assigned_cleaner_receives_stable_conflict(self):
        job = self.create_job(status=CleaningJob.Status.ASSIGNED)
        Assignment.objects.create(job=job, cleaner=self.cleaner)
        User.objects.filter(pk=self.cleaner.pk).update(
            account_status=User.AccountStatus.SUSPENDED
        )
        self.cleaner.refresh_from_db()
        self.client.force_authenticate(self.cleaner)

        response = self.client.post(
            f"/api/marketplace/jobs/{job.id}/cancel/",
            {"reason_code": "cleaner_unavailable"},
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "account_not_eligible")
        job.refresh_from_db()
        self.assertEqual(job.status, CleaningJob.Status.ASSIGNED)

    def test_unverified_assigned_cleaner_receives_stable_conflict_before_validation(self):
        job = self.create_job(status=CleaningJob.Status.ASSIGNED)
        Assignment.objects.create(job=job, cleaner=self.cleaner)
        CleanerProfile.objects.filter(user=self.cleaner).update(
            verification_status=CleanerProfile.VerificationStatus.PENDING
        )
        self.cleaner.refresh_from_db()
        self.client.force_authenticate(self.cleaner)

        response = self.client.post(
            f"/api/marketplace/jobs/{job.id}/cancel/",
            {"reason_code": "invalid-on-purpose"},
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "account_not_eligible")
        job.refresh_from_db()
        self.assertEqual(job.status, CleaningJob.Status.ASSIGNED)

    def test_worker_chronology_does_not_disclose_another_attempt(self):
        source = self.create_job(status=CleaningJob.Status.ASSIGNED)
        Assignment.objects.create(job=source, cleaner=self.cleaner)
        cancel_job(job=source, actor=self.host, reason_code="host_change")
        source.refresh_from_db()
        successor = CleaningJob.objects.create(
            lineage=source.lineage,
            replaces_job=source,
            property=self.property,
            host=self.host,
            title="Private successor title",
            description="Private successor narrative",
            cleaning_instructions="Private successor instructions",
            scheduled_start=self.start + timedelta(hours=3),
            scheduled_end=self.end + timedelta(hours=3),
        )
        Assignment.objects.create(job=successor, cleaner=self.other_cleaner)
        self.client.force_authenticate(self.cleaner)

        response = self.client.get(
            f"/api/marketplace/lineages/{source.lineage_id}/chronology/"
        )

        self.assertEqual(response.status_code, 200)
        rendered = response.json()
        self.assertEqual([attempt["id"] for attempt in rendered["attempts"]], [source.id])
        self.assertEqual({event["job_id"] for event in rendered["events"]}, {source.id})
        serialized = str(rendered)
        self.assertNotIn("Private successor", serialized)
        self.assertNotIn("Private address", serialized)
        self.assertNotIn("Private property instructions", serialized)


class LifecycleAdminTests(LifecycleFoundationBase):
    def test_admin_cannot_add_or_delete_jobs_or_events(self):
        request = RequestFactory().get("/admin/")
        request.user = self.admin
        job_admin = admin.site._registry[CleaningJob]
        event_admin = admin.site._registry[JobLifecycleEvent]

        self.assertFalse(job_admin.has_add_permission(request))
        self.assertFalse(job_admin.has_delete_permission(request))
        self.assertIn("status", job_admin.get_readonly_fields(request))
        self.assertIn("lineage", job_admin.get_readonly_fields(request))
        self.assertFalse(event_admin.has_add_permission(request))
        self.assertFalse(event_admin.has_delete_permission(request))
