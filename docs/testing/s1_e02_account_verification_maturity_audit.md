# S1-E02 Account Verification Maturity Audit

**Audit date:** 2026-07-21  
**Snapshot:** before S1-E02 production-code changes (`0cf4ff4`)
**Policy:** [ADR-0002](../adr/0002-contact-based-verification.md)

## Result

The feature was partially built and its real transition path was disabled by a
hard-coded signup shortcut. Persisted states and many marketplace gates exist,
but signup wrote `approved`/`verified`, transition writes were spread through
views and Django admin, notifications were not idempotent, and important
connection/agency/private-profile service boundaries lacked eligibility checks.
The owner decision changes the former manual-only approval contract: confirmed
email now triggers automatic contact reconciliation when phone is not required.

## Post-implementation maturity matrix

This completion pass preserves the original pre-code matrix below as audit
evidence. “Built” here means the owner-approved interim contract is present;
it does not claim completion of the S1-D02 phone/manual verification policy.

| Requirement | Final classification | Implemented evidence |
|---|---|---|
| Contact/account/cleaner predicates | Built | Timestamp and stored-state predicates are in `backend/apps/accounts/models.py:104-131`; genuine-evidence filtering is at `:33-34`. |
| Safe signup initialization | Built | `backend/apps/accounts/serializers.py:271-341` creates pending state first and invokes reconciliation only after persistence. |
| Configuration truth table and guards | Built | `backend/config/verification.py:15-125` validates all modes, guarded windows, intake pause, runtime expiry, and the pre-existing fake-email switch; settings/default wiring is at `backend/config/settings.py:53-78,255-274`. |
| Evidence exclusion | Built | Restricted one-to-one ledger is at `backend/apps/accounts/models.py:179-213`; creation is within reconciliation at `backend/apps/accounts/services.py:145-174`; the manager filter is at `backend/apps/accounts/models.py:33-34`. |
| Atomic account/cleaner reconciliation | Built | User-then-cleaner locking, forward-only transitions, deterministic audit, and on-commit notification dispatch are in `backend/apps/accounts/services.py:124-250`. |
| Reject and suspend semantics | Built | Expected-state, reason, restricted note, and transition rules are centralized at `backend/apps/accounts/services.py:253-376`. Restoration is deliberately absent. |
| Honest and protected API | Built | Protected fields and the reconciliation/reject/suspend/history actions are in `backend/apps/accounts/views.py:324-477`; ordinary status projection is in `backend/apps/accounts/serializers.py`. The old `/approve/` route is absent. |
| Django admin protection | Built | Account, cleaner, and pilot-ledger transition/evidence fields are read-only in `backend/apps/accounts/admin.py:46-96`. |
| Notification idempotency | Built | Nullable unique key is at `backend/apps/notifications/models.py:25-29`; get-or-create dispatch is at `backend/apps/notifications/services.py:12-60`; transition keys are emitted from `backend/apps/accounts/services.py`. |
| Authorization hardening | Built | Stored eligibility is enforced at connection/message, favourite-host, private-cleaner-profile, invitation/acceptance, and delegation boundaries in `backend/apps/connections/services.py`, `backend/apps/marketplace/services.py`, and `backend/apps/accounts/views.py`. Existing application/offer/property/job/calendar gates remain in place and are regression-covered. |
| Admin and user UI | Built | Separate states and honest policy/disclaimer copy are rendered by `frontend/components/VerificationStatusSummary.tsx:15-95` and the admin workflow at `frontend/app/[locale]/admin/page.tsx:62-574`; BG/EN contracts live in both message catalogs. |
| Configuration/transition/authorization tests | Built | `backend/apps/accounts/tests/test_verification_configuration.py`, `test_contact_verification.py`, and `test_verification_authorization.py` cover the truth table, invalid modes, rollback, protected writes, and authorization gaps. |
| Frontend behavior tests | Built | `frontend/components/VerificationStatusSummary.test.tsx` and `frontend/app/[locale]/admin/page.test.tsx` cover honest copy, state separation, localization parity, dialogs, private history, and endpoint payloads. |
| PostgreSQL concurrency target | Built and verified | `backend/apps/accounts/tests/test_contact_verification_postgres.py:20-209` is a PostgreSQL-only `TransactionTestCase` target; all five tests passed against PostgreSQL 16. SQLite skips are not counted as concurrency evidence. |
| Phone OTP and phone recovery | Blocked by S1-D02 | The flag and timestamps stop new advancement, but no provider or OTP workflow is invented. |
| Manual cleaner evidence/negative outcomes/re-review/retention | Blocked by S1-D02 | No document upload, evidence checklist, cleaner reject/suspend/restore, retention, or re-review workflow was added. |
| Agency verification | Blocked by S1-D02 | Existing agency/account eligibility is enforced, but no agency evidence standard is invented. |

## Requirement maturity matrix

The references in this pre-change matrix resolve against audit checkpoint
`0cf4ff4`; the post-implementation matrix above references the final tree.

| Requirement | Classification | Current implementation and exact evidence | Required S1-E02 change |
|---|---|---|---|
| Persist account states and contact timestamps | Built | `backend/apps/accounts/models.py:45-76` stores pending/approved/rejected/suspended, approval metadata, and email/phone timestamps. | Add explicit timestamp predicates; protect all transition fields. |
| Persist cleaner eligibility state | Partially built | `backend/apps/accounts/models.py:158-194` stores pending/verified/rejected/suspended; `:219-226` exposes the legacy predicate and public filter. | Define the interim meaning, allow only pending-to-eligible reconciliation, and leave negative cleaner policy blocked. |
| Safe-base-state signup | Disabled for testing | `backend/apps/accounts/serializers.py:211-244` creates the user as approved and the cleaner as verified. | Create pending records first and call one atomic initializer. |
| Email confirmation persistence | Built | Signup verifies the email-code record in `backend/apps/accounts/serializers.py:268-292`; legacy confirmation writes `email_verified_at` in `backend/apps/accounts/views.py:147-149`. | Reconcile from the stored user timestamp and make legacy confirmation use the service. |
| Email confirmation automatically approves under interim policy | Changed by owner decision | `backend/apps/accounts/views.py:291-303` currently requires an admin approve action; older docs said email granted no rights. | Replace with automatic contact reconciliation and document the limited claim. |
| Phone contact requirement | Missing | `phone_verified_at` exists at `backend/apps/accounts/models.py:76`; no OTP provider or reconciliation policy exists. | Add the flag/predicate and stop new advancement when enabled; do not implement OTP. |
| Full-verification predicate | Missing | No predicate distinguishes full email-plus-phone confirmation. | Add configuration-independent `is_fully_verified`. |
| Configuration and guarded bypass | Missing | `backend/config/settings.py` has `env_bool` but no approval/cleaner/phone/bypass contract. | Add safe defaults, truth table, startup/runtime validation, warning, and stable expired-window error. |
| Evidence exclusion | Missing | No pilot ledger or generic test/demo evidence marker exists in account, audit, or reporting models. | Add restricted one-to-one ledger and exclusion selectors; never clear it implicitly. |
| Atomic reconciliation and row locking | Missing | Account writes occur directly in views (`backend/apps/accounts/views.py:291-326`) and admin (`backend/apps/accounts/admin.py:48-58`). | Lock User then CleanerProfile, make forward-only/idempotent transitions, audit, and notify on commit. |
| Reject and suspend semantics | Partially built | Admin endpoints directly overwrite any state at `backend/apps/accounts/views.py:308-326`; suspend has no audit. | Require expected state/reason, restrict transitions, add conflict/no-op semantics and audit metadata. |
| Restoration | Blocked by S1-D02 | No supported account/cleaner restoration contract. | Keep blocked; do not infer policy. |
| Cleaner rejection/suspension/re-review/evidence | Blocked by S1-D02 | Model choices exist at `backend/apps/accounts/models.py:158-163`, but no approved operational contract. | Do not expose new transitions or evidence storage in S1-E02. |
| Protected API fields | Partially built | Non-admin account PATCH blocks a subset at `backend/apps/accounts/views.py:283-288`; cleaner PATCH blocks only non-admins at `:353-358`; serializers expose status fields at `backend/apps/accounts/serializers.py:53` and `:337`. | Reject protected fields for every generic PATCH, including admins, with stable 403 code. |
| Honest reconciliation API | Missing | Misleading `/approve/` action is implemented at `backend/apps/accounts/views.py:290-303`. | Replace it with `/reconcile-verification/`, `changed`, and stable 409 prerequisite response. |
| Restricted review history | Missing | Audit rows are written for approve/reject but there is no account review-history endpoint (`backend/apps/accounts/views.py:291-319`). | Add admin-only projection including internal notes; keep it out of ordinary serializers. |
| Django admin protection | Partially built | `backend/apps/accounts/admin.py:24-56` permits direct account-status editing; cleaner status is editable at `:69-77`. | Make transition/evidence fields read-only and expose safe status summaries/history. |
| Frontend admin workflow | Partially built | `frontend/app/[locale]/admin/page.tsx:102-145` calls approve/reject and `:300-360` renders coarse state controls. | Add reconciliation/reject/suspend workflow and separate status/evidence/audit views. |
| Frontend user status | Partially built | `frontend/app/[locale]/app/page.tsx:17-136` and `frontend/features/cleaner/CleanerDashboard.tsx:1612,1878-1886` distinguish account from legacy cleaner status only. | Show email, phone, contact, account, marketplace, and full states with honest BG/EN copy. |
| Audit transition evidence | Partially built | Approve/reject write minimal audit events at `backend/apps/accounts/views.py:297-318`; suspend writes none. | Centralize deterministic effective-change events with actor, outcome, reason, note, and previous/next states. |
| Idempotent transition notifications | Missing | `backend/apps/notifications/services.py:12-27` always creates a row; `Notification` has no dedupe field at `backend/apps/notifications/models.py:7-31`. | Add a nullable unique key and on-commit dispatch only for effective transitions. |
| Public cleaner publication | Built | `backend/apps/accounts/views.py:365-381` uses `CleanerProfile.public_marketplace_eligible_filter()` from `backend/apps/accounts/models.py:222-226`. | Preserve stored-state filter; update public terminology/tests. |
| Private cleaner profile access | Partially built | Any host receives the private serializer queryset at `backend/apps/accounts/views.py:343-350`. | Restrict private data to admin, self, and eligible active-agency membership; hosts use public serializer. |
| Connections and messages | Missing | Request/accept/message services at `backend/apps/connections/services.py:20-176` validate relationship state but not both participants' persisted eligibility. Shared detail alone checks requester at `backend/apps/connections/views.py:158-168`. | Enforce both participants for new request, acceptance, and message sends; retain safe reads/cleanup. |
| Favourites | Partially built | Target eligibility exists at `backend/apps/marketplace/services.py:61-75`; host eligibility is only in the view at `backend/apps/marketplace/views.py:1204-1213`. | Enforce host eligibility inside the service; retain historical reads. |
| Applications | Built | `backend/apps/marketplace/services.py:503-524` checks active/approved and cleaner verification; selectors hide opportunities at `backend/apps/marketplace/selectors.py:25-43`. | Regression-test the expanded role/status matrix. |
| Offers and acceptance | Built | Host and cleaner gates exist at `backend/apps/marketplace/services.py:903-960,1067-1102`. | Regression-test suspended/rejected/contact-state cases. |
| Assignment-producing transitions | Built | Acceptance checks eligibility before creating one assignment at `backend/apps/marketplace/services.py:586-649,1067-1151`; delegation checks member approval/verification at `:1197-1244`. | Require active agency at the service boundary and add race tests. |
| Agency invitations and membership | Partially built | Invitation creation/acceptance at `backend/apps/accounts/views.py:444-537` does not recheck agency eligibility; pending cleaners can accept. | Require active approved agency on create/accept; permit pending-cleaner onboarding but deny rejected/suspended/inactive cleaners. |
| Property and job creation/publication | Built | Property checks are in `backend/apps/properties/views.py:197-221,262-268`; job creation/publication checks are in `backend/apps/marketplace/views.py:684-707,822-824` and service `backend/apps/marketplace/services.py:125-133,198-204`. | Regression-test persistent state at service boundaries; avoid unrelated refactoring. |
| Calendar opportunity visibility | Built | Calendar endpoints require approved actors at `backend/apps/marketplace/views.py:299-322`; open-work predicates include cleaner verification at `:272-278`; base property calendar checks are in `backend/apps/calendars/views.py:38`. | Add explicit ineligible-role matrix; preserve safe historical calendar records. |
| Historical access | Built | Marketplace selectors retain participant history while current opportunities require eligibility (`backend/apps/marketplace/selectors.py:25-43,120-163`); favourites and connections retain safe records. | Preserve reads while blocking new writes. |
| Account deletion | Built | `backend/apps/accounts/services.py:16-46` blocks deletion with active jobs/assignments and preserves protected history. | Verify suspension/evidence ledger do not weaken deletion blockers. |
| PostgreSQL concurrency proof | Missing | No S1-E02 `TransactionTestCase` covers simultaneous verification/admin transitions. | Add PostgreSQL-only lock/race tests; do not treat SQLite threads as proof. |

## Read/write inventory and disposition

| Surface | Current read/write | Audit conclusion |
|---|---|---|
| Account state | Model predicate and broad view/service checks; direct writes in signup, user actions, model/admin helpers. | Centralize writes; retain stored-state reads. |
| Email/phone timestamps | Email timestamp is written by signup/legacy confirmation; phone is stored but unused. | Reconciliation reads persistent timestamps; phone provider deferred. |
| Cleaner state/publication | Public queryset is correct; private serializer and admin writes are too broad. | Preserve publication filter, restrict private access and writes. |
| Connections/messages | Relationship-only write checks. | Confirmed service-boundary security gap. |
| Favourites | Target checked in service; host only in view. | Confirmed service-boundary gap. |
| Applications/offers/assignments | Persisted eligibility checks mostly present. | Keep and regression-test; add agency-active delegation check. |
| Agency invitations/membership | Contact matching and membership state exist; current agency/user eligibility incomplete. | Harden create/accept only; pending cleaner onboarding remains allowed. |
| Properties/jobs/calendar | Approved-state checks are present; cleaner open-work check includes verification. | Regression-test; preserve history and cleanup. |
| Suspension/rejection | Direct unguarded overwrites, incomplete audit. | Replace with expected-state atomic services; no restore. |
| Audit/notifications | Partial audit, no transition notification dedupe. | Add restricted metadata and deterministic keys. |
| Evidence/reporting | No marker/query exclusion. | Add immutable restricted ledger and selectors. |

## Confirmed implementation gaps

1. Hard-coded promoted signup state prevents genuine transition evidence.
2. No explicit policy/configuration validator or guarded pilot bypass.
3. No atomic, row-locked, idempotent reconciliation/transition service.
4. Direct generic/admin status mutation can bypass transition semantics.
5. No evidence-exclusion ledger or notification deduplication key.
6. Missing connection/message participant gates, favourite host service gate,
   agency eligibility checks, and private cleaner-profile restriction.
7. Admin and user UI lack separate contact/full/marketplace states and honest
   interim wording.
8. No PostgreSQL S1-E02 concurrency evidence.

## Intentionally blocked or deferred

- Phone OTP provider and security/recovery policy.
- Manual cleaner evidence standard and identity-document handling.
- Cleaner negative outcomes, restoration, re-review, and retention.
- Agency verification standard.
- Broader S1-E01 privacy refactoring beyond the minimum private-profile access
  correction identified above.
