import json
import logging

from types import SimpleNamespace

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from apps.core.admin import AuditLogAdmin
from apps.core.apps import should_log_startup
from apps.core.logging import JsonFormatter, reset_log_context, set_log_context
from apps.core.models import AuditLog
from apps.core.sentry import drop_sentry_transaction, sanitize_sentry_event
from apps.core.services import write_audit_log
from config.celery import add_request_id_to_task_headers, log_task_started


User = get_user_model()


class RequestIdMiddlewareTests(TestCase):
    def test_api_response_includes_request_id_header(self):
        request_id = "req_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        response = APIClient().get("/api/health/", HTTP_X_REQUEST_ID=request_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-Request-ID"], request_id)

    def test_api_replaces_attacker_controlled_request_id(self):
        attacker_value = "password-secret-sentinel"

        with self.assertLogs("apps.request", level="INFO") as captured:
            response = APIClient().get(
                "/api/health/",
                HTTP_X_REQUEST_ID=attacker_value,
            )

        self.assertRegex(response["X-Request-ID"], r"^req_[0-9a-f]{32}$")
        self.assertNotEqual(response["X-Request-ID"], attacker_value)
        self.assertNotIn(attacker_value, str(captured.records[-1].__dict__))

    def test_request_telemetry_uses_route_template_without_user_or_query_identifiers(self):
        user = User.objects.create_user(
            username="telemetry-host@example.com",
            email="telemetry-host@example.com",
            password="correct-password",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        client = APIClient()
        client.force_authenticate(user=user)

        with self.assertLogs("apps.request", level="INFO") as captured:
            response = client.get(
                "/api/accounts/me/?token=sentinel-secret&address=1-private-street",
                HTTP_X_REQUEST_ID="req_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            )

        self.assertEqual(response.status_code, 200)
        record = captured.records[-1]
        serialized = str(record.__dict__)
        self.assertFalse(getattr(record, "user_id", ""))
        self.assertNotIn(str(user.id), record.getMessage())
        self.assertNotIn("sentinel-secret", serialized)
        self.assertNotIn("1-private-street", serialized)
        self.assertFalse(hasattr(record, "path"))
        self.assertEqual(record.endpoint_template, "api/accounts/me/")


class SentrySanitizationTests(TestCase):
    def test_event_is_rebuilt_from_safe_telemetry_allowlist(self):
        secret = "password-secret-sentinel"
        event = {
            "event_id": "a" * 32,
            "level": "error",
            "platform": "python",
            "message": f"Rejected {secret}",
            "transaction": "/api/marketplace/jobs/981/",
            "user": {"id": "private-user-44", "email": "private@example.test"},
            "request": {
                "method": "POST",
                "url": f"https://example.test/api/marketplace/jobs/981/?password={secret}",
                "query_string": f"password={secret}",
                "data": {"password": secret},
                "cookies": {"sessionid": secret},
                "headers": {"Authorization": secret},
            },
            "exception": {
                "values": [{"type": "PrivateError", "value": f"1 Private Street {secret}"}],
            },
            "breadcrumbs": [{"message": secret}],
            "contexts": {"response": {"body": secret}},
            "extra": {
                "endpoint_template": "/api/marketplace/jobs/981/",
                "error_code": "http_error",
                "method": "POST",
                "request_id": "password-secret-sentinel",
                "status_code": 403,
                "job_id": 981,
                "detail": secret,
            },
            "tags": {"error_code": "http_error", "user_id": "private-user-44"},
        }

        sanitized = sanitize_sentry_event(event, {})
        serialized = str(sanitized)

        self.assertNotIn(secret, serialized)
        self.assertNotIn("Private Street", serialized)
        self.assertNotIn("private@example.test", serialized)
        self.assertNotIn("private-user-44", serialized)
        self.assertNotIn("981", serialized)
        self.assertEqual(sanitized["message"], "Application error")
        self.assertEqual(
            sanitized["extra"],
            {
                "endpoint_template": "/api/marketplace/jobs/:id/",
                "error_code": "http_error",
                "method": "POST",
                "status_code": 403,
            },
        )
        self.assertEqual(
            sanitized["request"],
            {"method": "POST", "url": "/api/marketplace/jobs/:id/"},
        )

    def test_performance_transactions_are_dropped(self):
        transaction = {
            "transaction": "/api/marketplace/jobs/981/?token=secret",
            "spans": [
                {
                    "description": "99 Private Street",
                    "data": {"password": "secret"},
                }
            ],
        }

        self.assertIsNone(drop_sentry_transaction(transaction, None))

    def test_json_telemetry_does_not_copy_messages_metadata_or_private_ids(self):
        secret = "password-secret-sentinel"
        record = logging.LogRecord(
            name="apps.example",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg=f"User error at 1 Private Street: {secret}",
            args=(),
            exc_info=None,
        )
        record.event = "request.failed"
        record.entity_id = 981
        record.metadata = {"address": "1 Private Street", "password": secret}
        record.endpoint_template = "api/example/"
        record.status_code = 500

        payload = json.loads(JsonFormatter().format(record))
        serialized = str(payload)

        self.assertNotIn(secret, serialized)
        self.assertNotIn("Private Street", serialized)
        self.assertNotIn("981", serialized)
        self.assertNotIn("entity_id", payload)
        self.assertNotIn("metadata", payload)
        self.assertEqual(payload["message"], "request.failed")


class AuditLogTests(TestCase):
    def test_login_creates_audit_log(self):
        user = User.objects.create_user(
            username="host@example.com",
            email="host@example.com",
            password="correct-password",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )

        response = APIClient().post(
            "/api/accounts/login/",
            {"email": user.email, "password": "correct-password"},
            format="json",
            HTTP_X_REQUEST_ID="req_cccccccccccccccccccccccccccccccc",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            AuditLog.objects.filter(
                actor=user,
                action="login.succeeded",
                entity_type="User",
                entity_id=str(user.id),
                request_id="req_cccccccccccccccccccccccccccccccc",
            ).exists()
        )

    def test_audit_log_admin_is_read_only(self):
        request = RequestFactory().get("/admin/core/auditlog/")
        admin_user = User.objects.create_superuser(
            username="admin@example.com",
            email="admin@example.com",
            password="correct-password",
        )
        request.user = admin_user
        audit_admin = AuditLogAdmin(AuditLog, admin.site)
        audit_log = write_audit_log(
            actor=admin_user,
            action="account.created",
            entity_type="User",
            entity_id=admin_user.id,
        )

        self.assertFalse(audit_admin.has_add_permission(request))
        self.assertFalse(audit_admin.has_change_permission(request, audit_log))
        self.assertFalse(audit_admin.has_delete_permission(request, audit_log))


class CeleryRequestIdTests(TestCase):
    def test_request_id_is_added_to_celery_headers(self):
        headers = {}
        tokens = set_log_context(request_id="req_dddddddddddddddddddddddddddddddd")
        try:
            add_request_id_to_task_headers(headers=headers)
        finally:
            reset_log_context(tokens)

        self.assertEqual(headers["request_id"], "req_dddddddddddddddddddddddddddddddd")

    def test_untrusted_broker_request_id_is_replaced_before_logging(self):
        attacker_value = "password-secret-sentinel"
        task = SimpleNamespace(
            name="apps.example.task",
            request=SimpleNamespace(headers={"request_id": attacker_value}),
        )

        try:
            with self.assertLogs("celery", level="INFO") as captured:
                log_task_started(task=task, task_id="task-1")
        finally:
            tokens = getattr(task.request, "log_context_tokens", None)
            if tokens:
                reset_log_context(tokens)

        record = captured.records[-1]
        self.assertRegex(record.request_id, r"^req_[0-9a-f]{32}$")
        self.assertNotEqual(record.request_id, attacker_value)
        self.assertNotIn(attacker_value, str(record.__dict__))


class StartupLoggingTests(TestCase):
    def test_startup_logging_is_limited_to_server_processes(self):
        self.assertTrue(should_log_startup(["gunicorn", "config.wsgi:application"]))
        self.assertTrue(should_log_startup(["python", "manage.py", "runserver"]))
        self.assertTrue(should_log_startup(["celery", "-A", "config", "worker"]))
        self.assertFalse(should_log_startup(["python", "manage.py", "migrate"]))
        self.assertFalse(should_log_startup(["python", "manage.py", "test"]))
