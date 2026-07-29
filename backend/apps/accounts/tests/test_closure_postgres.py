from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.db import close_old_connections, connection
from django.test import TransactionTestCase

from apps.accounts.models import User
from apps.accounts.services import close_account
from apps.core.models import AuditLog


@skipUnless(connection.vendor == "postgresql", "requires PostgreSQL row-lock semantics")
class AccountClosurePostgresConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def test_concurrent_history_free_closure_is_atomic_and_idempotent(self):
        user = User.objects.create_user(
            username="closure-concurrency@example.test",
            email="closure-concurrency@example.test",
            password="DisposablePassword123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        barrier = Barrier(2)

        def close_once():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                locked_user = User.objects.get(pk=user.pk)
                return close_account(user=locked_user)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = tuple(executor.map(lambda _: close_once(), range(2)))

        self.assertEqual(set(results), {"history_free_pending_deletion", "already_closed"})
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertIsNotNone(user.closed_at)
        self.assertIsNotNone(user.anonymized_at)
        self.assertEqual(
            AuditLog.objects.filter(action="account.closed_anonymized", entity_id=str(user.id)).count(),
            1,
        )
