# S1-E02 Contact-Based Verification TDD Evidence

**Date:** 2026-07-21
**Status:** interim contact policy implemented; S1-E02 remains In progress
**Policy:** [ADR-0002](../adr/0002-contact-based-verification.md)
**Audit:** [S1-E02 maturity audit](s1_e02_account_verification_maturity_audit.md)

## Scope and policy result

Confirmed email satisfies the interim configured contact policy while phone is
not required. With normal requirements enabled, signup persists pending state
first and atomic reconciliation advances the account and cleaner marketplace
state. This is not identity, reference, interview, or trial-job verification.
`fully_verified` remains the configuration-independent conjunction of stored
email and phone timestamps.

S1-E02 remains **In progress** because phone OTP/security/recovery, manual
cleaner evidence, negative cleaner outcomes/restoration, re-review, retention,
and agency verification remain unresolved under S1-D02.

## Truth table

Assumptions: stored confirmed-email timestamp, no phone timestamp. `ALLOW=False`
is valid for shortcut rows only in local/test. Production-like shortcut rows
require the active guarded bypass; `ALLOW=True` is invalid when both normal
requirements are true.

| Account required | Cleaner required | Phone required | Account | Cleaner | Eligible | Evidence |
|---:|---:|---:|---|---|---:|---|
| True | True | False | approved | eligible state | Yes | Genuine |
| True | True | True | pending | pending | No | Genuine |
| True | False | False | approved | eligible shortcut | Yes | Excluded |
| True | False | True | pending | eligible shortcut | No | Excluded |
| False | True | False | approved shortcut | eligible state | Yes | Excluded |
| False | True | True | approved shortcut | pending | No | Excluded |
| False | False | False | approved shortcut | eligible shortcut | Yes | Excluded |
| False | False | True | approved shortcut | eligible shortcut | Yes | Excluded |

Every row leaves `fully_verified=False`. Configuration changes alone do not
reconcile, unlock, or downgrade existing records.

## RED/GREEN record

### Batch 1 — configuration and initialization

RED was checkpointed in `3e8a1ea`. The new configuration and contact-transition
tests failed before `VerificationConfiguration`, the evidence ledger, stored
predicates, and reconciliation service existed. The tests covered all eight
rows, unsafe/unused bypasses, malformed/inactive windows, safe pending-first
signup, no retroactive unlock, rollback, and immutable exclusion.

GREEN was implemented in `c794fbd`: settings validation, pending-first signup,
atomic User-then-CleanerProfile locking, forward-only stored-state
reconciliation, and the restricted exclusion ledger.

An additional measured RED on 2026-07-21 exposed the pre-existing
`EMAIL_VER_USER_SIGNUP=False` production interaction: seven configuration tests
errored because the validator did not yet model that switch. GREEN adds the
narrow rule that production-like environments reject this fake-confirmation
test mode. The same seven tests then passed.

### Batch 2 — transitions, audit, and notifications

RED in `3e8a1ea` covered the removed approve route, prerequisite conflict,
protected transition fields, stale expected state, invalid rejection,
suspension, restricted history, rollback, and exactly-once effects.

GREEN in `c794fbd` centralizes transitions, records actor/outcome/reason/note and
previous/next state, creates deterministic version-1 notification keys, and
registers dispatch only through `transaction.on_commit()`. No-op reconciliation
creates no additional audit or notification.

### Batch 3 — authorization boundaries

RED was checkpointed in `11dc402`. It exposed missing persistent-eligibility
checks for connection request/accept/message, favourite-host writes, private
cleaner profiles, agency invitations/acceptance, and active-agency delegation.

GREEN in `c794fbd` adds those service-boundary checks while retaining safe
history reads and decline/remove cleanup. Existing application, offer,
assignment, property/job, calendar, and deletion boundaries were regression
checked without broad serializer refactoring.

### Batch 4 — admin and user UI

GREEN is checkpointed in `175491e`. Focused Vitest/RTL coverage validates
separate states, honest interim wording, BG/EN key parity, accessible decision
dialogs, expected-state payloads, restricted internal-note history, and absence
of the removed approve/manual-cleaner control. The focused result was 6/6.

A final terminology RED showed that the status component still rendered the raw
cleaner state `verified`, and the public cleaner serializer still exposed the
legacy `is_verified` name. GREEN localizes the stored state as “Marketplace
access active” / its Bulgarian equivalent and exposes the honest public field
`marketplace_eligible`. A legacy email-link RED also proved that the older
confirmation route stamped the email without reconciliation; GREEN now performs
the same atomic reconciliation used by the code-confirmation path. A final
notification-copy RED found the signup admin email still claimed every account
was “awaiting approval”; GREEN reports the stored account state and links to the
neutral account review surface instead.

## Data changes

- `accounts/0019_pilotevidenceexclusion.py`: additive one-to-one restricted
  evidence ledger; no backfill or existing-state mutation.
- `notifications/0002_notification_deduplication_key.py`: additive nullable
  unique notification key.
- Both migrations are reversible schema additions. The application never
  silently clears an evidence exclusion.

## Verification results

| Command/target | Actual result |
|---|---|
| `python manage.py check` | Passed; zero issues. |
| `python manage.py makemigrations --check --dry-run` | Passed; no changes detected. |
| Focused S1-E02 backend tests | 35 tests, OK; 5 PostgreSQL-only tests skipped on SQLite. |
| Widened accounts/connections/favourites/status-gate tests | 112 tests, OK; 5 PostgreSQL-only tests skipped on SQLite. |
| Frontend focused S1-E02 tests | 6 passed. |
| Frontend full suite | 53 passed across 12 files. JSDOM emitted two non-failing navigation-not-implemented notices. |
| Frontend typecheck | Passed. |
| Frontend lint | Passed with zero errors and four pre-existing hook-dependency warnings outside the new S1-E02 admin code. |
| Accounts app | 85 tests, OK; 5 PostgreSQL-only tests skipped on SQLite. |
| Marketplace app | 181 tests, OK; 3 existing PostgreSQL-only tests skipped on SQLite. |
| Connections app | 13 tests, OK. |
| Notifications app | 17 tests, OK. |
| Core app | 11 tests, OK. |
| Complete backend suite | 444 tests, OK; 8 PostgreSQL-only skips on the SQLite run. |
| PostgreSQL-only S1-E02 concurrency target | 5/5 passed against PostgreSQL 16 in the repository Compose network. The current backend image was rebuilt first because the cached image lacked a declared dependency. |

The PostgreSQL target created and destroyed Django's isolated
`test_airbnb_cleaners` database. The repository database container was stopped
after the run. The tests prove serialization for duplicate reconciliation,
email reconciliation versus rejection, automatic approval versus suspension,
two admins with the same expected state, and cleaner eligibility versus account
suspension.

The implementation follows Django's documented
[`transaction.on_commit()` behavior](https://docs.djangoproject.com/en/5.2/topics/db/transactions/)
and [`select_for_update()` contract](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update),
with PostgreSQL row-lock behavior verified against the
[PostgreSQL explicit-locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html).

## Rollback

1. Enable `ACCOUNT_APPROVAL_REQUIRED` to stop new account shortcuts.
2. Enable `CLEANER_VERIFICATION_REQUIRED` to stop new cleaner shortcuts.
3. Enable `PHONE_VERIFICATION_REQUIRED` to stop new email-only normal
   advancement. Existing users are not downgraded.
4. Suspend existing affected accounts through an explicit operator transition;
   preserve jobs, assignments, messages, audits, and exclusion records.
5. Exclude affected rows from Stage 1 metrics through the restricted ledger.
6. Do not clear the ledger or bulk-rewrite user state without a separately
   approved migration, command, and notification procedure.

## Intentionally deferred or out of scope

- Phone provider, OTP security, phone change/recovery.
- Manual cleaner evidence and identity-document handling.
- Cleaner-specific rejection/suspension/restoration, re-review, and retention.
- Agency verification evidence.
- Broad S1-E01 serializer refactoring beyond the confirmed private-profile gap.
- Payments.
