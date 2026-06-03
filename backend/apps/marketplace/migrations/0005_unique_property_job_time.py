from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("marketplace", "0004_assignment_dual_completion"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="cleaningjob",
            constraint=models.UniqueConstraint(
                fields=("property", "scheduled_start", "scheduled_end"),
                name="unique_property_job_time",
            ),
        ),
    ]
