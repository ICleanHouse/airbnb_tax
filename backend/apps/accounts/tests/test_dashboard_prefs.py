from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User


class DashboardPrefsTests(TestCase):
    """Per-user Applications dashboard card layout is stored on the user and
    self-editable (synced to the account, not just the browser)."""

    def setUp(self):
        self.api_client = APIClient()
        self.host = User.objects.create_user(
            username="host",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )

    def test_default_prefs_is_empty_object(self):
        self.assertEqual(self.host.dashboard_prefs, {})

    def test_me_exposes_dashboard_prefs(self):
        self.api_client.force_authenticate(user=self.host)
        res = self.api_client.get("/api/accounts/me/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("dashboard_prefs", res.json())

    def test_user_can_self_update_dashboard_prefs(self):
        self.api_client.force_authenticate(user=self.host)
        prefs = {"applications": {"cards": ["pending", "open", "rating"]}}
        res = self.api_client.patch(
            f"/api/accounts/users/{self.host.id}/",
            {"dashboard_prefs": prefs},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["dashboard_prefs"], prefs)
        self.host.refresh_from_db()
        self.assertEqual(self.host.dashboard_prefs, prefs)

    def test_dashboard_prefs_must_be_object(self):
        self.api_client.force_authenticate(user=self.host)
        res = self.api_client.patch(
            f"/api/accounts/users/{self.host.id}/",
            {"dashboard_prefs": ["not", "an", "object"]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
