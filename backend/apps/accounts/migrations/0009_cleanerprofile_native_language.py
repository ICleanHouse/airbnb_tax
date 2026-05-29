from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0008_cleanerprofile_experience_level"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="native_language",
            field=models.CharField(blank=True, max_length=80),
        ),
    ]
