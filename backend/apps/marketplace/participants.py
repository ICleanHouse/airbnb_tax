from __future__ import annotations

from dataclasses import dataclass

from apps.accounts.models import User
from apps.marketplace.models import Assignment, CleaningJob


@dataclass(frozen=True)
class ReviewParticipants:
    """The immutable review counterpart snapshot for one completed job attempt."""

    host: User
    concrete_worker: User
    agency: User | None = None


def resolve_review_participants(
    *, job: CleaningJob, assignment: Assignment
) -> ReviewParticipants:
    """Return the host and the worker who actually performed this attempt.

    Direct and undelegated work uses the host and concrete worker. Delegated
    agency work also retains the commercial agency as the third immutable
    ReviewGroup participant.
    """

    return ReviewParticipants(
        host=job.host,
        concrete_worker=assignment.assigned_member
        if assignment.assigned_member_id
        else assignment.cleaner,
        agency=assignment.cleaner if assignment.assigned_member_id else None,
    )
