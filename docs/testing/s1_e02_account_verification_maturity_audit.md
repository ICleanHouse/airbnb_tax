# S1-E02 Account Verification Maturity Audit

**Audit date:** 2026-07-23
**Audited tree:** `368900b`
**Target policy:** [S1-D02 Contact Eligibility and Account Safety Policy](../S1_D02_CONTACT_ELIGIBILITY_POLICY.md)
**Interim architecture:** [ADR-0002](../adr/0002-contact-based-verification.md)
**Status:** refreshed against the approved target; implementation has not started

## Capability

After S1-E02 is complete, a host, individual cleaner, agency representative, or
separately registered delegated member can create a safe pending account,
prove that they are 18 or older, confirm an email address and one unique EEA
mobile number, and automatically receive only the marketplace rights allowed by
persisted account and cleaner state. The repository owner can reject, suspend,
or restore access through audited services. Contact changes, abandoned pending
accounts, and public verification wording fail safely without creating identity
or service-quality claims.

## Result

The email-only interim slice is implemented and verified, but the approved
S1-D02 target is **not ready for live Stage 1 access**. `PHONE_VERIFICATION_REQUIRED`
still defaults to `False` (`backend/config/settings.py:54-60`), and there is no
phone challenge, provider adapter, normalized-number reservation, all-role
birth-date field, contact-change workflow, restoration action, pending-account
expiry task, or scoped public badge.

Two existing behaviors conflict directly with the approved target and must be
fixed before phone verification is enabled:

1. `UserSerializer` permits ordinary changes to `email` and `phone_number`
   (`backend/apps/accounts/serializers.py:51-91`), while `UserViewSet.update`
   protects timestamps but not those contact fields
   (`backend/apps/accounts/views.py:339-385`). A changed contact therefore does
   not clear its timestamp or lock persisted marketplace access.
2. An active approved agency can retrieve a member through the full
   `CleanerProfileSerializer` (`backend/apps/accounts/views.py:501-511`), which
   includes `birth_date` and `age`
   (`backend/apps/accounts/serializers.py:414-456`). S1-D02 restricts birth date
   to the account holder and owner-admin.

The next external dependency is the owner decision on an EEA SMS provider,
processor/privacy terms, and exact per-number, per-account, and per-IP daily
caps. No provider or cap is selected in this audit.

## Constraints

- Contact eligibility is email plus a unique verified EEA mobile number and a
  private self-declared birth date proving 18+ for every human role.
- Account state remains authoritative for marketplace access. Clearing a
  contact timestamp must be paired with an audited persisted-state transition;
  a runtime flag or UI-only lock is insufficient.
- Cleaner `verified` remains the stored contact-eligibility value only.
- Rejected accounts are terminal. Suspended accounts may be restored by the
  owner-admin to `approved` when all current prerequisites pass, otherwise to
  `pending`.
- Phone change keeps the old number reserved until the new number succeeds or
  the change is cancelled.
- OTPs are six numeric digits, single-use, hash-only, valid for 10 minutes,
  limited to five attempts, subject to a 60-second resend cooldown and approved
  daily caps, and removed within 24 hours after use or expiry.
- Phone-incomplete accounts receive one localized day-six warning and are
  deleted at day seven only when no protected marketplace, support, audit, or
  evidence dependency exists.
- The public badge is “Verified” / “Потвърден” only when both contact timestamps
  exist. Its accessible explanation must state that identity and service
  quality were not checked.
- No identity documents, references, interviews, trial-job evidence,
  company-registry evidence, or separate quality-verification registry belongs
  in this capability.

## Approved-target maturity matrix

Classifications are **Built**, **Partially built**, **Missing**, **Conflicting**,
or **External decision required**. “Built” describes the audited tree, not
release approval.

| Requirement | Classification | Current evidence and exact gap |
|---|---|---|
| Safe pending initialization and interim reconciliation | Built | Signup creates the account and cleaner profile in pending state and then invokes the row-locked reconciliation service (`backend/apps/accounts/serializers.py:270-337`; `backend/apps/accounts/services.py:126-252`). |
| Contact/full/marketplace predicates | Partially built | Email, phone, configured-contact, full-contact, and stored marketplace predicates exist (`backend/apps/accounts/models.py:104-146`). The account predicate does not recheck current contact timestamps after approval, so contact-change services must make account state authoritative. |
| Configuration and guarded bypass | Partially built | Truth-table and production-like bypass guards exist (`backend/config/verification.py:14-125`), but the safe deployed default remains the email-only interim mode and no provider-readiness validation exists. |
| Evidence exclusion | Built | The immutable bypass marker and genuine-evidence selector exist (`backend/apps/accounts/models.py:32-39,184-211`; `backend/apps/accounts/services.py:138-161`). |
| All-role private birth date and 18+ gate | Conflicting | Only cleaners are required and validated (`backend/apps/accounts/serializers.py:197,257-266`), and birth date is stored on `CleanerProfile` only (`backend/apps/accounts/models.py:268-269`). Host and agency signup skip the personal-information step (`frontend/features/signup/SignupPage.tsx:182-186,627-630,685-698`). Agency access to the full member serializer currently exposes the cleaner birth date. |
| EEA mobile parsing and normalization | Missing | `User.phone_number` is an unconstrained optional string (`backend/apps/accounts/models.py:59-65`); no E.164/EEA/mobile validator or phone-number dependency exists. |
| Cross-account number reservation and transfer | Missing | There is no normalized unique field or reservation record. The current user table cannot reserve the old and pending-new numbers simultaneously or perform an audited owner transfer. |
| Phone OTP challenge lifecycle | Missing | There is no SMS challenge model, provider adapter, request/verify/cancel API, password re-entry check, resend cooldown, daily cap, anti-enumeration response, or cleanup workflow (`backend/apps/accounts/urls.py:34-44` exposes only email signup confirmation and account routes). |
| Initial phone completion for every role | Missing | Signup has no phone state or payload and redirects directly to `/app` after account creation (`frontend/features/signup/SignupPage.tsx:239-255,471-488`). With phone required, reconciliation can leave a user pending, but the user has no route to satisfy the requirement. |
| Email and phone change safety | Conflicting | Generic account PATCH can change contact fields without clearing confirmation, suspending access, or reserving the old number (`backend/apps/accounts/serializers.py:51-91`; `backend/apps/accounts/views.py:339-385`). Dedicated authenticated contact-change services are absent. |
| Automatic reconciliation after phone confirmation | Partially built | The reconciliation service will advance a pending user when a phone timestamp already exists (`backend/apps/accounts/services.py:171-252`), but no supported workflow writes that timestamp. |
| Rejection and suspension | Partially built | Row-locked expected-state services exist (`backend/apps/accounts/services.py:255-371`), but the accepted reason set (`:19-29`) omits `age_requirement`, `account_integrity`, and `contact_security` from S1-D02 and includes interim-only categories in the human-decision validator. |
| Owner-admin restoration | Missing | Reconciliation explicitly refuses to restore suspended users (`backend/apps/accounts/services.py:163-169`); there is no restore service, route, UI action, notification, or concurrency test (`backend/apps/accounts/views.py:358-367,454-488`). |
| Private owner/admin birth-date access and correction | Missing | There is no canonical account birth-date projection. The cleaner profile permits self/admin editing, but it is also readable by an eligible agency member through the same serializer (`backend/apps/accounts/views.py:501-530`). |
| Day-six warning and day-seven safe expiry | Missing | No account task or scheduler exists. The reusable deletion blocker covers active work, recovery, disputes, and marketplace history (`backend/apps/accounts/services.py:406-459`), but pending expiry also needs explicit support/audit/evidence dependency checks and an idempotent warning marker. |
| OTP and lifecycle retention | Missing | No OTP data exists to clean. Account deletion writes an audit record and deletes the user (`backend/apps/accounts/services.py:468-484`), but there is no S1-D02 five-year structured-transition retention/de-identification implementation or legal-hold handling. |
| Scoped public contact badge | Missing | `fully_verified` is projected only on ordinary/admin user data (`backend/apps/accounts/serializers.py:40-94`). Public cleaner data has no badge boolean (`backend/apps/accounts/serializers.py:479-509`; `frontend/types/cleaner.ts:1-19`), and cleaner cards/modals render no badge (`frontend/components/CleanerProfileCard.tsx:37-70`; `frontend/components/CleanerProfileModal.tsx:123-189`). |
| Honest interim status UI | Built | The current status summary separates email, phone, configured contact, account, cleaner access, and full verification and avoids an identity claim (`frontend/components/VerificationStatusSummary.tsx:15-93`). Its interim copy must be replaced, not retained, when phone becomes required. |
| Admin status and decision UI | Partially built | Admin can reconcile, reject, suspend, and inspect restricted history, with separated states (`frontend/app/[locale]/admin/page.tsx:58-60,169-218,386-514`). Restoration, birth-date support visibility, phone reservation/transfer, expiry disposition, and approved reason categories are absent. |
| Delegated-member eligibility | Partially built | A delegated member is a separate cleaner account and current agency boundaries recheck stored eligibility, but there is no phone/age completion path for that account and the agency-readable serializer violates birth-date privacy. |
| Idempotent audit and notifications | Partially built | Interim account transitions emit deterministic audited events (`backend/apps/accounts/services.py:79-123,187-248`). Phone challenge, contact change, restore, day-six warning, safe-expiry exception, and transfer event contracts do not exist. |
| Automated and PostgreSQL evidence | Partially built | Interim truth-table, authorization, rollback, and five PostgreSQL race targets exist in `backend/apps/accounts/tests/`. There are no tests for phone uniqueness/reservation, OTP races and caps, contact changes, restoration, age privacy, expiry, badge semantics, provider failure, accessibility, or authenticated browser behavior. |

## Implementation contract

### Actors and surfaces

| Actor | Required surface |
|---|---|
| Pending host, cleaner, or agency representative | Authenticated activation surface to submit a private birth date where needed, add an EEA mobile number, request/resend an OTP, verify it, and understand the remaining expiry time |
| Delegated member | The same separately authenticated cleaner-account activation path; agency state never substitutes for member eligibility |
| Approved account holder | Dedicated email/phone change and cancellation endpoints; phone change requires password re-entry, reconfirmed email, and OTP on the new number |
| Repository owner-admin | Restricted restore, phone-transfer, expiry-exception, transition-history, and current birth-date support views |
| Anonymous/public user | A badge boolean and approved explanatory copy only; never contact values, timestamps, birth date, or internal transition data |
| Scheduler/operator | Idempotent day-six warning, day-seven disposition, and OTP cleanup jobs with observable counts and final-failure handling |

### States and transitions

- Initial account: `pending`; initial cleaner state: `pending`.
- Phone challenge: `pending -> verified`, `pending -> expired`,
  `pending -> cancelled`, or `pending -> locked` after five failed attempts.
- Pending account: `pending -> approved` through automatic reconciliation only
  after email, phone, and age prerequisites are stored.
- Approved contact change: `approved -> suspended` with `contact_security`
  before the changed contact can authorize new marketplace actions; successful
  re-verification and owner/system reconciliation return it to `approved`.
- Suspended restoration: `suspended -> approved` when current prerequisites
  pass, otherwise `suspended -> pending`. Rejected remains terminal.
- Pending expiry: a single day-six warning, then day-seven deletion only when
  the protected-dependency predicate is false; otherwise retain and create an
  owner-admin exception item.
- Phone transfer: owner-admin records source account, destination account,
  reason, note, and outcome under row locks; the unique reservation moves once.

### Data and interface implications

1. Add one canonical private `User.birth_date`. Backfill it from
   `CleanerProfile.birth_date`; keep the cleaner field as read-only
   compatibility during S1-E02 and do not drop it in the same release.
2. Add a phone-reservation model keyed by normalized E.164 number. A reservation
   belongs to one retained non-admin account and supports current,
   pending-change, released-by-deletion, and owner-transferred outcomes. This
   model is preferred over cross-column service checks because PostgreSQL must
   enforce uniqueness during concurrent signup, change, and transfer.
3. Add a hash-only phone-challenge model with purpose, user, reservation,
   expiry, attempt count, last-send time, used/cancelled timestamps, provider
   message reference, and minimized delivery status. Do not store the OTP.
4. Add provider-neutral request/verify/cancel services and a narrow SMS adapter.
   Provider calls occur after database commit; retries must not create a second
   logical challenge or bypass send caps.
5. Add dedicated endpoints for phone challenge, phone change, email change,
   account restore, owner transfer, and expiry exception. Generic user PATCH
   must reject direct email, phone, birth-date, and transition-field changes.
6. Split cleaner projections: self/owner-admin may receive private birth date;
   agency-member operational reads must use an explicit serializer without
   birth date or calculated age.
7. Expose a public boolean such as `contact_badge_eligible`, derived from both
   stored contact timestamps. Do not expose either timestamp publicly.
8. Add scheduled jobs for warning, expiry disposition, and challenge cleanup.
   Record deterministic occurrence keys, counts, skips, protected exceptions,
   provider failures, and request/task IDs without phone numbers or birth dates.

## Implementation batches

### Batch 0 — Provider and security decision (blocking)

- Select an EEA-capable SMS provider and approve its processor/privacy terms,
  data region/transfer position, retention, sender identity, delivery limits,
  cost ceiling, and production credentials owner.
- Approve exact daily sends per normalized number, account, and IP while
  retaining the fixed five-attempt and 60-second cooldown policy.
- Record the provider adapter contract, generic error behavior, webhook
  authentication if used, and outage fallback. No SMS key enters frontend
  configuration or source control.

**Exit:** a signed provider/privacy/rate-limit record exists and can be linked
from S1-E02.

### Batch 1 — Canonical age and phone domain foundation

- Add canonical private account birth date and a safe data migration from
  cleaner profiles.
- Add E.164 EEA-mobile parsing, reservation, challenge, and transition-audit
  models with database constraints.
- Align human-decision reason categories with S1-D02 while keeping automatic
  reconciliation reasons internal to their own services.
- Add model/service tests first, including PostgreSQL concurrent reservation
  and transfer cases.

**Exit:** data invariants and concurrency behavior pass without enabling phone
verification or changing public signup.

### Batch 2 — All-role signup and initial phone confirmation

- Require and server-validate private birth date for host, cleaner, and agency
  signup; delegated members inherit the cleaner-account path.
- Add phone collection and the authenticated request/resend/verify UI after the
  pending account exists.
- Send through the approved provider adapter, apply all caps, reconcile after
  successful verification, and localize every BG/EN state.
- Preserve the signup recovery allowlist: birth date, phone, OTP, tokens, and
  provider responses remain memory-only and empty after refresh.

**Exit:** every role can move from a safe pending base to contact eligibility;
underage submissions create no account/profile; provider failure leaves a
recoverable pending account.

### Batch 3 — Contact changes, recovery, uniqueness, and transfer

- Replace generic email/phone mutation with authenticated services that clear
  the relevant timestamp and lock persisted access atomically.
- Implement password-confirmed phone change with old-number reservation,
  pending-new reservation, cancellation, success, and owner-admin transfer.
- Implement email re-confirmation and ensure every role/action gate remains
  locked until reconciliation succeeds.
- Add conflict-safe, idempotent, and PostgreSQL race tests.

**Exit:** stale contact evidence cannot retain live marketplace rights and one
normalized phone cannot survive on two retained non-admin accounts.

### Batch 4 — Owner actions and abandoned-account lifecycle

- Add owner-admin restoration with `approved` versus `pending` outcome derived
  from current prerequisites.
- Add day-six warning, day-seven safe deletion, protected exception routing,
  and localized notifications.
- Extend deletion dependency checks to restricted support, audit, evidence, and
  legal-hold records; preserve history rather than cascade it.
- Add scheduler/runbook, idempotency, retry, and final-failure evidence.

**Exit:** restore and expiry transitions are auditable, repeat-safe, and do not
corrupt operational history.

### Batch 5 — Privacy projections, scoped badge, and retention

- Split self/admin versus agency-member cleaner serializers.
- Add the public contact badge boolean and render the approved EN/BG badge,
  tooltip/help text, and accessible description on the selected public cleaner
  surfaces.
- Remove/replace interim email-only launch copy when the production requirement
  is enabled.
- Implement used/expired challenge cleanup within 24 hours and the approved
  transition-history access/retention controls.

**Exit:** private age/contact data is visible only to the subject and
owner-admin, and the public badge cannot be mistaken for identity or quality
verification.

### Batch 6 — Release evidence and guarded rollout

- Run backend, frontend, localization, accessibility, and full authorization
  matrices plus PostgreSQL 16 concurrency targets.
- Capture provider sandbox/live smoke evidence, throttling/failure behavior,
  authenticated browser traces, scheduler evidence, and rollback rehearsal.
- Enable `PHONE_VERIFICATION_REQUIRED=True` only after every role and delegated
  member path passes. Existing interim users require an explicit migration or
  suspension/re-verification runbook; a flag change never silently rewrites
  them.

**Exit:** the complete S1-D02 acceptance matrix is linked and S1-E02 may move
from **In progress** to **Done**.

## Non-goals

- Identity documents, background checks, references, interviews, trial jobs,
  agency-registry review, insurance checks, or service-quality certification.
- Periodic calendar-based re-review.
- Birthday greetings, marketing use of birth date, or native survey storage.
- Advanced agency workflow parity beyond ensuring that each member satisfies
  this account-level eligibility contract.
- Removing the legacy cleaner `verified` state or dropping the existing cleaner
  birth-date column in the same delivery.

## Open questions and external blockers

| Item | Owner | Blocks |
|---|---|---|
| EEA SMS provider, processor/privacy approval, data-transfer position, retention, sender identity, cost ceiling, and credentials owner | Project owner/privacy reviewer | Batch 0 and provider integration |
| Exact per-number, per-account, and per-IP daily send caps | Project owner/security reviewer | Batch 0 and challenge services |
| Existing email-only user migration: proactive suspension/re-verification window versus individually staged contact completion | Project owner/operator | Production rollout in Batch 6 |
| Production scheduler ownership for day-six/day-seven/cleanup jobs | Project owner/operator | Batch 4 release evidence |
| Legal-hold representation and the exact de-identification mechanism for five-year transition history | Project owner/privacy reviewer | Batch 5 retention completion |

## Handoff

The approved target is now decomposed sufficiently for test-driven vertical
slices, but **direct provider implementation is blocked on Batch 0**. After the
owner records that decision, implementation should begin with Batch 1 using the
repository `tdd-workflow`, `security-review`, `database-migrations`, and
`verification-loop` lanes. Batches must not be collapsed into a single signup
rewrite.

The historical pre-interim audit below remains as traceability for checkpoint
`0cf4ff4`; its “blocked by S1-D02” labels describe the state before the
2026-07-23 policy approval and are not the current disposition.

## Historical requirement maturity matrix — checkpoint `0cf4ff4`

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

## Historical read/write inventory and disposition

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

## Historical confirmed implementation gaps at `0cf4ff4`

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

## Historical blocked/deferred disposition at `0cf4ff4`

At that checkpoint, phone OTP, restoration, retention, and the agency standard
were intentionally blocked pending S1-D02. The approved 2026-07-23 policy now
resolves the product contract: phone OTP, all-role age handling, account-state
negative outcomes/restoration, lifecycle retention, and the same contact-only
standard for agencies and delegated members are current S1-E02 work. Identity
documents, manual quality vetting, periodic re-review, and broader unrelated
S1-E01 privacy refactoring remain out of scope.
