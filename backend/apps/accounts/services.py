from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.conf import settings

from apps.accounts.models import User
from apps.connections.models import Connection
from apps.core.services import write_audit_log
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob


class AccountDeletionBlocked(ValueError):
    def __init__(self, *, code: str, detail: str, fields: dict | None = None):
        self.code = code
        self.detail = detail
        self.fields = fields or {}
        super().__init__(detail)


def account_deletion_blocker(*, user: User) -> AccountDeletionBlocked | None:
    actionable_statuses = [
        CleaningJob.Status.DRAFT,
        CleaningJob.Status.OPEN,
        CleaningJob.Status.ASSIGNED,
    ]
    has_active_jobs = CleaningJob.objects.filter(
        host=user, status__in=actionable_statuses
    ).exists()
    has_active_assignments = Assignment.objects.filter(
        Q(cleaner=user) | Q(assigned_member=user),
        cancelled_at__isnull=True,
        completed_at__isnull=True,
        job__status__in=actionable_statuses,
    ).exists()
    if has_active_jobs or has_active_assignments:
        return AccountDeletionBlocked(
            code="account_deletion_blocked_active_obligations",
            detail="Account deletion is blocked while marketplace obligations are active.",
        )

    has_marketplace_history = (
        CleaningJob.objects.filter(host=user).exists()
        or Assignment.objects.filter(Q(cleaner=user) | Q(assigned_member=user)).exists()
        or CleanerApplication.objects.filter(cleaner=user).exists()
    )
    if has_marketplace_history:
        return AccountDeletionBlocked(
            code="account_deletion_requires_support",
            detail="Marketplace history must be handled by support before account deletion.",
            fields={
                "support_channel": settings.MARKETPLACE_SUPPORT_CHANNEL,
                "support_hours": "08:00-20:00 Europe/Sofia daily",
                "emergency_service": False,
            },
        )
    return None


def ensure_account_can_be_deleted(*, user: User) -> None:
    blocker = account_deletion_blocker(user=user)
    if blocker is not None:
        raise blocker


@transaction.atomic
def delete_account_permanently(*, user: User, request=None) -> None:
    user = User.objects.select_for_update().get(id=user.id)
    ensure_account_can_be_deleted(user=user)
    user_id = user.id
    role = user.role

    Connection.objects.filter(Q(requester=user) | Q(addressee=user)).delete()
    write_audit_log(
        actor=user,
        action="account.deleted",
        entity_type="User",
        entity_id=user_id,
        request=request,
        metadata={"role": role},
    )
    user.delete()
