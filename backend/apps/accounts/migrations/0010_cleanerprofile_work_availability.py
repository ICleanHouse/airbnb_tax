from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0009_cleanerprofile_native_language"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="work_preference",
            field=models.CharField(
                blank=True,
                choices=[("full_time", "Full time"), ("part_time", "Part time")],
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="preferred_time_slots",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="weekly_availability",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
