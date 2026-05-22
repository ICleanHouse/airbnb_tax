"""
Tests for notifications.tasks.send_admin_new_account_email.

Uses Django's in-memory email backend so no real SMTP connection is made.
Celery is not running — tasks execute synchronously via the fallback stub
(or via .apply() when Celery IS installed with CELERY_TASK_ALWAYS_EAGER).
"""
from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User


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


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SendAdminNewAccountEmailTaskTests(TestCase):
    """Unit tests for the task function itself."""

    def _run_task(self, user_id: int):
        """Call the task synchronously via Celery's .apply()."""
        from apps.notifications.tasks import send_admin_new_account_email
        return send_admin_new_account_email.apply(args=[user_id])

    # ------------------------------------------------------------------
    # Happy path
    # ------------------------------------------------------------------

    def test_sends_email_to_single_admin(self):
        admin = _make_user(email="admin@example.com", role=User.Role.ADMIN)
        new_user = _make_user(
            email="host@example.com",
            role=User.Role.HOST,
            phone_number="+359888000111",
        )
        new_user.first_name = "Test"
        new_user.last_name = "Host"
        new_user.save()

        self._run_task(new_user.id)

        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertIn(admin.email, msg.recipients())
        self.assertIn("awaiting approval", msg.subject)
        self.assertIn(new_user.email, msg.body)
        self.assertIn("Host", msg.body)  # role display

    def test_sends_to_multiple_admins(self):
        admin1 = _make_user(email="admin1@example.com", role=User.Role.ADMIN)
        admin2 = _make_user(email="admin2@example.com", role=User.Role.ADMIN)
        new_user = _make_user(email="cleaner@example.com", role=User.Role.CLEANER)

        self._run_task(new_user.id)

        self.assertEqual(len(mail.outbox), 1)
        recipients = mail.outbox[0].recipients()
        self.assertIn(admin1.email, recipients)
        self.assertIn(admin2.email, recipients)

    def test_sends_to_staff_user_even_without_admin_role(self):
        """is_staff=True users should also receive the notification."""
        staff = _make_user(
            email="staff@example.com",
            role=User.Role.HOST,  # role is not admin but is_staff is True
            is_staff=True,
        )
        new_user = _make_user(email="agency@example.com", role=User.Role.AGENCY)

        self._run_task(new_user.id)

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(staff.email, mail.outbox[0].recipients())

    def test_email_contains_new_user_details(self):
        _make_user(email="admin@example.com", role=User.Role.ADMIN)
        new_user = _make_user(
            email="host2@example.com",
            role=User.Role.HOST,
            phone_number="+359888000222",
        )
        new_user.first_name = "Maria"
        new_user.last_name = "Ivanova"
        new_user.save()

        self._run_task(new_user.id)

        body = mail.outbox[0].body
        self.assertIn("Maria Ivanova", body)
        self.assertIn("host2@example.com", body)
        self.assertIn("+359888000222", body)

    # ------------------------------------------------------------------
    # Edge cases
    # ------------------------------------------------------------------

    def test_no_email_sent_when_no_admins_exist(self):
        new_user = _make_user(email="lonely@example.com", role=User.Role.HOST)

        self._run_task(new_user.id)

        self.assertEqual(len(mail.outbox), 0)

    def test_no_email_sent_when_admins_have_no_email_address(self):
        # Admin with blank email — should be excluded
        admin = User.objects.create_user(
            username="noemail_admin",
            email="",
            password="password123",
            role=User.Role.ADMIN,
        )
        admin.email = ""
        admin.save()

        new_user = _make_user(email="host3@example.com", role=User.Role.HOST)

        self._run_task(new_user.id)

        self.assertEqual(len(mail.outbox), 0)

    def test_gracefully_handles_deleted_user(self):
        """If the user was deleted before the task ran it should silently no-op."""
        _make_user(email="admin@example.com", role=User.Role.ADMIN)

        self._run_task(user_id=99999)  # non-existent ID

        self.assertEqual(len(mail.outbox), 0)

    def test_inactive_admin_is_excluded(self):
        inactive_admin = _make_user(
            email="inactive_admin@example.com",
            role=User.Role.ADMIN,
            is_active=False,
        )
        _make_user(email="active_admin@example.com", role=User.Role.ADMIN)
        new_user = _make_user(email="host4@example.com", role=User.Role.HOST)

        self._run_task(new_user.id)

        recipients = mail.outbox[0].recipients()
        self.assertNotIn(inactive_admin.email, recipients)
        self.assertIn("active_admin@example.com", recipients)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SignupEmailTriggerTests(TestCase):
    """
    Integration test: signing up via the API fires the admin email task.

    Without a real Celery worker, .delay() runs the task synchronously via
    the fallback stub (when Celery is not installed) or via
    CELERY_TASK_ALWAYS_EAGER (when Celery IS installed but no broker is
    running). Either way the locmem backend captures the outbound message.
    """

    def setUp(self):
        self.client = APIClient()

    def test_signup_triggers_admin_email(self):
        _make_user(email="admin@example.com", role=User.Role.ADMIN)

        response = self.client.post(
            reverse("account-signup"),
            {
                "name": "New Host",
                "email": "newhost@example.com",
                "phone_number": "+359888000999",
                "city": "Plovdiv",
                "preferred_language": User.Language.ENGLISH,
                "role": User.Role.HOST,
                "password": "password123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("admin@example.com", mail.outbox[0].recipients())
        self.assertIn("newhost@example.com", mail.outbox[0].body)

    def test_signup_does_not_fail_when_no_admins(self):
        """Signup must succeed even if there are no admin emails to notify."""
        response = self.client.post(
            reverse("account-signup"),
            {
                "name": "Solo Host",
                "email": "solohost@example.com",
                "phone_number": "+359888111222",
                "city": "Varna",
                "preferred_language": User.Language.BULGARIAN,
                "role": User.Role.HOST,
                "password": "password123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 0)
