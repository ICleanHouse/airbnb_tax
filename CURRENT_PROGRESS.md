# Current Progress Handoff

Updated: 2026-07-29.

S1-D05 is now open-live under [ADR-0003](docs/adr/0003-open-live-agency-recovery-and-three-party-reviews.md).
The older safe-409 recovery statements are historical; the only temporary
boundary is the fail-closed `AGENCY_LIVE_RECOVERY_ENABLED` rollout flag.
S1-E05 remains partially complete pending PostgreSQL concurrency and browser
evidence. S1-E06 runtime verification follows acceptance.

Implementation note (2026-07-27): S1-D05 now has a target-bound invitation
contract, agency readiness projection, member-bound new assignments,
agency-accountable recovery, `/agency` workspace/routing, and agency-safe
notifications. It is not a live-release completion: S1-E02 phone verification,
cleaner availability, PostgreSQL concurrency evidence, browser E2E, and
Redis/Celery/provider smoke still gate launch. See
[S1-D05 full agency parity](docs/S1_D05_FULL_AGENCY_PARITY.md).

This is a concise resume point, not a historical changelog. Detailed domain
state belongs in [TGN.md](TGN.md), Stage 1 work in
[docs/STAGE_1_SOFIA_PILOT_PLAN.md](docs/STAGE_1_SOFIA_PILOT_PLAN.md), and
implementation proof in `docs/testing/`.

Codex repository navigation now uses CodeGraph as described in
[AGENTS.md](AGENTS.md#codegraph-workflow-canonical). The local index is
machine-specific and should be checked/refreshed at session start; it does not
change product or release authority.

## Current Stage 1 state

- **S1-D01 — Done.** The project owner approved the Stage 1 charter: Sofia-only
  launch; hosts with 1–20 properties as one primary segment; full
  launch-critical agency parity; verified email plus phone before live access;
  role-ready activated users as North Star; and a 90-day product-led,
  descriptive observation period. Candidate interviews and competitor desk
  research are deferred. See
  [S1-D01 Stage 1 charter](docs/S1_D01_STAGE_1_CHARTER.md).
- **S1-D02 — Done.** The owner approved automatic contact eligibility for
  every role: confirmed email, one unique verified EEA phone, and a private
  self-declared birth date proving 18+. There is no manual identity, reference,
  interview, trial-job, company-registry, or quality gate. The visible
  “Verified” badge is scoped to email and phone confirmation. See the
  [approved S1-D02 policy](docs/S1_D02_CONTACT_ELIGIBILITY_POLICY.md).
- **S1-E05 — Partially complete by accepted ADR.** Direct host/cleaner recovery
  is implemented: counterpart-consented rescheduling, private attendance
  incidents, host-authorized draft replacements, private disputes, account
  deletion blockers, and an operator queue. Agency-backed recovery remains
  intentionally unsupported and returns a safe `409`; do not add parity without
  a new approved decision. Evidence:
  [direct recovery workflows](docs/testing/s1_e05_recovery_workflows.tdd.md).
- **S1-E10 — In progress; implementation complete.** The Geoapify-backed
  private geocoding API now includes its 24-hour HMAC-keyed normalized-result
  cache, 1,000/day aggregate outbound-call cap, 80%/100% idempotent owner-email
  alerts, 12-month cleanup, production configuration validation, BG/EN privacy
  route, links and private-picker regressions. The project owner has recorded
  the DPA/terms/free-plan decision; production enablement remains blocked only
  until the configured alert address and other server-only production settings
  are present. The authenticated
  restricted local browser network trace passed on 2026-07-29 and remains
  outside Git. The
  complete contract and provider review are in
  [S1-E10 map and geocoding capability](docs/S1_E10_MAP_GEOCODING_CAPABILITY.md).
- **S1-E02 — In progress.** Email-based interim contact access is implemented.
  The approved-target maturity audit was refreshed on 2026-07-23 with the
  implementation contract, gap matrix, external blockers, and six delivery
  batches. The target still needs an EEA SMS/provider decision, phone OTP,
  normalized-number reservation/transfer, all-role private birth-date handling,
  contact-change recovery, owner-admin restoration, seven-day pending expiry,
  lifecycle-aligned cleanup, and the scoped badge. See the
  [refreshed S1-E02 maturity audit](docs/testing/s1_e02_account_verification_maturity_audit.md),
  [S1-D02](docs/S1_D02_CONTACT_ELIGIBILITY_POLICY.md) and
  [ADR-0002](docs/adr/0002-contact-based-verification.md).
- **S1-E06 — Implemented; runtime evidence pending.** The versioned notification
  contract, durable event/delivery/attempt records, post-commit dispatch,
  retry-safe localized email, recovery wiring, operator reminders, final-failure
  alerts, health API/admin views, and safe frontend routing are implemented.
  SQLite/backend and frontend checks pass. PostgreSQL 16 concurrency and a live
  Redis/Celery/provider smoke remain unverified because those local services are
  unavailable; do not mark the item Done until those gates pass. Evidence:
  [S1-E06 TDD record](docs/testing/s1_e06_notification_reliability.tdd.md).
- **S1-E07 — Done.** Safe localized return routing, guest Connect recovery,
  terminal-status containment, locked/error accessibility, deterministic
  local-only E2E fixtures, role/status and notification browser coverage are
  complete. The full Django suite passed (472 tests, 9 skipped) and the seeded
  Playwright suite passed (10 tests, no skips). See
  [S1-E07 evidence](docs/testing/s1_e07_conversion_routing.tdd.md).
- **S1-D04 — Done.** The owner-approved publication, retention and Geoapify
  processor record is represented in code: opaque public cleaner UUIDs, a
  14-day pause grace, retention holds, atomic closure/anonymization, bounded
  cleanup, a fail-closed production guard, approved terms/DPA record, and
  restricted local runtime evidence. Production Geoapify remains disabled
  until server-only alert-recipient configuration is set; S1-R01's broader
  legal-policy surfaces remain separate.
- **S1-E08 — Partially complete.** Generic throttled self-service password
  recovery, localized recovery UI, reset-completion notification, and safe
  closure/anonymization foundations are implemented. The complete runtime
  evidence matrix remains outstanding. See
  [S1-E08 evidence](docs/testing/s1_e08_account_recovery.tdd.md).

## Owner decisions still needed

- Select the EEA SMS provider and implement S1-E02 under the approved S1-D02
  policy; finish S1-D05's full agency launch path before dependent live-
  marketplace work begins.
- Re-baseline Gate D, instrumentation, and the final readout around the approved
  product-led descriptive model before public launch.
- Configure `GEOAPIFY_USAGE_ALERT_EMAIL` and the remaining server-only
  Geoapify production settings in the production secret store before enabling
  provider traffic; never place the recipient address in Git.
- Keep the v1 no-payments boundary unchanged unless the business owner opens a
  monetization phase; see `docs/monetization/`.

## Start-here documents

1. [AGENTS.md](AGENTS.md) for repository rules and the required read order.
2. [TGN.md](TGN.md) for domain graph, routes, state machines, and invariants.
3. [Stage 1 plan](docs/STAGE_1_SOFIA_PILOT_PLAN.md) for tracker and acceptance
   criteria.
4. The relevant ADR and TDD evidence before changing a completed workflow.

## Local verification

From `backend/`:

```powershell
python manage.py check
python manage.py test
```

From `frontend/`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

Do not run the frontend build while `npm.cmd run dev` is using the same
`frontend/.next` directory. Keep secrets in gitignored environment files; never
place a provider key in frontend configuration.
