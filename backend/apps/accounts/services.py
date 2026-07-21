from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q
from django.conf import settings
from django.utils import timezone

from apps.accounts.models import CleanerProfile, PilotEvidenceExclusion, User
from apps.connections.models import Connection
from apps.core.services import write_audit_log
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.notifications.services import create_notification_once
from apps.notifications.tasks import dispatch_notification
from config.verification import validate_runtime_verification_configuration


TRANSITION_VERSION = 1
ACCOUNT_REASON_CATEGORIES = frozenset(
    {
        "contact_policy_satisfied",
        "verification_requirement_bypass",
        "policy_prerequisite_incomplete",
        "marketplace_safety",
        "terms_or_policy_breach",
        "operator_support",
    }
)
MAX_INTERNAL_NOTE_LENGTH = 2000


class AccountTransitionError(ValueError):
    def __init__(self, *, code: str, detail: str, fields: dict | None = None):
        self.code = code
        self.detail = detail
        self.fields = fields or {}
        super().__init__(detail)


@dataclass(frozen=True)
class VerificationReconciliationResult:
    user: User
    cleaner_profile: CleanerProfile | None
    account_changed: bool
    cleaner_changed: bool

    @property
    def changed(self) -> bool:
        return self.account_changed or self.cleaner_changed


@dataclass(frozen=True)
class AccountTransitionResult:
    user: User
    changed: bool


def _validate_transition_input(
    *, expected_status: str, reason_category: str, internal_note: str
) -> None:
    if expected_status not in User.AccountStatus.values:
        raise AccountTransitionError(
            code="invalid_expected_status",
            detail="expected_status is required and must be a valid account state.",
        )
    if reason_category not in ACCOUNT_REASON_CATEGORIES:
        raise AccountTransitionError(
            code="invalid_reason_category",
            detail="A supported neutral reason_category is required.",
        )
    if len(internal_note) > MAX_INTERNAL_NOTE_LENGTH:
        raise AccountTransitionError(
            code="internal_note_too_long",
            detail=f"internal_note must be at most {MAX_INTERNAL_NOTE_LENGTH} characters.",
        )


def _notify_once(
    *,
    user: User,
    notification_type: str,
    title: str,
    body: str,
    deduplication_key: str,
) -> None:
    notification, created = create_notification_once(
        user=user,
        notification_type=notification_type,
        title=title,
        body=body,
        deduplication_key=deduplication_key,
        metadata={"transition_version": TRANSITION_VERSION},
    )
    if created:
        transaction.on_commit(
            lambda notification_id=notification.id: dispatch_notification.delay(
                notification_id
            )
        )


def _transition_metadata(
    *,
    previous_status: str,
    next_status: str,
    outcome: str,
    reason_category: str,
    internal_note: str = "",
    trigger: str = "",
) -> dict:
    return {
        "previous_status": previous_status,
        "next_status": next_status,
        "outcome": outcome,
        "reason_category": reason_category,
        "internal_note": internal_note,
        "trigger": trigger,
        "transition_version": TRANSITION_VERSION,
    }


@transaction.atomic
def reconcile_contact_verification(
    *, user_id: int, trigger: str, actor: User | None = None, request=None
) -> VerificationReconciliationResult:
    configuration = validate_runtime_verification_configuration()
    user = User.objects.select_for_update().get(id=user_id)
    cleaner_profile = None
    if user.is_cleaner:
        cleaner_profile = (
            CleanerProfile.objects.select_for_update().filter(user=user).first()
        )

    if configuration.uses_requirement_bypass:
        exclusion, created = PilotEvidenceExclusion.objects.get_or_create(
            user=user,
            defaults={
                "reason_category": PilotEvidenceExclusion.ReasonCategory.VERIFICATION_REQUIREMENT_BYPASS,
                "account_approval_required": configuration.account_approval_required,
                "cleaner_verification_required": configuration.cleaner_verification_required,
                "phone_verification_required": configuration.phone_verification_required,
            },
        )
        if created:
            write_audit_log(
                actor=actor,
                action="pilot.evidence_excluded",
                entity_type="User",
                entity_id=user.id,
                request=request,
                metadata={
                    "reason_category": exclusion.reason_category,
                    "account_approval_required": exclusion.account_approval_required,
                    "cleaner_verification_required": exclusion.cleaner_verification_required,
                    "phone_verification_required": exclusion.phone_verification_required,
                },
            )

    # A rejected/suspended account is never restored and its cleaner state is
    # not advanced behind the terminal access decision.
    if user.account_status in {
        User.AccountStatus.REJECTED,
        User.AccountStatus.SUSPENDED,
    }:
        return VerificationReconciliationResult(user, cleaner_profile, False, False)

    contact_ready = user.is_contact_verified
    account_ready = (
        not configuration.account_approval_required or contact_ready
    )
    cleaner_ready = (
        not configuration.cleaner_verification_required or contact_ready
    )
    reason_category = (
        "verification_requirement_bypass"
        if configuration.uses_requirement_bypass
        else "contact_policy_satisfied"
    )
    now = timezone.now()
    account_changed = False
    cleaner_changed = False

    if user.account_status == User.AccountStatus.PENDING and account_ready:
        previous_status = user.account_status
        user.account_status = User.AccountStatus.APPROVED
        user.approved_at = now
        user.approved_by = actor
        user.save(update_fields=["account_status", "approved_at", "approved_by"])
        account_changed = True
        write_audit_log(
            actor=actor,
            action="account.approved",
            entity_type="User",
            entity_id=user.id,
            request=request,
            metadata=_transition_metadata(
                previous_status=previous_status,
                next_status=user.account_status,
                outcome="changed",
                reason_category=reason_category,
                trigger=trigger,
            ),
        )
        _notify_once(
            user=user,
            notification_type="account.approved",
            title="Marketplace account active",
            body="Your account now has marketplace access under the contact-confirmation policy.",
            deduplication_key=f"account.approved:{user.id}:{TRANSITION_VERSION}",
        )

    if (
        cleaner_profile is not None
        and cleaner_profile.verification_status
        == CleanerProfile.VerificationStatus.PENDING
        and cleaner_ready
    ):
        previous_status = cleaner_profile.verification_status
        cleaner_profile.verification_status = (
            CleanerProfile.VerificationStatus.VERIFIED
        )
        cleaner_profile.save(update_fields=["verification_status", "updated_at"])
        cleaner_changed = True
        write_audit_log(
            actor=actor,
            action="cleaner.marketplace_eligible",
            entity_type="CleanerProfile",
            entity_id=cleaner_profile.id,
            request=request,
            metadata=_transition_metadata(
                previous_status=previous_status,
                next_status=cleaner_profile.verification_status,
                outcome="changed",
                reason_category=reason_category,
                trigger=trigger,
            ),
        )
        _notify_once(
            user=user,
            notification_type="cleaner.marketplace_eligible",
            title="Marketplace access active",
            body="Your email-confirmed cleaner profile can now use marketplace actions. This is not an identity or reference review.",
            deduplication_key=f"cleaner.eligible:{cleaner_profile.id}:{TRANSITION_VERSION}",
        )

    return VerificationReconciliationResult(
        user, cleaner_profile, account_changed, cleaner_changed
    )


@transaction.atomic
def reject_account(
    *,
    user_id: int,
    actor: User,
    expected_status: str,
    reason_category: str,
    internal_note: str = "",
    request=None,
) -> AccountTransitionResult:
    _validate_transition_input(
        expected_status=expected_status,
        reason_category=reason_category,
        internal_note=internal_note,
    )
    user = User.objects.select_for_update().get(id=user_id)
    if user.is_cleaner:
        CleanerProfile.objects.select_for_update().filter(user=user).first()
    if user.account_status != expected_status:
        raise AccountTransitionError(
            code="account_state_conflict",
            detail="The account state changed before this decision was applied.",
            fields={"current_status": user.account_status},
        )
    if user.account_status == User.AccountStatus.REJECTED:
        return AccountTransitionResult(user, False)
    if user.account_status != User.AccountStatus.PENDING:
        raise AccountTransitionError(
            code="invalid_account_transition",
            detail="Only pending accounts can be rejected; suspend approved accounts.",
        )
    previous_status = user.account_status
    user.account_status = User.AccountStatus.REJECTED
    user.save(update_fields=["account_status"])
    write_audit_log(
        actor=actor,
        action="account.rejected",
        entity_type="User",
        entity_id=user.id,
        request=request,
        metadata=_transition_metadata(
            previous_status=previous_status,
            next_status=user.account_status,
            outcome="changed",
            reason_category=reason_category,
            internal_note=internal_note,
        ),
    )
    _notify_once(
        user=user,
        notification_type="account.rejected",
        title="Marketplace access unavailable",
        body="Your account could not be activated. Contact support if you need help.",
        deduplication_key=f"account.rejected:{user.id}:{TRANSITION_VERSION}",
    )
    return AccountTransitionResult(user, True)


@transaction.atomic
def suspend_account(
    *,
    user_id: int,
    actor: User,
    expected_status: str,
    reason_category: str,
    internal_note: str = "",
    request=None,
) -> AccountTransitionResult:
    _validate_transition_input(
        expected_status=expected_status,
        reason_category=reason_category,
        internal_note=internal_note,
    )
    user = User.objects.select_for_update().get(id=user_id)
    if user.is_cleaner:
        CleanerProfile.objects.select_for_update().filter(user=user).first()
    if user.account_status != expected_status:
        raise AccountTransitionError(
            code="account_state_conflict",
            detail="The account state changed before this decision was applied.",
            fields={"current_status": user.account_status},
        )
    if user.account_status == User.AccountStatus.SUSPENDED:
        return AccountTransitionResult(user, False)
    if user.account_status not in {
        User.AccountStatus.PENDING,
        User.AccountStatus.APPROVED,
    }:
        raise AccountTransitionError(
            code="invalid_account_transition",
            detail="Only pending or approved accounts can be suspended.",
        )
    previous_status = user.account_status
    user.account_status = User.AccountStatus.SUSPENDED
    user.save(update_fields=["account_status"])
    write_audit_log(
        actor=actor,
        action="account.suspended",
        entity_type="User",
        entity_id=user.id,
        request=request,
        metadata=_transition_metadata(
            previous_status=previous_status,
            next_status=user.account_status,
            outcome="changed",
            reason_category=reason_category,
            internal_note=internal_note,
        ),
    )
    _notify_once(
        user=user,
        notification_type="account.suspended",
        title="Marketplace access suspended",
        body="New marketplace actions are unavailable. Your history remains available where permitted.",
        deduplication_key=f"account.suspended:{user.id}:{TRANSITION_VERSION}",
    )
    return AccountTransitionResult(user, True)


class AccountDeletionBlocked(ValueError):
    def __init__(self, *, code: str, detail: str, fields: dict | None = None):
        self.code = code
        self.detail = detail
        self.fields = fields or {}
        super().__init__(detail)


def ensure_agency_can_invite(*, agency_user: User) -> None:
    current = User.objects.get(id=agency_user.id)
    if not current.is_active or not current.is_agency or not current.is_approved:
        raise AccountTransitionError(
            code="agency_marketplace_ineligible",
            detail="Agency marketplace access must be active before inviting cleaners.",
        )


def ensure_invitation_can_be_accepted(*, agency_user: User, cleaner: User) -> None:
    ensure_agency_can_invite(agency_user=agency_user)
    current_cleaner = User.objects.get(id=cleaner.id)
    if (
        not current_cleaner.is_active
        or not current_cleaner.is_cleaner
        or current_cleaner.account_status
        in {User.AccountStatus.REJECTED, User.AccountStatus.SUSPENDED}
    ):
        raise AccountTransitionError(
            code="cleaner_membership_ineligible",
            detail="This cleaner account cannot accept agency membership.",
        )


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
