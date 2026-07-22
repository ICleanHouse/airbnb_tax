from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import CleanerProfile, User
from apps.marketplace.models import Assignment, CleaningJob
from apps.marketplace.services import (
    MarketplaceError,
    cancel_job,
    create_cleaning_job,
    publish_job,
    send_operator_matching_invitation,
    send_upcoming_work_reminder,
)
from apps.notifications.models import NotificationDelivery, NotificationEvent
from apps.properties.models import Property


class MarketplaceNotificationReliabilityTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="notification-operator", email="operator@example.test", password="password123"
        )
        self.host = User.objects.create_user(
            username="notification-host", email="host@example.test", password="password123",
            role=User.Role.HOST, account_status=User.AccountStatus.APPROVED,
        )
        self.cleaner = User.objects.create_user(
            username="notification-cleaner", email="cleaner@example.test", password="password123",
            role=User.Role.CLEANER, account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.cleaner,
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        self.property = Property.objects.create(
            host=self.host, name="Private home", address="Never expose this address", city="Sofia"
        )
        self.start = timezone.now() + timedelta(days=2)
        self.job = create_cleaning_job(
            actor=self.host,
            property=self.property,
            title="Private job title",
            scheduled_start=self.start,
            scheduled_end=self.start + timedelta(hours=2),
        )

    def assign(self):
        self.job.status = CleaningJob.Status.ASSIGNED
        self.job.save(update_fields=["status", "updated_at"])
        return Assignment.objects.create(job=self.job, cleaner=self.cleaner)

    def test_repeated_operator_reminder_occurrence_is_idempotent_for_exact_recipients(self):
        self.assign()
        occurrence = timezone.now().replace(microsecond=0)

        first = send_upcoming_work_reminder(
            job=self.job, actor=self.admin, occurrence_at=occurrence
        )
        second = send_upcoming_work_reminder(
            job=self.job, actor=self.admin, occurrence_at=occurrence
        )

        self.assertEqual([result.created for result in first], [True, True])
        self.assertEqual([result.created for result in second], [False, False])
        events = NotificationEvent.objects.filter(event_type="job.upcoming_reminder")
        self.assertEqual(set(events.values_list("recipient_id", flat=True)), {self.host.id, self.cleaner.id})
        self.assertEqual(events.count(), 2)
        self.assertEqual(
            NotificationDelivery.objects.filter(event__in=events).count(), 4
        )

    def test_matching_invitation_requires_operator_and_explicit_eligible_recipient(self):
        publish_job(self.job, actor=self.host)
        with self.assertRaises(MarketplaceError):
            send_operator_matching_invitation(
                job=self.job,
                cleaner=self.cleaner,
                actor=self.host,
                occurrence_token="pilot-1",
            )

        result = send_operator_matching_invitation(
            job=self.job,
            cleaner=self.cleaner,
            actor=self.admin,
            occurrence_token="pilot-1",
        )
        self.assertTrue(result.created)
        self.assertEqual(result.event.recipient_id, self.cleaner.id)

    @patch("apps.notifications.services.deliver_notification.apply_async", side_effect=RuntimeError("broker unavailable"))
    def test_queue_failure_does_not_rollback_successful_cancellation(self, _apply_async):
        self.assign()

        with self.captureOnCommitCallbacks(execute=True):
            cancel_job(
                job=self.job,
                actor=self.host,
                reason_code=CleaningJob.CancellationReason.OTHER,
            )

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, CleaningJob.Status.CANCELLED)
        delivery = NotificationDelivery.objects.get(
            event__event_type="job.cancelled",
            channel=NotificationDelivery.Channel.EMAIL,
        )
        self.assertEqual(delivery.status, NotificationDelivery.Status.QUEUED)
        self.assertEqual(delivery.error_code, "broker_publish_failed")
