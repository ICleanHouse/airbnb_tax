from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CleanerProfile, User
from apps.marketplace.models import Assignment, CleaningJob, JobLifecycleEvent
from apps.marketplace.services import (
    LifecycleConflict,
    accept_reschedule_proposal,
    create_replacement_request,
    file_dispute,
    propose_reschedule,
    report_job_incident,
    create_cleaning_job,
)
from apps.properties.models import Property


class RecoveryWorkflowTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(
            username="recovery-host", password="password123", role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.cleaner = User.objects.create_user(
            username="recovery-cleaner", password="password123", role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.cleaner, verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        self.property = Property.objects.create(
            host=self.host, name="Recovery home", address="Private", city="Sofia",
        )
        self.start = timezone.now() + timedelta(days=3)
        self.job = create_cleaning_job(
            actor=self.host, property=self.property, title="Recovery job",
            scheduled_start=self.start, scheduled_end=self.start + timedelta(hours=2),
        )
        self.job.status = CleaningJob.Status.ASSIGNED
        self.job.save(update_fields=["status", "updated_at"])
        Assignment.objects.create(job=self.job, cleaner=self.cleaner)

    def test_counterpart_accepts_reschedule_without_exposing_private_data(self):
        proposal = propose_reschedule(
            job=self.job, actor=self.host,
            scheduled_start=self.start + timedelta(hours=3),
            scheduled_end=self.start + timedelta(hours=5),
        )

        accept_reschedule_proposal(proposal=proposal, actor=self.cleaner)

        self.job.refresh_from_db()
        self.assertEqual(self.job.scheduled_start, self.start + timedelta(hours=3))
        self.assertTrue(JobLifecycleEvent.objects.filter(
            job=self.job, event_type=JobLifecycleEvent.EventType.JOB_RESCHEDULED,
        ).exists())

    def test_incident_narrative_is_not_copied_to_lifecycle_metadata(self):
        self.job.scheduled_start = timezone.now() - timedelta(minutes=16)
        self.job.save(update_fields=["scheduled_start", "updated_at"])

        incident = report_job_incident(
            job=self.job, actor=self.host, incident_type="no_show", narrative="Private door-code detail",
        )

        event = JobLifecycleEvent.objects.get(job=self.job, event_type=JobLifecycleEvent.EventType.INCIDENT_REPORTED)
        self.assertEqual(incident.narrative, "Private door-code detail")
        self.assertNotIn("Private door-code detail", str(event.metadata))

    def test_replacement_is_a_host_published_draft_with_immutable_source_history(self):
        self.job.status = CleaningJob.Status.CANCELLED
        self.job.cancelled_at = timezone.now()
        self.job.cancelled_by = self.host
        self.job.cancellation_reason_code = "no_show"
        self.job.cancellation_notice_band = "after_start"
        self.job.save()
        incident = report_job_incident(
            job=self.job, actor=self.host, incident_type="no_show", narrative="Private",
        )

        request = create_replacement_request(job=self.job, incident=incident, actor=self.host)

        self.assertEqual(request.successor.status, CleaningJob.Status.DRAFT)
        self.assertEqual(request.successor.replaces_job_id, self.job.id)
        self.assertFalse(Assignment.objects.filter(job=request.successor).exists())

    def test_dispute_is_private_and_completed_jobs_cannot_be_replaced(self):
        dispute = file_dispute(
            job=self.job, actor=self.host, category="quality", narrative="Private evidence",
        )
        self.assertEqual(dispute.status, "open")
        self.assertEqual(dispute.narrative, "Private evidence")
        self.job.status = CleaningJob.Status.COMPLETED
        self.job.save(update_fields=["status", "updated_at"])
        with self.assertRaises(LifecycleConflict):
            create_replacement_request(job=self.job, incident=None, actor=self.host)
