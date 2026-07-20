# ADR-0001: Turnover lineage and history-preserving recovery

**Date:** 2026-07-20  
**Status:** accepted  
**Deciders:** Repository owner, acting as Stage 1 owner and accountable owner for engineering, pilot operations, privacy review, and incident adjudication  
**Approval reference:** Explicit owner approval in the Codex conversation on 2026-07-20

## Context

`CleaningJob` currently represents both a turnover need and its only execution
record. The schema has unconditional exact-slot uniqueness, draft/open jobs can
be physically deleted, disputes are represented as a job status, and account
deletion can cascade jobs and assignments. Those behaviors cannot support
cancellation, failed-attempt recovery, or operator chronology without erasing
marketplace history. The repository owner approved the linked S1-D03 contract
and this architecture on 2026-07-20.

## Decision

Use a dedicated `TurnoverLineage` for one genuine turnover need and preserve
each `CleaningJob` as one historical attempt.

1. Every job belongs to exactly one lineage.
2. A job has at most one `Assignment`. An assigned, cancelled, or completed
   attempt retains that assignment and any immutable agency member delegation.
3. Draft content may be edited before publication. After publication, identity,
   lineage, property, host, predecessor, and assignment are immutable.
4. An accepted reschedule may change an assigned job's schedule only through a
   service that retains the original/proposed values and appends a lifecycle
   event.
5. Cancelled and completed attempts are terminal and are never reopened.
6. Recovery creates a new job in the same lineage. Its `replaces_job` points to
   the cancelled source; the source assignment is never reused or replaced.
7. A source job has at most one direct successor. Source and successor must use
   the same property and lineage, cannot self-reference, and cannot form a
   replacement cycle.
8. A no-show or failed attendance is a `JobIncident`, not a `failed` job status.
   A replaceable failed attempt is represented by a qualifying incident plus a
   terminal cancelled job.
9. A `Dispute` is a separate record. Dispute transitions never alter job
   completion, assignment timestamps, review eligibility, double-blind reveal,
   or ratings.
10. Replace R17's unconditional exact-slot uniqueness with PostgreSQL partial
    uniqueness:
    - one actionable job for an exact property/start/end slot;
    - one actionable job per lineage;
    - actionable statuses are `draft`, `open`, and `assigned`;
    - historical statuses are `completed` and `cancelled`.
11. `JobLifecycleEvent` is the append-only authoritative domain chronology.
    `AuditLog` remains separate security and observability evidence and is not a
    required lifecycle or migration source.
12. Lifecycle writes use explicit atomic services. Ordinary PATCH, DELETE,
    serializer saves, and model-admin edits do not change lifecycle state.
13. Services use one lock order: lineage, affected jobs in ascending ID order,
    workflow/assignment rows, then the concrete worker. Reschedule and all
    assignment-producing transitions re-run the authoritative half-open overlap
    check while holding the worker lock.
14. PostgreSQL partial unique indexes are the final concurrency guard. Expected
    constraint races become stable HTTP 409 responses.
15. Agency-backed reschedule and replacement remain unsupported. No S1-E05 API
    overwrites an agency member. Unsupported operations fail before mutation
    with `agency_recovery_not_supported`.
16. S1-E05 account deletion is limited to active-obligation blocking and
    support routing. De-identification, tombstone identities, and privacy erasure
    are separate work.

## Invariants and enforcement boundary

Database enforcement:

- non-null protected lineage on every job after backfill;
- partial unique actionable property/start/end slot;
- partial unique actionable job per lineage;
- one-to-one assignment per job;
- at most one direct successor per source job;
- no self-replacement;
- required structured cancellation data for cancelled jobs;
- protected lifecycle-critical foreign keys.

Service enforcement:

- job and lineage property/host agreement;
- same-property/same-lineage replacement;
- terminal source before an actionable successor;
- replacement-cycle prevention;
- actor authorization and account eligibility;
- immutable historical attempts and agency member delegation;
- cancellation releases the assignment interval;
- authoritative overlap revalidation;
- lifecycle-event/job/lineage consistency;
- disputes remain orthogonal to jobs, reviews, and ratings.

## Alternatives considered

### Reopen the original cancelled or failed job

- **Pros:** fewer rows and little schema change.
- **Cons:** destroys terminal history and corrupts attempt-level metrics.
- **Why not:** recovery must preserve the failed attempt.

### Replace the assignment on the same job

- **Pros:** keeps one job per turnover.
- **Cons:** erases the original worker relationship and weakens the one-assignment invariant.
- **Why not:** each attempt must keep its accepted assignment.

### Overwrite an agency member

- **Pros:** superficially simple reassignment.
- **Cons:** rewrites the responsible worker and their calendar history.
- **Why not:** normal agency delegation is immutable and agency recovery is deferred.

### Delete published or assigned history

- **Pros:** removes records that no longer need action.
- **Cons:** causes data loss across support, reviews, recovery, and pilot evidence.
- **Why not:** actionable state ends through a lifecycle transition, never deletion.

### Use `AuditLog` as the authoritative lifecycle store

- **Pros:** reuses an existing append-style table.
- **Cons:** polymorphic metadata does not enforce domain relationships and cannot
  supply all required backfill values.
- **Why not:** audit evidence and domain lifecycle truth have different contracts.

### Store mutable state plus JSON history

- **Pros:** avoids relational workflow models.
- **Cons:** cannot reliably enforce successor, assignment, visibility, and
  concurrency invariants.
- **Why not:** core recovery relationships require database constraints.

### Allow multiple assignments with an active flag

- **Pros:** replacements could remain on one job.
- **Cons:** complicates review parties, notifications, schedules, and accountability.
- **Why not:** the one-assignment-per-job invariant remains mandatory.

### Make disputes a job status

- **Pros:** fewer tables.
- **Cons:** conflates fulfilment with case review and can alter completed history.
- **Why not:** fulfilment and disputes are independent state machines.

## Consequences

### Positive

- Failed and recovered turnover history becomes reconstructable.
- Original assignments and agency delegations remain attributable.
- Lifecycle metrics count one lineage while retaining attempt-level evidence.
- Database constraints protect the highest-risk concurrency invariants.

### Negative

- More historical rows and explicit workflow records are retained.
- Existing creation, acceptance, deletion, and admin paths need service-layer
  alignment and new locking discipline.
- Data disclosure becomes audience-specific at lineage scope.

### Risks and mitigations

- **Constraint migration risk:** use expand, deterministic backfill, validation,
  and PostgreSQL concurrent partial-index creation before removing R17.
- **Deadlocks:** adopt one lock order across existing and new services.
- **Narrative leakage:** lifecycle events contain structured codes only; case
  narrative stays in restricted records.
- **Policy drift:** no participant-facing workflow is enabled until the linked
  S1-D03 policy contract is signed.

## Migration and rollback consequences

Add nullable lineage/cancellation/replacement fields first, create one
deterministic lineage per existing job without depending on audit history,
validate, then make lineage non-null and replace R17 with the partial indexes.
Legacy `disputed` jobs are normalized from assignment facts and receive a
structured migration event; no dispute narrative or outcome is invented.
Legacy `published_at` remains null unless a unique audit timestamp is available
as an optional best-effort enhancement.

Before the old exact-slot constraint is removed, the additive schema can be
left unused. After a same-slot historical successor exists, restoring the old
constraint would require deleting or changing history and is prohibited.
Rollback then means disabling workflow flags and applying a forward fix while
retaining jobs, assignments, and lifecycle events.

## Approval

Accepted on 2026-07-20 through explicit repository-owner approval in the Codex
conversation. The approval includes actionable statuses `draft`, `open`, and
`assigned`; historical statuses `completed` and `cancelled`; and the linked
S1-D03 policy defaults. Implementation remains staged, and S1-E05 cannot be
marked Done while agency recovery parity is deferred.
