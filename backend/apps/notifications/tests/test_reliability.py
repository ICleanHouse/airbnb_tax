from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.notifications.models import (
    Notification,
    NotificationDelivery,
    NotificationDeliveryAttempt,
    NotificationEvent,
    OperatorNotificationAlert,
)
from apps.notifications.services import (
    NotificationEventRequest,
    NotificationEventValidationError,
    emit_notification_event,
)


User = get_user_model()


class NotificationReliabilityModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="recipient@example.test",
            email="recipient@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )

    def test_delivery_deduplication_key_is_database_unique(self):
        event = NotificationEvent.objects.create(
            event_type="account.approved",
            recipient=self.user,
            language="en",
            occurrence_key="account:1:v1",
            deduplication_key="e" * 64,
            destination="/app",
        )
        NotificationDelivery.objects.create(
            event=event,
            recipient=self.user,
            channel=NotificationDelivery.Channel.EMAIL,
            deduplication_key="d" * 64,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                NotificationDelivery.objects.create(
                    event=event,
                    recipient=self.user,
                    channel=NotificationDelivery.Channel.IN_APP,
                    deduplication_key="d" * 64,
                )

    def test_attempt_number_is_unique_per_delivery(self):
        event = NotificationEvent.objects.create(
            event_type="account.approved",
            recipient=self.user,
            language="en",
            occurrence_key="account:1:v1",
            deduplication_key="a" * 64,
            destination="/app",
        )
        delivery = NotificationDelivery.objects.create(
            event=event,
            recipient=self.user,
            channel=NotificationDelivery.Channel.EMAIL,
            deduplication_key="b" * 64,
        )
        NotificationDeliveryAttempt.objects.create(delivery=delivery, attempt_number=1)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                NotificationDeliveryAttempt.objects.create(
                    delivery=delivery,
                    attempt_number=1,
                )

    def test_operator_alert_is_one_to_one_with_final_failed_delivery(self):
        event = NotificationEvent.objects.create(
            event_type="account.approved",
            recipient=self.user,
            language="en",
            occurrence_key="account:1:v1",
            deduplication_key="c" * 64,
            destination="/app",
        )
        delivery = NotificationDelivery.objects.create(
            event=event,
            recipient=self.user,
            channel=NotificationDelivery.Channel.EMAIL,
            status=NotificationDelivery.Status.FINAL_FAILED,
            deduplication_key="f" * 64,
        )
        OperatorNotificationAlert.objects.create(delivery=delivery)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OperatorNotificationAlert.objects.create(delivery=delivery)


class NotificationEventEmissionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="host@example.test",
            email="host@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
            preferred_language=User.Language.ENGLISH,
        )

    def request(self, **overrides):
        values = {
            "event_type": "account.approved",
            "recipient_id": self.user.id,
            "occurrence_key": f"account:{self.user.id}:v1",
            "source_entity_type": "User",
            "source_entity_id": str(self.user.id),
            "destination": "/app",
            "request_id": "req_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        }
        values.update(overrides)
        return NotificationEventRequest(**values)

    @patch("apps.notifications.services.deliver_notification.apply_async")
    def test_committed_event_creates_one_in_app_notification_and_queues_email_after_commit(
        self, apply_async
    ):
        with self.captureOnCommitCallbacks(execute=True):
            result = emit_notification_event(self.request())

        self.assertTrue(result.created)
        self.assertEqual(NotificationEvent.objects.count(), 1)
        self.assertEqual(NotificationDelivery.objects.count(), 2)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(
            NotificationDeliveryAttempt.objects.filter(
                delivery__channel=NotificationDelivery.Channel.IN_APP
            ).count(),
            1,
        )
        email_delivery = NotificationDelivery.objects.get(
            channel=NotificationDelivery.Channel.EMAIL
        )
        apply_async.assert_called_once_with(args=[email_delivery.id])

    @patch("apps.notifications.services.deliver_notification.apply_async")
    def test_replaying_event_emission_returns_stable_result_without_duplicates(
        self, apply_async
    ):
        with self.captureOnCommitCallbacks(execute=True):
            first = emit_notification_event(self.request())
        with self.captureOnCommitCallbacks(execute=True):
            second = emit_notification_event(self.request())

        self.assertTrue(first.created)
        self.assertFalse(second.created)
        self.assertEqual(first.event.id, second.event.id)
        self.assertEqual(NotificationEvent.objects.count(), 1)
        self.assertEqual(NotificationDelivery.objects.count(), 2)
        self.assertEqual(Notification.objects.count(), 1)
        apply_async.assert_called_once()

    @patch("apps.notifications.services.deliver_notification.apply_async")
    def test_rolled_back_transaction_creates_no_event_and_schedules_no_task(
        self, apply_async
    ):
        try:
            with transaction.atomic():
                emit_notification_event(self.request())
                raise RuntimeError("force rollback")
        except RuntimeError:
            pass

        self.assertFalse(NotificationEvent.objects.exists())
        self.assertFalse(NotificationDelivery.objects.exists())
        self.assertFalse(Notification.objects.exists())
        apply_async.assert_not_called()

    def test_recipient_language_controls_in_app_content(self):
        emit_notification_event(self.request())
        english = Notification.objects.get()
        self.assertEqual(english.title, "Marketplace account active")

        bulgarian_user = User.objects.create_user(
            username="host-bg@example.test",
            email="host-bg@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
            preferred_language=User.Language.BULGARIAN,
        )
        emit_notification_event(
            self.request(
                recipient_id=bulgarian_user.id,
                occurrence_key=f"account:{bulgarian_user.id}:v1",
                source_entity_id=str(bulgarian_user.id),
            )
        )
        bulgarian = Notification.objects.get(user=bulgarian_user)
        self.assertEqual(bulgarian.title, "Акаунтът в платформата е активен")

    def test_unsupported_language_falls_back_to_bulgarian(self):
        User.objects.filter(id=self.user.id).update(preferred_language="de")

        emit_notification_event(self.request())

        event = NotificationEvent.objects.get()
        self.assertEqual(event.language, "bg")

    def test_unapproved_metadata_and_unsafe_destinations_are_rejected(self):
        for request in (
            self.request(metadata={"address": "1 Private Street"}),
            self.request(destination="https://evil.example/steal"),
            self.request(destination="//evil.example/steal"),
            self.request(destination="/host?token=secret"),
        ):
            with self.subTest(request=request):
                with self.assertRaises(NotificationEventValidationError):
                    emit_notification_event(request)

        self.assertFalse(NotificationEvent.objects.exists())

