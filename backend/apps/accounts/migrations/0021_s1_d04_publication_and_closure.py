import uuid

from django.db import migrations, models


def populate_public_ids(apps, _schema_editor):
    CleanerProfile = apps.get_model("accounts", "CleanerProfile")
    for profile in CleanerProfile.objects.filter(public_id__isnull=True).iterator():
        profile.public_id = uuid.uuid4()
        profile.save(update_fields=["public_id"])


class Migration(migrations.Migration):
    dependencies = [("accounts", "0020_agency_target_bound_invitations")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="closed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="anonymized_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="public_id",
            field=models.UUIDField(blank=True, editable=False, null=True),
        ),
        migrations.RunPython(populate_public_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="cleanerprofile",
            name="public_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="publication_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="publication_paused_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
