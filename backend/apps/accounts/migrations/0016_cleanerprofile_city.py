from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0015_remove_cleanerprofile_driving_license_categories"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="city",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
