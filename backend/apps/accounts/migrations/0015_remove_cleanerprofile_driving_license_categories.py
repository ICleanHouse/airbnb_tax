from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0014_cleanerprofile_personal_preferences"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="cleanerprofile",
            name="driving_license_categories",
        ),
    ]
