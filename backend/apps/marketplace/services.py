from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, User
from apps.core.services import write_audit_log
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob, FavouriteCleaner
from apps.marketplace.selectors import valid_future_marketplace_jobs
from apps.notifications.services import create_notification
from apps.notifications.tasks import send_application_submitted_email, send_job_completed_email


class MarketplaceError(ValueError):
    pass


FAVOURITE_TARGET_INELIGIBLE = "Only approved, active, verified cleaner accounts can be favourited."
JOB_START_NOT_FUTURE = (
    "This job is no longer available because its scheduled start must be in the future."
)


def ensure_favourite_target_eligible(cleaner: User) -> None:
    if not cleaner.is_public_marketplace_eligible_cleaner:
        raise MarketplaceError(FAVOURITE_TARGET_INELIGIBLE)


@transaction.atomic
def create_favourite_cleaner(*, host: User, cleaner: User) -> tuple[FavouriteCleaner, bool]:
    ensure_favourite_target_eligible(cleaner)
    return FavouriteCleaner.objects.get_or_create(host=host, cleaner=cleaner)


@transaction.atomic
def publish_job(job: CleaningJob, *, actor: User | None = None, request=None) -> CleaningJob:
    job = CleaningJob.objects.select_for_update().select_related("host").get(pk=job.pk)
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
    job.status = CleaningJob.Status.OPEN
    job.save(update_fields=["status", "updated_at"])
    write_audit_log(
        actor=actor,
        action="job.published",
        entity_type="CleaningJob",
        entity_id=job.id,
        request=request,
    )
    return job


@transaction.atomic
def submit_application(
    *,
    job: CleaningJob,
    cleaner: User,
    proposed_price: Decimal | None = None,
    message: str = "",
    request=None,
) -> CleanerApplication:
    cleaner = User.objects.select_for_update().get(pk=cleaner.pk)
    if not cleaner.is_active or not cleaner.is_approved:
        raise MarketplaceError("Account must be approved before applying for cleaning jobs.")

    if cleaner.is_cleaner:
        try:
            cleaner_profile = cleaner.cleaner_profile
        except CleanerProfile.DoesNotExist as exc:
            raise MarketplaceError("Cleaner profile is required before applying.") from exc

        if not cleaner_profile.is_verified:
            raise MarketplaceError("Cleaner must be verified before applying.")
    elif cleaner.is_agency:
        try:
            cleaner.agency_profile
        except AgencyProfile.DoesNotExist as exc:
            raise MarketplaceError("Agency profile is required before applying.") from exc
    else:
        raise MarketplaceError("Only cleaners and agencies can apply for cleaning jobs.")

    try:
        job = valid_future_marketplace_jobs(
            CleaningJob.objects.select_for_update().select_related("host", "property")
        ).get(pk=job.pk)
    except CleaningJob.DoesNotExist as exc:
        raise MarketplaceError("This job is not available for applications.") from exc

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
    application = CleanerApplication.objects.select_for_update().select_related("job", "cleaner").get(
        id=application.id
    )
    job = CleaningJob.objects.select_for_update().get(id=application.job_id)
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

    job.status = CleaningJob.Status.ASSIGNED
    job.agreed_price = assignment.agreed_price
    job.save(update_fields=["status", "agreed_price", "updated_at"])

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
    job = CleaningJob.objects.select_for_update().get(id=job.id)

    if job.status not in (CleaningJob.Status.ASSIGNED, CleaningJob.Status.COMPLETED):
        raise MarketplaceError("Only assigned jobs can be completed.")

    if not hasattr(job, "assignment"):
        raise MarketplaceError("Job cannot be completed without an assignment.")

    if not completed_by.is_platform_admin and not completed_by.is_approved:
        raise MarketplaceError("Account must be approved before completing jobs.")

    if not (
        completed_by.is_platform_admin
        or completed_by.id == job.host_id
        or completed_by.id == job.assignment.cleaner_id
        or completed_by.id == job.assignment.assigned_member_id
    ):
        raise MarketplaceError("Only an involved user can complete this job.")

    assignment = Assignment.objects.select_for_update().get(job=job)
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
        job.status = CleaningJob.Status.COMPLETED
        job.save(update_fields=["status", "updated_at"])

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
            raise MarketplaceError("Cleaner must be verified.")
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
    job = CleaningJob.objects.select_for_update().get(id=job.id)
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

    Reuses an existing job in the exact (property, scheduled_start, scheduled_end)
    slot — e.g. a draft left behind by a previously declined offer — instead of
    creating a duplicate that would violate the unique-slot constraint. The actual
    offer (including "already pending" guarding and re-activating a declined
    application) is delegated to ``offer_job``.
    """
    if not (host.is_platform_admin or property.host_id == host.id):
        raise MarketplaceError("Hosts can offer jobs only for their own properties.")

    if scheduled_end <= scheduled_start:
        raise MarketplaceError("scheduled_end must be after scheduled_start.")

    if scheduled_start <= timezone.now():
        raise MarketplaceError(JOB_START_NOT_FUTURE)

    job = (
        CleaningJob.objects.select_for_update()
        .filter(
            property=property,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
        )
        .first()
    )
    if job is None:
        job = CleaningJob.objects.create(
            property=property,
            host=property.host,
            title=title or "Turnover cleaning",
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            proposed_price=proposed_price,
            status=CleaningJob.Status.DRAFT,
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
    application = CleanerApplication.objects.select_for_update().select_related("job", "cleaner").get(
        id=application.id
    )
    job = CleaningJob.objects.select_for_update().get(id=application.job_id)
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

    job.status = CleaningJob.Status.ASSIGNED
    job.agreed_price = assignment.agreed_price
    job.save(update_fields=["status", "agreed_price", "updated_at"])

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
    assignment = Assignment.objects.select_for_update().select_related("job", "cleaner").get(
        id=assignment.id
    )

    if not assignment.cleaner.is_agency:
        raise MarketplaceError("Only agency assignments can be delegated to a member cleaner.")

    if agency_user.is_platform_admin:
        agency_profile = assignment.cleaner.agency_profile
    else:
        if agency_user.id != assignment.cleaner_id or not agency_user.is_agency:
            raise MarketplaceError("Only the assigned agency can delegate this cleaning.")
        if not agency_user.is_approved:
            raise MarketplaceError("Agency account must be approved before assigning work.")
        agency_profile = agency_user.agency_profile

    if assignment.assigned_member_id:
        if assignment.assigned_member_id == member.id:
            return assignment
        raise MarketplaceError("Assignment has already been delegated to a cleaner member.")

    if not member.is_cleaner:
        raise MarketplaceError("Assigned member must be a cleaner account.")

    if not member.is_active:
        raise MarketplaceError("Assigned cleaner account must be active.")

    if not member.is_approved:
        raise MarketplaceError("Assigned cleaner must have an approved account.")

    try:
        cleaner_profile = member.cleaner_profile
    except CleanerProfile.DoesNotExist as exc:
        raise MarketplaceError("Assigned cleaner profile is required.") from exc

    if not cleaner_profile.is_verified:
        raise MarketplaceError("Assigned cleaner must be verified.")

    if not AgencyMembership.objects.filter(
        agency=agency_profile,
        cleaner=member,
        status=AgencyMembership.Status.ACTIVE,
    ).exists():
        raise MarketplaceError("Cleaner must be an active member of this agency.")

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
