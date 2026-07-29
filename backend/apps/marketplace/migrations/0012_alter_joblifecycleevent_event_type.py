# Keeps the migration state aligned with the append-only release-request events.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("marketplace", "0011_assignmentreleaserequest")]

    operations = [
        migrations.AlterField(
            model_name="joblifecycleevent",
            name="event_type",
            field=models.CharField(
                max_length=48,
                choices=[
                    ("legacy_snapshot_imported", "Legacy snapshot imported"),
                    ("legacy_disputed_normalized", "Legacy disputed status normalized"),
                    ("job_created", "Job created"), ("job_published", "Job published"),
                    ("job_assigned", "Job assigned"), ("job_completed", "Job completed"),
                    ("job_cancelled", "Job cancelled"), ("job_rescheduled", "Job rescheduled"),
                    ("incident_reported", "Incident reported"), ("replacement_requested", "Replacement requested"),
                    ("replacement_approved", "Replacement approved"), ("replacement_declined", "Replacement declined"),
                    ("replacement_withdrawn", "Replacement withdrawn"),
                    ("assignment_release_requested", "Assignment release requested"),
                    ("assignment_release_resolved", "Assignment release resolved"),
                    ("dispute_opened", "Dispute opened"), ("dispute_updated", "Dispute updated"),
                    ("dispute_resolved", "Dispute resolved"), ("dispute_dismissed", "Dispute dismissed"),
                ],
            ),
        )
    ]
