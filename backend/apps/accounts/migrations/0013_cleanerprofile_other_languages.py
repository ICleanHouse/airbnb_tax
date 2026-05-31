from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0012_cleanerprofile_job_type_preference"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="other_languages",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
