# S1-E08 account recovery and safe deletion — maturity audit

**Date:** 2026-07-28  
**Method:** read-only source inspection, existing tests/policies, and focused
CodeGraph navigation. This audit makes no production-code change.

## Evidence and navigation

CodeGraph was current at audit start (`codegraph status .`: 330 files, 4,490
nodes, 11,514 edges). Focused analysis covered authentication entry points,
the existing deletion service and callers, notifications and delivery
infrastructure, frontend login/deletion surfaces, and connected tests. Source
inspection remains the authority for the findings below.

## Current state

| Area | Status | Evidence and finding |
| --- | --- | --- |
| Session login/logout and CSRF bootstrap | Implemented | `backend/apps/accounts/views.py:263-333` exposes public CSRF/login and authenticated logout/me; `frontend/app/[locale]/login/page.tsx:23-45` uses `apiFetch` and the CSRF endpoint. |
| Password storage and login validation | Implemented | The custom Django user uses `set_password`; login authenticates normalized email/password in `backend/apps/accounts/serializers.py:412-429`. Django password validators are not currently exercised by a recovery confirmation route. |
| Password-reset request/confirm APIs | Missing | `backend/apps/accounts/urls.py` has no reset endpoints and CodeGraph found no reset service, token use, or reset test. |
| Reset token facility | Missing for this purpose | `apps/accounts/tokens.py` contains email-confirmation token use; no password-reset token integration exists. Django's `PasswordResetTokenGenerator` is the policy-neutral proven choice. |
| Public reset-request abuse controls | Missing | No reset-specific throttle or normalized-email/IP cache keys exist. Existing API throttles are feature-specific, so a configurable shared-cache limiter is required. |
| Reliable reset email/delivery | Missing | S1-E06 has durable event/delivery/attempt processing in `backend/apps/notifications/services.py:115-211`, but no password-reset event contract/template. |
| Password-reset-completed notification | Missing | The notification registry has no reset-completed event. It can be added with a safe, empty metadata allowlist and idempotent occurrence key. |
| Localized forgot/reset UI | Missing | Login has no recovery link (`frontend/app/[locale]/login/page.tsx:48-99`); BG/EN message dictionaries and locale routes are already available. |
| Operator recovery fallback | Partially implemented | The approved S1-D03 support destination/hours contract exists in `docs/S1_D03_LIFECYCLE_SUPPORT_POLICY.md` D03-16, but recovery has no explicit public fallback copy, rehearsal, or audit action. |
| Active-obligation deletion blocking | Implemented | `account_deletion_blocker` checks actionable jobs, active assignments, pending replacements and open disputes (`backend/apps/accounts/services.py:746-782`); `MeView.delete` maps the stable error to 409 (`views.py:323-333`). |
| Protected-history deletion support route | Partially implemented | Existing job/assignment/application history returns `account_deletion_requires_support` with the approved channel/hours (`services.py:784-799`). Connections, messages, notifications, audit records, agency obligations, incidents and reschedules are not explicitly classified by that single predicate. |
| Atomic deletion/no-history behavior | Implemented with a gap | `delete_account_permanently` locks the user and checks before mutation (`services.py:808-824`); no-history hard deletion is covered by `test_deletion_blockers.py:58-70`. It deletes connections before user deletion, so the S1-E08 preservation requirement needs the policy-neutral protected-history predicate extended before any deletion can happen. |
| Frontend blocked-deletion support UI | Partially implemented | `frontend/components/AccountDeletionPanel.tsx:60-109` localizes active/history messages and consumes safe support fields, but does not provide an explicit semantic support link/action or focused status heading after failure. |
| Marketplace history protections | Implemented in core records | Jobs, assignments, lifecycle events, disputes, updates, replacements and immutable delegated-member history are protected by S1-E05/ADR-0001. See `docs/adr/0001-turnover-lineage-recovery.md` and `backend/apps/marketplace/models.py:403-479`. |
| Retention/anonymization execution | Policy-blocked | S1-D04 leaves cross-domain retention policy unapproved in `docs/STAGE_1_SOFIA_PILOT_PLAN.md:722-789`. No de-identification, tombstone, purge, or historical rewrite may be implemented in S1-E08. |
| PostgreSQL reset-confirmation concurrency proof | External-runtime-blocked | New confirmation code can be transactionally serialized, but a PostgreSQL 16 multi-connection test cannot be called passed until a PostgreSQL environment is available. |

## History and counterpart inventory

The audit found protected domain records across marketplace jobs/lineages,
assignments and immutable agency member delegation, applications, replacement
requests, reschedules, incidents, disputes and append-only updates/lifecycle
events. Feedback reviews, connections/messages, notifications/deliveries and
security audit rows are also participant/counterpart evidence and must not be
deleted as a side effect of a self-service request. The existing `User` foreign
key graph and the active-history policy mean an eligible hard-deletion path is
allowed only for an account with no protected history; S1-D04 decides the
future closed-account retention/anonymization mechanism.

## Requirement classification and implementation batches

1. **Reset backend foundation (missing):** request/confirm serializers, Django
   password-reset token generator, generic public response, configurable
   normalized-email/IP rate limiting, safe audit events, and session invalidation.
2. **Reliable delivery (missing):** one reset-request email event and one
   password-reset-completed event through S1-E06; no token/password/email in
   notification metadata or logs. A test-only delivery capture boundary remains
   local/test-only.
3. **Recovery UI (missing):** localized forgot/reset pages, accessible
   validation/status handling, safe query parsing, history replacement after
   success, and explicit monitored-support fallback.
4. **Deletion hardening (partially implemented):** extend the existing single
   blocker service with safe categories for protected non-marketplace history;
   return only safe support fields; make the frontend support action explicit.
5. **Evidence (missing):** backend, component, browser, audit-redaction and
   PostgreSQL-gated concurrency coverage.

## Non-goals and blocker

This work must not implement phone verification, OAuth, SMS, identity policy,
payments, automated retention expiry, anonymization, history deletion, or
cross-domain field rewrites. S1-E08 can become **Partially complete** after
the recovery and deletion-support batches pass, but cannot be marked Done
until S1-D04 approves and implements the retention/anonymization contract.
