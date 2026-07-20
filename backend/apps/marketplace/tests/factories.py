from django.db import transaction
from django.utils import timezone

from apps.marketplace.models import CleaningJob, JobLifecycleEvent, TurnoverLineage


@transaction.atomic
def create_cleaning_job_record(**kwargs) -> CleaningJob:
    """Build lineage-aware fixtures, including intentionally ineligible states."""
    host = kwargs.pop("host")
    property = kwargs.pop("property")
    requested_status = kwargs.pop("status", CleaningJob.Status.DRAFT)
    lineage = TurnoverLineage.objects.create(property=property, host=host)
    if requested_status == CleaningJob.Status.CANCELLED:
        kwargs.update(
            cancelled_at=timezone.now(),
            cancelled_by=host,
            cancellation_reason_code="scheduling_error",
            cancellation_notice_band="unknown",
        )
    job = CleaningJob.objects.create(
        lineage=lineage,
        property=property,
        host=host,
        status=requested_status,
        **kwargs,
    )
    JobLifecycleEvent.objects.create(
        lineage=lineage,
        job=job,
        actor=host,
        actor_role_snapshot=host.role,
        event_type=JobLifecycleEvent.EventType.JOB_CREATED,
        to_status=requested_status,
        metadata={"source": "test_factory"},
    )
    return job
