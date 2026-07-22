from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.db import close_old_connections, connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from apps.accounts.models import CleanerProfile, User
from apps.accounts.services import (
    AccountTransitionError,
    reconcile_contact_verification,
    reject_account,
    suspend_account,
)
from apps.core.models import AuditLog
from apps.notifications.models import NotificationEvent


@skipUnless(
    connection.vendor == "postgresql",
    "PostgreSQL row-locking evidence requires a PostgreSQL test database.",
)
@override_settings(
    SENTRY_DSN="",
    ACCOUNT_APPROVAL_REQUIRED=True,
    CLEANER_VERIFICATION_REQUIRED=True,
    PHONE_VERIFICATION_REQUIRED=False,
    APP_ENV="test",
    ALLOW_PILOT_VERIFICATION_BYPASS=False,
)
class ContactVerificationPostgresConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.admin_one = User.objects.create_superuser(
            username="concurrency-admin-one", password=None
        )
        self.admin_two = User.objects.create_superuser(
            username="concurrency-admin-two", password=None
        )

    def make_cleaner(self, suffix="target", *, email_verified=True):
        user = User.objects.create_user(
            username=f"concurrency-{suffix}",
            password=None,
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.PENDING,
            email_verified_at=timezone.now() if email_verified else None,
        )
        CleanerProfile.objects.create(user=user)
        return user

    def race(self, first, second):
        barrier = Barrier(2)

        def run(operation):
            close_old_connections()
            barrier.wait(timeout=10)
            try:
                return operation()
            except AccountTransitionError as error:
                return error.code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            return tuple(executor.map(run, (first, second)))

    def test_two_simultaneous_reconciliations_have_one_effect(self):
        user = self.make_cleaner("duplicate")

        results = self.race(
            lambda: reconcile_contact_verification(user_id=user.id, trigger="race"),
            lambda: reconcile_contact_verification(user_id=user.id, trigger="race"),
        )

        self.assertEqual(sum(result.changed for result in results), 1)
        self.assertEqual(
            AuditLog.objects.filter(
                action="account.approved", entity_id=str(user.id)
            ).count(),
            1,
        )
        self.assertEqual(
            NotificationEvent.objects.filter(
                recipient=user,
                event_type="account.approved",
                occurrence_key=f"account.approved:{user.id}:1",
            ).count(),
            1,
        )

    def test_email_reconciliation_vs_rejection_serializes(self):
        user = self.make_cleaner("email-reject", email_verified=False)

        def verify_then_reconcile():
            current = User.objects.get(id=user.id)
            current.email_verified_at = timezone.now()
            current.save(update_fields=["email_verified_at"])
            return reconcile_contact_verification(user_id=user.id, trigger="email")

        results = self.race(
            verify_then_reconcile,
            lambda: reject_account(
                user_id=user.id,
                actor=self.admin_one,
                expected_status=User.AccountStatus.PENDING,
                reason_category="policy_prerequisite_incomplete",
            ),
        )

        user.refresh_from_db()
        self.assertIn(user.account_status, {"approved", "rejected"})
        effective = AuditLog.objects.filter(
            entity_type="User",
            entity_id=str(user.id),
            action__in=["account.approved", "account.rejected"],
        )
        self.assertEqual(effective.count(), 1)
        self.assertEqual(
            sum(getattr(result, "changed", False) is True for result in results), 1
        )

    def test_automatic_approval_vs_suspension_serializes(self):
        user = self.make_cleaner("approval-suspend")

        self.race(
            lambda: reconcile_contact_verification(user_id=user.id, trigger="email"),
            lambda: suspend_account(
                user_id=user.id,
                actor=self.admin_one,
                expected_status=User.AccountStatus.PENDING,
                reason_category="marketplace_safety",
            ),
        )

        user.refresh_from_db()
        self.assertIn(user.account_status, {"approved", "suspended"})
        self.assertEqual(
            AuditLog.objects.filter(
                entity_type="User",
                entity_id=str(user.id),
                action__in=["account.approved", "account.suspended"],
            ).count(),
            1,
        )

    def test_two_admins_with_same_expected_state_have_one_winner(self):
        user = self.make_cleaner("two-admins", email_verified=False)

        results = self.race(
            lambda: reject_account(
                user_id=user.id,
                actor=self.admin_one,
                expected_status="pending",
                reason_category="policy_prerequisite_incomplete",
            ),
            lambda: suspend_account(
                user_id=user.id,
                actor=self.admin_two,
                expected_status="pending",
                reason_category="marketplace_safety",
            ),
        )

        user.refresh_from_db()
        self.assertIn(user.account_status, {"rejected", "suspended"})
        self.assertIn("account_state_conflict", results)
        self.assertEqual(
            AuditLog.objects.filter(
                entity_type="User",
                entity_id=str(user.id),
                action__in=["account.rejected", "account.suspended"],
            ).count(),
            1,
        )

    def test_cleaner_eligibility_vs_suspension_has_consistent_final_state(self):
        user = self.make_cleaner("cleaner-suspend")

        self.race(
            lambda: reconcile_contact_verification(user_id=user.id, trigger="email"),
            lambda: suspend_account(
                user_id=user.id,
                actor=self.admin_one,
                expected_status="pending",
                reason_category="marketplace_safety",
            ),
        )

        user.refresh_from_db()
        user.cleaner_profile.refresh_from_db()
        if user.account_status == User.AccountStatus.SUSPENDED:
            self.assertEqual(
                user.cleaner_profile.verification_status,
                CleanerProfile.VerificationStatus.PENDING,
            )
            self.assertFalse(user.is_marketplace_eligible)
        else:
            self.assertEqual(user.account_status, User.AccountStatus.APPROVED)
            self.assertEqual(
                user.cleaner_profile.verification_status,
                CleanerProfile.VerificationStatus.VERIFIED,
            )
            self.assertTrue(user.is_marketplace_eligible)
