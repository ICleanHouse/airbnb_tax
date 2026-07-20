from django.core.management.color import no_style
from django.db import migrations


def backfill_lineages(apps, schema_editor):
    CleaningJob = apps.get_model("marketplace", "CleaningJob")
    TurnoverLineage = apps.get_model("marketplace", "TurnoverLineage")
    JobLifecycleEvent = apps.get_model("marketplace", "JobLifecycleEvent")
    Assignment = apps.get_model("marketplace", "Assignment")

    last_job_id = 0
    while True:
        jobs = list(
            CleaningJob.objects.filter(id__gt=last_job_id).order_by("id")[:500]
        )
        if not jobs:
            break

        TurnoverLineage.objects.bulk_create(
            [
                TurnoverLineage(
                    id=job.id,
                    property_id=job.property_id,
                    host_id=job.host_id,
                )
                for job in jobs
            ],
            batch_size=500,
            ignore_conflicts=True,
        )

        for job in jobs:
            TurnoverLineage.objects.filter(id=job.id).update(
                created_at=job.created_at,
                updated_at=job.updated_at,
            )
            previous_status = job.status
            assignment = Assignment.objects.filter(job_id=job.id).first()
            normalized_status = previous_status
            cancellation_reason = ""
            cancellation_notice_band = ""
            cancelled_at = None

            if previous_status == "disputed":
                if assignment and assignment.completed_at:
                    normalized_status = "completed"
                elif assignment and assignment.cancelled_at:
                    normalized_status = "cancelled"
                elif assignment:
                    normalized_status = "assigned"
                else:
                    normalized_status = "cancelled"
                    cancellation_reason = "legacy_dispute_without_assignment"

            if normalized_status == "cancelled":
                cancelled_at = job.updated_at
                cancellation_reason = cancellation_reason or "legacy_unspecified"
                cancellation_notice_band = "unknown"
                if assignment and assignment.cancelled_at is None:
                    Assignment.objects.filter(pk=assignment.pk).update(
                        cancelled_at=cancelled_at,
                        updated_at=cancelled_at,
                    )

            CleaningJob.objects.filter(pk=job.pk).update(
                lineage_id=job.id,
                status=normalized_status,
                cancelled_at=cancelled_at,
                cancellation_reason_code=cancellation_reason,
                cancellation_notice_band=cancellation_notice_band,
            )
            if not JobLifecycleEvent.objects.filter(
                job_id=job.id,
                event_type="legacy_snapshot_imported",
            ).exists():
                JobLifecycleEvent.objects.create(
                    lineage_id=job.id,
                    job_id=job.id,
                    event_type="legacy_snapshot_imported",
                    to_status=normalized_status,
                    audience="job_participants",
                    occurred_at=job.updated_at,
                    metadata={"source": "migration_0007"},
                )
            if previous_status == "disputed" and not JobLifecycleEvent.objects.filter(
                job_id=job.id,
                event_type="legacy_disputed_normalized",
            ).exists():
                JobLifecycleEvent.objects.create(
                    lineage_id=job.id,
                    job_id=job.id,
                    event_type="legacy_disputed_normalized",
                    from_status="disputed",
                    to_status=normalized_status,
                    audience="admin_only",
                    occurred_at=job.updated_at,
                    metadata={
                        "previous_status": "disputed",
                        "normalized_status": normalized_status,
                    },
                )
        last_job_id = jobs[-1].id

    sequence_sql = schema_editor.connection.ops.sequence_reset_sql(
        no_style(), [TurnoverLineage]
    )
    with schema_editor.connection.cursor() as cursor:
        for statement in sequence_sql:
            cursor.execute(statement)


class Migration(migrations.Migration):
    dependencies = [("marketplace", "0006_lifecycle_expand")]

    operations = [
        migrations.RunPython(backfill_lineages, migrations.RunPython.noop),
    ]
