from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0016_cleanerprofile_city"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="cleanerprofile",
            name="job_type_preference",
        ),
        migrations.RemoveField(
            model_name="cleanerprofile",
            name="preferred_time_slots",
        ),
        migrations.RemoveField(
            model_name="cleanerprofile",
            name="weekly_availability",
        ),
        migrations.RemoveField(
            model_name="cleanerprofile",
            name="work_preference",
        ),
    ]
