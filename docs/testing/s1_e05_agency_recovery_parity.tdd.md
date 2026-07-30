# S1-E05 — Agency Recovery Parity TDD Evidence

**Date:** 2026-07-30
**Status:** implementation verified; controlled target-environment activation remains
**Scope:** eligible delegated-agency recovery, concrete-worker completion/review
routing, and their service/API/PostgreSQL evidence.

## Execution contract

1. A terminal agency-backed source job retains its original application,
   assignment, agency, and immutable `assigned_member` history.
2. An eligible agency can record an incident and an optional append-only member
   release. The acted release links to, but does not alter, one recovery request.
3. The explicit recovery service locks the source lineage/job/assignment and
   creates one pending host-authorized request. Only the host may authorize it;
   authorization creates one new draft replacement in the same lineage.
4. The source remains terminal and the replacement is the only actionable
   attempt. Normal delegation still rejects a different member. A later concrete
   replacement worker must use the existing membership, eligibility, and locked
   overlap checks.
5. Completion resolves the concrete worker once through
   `marketplace.participants.resolve_review_participants`: the host and
   `assigned_member` for delegated work, otherwise the assigned cleaner.
   The agency is not a personal-review participant. `review.requested` is
   dispatched after commit with only `job_id` and `reviewee_id` metadata and the
   role-appropriate review route.

## RED → GREEN

The new agency parity tests initially exposed four gaps:

- release requests were not linked to recovery requests;
- duplicate recovery relied on a database error instead of a stable conflict;
- a platform administrator could self-authorize a replacement; and
- delegated completion used a three-party review group and omitted safe routing
  metadata from the in-app notification.

The PostgreSQL run additionally exposed a nullable-join `SELECT FOR UPDATE`
error that SQLite did not reveal. The recovery/cancellation/release queries now
lock the assignment table explicitly, preserving the existing lock contract.

## Coverage

| Guarantee | Test target | Result |
| --- | --- | --- |
| Agency cancellation/failure creates one host-authorized linked successor while source job, application, assignment, and member remain unchanged | `apps.marketplace.tests.test_agency_recovery_parity` | PASS |
| Unauthorized, stale, and duplicate recovery has no partial lifecycle, audit, notification, or replacement records | `apps.marketplace.tests.test_agency_recovery_parity` | PASS |
| Normal delegated-member reassignment remains rejected; existing concrete-worker overlap tests remain green | marketplace suite and PostgreSQL schedule-concurrency target | PASS |
| Delegated completion creates two review prompts for host and concrete member, never the agency | `apps.feedback.tests.test_delegated_agency_completion`, `test_group_reviews`, `test_review_invariants` | PASS |
| Review metadata and host/cleaner review links use the correct counterpart | `apps.feedback.tests.test_delegated_agency_completion`, `test_review_notifications` | PASS |
| Repeated completion and outer transaction rollback do not create duplicate prompts | `apps.feedback.tests.test_delegated_agency_completion` | PASS |
| Concurrent agency recovery creates one request, one lifecycle event, and one audit record | `PostgreSqlAgencyRecoveryConcurrencyTests` against PostgreSQL 16 | PASS |

## Verification run

From `backend/`:

- `python manage.py makemigrations --check --dry-run` — PASS; no model changes.
- `python manage.py migrate --plan` — PASS; reports only the repository's
  already-pending local migrations.
- `python manage.py check` — PASS; no issues.
- `python manage.py test apps.marketplace.tests.test_agency_recovery_parity apps.feedback.tests.test_group_reviews apps.feedback.tests.test_review_invariants apps.feedback.tests.test_delegated_agency_completion apps.feedback.tests.test_review_notifications` — PASS (33 tests; one PostgreSQL-only skip under SQLite).
- `python manage.py test apps.marketplace.tests` — PASS (197 tests; four
  expected PostgreSQL-only skips).
- `python manage.py test apps.feedback.tests` — PASS (42 tests).
- `python manage.py test apps.notifications.tests` — PASS (27 tests; one
  expected skip).
- `python manage.py test apps.accounts.tests.test_deletion_blockers` — PASS (7
  tests).

The real PostgreSQL 16 verification used an isolated disposable container with
the recovery flag enabled and an in-memory Celery test broker:

```powershell
python manage.py test apps.marketplace.tests.test_agency_recovery_parity.PostgreSqlAgencyRecoveryConcurrencyTests apps.marketplace.tests.test_postgres_lifecycle_constraints apps.marketplace.tests.test_schedule_conflicts.CleanerScheduleConflictConcurrencyTests
```

Result: **PASS (4 tests)**. This proves the new concurrent recovery race plus
the existing turnover-lineage/slot constraints and concrete-worker schedule
race on PostgreSQL, rather than relying on SQLite threads.

## Deliberate limits

- `AGENCY_LIVE_RECOVERY_ENABLED` remains fail-closed by default. No deployment
  or environment setting was changed; apply target migrations and enable it only
  through the controlled rollout.
- The existing Playwright agency suite covers workspace/invitation/member
  selection only; it has no agency recovery or delegated-review scenario, so no
  unrelated browser test was run for this backend-only slice.
- Historical `ReviewGroup` records remain readable and immutable. New delegated
  completion uses the two-party participant contract above.
- The legacy three-party wording in ADR-0003 was not edited because that would
  be incompatible with its accepted decision; this evidence records the active
  S1-E05 implementation contract.
