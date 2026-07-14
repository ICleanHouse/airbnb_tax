from __future__ import annotations

from apps.marketplace.models import CleaningJob


def find_property_job_conflicts(*, property_id: int, starts_at, ends_at):
    return CleaningJob.objects.select_related(
        "property",
        "host",
        "batch",
        "assignment",
        "assignment__cleaner",
        "assignment__cleaner__cleaner_profile",
        "assignment__assigned_member",
        "assignment__application",
    ).filter(
        property_id=property_id,
        scheduled_start__lt=ends_at,
        scheduled_end__gt=starts_at,
    ).exclude(status__in=[CleaningJob.Status.CANCELLED, CleaningJob.Status.COMPLETED])
