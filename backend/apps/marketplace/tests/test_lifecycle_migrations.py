from datetime import timedelta
from importlib import import_module

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.properties.models import Property


class LifecycleMigrationTests(TransactionTestCase):
    migrate_from = [("marketplace", "0005_unique_property_job_time")]
    migrate_to = [("marketplace", "0008_lifecycle_constraints")]

    def setUp(self):
        super().setUp()
        self.executor = MigrationExecutor(connection)
        self.executor.migrate(self.migrate_from)
        old_apps = self.executor.loader.project_state(self.migrate_from).apps
        CleaningJob = old_apps.get_model("marketplace", "CleaningJob")
        Assignment = old_apps.get_model("marketplace", "Assignment")

        host = User.objects.create_user(
            username="legacy-lifecycle-host",
            role="host",
            account_status="approved",
        )
        cleaner = User.objects.create_user(
            username="legacy-lifecycle-cleaner",
            role="cleaner",
            account_status="approved",
        )
        property = Property.objects.create(host=host, name="Legacy apartment", city="Sofia")
        start = timezone.now() + timedelta(days=1)
        self.cancelled_id = CleaningJob.objects.create(
            property_id=property.id,
            host_id=host.id,
            title="Legacy cancelled",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            status="cancelled",
        ).id
        self.cancelled_assignment_id = Assignment.objects.create(
            job_id=self.cancelled_id,
            cleaner_id=cleaner.id,
        ).id
        self.disputed_completed_id = CleaningJob.objects.create(
            property_id=property.id,
            host_id=host.id,
            title="Legacy disputed completed",
            scheduled_start=start + timedelta(hours=3),
            scheduled_end=start + timedelta(hours=5),
            status="disputed",
        ).id
        Assignment.objects.create(
            job_id=self.disputed_completed_id,
            cleaner_id=cleaner.id,
            completed_at=timezone.now(),
        )
        self.disputed_cancelled_id = CleaningJob.objects.create(
            property_id=property.id,
            host_id=host.id,
            title="Legacy disputed cancelled",
            scheduled_start=start + timedelta(hours=6),
            scheduled_end=start + timedelta(hours=8),
            status="disputed",
        ).id
        Assignment.objects.create(
            job_id=self.disputed_cancelled_id,
            cleaner_id=cleaner.id,
            cancelled_at=timezone.now(),
        )
        self.disputed_assigned_id = CleaningJob.objects.create(
            property_id=property.id,
            host_id=host.id,
            title="Legacy disputed active assignment",
            scheduled_start=start + timedelta(hours=9),
            scheduled_end=start + timedelta(hours=11),
            status="disputed",
        ).id
        Assignment.objects.create(
            job_id=self.disputed_assigned_id,
            cleaner_id=cleaner.id,
        )
        self.disputed_without_assignment_id = CleaningJob.objects.create(
            property_id=property.id,
            host_id=host.id,
            title="Legacy disputed without assignment",
            scheduled_start=start + timedelta(hours=12),
            scheduled_end=start + timedelta(hours=14),
            status="disputed",
        ).id

        self.executor = MigrationExecutor(connection)
        self.executor.migrate(self.migrate_to)
        self.apps = self.executor.loader.project_state(self.migrate_to).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_backfill_is_deterministic_and_normalizes_legacy_states(self):
        CleaningJob = self.apps.get_model("marketplace", "CleaningJob")
        TurnoverLineage = self.apps.get_model("marketplace", "TurnoverLineage")
        JobLifecycleEvent = self.apps.get_model("marketplace", "JobLifecycleEvent")

        cancelled = CleaningJob.objects.get(pk=self.cancelled_id)
        disputed_completed = CleaningJob.objects.get(pk=self.disputed_completed_id)
        disputed_cancelled = CleaningJob.objects.get(pk=self.disputed_cancelled_id)
        disputed_assigned = CleaningJob.objects.get(pk=self.disputed_assigned_id)
        disputed_without_assignment = CleaningJob.objects.get(
            pk=self.disputed_without_assignment_id
        )
        self.assertEqual(cancelled.lineage_id, cancelled.id)
        self.assertEqual(disputed_completed.lineage_id, disputed_completed.id)
        self.assertEqual(TurnoverLineage.objects.count(), 5)
        self.assertEqual(cancelled.status, "cancelled")
        self.assertEqual(cancelled.cancellation_reason_code, "legacy_unspecified")
        self.assertEqual(cancelled.cancellation_notice_band, "unknown")
        self.assertIsNone(cancelled.published_at)
        self.assertEqual(disputed_completed.status, "completed")
        self.assertEqual(disputed_cancelled.status, "cancelled")
        self.assertEqual(disputed_assigned.status, "assigned")
        self.assertEqual(disputed_without_assignment.status, "cancelled")
        self.assertEqual(
            disputed_without_assignment.cancellation_reason_code,
            "legacy_dispute_without_assignment",
        )
        Assignment = self.apps.get_model("marketplace", "Assignment")
        self.assertIsNotNone(
            Assignment.objects.get(pk=self.cancelled_assignment_id).cancelled_at
        )
        self.assertEqual(
            JobLifecycleEvent.objects.filter(event_type="legacy_snapshot_imported").count(),
            5,
        )
        self.assertEqual(
            JobLifecycleEvent.objects.filter(
                event_type="legacy_disputed_normalized"
            ).count(),
            4,
        )
        self.assertTrue(
            JobLifecycleEvent.objects.filter(
                job_id=self.disputed_completed_id,
                event_type="legacy_disputed_normalized",
                from_status="disputed",
                to_status="completed",
            ).exists()
        )

    def test_backfill_can_be_retried_without_duplicate_lineages_or_events(self):
        TurnoverLineage = self.apps.get_model("marketplace", "TurnoverLineage")
        JobLifecycleEvent = self.apps.get_model("marketplace", "JobLifecycleEvent")
        before = (TurnoverLineage.objects.count(), JobLifecycleEvent.objects.count())
        migration = import_module(
            "apps.marketplace.migrations.0007_lifecycle_backfill"
        )

        with connection.schema_editor() as schema_editor:
            migration.backfill_lineages(self.apps, schema_editor)

        self.assertEqual(
            (TurnoverLineage.objects.count(), JobLifecycleEvent.objects.count()),
            before,
        )
