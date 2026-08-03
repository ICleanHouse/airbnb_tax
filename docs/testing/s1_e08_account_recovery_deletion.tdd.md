# S1-E08 account recovery and deletion runtime evidence

Date: 2026-08-03  
Scope: Stage 1 runtime-evidence slice; no public API contract changes.

## Current maturity audit

The repository already had the approved S1-D04 close/tombstone/limited cleanup
contract and the S1-E05 deletion blocker service.  Password recovery was also
implemented before this slice: public request/confirm endpoints, Django token
generator and validators, durable notification events, and localized recovery
pages already existed.  This work added the missing focused runtime evidence;
no production code defect was found or changed.

S1-D04 is complete in `docs/S1_D04_PRIVACY_RETENTION_DECISION.md`.  Closure
immediately disables and tombstones an account; protected history is retained,
and an account with no protected history is eligible for the approved bounded
cleanup after 30 days.  There are no retention-policy rows blocked by an owner
decision.

## Requirement-to-code mapping

| Area | Implementation |
| --- | --- |
| Reset API | `apps.accounts.views.PasswordResetRequestView` and `PasswordResetConfirmView` |
| Reset service | `apps.accounts.recovery.request_password_reset` and `confirm_password_reset`; `apps.accounts.tokens.password_reset_token` |
| Throttle and redaction | `apps.accounts.recovery._digest`, `_consume_limit`, empty event/audit metadata |
| Durable email | `apps.notifications.services.emit_notification_event`; `apps.notifications.delivery` renders an ephemeral link after commit |
| Fixed frontend URL | `apps.notifications.delivery._frontend_origin` and password-reset renderer |
| Recovery UI | `frontend/app/[locale]/forgot-password/page.tsx`, `frontend/app/[locale]/reset-password/page.tsx`, `frontend/messages/{en,bg}.json` |
| Closure service | `apps.accounts.services.account_deletion_blocker`, `close_account`, `account_has_protected_history` |
| Cleanup | `apps.accounts.cleanup.cleanup_history_free_accounts` |
| API and UI | `apps.accounts.views.MeView.delete`; `frontend/components/AccountDeletionPanel.tsx` |
| Persistence safeguards | `PROTECT` relations on marketplace/history models; S1-D04 tombstone and retention-hold models |

## Runtime matrix

`PASS` means the named test executed green in the stated environment.  Both
SQLite/locmem and the required PostgreSQL 16/Redis Compose evidence were run.

| Requirement | Status | Evidence |
| --- | --- | --- |
| Generic forgot-password endpoint, active/unknown/inactive parity | PASS | `PasswordRecoveryApiTests.test_request_is_generic_for_existing_unknown_and_inactive_accounts` |
| BG/EN forgot and reset screens, `apiFetch`, accessible success/error/focus states | PASS | Existing page tests plus focused `forgot-password/page.test.tsx`, `reset-password/page.test.tsx`, and `messages/passwordRecovery.test.ts` |
| No response/log/audit/event metadata disclosure | PASS | `test_request_is_generic_when_event_persistence_fails_without_sensitive_log_data`; `test_confirmation_audit_and_notification_metadata_exclude_password_and_token` |
| Expiring, malformed, cross-user, and one-use reset tokens | PASS | `test_malformed_and_expired_tokens_are_rejected_without_audit_or_notification`; `test_invalid_cross_user_and_reused_tokens_fail` |
| Configured Django password validators; role/status unchanged | PASS | `test_password_mismatch_and_validator_failure_are_controlled`; `test_confirm_changes_password_without_changing_role_or_status_and_emits_once` |
| Successful reset invalidates old session and reset token | PASS | `test_existing_session_is_invalidated_by_password_change`; `test_invalid_cross_user_and_reused_tokens_fail` |
| Email/account and IP throttles use hashed cache keys | PASS (local-cache behavior) | `test_request_limit_normalizes_email_and_keeps_generic_response`; `test_request_uses_hashed_normalized_email_and_ip_limit_keys` |
| Shared Redis throttle atomicity in deployed configuration | PASS | Compose Redis 7 was configured through `CACHE_URL`; password-recovery suite passed, and a short-lived Django cache value written by one Compose backend process was read by another. |
| Request email dispatch happens after commit | PASS | `PasswordRecoveryEmailDeliveryTests.test_reset_request_dispatches_only_after_commit_and_renders_fixed_frontend_route` using `captureOnCommitCallbacks` |
| Request outcome stays generic if durable event persistence fails | PASS | `test_request_is_generic_when_event_persistence_fails_without_sensitive_log_data` |
| URL uses frontend origin and fixed localized reset route; token is not persisted | PASS | `PasswordRecoveryEmailDeliveryTests.test_reset_request_dispatches_only_after_commit_and_renders_fixed_frontend_route` |
| Completed-reset notification contains no password/token | PASS | `PasswordRecoveryEmailDeliveryTests.test_completed_reset_notification_contains_no_password_or_reset_token` |
| Documented operator fallback without direct DB mutation | PASS | `test_operator_fallback_can_start_the_same_generic_recovery_without_account_mutation`; operator directs the holder to the same public recovery endpoint. |
| Future/direct/delegated active assignment blockers; no partial effects; repeat safe | PASS | `AccountDeletionRuntimeMatrixTests.test_direct_and_delegated_active_assignments_block_without_partial_deletion` |
| Actionable replacement and unresolved dispute blockers | PASS | `test_pending_replacement_and_open_dispute_block_all_involved_parties` |
| Legal/dispute/support retention holds return safe configured support route and remain idempotent | PASS | `test_all_active_hold_categories_are_safe_idempotent_conflicts` |
| Protected connection/message/agency/notification history survives closure and skips cleanup | PASS | `test_protected_counterparty_notification_and_agency_history_is_preserved_and_skips_cleanup` |
| Database `PROTECT` agrees with marketplace-history service behavior | PASS (SQLite relation behavior) | `test_database_protect_constraints_match_service_blocker_for_marketplace_history` |
| PostgreSQL `PROTECT`, locking, and concurrent closure/idempotency | PASS | PostgreSQL 16.14: `test_closure_postgres`, marketplace lifecycle constraint tests, and PostgreSQL notification claim concurrency tests passed. |
| Anonymous, self-only, and CSRF-protected deletion | PASS | `test_only_authenticated_current_user_can_close_and_csrf_is_enforced` |
| History-free close/tombstone then approved bounded cleanup | PASS | `test_history_free_account_closes_then_becomes_eligible_for_bounded_cleanup` |
| Browser full-suite regression | PASS | After restoring the lockfile installation with `npm.cmd ci`, Vitest passed 25 files / 94 tests. |
| Retention/anonymization owner decision | PASS | S1-D04 is approved; no `BLOCKED_BY_POLICY` rows. |

## Focused test inventory

New or extended backend coverage:

- `PasswordRecoveryApiTests.test_request_is_generic_for_existing_unknown_and_inactive_accounts`
- `PasswordRecoveryApiTests.test_operator_fallback_can_start_the_same_generic_recovery_without_account_mutation`
- `PasswordRecoveryApiTests.test_request_uses_hashed_normalized_email_and_ip_limit_keys`
- `PasswordRecoveryApiTests.test_request_is_generic_when_event_persistence_fails_without_sensitive_log_data`
- `PasswordRecoveryApiTests.test_malformed_and_expired_tokens_are_rejected_without_audit_or_notification`
- `PasswordRecoveryApiTests.test_confirmation_audit_and_notification_metadata_exclude_password_and_token`
- `PasswordRecoveryEmailDeliveryTests.test_reset_request_dispatches_only_after_commit_and_renders_fixed_frontend_route`
- `PasswordRecoveryEmailDeliveryTests.test_completed_reset_notification_contains_no_password_or_reset_token`
- All seven `AccountDeletionRuntimeMatrixTests` listed in the matrix.

New or extended frontend coverage:

- Forgot-password API failure maps to the localized accessible error state without retaining the submitted email.
- Reset success replaces the token-bearing browser history entry, does not render the token, and focuses the heading.
- `messages/passwordRecovery.test.ts` asserts all 21 recovery message values are non-empty in both English and Bulgarian.

Existing S1-E05 blocker/closure suites remain part of `apps.accounts`; the full
backend suite below includes them.

## RED/green result and production defects

The first focused test execution exposed only two incorrect new-test fixtures:
the project token generator expects a naive clock value in its test override,
and the default notification language is Bulgarian rather than English.  The
first focused frontend execution similarly had an incorrect message-key count
and an unnecessarily rejected promise fixture.  Those test expectations were
corrected.  No production RED failure occurred, so no service, model,
serializer, view, migration, or frontend production file was changed.

## Security and privacy checks

- Reset cache keys contain SHA-256 digests of normalized email/IP values; the
  focused test asserts the raw values are absent.
- Notification and audit metadata are asserted empty for recovery events; no
  password, raw token, or complete email is persisted there.
- Recovery failure logging is asserted not to include the submitted email.
- The reset URL is generated only by the delivery renderer, not stored in the
  durable event; it uses a fixed `/[locale]/reset-password` route.
- Blocked closure responses are stable `409` payloads and tests assert they do
  not disclose private job/property/hold details.  Repeated requests preserve
  the user and relevant historical rows.

## Commands and actual results

From `backend/`:

```text
python manage.py test apps.accounts.tests.test_password_recovery apps.accounts.tests.test_deletion_runtime_matrix apps.notifications.tests.test_password_recovery_email
PASS: 20 tests in 30.792s (SQLite test database)

python manage.py check
PASS: System check identified no issues.

python manage.py test apps.accounts --verbosity 0
PASS: 112 tests in 115.662s, skipped=6

python manage.py test apps.notifications --verbosity 0
PASS: 29 tests in 25.558s, skipped=1

python manage.py test apps.marketplace --verbosity 0
PASS: 198 tests in 259.641s, skipped=4

python manage.py test apps.feedback --verbosity 0
PASS: 42 tests in 103.450s

python manage.py test --verbosity 0
PASS: 521 tests in 541.615s, skipped=11
```

From `frontend/`:

```text
npm.cmd test -- --run "app/[locale]/forgot-password/page.test.tsx" "app/[locale]/reset-password/page.test.tsx" "components/AccountDeletionPanel.test.tsx" "messages/passwordRecovery.test.ts"
PASS: 4 files, 9 tests in 3.17s

npm.cmd run typecheck
PASS

npm.cmd run lint
PASS with 4 pre-existing react-hooks/exhaustive-deps warnings; 0 errors

npm.cmd test
Initial result: 91 tests passed, but lib/sentry-sanitize.test.ts could not resolve require-in-the-middle

npm.cmd ci
PASS: restored the lockfile installation (605 packages)

npm.cmd test
PASS: 25 files / 94 tests in 12.76s
```

Environment checks:

```text
docker compose up -d db redis; docker compose ps
PASS: postgres:16-alpine and redis:7-alpine running

docker compose exec -T db psql --version
PASS: PostgreSQL 16.14

docker compose exec -T redis redis-cli ping
PASS: PONG

docker compose run --rm -e DATABASE_URL=postgres://...@db:5432/airbnb_cleaners -e CACHE_URL=redis://redis:6379/2 backend python manage.py test apps.accounts.tests.test_closure_postgres --verbosity 2
PASS: 1 PostgreSQL row-lock closure test in 1.410s

docker compose run --rm -e DATABASE_URL=postgres://...@db:5432/airbnb_cleaners -e CACHE_URL=redis://redis:6379/2 backend python manage.py test apps.marketplace.tests.test_postgres_lifecycle_constraints apps.notifications.tests.test_reliability.PostgreSQLNotificationClaimTests --verbosity 1
PASS: 3 PostgreSQL constraint/claim tests in 3.464s

docker compose run --rm -e DATABASE_URL=postgres://...@db:5432/airbnb_cleaners -e CACHE_URL=redis://redis:6379/2 backend python manage.py test apps.accounts.tests.test_password_recovery apps.notifications.tests.test_password_recovery_email --verbosity 1
PASS: 13 PostgreSQL/Redis-backed recovery tests in 5.383s

Two separate Compose backend processes: Django cache set/get probe
PASS: second process read `shared`; the probe was then deleted
```

`codegraph sync .` completed and reported the index already up to date.
No frontend build was run.

## Remaining blockers and conclusion

None.  The targeted local evidence, PostgreSQL 16 row-lock/constraint evidence,
Redis shared-cache evidence, complete backend suite, and complete frontend
suite are green.  S1-D04 is approved and no matrix row is
`BLOCKED_BY_POLICY`.

The S1-E08 runtime-evidence slice is **complete**.  S1-E08 can honestly be
marked **Done**.
