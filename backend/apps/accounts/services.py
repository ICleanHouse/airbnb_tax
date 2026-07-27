from __future__ import annotations

import uuid
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q
from django.conf import settings
from django.utils import timezone

from apps.accounts.models import (
    AgencyInvitation,
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    PilotEvidenceExclusion,
    User,
)
from apps.connections.models import Connection
from apps.core.services import write_audit_log
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob, Dispute, ReplacementRequest
from apps.core.logging import get_request_id
from apps.notifications.services import NotificationEventRequest, emit_notification_event
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


@dataclass(frozen=True)
class AgencyReadiness:
    """A single, non-sensitive source of truth for agency marketplace gates."""

    marketplace_eligible: bool
    profile_complete: bool
    eligible_active_members_count: int
    blockers: tuple[str, ...]


def cleaner_is_agency_member_eligible(cleaner: User) -> bool:
    """The member predicate intentionally reuses the cleaner pilot gate."""
    profile = getattr(cleaner, "cleaner_profile", None)
    return bool(
        cleaner.is_active
        and cleaner.is_cleaner
        and cleaner.is_approved
        and cleaner.is_contact_verified
        and profile
        and profile.is_verified
    )


def agency_readiness(*, agency_user: User) -> AgencyReadiness:
    """Return stable blockers without leaking roster contacts or account data."""
    current = User.objects.select_related("agency_profile").get(id=agency_user.id)
    profile = getattr(current, "agency_profile", None)
    blockers: list[str] = []
    if not current.is_active or not current.is_agency or not current.is_approved:
        blockers.append("account_not_eligible")
    if not current.is_contact_verified:
        blockers.append("contact_not_verified")
    profile_complete = bool(profile and profile.is_complete)
    if not profile_complete:
        blockers.append("profile_incomplete")

    eligible_members = 0
    if profile is not None:
        memberships = AgencyMembership.objects.filter(
            agency=profile,
            status=AgencyMembership.Status.ACTIVE,
            cleaner__is_active=True,
            cleaner__role=User.Role.CLEANER,
            cleaner__account_status=User.AccountStatus.APPROVED,
            cleaner__email_verified_at__isnull=False,
            cleaner__cleaner_profile__verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        if settings.PHONE_VERIFICATION_REQUIRED:
            memberships = memberships.filter(cleaner__phone_verified_at__isnull=False)
        eligible_members = memberships.count()
    if eligible_members == 0:
        blockers.append("no_eligible_active_member")
    return AgencyReadiness(
        marketplace_eligible=not blockers,
        profile_complete=profile_complete,
        eligible_active_members_count=eligible_members,
        blockers=tuple(blockers),
    )


def ensure_agency_marketplace_eligible(*, agency_user: User) -> AgencyReadiness:
    readiness = agency_readiness(agency_user=agency_user)
    if not readiness.marketplace_eligible:
        raise AccountTransitionError(
            code="agency_marketplace_ineligible",
            detail="Agency marketplace access is not ready for new work.",
            fields={"blockers": list(readiness.blockers)},
        )
    return readiness


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
    del title, body
    event_type = (
        "cleaner.marketplace_access_activated"
        if notification_type == "cleaner.marketplace_eligible"
        else notification_type
    )
    emit_notification_event(
        NotificationEventRequest(
            event_type=event_type,
            recipient_id=user.id,
            occurrence_key=deduplication_key,
            destination="/admin" if user.is_platform_admin else "/app",
            source_entity_type="User",
            source_entity_id=str(user.id),
            request_id=get_request_id(),
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
            code="agency_account_not_eligible",
            detail="An active approved agency account is required to invite cleaners.",
        )


def ensure_invitation_can_be_accepted(*, agency_user: User, cleaner: User) -> None:
    ensure_agency_can_invite(agency_user=agency_user)
    current_cleaner = User.objects.get(id=cleaner.id)
    if not cleaner_is_agency_member_eligible(current_cleaner):
        raise AccountTransitionError(
            code="cleaner_membership_ineligible",
            detail="This cleaner is not currently eligible for agency membership.",
        )


def _write_agency_audit(*, actor: User | None, action: str, entity_id: int, metadata: dict | None = None) -> None:
    write_audit_log(
        actor=actor,
        action=action,
        entity_type="AgencyInvitation" if action.startswith("agency_invitation") else "AgencyMembership",
        entity_id=entity_id,
        metadata=metadata or {},
    )


@transaction.atomic
def create_agency_invitation(
    *, agency_user: User, target_cleaner_id: int, actor: User, message: str = ""
) -> AgencyInvitation:
    agency_user = User.objects.select_for_update().get(id=agency_user.id)
    ensure_agency_can_invite(agency_user=agency_user)
    agency = AgencyProfile.objects.select_for_update().get(user=agency_user)
    target = User.objects.select_for_update().select_related("cleaner_profile").filter(id=target_cleaner_id).first()
    if target is None or not target.is_cleaner:
        raise AccountTransitionError(code="cleaner_not_found", detail="The selected cleaner is not available.")
    ensure_invitation_can_be_accepted(agency_user=agency_user, cleaner=target)
    membership = AgencyMembership.objects.select_for_update().filter(agency=agency, cleaner=target).first()
    if membership and membership.is_active:
        raise AccountTransitionError(
            code="agency_membership_already_active",
            detail="This cleaner is already an active agency member.",
        )
    pending = AgencyInvitation.objects.select_for_update().filter(
        agency=agency,
        target_cleaner=target,
        status=AgencyInvitation.Status.PENDING,
    ).first()
    if pending is not None:
        if pending.is_expired:
            pending.status = AgencyInvitation.Status.EXPIRED
            pending.save(update_fields=["status", "updated_at"])
        else:
            raise AccountTransitionError(
                code="agency_invitation_pending",
                detail="A pending invitation already exists for this cleaner.",
            )
    invitation = AgencyInvitation.objects.create(
        agency=agency,
        target_cleaner=target,
        invited_by=actor,
        token=uuid.uuid4().hex,
        message=message.strip(),
    )
    _write_agency_audit(
        actor=actor,
        action="agency_invitation.created",
        entity_id=invitation.id,
        metadata={"agency_id": agency.id, "target_cleaner_id": target.id},
    )
    emit_notification_event(
        NotificationEventRequest(
            event_type="agency.invitation_received",
            recipient_id=target.id,
            occurrence_key=f"agency.invitation_received:{invitation.id}",
            destination="/cleaner",
            source_entity_type="AgencyInvitation",
            source_entity_id=str(invitation.id),
        )
    )
    return invitation


def _locked_pending_invitation(*, invitation_id: int) -> AgencyInvitation:
    invitation = (
        AgencyInvitation.objects.select_for_update()
        .select_related("agency", "agency__user", "target_cleaner")
        .get(id=invitation_id)
    )
    if invitation.status != AgencyInvitation.Status.PENDING:
        raise AccountTransitionError(
            code="agency_invitation_not_pending",
            detail="This invitation is no longer pending.",
        )
    if invitation.is_expired:
        invitation.status = AgencyInvitation.Status.EXPIRED
        invitation.save(update_fields=["status", "updated_at"])
        raise AccountTransitionError(
            code="agency_invitation_expired", detail="This invitation has expired."
        )
    return invitation


@transaction.atomic
def accept_agency_invitation(*, invitation_id: int, cleaner: User) -> AgencyMembership:
    invitation = _locked_pending_invitation(invitation_id=invitation_id)
    if invitation.target_cleaner_id != cleaner.id:
        raise AccountTransitionError(code="agency_invitation_forbidden", detail="This invitation is not available.")
    cleaner = User.objects.select_for_update().select_related("cleaner_profile").get(id=cleaner.id)
    ensure_invitation_can_be_accepted(agency_user=invitation.agency.user, cleaner=cleaner)
    was_ready = agency_readiness(agency_user=invitation.agency.user).marketplace_eligible
    membership = AgencyMembership.objects.select_for_update().filter(
        agency=invitation.agency, cleaner=cleaner
    ).first()
    if membership is None:
        membership = AgencyMembership.objects.create(
            agency=invitation.agency,
            cleaner=cleaner,
            invited_by=invitation.invited_by,
            invitation=invitation,
            status=AgencyMembership.Status.ACTIVE,
        )
    elif membership.status != AgencyMembership.Status.ACTIVE:
        membership.status = AgencyMembership.Status.ACTIVE
        membership.revoked_at = None
        membership.invited_by = invitation.invited_by
        membership.invitation = invitation
        membership.save(update_fields=["status", "revoked_at", "invited_by", "invitation", "updated_at"])
    invitation.status = AgencyInvitation.Status.ACCEPTED
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["status", "accepted_at", "updated_at"])
    _write_agency_audit(
        actor=cleaner,
        action="agency_invitation.accepted",
        entity_id=invitation.id,
        metadata={"agency_id": invitation.agency_id, "target_cleaner_id": cleaner.id},
    )
    emit_notification_event(
        NotificationEventRequest(
            event_type="agency.invitation_accepted",
            recipient_id=invitation.agency.user_id,
            occurrence_key=f"agency.invitation_accepted:{invitation.id}",
            destination="/agency",
            source_entity_type="AgencyInvitation",
            source_entity_id=str(invitation.id),
        )
    )
    is_ready = agency_readiness(agency_user=invitation.agency.user).marketplace_eligible
    if is_ready and not was_ready:
        emit_notification_event(
            NotificationEventRequest(
                event_type="agency.marketplace_access_activated",
                recipient_id=invitation.agency.user_id,
                occurrence_key=f"agency.marketplace_access_activated:{invitation.agency_id}",
                destination="/agency",
                source_entity_type="AgencyProfile",
                source_entity_id=str(invitation.agency_id),
            )
        )
    return membership


@transaction.atomic
def decline_agency_invitation(*, invitation_id: int, cleaner: User) -> AgencyInvitation:
    invitation = _locked_pending_invitation(invitation_id=invitation_id)
    if invitation.target_cleaner_id != cleaner.id:
        raise AccountTransitionError(code="agency_invitation_forbidden", detail="This invitation is not available.")
    invitation.status = AgencyInvitation.Status.DECLINED
    invitation.save(update_fields=["status", "updated_at"])
    _write_agency_audit(actor=cleaner, action="agency_invitation.declined", entity_id=invitation.id)
    emit_notification_event(
        NotificationEventRequest(
            event_type="agency.invitation_declined",
            recipient_id=invitation.agency.user_id,
            occurrence_key=f"agency.invitation_declined:{invitation.id}",
            destination="/agency",
            source_entity_type="AgencyInvitation",
            source_entity_id=str(invitation.id),
        )
    )
    return invitation


@transaction.atomic
def revoke_agency_invitation(*, invitation_id: int, actor: User) -> AgencyInvitation:
    invitation = _locked_pending_invitation(invitation_id=invitation_id)
    if not actor.is_platform_admin and invitation.agency.user_id != actor.id:
        raise AccountTransitionError(code="agency_invitation_forbidden", detail="This invitation is not available.")
    invitation.status = AgencyInvitation.Status.REVOKED
    invitation.save(update_fields=["status", "updated_at"])
    _write_agency_audit(actor=actor, action="agency_invitation.revoked", entity_id=invitation.id)
    return invitation


@transaction.atomic
def resend_agency_invitation(*, invitation_id: int, actor: User) -> AgencyInvitation:
    invitation = (
        AgencyInvitation.objects.select_for_update()
        .select_related("agency", "agency__user", "target_cleaner")
        .get(id=invitation_id)
    )
    if not actor.is_platform_admin and invitation.agency.user_id != actor.id:
        raise AccountTransitionError(code="agency_invitation_forbidden", detail="This invitation is not available.")
    if invitation.target_cleaner_id is None:
        raise AccountTransitionError(code="agency_invitation_not_reissuable", detail="This historical invitation cannot be reissued.")
    if invitation.status == AgencyInvitation.Status.PENDING:
        invitation.status = AgencyInvitation.Status.SUPERSEDED
        invitation.save(update_fields=["status", "updated_at"])
    elif invitation.status not in {
        AgencyInvitation.Status.DECLINED,
        AgencyInvitation.Status.REVOKED,
        AgencyInvitation.Status.EXPIRED,
        AgencyInvitation.Status.SUPERSEDED,
    }:
        raise AccountTransitionError(code="agency_invitation_not_reissuable", detail="This invitation cannot be reissued.")
    target = User.objects.select_for_update().select_related("cleaner_profile").get(id=invitation.target_cleaner_id)
    ensure_invitation_can_be_accepted(agency_user=invitation.agency.user, cleaner=target)
    successor = AgencyInvitation.objects.create(
        agency=invitation.agency,
        target_cleaner=target,
        invited_by=actor,
        token=uuid.uuid4().hex,
        message=invitation.message,
        reissued_from=invitation,
    )
    _write_agency_audit(
        actor=actor,
        action="agency_invitation.reissued",
        entity_id=successor.id,
        metadata={"source_invitation_id": invitation.id},
    )
    emit_notification_event(
        NotificationEventRequest(
            event_type="agency.invitation_received",
            recipient_id=target.id,
            occurrence_key=f"agency.invitation_received:{successor.id}",
            destination="/cleaner",
            source_entity_type="AgencyInvitation",
            source_entity_id=str(successor.id),
        )
    )
    return successor


@transaction.atomic
def revoke_agency_membership(*, membership_id: int, actor: User, by_member: bool = False) -> AgencyMembership:
    membership = (
        AgencyMembership.objects.select_for_update()
        .select_related("agency", "agency__user", "cleaner")
        .get(id=membership_id)
    )
    permitted = actor.is_platform_admin or (
        membership.cleaner_id == actor.id if by_member else membership.agency.user_id == actor.id
    )
    if not permitted:
        raise AccountTransitionError(code="agency_membership_forbidden", detail="This membership is not available.")
    if membership.status == AgencyMembership.Status.REVOKED:
        return membership
    membership.status = AgencyMembership.Status.REVOKED
    membership.revoked_at = timezone.now()
    membership.save(update_fields=["status", "revoked_at", "updated_at"])
    _write_agency_audit(
        actor=actor,
        action="agency_membership.left" if by_member else "agency_membership.revoked",
        entity_id=membership.id,
        metadata={"agency_id": membership.agency_id, "cleaner_id": membership.cleaner_id},
    )
    event_type = "agency.membership_left" if by_member else "agency.membership_revoked"
    recipient_id = membership.agency.user_id if by_member else membership.cleaner_id
    emit_notification_event(
        NotificationEventRequest(
            event_type=event_type,
            recipient_id=recipient_id,
            occurrence_key=f"{event_type}:{membership.id}:{membership.revoked_at.isoformat()}",
            destination="/agency" if by_member else "/cleaner",
            source_entity_type="AgencyMembership",
            source_entity_id=str(membership.id),
        )
    )
    return membership


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
    has_pending_recovery = ReplacementRequest.objects.filter(
        status__in=[
            ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION,
            ReplacementRequest.Status.AUTHORIZED,
        ]
    ).filter(
        Q(source_job__host=user)
        | Q(requested_by=user)
        | Q(source_job__assignment__cleaner=user)
        | Q(source_job__assignment__assigned_member=user)
    ).exists()
    has_unresolved_dispute = Dispute.objects.filter(status=Dispute.Status.OPEN).filter(
        Q(job__host=user)
        | Q(filed_by=user)
        | Q(job__assignment__cleaner=user)
        | Q(job__assignment__assigned_member=user)
    ).exists()
    if has_active_jobs or has_active_assignments or has_pending_recovery or has_unresolved_dispute:
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
