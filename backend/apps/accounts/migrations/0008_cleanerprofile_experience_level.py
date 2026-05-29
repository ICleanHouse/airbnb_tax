from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_cleanerprofile_birth_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="experience_level",
            field=models.CharField(
                blank=True,
                choices=[
                    ("none", "No experience"),
                    ("1_year", "1 year"),
                    ("2_years", "2 years"),
                    ("3_years", "3 years"),
                    ("4_years", "4 years"),
                    ("5_years", "5 years"),
                    ("more_than_5_years", "More than 5 years"),
                ],
                max_length=32,
            ),
        ),
    ]
