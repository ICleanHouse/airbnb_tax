from django.db import migrations, models


def backfill_completion_acknowledgements(apps, schema_editor):
    Assignment = apps.get_model("marketplace", "Assignment")
    completed = Assignment.objects.filter(completed_at__isnull=False)
    for assignment in completed.iterator():
        assignment.host_completed_at = assignment.completed_at
        assignment.cleaner_completed_at = assignment.completed_at
        assignment.save(update_fields=["host_completed_at", "cleaner_completed_at"])


def clear_backfilled_completion_acknowledgements(apps, schema_editor):
    Assignment = apps.get_model("marketplace", "Assignment")
    Assignment.objects.update(host_completed_at=None, cleaner_completed_at=None)


class Migration(migrations.Migration):
    dependencies = [
        ("marketplace", "0003_cleanerapplication_origin_favouritecleaner"),
    ]

    operations = [
        migrations.AddField(
            model_name="assignment",
            name="host_completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="assignment",
            name="cleaner_completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(
            backfill_completion_acknowledgements,
            clear_backfilled_completion_acknowledgements,
        ),
    ]
