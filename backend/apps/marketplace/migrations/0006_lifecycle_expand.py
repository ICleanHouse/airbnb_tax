import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("marketplace", "0005_unique_property_job_time"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="TurnoverLineage",
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
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "host",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="turnover_lineages",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "property",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="turnover_lineages",
                        to="properties.property",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "indexes": [
                    models.Index(
                        fields=["property", "created_at"],
                        name="lineage_property_created_idx",
                    ),
                    models.Index(
                        fields=["host", "created_at"],
                        name="lineage_host_created_idx",
                    ),
                ],
            },
        ),
        migrations.AddField(
            model_name="cleaningjob",
            name="lineage",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="attempts",
                to="marketplace.turnoverlineage",
            ),
        ),
        migrations.AddField(
            model_name="cleaningjob",
            name="replaces_job",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="replacement_job",
                to="marketplace.cleaningjob",
            ),
        ),
        migrations.AddField(
            model_name="cleaningjob",
            name="published_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cleaningjob",
            name="cancelled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cleaningjob",
            name="cancelled_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="cancelled_cleaning_jobs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="cleaningjob",
            name="cancellation_reason_code",
            field=models.CharField(
                blank=True,
                choices=[
                    ("host_change", "Host change"),
                    ("property_unavailable", "Property unavailable"),
                    ("cleaner_unavailable", "Cleaner unavailable"),
                    ("illness", "Illness"),
                    ("safety", "Safety concern"),
                    ("access", "Access problem"),
                    ("no_show", "No-show"),
                    ("scheduling_error", "Scheduling error"),
                    ("other", "Other"),
                    ("legacy_unspecified", "Legacy unspecified"),
                    (
                        "legacy_dispute_without_assignment",
                        "Legacy dispute without assignment",
                    ),
                ],
                max_length=48,
            ),
        ),
        migrations.AddField(
            model_name="cleaningjob",
            name="cancellation_note",
            field=models.CharField(blank=True, max_length=1000),
        ),
        migrations.AddField(
            model_name="cleaningjob",
            name="cancellation_notice_band",
            field=models.CharField(
                blank=True,
                choices=[
                    ("at_least_48_hours", "At least 48 hours"),
                    ("24_to_48_hours", "24 to under 48 hours"),
                    ("under_24_hours", "Under 24 hours"),
                    ("after_start", "After scheduled start"),
                    ("unknown", "Unknown"),
                ],
                max_length=32,
            ),
        ),
        migrations.CreateModel(
            name="JobLifecycleEvent",
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
                ("actor_role_snapshot", models.CharField(blank=True, max_length=32)),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("legacy_snapshot_imported", "Legacy snapshot imported"),
                            (
                                "legacy_disputed_normalized",
                                "Legacy disputed status normalized",
                            ),
                            ("job_created", "Job created"),
                            ("job_published", "Job published"),
                            ("job_assigned", "Job assigned"),
                            ("job_completed", "Job completed"),
                            ("job_cancelled", "Job cancelled"),
                            ("job_rescheduled", "Job rescheduled"),
                            ("incident_reported", "Incident reported"),
                            ("replacement_requested", "Replacement requested"),
                            ("replacement_approved", "Replacement approved"),
                            ("replacement_declined", "Replacement declined"),
                            ("replacement_withdrawn", "Replacement withdrawn"),
                            ("dispute_opened", "Dispute opened"),
                            ("dispute_updated", "Dispute updated"),
                            ("dispute_resolved", "Dispute resolved"),
                            ("dispute_dismissed", "Dispute dismissed"),
                        ],
                        max_length=48,
                    ),
                ),
                ("from_status", models.CharField(blank=True, max_length=20)),
                ("to_status", models.CharField(blank=True, max_length=20)),
                ("reason_code", models.CharField(blank=True, max_length=48)),
                (
                    "audience",
                    models.CharField(
                        choices=[
                            ("admin_only", "Admin only"),
                            ("lineage_host", "Lineage host"),
                            ("job_participants", "Job participants"),
                        ],
                        default="job_participants",
                        max_length=32,
                    ),
                ),
                ("occurred_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("request_id", models.CharField(blank=True, max_length=100)),
                (
                    "idempotency_key",
                    models.CharField(blank=True, max_length=255, null=True, unique=True),
                ),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="job_lifecycle_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "job",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="lifecycle_events",
                        to="marketplace.cleaningjob",
                    ),
                ),
                (
                    "lineage",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="lifecycle_events",
                        to="marketplace.turnoverlineage",
                    ),
                ),
            ],
            options={
                "ordering": ["occurred_at", "id"],
                "indexes": [
                    models.Index(
                        fields=["lineage", "occurred_at", "id"],
                        name="event_lineage_time_idx",
                    ),
                    models.Index(
                        fields=["job", "occurred_at", "id"],
                        name="event_job_time_idx",
                    ),
                    models.Index(
                        fields=["event_type", "occurred_at"],
                        name="event_type_time_idx",
                    ),
                ],
            },
        ),
    ]
