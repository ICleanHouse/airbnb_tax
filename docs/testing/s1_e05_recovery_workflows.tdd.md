# S1-E05 Direct Recovery Workflows — TDD Evidence

**Date:** 2026-07-22  
**Scope:** direct host/cleaner recovery only; agency recovery remains unsupported.

## RED → GREEN

- RED: `python manage.py test apps.marketplace.tests.test_recovery_workflows` failed because the recovery service API did not exist.
- GREEN: the same test target passed after the recovery models, transactional services, API actions, and privacy boundaries were added.

## Guarantees

| Guarantee | Test target | Result |
|---|---|---|
| Counterpart acceptance applies a direct-assignment reschedule and records lifecycle history | `test_recovery_workflows` | PASS |
| Incident narratives are not written to lifecycle metadata | `test_recovery_workflows` | PASS |
| Replacement successors are unassigned drafts linked to an immutable cancelled source | `test_recovery_workflows` | PASS |
| Disputes are private and unresolved cases block account deletion | `test_recovery_workflows`, `test_deletion_blockers` | PASS |
| Reschedule API returns safe data and requires counterpart response | `test_recovery_workflows` | PASS |

## Commands Run

- `python manage.py test apps.marketplace.tests.test_recovery_workflows apps.accounts.tests.test_deletion_blockers` — PASS (8 tests).
- `python manage.py test apps.marketplace.tests.test_recovery_workflows apps.marketplace.tests.test_lifecycle_foundation` — PASS (30 tests).
- `python manage.py check` — PASS.
- Frontend `npm.cmd run typecheck` — PASS; focused ESLint had no errors (three pre-existing dashboard hook-dependency warnings).

## Intentional Boundaries

Agency-backed recovery, email delivery/retries, retention/de-identification execution, payments, media, and public recovery details remain out of scope. S1-E05 remains partially complete because agency recovery is explicitly deferred by the accepted ADR.
