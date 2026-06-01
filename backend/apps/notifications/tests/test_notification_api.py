from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.notifications.services import create_notification


User = get_user_model()


class NotificationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="bell@example.com",
            email="bell@example.com",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.other = User.objects.create_user(
            username="other@example.com",
            email="other@example.com",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )

    def _make(self, user, title="Hi"):
        return create_notification(
            user=user, notification_type="test.event", title=title, body="body"
        )

    def test_list_returns_only_own_notifications(self):
        self._make(self.user, "Mine")
        self._make(self.other, "Theirs")
        self.client.force_authenticate(self.user)

        res = self.client.get("/api/notifications/notifications/")

        self.assertEqual(res.status_code, 200)
        rows = res.data["results"] if isinstance(res.data, dict) else res.data
        titles = [r["title"] for r in rows]
        self.assertEqual(titles, ["Mine"])

    def test_unread_count(self):
        self._make(self.user)
        self._make(self.user)
        self.client.force_authenticate(self.user)

        res = self.client.get("/api/notifications/notifications/unread-count/")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["unread"], 2)

    def test_mark_read_decrements_unread(self):
        n = self._make(self.user)
        self.client.force_authenticate(self.user)

        res = self.client.post(f"/api/notifications/notifications/{n.id}/mark_read/")

        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.data["read_at"])
        count = self.client.get("/api/notifications/notifications/unread-count/").data["unread"]
        self.assertEqual(count, 0)

    def test_read_all(self):
        self._make(self.user)
        self._make(self.user)
        self.client.force_authenticate(self.user)

        res = self.client.post("/api/notifications/notifications/read-all/")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["marked_read"], 2)
        count = self.client.get("/api/notifications/notifications/unread-count/").data["unread"]
        self.assertEqual(count, 0)

    def test_requires_authentication(self):
        res = self.client.get("/api/notifications/notifications/")
        self.assertIn(res.status_code, (401, 403))
