from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_cleanerprofile_personal_info"),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerprofile",
            name="birth_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
