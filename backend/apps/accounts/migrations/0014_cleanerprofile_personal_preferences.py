from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0013_cleanerprofile_other_languages"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="personal_preferences",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
