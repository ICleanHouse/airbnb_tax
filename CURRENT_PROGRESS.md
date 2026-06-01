# Current Progress Handoff

Updated: 2026-06-01, after marketplace stickiness layer (profiles, notifications, direct offers, favourites) + Sentry sanitizer fix.

## Latest Work — Review-Based Marketplace Stickiness Layer

Roadmap Phases 1–3 implemented (browsable cleaner profiles + reviews → notification center → direct offers + favourites). Agency dashboard, in-app chat, payments, and iCal two-way sync remain deferred.

- **Phase 1 — Public cleaner profiles & reviews**:
  - `GET /api/accounts/cleaners/` directory (verified + approved only; `?city=&min_rating=&service_area=` filters) and `GET /api/accounts/cleaners/<id>/` detail + received reviews. Safe fields only — no email/phone/birth_date.
  - Shared components `RatingStars.tsx`, `CleanerProfileCard.tsx`, `CleanerProfileModal.tsx`; new `/cleaners` directory route; landing-page featured cleaners wired to the live endpoint. `PublicCleaner` / `CleanerReview` types in `lib/api.ts`.
- **Phase 2 — Direct offers + favourites (side by side with the open pool)**:
  - Reuses `CleanerApplication` via new `origin` field (`cleaner_applied` / `host_offered`). Migration `apps/marketplace/migrations/0003_cleanerapplication_origin_favouritecleaner.py`.
  - Services `offer_job` / `accept_offer` / `decline_offer` (guards + one-assignment invariant + sibling auto-reject). `offer` action on `CleaningJobViewSet`; `accept-offer` / `decline-offer` on `CleanerApplicationViewSet`. `FavouriteCleaner` model + `GET/POST/DELETE /api/marketplace/favourites/`.
  - Pending offers surface on the shared calendar as a gold `offer` item type (both roles).
  - Host: ♥ favourite toggle + "My cleaners" list + "Offer a job" → `JobOfferModal.tsx`. Cleaner: **Offers** tab with Accept / Decline + gold badge.
  - Tests: `apps/marketplace/tests/test_offers.py` (8 offer-service/API tests + favourite CRUD tests) — all pass.
- **Phase 3 — Notification center**:
  - `GET /api/notifications/`, `POST /api/notifications/<id>/read/`, `POST /api/notifications/read-all/`. Shared `NotificationBell.tsx` (polled) in host + cleaner topbars.
- **Sentry sanitizer fix**: recreated missing `frontend/lib/sentry-sanitize.ts` (`beforeSend` PII scrubber imported by the three Sentry config files). Sentry env vars now in gitignored `frontend/.env.local`. `npm.cmd run typecheck` passes clean.

## User Goal

Current work is focused on completing the cleaner signup flow. The production-hosting work remains available in the repo, but local development is currently using `.env`, manual Django/Next/Celery commands, Redis, and SQLite unless `DATABASE_URL` is explicitly enabled.

## Implemented In Repo

- Added production Compose stack: `docker-compose.prod.yml`.
- Added Caddy reverse proxy config: `deploy/Caddyfile`.
- Added production Dockerfiles:
  - `backend/Dockerfile.prod`
  - `frontend/Dockerfile.prod`
- Added deployment environment file: `.env.production`.
- Added helper scripts:
  - `deploy/start-production.ps1`
  - `deploy/open-firewall.ps1`
- Added deployment guide: `DEPLOY.md`.
- Added WhiteNoise static serving for Django with `DJANGO_DEBUG=false`.
- Added missing frontend API helper: `frontend/lib/api.ts`.
- Wrapped the admin page `useSearchParams` usage in `Suspense` so Next production builds do not fail on that route.
- Updated `.gitignore` to ignore `.env.production` and `.env.production.local` for future secret handling.
- Added user email-code confirmation before signup:
  - `SignupEmailVerification` stores hashed 6-digit codes and verification tokens.
  - `POST /api/accounts/signup/email-code/` sends a code.
  - `POST /api/accounts/signup/verify-email-code/` verifies the code and returns `email_verification_token`.
  - `send_signup_email_code` Celery task sends codes through Resend only.
  - Signup email HTML is rendered from `backend/apps/notifications/templates/notifications/signup_code_email.html`.
  - `.env.example` now includes `EMAIL_RESEND_APIKEY` and `EMAIL_RESEND_FROM_EMAIL`.
- Added `.env` loading from `settings.py` so manual Django and Celery runs read local environment values.
- Converted signup into a single React wizard at `/signup`:
  - Old step routes redirect to `/signup`.
  - Continue and Back update React state instead of navigating with full page loads.
  - Motion (`motion/react`) animates form panels between steps.
  - Progress tracking starts at `Choose account type`.
  - Draft signup state is persisted in `sessionStorage` for refresh recovery.
- Current signup flow:
  - Credentials and password validation.
  - 6-digit email code confirmation.
  - Choose account type.
  - Cleaner: personal information → location/service areas → native language → experience → availability → create account.
  - Host/agency: location/service areas → create account.
- Updated cleaner signup fields:
  - Birth date uses a compact dropdown-style calendar.
  - Sex uses selectable button options.
  - Native language uses selectable options, with an inline dropdown above the `Other` button.
  - Experience uses single-select button fields.
  - Availability captures full-time/part-time preference, broad preferred time slots, and optional weekly availability.
- Added backend signup/profile fields for cleaner availability:
  - `work_preference`
  - `preferred_time_slots`
  - `weekly_availability`
  - Migration: `backend/apps/accounts/migrations/0010_cleanerprofile_work_availability.py`
- Added cleaner dashboard/profile updates:
  - Profile categories are split into separate forms with one shared `Save changes` action at the bottom.
  - `Profile saved.` success state is shown near the shared save button and auto-hides after 5 seconds.
  - Profile image upload now opens a crop overlay (reposition + zoom slider + reset + confirm).
  - Location uses city-first district selection, with service areas managed through an `Add districts` overlay (city-scoped lists, drag-and-drop, and transfer controls).
  - Service areas and other languages are displayed as selected tag lists in profile forms.
  - Other languages uses a dedicated dual-list overlay with search and right-aligned `Done`.
  - Experience form includes driving-license and conditional own-car dropdowns.
  - Added a new cleaner profile section: `Extra services offered` with toggle switches.
- Added backend cleaner profile fields and migrations:
  - `other_languages` JSON field (migration: `backend/apps/accounts/migrations/0013_cleanerprofile_other_languages.py`).
  - `personal_preferences` JSON field for extra services (migration: `backend/apps/accounts/migrations/0014_cleanerprofile_personal_preferences.py`).
- Added logging/observability:
  - JSON backend/Celery logs with request IDs and automatic startup/request/task logging.
  - Read-only `AuditLog` admin for key business actions.
  - Sentry wiring for Django, Celery, and Next.js when DSNs are configured.

## Current Local Development Notes

- Ignore `.env.production` unless production Docker hosting is resumed.
- Use `.env` for local/manual PowerShell runs.
- `.env.example` is only a committed template; it is not used at runtime.
- For local SQLite, remove or comment out `DATABASE_URL`.
- For local Redis, use:

```dotenv
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
```

- Celery must be running for signup emails when Celery is installed:

```powershell
cd C:\Users\35987\Desktop\airbnb_tax\backend
python -m celery -A config worker --loglevel=info --pool=solo
```

- Restart both Django and Celery after changes to notification tasks, templates, or `.env`.
- For debugging, search technical logs by `request_id`; view business history at `/admin/core/auditlog/`.

## Verified

- Frontend signup wizard checks:

```powershell
cd C:\Users\35987\Desktop\airbnb_tax\frontend
npm run typecheck
npm run lint
npm run build
```

  - Typecheck passed.
  - Build passed.
  - Lint passed with two existing warnings in `frontend/app/admin/page.tsx` and `frontend/app/host/page.tsx`.

- Backend signup checks:

```powershell
python backend/manage.py check
python backend/manage.py makemigrations --check --dry-run
python backend/manage.py test apps.accounts.tests.test_auth_agency_consent.AccountAuthTests.test_cleaner_signup_saves_service_areas apps.accounts.tests.test_auth_agency_consent.AccountAuthTests.test_cleaner_signup_requires_work_preference apps.accounts.tests.test_auth_agency_consent.AccountAuthTests.test_cleaner_signup_requires_preferred_time
```

  - Django system check passed.
  - Migration check passed.
  - Targeted cleaner signup tests passed.

- Full `apps.accounts.tests.test_auth_agency_consent` still has one existing unrelated failure: the host signup test expects `pending`, while current signup code creates `approved`.

- Latest observability checks:
  - `python manage.py check` passed.
  - `python manage.py test apps.core.tests.test_observability` passed.
  - `npm run typecheck` passed.
  - `npm run lint` / `npm run build` currently stop on pre-existing frontend lint issues.

- Docker CLI exists at `C:\Program Files\Docker\Docker\resources\bin\docker.exe`.
- Docker Desktop daemon is running on the `desktop-linux` context.
- Docker Compose exists and reports version `v5.1.4`.
- Production Compose config validates with:

```powershell
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' compose --env-file .env.production -f docker-compose.prod.yml config
```

- PowerShell helper scripts parse successfully.
- Production stack was started with:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\start-production.ps1
```

- Docker containers are running:
  - `airbnb_tax-db-1`
  - `airbnb_tax-redis-1`
  - `airbnb_tax-backend-1`
  - `airbnb_tax-worker-1`
  - `airbnb_tax-frontend-1`
  - `airbnb_tax-proxy-1`
- Caddy exposes host ports `80` and `443`.
- Local backend health check works:

```powershell
Invoke-WebRequest http://localhost/api/health/
```

- LAN backend health check works from this machine:

```powershell
Invoke-WebRequest http://192.168.1.14/api/health/
```

- Frontend root works locally:

```powershell
Invoke-WebRequest http://localhost/
```

- Recent logs show Caddy, Next.js, Gunicorn, and Celery running.

## Remaining Blockers

- Signup flow is more complete, but final production readiness still requires deciding the exact final Host, Cleaner, and Agency onboarding fields.
- Any final signup-field changes must update database models, migrations, serializer validation, profile serializers/admin visibility, frontend payloads, and signup tests together.
- Windows Firewall rule creation requires an Administrator PowerShell session and was not applied from this non-admin shell.
- Router forwarding was not configured yet.
- Public IP was not added to `.env.production` yet.

## Next Steps

1. Open Administrator PowerShell in this repo:

```powershell
cd C:\Users\misho\OneDrive\Desktop\airbnb_tax
```

2. Open firewall ports:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\open-firewall.ps1
```

3. Configure router forwarding on `192.168.1.1`:
   - External TCP `80` -> `192.168.1.14:80`
   - External TCP `443` -> `192.168.1.14:443`

4. When the public IP is known, update `.env.production`:
   - add `<public-ip>` to `DJANGO_ALLOWED_HOSTS`
   - add `http://<public-ip>` to `FRONTEND_TRUSTED_ORIGINS`
   - set `FRONTEND_URL=http://<public-ip>`
   - set `BACKEND_URL=http://<public-ip>`

5. Restart the production stack after `.env.production` changes:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

6. Verify public access from a phone disconnected from Wi-Fi:

```powershell
http://<public-ip>/
```

## Useful Commands

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

## Important Notes

- This is raw-IP HTTP for now. Keep `SESSION_COOKIE_SECURE=false` and `CSRF_COOKIE_SECURE=false` until a domain with HTTPS is configured.
- Do not expose ports `8000`, `5432`, or `6379`; only Caddy should publish host ports.
- `.env.production` currently contains a placeholder production secret and local LAN defaults. Replace the secret before real public use.
