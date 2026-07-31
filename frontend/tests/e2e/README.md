# Agency E2E prerequisites

The Playwright suite validates browser behavior against a separately running
frontend and backend. It does not create production-like accounts itself.

Start the services, provide one disposable runtime-only password, and seed the
isolated S1-E07 records. The command is refused unless Django is in a local or
test debug environment. It never stores a password in the repository.

```powershell
$env:E2E_BASE_URL = "http://127.0.0.1:3000"
$env:E2E_PASSWORD = "choose-a-disposable-local-test-password"
Set-Location ..\..\backend
python manage.py migrate
python manage.py seed_s1_e07_e2e --password $env:E2E_PASSWORD --reset
Set-Location ..\frontend
npm.cmd run test:e2e
```

The command creates deterministic approved, pending, terminal-status and inactive
accounts, an eligible public cleaner, an approved agency with an active member,
a pending agency application, and valid/fallback in-app notifications. It also
creates a delegated, already-started `S1 E05 Recovery Browser` assignment for
the recovery journey. The seed retains protected recovery history and resets
only connections and in-app notifications belonging to its `s1e07-e2e-` users.

`s1-e05-agency-recovery.spec.ts` is an activation smoke test. Run it only in
an isolated local or staging environment, after migrations are applied and
with `AGENCY_LIVE_RECOVERY_ENABLED=true` supplied through the target runtime
configuration. It exercises the product UI end-to-end; do not substitute
direct API or admin calls. Do not point the command at a shared or production
database.

Browser binaries are installed separately with `npx.cmd playwright install chromium`.
The Stage 1 release gate still requires the PostgreSQL concurrency evidence,
notification-runtime evidence, and the complete seeded agency/host/cleaner
journeys described in `docs/S1_D05_FULL_AGENCY_PARITY.md`.
