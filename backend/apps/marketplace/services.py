from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, User
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.notifications.services import create_notification


class MarketplaceError(ValueError):
    pass


def publish_job(job: CleaningJob) -> CleaningJob:
    if job.status != CleaningJob.Status.DRAFT:
        raise MarketplaceError("Only draft jobs can be published.")
    job.status = CleaningJob.Status.OPEN
    job.save(update_fields=["status", "updated_at"])
    return job


def submit_application(
    *,
    job: CleaningJob,
    cleaner: User,
    proposed_price: Decimal | None = None,
    message: str = "",
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
    return application


@transaction.atomic
def accept_application(
    *,
    application: CleanerApplication,
    accepted_by: User,
    agreed_price: Decimal | None = None,
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
    return assignment


@transaction.atomic
def withdraw_application(
    *,
    application: CleanerApplication,
    withdrawn_by: User,
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
    return application


@transaction.atomic
def complete_job(*, job: CleaningJob, completed_by: User) -> CleaningJob:
    job = CleaningJob.objects.select_for_update().get(id=job.id)

    if job.status != CleaningJob.Status.ASSIGNED:
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

    assignment = job.assignment
    assignment.completed_at = timezone.now()
    assignment.save(update_fields=["completed_at", "updated_at"])

    job.status = CleaningJob.Status.COMPLETED
    job.save(update_fields=["status", "updated_at"])

    create_notification(
        user=job.host,
        notification_type="job.completed",
        title="Cleaning completed",
        body=f"{job.title} was marked completed.",
        metadata={"job_id": job.id},
    )
    create_notification(
        user=assignment.cleaner,
        notification_type="review.requested",
        title="Leave feedback",
        body=f"Please review your experience for {job.title}.",
        metadata={"job_id": job.id},
    )
    return job


@transaction.atomic
def assign_member_to_assignment(
    *,
    assignment: Assignment,
    agency_user: User,
    member: User,
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
    return assignment
