from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, User
from apps.core.services import write_audit_log
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.notifications.services import create_notification
from apps.notifications.tasks import send_application_submitted_email, send_job_completed_email


class MarketplaceError(ValueError):
    pass


def publish_job(job: CleaningJob, *, actor: User | None = None, request=None) -> CleaningJob:
    if job.status != CleaningJob.Status.DRAFT:
        raise MarketplaceError("Only draft jobs can be published.")
    job.status = CleaningJob.Status.OPEN
    job.save(update_fields=["status", "updated_at"])
    if actor is not None:
        write_audit_log(
            actor=actor,
            action="job.published",
            entity_type="CleaningJob",
            entity_id=job.id,
            request=request,
        )
    return job


def submit_application(
    *,
    job: CleaningJob,
    cleaner: User,
    proposed_price: Decimal | None = None,
    message: str = "",
    request=None,
) -> CleanerApplication:
    if not cleaner.is_approved:
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

    if job.status != CleaningJob.Status.OPEN:
        raise MarketplaceError("Cleaner can apply only to open jobs.")

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
    send_application_submitted_email.delay(application.id)
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

    if not (accepted_by.is_platform_admin or job.host_id == accepted_by.id):
        raise MarketplaceError("Only the host or admin can accept applications.")

    if not accepted_by.is_platform_admin and not accepted_by.is_approved:
        raise MarketplaceError("Account must be approved before accepting applications.")

    if job.status != CleaningJob.Status.OPEN:
        raise MarketplaceError("Applications can be accepted only for open jobs.")

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
        cleaner=application.cleaner,
        application=application,
        agreed_price=agreed_price if agreed_price is not None else application.proposed_price,
    )

    job.status = CleaningJob.Status.ASSIGNED
    job.agreed_price = assignment.agreed_price
    job.save(update_fields=["status", "agreed_price", "updated_at"])

    create_notification(
        user=application.cleaner,
        notification_type="assignment.accepted",
        title="Cleaning job assigned",
        body=f"You were assigned to {job.title}.",
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
        body=f"Your application for {application.job.title} was not accepted.",
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
    if is_cleaner_completion:
        if job.scheduled_start > now:
            raise MarketplaceError("Cleaner can mark this job done only after its scheduled start time has passed.")
    elif job.scheduled_end > now:
        raise MarketplaceError("This job can be completed only after its scheduled end time has passed.")

    completed_side = ""

    if completed_by.is_platform_admin:
        if assignment.host_completed_at and assignment.cleaner_completed_at:
            raise MarketplaceError("This job has already been completed by both sides.")
        assignment.host_completed_at = assignment.host_completed_at or now
        assignment.cleaner_completed_at = assignment.cleaner_completed_at or now
        completed_side = "admin"
    elif completed_by.id == job.host_id:
        if assignment.host_completed_at is not None:
            raise MarketplaceError("Host has already marked this job complete.")
        assignment.host_completed_at = now
        completed_side = "host"
    elif completed_by.id == assignment.cleaner_id or completed_by.id == assignment.assigned_member_id:
        if assignment.cleaner_completed_at is not None:
            raise MarketplaceError("Cleaner has already marked this job complete.")
        assignment.cleaner_completed_at = now
        completed_side = "cleaner"

    update_fields = ["host_completed_at", "cleaner_completed_at", "updated_at"]
    is_fully_completed = bool(assignment.host_completed_at and assignment.cleaner_completed_at)
    if is_fully_completed and assignment.completed_at is None:
        assignment.completed_at = now
        update_fields.append("completed_at")
    assignment.save(update_fields=update_fields)

    if is_fully_completed and job.status != CleaningJob.Status.COMPLETED:
        job.status = CleaningJob.Status.COMPLETED
        job.save(update_fields=["status", "updated_at"])

    if completed_side == "cleaner" and not assignment.host_completed_at:
        create_notification(
            user=job.host,
            notification_type="job.cleaner_completed",
            title="Cleaner marked job complete",
            body=f"{job.title} is ready for your completion confirmation.",
            metadata={"job_id": job.id, "assignment_id": assignment.id},
        )
    elif completed_side == "host" and not assignment.cleaner_completed_at:
        create_notification(
            user=assignment.cleaner,
            notification_type="job.host_completed",
            title="Host marked job complete",
            body=f"{job.title} is waiting for your completion confirmation.",
            metadata={"job_id": job.id, "assignment_id": assignment.id},
        )

    if is_fully_completed:
        create_notification(
            user=job.host,
            notification_type="job.completed",
            title="Cleaning completed",
            body=f"{job.title} was marked completed by both sides.",
            metadata={"job_id": job.id},
        )
        create_notification(
            user=assignment.cleaner,
            notification_type="review.requested",
            title="Leave feedback",
            body=f"Please review your experience for {job.title}.",
            metadata={"job_id": job.id},
        )
        send_job_completed_email.delay(job.id)
    write_audit_log(
        actor=completed_by,
        action="job.completed",
        entity_type="CleaningJob",
        entity_id=job.id,
        request=request,
        metadata={"side": completed_side, "fully_completed": is_fully_completed},
    )
    job.assignment = assignment
    return job


def _ensure_cleaner_workable(cleaner: User) -> None:
    """Validate that a user can receive/accept cleaning work (verified + approved)."""
    if not cleaner.is_approved:
        raise MarketplaceError("Cleaner account must be approved.")
    if cleaner.is_cleaner:
        try:
            cleaner_profile = cleaner.cleaner_profile
        except CleanerProfile.DoesNotExist as exc:
            raise MarketplaceError("Cleaner profile is required.") from exc
        if not cleaner_profile.is_verified:
            raise MarketplaceError("Cleaner must be verified.")
    elif cleaner.is_agency:
        try:
            cleaner.agency_profile
        except AgencyProfile.DoesNotExist as exc:
            raise MarketplaceError("Agency profile is required.") from exc
    else:
        raise MarketplaceError("Only cleaners and agencies can be offered cleaning jobs.")


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

    if not (host.is_platform_admin or job.host_id == host.id):
        raise MarketplaceError("Only the host or admin can offer this job.")

    if not host.is_platform_admin and not host.is_approved:
        raise MarketplaceError("Account must be approved before offering jobs.")

    if job.status not in (CleaningJob.Status.DRAFT, CleaningJob.Status.OPEN):
        raise MarketplaceError("Only draft or open jobs can be offered.")

    if hasattr(job, "assignment"):
        raise MarketplaceError("This job already has an assignment.")

    _ensure_cleaner_workable(cleaner)

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
        body=f"{host.get_username()} offered you {job.title}.",
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

    if not (cleaner.is_platform_admin or application.cleaner_id == cleaner.id):
        raise MarketplaceError("Only the offered cleaner can accept this offer.")

    if not cleaner.is_platform_admin and not cleaner.is_approved:
        raise MarketplaceError("Account must be approved before accepting offers.")

    if application.origin != CleanerApplication.Origin.HOST_OFFERED:
        raise MarketplaceError("Only host offers can be accepted this way.")

    if application.status != CleanerApplication.Status.PENDING:
        raise MarketplaceError("Only pending offers can be accepted.")

    if job.status not in (CleaningJob.Status.DRAFT, CleaningJob.Status.OPEN):
        raise MarketplaceError("This job is no longer available.")

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
        cleaner=application.cleaner,
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
        body=f"{application.cleaner.get_username()} accepted your offer for {job.title}.",
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

    if not member.is_cleaner:
        raise MarketplaceError("Assigned member must be a cleaner account.")

    if not member.is_approved:
        raise MarketplaceError("Assigned cleaner must have an approved account.")

    try:
        cleaner_profile = member.cleaner_profile
    except CleanerProfile.DoesNotExist as exc:
        raise MarketplaceError("Assigned cleaner profile is required.") from exc

    if not cleaner_profile.is_verified:
        raise MarketplaceError("Assigned cleaner must be verified.")

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
        body=f"{agency_profile.company_name} assigned you to {assignment.job.title}.",
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
