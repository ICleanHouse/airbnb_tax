from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, PilotEvidenceExclusion, User
from apps.accounts.services import (
    AccountTransitionError,
    reconcile_contact_verification,
)
from apps.core.models import AuditLog
from apps.notifications.models import Notification


BASE_POLICY = {
    "APP_ENV": "test",
    "ALLOW_PILOT_VERIFICATION_BYPASS": False,
    "PILOT_VERIFICATION_BYPASS_OWNER": "",
    "PILOT_VERIFICATION_BYPASS_REASON": "",
    "PILOT_VERIFICATION_BYPASS_START_AT": "",
    "PILOT_VERIFICATION_BYPASS_END_AT": "",
    "PILOT_GENUINE_JOB_INTAKE_PAUSED": False,
}


@override_settings(SENTRY_DSN="", **BASE_POLICY)
class ContactVerificationTruthTableTests(TestCase):
    def create_cleaner(self, suffix):
        user = User.objects.create_user(
            username=f"cleaner-{suffix}",
            email=f"cleaner-{suffix}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.PENDING,
            email_verified_at=timezone.now(),
        )
        CleanerProfile.objects.create(user=user)
        return user

    def test_complete_signup_truth_table(self):
        rows = (
            (True, True, False, "approved", "verified", True, False),
            (True, True, True, "pending", "pending", False, False),
            (True, False, False, "approved", "verified", True, True),
            (True, False, True, "pending", "verified", False, True),
            (False, True, False, "approved", "verified", True, True),
            (False, True, True, "approved", "pending", False, True),
            (False, False, False, "approved", "verified", True, True),
            (False, False, True, "approved", "verified", True, True),
        )
        for index, (
            account_required,
            cleaner_required,
            phone_required,
            account_state,
            cleaner_state,
            eligible,
            excluded,
        ) in enumerate(rows):
            with self.subTest(row=index), override_settings(
                ACCOUNT_APPROVAL_REQUIRED=account_required,
                CLEANER_VERIFICATION_REQUIRED=cleaner_required,
                PHONE_VERIFICATION_REQUIRED=phone_required,
            ):
                user = self.create_cleaner(index)
                with self.captureOnCommitCallbacks(execute=True):
                    result = reconcile_contact_verification(
                        user_id=user.id,
                        trigger="signup",
                    )

                user.refresh_from_db()
                user.cleaner_profile.refresh_from_db()
                self.assertEqual(user.account_status, account_state)
                self.assertEqual(user.cleaner_profile.verification_status, cleaner_state)
                self.assertEqual(user.is_marketplace_eligible, eligible)
                self.assertFalse(user.is_fully_verified)
                self.assertEqual(
                    PilotEvidenceExclusion.objects.filter(user=user).exists(),
                    excluded,
                )
                self.assertEqual(result.changed, account_state == "approved" or cleaner_state == "verified")

    @override_settings(
        ACCOUNT_APPROVAL_REQUIRED=True,
        CLEANER_VERIFICATION_REQUIRED=True,
        PHONE_VERIFICATION_REQUIRED=False,
    )
    @mock.patch("apps.accounts.services.dispatch_notification.delay")
    def test_reconciliation_is_idempotent_with_one_effect_per_transition(self, dispatch):
        user = self.create_cleaner("idempotent")

        with self.captureOnCommitCallbacks(execute=True):
            first = reconcile_contact_verification(user_id=user.id, trigger="signup")
        with self.captureOnCommitCallbacks(execute=True):
            second = reconcile_contact_verification(user_id=user.id, trigger="signup")

        self.assertTrue(first.changed)
        self.assertFalse(second.changed)
        self.assertEqual(
            AuditLog.objects.filter(entity_type="User", entity_id=str(user.id), action="account.approved").count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(deduplication_key=f"account.approved:{user.id}:1").count(),
            1,
        )
        self.assertEqual(dispatch.call_count, 2)  # account and cleaner effective transitions

    @override_settings(
        ACCOUNT_APPROVAL_REQUIRED=True,
        CLEANER_VERIFICATION_REQUIRED=True,
        PHONE_VERIFICATION_REQUIRED=False,
    )
    def test_reconciliation_never_restores_rejected_or_suspended_accounts(self):
        for state in (User.AccountStatus.REJECTED, User.AccountStatus.SUSPENDED):
            with self.subTest(state=state):
                user = self.create_cleaner(state)
                user.account_status = state
                user.save(update_fields=["account_status"])

                result = reconcile_contact_verification(user_id=user.id, trigger="admin")

                user.refresh_from_db()
                user.cleaner_profile.refresh_from_db()
                self.assertFalse(result.changed)
                self.assertEqual(user.account_status, state)
                self.assertEqual(
                    user.cleaner_profile.verification_status,
                    CleanerProfile.VerificationStatus.PENDING,
                )


@override_settings(
    SENTRY_DSN="",
    ACCOUNT_APPROVAL_REQUIRED=True,
    CLEANER_VERIFICATION_REQUIRED=True,
    PHONE_VERIFICATION_REQUIRED=False,
    **BASE_POLICY,
)
class AccountTransitionApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="verification-admin",
            email="verification-admin@example.test",
            password="Password123!",
        )
        self.client.force_authenticate(self.admin)

    def create_user(self, status=User.AccountStatus.PENDING, *, email_verified=True):
        return User.objects.create_user(
            username=f"target-{User.objects.count()}",
            email=f"target-{User.objects.count()}@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=status,
            email_verified_at=timezone.now() if email_verified else None,
        )

    def test_approve_route_is_removed_and_reconciliation_is_honest(self):
        user = self.create_user()

        old_response = self.client.post(f"/api/accounts/users/{user.id}/approve/")
        response = self.client.post(
            f"/api/accounts/users/{user.id}/reconcile-verification/"
        )

        self.assertEqual(old_response.status_code, 404)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["changed"])
        self.assertEqual(response.data["user"]["account_status"], "approved")

    @override_settings(PHONE_VERIFICATION_REQUIRED=True)
    def test_reconciliation_returns_stable_conflict_when_prerequisites_are_incomplete(self):
        user = self.create_user()

        response = self.client.post(
            f"/api/accounts/users/{user.id}/reconcile-verification/"
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "verification_prerequisites_incomplete")

    def test_reject_requires_expected_state_reason_and_rejects_only_pending(self):
        pending = self.create_user()
        response = self.client.post(
            f"/api/accounts/users/{pending.id}/reject/",
            {
                "expected_status": "pending",
                "reason_category": "policy_prerequisite_incomplete",
                "internal_note": "Reviewed by operator.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["changed"])

        approved = self.create_user(User.AccountStatus.APPROVED)
        response = self.client.post(
            f"/api/accounts/users/{approved.id}/reject/",
            {
                "expected_status": "approved",
                "reason_category": "policy_prerequisite_incomplete",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "invalid_account_transition")

    def test_stale_human_transition_returns_conflict(self):
        user = self.create_user(User.AccountStatus.APPROVED)

        response = self.client.post(
            f"/api/accounts/users/{user.id}/suspend/",
            {
                "expected_status": "pending",
                "reason_category": "marketplace_safety",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "account_state_conflict")

    def test_generic_patch_rejects_protected_fields_for_admin(self):
        user = self.create_user()
        for payload in (
            {"account_status": "approved"},
            {"approved_at": timezone.now().isoformat()},
            {"approved_by": self.admin.id},
            {"email_verified_at": timezone.now().isoformat()},
            {"phone_verified_at": timezone.now().isoformat()},
        ):
            with self.subTest(payload=payload):
                response = self.client.patch(
                    f"/api/accounts/users/{user.id}/", payload, format="json"
                )
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.data["code"], "protected_transition_field")

    def test_review_history_is_admin_only_and_contains_internal_note(self):
        user = self.create_user()
        self.client.post(
            f"/api/accounts/users/{user.id}/reject/",
            {
                "expected_status": "pending",
                "reason_category": "policy_prerequisite_incomplete",
                "internal_note": "Restricted note.",
            },
            format="json",
        )

        response = self.client.get(f"/api/accounts/users/{user.id}/review-history/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["internal_note"], "Restricted note.")

        ordinary = self.create_user()
        self.client.force_authenticate(ordinary)
        denied = self.client.get(f"/api/accounts/users/{user.id}/review-history/")
        self.assertEqual(denied.status_code, 403)
        own = self.client.get(f"/api/accounts/users/{ordinary.id}/")
        self.assertNotIn("internal_note", own.data)

    def test_service_rejects_unbounded_internal_note(self):
        user = self.create_user()
        with self.assertRaises(AccountTransitionError):
            from apps.accounts.services import reject_account

            reject_account(
                user_id=user.id,
                actor=self.admin,
                expected_status="pending",
                reason_category="policy_prerequisite_incomplete",
                internal_note="x" * 2001,
            )
