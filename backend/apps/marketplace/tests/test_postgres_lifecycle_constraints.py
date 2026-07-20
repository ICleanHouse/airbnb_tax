from datetime import timedelta
from unittest import skipUnless

from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.marketplace.models import CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property


@skipUnless(connection.vendor == "postgresql", "PostgreSQL-specific lifecycle verification")
class PostgreSqlLifecycleConstraintTests(TransactionTestCase):
    reset_sequences = True

    def test_partial_unique_indexes_have_actionable_predicates(self):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = current_schema()
                  AND tablename = 'marketplace_cleaningjob'
                  AND indexname IN (
                    'uq_actionable_property_slot',
                    'uq_actionable_job_per_lineage'
                  )
                ORDER BY indexname
                """
            )
            indexes = dict(cursor.fetchall())

        self.assertEqual(
            set(indexes),
            {"uq_actionable_property_slot", "uq_actionable_job_per_lineage"},
        )
        for definition in indexes.values():
            normalized = definition.lower()
            self.assertIn("unique index", normalized)
            self.assertIn("where", normalized)
            for state in ("draft", "open", "assigned"):
                self.assertIn(state, normalized)

    def test_cancelled_history_can_share_slot_with_one_actionable_attempt(self):
        host = User.objects.create_user(
            username="postgres-lineage-host",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        property = Property.objects.create(host=host, name="PG apartment", city="Sofia")
        start = timezone.now() + timedelta(days=1)
        end = start + timedelta(hours=2)
        create_cleaning_job_record(
            host=host,
            property=property,
            title="Historical attempt",
            scheduled_start=start,
            scheduled_end=end,
            status=CleaningJob.Status.CANCELLED,
        )
        actionable = create_cleaning_job_record(
            host=host,
            property=property,
            title="Actionable attempt",
            scheduled_start=start,
            scheduled_end=end,
        )

        self.assertEqual(
            CleaningJob.objects.filter(
                property=property,
                scheduled_start=start,
                scheduled_end=end,
            ).count(),
            2,
        )
        self.assertEqual(actionable.status, CleaningJob.Status.DRAFT)

