from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, HostProfile, User
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.properties.models import Property

from apps.connections import services
from apps.connections.models import Connection, Message


def make_host(username="host"):
    user = User.objects.create_user(
        username=username, password="password123",
        role=User.Role.HOST, account_status=User.AccountStatus.APPROVED,
    )
    HostProfile.objects.create(user=user)
    return user


def make_cleaner(username="cleaner"):
    user = User.objects.create_user(
        username=username, password="password123",
        role=User.Role.CLEANER, account_status=User.AccountStatus.APPROVED,
    )
    CleanerProfile.objects.create(
        user=user,
        verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        display_name=username.title(),
    )
    return user


class ConnectionServiceTests(TestCase):
    def setUp(self):
        self.host = make_host()
        self.cleaner = make_cleaner()

    def test_request_then_accept(self):
        conn = services.request_connection(requester=self.host, addressee=self.cleaner)
        self.assertEqual(conn.status, Connection.Status.PENDING)
        services.accept_connection(connection=conn, user=self.cleaner)
        conn.refresh_from_db()
        self.assertEqual(conn.status, Connection.Status.ACCEPTED)

    def test_cannot_connect_with_self(self):
        with self.assertRaises(services.ConnectionError):
            services.request_connection(requester=self.host, addressee=self.host)

    def test_host_to_host_rejected(self):
        other_host = make_host("host2")
        with self.assertRaises(services.ConnectionError):
            services.request_connection(requester=self.host, addressee=other_host)

    def test_duplicate_pending_blocked(self):
        services.request_connection(requester=self.host, addressee=self.cleaner)
        with self.assertRaises(services.ConnectionError):
            services.request_connection(requester=self.host, addressee=self.cleaner)

    def test_reverse_request_auto_accepts(self):
        services.request_connection(requester=self.host, addressee=self.cleaner)
        # The cleaner requesting back accepts the existing pending request.
        conn = services.request_connection(requester=self.cleaner, addressee=self.host)
        self.assertEqual(conn.status, Connection.Status.ACCEPTED)

    def test_messaging_requires_accepted(self):
        conn = services.request_connection(requester=self.host, addressee=self.cleaner)
        with self.assertRaises(services.ConnectionError):
            services.send_message(connection=conn, sender=self.host, body="hi")
        services.accept_connection(connection=conn, user=self.cleaner)
        msg = services.send_message(connection=conn, sender=self.host, body="hello there")
        self.assertEqual(msg.body, "hello there")

    def test_mark_messages_read(self):
        conn = services.request_connection(requester=self.host, addressee=self.cleaner)
        services.accept_connection(connection=conn, user=self.cleaner)
        services.send_message(connection=conn, sender=self.host, body="one")
        services.send_message(connection=conn, sender=self.host, body="two")
        # Cleaner reads → both incoming messages marked read.
        marked = services.mark_messages_read(connection=conn, reader=self.cleaner)
        self.assertEqual(marked, 2)
        self.assertEqual(
            Message.objects.filter(connection=conn, read_at__isnull=True).count(), 0
        )


class ConnectionApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = make_host()
        self.cleaner = make_cleaner()

    def test_full_request_accept_message_flow(self):
        self.client.force_authenticate(self.host)
        res = self.client.post(
            "/api/connections/", {"user_id": self.cleaner.id}, format="json"
        )
        self.assertEqual(res.status_code, 201)
        conn_id = res.data["id"]
        self.assertEqual(res.data["direction"], "outgoing")

        # Cleaner sees an incoming request and accepts.
        self.client.force_authenticate(self.cleaner)
        listed = self.client.get("/api/connections/")
        rows = listed.data["results"] if isinstance(listed.data, dict) else listed.data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["direction"], "incoming")

        accept = self.client.post(f"/api/connections/{conn_id}/accept/")
        self.assertEqual(accept.status_code, 200)
        self.assertEqual(accept.data["direction"], "connected")

        # Cleaner sends a message.
        send = self.client.post(
            f"/api/connections/{conn_id}/messages/", {"body": "Hi host"}, format="json"
        )
        self.assertEqual(send.status_code, 201)

        # Host sees 1 unread, then reads it.
        self.client.force_authenticate(self.host)
        unread = self.client.get("/api/connections/unread-count/")
        self.assertEqual(unread.data["unread"], 1)
        msgs = self.client.get(f"/api/connections/{conn_id}/messages/")
        self.assertEqual(len(msgs.data), 1)
        unread2 = self.client.get("/api/connections/unread-count/")
        self.assertEqual(unread2.data["unread"], 0)

    def test_shared_endpoint_lists_collaborations(self):
        # Build a completed assignment between host and cleaner.
        prop = Property.objects.create(host=self.host, name="Flat", city="Sofia")
        job = CleaningJob.objects.create(
            property=prop, host=self.host, title="Turnover",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
            proposed_price=Decimal("50.00"),
        )
        application = CleanerApplication.objects.create(job=job, cleaner=self.cleaner)
        Assignment.objects.create(
            job=job, cleaner=self.cleaner, application=application,
            agreed_price=Decimal("50.00"),
        )
        conn = services.request_connection(requester=self.host, addressee=self.cleaner)
        services.accept_connection(connection=conn, user=self.cleaner)

        self.client.force_authenticate(self.host)
        res = self.client.get(f"/api/connections/{conn.id}/shared/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["cleanings_count"], 1)
        self.assertEqual(len(res.data["properties"]), 1)
        self.assertEqual(res.data["properties"][0]["name"], "Flat")

    def test_cannot_message_others_connection(self):
        conn = services.request_connection(requester=self.host, addressee=self.cleaner)
        services.accept_connection(connection=conn, user=self.cleaner)
        intruder = make_cleaner("intruder")
        self.client.force_authenticate(intruder)
        res = self.client.get(f"/api/connections/{conn.id}/messages/")
        self.assertIn(res.status_code, (403, 404))
