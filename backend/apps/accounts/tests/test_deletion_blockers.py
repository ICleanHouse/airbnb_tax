from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
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

    def test_historical_marketplace_record_routes_deletion_to_support(self):
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

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "account_deletion_requires_support")
        self.assertIn("support_channel", response.json()["fields"])
        self.assertTrue(User.objects.filter(id=self.host.id).exists())

    def test_account_without_marketplace_history_can_still_be_deleted(self):
        user = User.objects.create_user(
            username="history-free",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.client.force_authenticate(user)

        response = self.client.delete("/api/accounts/me/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(id=user.id).exists())
