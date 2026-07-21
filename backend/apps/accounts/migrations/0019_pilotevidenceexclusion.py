from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [("accounts", "0018_user_dashboard_prefs")]

    operations = [
        migrations.CreateModel(
            name="PilotEvidenceExclusion",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "excluded_at",
                    models.DateTimeField(
                        default=django.utils.timezone.now, editable=False
                    ),
                ),
                (
                    "reason_category",
                    models.CharField(
                        choices=[
                            (
                                "verification_requirement_bypass",
                                "Verification requirement bypass",
                            )
                        ],
                        default="verification_requirement_bypass",
                        editable=False,
                        max_length=64,
                    ),
                ),
                ("account_approval_required", models.BooleanField(editable=False)),
                ("cleaner_verification_required", models.BooleanField(editable=False)),
                ("phone_verification_required", models.BooleanField(editable=False)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="pilot_evidence_exclusion",
                        to="accounts.user",
                    ),
                ),
            ],
            options={"ordering": ["-excluded_at"]},
        )
    ]
