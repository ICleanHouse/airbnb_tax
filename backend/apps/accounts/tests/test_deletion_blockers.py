from datetime import timedelta

from apps.accounts.cleanup import cleanup_history_free_accounts
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AccountRetentionHold, User
from apps.connections.models import Connection
from apps.marketplace.models import CleaningJob
from apps.marketplace.services import create_cleaning_job
from apps.properties.models import Property


class AccountDeletionBlockerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = User.objects.create_user(
            username="deletion-host",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.property = Property.objects.create(host=self.host, name="Protected history", city="Sofia")

    def test_active_obligation_blocks_deletion_without_logging_user_out(self):
        create_cleaning_job(
            actor=self.host,
            property=self.property,
            title="Active job",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
        )
        self.client.force_authenticate(self.host)

        response = self.client.delete("/api/accounts/me/")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "account_deletion_blocked_active_obligations")
        self.assertTrue(User.objects.filter(id=self.host.id).exists())

    def test_historical_marketplace_record_closes_and_anonymizes(self):
        job = create_cleaning_job(
            actor=self.host,
            property=self.property,
            title="Historical job",
            scheduled_start=timezone.now() - timedelta(days=2),
            scheduled_end=timezone.now() - timedelta(days=2, hours=-2),
        )
        CleaningJob.objects.filter(pk=job.pk).update(status=CleaningJob.Status.COMPLETED)
        self.client.force_authenticate(self.host)

        response = self.client.delete("/api/accounts/me/")

        self.assertEqual(response.status_code, 202)
        self.host.refresh_from_db()
        self.assertFalse(self.host.is_active)
        self.assertIsNotNone(self.host.closed_at)
        self.assertIsNotNone(self.host.anonymized_at)
        self.assertTrue(User.objects.filter(id=self.host.id).exists())

    def test_account_without_marketplace_history_is_closed_pending_retention_deletion(self):
        user = User.objects.create_user(
            username="history-free",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.client.force_authenticate(user)

        response = self.client.delete("/api/accounts/me/")

        self.assertEqual(response.status_code, 202)
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertIsNotNone(user.closed_at)

    def test_counterpart_connection_is_preserved_through_closure(self):
        cleaner = User.objects.create_user(
            username="connection-cleaner",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        connection = Connection.objects.create(requester=self.host, addressee=cleaner)
        self.client.force_authenticate(self.host)

        response = self.client.delete("/api/accounts/me/")

        self.assertEqual(response.status_code, 202)
        self.assertTrue(Connection.objects.filter(pk=connection.pk).exists())
        self.host.refresh_from_db()
        self.assertFalse(self.host.is_active)

    def test_active_retention_hold_blocks_closure(self):
        admin = User.objects.create_superuser("admin", "admin@example.com", "password123")
        AccountRetentionHold.objects.create(
            user=self.host,
            category=AccountRetentionHold.Category.LEGAL,
            reason_code="legal_review",
            placed_by=admin,
        )
        self.client.force_authenticate(self.host)

        response = self.client.delete("/api/accounts/me/")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "account_closure_blocked_retention_hold")
        self.host.refresh_from_db()
        self.assertTrue(self.host.is_active)

    def test_repeated_closure_is_idempotent(self):
        self.client.force_authenticate(self.host)

        first = self.client.delete("/api/accounts/me/")
        second = self.client.delete("/api/accounts/me/")

        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 202)
        self.host.refresh_from_db()
        self.assertFalse(self.host.is_active)
        self.assertIsNotNone(self.host.anonymized_at)

    def test_cleanup_deletes_history_free_closed_account_after_released_hold(self):
        admin = User.objects.create_superuser("cleanup-admin", "cleanup-admin@example.com", "password123")
        user = User.objects.create_user(
            username="expired-history-free",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
            is_active=False,
            closed_at=timezone.now() - timedelta(days=31),
            anonymized_at=timezone.now() - timedelta(days=31),
        )
        AccountRetentionHold.objects.create(
            user=user,
            category=AccountRetentionHold.Category.SUPPORT,
            reason_code="support_review",
            placed_by=admin,
            released_at=timezone.now() - timedelta(days=1),
            released_by=admin,
            release_reason_code="review_complete",
        )

        self.assertEqual(cleanup_history_free_accounts(limit=10), 1)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())
        hold = AccountRetentionHold.objects.get(reason_code="support_review")
        self.assertIsNone(hold.user_id)
