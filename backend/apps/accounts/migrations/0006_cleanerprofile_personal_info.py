from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_signupemailverification"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="age",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="education",
            field=models.CharField(
                blank=True,
                choices=[
                    ("none", "No education"),
                    ("primary", "Primary education"),
                    ("high_school", "High school"),
                    ("higher", "Higher education"),
                ],
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="has_driving_license",
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="driving_license_categories",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="has_own_car",
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cleanerprofile",
            name="smoker",
            field=models.BooleanField(blank=True, null=True),
        ),
    ]
