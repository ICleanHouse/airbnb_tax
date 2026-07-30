from __future__ import annotations

from dataclasses import dataclass

from apps.accounts.models import User
from apps.marketplace.models import Assignment, CleaningJob


@dataclass(frozen=True)
class ReviewParticipants:
    """The immutable review counterpart snapshot for one completed job attempt."""

    host: User
    concrete_worker: User


def resolve_review_participants(
    *, job: CleaningJob, assignment: Assignment
) -> ReviewParticipants:
    """Return the host and the worker who actually performed this attempt.

    An agency remains the commercial assignee of a delegated assignment, but
    it is not the cleaner-review counterpart once `assigned_member` is set.
    """

    return ReviewParticipants(
        host=job.host,
        concrete_worker=assignment.assigned_member
        if assignment.assigned_member_id
        else assignment.cleaner,
    )
