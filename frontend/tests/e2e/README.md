# Agency E2E prerequisites

The Playwright suite validates browser behavior against a separately running
frontend and backend. It does not create production-like accounts itself.

Start the services, then provide a disposable, seeded agency account:

```powershell
$env:E2E_BASE_URL = "http://127.0.0.1:3000"
$env:E2E_AGENCY_EMAIL = "agency-e2e@example.test"
$env:E2E_AGENCY_PASSWORD = "Password123!"
$env:E2E_CLEANER_EMAIL = "cleaner-e2e@example.test"
$env:E2E_PENDING_AGENCY_APPLICATION_ID = "123" # optional selection journey
$env:E2E_AGENCY_MEMBER_NAME = "Cleaner E2E"      # optional selection journey
npm.cmd run test:e2e
```

The seeded agency must be active, approved, contact-eligible, profile-complete,
and have an active eligible cleaner member. The optional application must be a
pending application owned by that agency. Use only disposable local/test data.

Browser binaries are installed separately with `npx.cmd playwright install chromium`.
The Stage 1 release gate still requires the PostgreSQL concurrency evidence,
notification-runtime evidence, and the complete seeded agency/host/cleaner
journeys described in `docs/S1_D05_FULL_AGENCY_PARITY.md`.
