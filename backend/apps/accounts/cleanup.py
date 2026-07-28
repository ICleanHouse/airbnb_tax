from __future__ import annotations

from django.db import transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from apps.accounts.models import AccountRetentionHold, SignupEmailVerification, User
from apps.accounts.retention import HISTORY_FREE_CLOSURE_RETENTION, TECHNICAL_STATE_RETENTION
from apps.accounts.services import account_has_protected_history
from apps.core.services import write_audit_log


def cleanup_expired_temporary_state(*, limit: int) -> int:
    """Remove expired signup challenges; no account or contact data is logged."""
    cutoff = timezone.now() - TECHNICAL_STATE_RETENTION
    ids = list(
        SignupEmailVerification.objects.filter(expires_at__lt=cutoff)
        .order_by("id").values_list("id", flat=True)[:limit]
    )
    if not ids:
        return 0
    deleted, _ = SignupEmailVerification.objects.filter(id__in=ids).delete()
    return deleted


def cleanup_history_free_accounts(*, limit: int) -> int:
    cutoff = timezone.now() - HISTORY_FREE_CLOSURE_RETENTION
    active_holds = AccountRetentionHold.objects.filter(
        user_id=OuterRef("pk"),
        released_at__isnull=True,
    )
    candidates = list(
        User.objects.filter(closed_at__lte=cutoff, is_active=False)
        .annotate(has_active_retention_hold=Exists(active_holds))
        .filter(has_active_retention_hold=False)
        .order_by("id")
        .values_list("id", flat=True)[:limit]
    )
    deleted = 0
    for user_id in candidates:
        with transaction.atomic():
            user = User.objects.select_for_update().filter(id=user_id).first()
            if user is None:
                continue
            if AccountRetentionHold.objects.filter(user=user, released_at__isnull=True).exists():
                continue
            if account_has_protected_history(user=user):
                continue
            write_audit_log(
                action="account.retention_hard_deleted",
                entity_type="User",
                entity_id=user.id,
                metadata={"closure_mode": "history_free"},
            )
            user.delete()
            deleted += 1
    return deleted
