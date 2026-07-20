import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Count, F, Q


ACTIONABLE = "'draft', 'open', 'assigned'"
LINEAGE_NOT_NULL_CHECK = "marketplace_job_lineage_not_null_tmp"


def validate_lifecycle_data(apps, schema_editor):
    CleaningJob = apps.get_model("marketplace", "CleaningJob")
    JobLifecycleEvent = apps.get_model("marketplace", "JobLifecycleEvent")
    Assignment = apps.get_model("marketplace", "Assignment")

    if CleaningJob.objects.filter(lineage_id__isnull=True).exists():
        raise RuntimeError("Cannot constrain lifecycle data: jobs without lineages exist.")
    if CleaningJob.objects.exclude(
        property_id=F("lineage__property_id"), host_id=F("lineage__host_id")
    ).exists():
        raise RuntimeError("Cannot constrain lifecycle data: job/lineage ownership mismatch.")
    if CleaningJob.objects.filter(status="disputed").exists():
        raise RuntimeError("Cannot constrain lifecycle data: disputed jobs remain.")
    if CleaningJob.objects.filter(replaces_job_id=F("id")).exists():
        raise RuntimeError("Cannot constrain lifecycle data: self replacement exists.")
    if (
        CleaningJob.objects.filter(status__in=["draft", "open", "assigned"])
        .values("property_id", "scheduled_start", "scheduled_end")
        .annotate(row_count=Count("id"))
        .filter(row_count__gt=1)
        .exists()
    ):
        raise RuntimeError("Cannot constrain lifecycle data: actionable slot conflict.")
    if (
        CleaningJob.objects.filter(status__in=["draft", "open", "assigned"])
        .values("lineage_id")
        .annotate(row_count=Count("id"))
        .filter(row_count__gt=1)
        .exists()
    ):
        raise RuntimeError("Cannot constrain lifecycle data: actionable lineage conflict.")
    predecessor_by_job = dict(
        CleaningJob.objects.exclude(replaces_job_id__isnull=True).values_list(
            "id", "replaces_job_id"
        )
    )
    for job_id in predecessor_by_job:
        visited = set()
        cursor = job_id
        while cursor in predecessor_by_job:
            if cursor in visited:
                raise RuntimeError("Cannot constrain lifecycle data: replacement cycle exists.")
            visited.add(cursor)
            cursor = predecessor_by_job[cursor]
    if JobLifecycleEvent.objects.exclude(lineage_id=F("job__lineage_id")).exists():
        raise RuntimeError("Cannot constrain lifecycle data: event/lineage mismatch.")
    if Assignment.objects.filter(
        job__status="cancelled",
        cancelled_at__isnull=True,
    ).exists():
        raise RuntimeError(
            "Cannot constrain lifecycle data: cancelled assignment still occupies its interval."
        )


def create_partial_unique_indexes(apps, schema_editor):
    quote = schema_editor.quote_name
    table = quote("marketplace_cleaningjob")
    slot_index = quote("uq_actionable_property_slot")
    lineage_index = quote("uq_actionable_job_per_lineage")
    concurrently = " CONCURRENTLY" if schema_editor.connection.vendor == "postgresql" else ""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            f"CREATE UNIQUE INDEX{concurrently} IF NOT EXISTS {slot_index} "
            f"ON {table} (property_id, scheduled_start, scheduled_end) "
            f"WHERE status IN ({ACTIONABLE})"
        )
        cursor.execute(
            f"CREATE UNIQUE INDEX{concurrently} IF NOT EXISTS {lineage_index} "
            f"ON {table} (lineage_id) WHERE status IN ({ACTIONABLE})"
        )


def drop_partial_unique_indexes(apps, schema_editor):
    quote = schema_editor.quote_name
    concurrently = " CONCURRENTLY" if schema_editor.connection.vendor == "postgresql" else ""
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            f"DROP INDEX{concurrently} IF EXISTS {quote('uq_actionable_property_slot')}"
        )
        cursor.execute(
            f"DROP INDEX{concurrently} IF EXISTS {quote('uq_actionable_job_per_lineage')}"
        )


def add_and_validate_lineage_not_null_check(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    table = schema_editor.quote_name("marketplace_cleaningjob")
    constraint = schema_editor.quote_name(LINEAGE_NOT_NULL_CHECK)
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT convalidated FROM pg_constraint "
            "WHERE conrelid = 'marketplace_cleaningjob'::regclass AND conname = %s",
            [LINEAGE_NOT_NULL_CHECK],
        )
        existing = cursor.fetchone()
        if existing is None:
            cursor.execute(
                f"ALTER TABLE {table} ADD CONSTRAINT {constraint} "
                "CHECK (lineage_id IS NOT NULL) NOT VALID"
            )
        if existing is None or not existing[0]:
            cursor.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {constraint}")


def drop_lineage_not_null_check(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    table = schema_editor.quote_name("marketplace_cleaningjob")
    constraint = schema_editor.quote_name(LINEAGE_NOT_NULL_CHECK)
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}"
        )


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("marketplace", "0007_lifecycle_backfill"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(validate_lifecycle_data, migrations.RunPython.noop),
        migrations.RunPython(
            add_and_validate_lineage_not_null_check,
            drop_lineage_not_null_check,
        ),
        migrations.AlterField(
            model_name="cleaningjob",
            name="lineage",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="attempts",
                to="marketplace.turnoverlineage",
            ),
        ),
        migrations.RunPython(
            drop_lineage_not_null_check,
            migrations.RunPython.noop,
        ),
        migrations.RunPython(create_partial_unique_indexes, drop_partial_unique_indexes),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddConstraint(
                    model_name="cleaningjob",
                    constraint=models.UniqueConstraint(
                        condition=Q(status__in=["draft", "open", "assigned"]),
                        fields=("property", "scheduled_start", "scheduled_end"),
                        name="uq_actionable_property_slot",
                    ),
                ),
                migrations.AddConstraint(
                    model_name="cleaningjob",
                    constraint=models.UniqueConstraint(
                        condition=Q(status__in=["draft", "open", "assigned"]),
                        fields=("lineage",),
                        name="uq_actionable_job_per_lineage",
                    ),
                ),
            ]
        ),
        migrations.RemoveConstraint(
            model_name="cleaningjob",
            name="unique_property_job_time",
        ),
        migrations.AddConstraint(
            model_name="cleaningjob",
            constraint=models.CheckConstraint(
                condition=Q(scheduled_end__gt=F("scheduled_start")),
                name="job_end_after_start",
            ),
        ),
        migrations.AddConstraint(
            model_name="cleaningjob",
            constraint=models.CheckConstraint(
                condition=~Q(id=F("replaces_job_id")),
                name="job_replacement_not_self",
            ),
        ),
        migrations.AddConstraint(
            model_name="cleaningjob",
            constraint=models.CheckConstraint(
                condition=(
                    Q(status="cancelled", cancelled_at__isnull=False)
                    & ~Q(cancellation_reason_code="")
                    & ~Q(cancellation_notice_band="")
                )
                | Q(
                    ~Q(status="cancelled"),
                    cancelled_at__isnull=True,
                    cancelled_by__isnull=True,
                    cancellation_reason_code="",
                    cancellation_note="",
                    cancellation_notice_band="",
                ),
                name="job_cancellation_fields_consistent",
            ),
        ),
        migrations.AddIndex(
            model_name="cleaningjob",
            index=models.Index(
                fields=["lineage", "scheduled_start"], name="job_lineage_start_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="cleaningjob",
            index=models.Index(
                fields=["status", "scheduled_start"], name="job_status_start_idx"
            ),
        ),
        migrations.AlterField(
            model_name="cleaningjob",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("open", "Open"),
                    ("assigned", "Assigned"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                default="draft",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="cleaningjob",
            name="property",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="cleaning_jobs",
                to="properties.property",
            ),
        ),
        migrations.AlterField(
            model_name="cleaningjob",
            name="host",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="cleaning_jobs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="cleanerapplication",
            name="job",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="applications",
                to="marketplace.cleaningjob",
            ),
        ),
        migrations.AlterField(
            model_name="cleanerapplication",
            name="cleaner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="cleaning_applications",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="assignment",
            name="job",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="assignment",
                to="marketplace.cleaningjob",
            ),
        ),
        migrations.AlterField(
            model_name="assignment",
            name="cleaner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="cleaning_assignments",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="assignment",
            name="assigned_member",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="agency_assigned_cleanings",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
