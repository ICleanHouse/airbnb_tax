# S1-E05 Batch 2 — Lifecycle Foundation Evidence

**Date:** 2026-07-20  
**Status:** implemented; S1-E05 Partially complete  
**Policy:** [approved S1-D03 contract](../S1_D03_LIFECYCLE_SUPPORT_POLICY.md)  
**Architecture:** [accepted ADR-0001](../adr/0001-turnover-lineage-recovery.md)

## Delivered scope

- `TurnoverLineage`, non-null lineage ownership after deterministic legacy
  backfill, immutable attempt relationships, structured cancellation fields,
  and append-only `JobLifecycleEvent` chronology.
- Expand/backfill/validate/constrain migrations `0006`–`0008`, including legacy
  disputed-state normalization and no required dependency on `AuditLog`.
- PostgreSQL promotes lineage to non-null through a temporary `NOT VALID` check,
  online validation, `NOT NULL`, and check removal; partial unique indexes use
  concurrent creation and have explicit reverse cleanup.
- Conditional uniqueness for one actionable exact property/start/end slot and
  one actionable job per lineage. Terminal completed/cancelled history may share
  a slot.
- Lifecycle-first locking and event/audit recording for creation, publication,
  assignment, completion, and cancellation paths.
- Atomic, policy-authorized, identical-retry-idempotent cancellation that
  releases the assignment interval, rejects pending applications, preserves the
  assignment/delegated member, and sends narrative-free notifications.
- Explicit cancellation, available-actions, and disclosure-tiered chronology
  APIs. Physical job deletion returns a stable 409 directing the caller to
  cancellation.
- Read-only Django admin chronology and deletion/edit protection for lifecycle
  records.
- Account-deletion active-obligation blocking and protected-history support
  routing before logout; no de-identification model or privacy erasure workflow.
- Accessible host/direct-cleaner cancellation UI and account-deletion blocker
  presentation in BG/EN using `apiFetch` and trailing-slash routes.

## Test-first coverage

Backend coverage includes:

- deterministic migration backfill from marketplace migration `0005`;
- all legacy disputed normalization branches;
- exact-slot and per-lineage conditional uniqueness;
- self-replacement rejection and append-only lifecycle events;
- cancellation authorization, atomicity, interval release, notification
  recipients, stable errors, and identical-retry idempotency;
- explicit agency/member no-mutation behavior;
- available actions and worker lineage-disclosure isolation;
- physical job/property deletion guards;
- active/history/no-history account deletion outcomes;
- unchanged marketplace, calendar, connections, feedback, and account behavior.

Frontend coverage includes:

- cancellation reason submission and successful state acknowledgement;
- Escape handling and focus restoration;
- account-deletion active-obligation and support-route copy;
- host and cleaner dashboard integration;
- EN/BG translation-key parity.

## Verification results

```text
python manage.py check
  PASS — 0 issues

python manage.py makemigrations --check --dry-run
  PASS — no changes detected

python manage.py migrate --plan
  PASS — no pending migration operations on the local migrated database

python manage.py test \
  apps.marketplace.tests.test_lifecycle_foundation \
  apps.marketplace.tests.test_lifecycle_migrations \
  apps.accounts.tests.test_deletion_blockers
  PASS — 31 tests

python manage.py test
  PASS — 406 tests; 3 expected skips

npm.cmd test -- --run
  PASS — 47 tests across 10 files

npm.cmd run typecheck
  PASS

npm.cmd run lint
  PASS — 0 errors; 5 pre-existing hook dependency warnings

EN/BG recursive translation-key comparison
  PASS — 904 keys in each locale

git diff --check
  PASS
```

## PostgreSQL deployment gate

`apps.marketplace.tests.test_postgres_lifecycle_constraints` is implemented and
is intentionally skipped outside PostgreSQL. The local Docker daemon was not
available and the reachable local PostgreSQL service did not expose the
repository's configured development role, so the PostgreSQL-only suite was not
executed in this implementation session.

This is not treated as passing concurrency evidence. Before enabling the
replacement workflow or deploying migration `0008`, run that suite against the
target PostgreSQL version and inspect both partial-index predicates. Future
replacement/reschedule batches must add real PostgreSQL multi-connection race
tests; SQLite thread tests are not acceptable substitutes.

## Remaining scope and explicit non-goals

Still separate: reschedule proposals and incidents (Batch 3), replacement
requests and successor creation (Batch 4), disputes/optional messaging (Batch
5), and account de-identification/retention execution (privacy Batch 6). Agency
recovery parity remains deferred and explicitly unsupported, so S1-E05 cannot
be marked Done.

No payment, compensation, attachment/media, automated suspension, email
reliability, or general support-platform behavior was added.
