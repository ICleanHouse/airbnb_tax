# S1-E04 cleaner assignment overlap prevention: TDD evidence

## Contract

The implemented assignment-producing transitions protect a concrete cleaner
with the half-open overlap predicate:

```text
existing_start < candidate_end
AND existing_end > candidate_start
```

Occupancy includes non-cancelled assignments where the worker is either the
direct `Assignment.cleaner` or an agency `Assignment.assigned_member`.
`Assignment.cancelled_at` releases the interval. Completion timestamps and job
status do not broadly remove the scheduled interval. Agency application
acceptance does not treat the agency account as a cleaner; the member-level
check begins at delegation.

The stable API conflict is HTTP 409 with exactly:

```json
{
  "code": "cleaner_schedule_conflict",
  "detail": "The cleaner is unavailable for this time range."
}
```

## RED checkpoint

The test-only checkpoint is commit `ce65aaa`:

```text
test(marketplace): add cleaner schedule conflict regressions
```

Command:

```powershell
cd backend
python manage.py test apps.marketplace.tests.test_schedule_conflicts --verbosity 2
```

Result before production changes: **RED** — 15 discovered, 11 failures, 3
passes, and the PostgreSQL-only test skipped on SQLite. The failures proved that
overlapping application acceptance, direct-offer acceptance, and agency-member
delegation succeeded, and their APIs returned 201/200 instead of the required
409. The passing controls proved agency acceptance, cancelled-interval release,
and non-overlapping boundaries already behaved independently of the missing
hard check.

## GREEN implementation

- `CleanerScheduleConflictError` provides the stable domain code and generic
  non-sensitive detail.
- `_ensure_no_cleaner_schedule_conflict` queries both real assignment worker
  relationships, excludes `cancelled_at` rows and the candidate job, and uses
  the half-open scheduled-job predicates.
- `accept_application` and `accept_offer` re-fetch and lock current state and
  invoke the check only for an individual cleaner.
- `assign_member_to_assignment` preserves immutable/idempotent delegation,
  reloads and locks a new concrete member, locks the cleaner profile and active
  membership, then checks occupancy before saving.
- Each producing transition is atomic and locks the concrete worker's `User`
  row before the occupancy query. Competing PostgreSQL transactions for the
  same cleaner therefore serialize; the second transaction observes the first
  committed assignment and conflicts.
- Only the typed schedule error is mapped to the exact 409 response. Other
  marketplace domain errors keep their existing 400 response.

## Index and migration review

No migration was added. Django already indexes the `Assignment.cleaner_id` and
`Assignment.assigned_member_id` foreign keys. The overlap lookup starts with a
specific worker across those two indexed relationships and joins each matching
assignment to its one job interval. A new composite B-tree cannot cover the OR
across two worker columns and related job fields cleanly, while PostgreSQL range
types or an exclusion constraint would diverge from the repository's supported
SQLite development model. Additional indexes remain contingent on production
PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` evidence.

## GREEN verification

| Command | Result |
|---|---|
| `python manage.py test apps.marketplace.tests.test_schedule_conflicts --verbosity 2` | PASS — 14 functional tests; 1 PostgreSQL-only skip on SQLite |
| `$env:DATABASE_URL='postgres://...@localhost:55432/airbnb_cleaners'; python manage.py test apps.marketplace.tests.test_schedule_conflicts.CleanerScheduleConflictConcurrencyTests --verbosity 2` | PASS — PostgreSQL 16, 1/1 |
| `python manage.py test apps.marketplace` | PASS — 151 tests; 1 PostgreSQL-only skip on SQLite |
| `python manage.py test apps.accounts` | PASS — 37/37 |
| `python manage.py makemigrations --check --dry-run` | PASS — no changes detected |
| `python manage.py check` | PASS — no issues |
| `python -m ruff check apps/marketplace/services.py apps/marketplace/views.py apps/marketplace/tests/test_schedule_conflicts.py` | PASS |
| `python -m ruff check apps/marketplace` | Existing unrelated failure — two F841 unused locals in `management/commands/seed_demo_data.py` |

The PostgreSQL proof used a disposable `postgres:16-alpine` container on local
port 55432 and independent Django connections in a `TransactionTestCase`. Two
threads accepted overlapping jobs owned by different hosts for the same
cleaner. The result was exactly one assignment and one
`CleanerScheduleConflictError`. The test is deliberately skipped on SQLite,
where `select_for_update()` cannot prove row-lock behavior. The disposable
container was stopped and auto-removed after the run; the repository's existing
PostgreSQL volume was not modified or deleted.

## Scope boundaries and status

Assigned-job rescheduling and emergency-replacement acceptance services are not
implemented. When those workflows are introduced, their mutation services must
lock the concrete worker and call the same overlap check in the transaction
that changes or creates the assignment. This is a future integration contract,
not an unfinished S1-E04 implementation.

The availability/preferred-slot documentation mismatch and removed availability
fields remain unchanged for a separate owner decision. They are independent of
the hard assignment-overlap invariant.

S1-E04 is **Done**: application acceptance, direct-offer acceptance, and
agency-member delegation are protected; the one-assignment-per-job database
invariant is preserved; focused, full marketplace, accounts, timezone/privacy,
and PostgreSQL concurrency verification passed.
