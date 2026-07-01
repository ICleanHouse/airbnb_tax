from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Avg, Q, Subquery
from django.utils import timezone

from apps.accounts.models import CleanerProfile
from apps.core.services import write_audit_log
from apps.feedback.models import Review
from apps.marketplace.models import CleaningJob
from apps.notifications.services import create_notification


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
    return Review.objects.filter(reviewee=user, is_private_issue=False).filter(
        Q(job__in=Subquery(reviewed_job_ids))
        | Q(job__assignment__completed_at__lte=review_window_cutoff())
    )


def _review_participant_ids(job: CleaningJob, assignment) -> set[int]:
    actual_cleaner_id = assignment.assigned_member_id or assignment.cleaner_id
    return {job.host_id, actual_cleaner_id}


def _is_delegated_agency_assignment(assignment) -> bool:
    return bool(assignment.assigned_member_id and assignment.cleaner.is_agency)


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

    involved_user_ids = _review_participant_ids(job, assignment)
    if reviewer.id not in involved_user_ids or reviewee.id not in involved_user_ids:
        if _is_delegated_agency_assignment(assignment):
            raise FeedbackError(
                "Only the host and assigned cleaner can review each other for this job."
            )
        raise FeedbackError("Only users involved in the job can review each other.")

    if reviewer.id == reviewee.id:
        raise FeedbackError("Users cannot review themselves.")

    if Review.objects.filter(job=job, reviewer=reviewer, reviewee=reviewee).exists():
        raise FeedbackError("You have already reviewed this job.")

    try:
        with transaction.atomic():
            review = Review.objects.create(
                job=job,
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

    # Ratings reflect only revealed reviews, so recompute both directions in case
    # this submission completed a pair (only cleaners carry a rating).
    refresh_cleaner_rating(reviewee)
    refresh_cleaner_rating(reviewer)

    if is_private_issue:
        pass
    elif counterpart is not None:
        # Both reviews now exist — they become visible to each other.
        for recipient in (reviewer, reviewee):
            create_notification(
                user=recipient,
                notification_type="review.submitted",
                title="Reviews are now visible",
                body=f"You and the other party have both reviewed {job.title}.",
                metadata={"job_id": job.id, "review_id": review.id},
            )
    else:
        # Prompt the other party to review so they can both see each other's.
        create_notification(
            user=reviewee,
            notification_type="review.requested",
            title="Leave a review",
            body=f"You were reviewed for {job.title} — leave your review to see theirs.",
            metadata={"job_id": job.id, "reviewee_id": reviewer.id},
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

    # Only revealed reviews count toward the public rating (double-blind).
    aggregate = revealed_received_reviews(user).aggregate(average=Avg("rating"))
    completed_count = user.cleaning_assignments.filter(job__status=CleaningJob.Status.COMPLETED).count()
    profile.average_rating = aggregate["average"] or 0
    profile.completed_jobs_count = completed_count
    profile.save(update_fields=["average_rating", "completed_jobs_count", "updated_at"])
