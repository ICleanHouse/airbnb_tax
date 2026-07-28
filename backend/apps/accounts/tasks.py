from __future__ import annotations

import logging

try:
    from celery import shared_task
except ImportError:  # pragma: no cover - local/test fallback mirrors notification tasks.
    def shared_task(func=None, **_kwargs):
        return func if func is not None else lambda wrapped: wrapped


logger = logging.getLogger("apps.accounts")


@shared_task
def run_retention_cleanup(batch_size: int = 100) -> dict[str, int]:
    from apps.accounts.cleanup import cleanup_expired_temporary_state, cleanup_history_free_accounts

    batch_size = max(1, min(int(batch_size), 500))
    expired_state = cleanup_expired_temporary_state(limit=batch_size)
    deleted_accounts = cleanup_history_free_accounts(limit=batch_size)
    result = {"expired_temporary_state": expired_state, "deleted_history_free_accounts": deleted_accounts}
    logger.info("Retention cleanup completed", extra={"event": "retention.cleanup_completed", "metadata": result})
    return result
