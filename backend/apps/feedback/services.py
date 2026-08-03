from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q, Subquery
from django.utils import timezone

from apps.accounts.models import CleanerProfile
from apps.core.services import write_audit_log
from apps.feedback.models import Review, ReviewGroup
from apps.marketplace.models import CleaningJob
from apps.marketplace.participants import resolve_review_participants
from apps.notifications.services import NotificationEventRequest, emit_notification_event


User = get_user_model()

# Double-blind review window: a review is revealed once BOTH sides have
# submitted, OR this many days after completion (whichever comes first).
REVIEW_WINDOW_DAYS = 14


class FeedbackError(ValueError):
    pass


def review_window_cutoff():
    """Jobs completed at or before this instant have an expired review window."""
    return timezone.now() - timedelta(days=REVIEW_WINDOW_DAYS)


def revealed_received_reviews(user: User):
    """
    Reviews *about* ``user`` that are visible under the double-blind rule: the
    counterpart review for the same job exists (i.e. ``user`` also reviewed), or
    the review window has closed. Private-issue reports are never included.
    """
    reviewed_job_ids = Review.objects.filter(reviewer=user, is_private_issue=False).values("job")
    revealed_group_ids = ReviewGroup.objects.filter(
        Q(host=user) | Q(agency=user) | Q(delegated_member=user)
    ).annotate(
        review_count=Count("reviews", filter=Q(reviews__is_private_issue=False))
    ).filter(
        Q(review_count=6) | Q(job__assignment__completed_at__lte=review_window_cutoff())
    ).values("id")
    return Review.objects.filter(reviewee=user, is_private_issue=False).filter(
        Q(group__in=Subquery(revealed_group_ids))
        | Q(group__isnull=True, job__in=Subquery(reviewed_job_ids))
        | Q(group__isnull=True, job__assignment__completed_at__lte=review_window_cutoff())
    )


def revealed_group_reviews(user: User):
    """All six reviews are visible to a group participant once the group reveals."""
    group_ids = ReviewGroup.objects.filter(Q(host=user) | Q(agency=user) | Q(delegated_member=user)).annotate(
        review_count=Count("reviews", filter=Q(reviews__is_private_issue=False))
    ).filter(Q(review_count=6) | Q(job__assignment__completed_at__lte=review_window_cutoff())).values("id")
    return Review.objects.filter(group__in=Subquery(group_ids), is_private_issue=False)


def _review_participant_ids(job: CleaningJob, assignment) -> set[int]:
    group = getattr(job, "review_group", None)
    if group is not None:
        return set(group.participant_ids)
    participants = resolve_review_participants(job=job, assignment=assignment)
    return {participants.host.id, participants.concrete_worker.id}


def ensure_review_group_for_completed_assignment(*, job: CleaningJob, assignment) -> ReviewGroup | None:
    """Create the immutable three-party snapshot for delegated agency work.

    This is called inside the marketplace completion transaction, so the
    participant snapshot is committed with the completed attempt and can never
    be changed by later agency delegation activity.
    """
    participants = resolve_review_participants(job=job, assignment=assignment)
    if participants.agency is None:
        return None

    group, _created = ReviewGroup.objects.get_or_create(
        job=job,
        defaults={
            "host": participants.host,
            "agency": participants.agency,
            "delegated_member": participants.concrete_worker,
        },
    )
    if group.participant_ids != (
        participants.host.id,
        participants.agency.id,
        participants.concrete_worker.id,
    ):
        raise FeedbackError("Delegated review-group participants do not match the completed assignment.")
    return group


@transaction.atomic
def submit_review(
    *,
    job: CleaningJob,
    reviewer: User,
    reviewee: User,
    rating: int,
    comment: str = "",
    private_note: str = "",
    is_private_issue: bool = False,
    request=None,
) -> Review:
    if job.status != CleaningJob.Status.COMPLETED:
        raise FeedbackError("Reviews are allowed only after the job is completed.")

    if not hasattr(job, "assignment"):
        raise FeedbackError("Reviewed job must have an assignment.")

    assignment = job.assignment
    if assignment.completed_at is None:
        raise FeedbackError("Reviewed job must have a completion timestamp.")

    if assignment.completed_at and timezone.now() > assignment.completed_at + timedelta(
        days=REVIEW_WINDOW_DAYS
    ):
        raise FeedbackError("The review window for this job has closed.")

    group = getattr(job, "review_group", None)
    involved_user_ids = _review_participant_ids(job, assignment)
    if reviewer.id not in involved_user_ids or reviewee.id not in involved_user_ids:
        raise FeedbackError("Only users involved in the job can review each other.")

    if reviewer.id == reviewee.id:
        raise FeedbackError("Users cannot review themselves.")

    if Review.objects.filter(job=job, reviewer=reviewer, reviewee=reviewee).exists():
        raise FeedbackError("You have already reviewed this job.")

    try:
        with transaction.atomic():
            review = Review.objects.create(
                job=job,
                group=group,
                reviewer=reviewer,
                reviewee=reviewee,
                rating=rating,
                comment=comment,
                private_note=private_note,
                is_private_issue=is_private_issue,
            )
    except IntegrityError as exc:
        raise FeedbackError("You have already reviewed this job.") from exc

    counterpart = Review.objects.filter(
        job=job,
        reviewer=reviewee,
        reviewee=reviewer,
        is_private_issue=False,
    ).first()

    # Ratings reflect only revealed public two-party reviews. Delegated
    # ReviewGroup records remain private to their three participants.
    refresh_cleaner_rating(reviewee)
    refresh_cleaner_rating(reviewer)

    if is_private_issue:
        pass
    elif group is not None:
        public_review_count = group.reviews.filter(is_private_issue=False).count()
        if public_review_count == 6:
            for recipient in (group.host, group.agency, group.delegated_member):
                emit_notification_event(
                    NotificationEventRequest(
                        event_type="review.group_revealed",
                        recipient_id=recipient.id,
                        occurrence_key=f"review-group-revealed:{group.id}:{recipient.id}",
                        destination=(
                            f"/host?reviewJob={job.id}"
                            if recipient.id == group.host_id
                            else f"/agency?reviewJob={job.id}"
                            if recipient.id == group.agency_id
                            else f"/cleaner?reviewJob={job.id}"
                        ),
                        source_entity_type="ReviewGroup",
                        source_entity_id=str(group.id),
                        request_id=getattr(request, "request_id", "") if request else "",
                    )
                )
    elif counterpart is not None:
        # Both reviews now exist — they become visible to each other.
        for recipient in (reviewer, reviewee):
            emit_notification_event(
                NotificationEventRequest(
                    event_type="review.revealed",
                    recipient_id=recipient.id,
                    occurrence_key=f"review-revealed:{review.id}:{recipient.id}",
                    destination=(
                        f"/host?reviewJob={job.id}&reviewId={review.id}"
                        if recipient.id == job.host_id
                        else f"/cleaner?reviewJob={job.id}&reviewId={review.id}"
                    ),
                    source_entity_type="Review",
                    source_entity_id=str(review.id),
                    request_id=getattr(request, "request_id", "") if request else "",
                )
            )
    else:
        # Prompt the other party to review so they can both see each other's.
        emit_notification_event(
            NotificationEventRequest(
                event_type="review.requested",
                recipient_id=reviewee.id,
                occurrence_key=f"review-request:{review.id}:{reviewee.id}",
                destination=(
                    f"/host?reviewJob={job.id}" if reviewee.id == job.host_id
                    else f"/cleaner?reviewJob={job.id}"
                ),
                source_entity_type="Review",
                source_entity_id=str(review.id),
                request_id=getattr(request, "request_id", "") if request else "",
                metadata={"job_id": job.id, "reviewee_id": reviewee.id},
            )
        )

    write_audit_log(
        actor=reviewer,
        action="review.submitted",
        entity_type="Review",
        entity_id=review.id,
        request=request,
        metadata={"job_id": review.job_id, "reviewee_id": review.reviewee_id},
    )
    return review


def refresh_cleaner_rating(user: User) -> None:
    if not user.is_cleaner:
        return
    try:
        profile = user.cleaner_profile
    except CleanerProfile.DoesNotExist:
        return

    # Group-review records remain private to their three participants and do
    # not influence the public cleaner-rating projection.
    aggregate = revealed_received_reviews(user).filter(group__isnull=True).aggregate(average=Avg("rating"))
    completed_count = (
        user.cleaning_assignments.filter(job__status=CleaningJob.Status.COMPLETED).count()
        + user.agency_assigned_cleanings.filter(
            job__status=CleaningJob.Status.COMPLETED
        ).count()
    )
    profile.average_rating = aggregate["average"] or 0
    profile.completed_jobs_count = completed_count
    profile.save(update_fields=["average_rating", "completed_jobs_count", "updated_at"])
