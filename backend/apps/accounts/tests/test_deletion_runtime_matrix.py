from datetime import timedelta

from django.db.models.deletion import ProtectedError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.cleanup import cleanup_history_free_accounts
from apps.accounts.models import (
    AccountRetentionHold,
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    User,
)
from apps.connections.models import Connection, Message
from apps.core.models import AuditLog
from apps.marketplace.models import (
    Assignment,
    CleanerApplication,
    Dispute,
    JobIncident,
    ReplacementRequest,
)
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.notifications.models import NotificationEvent
from apps.properties.models import Property


class AccountDeletionRuntimeMatrixTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = self._user("matrix-host", User.Role.HOST)
        self.property = Property.objects.create(
            host=self.host,
            name="Matrix private property",
            city="Sofia",
        )

    def _user(self, username, role):
        return User.objects.create_user(
            username=f"{username}@example.test",
            email=f"{username}@example.test",
            password="DisposablePassword123!",
            role=role,
            account_status=User.AccountStatus.APPROVED,
        )

    def _job(self, *, host=None, status="completed", offset=1):
        start = timezone.now() + timedelta(days=offset)
        return create_cleaning_job_record(
            host=host or self.host,
            property=self.property,
            title=f"Private matrix turnover {offset}",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            status=status,
        )

    def _delete(self, user):
        self.client.force_authenticate(user)
        return self.client.delete("/api/accounts/me/")

    def _assert_safe_blocker(self, response):
        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertEqual(payload["code"], "account_deletion_blocked_active_obligations")
        self.assertNotIn("Matrix private property", str(payload))
        self.assertNotIn("Private matrix turnover", str(payload))
        self.assertNotIn("host", payload)
        self.assertNotIn("job", payload)

    def test_direct_and_delegated_active_assignments_block_without_partial_deletion(self):
        direct_cleaner = self._user("direct-cleaner", User.Role.CLEANER)
        agency_user = self._user("agency", User.Role.AGENCY)
        delegated_member = self._user("delegated-member", User.Role.CLEANER)
        agency = AgencyProfile.objects.create(user=agency_user, company_name="Matrix agency", city="Sofia")
        AgencyMembership.objects.create(agency=agency, cleaner=delegated_member, invited_by=agency_user)

        direct_job = self._job(status="assigned", offset=1)
        direct_application = CleanerApplication.objects.create(
            job=direct_job,
            cleaner=direct_cleaner,
            status=CleanerApplication.Status.ACCEPTED,
        )
        direct_assignment = Assignment.objects.create(
            job=direct_job,
            cleaner=direct_cleaner,
            application=direct_application,
        )
        delegated_job = self._job(status="assigned", offset=2)
        delegated_application = CleanerApplication.objects.create(
            job=delegated_job,
            cleaner=agency_user,
            status=CleanerApplication.Status.ACCEPTED,
        )
        delegated_assignment = Assignment.objects.create(
            job=delegated_job,
            cleaner=agency_user,
            assigned_member=delegated_member,
            application=delegated_application,
        )

        for user, assignment in ((direct_cleaner, direct_assignment), (delegated_member, delegated_assignment)):
            with self.subTest(user=user.username):
                before = {
                    "users": User.objects.count(),
                    "jobs": assignment.job.__class__.objects.count(),
                    "assignments": Assignment.objects.count(),
                    "applications": CleanerApplication.objects.count(),
                    "audits": AuditLog.objects.count(),
                }
                first = self._delete(user)
                second = self._delete(user)

                self._assert_safe_blocker(first)
                self._assert_safe_blocker(second)
                self.assertEqual(before["users"], User.objects.count())
                self.assertEqual(before["jobs"], assignment.job.__class__.objects.count())
                self.assertEqual(before["assignments"], Assignment.objects.count())
                self.assertEqual(before["applications"], CleanerApplication.objects.count())
                self.assertEqual(before["audits"], AuditLog.objects.count())
                self.assertTrue(User.objects.filter(pk=user.pk).exists())

    def test_pending_replacement_and_open_dispute_block_all_involved_parties(self):
        cleaner = self._user("recovery-cleaner", User.Role.CLEANER)
        job = self._job(status="completed", offset=3)
        incident = JobIncident.objects.create(
            job=job,
            reported_by=self.host,
            incident_type=JobIncident.IncidentType.NO_SHOW,
            narrative="Private incident narrative",
        )
        ReplacementRequest.objects.create(
            source_job=job,
            incident=incident,
            requested_by=cleaner,
            expires_at=timezone.now() + timedelta(hours=2),
            status=ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION,
        )
        dispute = Dispute.objects.create(
            job=job,
            filed_by=cleaner,
            category=Dispute.Category.PRIVACY,
            narrative="Private dispute narrative",
            status=Dispute.Status.OPEN,
        )

        for user in (self.host, cleaner):
            with self.subTest(user=user.username):
                response = self._delete(user)
                self._assert_safe_blocker(response)
                self.assertTrue(ReplacementRequest.objects.exists())
                self.assertTrue(Dispute.objects.filter(pk=dispute.pk).exists())
                self.assertTrue(User.objects.get(pk=user.pk).is_active)

    @override_settings(
        MARKETPLACE_SUPPORT_CHANNEL="privacy-support",
        MARKETPLACE_SUPPORT_DESTINATION="mailto:privacy@example.test",
    )
    def test_all_active_hold_categories_are_safe_idempotent_conflicts(self):
        admin = User.objects.create_superuser("matrix-admin", "matrix-admin@example.test", "DisposablePassword123!")
        for category in AccountRetentionHold.Category.values:
            with self.subTest(category=category):
                user = self._user(f"hold-{category}", User.Role.HOST)
                AccountRetentionHold.objects.create(
                    user=user,
                    category=category,
                    reason_code="private_case_reference",
                    placed_by=admin,
                )

                first = self._delete(user)
                second = self._delete(user)
                for response in (first, second):
                    self.assertEqual(response.status_code, 409)
                    payload = response.json()
                    self.assertEqual(payload["code"], "account_closure_blocked_retention_hold")
                    self.assertEqual(payload["fields"]["support_channel"], "privacy-support")
                    self.assertEqual(payload["fields"]["support_destination"], "mailto:privacy@example.test")
                    self.assertNotIn("private_case_reference", str(payload))
                    self.assertNotIn("Matrix", str(payload))
                self.assertTrue(User.objects.get(pk=user.pk).is_active)

    def test_protected_counterparty_notification_and_agency_history_is_preserved_and_skips_cleanup(self):
        cleaner = self._user("history-cleaner", User.Role.CLEANER)
        agency_user = self._user("history-agency", User.Role.AGENCY)
        agency = AgencyProfile.objects.create(user=agency_user, company_name="History agency", city="Sofia")
        membership = AgencyMembership.objects.create(agency=agency, cleaner=cleaner, invited_by=agency_user)
        connection = Connection.objects.create(requester=self.host, addressee=cleaner, status=Connection.Status.ACCEPTED)
        message = Message.objects.create(connection=connection, sender=self.host, body="Private support conversation")
        event = NotificationEvent.objects.create(
            event_type="account.approved",
            recipient=cleaner,
            language="en",
            occurrence_key="matrix-protected-history-event",
            deduplication_key="m" * 64,
            destination="/app",
        )

        response = self._delete(cleaner)

        self.assertEqual(response.status_code, 202)
        cleaner.refresh_from_db()
        self.assertFalse(cleaner.is_active)
        self.assertTrue(Connection.objects.filter(pk=connection.pk).exists())
        self.assertTrue(Message.objects.filter(pk=message.pk).exists())
        self.assertTrue(AgencyMembership.objects.filter(pk=membership.pk).exists())
        self.assertTrue(NotificationEvent.objects.filter(pk=event.pk).exists())
        User.objects.filter(pk=cleaner.pk).update(closed_at=timezone.now() - timedelta(days=31))
        self.assertEqual(cleanup_history_free_accounts(limit=10), 0)
        self.assertTrue(User.objects.filter(pk=cleaner.pk).exists())

    def test_database_protect_constraints_match_service_blocker_for_marketplace_history(self):
        job = self._job(status="completed", offset=4)
        response = self._delete(self.host)
        self.assertEqual(response.status_code, 202)
        self.host.refresh_from_db()
        self.assertFalse(self.host.is_active)
        with self.assertRaises(ProtectedError):
            self.host.delete()
        self.assertTrue(job.__class__.objects.filter(pk=job.pk).exists())

    def test_only_authenticated_current_user_can_close_and_csrf_is_enforced(self):
        target = self._user("unaffected-target", User.Role.HOST)
        anonymous = APIClient()
        self.assertIn(anonymous.delete("/api/accounts/me/").status_code, {401, 403})

        csrf_client = APIClient(enforce_csrf_checks=True)
        self.assertTrue(csrf_client.login(username=self.host.username, password="DisposablePassword123!"))
        self.assertEqual(csrf_client.delete("/api/accounts/me/").status_code, 403)
        csrf_client.get("/api/accounts/csrf/")
        csrf_token = csrf_client.cookies["csrftoken"].value
        response = csrf_client.delete("/api/accounts/me/", HTTP_X_CSRFTOKEN=csrf_token)

        self.assertEqual(response.status_code, 202)
        self.host.refresh_from_db()
        self.assertFalse(self.host.is_active)
        self.assertTrue(User.objects.get(pk=target.pk).is_active)

    def test_history_free_account_closes_then_becomes_eligible_for_bounded_cleanup(self):
        user = self._user("history-free-runtime", User.Role.HOST)
        response = self._delete(user)
        self.assertEqual(response.status_code, 202)
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertIsNotNone(user.closed_at)
        User.objects.filter(pk=user.pk).update(closed_at=timezone.now() - timedelta(days=31))
        self.assertEqual(cleanup_history_free_accounts(limit=10), 1)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())
