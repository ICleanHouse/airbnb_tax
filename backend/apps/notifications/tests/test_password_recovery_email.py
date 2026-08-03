from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from apps.accounts.tokens import password_reset_token
from apps.notifications.models import NotificationDelivery, NotificationEvent
from apps.notifications.tasks import deliver_notification


User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    NOTIFICATION_EMAIL_PROVIDER="django",
    FRONTEND_URL="https://app.example.test/base/ignored",
)
class PasswordRecoveryEmailDeliveryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="recovery-delivery@example.test",
            email="recovery-delivery@example.test",
            password="Old-password-2048!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )

    def _confirm_payload(self):
        return {
            "uid": urlsafe_base64_encode(force_bytes(self.user.pk)),
            "token": password_reset_token.make_token(self.user),
            "password": "New-password-2048!",
            "password_confirm": "New-password-2048!",
        }

    def test_reset_request_dispatches_only_after_commit_and_renders_fixed_frontend_route(self):
        with patch("apps.notifications.services.deliver_notification.apply_async") as apply_async:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(
                    "/api/accounts/password-reset/request/",
                    {"email": self.user.email},
                    format="json",
                )

        self.assertEqual(response.status_code, 200)
        event = NotificationEvent.objects.get(event_type="account.password_reset_requested")
        self.assertEqual(event.metadata, {})
        self.assertEqual(event.destination, "/app")
        delivery = event.deliveries.get(channel=NotificationDelivery.Channel.EMAIL)
        apply_async.assert_called_once_with(args=[delivery.id])

        deliver_notification.run(delivery.id)

        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        expected_uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.assertIn(
            f"https://app.example.test/{event.language}/reset-password?uid={expected_uid}&token=",
            body,
        )
        self.assertNotIn("/base/ignored", body)
        self.assertNotIn("Old-password-2048!", body)

    def test_completed_reset_notification_contains_no_password_or_reset_token(self):
        payload = self._confirm_payload()
        token = payload["token"]
        response = self.client.post("/api/accounts/password-reset/confirm/", payload, format="json")
        self.assertEqual(response.status_code, 204)

        event = NotificationEvent.objects.get(event_type="account.password_reset_completed")
        self.assertEqual(event.metadata, {})
        delivery = event.deliveries.get(channel=NotificationDelivery.Channel.EMAIL)
        deliver_notification.run(delivery.id)

        rendered = f"{mail.outbox[0].subject} {mail.outbox[0].body}"
        self.assertNotIn(payload["password"], rendered)
        self.assertNotIn(token, rendered)
        self.assertNotIn("token=", rendered)
