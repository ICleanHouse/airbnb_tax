from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0011_alter_cleanerprofile_bio"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="job_type_preference",
            field=models.CharField(
                blank=True,
                choices=[
                    ("one_off", "One-off jobs"),
                    ("ongoing", "Ongoing work"),
                    ("both", "Open to both"),
                ],
                max_length=32,
            ),
        ),
    ]
