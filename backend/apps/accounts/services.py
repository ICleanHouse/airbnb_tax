from __future__ import annotations

from django.db import transaction
from django.db.models import Q

from apps.accounts.models import User
from apps.connections.models import Connection
from apps.core.services import write_audit_log
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.notifications.services import create_notification


def display_name(user: User) -> str:
    return user.get_full_name() or user.email or user.get_username()


@transaction.atomic
def delete_account_permanently(*, user: User, request=None) -> None:
    user = User.objects.select_for_update().get(id=user.id)
    user_id = user.id
    role = user.role
    email = user.email

    _notify_counterparties(user)
    Connection.objects.filter(Q(requester=user) | Q(addressee=user)).delete()
    write_audit_log(
        actor=user,
        action="account.deleted",
        entity_type="User",
        entity_id=user_id,
        request=request,
        metadata={"role": role, "email": email},
    )
    user.delete()


def _notify_counterparties(user: User) -> None:
    if user.is_host:
        _notify_cleaners_for_deleted_host(user)
    elif user.is_cleaner or user.is_agency:
        _notify_hosts_for_deleted_cleaner_or_agency(user)


def _notify_cleaners_for_deleted_host(host: User) -> None:
    notified_assignment_cleaners: set[int] = set()

    assignments = (
        Assignment.objects.select_related("job", "job__property", "cleaner", "assigned_member")
        .filter(job__host=host, cancelled_at__isnull=True, completed_at__isnull=True)
        .order_by("id")
    )
    for assignment in assignments:
        recipients = [assignment.cleaner]
        if assignment.assigned_member_id:
            recipients.append(assignment.assigned_member)
        for cleaner in recipients:
            if cleaner.id in notified_assignment_cleaners:
                continue
            notified_assignment_cleaners.add(cleaner.id)
            create_notification(
                user=cleaner,
                notification_type="account.host_deleted",
                title="Assigned job removed",
                body="A host account was deleted, so an assigned cleaning job was removed.",
                metadata={
                    "job_id": assignment.job_id,
                    "assignment_id": assignment.id,
                },
            )

    pending_applications = (
        CleanerApplication.objects.select_related("job", "job__property", "cleaner")
        .filter(job__host=host, status=CleanerApplication.Status.PENDING)
        .order_by("id")
    )
    for application in pending_applications:
        create_notification(
            user=application.cleaner,
            notification_type="account.host_deleted",
            title="Cleaning job removed",
            body="A published cleaning job or offer is no longer available.",
            metadata={
                "job_id": application.job_id,
                "application_id": application.id,
            },
        )


def _notify_hosts_for_deleted_cleaner_or_agency(cleaner: User) -> None:
    cleaner_name = display_name(cleaner)

    assignments = (
        Assignment.objects.select_related("job", "job__host", "cleaner", "assigned_member")
        .filter(
            Q(cleaner=cleaner) | Q(assigned_member=cleaner),
            cancelled_at__isnull=True,
            completed_at__isnull=True,
        )
        .order_by("id")
    )
    for assignment in assignments:
        create_notification(
            user=assignment.job.host,
            notification_type="account.cleaner_deleted",
            title="Assigned cleaner deleted account",
            body=f"{cleaner_name} deleted their account, so an assigned cleaning job was removed.",
            metadata={
                "deleted_user_id": cleaner.id,
                "deleted_user_role": cleaner.role,
                "job_id": assignment.job_id,
                "assignment_id": assignment.id,
                "cleaner_id": assignment.cleaner_id,
                "assigned_member_id": assignment.assigned_member_id,
            },
        )
        if cleaner.is_cleaner and assignment.cleaner_id != cleaner.id:
            create_notification(
                user=assignment.cleaner,
                notification_type="account.cleaner_deleted",
                title="Agency cleaner unavailable",
                body=f"{cleaner_name} deleted their account and can no longer complete an assigned agency job.",
                metadata={
                    "deleted_user_id": cleaner.id,
                    "deleted_user_role": cleaner.role,
                    "job_id": assignment.job_id,
                    "assignment_id": assignment.id,
                    "assigned_member_id": cleaner.id,
                },
            )

    active_job_ids = list(assignments.values_list("job_id", flat=True))
    if active_job_ids:
        CleaningJob.objects.filter(id__in=active_job_ids).delete()

    pending_applications = (
        CleanerApplication.objects.select_related("job", "job__host", "cleaner")
        .filter(cleaner=cleaner, status=CleanerApplication.Status.PENDING)
        .order_by("id")
    )
    for application in pending_applications:
        create_notification(
            user=application.job.host,
            notification_type="account.cleaner_deleted",
            title="Cleaner no longer available",
            body=f"{cleaner_name} deleted their account, so their application or offer is no longer available.",
            metadata={
                "deleted_user_id": cleaner.id,
                "deleted_user_role": cleaner.role,
                "job_id": application.job_id,
                "application_id": application.id,
            },
        )
