from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, User
from apps.core.services import write_audit_log
from apps.marketplace.models import (
    Assignment,
    CleanerApplication,
    CleaningJob,
    Dispute,
    DisputeUpdate,
    FavouriteCleaner,
    JobIncident,
    JobLifecycleEvent,
    ReplacementRequest,
    RescheduleProposal,
    TurnoverLineage,
)
from apps.marketplace.selectors import valid_future_marketplace_jobs
from apps.notifications.services import create_notification, create_notification_once
from apps.notifications.tasks import send_application_submitted_email, send_job_completed_email


class MarketplaceError(ValueError):
    pass


class LifecycleError(MarketplaceError):
    code = "lifecycle_error"
    detail = "The lifecycle action could not be completed."
    status_code = 400
    fields: dict = {}

    def __init__(self, detail: str | None = None, *, fields: dict | None = None):
        self.detail = detail or self.detail
        self.fields = fields or {}
        super().__init__(self.detail)


class LifecycleConflict(LifecycleError):
    code = "transition_conflict"
    detail = "The job changed and this action is no longer available."
    status_code = 409


class LifecycleInputError(LifecycleError):
    code = "invalid_input"
    detail = "Correct the highlighted fields and try again."
    status_code = 400


class CleanerScheduleConflictError(MarketplaceError):
    code = "cleaner_schedule_conflict"
    detail = "The cleaner is unavailable for this time range."

    def __init__(self):
        super().__init__(self.detail)


FAVOURITE_TARGET_INELIGIBLE = (
    "Only cleaners with active marketplace access can be favourited."
)
JOB_START_NOT_FUTURE = (
    "This job is no longer available because its scheduled start must be in the future."
)


def ensure_favourite_target_eligible(cleaner: User) -> None:
    if not cleaner.is_public_marketplace_eligible_cleaner:
        raise MarketplaceError(FAVOURITE_TARGET_INELIGIBLE)


@transaction.atomic
def create_favourite_cleaner(*, host: User, cleaner: User) -> tuple[FavouriteCleaner, bool]:
    host = User.objects.select_related("cleaner_profile").get(id=host.id)
    if not host.is_host or not host.is_marketplace_eligible:
        raise MarketplaceError(
            "Only active approved hosts can save favourite cleaners."
        )
    ensure_favourite_target_eligible(cleaner)
    return FavouriteCleaner.objects.get_or_create(host=host, cleaner=cleaner)


def _request_id(request) -> str:
    return getattr(request, "request_id", "") if request is not None else ""


def _record_lifecycle_event(
    *,
    job: CleaningJob,
    event_type: str,
    actor: User | None,
    from_status: str = "",
    to_status: str = "",
    reason_code: str = "",
    audience: str = JobLifecycleEvent.Audience.JOB_PARTICIPANTS,
    metadata: dict | None = None,
    request=None,
) -> JobLifecycleEvent:
    return JobLifecycleEvent.objects.create(
        lineage=job.lineage,
        job=job,
        actor=actor,
        actor_role_snapshot=getattr(actor, "role", "") if actor else "",
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        reason_code=reason_code,
        audience=audience,
        request_id=_request_id(request),
        metadata=metadata or {},
    )


@transaction.atomic
def create_cleaning_job(
    *,
    actor: User,
    property,
    title: str,
    scheduled_start,
    scheduled_end,
    batch=None,
    description: str = "",
    currency: str = "EUR",
    proposed_price: Decimal | None = None,
    agreed_price: Decimal | None = None,
    cleaning_instructions: str = "",
    request=None,
) -> CleaningJob:
    actor = User.objects.get(pk=actor.pk)
    if not (actor.is_platform_admin or property.host_id == actor.id):
        raise LifecycleInputError("Jobs can be created only for an owned property.")
    if not actor.is_platform_admin and (
        not actor.is_active or not actor.is_approved or not actor.is_host
    ):
        raise LifecycleInputError("Only approved hosts can create cleaning jobs.")
    if scheduled_end <= scheduled_start:
        raise LifecycleInputError(
            fields={"scheduled_end": ["scheduled_end must be after scheduled_start."]}
        )
    if batch is not None and batch.host_id != property.host_id:
        raise LifecycleInputError("Job batch must belong to the property host.")

    lineage = TurnoverLineage.objects.create(property=property, host=property.host)
    try:
        job = CleaningJob.objects.create(
            lineage=lineage,
            property=property,
            host=property.host,
            batch=batch,
            title=title,
            description=description,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            currency=currency,
            proposed_price=proposed_price,
            agreed_price=agreed_price,
            status=CleaningJob.Status.DRAFT,
            cleaning_instructions=cleaning_instructions,
        )
    except IntegrityError as exc:
        error = LifecycleConflict(
            "An actionable job already exists for this property and time.",
        )
        error.code = "exact_slot_conflict"
        raise error from exc
    _record_lifecycle_event(
        job=job,
        actor=actor,
        event_type=JobLifecycleEvent.EventType.JOB_CREATED,
        to_status=job.status,
        metadata={"source": "job_creation_service"},
        request=request,
    )
    write_audit_log(
        actor=actor,
        action="job.created",
        entity_type="CleaningJob",
        entity_id=job.id,
        request=request,
        metadata={"status": job.status, "lineage_id": job.lineage_id},
    )
    return job


def _lock_lineage_and_job(job_id: int) -> CleaningJob:
    initial = CleaningJob.objects.only("id", "lineage_id").get(pk=job_id)
    TurnoverLineage.objects.select_for_update().get(pk=initial.lineage_id)
    return (
        CleaningJob.objects.select_for_update()
        .select_related("host", "property", "lineage")
        .get(pk=job_id)
    )


@transaction.atomic
def publish_job(job: CleaningJob, *, actor: User | None = None, request=None) -> CleaningJob:
    job = _lock_lineage_and_job(job.pk)
    if actor is None:
        actor = job.host
    else:
        actor = User.objects.get(pk=actor.pk)

    if not actor.is_active:
        raise MarketplaceError("This account cannot publish cleaning jobs.")
    if not actor.is_platform_admin:
        if not actor.is_approved or not actor.is_host or actor.id != job.host_id:
            raise MarketplaceError("Only the approved job host or admin can publish this job.")
    if job.status != CleaningJob.Status.DRAFT:
        raise MarketplaceError("Only draft jobs can be published.")
    previous_status = job.status
    job.status = CleaningJob.Status.OPEN
    job.published_at = timezone.now()
    job.save(update_fields=["status", "published_at", "updated_at"])
    _record_lifecycle_event(
        job=job,
        actor=actor,
        event_type=JobLifecycleEvent.EventType.JOB_PUBLISHED,
        from_status=previous_status,
        to_status=job.status,
        request=request,
    )
    write_audit_log(
        actor=actor,
        action="job.published",
        entity_type="CleaningJob",
        entity_id=job.id,
        request=request,
    )
    return job


def _cancellation_notice_band(job: CleaningJob, at) -> str:
    if at >= job.scheduled_start:
        return CleaningJob.CancellationNoticeBand.AFTER_START
    notice = job.scheduled_start - at
    if notice >= timedelta(hours=48):
        return CleaningJob.CancellationNoticeBand.AT_LEAST_48_HOURS
    if notice >= timedelta(hours=24):
        return CleaningJob.CancellationNoticeBand.FROM_24_TO_48_HOURS
    return CleaningJob.CancellationNoticeBand.UNDER_24_HOURS


def _job_assignment(job: CleaningJob) -> Assignment | None:
    try:
        return job.assignment
    except Assignment.DoesNotExist:
        return None


def _actor_is_job_participant(actor: User, job: CleaningJob, assignment: Assignment | None) -> bool:
    if actor.is_platform_admin or actor.id == job.host_id:
        return True
    return bool(
        assignment
        and actor.id in {assignment.cleaner_id, assignment.assigned_member_id}
    )


def lifecycle_actor_is_eligible(actor: User) -> bool:
    if (
        not actor.is_active
        or actor.account_status != User.AccountStatus.APPROVED
    ):
        return False
    if actor.is_platform_admin:
        return True
    if actor.is_cleaner:
        try:
            return actor.cleaner_profile.is_verified
        except CleanerProfile.DoesNotExist:
            return False
    return True


def derive_available_job_actions(*, job: CleaningJob, actor: User) -> list[str]:
    assignment = _job_assignment(job)
    if not _actor_is_job_participant(actor, job, assignment):
        return []
    if not lifecycle_actor_is_eligible(actor):
        return []

    actions: list[str] = []
    if job.status == CleaningJob.Status.DRAFT and (
        actor.is_platform_admin or actor.id == job.host_id
    ):
        actions.extend(["edit", "publish", "cancel"])
    elif job.status == CleaningJob.Status.OPEN and (
        actor.is_platform_admin or actor.id == job.host_id
    ):
        actions.append("cancel")
    elif job.status == CleaningJob.Status.ASSIGNED:
        agency_backed = bool(assignment and assignment.cleaner.is_agency)
        if actor.is_platform_admin or actor.id == job.host_id:
            actions.append("cancel")
        elif (
            assignment
            and not agency_backed
            and actor.id == assignment.cleaner_id
            and assignment.cancelled_at is None
        ):
            actions.append("cancel")
        if not agency_backed:
            actions.extend(["reschedule", "report_incident", "file_dispute"])
    elif job.status == CleaningJob.Status.CANCELLED:
        if not (assignment and assignment.cleaner.is_agency):
            actions.extend(["report_incident", "file_dispute", "request_replacement"])
    elif job.status == CleaningJob.Status.COMPLETED:
        if not (assignment and assignment.cleaner.is_agency):
            actions.append("file_dispute")
    return actions


@transaction.atomic
def cancel_job(
    *,
    job: CleaningJob,
    actor: User,
    reason_code: str,
    note: str = "",
    request=None,
) -> CleaningJob:
    job = _lock_lineage_and_job(job.pk)
    assignment = (
        Assignment.objects.select_for_update()
        .select_related("cleaner", "assigned_member")
        .filter(job=job)
        .first()
    )
    actor = User.objects.get(pk=actor.pk)

    if not _actor_is_job_participant(actor, job, assignment):
        raise LifecycleConflict("This lifecycle action is not available.")

    agency_backed = bool(assignment and assignment.cleaner.is_agency)
    if agency_backed and not (actor.is_platform_admin or actor.id == job.host_id):
        error = LifecycleConflict(
            "Agency recovery is not supported in the Stage 1 pilot. Contact support."
        )
        error.code = "agency_recovery_not_supported"
        raise error

    if not lifecycle_actor_is_eligible(actor):
        error = LifecycleConflict("This account is not eligible for lifecycle actions.")
        error.code = "account_not_eligible"
        raise error

    if reason_code not in CleaningJob.CancellationReason.values or reason_code.startswith("legacy_"):
        raise LifecycleInputError(
            fields={"reason_code": ["Choose a valid cancellation reason."]}
        )
    note = note.strip()
    if len(note) > 1000:
        raise LifecycleInputError(fields={"note": ["Ensure this value has at most 1000 characters."]})

    if job.status == CleaningJob.Status.CANCELLED:
        if (
            job.cancelled_by_id == actor.id
            and job.cancellation_reason_code == reason_code
            and job.cancellation_note == note
        ):
            return job
        raise LifecycleConflict("This job is already cancelled with different cancellation details.")
    if job.status == CleaningJob.Status.COMPLETED:
        error = LifecycleConflict("Completed jobs are terminal and cannot be cancelled.")
        error.code = "job_already_terminal"
        raise error
    if job.status not in {
        CleaningJob.Status.DRAFT,
        CleaningJob.Status.OPEN,
        CleaningJob.Status.ASSIGNED,
    }:
        raise LifecycleConflict()
    if "cancel" not in derive_available_job_actions(job=job, actor=actor):
        raise LifecycleConflict("This lifecycle action is not available.")

    now = timezone.now()
    previous_status = job.status
    job.status = CleaningJob.Status.CANCELLED
    job.cancelled_at = now
    job.cancelled_by = actor
    job.cancellation_reason_code = reason_code
    job.cancellation_note = note
    job.cancellation_notice_band = _cancellation_notice_band(job, now)
    job.save(
        update_fields=[
            "status",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason_code",
            "cancellation_note",
            "cancellation_notice_band",
            "updated_at",
        ]
    )
    if assignment and assignment.cancelled_at is None:
        assignment.cancelled_at = now
        assignment.save(update_fields=["cancelled_at", "updated_at"])
    CleanerApplication.objects.filter(
        job=job, status=CleanerApplication.Status.PENDING
    ).update(status=CleanerApplication.Status.REJECTED, updated_at=now)

    _record_lifecycle_event(
        job=job,
        actor=actor,
        event_type=JobLifecycleEvent.EventType.JOB_CANCELLED,
        from_status=previous_status,
        to_status=job.status,
        reason_code=reason_code,
        metadata={"notice_band": job.cancellation_notice_band},
        request=request,
    )
    write_audit_log(
        actor=actor,
        action="job.cancelled",
        entity_type="CleaningJob",
        entity_id=job.id,
        request=request,
        metadata={
            "reason_code": reason_code,
            "notice_band": job.cancellation_notice_band,
            "lineage_id": job.lineage_id,
        },
    )

    recipients: dict[int, User] = {job.host_id: job.host}
    if assignment:
        recipients[assignment.cleaner_id] = assignment.cleaner
        if assignment.assigned_member_id and assignment.assigned_member:
            recipients[assignment.assigned_member_id] = assignment.assigned_member
    recipients.pop(actor.id, None)
    for recipient in recipients.values():
        create_notification(
            user=recipient,
            notification_type="job.cancelled",
            title="Cleaning job cancelled",
            body="A cleaning job involving you was cancelled. Open your dashboard for details.",
            metadata={"job_id": job.id},
        )
    return job


def _recovery_assignment(job: CleaningJob) -> Assignment | None:
    return (
        Assignment.objects.select_for_update()
        .select_related("cleaner", "assigned_member")
        .filter(job=job)
        .first()
    )


def _ensure_direct_recovery(*, job: CleaningJob, actor: User, assignment: Assignment | None) -> None:
    if assignment and assignment.cleaner.is_agency:
        error = LifecycleConflict(
            "Agency recovery is not supported in the Stage 1 pilot. Contact support."
        )
        error.code = "agency_recovery_not_supported"
        raise error
    if not _actor_is_job_participant(actor, job, assignment):
        raise LifecycleConflict("This lifecycle action is not available.")
    if not lifecycle_actor_is_eligible(actor):
        error = LifecycleConflict("This account is not eligible for lifecycle actions.")
        error.code = "account_not_eligible"
        raise error


def _recovery_recipients(*, job: CleaningJob, assignment: Assignment | None, actor: User) -> list[User]:
    recipients = {job.host_id: job.host}
    if assignment:
        recipients[assignment.cleaner_id] = assignment.cleaner
        if assignment.assigned_member_id and assignment.assigned_member:
            recipients[assignment.assigned_member_id] = assignment.assigned_member
    recipients.pop(actor.id, None)
    return list(recipients.values())


@transaction.atomic
def propose_reschedule(*, job: CleaningJob, actor: User, scheduled_start, scheduled_end, request=None) -> RescheduleProposal:
    job = _lock_lineage_and_job(job.pk)
    assignment = _recovery_assignment(job)
    actor = User.objects.select_for_update().get(pk=actor.pk)
    _ensure_direct_recovery(job=job, actor=actor, assignment=assignment)
    if job.status != CleaningJob.Status.ASSIGNED or assignment is None or assignment.cancelled_at:
        raise LifecycleConflict("Only an active direct assignment can be rescheduled.")
    if scheduled_end <= scheduled_start:
        raise LifecycleInputError(fields={"scheduled_end": ["scheduled_end must be after scheduled_start."]})
    if scheduled_start <= timezone.now():
        raise LifecycleInputError(fields={"scheduled_start": ["The proposed time must be in the future."]})
    if scheduled_start == job.scheduled_start and scheduled_end == job.scheduled_end:
        raise LifecycleInputError(fields={"scheduled_start": ["Choose a different time range."]})
    expires_at = min(timezone.now() + timedelta(hours=24), job.scheduled_start - timedelta(hours=2))
    if expires_at <= timezone.now():
        raise LifecycleConflict("This job is too close to its scheduled start to reschedule.")
    RescheduleProposal.objects.filter(job=job, status=RescheduleProposal.Status.PENDING).update(
        status=RescheduleProposal.Status.EXPIRED, updated_at=timezone.now()
    )
    proposal = RescheduleProposal.objects.create(
        job=job, proposed_by=actor, original_start=job.scheduled_start, original_end=job.scheduled_end,
        proposed_start=scheduled_start, proposed_end=scheduled_end, expires_at=expires_at,
    )
    _record_lifecycle_event(
        job=job, actor=actor, event_type=JobLifecycleEvent.EventType.JOB_RESCHEDULED,
        reason_code="proposed", audience=JobLifecycleEvent.Audience.JOB_PARTICIPANTS,
        metadata={"proposal_id": proposal.id}, request=request,
    )
    for recipient in _recovery_recipients(job=job, assignment=assignment, actor=actor):
        create_notification_once(
            user=recipient, notification_type="job.reschedule_proposed", title="Reschedule proposed",
            body="A new time was proposed for an assigned cleaning job.", metadata={"job_id": job.id, "proposal_id": proposal.id},
            deduplication_key=f"reschedule-proposed:{proposal.id}:{recipient.id}",
        )
    return proposal


@transaction.atomic
def respond_to_reschedule_proposal(*, proposal: RescheduleProposal, actor: User, accept: bool, request=None) -> RescheduleProposal:
    proposal = RescheduleProposal.objects.select_for_update().select_related("job").get(pk=proposal.pk)
    job = _lock_lineage_and_job(proposal.job_id)
    assignment = _recovery_assignment(job)
    actor = User.objects.select_for_update().get(pk=actor.pk)
    _ensure_direct_recovery(job=job, actor=actor, assignment=assignment)
    if actor.id == proposal.proposed_by_id and not actor.is_platform_admin:
        raise LifecycleConflict("The counterpart must respond to this proposal.")
    if proposal.status != RescheduleProposal.Status.PENDING:
        raise LifecycleConflict("This reschedule proposal is no longer actionable.")
    if proposal.expires_at <= timezone.now():
        proposal.status = RescheduleProposal.Status.EXPIRED
        proposal.save(update_fields=["status", "updated_at"])
        raise LifecycleConflict("This reschedule proposal has expired.")
    proposal.responded_by = actor
    proposal.status = RescheduleProposal.Status.ACCEPTED if accept else RescheduleProposal.Status.DECLINED
    proposal.save(update_fields=["responded_by", "status", "updated_at"])
    if accept:
        _ensure_no_cleaner_schedule_conflict_for_range(
            worker=assignment.cleaner, job=job,
            scheduled_start=proposal.proposed_start, scheduled_end=proposal.proposed_end,
        )
        previous_start, previous_end = job.scheduled_start, job.scheduled_end
        job.scheduled_start, job.scheduled_end = proposal.proposed_start, proposal.proposed_end
        job.save(update_fields=["scheduled_start", "scheduled_end", "updated_at"])
        _record_lifecycle_event(
            job=job, actor=actor, event_type=JobLifecycleEvent.EventType.JOB_RESCHEDULED,
            reason_code="accepted", metadata={"proposal_id": proposal.id}, request=request,
        )
        write_audit_log(actor=actor, action="job.rescheduled", entity_type="CleaningJob", entity_id=job.id, request=request,
                        metadata={"proposal_id": proposal.id, "lineage_id": job.lineage_id})
    return proposal


def accept_reschedule_proposal(*, proposal: RescheduleProposal, actor: User, request=None) -> RescheduleProposal:
    return respond_to_reschedule_proposal(proposal=proposal, actor=actor, accept=True, request=request)


@transaction.atomic
def report_job_incident(*, job: CleaningJob, actor: User, incident_type: str, narrative: str, request=None) -> JobIncident:
    job = _lock_lineage_and_job(job.pk)
    assignment = _recovery_assignment(job)
    actor = User.objects.select_for_update().get(pk=actor.pk)
    _ensure_direct_recovery(job=job, actor=actor, assignment=assignment)
    if incident_type not in JobIncident.IncidentType.values:
        raise LifecycleInputError(fields={"incident_type": ["Choose a valid incident type."]})
    narrative = narrative.strip()
    if not narrative or len(narrative) > 5000:
        raise LifecycleInputError(fields={"narrative": ["Provide up to 5000 characters of private context."]})
    if incident_type == JobIncident.IncidentType.NO_SHOW and timezone.now() < job.scheduled_start + timedelta(minutes=15):
        raise LifecycleConflict("A no-show can be reported 15 minutes after the scheduled start.")
    incident = JobIncident.objects.create(job=job, reported_by=actor, incident_type=incident_type, narrative=narrative)
    _record_lifecycle_event(job=job, actor=actor, event_type=JobLifecycleEvent.EventType.INCIDENT_REPORTED,
                            reason_code=incident_type, audience=JobLifecycleEvent.Audience.ADMIN_ONLY,
                            metadata={"incident_id": incident.id}, request=request)
    write_audit_log(actor=actor, action="job.incident_reported", entity_type="JobIncident", entity_id=incident.id,
                    request=request, metadata={"job_id": job.id, "incident_type": incident_type})
    return incident


def _replacement_expiry(job: CleaningJob):
    return min(timezone.now() + timedelta(hours=4), job.scheduled_end)


def _create_replacement_successor(*, source: CleaningJob, request: ReplacementRequest) -> CleaningJob:
    return CleaningJob.objects.create(
        property=source.property, host=source.host, lineage=source.lineage, replaces_job=source,
        batch=source.batch, title=source.title, description=source.description,
        scheduled_start=source.scheduled_start, scheduled_end=source.scheduled_end,
        currency=source.currency, proposed_price=source.proposed_price,
        cleaning_instructions=source.cleaning_instructions, status=CleaningJob.Status.DRAFT,
    )


@transaction.atomic
def create_replacement_request(*, job: CleaningJob, incident: JobIncident | None, actor: User, request=None) -> ReplacementRequest:
    job = _lock_lineage_and_job(job.pk)
    assignment = _recovery_assignment(job)
    actor = User.objects.select_for_update().get(pk=actor.pk)
    _ensure_direct_recovery(job=job, actor=actor, assignment=assignment)
    if job.status != CleaningJob.Status.CANCELLED:
        raise LifecycleConflict("Only a cancelled incomplete job can be replaced.")
    if incident is None or incident.job_id != job.id:
        raise LifecycleInputError(fields={"incident_id": ["A qualifying incident for this job is required."]})
    expiry = _replacement_expiry(job)
    if expiry <= timezone.now():
        raise LifecycleConflict("The replacement window has expired.")
    is_host = actor.id == job.host_id
    replacement = ReplacementRequest.objects.create(
        source_job=job, incident=incident, requested_by=actor, expires_at=expiry,
        status=ReplacementRequest.Status.AUTHORIZED if is_host else ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION,
        authorized_by=actor if is_host else None,
    )
    if is_host:
        replacement.successor = _create_replacement_successor(source=job, request=replacement)
        replacement.save(update_fields=["successor", "updated_at"])
    _record_lifecycle_event(job=job, actor=actor, event_type=JobLifecycleEvent.EventType.REPLACEMENT_REQUESTED,
                            metadata={"replacement_request_id": replacement.id}, request=request)
    return replacement


@transaction.atomic
def authorize_replacement_request(*, replacement: ReplacementRequest, actor: User, accept: bool, request=None) -> ReplacementRequest:
    replacement = ReplacementRequest.objects.select_for_update().select_related("source_job").get(pk=replacement.pk)
    job = _lock_lineage_and_job(replacement.source_job_id)
    assignment = _recovery_assignment(job)
    actor = User.objects.select_for_update().get(pk=actor.pk)
    _ensure_direct_recovery(job=job, actor=actor, assignment=assignment)
    if actor.id != job.host_id and not actor.is_platform_admin:
        raise LifecycleConflict("Only the host can authorize this replacement.")
    if replacement.status != ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION:
        raise LifecycleConflict("This replacement request is no longer actionable.")
    if replacement.expires_at <= timezone.now():
        replacement.status = ReplacementRequest.Status.EXPIRED
    elif not accept:
        replacement.status = ReplacementRequest.Status.DECLINED
    else:
        replacement.status = ReplacementRequest.Status.AUTHORIZED
        replacement.authorized_by = actor
        replacement.successor = _create_replacement_successor(source=job, request=replacement)
    replacement.save(update_fields=["status", "authorized_by", "successor", "updated_at"])
    _record_lifecycle_event(job=job, actor=actor,
                            event_type=JobLifecycleEvent.EventType.REPLACEMENT_APPROVED if accept else JobLifecycleEvent.EventType.REPLACEMENT_DECLINED,
                            metadata={"replacement_request_id": replacement.id}, request=request)
    return replacement


@transaction.atomic
def file_dispute(*, job: CleaningJob, actor: User, category: str, narrative: str, request=None) -> Dispute:
    job = _lock_lineage_and_job(job.pk)
    assignment = _recovery_assignment(job)
    actor = User.objects.select_for_update().get(pk=actor.pk)
    _ensure_direct_recovery(job=job, actor=actor, assignment=assignment)
    if category not in Dispute.Category.values:
        raise LifecycleInputError(fields={"category": ["Choose a valid dispute category."]})
    narrative = narrative.strip()
    if not narrative or len(narrative) > 5000:
        raise LifecycleInputError(fields={"narrative": ["Provide up to 5000 characters of private context."]})
    anchors = [value for value in [job.cancelled_at, getattr(assignment, "completed_at", None), JobIncident.objects.filter(job=job).order_by("-created_at").values_list("created_at", flat=True).first()] if value]
    if not anchors or timezone.now() > max(anchors) + timedelta(days=7):
        raise LifecycleConflict("The dispute filing window has closed.")
    dispute = Dispute.objects.create(job=job, filed_by=actor, category=category, narrative=narrative)
    _record_lifecycle_event(job=job, actor=actor, event_type=JobLifecycleEvent.EventType.DISPUTE_OPENED,
                            reason_code=category, audience=JobLifecycleEvent.Audience.ADMIN_ONLY,
                            metadata={"dispute_id": dispute.id}, request=request)
    return dispute


@transaction.atomic
def update_dispute(*, dispute: Dispute, actor: User, note: str, status_after: str = "", request=None) -> Dispute:
    if not actor.is_platform_admin:
        raise LifecycleConflict("Only an operator can update a dispute.")
    dispute = Dispute.objects.select_for_update().select_related("job").get(pk=dispute.pk)
    note = note.strip()
    if not note or len(note) > 5000:
        raise LifecycleInputError(fields={"note": ["Provide up to 5000 characters of private context."]})
    if status_after and status_after not in Dispute.Status.values:
        raise LifecycleInputError(fields={"status": ["Choose a valid dispute status."]})
    if status_after:
        dispute.status = status_after
        dispute.save(update_fields=["status", "updated_at"])
    DisputeUpdate.objects.create(dispute=dispute, actor=actor, note=note, status_after=status_after)
    _record_lifecycle_event(job=dispute.job, actor=actor,
                            event_type=JobLifecycleEvent.EventType.DISPUTE_RESOLVED if status_after == Dispute.Status.RESOLVED else JobLifecycleEvent.EventType.DISPUTE_UPDATED,
                            audience=JobLifecycleEvent.Audience.ADMIN_ONLY, metadata={"dispute_id": dispute.id}, request=request)
    return dispute


def lineage_chronology(*, lineage: TurnoverLineage, actor: User) -> dict:
    safe_metadata_keys = {
        "source",
        "previous_status",
        "normalized_status",
        "notice_band",
        "assignment_id",
    }
    attempts = list(
        lineage.attempts.select_related("assignment", "assignment__cleaner").order_by(
            "scheduled_start", "id"
        )
    )
    is_admin = actor.is_platform_admin
    is_host = actor.id == lineage.host_id
    own_attempt_ids: set[int] = set()
    if not (is_admin or is_host):
        for attempt in attempts:
            assignment = _job_assignment(attempt)
            if assignment and actor.id in {
                assignment.cleaner_id,
                assignment.assigned_member_id,
            }:
                own_attempt_ids.add(attempt.id)
        attempts = [attempt for attempt in attempts if attempt.id in own_attempt_ids]

    attempt_payloads = []
    for attempt in attempts:
        payload = {
            "id": attempt.id,
            "status": attempt.status,
            "title": attempt.title,
            "scheduled_start": attempt.scheduled_start,
            "scheduled_end": attempt.scheduled_end,
            "published_at": attempt.published_at,
            "cancelled_at": attempt.cancelled_at,
            "cancellation_reason_code": attempt.cancellation_reason_code,
            "cancellation_notice_band": attempt.cancellation_notice_band,
        }
        if is_admin or is_host:
            payload["replaces_job_id"] = attempt.replaces_job_id
        attempt_payloads.append(payload)

    event_query = lineage.lifecycle_events.filter(job_id__in=[item.id for item in attempts])
    if not is_admin:
        event_query = event_query.exclude(audience=JobLifecycleEvent.Audience.ADMIN_ONLY)
    events = [
        {
            "id": event.id,
            "job_id": event.job_id,
            "event_type": event.event_type,
            "from_status": event.from_status,
            "to_status": event.to_status,
            "reason_code": event.reason_code,
            "occurred_at": event.occurred_at,
            "metadata": {
                key: value
                for key, value in event.metadata.items()
                if key in safe_metadata_keys
            },
        }
        for event in event_query.order_by("occurred_at", "id")
    ]
    return {"id": lineage.id, "attempts": attempt_payloads, "events": events}


@transaction.atomic
def submit_application(
    *,
    job: CleaningJob,
    cleaner: User,
    proposed_price: Decimal | None = None,
    message: str = "",
    request=None,
) -> CleanerApplication:
    job = _lock_lineage_and_job(job.pk)
    cleaner = User.objects.select_for_update().get(pk=cleaner.pk)
    if not cleaner.is_active or not cleaner.is_approved:
        raise MarketplaceError("Account must be approved before applying for cleaning jobs.")

    if cleaner.is_cleaner:
        try:
            cleaner_profile = cleaner.cleaner_profile
        except CleanerProfile.DoesNotExist as exc:
            raise MarketplaceError("Cleaner profile is required before applying.") from exc

        if not cleaner_profile.is_verified:
            raise MarketplaceError(
                "Cleaner marketplace access must be active before applying."
            )
    elif cleaner.is_agency:
        try:
            cleaner.agency_profile
        except AgencyProfile.DoesNotExist as exc:
            raise MarketplaceError("Agency profile is required before applying.") from exc
    else:
        raise MarketplaceError("Only cleaners and agencies can apply for cleaning jobs.")

    if not valid_future_marketplace_jobs().filter(pk=job.pk).exists():
        raise MarketplaceError("This job is not available for applications.")

    _ensure_no_assigned_job_same_property_day(cleaner, job)
    _ensure_no_pending_offer_same_property_day(cleaner, job)

    application, created = CleanerApplication.objects.get_or_create(
        job=job,
        cleaner=cleaner,
        defaults={"proposed_price": proposed_price, "message": message},
    )
    if not created and application.status == CleanerApplication.Status.WITHDRAWN:
        application.status = CleanerApplication.Status.PENDING
        application.proposed_price = proposed_price
        application.message = message
        application.save(update_fields=["status", "proposed_price", "message", "updated_at"])
    elif not created:
        raise MarketplaceError("Cleaner has already applied for this job.")

    create_notification(
        user=job.host,
        notification_type="application.submitted",
        title="New cleaner application",
        body=f"{cleaner.get_username()} applied for {job.title}.",
        metadata={"job_id": job.id, "application_id": application.id},
    )
    transaction.on_commit(
        lambda application_id=application.id: send_application_submitted_email.delay(application_id)
    )
    write_audit_log(
        actor=cleaner,
        action="application.submitted",
        entity_type="CleanerApplication",
        entity_id=application.id,
        request=request,
        metadata={"job_id": application.job_id},
    )
    return application


@transaction.atomic
def accept_application(
    *,
    application: CleanerApplication,
    accepted_by: User,
    agreed_price: Decimal | None = None,
    request=None,
) -> Assignment:
    initial_application = CleanerApplication.objects.only("id", "job_id").get(id=application.id)
    job = _lock_lineage_and_job(initial_application.job_id)
    application = CleanerApplication.objects.select_for_update().select_related("job", "cleaner").get(
        id=initial_application.id
    )
    accepted_by = User.objects.select_for_update().get(pk=accepted_by.pk)
    applicant = User.objects.select_for_update().get(pk=application.cleaner_id)

    if not (accepted_by.is_platform_admin or job.host_id == accepted_by.id):
        raise MarketplaceError("Only the host or admin can accept applications.")

    if not accepted_by.is_platform_admin and (
        not accepted_by.is_active or not accepted_by.is_approved
    ):
        raise MarketplaceError("Account must be approved before accepting applications.")

    if application.status != CleanerApplication.Status.PENDING:
        raise MarketplaceError("Only pending applications can be accepted.")

    if job.status != CleaningJob.Status.OPEN:
        raise MarketplaceError("Applications can be accepted only for open jobs.")

    _ensure_future_job_start(job)

    if hasattr(job, "assignment"):
        raise MarketplaceError("This job already has an assignment.")

    _ensure_cleaner_workable(applicant)
    if applicant.is_cleaner:
        _ensure_no_cleaner_schedule_conflict(worker=applicant, job=job)

    application.status = CleanerApplication.Status.ACCEPTED
    application.save(update_fields=["status", "updated_at"])

    CleanerApplication.objects.filter(job=job).exclude(id=application.id).update(
        status=CleanerApplication.Status.REJECTED,
        updated_at=timezone.now(),
    )

    assignment = Assignment.objects.create(
        job=job,
        cleaner=applicant,
        application=application,
        agreed_price=agreed_price if agreed_price is not None else application.proposed_price,
    )

    previous_status = job.status
    job.status = CleaningJob.Status.ASSIGNED
    job.agreed_price = assignment.agreed_price
    job.save(update_fields=["status", "agreed_price", "updated_at"])
    _record_lifecycle_event(
        job=job,
        actor=accepted_by,
        event_type=JobLifecycleEvent.EventType.JOB_ASSIGNED,
        from_status=previous_status,
        to_status=job.status,
        metadata={"assignment_id": assignment.id},
        request=request,
    )

    create_notification(
        user=applicant,
        notification_type="assignment.accepted",
        title="Cleaning job assigned",
        body="A cleaning job was assigned to you. Open your dashboard for details.",
        metadata={"job_id": job.id, "assignment_id": assignment.id},
    )
    write_audit_log(
        actor=accepted_by,
        action="application.accepted",
        entity_type="CleanerApplication",
        entity_id=assignment.application_id,
        request=request,
        metadata={"assignment_id": assignment.id, "job_id": assignment.job_id},
    )
    return assignment


@transaction.atomic
def reject_application(
    *,
    application: CleanerApplication,
    rejected_by: User,
    request=None,
) -> CleanerApplication:
    application = CleanerApplication.objects.select_for_update().select_related("job", "cleaner").get(
        id=application.id
    )

    if not (rejected_by.is_platform_admin or application.job.host_id == rejected_by.id):
        raise MarketplaceError("Only the host or admin can decline applications.")

    if not rejected_by.is_platform_admin and not rejected_by.is_approved:
        raise MarketplaceError("Account must be approved before declining applications.")

    if application.status != CleanerApplication.Status.PENDING:
        raise MarketplaceError("Only pending applications can be declined.")

    application.status = CleanerApplication.Status.REJECTED
    application.save(update_fields=["status", "updated_at"])

    create_notification(
        user=application.cleaner,
        notification_type="application.rejected",
        title="Application declined",
        body="One of your cleaning applications was not accepted.",
        metadata={"job_id": application.job_id, "application_id": application.id},
    )
    write_audit_log(
        actor=rejected_by,
        action="application.rejected",
        entity_type="CleanerApplication",
        entity_id=application.id,
        request=request,
        metadata={"job_id": application.job_id},
    )
    return application


@transaction.atomic
def withdraw_application(
    *,
    application: CleanerApplication,
    withdrawn_by: User,
    request=None,
) -> CleanerApplication:
    application = CleanerApplication.objects.select_for_update().select_related("job", "cleaner").get(
        id=application.id
    )

    if not (withdrawn_by.is_platform_admin or application.cleaner_id == withdrawn_by.id):
        raise MarketplaceError("Only the cleaner or admin can cancel this application.")

    if not withdrawn_by.is_platform_admin and not withdrawn_by.is_approved:
        raise MarketplaceError("Account must be approved before cancelling applications.")

    if application.status != CleanerApplication.Status.PENDING:
        raise MarketplaceError("Only pending applications can be cancelled.")

    application.status = CleanerApplication.Status.WITHDRAWN
    application.save(update_fields=["status", "updated_at"])

    create_notification(
        user=application.job.host,
        notification_type="application.withdrawn",
        title="Cleaner application cancelled",
        body=f"{application.cleaner.get_username()} cancelled their application for {application.job.title}.",
        metadata={"job_id": application.job_id, "application_id": application.id},
    )
    write_audit_log(
        actor=withdrawn_by,
        action="application.withdrawn",
        entity_type="CleanerApplication",
        entity_id=application.id,
        request=request,
        metadata={"job_id": application.job_id},
    )
    return application


@transaction.atomic
def complete_job(*, job: CleaningJob, completed_by: User, request=None) -> CleaningJob:
    job = _lock_lineage_and_job(job.id)

    if job.status not in (CleaningJob.Status.ASSIGNED, CleaningJob.Status.COMPLETED):
        raise MarketplaceError("Only assigned jobs can be completed.")

    try:
        assignment = Assignment.objects.select_for_update().get(job=job)
    except Assignment.DoesNotExist as exc:
        raise MarketplaceError("Job cannot be completed without an assignment.") from exc
    completed_by = User.objects.get(pk=completed_by.pk)

    if not completed_by.is_platform_admin and not completed_by.is_approved:
        raise MarketplaceError("Account must be approved before completing jobs.")

    if not (
        completed_by.is_platform_admin
        or completed_by.id == job.host_id
        or completed_by.id == assignment.cleaner_id
        or completed_by.id == assignment.assigned_member_id
    ):
        raise MarketplaceError("Only an involved user can complete this job.")

    now = timezone.now()
    is_cleaner_completion = (
        completed_by.id == assignment.cleaner_id
        or completed_by.id == assignment.assigned_member_id
    )

    # The cleaner (or an admin) marks the cleaning done — there is no separate
    # host confirmation step. The host's role after completion is to review.
    if not (completed_by.is_platform_admin or is_cleaner_completion):
        raise MarketplaceError("Only the assigned cleaner can mark this job done.")

    if assignment.completed_at is not None:
        raise MarketplaceError("This job has already been completed.")

    if is_cleaner_completion and job.scheduled_start > now:
        raise MarketplaceError(
            "This job can be marked done only after its scheduled start time has passed."
        )

    assignment.cleaner_completed_at = assignment.cleaner_completed_at or now
    assignment.host_completed_at = assignment.host_completed_at or now
    assignment.completed_at = now
    assignment.save(
        update_fields=["cleaner_completed_at", "host_completed_at", "completed_at", "updated_at"]
    )

    if job.status != CleaningJob.Status.COMPLETED:
        previous_status = job.status
        job.status = CleaningJob.Status.COMPLETED
        job.save(update_fields=["status", "updated_at"])
        _record_lifecycle_event(
            job=job,
            actor=completed_by,
            event_type=JobLifecycleEvent.EventType.JOB_COMPLETED,
            from_status=previous_status,
            to_status=job.status,
            metadata={"assignment_id": assignment.id},
            request=request,
        )

    # Both sides can now review each other (revealed double-blind / after window).
    create_notification(
        user=job.host,
        notification_type="review.requested",
        title="Leave a review",
        body=f"{job.title} is complete — leave a review for your cleaner.",
        metadata={"job_id": job.id, "reviewee_id": assignment.cleaner_id},
    )
    create_notification(
        user=assignment.cleaner,
        notification_type="review.requested",
        title="Leave a review",
        body="A cleaning job is complete — leave a review for the host.",
        metadata={"job_id": job.id, "reviewee_id": job.host_id},
    )
    transaction.on_commit(lambda job_id=job.id: send_job_completed_email.delay(job_id))

    write_audit_log(
        actor=completed_by,
        action="job.completed",
        entity_type="CleaningJob",
        entity_id=job.id,
        request=request,
        metadata={"by": "admin" if completed_by.is_platform_admin and not is_cleaner_completion else "cleaner"},
    )
    job.assignment = assignment
    return job


def _ensure_no_assigned_job_same_property_day(cleaner: User, job: CleaningJob) -> None:
    """Block new offers/applications when the cleaner already holds an active
    assignment for the *same property on the same calendar day* (Europe/Sofia).

    A cleaner can't be in two places for the same property on one day, so once
    they're assigned there for that date we refuse further offers/applications —
    regardless of the exact time slot. Cancelled assignments don't count, so a
    freed-up slot can be re-offered.
    """
    local_day = timezone.localtime(job.scheduled_start).date()
    conflict = (
        Assignment.objects.filter(
            cleaner=cleaner,
            cancelled_at__isnull=True,
            job__property_id=job.property_id,
            job__scheduled_start__date=local_day,
        )
        .exclude(job_id=job.id)
        .exists()
    )
    if conflict:
        raise MarketplaceError(
            "This cleaner already has an assigned job for this property on that day."
        )


def _ensure_no_pending_offer_same_property_day(cleaner: User, job: CleaningJob) -> None:
    """Block a new offer/application when the cleaner already has a *pending*
    offer or application for the *same property on the same calendar day*
    (Europe/Sofia), regardless of the exact time slot.

    The exact-slot duplicate (the same job) is handled separately by the
    get_or_create path in ``offer_job`` / ``submit_application``; this catches a
    *different* time slot on the same property and day, which would otherwise
    let two pending offers pile up and both get accepted (double-booking).
    """
    local_day = timezone.localtime(job.scheduled_start).date()
    conflict = (
        CleanerApplication.objects.filter(
            cleaner=cleaner,
            status=CleanerApplication.Status.PENDING,
            job__property_id=job.property_id,
            job__scheduled_start__date=local_day,
        )
        .exclude(job_id=job.id)
        .exists()
    )
    if conflict:
        raise MarketplaceError(
            "This cleaner already has a pending offer or application for this property on that day."
        )


def _ensure_no_cleaner_schedule_conflict(*, worker: User, job: CleaningJob) -> None:
    """Enforce concrete-worker occupancy using half-open scheduled intervals.

    The caller must hold a row lock on ``worker`` for the surrounding transaction.
    Cancelled assignments release their interval. Completion timestamps and job
    statuses do not change occupancy because the scheduled interval remains the
    authoritative source for overlap comparisons.
    """
    has_conflict = (
        Assignment.objects.filter(
            Q(cleaner_id=worker.id) | Q(assigned_member_id=worker.id),
            cancelled_at__isnull=True,
            job__scheduled_start__lt=job.scheduled_end,
            job__scheduled_end__gt=job.scheduled_start,
        )
        .exclude(job_id=job.id)
        .exists()
    )
    if has_conflict:
        raise CleanerScheduleConflictError()


def _ensure_no_cleaner_schedule_conflict_for_range(*, worker: User, job: CleaningJob, scheduled_start, scheduled_end) -> None:
    has_conflict = (
        Assignment.objects.filter(
            Q(cleaner_id=worker.id) | Q(assigned_member_id=worker.id),
            cancelled_at__isnull=True,
            job__scheduled_start__lt=scheduled_end,
            job__scheduled_end__gt=scheduled_start,
        )
        .exclude(job_id=job.id)
        .exists()
    )
    if has_conflict:
        raise CleanerScheduleConflictError()


def _ensure_cleaner_workable(cleaner: User) -> None:
    """Validate that a user can receive/accept cleaning work (verified + approved)."""
    if not cleaner.is_active:
        raise MarketplaceError("Cleaner account must be active.")
    if not cleaner.is_approved:
        raise MarketplaceError("Cleaner account must be approved.")
    if cleaner.is_cleaner:
        try:
            cleaner_profile = CleanerProfile.objects.select_for_update().get(user_id=cleaner.pk)
        except CleanerProfile.DoesNotExist as exc:
            raise MarketplaceError("Cleaner profile is required.") from exc
        if not cleaner_profile.is_verified:
            raise MarketplaceError("Cleaner marketplace access must be active.")
    elif cleaner.is_agency:
        try:
            AgencyProfile.objects.select_for_update().get(user_id=cleaner.pk)
        except AgencyProfile.DoesNotExist as exc:
            raise MarketplaceError("Agency profile is required.") from exc
    else:
        raise MarketplaceError("Only cleaners and agencies can be offered cleaning jobs.")


def _ensure_future_job_start(job: CleaningJob) -> None:
    if job.scheduled_start <= timezone.now():
        raise MarketplaceError(JOB_START_NOT_FUTURE)


@transaction.atomic
def offer_job(
    *,
    job: CleaningJob,
    host: User,
    cleaner: User,
    proposed_price: Decimal | None = None,
    message: str = "",
    request=None,
) -> CleanerApplication:
    """Host directly offers a job to a specific cleaner (reuses CleanerApplication)."""
    job = _lock_lineage_and_job(job.id)
    host = User.objects.select_for_update().get(pk=host.pk)
    cleaner = User.objects.select_for_update().get(pk=cleaner.pk)

    if not (host.is_platform_admin or job.host_id == host.id):
        raise MarketplaceError("Only the host or admin can offer this job.")

    if not host.is_platform_admin and (not host.is_active or not host.is_approved):
        raise MarketplaceError("Account must be approved before offering jobs.")

    if job.status not in (CleaningJob.Status.DRAFT, CleaningJob.Status.OPEN):
        raise MarketplaceError("Only draft or open jobs can be offered.")

    _ensure_future_job_start(job)

    if hasattr(job, "assignment"):
        raise MarketplaceError("This job already has an assignment.")

    _ensure_cleaner_workable(cleaner)
    _ensure_no_assigned_job_same_property_day(cleaner, job)
    _ensure_no_pending_offer_same_property_day(cleaner, job)

    application, created = CleanerApplication.objects.get_or_create(
        job=job,
        cleaner=cleaner,
        defaults={
            "proposed_price": proposed_price,
            "message": message,
            "origin": CleanerApplication.Origin.HOST_OFFERED,
            "status": CleanerApplication.Status.PENDING,
        },
    )
    if not created:
        if application.status == CleanerApplication.Status.PENDING:
            raise MarketplaceError("This cleaner already has a pending offer or application for this job.")
        application.status = CleanerApplication.Status.PENDING
        application.origin = CleanerApplication.Origin.HOST_OFFERED
        application.proposed_price = proposed_price
        application.message = message
        application.save(
            update_fields=["status", "origin", "proposed_price", "message", "updated_at"]
        )

    create_notification(
        user=cleaner,
        notification_type="offer.received",
        title="New job offer",
        body="You received a new cleaning job offer. Open your dashboard to review it.",
        metadata={"job_id": job.id, "application_id": application.id},
    )
    write_audit_log(
        actor=host,
        action="job.offered",
        entity_type="CleanerApplication",
        entity_id=application.id,
        request=request,
        metadata={"job_id": job.id, "cleaner_id": cleaner.id},
    )
    return application


@transaction.atomic
def offer_job_to_cleaner(
    *,
    host: User,
    cleaner: User,
    property,
    scheduled_start,
    scheduled_end,
    title: str = "",
    proposed_price: Decimal | None = None,
    message: str = "",
    request=None,
) -> CleanerApplication:
    """Offer a job to a cleaner by property + time slot, find-or-creating the job.

    Reuses an existing actionable job in the exact
    (property, scheduled_start, scheduled_end) slot — e.g. a draft left behind
    by a previously declined offer — instead of creating a duplicate that would
    violate the partial unique-slot constraint. The actual offer (including
    lineage-first locking, "already pending" guarding, and re-activating a
    declined application) is delegated to ``offer_job``.
    """
    if not (host.is_platform_admin or property.host_id == host.id):
        raise MarketplaceError("Hosts can offer jobs only for their own properties.")

    if scheduled_end <= scheduled_start:
        raise MarketplaceError("scheduled_end must be after scheduled_start.")

    if scheduled_start <= timezone.now():
        raise MarketplaceError(JOB_START_NOT_FUTURE)

    job = (
        CleaningJob.objects.filter(
            property=property,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            status__in=[
                CleaningJob.Status.DRAFT,
                CleaningJob.Status.OPEN,
                CleaningJob.Status.ASSIGNED,
            ],
        )
        .first()
    )
    if job is None:
        job = create_cleaning_job(
            actor=host,
            property=property,
            title=title or "Turnover cleaning",
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            proposed_price=proposed_price,
            request=request,
        )

    return offer_job(
        job=job,
        host=host,
        cleaner=cleaner,
        proposed_price=proposed_price,
        message=message,
        request=request,
    )


@transaction.atomic
def accept_offer(
    *,
    application: CleanerApplication,
    cleaner: User,
    request=None,
) -> Assignment:
    """Cleaner accepts a host-initiated offer; creates the single Assignment."""
    initial_application = CleanerApplication.objects.only("id", "job_id").get(id=application.id)
    job = _lock_lineage_and_job(initial_application.job_id)
    application = CleanerApplication.objects.select_for_update().select_related("job", "cleaner").get(
        id=initial_application.id
    )
    cleaner = User.objects.select_for_update().get(pk=cleaner.pk)
    applicant = User.objects.select_for_update().get(pk=application.cleaner_id)

    if not (cleaner.is_platform_admin or application.cleaner_id == cleaner.id):
        raise MarketplaceError("Only the offered cleaner can accept this offer.")

    if not cleaner.is_platform_admin and (not cleaner.is_active or not cleaner.is_approved):
        raise MarketplaceError("Account must be approved before accepting offers.")

    _ensure_cleaner_workable(applicant)

    if application.origin != CleanerApplication.Origin.HOST_OFFERED:
        raise MarketplaceError("Only host offers can be accepted this way.")

    if application.status != CleanerApplication.Status.PENDING:
        raise MarketplaceError("Only pending offers can be accepted.")

    if job.status not in (CleaningJob.Status.DRAFT, CleaningJob.Status.OPEN):
        raise MarketplaceError("This job is no longer available.")

    _ensure_future_job_start(job)

    if hasattr(job, "assignment"):
        raise MarketplaceError("This job already has an assignment.")

    if applicant.is_cleaner:
        _ensure_no_cleaner_schedule_conflict(worker=applicant, job=job)

    application.status = CleanerApplication.Status.ACCEPTED
    application.save(update_fields=["status", "updated_at"])

    CleanerApplication.objects.filter(job=job).exclude(id=application.id).update(
        status=CleanerApplication.Status.REJECTED,
        updated_at=timezone.now(),
    )

    assignment = Assignment.objects.create(
        job=job,
        cleaner=applicant,
        application=application,
        agreed_price=application.proposed_price,
    )

    previous_status = job.status
    job.status = CleaningJob.Status.ASSIGNED
    job.agreed_price = assignment.agreed_price
    job.save(update_fields=["status", "agreed_price", "updated_at"])
    _record_lifecycle_event(
        job=job,
        actor=cleaner,
        event_type=JobLifecycleEvent.EventType.JOB_ASSIGNED,
        from_status=previous_status,
        to_status=job.status,
        metadata={"assignment_id": assignment.id},
        request=request,
    )

    create_notification(
        user=job.host,
        notification_type="offer.accepted",
        title="Offer accepted",
        body=f"{applicant.get_username()} accepted your offer for {job.title}.",
        metadata={"job_id": job.id, "assignment_id": assignment.id},
    )
    write_audit_log(
        actor=cleaner,
        action="offer.accepted",
        entity_type="CleanerApplication",
        entity_id=application.id,
        request=request,
        metadata={"assignment_id": assignment.id, "job_id": job.id},
    )
    return assignment


@transaction.atomic
def decline_offer(
    *,
    application: CleanerApplication,
    cleaner: User,
    request=None,
) -> CleanerApplication:
    """Cleaner declines a host-initiated offer."""
    application = CleanerApplication.objects.select_for_update().select_related("job", "cleaner").get(
        id=application.id
    )

    if not (cleaner.is_platform_admin or application.cleaner_id == cleaner.id):
        raise MarketplaceError("Only the offered cleaner can decline this offer.")

    if application.origin != CleanerApplication.Origin.HOST_OFFERED:
        raise MarketplaceError("Only host offers can be declined this way.")

    if application.status != CleanerApplication.Status.PENDING:
        raise MarketplaceError("Only pending offers can be declined.")

    application.status = CleanerApplication.Status.REJECTED
    application.save(update_fields=["status", "updated_at"])

    create_notification(
        user=application.job.host,
        notification_type="offer.declined",
        title="Offer declined",
        body=f"{application.cleaner.get_username()} declined your offer for {application.job.title}.",
        metadata={"job_id": application.job_id, "application_id": application.id},
    )
    write_audit_log(
        actor=cleaner,
        action="offer.declined",
        entity_type="CleanerApplication",
        entity_id=application.id,
        request=request,
        metadata={"job_id": application.job_id},
    )
    return application


@transaction.atomic
def assign_member_to_assignment(
    *,
    assignment: Assignment,
    agency_user: User,
    member: User,
    request=None,
) -> Assignment:
    initial_assignment = Assignment.objects.only("id", "job_id").get(id=assignment.id)
    _lock_lineage_and_job(initial_assignment.job_id)
    assignment = Assignment.objects.select_for_update().select_related("job", "cleaner").get(
        id=initial_assignment.id
    )

    if not assignment.cleaner.is_agency:
        raise MarketplaceError("Only agency assignments can be delegated to a member cleaner.")

    if agency_user.is_platform_admin:
        agency_profile = assignment.cleaner.agency_profile
    else:
        if agency_user.id != assignment.cleaner_id or not agency_user.is_agency:
            raise MarketplaceError("Only the assigned agency can delegate this cleaning.")
        if not agency_user.is_active or not agency_user.is_approved:
            raise MarketplaceError("Agency account must be approved before assigning work.")
        agency_profile = agency_user.agency_profile

    if assignment.assigned_member_id:
        if assignment.assigned_member_id == member.id:
            return assignment
        raise MarketplaceError("Assignment has already been delegated to a cleaner member.")

    member = User.objects.select_for_update().get(pk=member.pk)

    if not member.is_cleaner:
        raise MarketplaceError("Assigned member must be a cleaner account.")

    if not member.is_active:
        raise MarketplaceError("Assigned cleaner account must be active.")

    if not member.is_approved:
        raise MarketplaceError("Assigned cleaner must have an approved account.")

    try:
        cleaner_profile = CleanerProfile.objects.select_for_update().get(user_id=member.pk)
    except CleanerProfile.DoesNotExist as exc:
        raise MarketplaceError("Assigned cleaner profile is required.") from exc

    if not cleaner_profile.is_verified:
        raise MarketplaceError("Assigned cleaner marketplace access must be active.")

    try:
        AgencyMembership.objects.select_for_update().get(
            agency=agency_profile,
            cleaner=member,
            status=AgencyMembership.Status.ACTIVE,
        )
    except AgencyMembership.DoesNotExist as exc:
        raise MarketplaceError("Cleaner must be an active member of this agency.") from exc

    _ensure_no_cleaner_schedule_conflict(worker=member, job=assignment.job)

    assignment.assigned_member = member
    assignment.save(update_fields=["assigned_member", "updated_at"])
    create_notification(
        user=member,
        notification_type="agency.assignment.created",
        title="Agency cleaning assigned",
        body="Your agency assigned you to a cleaning job. Open your dashboard for details.",
        metadata={"job_id": assignment.job_id, "assignment_id": assignment.id},
    )
    write_audit_log(
        actor=agency_user,
        action="assignment.member_assigned",
        entity_type="Assignment",
        entity_id=assignment.id,
        request=request,
        metadata={"assigned_member_id": assignment.assigned_member_id, "job_id": assignment.job_id},
    )
    return assignment
