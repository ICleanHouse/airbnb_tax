# S1-E08 account recovery and safe account deletion — TDD evidence

Status: **Partially complete** (2026-07-28). S1-D04 now approves the product
retention/closure policy. The account-closure implementation anonymizes direct
identifiers while preserving protected history and schedules eligible
history-free hard deletion after 30 days. Full completion still requires the
remaining PostgreSQL, Redis/Celery, provider, and browser runtime evidence.

## Baseline and CodeGraph analysis

The maturity audit is [s1_e08_account_recovery_maturity_audit.md](s1_e08_account_recovery_maturity_audit.md).
CodeGraph status was OK (330 files, 4,490 nodes, 11,514 edges). Queries covered
authentication/login, deletion blockers and callers, notification event/delivery
contracts, account-deletion UI, tests, and user-owned foreign-key relationships.
Source was then inspected before each edit.

## Implemented contract

- `POST /api/accounts/password-reset/request/` always returns the same 200
  body. It normalizes email, hashes cache keys, rate-limits by normalized email
  and `REMOTE_ADDR`, never trusts forwarded headers, and only queues delivery
  for active known users.
- `POST /api/accounts/password-reset/confirm/` uses Django's
  `PasswordResetTokenGenerator`, configured `PASSWORD_RESET_TIMEOUT`, password
  validators, database transaction/row lock, controlled errors, and no status,
  role, eligibility, or verification mutation. Existing sessions are invalidated
  by Django's password-hash session contract.
- Reset-request and reset-completed events use S1-E06 durable notification
  delivery; metadata has no token, password, or email. The delivery renderer
  creates a localized frontend link only at send time.
- Localized BG/EN forgot/reset pages use `apiFetch`, do not persist tokens, keep
  terminal/error states accessible, and replace reset URL history on success.
- Self-service closure blocks active obligations and admin legal/dispute/support
  holds. It disables authentication, clears direct identifiers and publication,
  preserves protected marketplace/counterpart/agency/notification history under
  a neutral tombstone, and makes history-free accounts eligible for bounded
  deletion after 30 days. Safe fields include an optional validated
  `https`/`mailto` monitored support route; no object IDs, counterpart data, or
  internal notes are exposed.

## Tests and commands

Passed: migration check (no changes), migration plan (none), Django check,
focused account recovery/deletion (10), `apps.accounts` (94; 5 PostgreSQL
skips), `apps.notifications` (27; 1 skip), `apps.marketplace` (189; 3 skips),
and the complete Django suite (479; 9 skips). TypeScript typecheck passed;
ESLint passed with 4 pre-existing hook-dependency warnings; full Vitest passed
(21 files/83 tests); the seeded Chromium suite passed (10/10).

The browser result covers the established role, agency, guest-Connect, safe
return-route, and notification journeys. It does not yet contain a dedicated
password-reset email-capture fixture or a deletion support journey. PostgreSQL
16 concurrency and Redis/Celery/provider runtime evidence remain unavailable
locally and are unverified, not passed.

## Security review and rollback

Tokens/passwords are absent from event metadata, audit metadata, API success
copy, and frontend storage. Recovery request responses remain generic during a
downstream event-persistence outage. Closure/anonymization migrations are
forward-only; rollback must stop cleanup first and restore only from a verified
non-production backup rehearsal. Operator fallback is the configured monitored
support destination; operators initiate a fresh approved reset and may not
read/set passwords or alter account state.
