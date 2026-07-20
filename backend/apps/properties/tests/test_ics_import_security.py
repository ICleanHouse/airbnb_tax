from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.calendars.tasks import sync_google_calendar, sync_ical_connection


class CalendarUrlFetchRemovalTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(
            username="approved-host@example.test",
            email="approved-host@example.test",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.host)

    def test_removed_calendar_url_import_endpoint_returns_404(self):
        response = self.client.post(
            "/api/properties/fetch-ics-url/",
            {"url": "https://calendar.example.test/feed.ics"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_calendar_runtime_modules_do_not_reference_network_clients(self):
        runtime_roots = (
            Path(settings.BASE_DIR) / "apps" / "properties",
            Path(settings.BASE_DIR) / "apps" / "calendars",
        )
        runtime_files = (
            runtime_file
            for runtime_root in runtime_roots
            for runtime_file in runtime_root.rglob("*.py")
            if not {"tests", "migrations", "__pycache__"}.intersection(runtime_file.parts)
        )
        forbidden_tokens = (
            "import urllib",
            "from urllib",
            "import requests",
            "from requests",
            "import httpx",
            "from httpx",
            "import socket",
            "from socket",
        )

        for runtime_file in runtime_files:
            source = runtime_file.read_text(encoding="utf-8")
            for token in forbidden_tokens:
                with self.subTest(file=str(runtime_file), token=token):
                    self.assertNotIn(token, source)

    def test_placeholder_calendar_tasks_perform_no_outbound_calls(self):
        with (
            patch("urllib.request.urlopen") as urlopen,
            patch("socket.create_connection") as create_connection,
        ):
            self.assertEqual(sync_ical_connection(17), 17)
            self.assertEqual(sync_google_calendar(23), 23)

        urlopen.assert_not_called()
        create_connection.assert_not_called()
