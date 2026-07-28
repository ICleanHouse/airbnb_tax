from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from apps.accounts.tokens import password_reset_token
from apps.notifications.models import NotificationDelivery, NotificationEvent


User = get_user_model()


class PasswordRecoveryApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="recovery@example.com",
            email="recovery@example.com",
            password="Old-password-2048!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.SUSPENDED,
        )

    def _confirm_payload(self, user=None, token=None, password="New-password-2048!"):
        user = user or self.user
        return {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": token or password_reset_token.make_token(user),
            "password": password,
            "password_confirm": password,
        }

    def test_request_is_generic_for_existing_unknown_and_inactive_accounts(self):
        inactive = User.objects.create_user(
            username="inactive@example.com", email="inactive@example.com", password="Old-password-2048!", is_active=False
        )
        bodies = []
        for email in (" RECOVERY@example.com ", "unknown@example.com", inactive.email):
            response = self.client.post("/api/accounts/password-reset/request/", {"email": email}, format="json")
            self.assertEqual(response.status_code, 200)
            bodies.append(response.json())
        self.assertEqual(bodies[0], bodies[1])
        self.assertEqual(bodies[1], bodies[2])
        event = NotificationEvent.objects.get(event_type="account.password_reset_requested")
        self.assertEqual(event.recipient_id, self.user.id)
        self.assertEqual(event.metadata, {})
        self.assertNotIn("recovery@example.com", str(event.__dict__))

    @override_settings(PASSWORD_RESET_EMAIL_LIMIT=1, PASSWORD_RESET_IP_LIMIT=10, PASSWORD_RESET_RATE_WINDOW_SECONDS=3600)
    def test_request_limit_normalizes_email_and_keeps_generic_response(self):
        first = self.client.post("/api/accounts/password-reset/request/", {"email": "Recovery@Example.com"}, format="json")
        second = self.client.post("/api/accounts/password-reset/request/", {"email": " recovery@example.com "}, format="json")
        self.assertEqual(first.status_code, second.status_code)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(NotificationEvent.objects.filter(event_type="account.password_reset_requested").count(), 1)

    def test_confirm_changes_password_without_changing_role_or_status_and_emits_once(self):
        response = self.client.post("/api/accounts/password-reset/confirm/", self._confirm_payload(), format="json")
        self.assertEqual(response.status_code, 204)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("New-password-2048!"))
        self.assertEqual(self.user.role, User.Role.HOST)
        self.assertEqual(self.user.account_status, User.AccountStatus.SUSPENDED)
        event = NotificationEvent.objects.get(event_type="account.password_reset_completed")
        self.assertEqual(event.metadata, {})
        self.assertEqual(NotificationDelivery.objects.filter(event=event).count(), 2)

    def test_invalid_cross_user_and_reused_tokens_fail(self):
        other = User.objects.create_user(username="other@example.com", email="other@example.com", password="Old-password-2048!")
        token = password_reset_token.make_token(self.user)
        cross_user = self.client.post("/api/accounts/password-reset/confirm/", self._confirm_payload(other, token), format="json")
        self.assertEqual(cross_user.status_code, 400)
        success = self.client.post("/api/accounts/password-reset/confirm/", self._confirm_payload(token=token), format="json")
        self.assertEqual(success.status_code, 204)
        reuse = self.client.post("/api/accounts/password-reset/confirm/", self._confirm_payload(token=token), format="json")
        self.assertEqual(reuse.status_code, 400)

    def test_password_mismatch_and_validator_failure_are_controlled(self):
        mismatch = self._confirm_payload()
        mismatch["password_confirm"] = "different"
        response = self.client.post("/api/accounts/password-reset/confirm/", mismatch, format="json")
        self.assertEqual(response.status_code, 400)
        weak = self.client.post("/api/accounts/password-reset/confirm/", self._confirm_payload(password="12345678"), format="json")
        self.assertEqual(weak.status_code, 400)

    def test_existing_session_is_invalidated_by_password_change(self):
        authenticated = APIClient()
        authenticated.login(username="recovery@example.com", password="Old-password-2048!")
        self.user.refresh_from_db()
        response = self.client.post("/api/accounts/password-reset/confirm/", self._confirm_payload(), format="json")
        self.assertEqual(response.status_code, 204)
        self.assertIn(authenticated.get("/api/accounts/me/").status_code, {401, 403})
