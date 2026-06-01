from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from rest_framework.test import APIClient

from apps.core.admin import AuditLogAdmin
from apps.core.apps import should_log_startup
from apps.core.logging import reset_log_context, set_log_context
from apps.core.models import AuditLog
from apps.core.services import write_audit_log
from config.celery import add_request_id_to_task_headers


User = get_user_model()


class RequestIdMiddlewareTests(TestCase):
    def test_api_response_includes_request_id_header(self):
        response = APIClient().get("/api/health/", HTTP_X_REQUEST_ID="req_test_123")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-Request-ID"], "req_test_123")


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
            HTTP_X_REQUEST_ID="req_login_123",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            AuditLog.objects.filter(
                actor=user,
                action="login.succeeded",
                entity_type="User",
                entity_id=str(user.id),
                request_id="req_login_123",
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
        tokens = set_log_context(request_id="req_task_123")
        try:
            add_request_id_to_task_headers(headers=headers)
        finally:
            reset_log_context(tokens)

        self.assertEqual(headers["request_id"], "req_task_123")


class StartupLoggingTests(TestCase):
    def test_startup_logging_is_limited_to_server_processes(self):
        self.assertTrue(should_log_startup(["gunicorn", "config.wsgi:application"]))
        self.assertTrue(should_log_startup(["python", "manage.py", "runserver"]))
        self.assertTrue(should_log_startup(["celery", "-A", "config", "worker"]))
        self.assertFalse(should_log_startup(["python", "manage.py", "migrate"]))
        self.assertFalse(should_log_startup(["python", "manage.py", "test"]))
