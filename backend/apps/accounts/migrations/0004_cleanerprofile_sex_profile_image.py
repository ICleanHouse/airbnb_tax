from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_alter_user_managers"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="profile_image",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="sex",
            field=models.CharField(
                choices=[
                    ("male", "Male"),
                    ("female", "Female"),
                    ("prefer_not_to_say", "Prefer not to say"),
                ],
                default="prefer_not_to_say",
                max_length=32,
            ),
        ),
    ]
