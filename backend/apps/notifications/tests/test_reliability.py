from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

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
from apps.notifications.delivery import NotificationProviderError
from apps.notifications.contracts import EVENT_SPECS
from apps.notifications.tasks import deliver_notification
from apps.notifications.health import get_notification_health


User = get_user_model()


class NotificationEventContractTests(TestCase):
    def test_stage_one_event_contract_has_translation_and_channel_parity(self):
        expected = {
            "account.created_operator_review",
            "account.approved",
            "account.rejected",
            "account.suspended",
            "cleaner.marketplace_access_activated",
            "matching.operator_invitation",
            "offer.received",
            "application.submitted",
            "application.accepted",
            "application.rejected",
            "application.withdrawn",
            "offer.accepted",
            "offer.declined",
            "assignment.created",
            "assignment.member_delegated",
            "job.cancelled",
            "job.reschedule_proposed",
            "job.reschedule_accepted",
            "job.reschedule_declined",
            "job.incident_reported",
            "dispute.opened",
            "dispute.status_changed",
            "replacement.authorization_requested",
            "replacement.draft_created",
            "replacement.declined",
            "job.completed",
            "review.requested",
            "review.revealed",
            "job.upcoming_reminder",
        }

        self.assertTrue(expected.issubset(EVENT_SPECS))
        for event_type in expected:
            spec = EVENT_SPECS[event_type]
            self.assertEqual(set(spec.templates), {"bg", "en"})
            self.assertTrue(set(spec.channels).issubset({"in_app", "email"}))
            for template in spec.templates.values():
                self.assertTrue(template.title)
                self.assertTrue(template.body)
                if "email" in spec.channels:
                    self.assertTrue(template.email_subject)
                    self.assertTrue(template.email_body)


class NotificationOperatorHealthTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="operator@example.test",
            email="operator@example.test",
            password="Password123!",
        )
        self.host = User.objects.create_user(
            username="health-host@example.test",
            email="health-host@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )

    def test_health_counts_are_safe_and_actionable(self):
        event = NotificationEvent.objects.create(
            event_type="account.approved",
            recipient=self.host,
            language="en",
            occurrence_key="health-event",
            deduplication_key="h" * 64,
            destination="/app",
        )
        NotificationDelivery.objects.create(
            event=event,
            recipient=self.host,
            channel=NotificationDelivery.Channel.EMAIL,
            status=NotificationDelivery.Status.FINAL_FAILED,
            deduplication_key="i" * 64,
            error_category="provider_unavailable",
            error_code="timeout",
        )

        health = get_notification_health(include_runtime=False)

        self.assertEqual(health["final_failed_count"], 1)
        self.assertIn("oldest_queued_at", health)
        self.assertNotIn(self.host.email, str(health))

    @patch("apps.notifications.views.get_notification_health")
    def test_health_api_is_admin_only(self, get_health):
        get_health.return_value = {
            "worker_running": True,
            "queue_connected": True,
            "oldest_queued_at": None,
            "queued_count": 0,
            "retryable_failed_count": 0,
            "final_failed_count": 0,
        }
        client = APIClient()
        client.force_authenticate(self.host)
        self.assertEqual(client.get("/api/notifications/notifications/health/").status_code, 403)

        client.force_authenticate(self.admin)
        response = client.get("/api/notifications/notifications/health/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["worker_running"])


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


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATION_EMAIL_PROVIDER="django",
)
class NotificationEmailDeliveryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="email-recipient@example.test",
            email="email-recipient@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
            preferred_language=User.Language.ENGLISH,
        )
        with patch("apps.notifications.services.deliver_notification.apply_async"):
            result = emit_notification_event(
                NotificationEventRequest(
                    event_type="account.approved",
                    recipient_id=self.user.id,
                    occurrence_key=f"account:{self.user.id}:approved:v1",
                    source_entity_type="User",
                    source_entity_id=str(self.user.id),
                    destination="/app",
                    request_id="req_delivery_test",
                )
            )
        self.delivery = result.event.deliveries.get(
            channel=NotificationDelivery.Channel.EMAIL
        )

    def test_replaying_sent_delivery_does_not_send_a_duplicate_email(self):
        deliver_notification.run(self.delivery.id)
        deliver_notification.run(self.delivery.id)

        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.status, NotificationDelivery.Status.SENT)
        self.assertEqual(self.delivery.attempt_count, 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.delivery.attempts.count(), 1)

    @patch("apps.notifications.tasks.deliver_notification.apply_async")
    @patch("apps.notifications.tasks.send_notification_email")
    def test_transient_failure_is_retryable_then_succeeds_once(
        self, send_notification_email, apply_async
    ):
        send_notification_email.side_effect = [
            NotificationProviderError(
                category="provider_unavailable",
                code="timeout",
                retryable=True,
            ),
            "provider-message-1",
        ]

        deliver_notification.run(self.delivery.id)
        self.delivery.refresh_from_db()
        self.assertEqual(
            self.delivery.status, NotificationDelivery.Status.RETRYABLE_FAILED
        )
        apply_async.assert_called_once()

        deliver_notification.run(self.delivery.id)
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.status, NotificationDelivery.Status.SENT)
        self.assertEqual(self.delivery.attempt_count, 2)
        self.assertEqual(self.delivery.attempts.count(), 2)

    @patch("apps.notifications.tasks.send_notification_email")
    def test_permanent_failure_creates_exactly_one_operator_alert(self, send_email):
        send_email.side_effect = NotificationProviderError(
            category="recipient_invalid",
            code="invalid_recipient",
            retryable=False,
        )

        deliver_notification.run(self.delivery.id)
        deliver_notification.run(self.delivery.id)

        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.status, NotificationDelivery.Status.FINAL_FAILED)
        self.assertEqual(self.delivery.error_category, "recipient_invalid")
        self.assertEqual(self.delivery.error_code, "invalid_recipient")
        self.assertEqual(self.delivery.attempts.count(), 1)
        self.assertEqual(OperatorNotificationAlert.objects.count(), 1)

    @patch("apps.notifications.tasks.send_notification_email")
    def test_raw_provider_exception_text_is_not_persisted(self, send_email):
        secret = "customer@example.test token=super-secret private narrative"
        send_email.side_effect = RuntimeError(secret)

        deliver_notification.run(self.delivery.id)

        self.delivery.refresh_from_db()
        attempt = self.delivery.attempts.get()
        stored = " ".join(
            [
                self.delivery.error_category,
                self.delivery.error_code,
                attempt.error_category,
                attempt.error_code,
            ]
        )
        self.assertNotIn(secret, stored)
        self.assertEqual(self.delivery.status, NotificationDelivery.Status.FINAL_FAILED)

    def test_email_uses_localized_safe_contract_content(self):
        self.delivery.event.metadata = {
            "address": "1 Private Street",
            "access_code": "1234",
            "narrative": "private incident text",
        }
        self.delivery.event.save(update_fields=["metadata", "updated_at"])

        deliver_notification.run(self.delivery.id)

        message = mail.outbox[0]
        rendered = f"{message.subject} {message.body}"
        self.assertEqual(message.subject, "Your Host Cleaners account is active")
        self.assertNotIn("1 Private Street", rendered)
        self.assertNotIn("1234", rendered)
        self.assertNotIn("private incident text", rendered)
