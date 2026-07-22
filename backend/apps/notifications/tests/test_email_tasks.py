"""Integration tests for signup and canonical account notifications."""

from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import SignupEmailVerification, User


def _make_user(**kwargs) -> User:
    defaults = dict(
        username=kwargs.get("email", "user@example.com"),
        email=kwargs.get("email", "user@example.com"),
        password="password123",
        role=kwargs.get("role", User.Role.HOST),
        is_active=kwargs.get("is_active", True),
        is_staff=kwargs.get("is_staff", False),
        phone_number=kwargs.get("phone_number", ""),
    )
    defaults.update(kwargs)
    return User.objects.create_user(**defaults)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_RESEND_APIKEY="",
    NOTIFICATION_EMAIL_PROVIDER="django",
    EMAIL_VER_USER_SIGNUP=True,
    SENTRY_DSN="",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class SignupEmailTriggerTests(TestCase):
    """
    Integration test: signing up via the API fires the admin email task.

    Celery eager mode is scoped to this test class so .delay() runs inside
    the test process and the locmem backend captures the outbound message.
    """

    def setUp(self):
        self.client = APIClient()

    def test_signup_triggers_admin_email(self):
        _make_user(email="admin@example.com", role=User.Role.ADMIN)
        email = "newhost@example.com"
        verification, _code = SignupEmailVerification.create_for_email(email)
        verification.verified_at = timezone.now()
        verification.save(update_fields=["verified_at"])

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("account-signup"),
                {
                    "first_name": "New",
                    "last_name": "Host",
                    "email": email,
                    "role": User.Role.HOST,
                    "password": "Password123!",
                    "password_confirm": "Password123!",
                    "email_verification_token": str(verification.token),
                },
                format="json",
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 2)
        admin_message = next(
            message for message in mail.outbox
            if "admin@example.com" in message.recipients()
        )
        self.assertNotIn(email, admin_message.body)

    def test_signup_does_not_fail_when_no_admins(self):
        """Signup must succeed even if there are no admin emails to notify."""
        email = "solohost@example.com"
        verification, _code = SignupEmailVerification.create_for_email(email)
        verification.verified_at = timezone.now()
        verification.save(update_fields=["verified_at"])
        response = self.client.post(
            reverse("account-signup"),
            {
                "first_name": "Solo",
                "last_name": "Host",
                "email": email,
                "role": User.Role.HOST,
                "password": "Password123!",
                "password_confirm": "Password123!",
                "email_verification_token": str(verification.token),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_VER_USER_SIGNUP=False)
    def test_signup_email_code_request_returns_token_when_verification_disabled(self):
        response = self.client.post(
            reverse("account-signup-email-code"),
            {
                "first_name": "Test",
                "last_name": "User",
                "email": "autoverify@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["verification_required"], False)
        self.assertIsInstance(response.data["email_verification_token"], str)
        self.assertEqual(len(mail.outbox), 0)
