# Current Progress Handoff

Updated: 2026-07-22.

This is a concise resume point, not a historical changelog. Detailed domain
state belongs in [TGN.md](TGN.md), Stage 1 work in
[docs/STAGE_1_SOFIA_PILOT_PLAN.md](docs/STAGE_1_SOFIA_PILOT_PLAN.md), and
implementation proof in `docs/testing/`.

## Current Stage 1 state

- **S1-E05 — Partially complete by accepted ADR.** Direct host/cleaner recovery
  is implemented: counterpart-consented rescheduling, private attendance
  incidents, host-authorized draft replacements, private disputes, account
  deletion blockers, and an operator queue. Agency-backed recovery remains
  intentionally unsupported and returns a safe `409`; do not add parity without
  a new approved decision. Evidence:
  [direct recovery workflows](docs/testing/s1_e05_recovery_workflows.tdd.md).
- **S1-E10 — In progress.** The Geoapify-backed private geocoding API and
  frontend fallback are implemented. Production enablement is blocked on the
  owner/privacy approval, privacy-notice update, and an authenticated browser
  network trace. The complete contract and provider review are in
  [S1-E10 map and geocoding capability](docs/S1_E10_MAP_GEOCODING_CAPABILITY.md).
- **S1-E02 — In progress.** Email-based interim contact access is implemented;
  phone OTP, manual evidence review, negative cleaner outcomes/restoration,
  re-review, retention, and agency-verification policy remain blocked by S1-D02.
  See [ADR-0002](docs/adr/0002-contact-based-verification.md).
- **S1-E06 — Implemented; runtime evidence pending.** The versioned notification
  contract, durable event/delivery/attempt records, post-commit dispatch,
  retry-safe localized email, recovery wiring, operator reminders, final-failure
  alerts, health API/admin views, and safe frontend routing are implemented.
  SQLite/backend and frontend checks pass. PostgreSQL 16 concurrency and a live
  Redis/Celery/provider smoke remain unverified because those local services are
  unavailable; do not mark the item Done until those gates pass. Evidence:
  [S1-E06 TDD record](docs/testing/s1_e06_notification_reliability.tdd.md).

## Owner decisions still needed

- Complete S1-D01, S1-D02, and S1-D05 before dependent Stage 1 work begins.
- Approve Geoapify as the precise-location processor/recipient and record the
  privacy and budget decisions before production use.
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
