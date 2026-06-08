# Current Progress Handoff

Updated: 2026-06-08, after the property navigation rail, income/expenditure cards, and the Connections + in-app chat layer.

## Latest Work — Property Rail · Income/Expenditure · Connections + Chat (2026-06-08)

ClickUp: "Property rail · Income/Expenditure · Connections & in-app chat (3 phases)" (`869dky9yp`, complete). Verified: Django `check` clean; `apps.connections` + `apps.marketplace` = 34 tests OK; frontend `typecheck` + `lint` clean.

- **Cleaner dashboard rebuilt to mirror host (earlier in session)**: tabs are now **Jobs & Calendar · Applications · Offers** (Profile in the account menu). Calendar reuses the host design with **property thumbnails** in day cells (needs `property_image` on calendar items — see below); Applications is a host-style 5/6-card `host-appdash-grid` (Pending/Active/Completed/Open/Rating + Income). `features/cleaner/CleanerDashboard.tsx`.
- **Calendar `property_image`**: `job_calendar_payload` + `MarketplaceCalendarItemSerializer` expose a first-photo `property_image` (relative `/media/...`); calendar querysets `prefetch_related` property images. `AssignmentSerializer` exposes `cleaner_profile_image`. No payment fields.
- **Phase 1 — Property navigation rail (host)**: replaced the Properties topbar tab + card grid with a slim left **rail** (`.host-rail`): All → property thumbnails → footer pencil(edit)+plus(add). Selecting a property filters Jobs & Calendar + Applications **in place** via `selectedPropertyId` (state renamed to `all*` with derived scoped `jobs/applications/assignments` memos). "Post a job" pre-scopes to the selection. Mobile ≤860px → dropdown selector. Topbar tabs now Jobs & Calendar + Applications. `features/host/HostDashboard.tsx`, `globals.css` (`.host-rail*`, `.host-workspace*`). NOTE: the earlier `/host/properties/[id]` route was **removed**.
- **Phase 2 — Income/Expenditure card**: 6th appdash card next to "My rating" — host **Spent** / cleaner **Income** = Σ `agreed_price` of completed assignments (+ "from N cleanings"). Shared `frontend/lib/money.ts` (`money`, `formatMoney`); `.host-appdash-card--money/--static`.
- **Phase 3 — Connections + in-app chat (LinkedIn-style)**: new `backend/apps/connections/` app — `Connection` (requester/addressee, status pending/accepted/declined/removed, unique pair) + `Message` (body, read_at). Services (host↔cleaner-only pairing, no self-connect, reverse-request auto-accepts, messaging only on accepted) + audit + notifications. Endpoints `/api/connections/`: list · create(request) · `accept`/`decline` · DELETE(remove) · `messages` (GET marks read / POST send) · `read` · `unread-count` · `shared` (collaborated properties+cleanings). Migration `0001_initial`; registered in settings + root urls. Frontend: **"Connections" button next to Applications** in both navs (`components/Connections.tsx`, polled badge) → right drawer (Requests / Connected / Pending) → polled chat thread + Shared panel; reusable `components/ConnectButton.tsx` wired into the cleaner profile modal. Chat is **polled** (no websockets). Types `frontend/types/connection.ts`; CSS `.connections-*`/`.chat-bubble*`/`.connect-btn*`.

## Latest Work — Host Calendar Thumbnails & UX Follow-ups (2026-06-03)

ClickUp task: "Host calendar redesign — compact thumbnail-driven day grid" (`869djg405`).

- **Calendar day thumbnails** (`frontend/features/host/HostDashboard.tsx` + `frontend/app/globals.css`): the Jobs & Calendar day grid now renders up to **3** compact job thumbnails per day (then a `+N` chip) instead of flat status dots. Draft/open jobs show the **property** photo (or a `Building2` icon fallback); **assigned** jobs add a small **cleaner-avatar badge** (avatar image, or the cleaner's initial). Job status is preserved as an inline `box-shadow` color ring using the existing `STATUS_COLOR` tokens; the legend still uses `.host-cal-dot`. New classes `.host-cal-thumbs` / `.host-cal-thumb` / `.host-cal-thumb--icon` / `.host-cal-thumb-avatar` / `.host-cal-thumb-more` + `≤620px` responsive shrink. Tokens/typography unchanged.
- **Backend avatar field** (`backend/apps/marketplace/serializers.py`): `AssignmentSerializer` exposes a read-only `cleaner_profile_image` (safe `SerializerMethodField`; returns the cleaner's `profile_image` string or `null`, handles agency cleaners with no `cleaner_profile`). Flows into the nested `CleaningJobSerializer.assignment` too. No migration. `profile_image` is a `TextField` data-URL/URL string used directly as `<img src>`.
- **"Post a job" date prefill** (`HostDashboard.tsx → openJobForm`): creating a job without an explicit day now defaults the date to the **selected calendar day** if one is selected, else **today**. Covers the right-side "Post a job" button, property-card "Post a job", and side-panel "Post one" (date no longer blank); clicking a specific empty day still uses that day.
- **Notification bell → Applications** (`frontend/components/NotificationBell.tsx → notificationHref`): on the host, application/offer notifications deep-link into the Applications section — `application.submitted` / `application.withdrawn` → `?section=applications&appFilter=pending`; `offer.accepted` → `appFilter=active`; `offer.declined` → `section=applications`. Review notifications keep their existing routing.
- **Pending-application dot on the calendar** (`HostDashboard.tsx` + `globals.css`): a small brand-pink dot (top-right of the thumbnail, white-ringed, like the notification badge) appears on any calendar job that has pending cleaner applications, sourced from `jobActivityMap.pendingApps`. New `.host-cal-thumb-pending` class + responsive shrink; hover shows "N pending application(s)".
- **Verification**: `python manage.py check` clean (serializer-only); `npm.cmd run typecheck` + `npm.cmd run lint` clean.
- **Follow-up (out of scope)**: `FavouriteCleanerSerializer.get_profile_image` calls `.url` on the `profile_image` TextField — would `AttributeError` if a favourited cleaner ever has a non-empty image; worth fixing later.

## Latest Work — Direct-Offer Conflicts & Host Applications UI (2026-06-03)

- **Robust direct-offer endpoint**: `POST /api/marketplace/jobs/offer-to-cleaner/` (action `offer_to_cleaner` on `CleaningJobViewSet`, `OfferToCleanerSerializer`). The `offer_job_to_cleaner` service find-or-creates the draft `CleaningJob` for the exact `(property, scheduled_start, scheduled_end)` slot, then delegates to `offer_job`. This fixed the prior 400 where the frontend created a duplicate job that collided with the `unique_property_job_time` constraint on a re-offer. `frontend/components/JobOfferModal.tsx` now makes a single POST to this endpoint (removed the old create-then-offer + client-side slot matching).
- **Same property + same-day conflict guards** (`apps/marketplace/services.py`), applied to **both** `offer_job` (host offers) and `submit_application` (cleaner applications), day computed in Europe/Sofia:
  - `_ensure_no_assigned_job_same_property_day` — blocks when the cleaner already holds an active (non-cancelled) `Assignment` for that property on that day.
  - `_ensure_no_pending_offer_same_property_day` — blocks when the cleaner already has a **pending** offer/application for that property on that day (any time slot), preventing two pending offers from both being accepted (double-booking).
  - The existing exact-slot duplicate ("...for this job.") and declined-offer reactivation in `offer_job` are unchanged.
- **Host Applications — sent offers can't be self-approved** (`frontend/features/host/HostDashboard.tsx`): pending rows with `origin=host_offered` no longer show an **Accept** button (only the cleaner accepts those). They show a gold "Offer sent · awaiting cleaner" badge (`.host-app-badge--offer` in `globals.css`) and a relabeled **Withdraw** button. Added `origin` to the `CleanerApplication` TS interface.
- **Tests**: `apps/marketplace/tests/test_offers.py` adds `test_offer_blocked_when_cleaner_assigned_same_property_same_day` and `test_offer_blocked_when_cleaner_has_pending_offer_same_property_same_day` (fixed 09:00/13:00 same-day window to avoid midnight straddle). Full `test_offers` suite (13 tests) passes; `manage.py check` clean; frontend `npm.cmd run typecheck` + `lint` clean.

## Latest Work — Marketplace Correctness Fixes (2026-06-03)

- **Cleaner city filtering**: cleaner profiles now persist and expose `city`. The public `CleanerBrowser` filters by saved city first and keeps service-area district inference only as a fallback for older blank-city cleaner profiles.
- **Seed data guarantees**: `a1_populate_tables_test.py` now asserts unique host/cleaner names and emails, creates one or more properties per host at different addresses, and gives every cleaner at least one service district.
- **Seeded property photos**: property seed photos are generated as visible JPEGs and old `property_*.*` seed media is cleaned before re-seeding. Property image API responses use relative `/media/...` URLs so the frontend proxy can load them reliably.
- **Completion timing**: after acceptance, nobody can mark a job done before its scheduled start. Cleaners can mark done once start time is in the past, even if the end time is still ahead; hosts/admins can confirm completion only after the scheduled end time.
- **Duplicate jobs**: a host cannot create the same job twice for the same property and exact start/end time; this is enforced by serializer validation and a database unique constraint.

## Latest Work — Cleaner Dashboard/Profile Polish (2026-06-02)

- **Cleaner completion + feedback flow**:
  - Job completion tracks both cleaner and host confirmation before feedback is unlocked.
  - Cleaner can mark done after scheduled start time; host/admin completion is blocked until scheduled end time.
  - Cleaner can leave host feedback only after both sides mark the assignment completed.
  - Cleaner notifications route directly into the matching feedback form / received review location.
  - Cleaner calendar shows completed assignments as `Completed` instead of `Assigned`.
- **Cleaner calendar/application UI fixes**:
  - Merged the duplicate `Applications` bar into `Calendar`.
  - Rejected application chips and calendar markers now use a warning-orange state instead of the generic brand/neutral styling.
- **Live refresh behavior tuned**:
  - Removed timed auto-refresh polling that was wiping in-progress form input.
  - Focus/visibility/online refresh behavior remains.
- **Cleaner profile validation + UX**:
  - Profile field errors now render inline on the actual offending field instead of only at the top of the form.
  - Birth date on the cleaner profile now uses the same compact picker pattern as signup.
  - Cleaner profile birth date enforces the 18+ rule during editing/saving.
  - Fixed cleaner profile birthdate picker layout issues inside the profile form (double-field look, narrow-screen overflow, flex sizing bugs).
  - Fixed cutoff-year birthdate picker behavior so month/year navigation no longer gets stuck in confusing states.
- **Cleaner account menu/header**:
  - Cleaner topbar account control now uses an icon trigger with the cleaner name shown inside the opened dropdown above `Profile`.

## Latest Work — Landing Redesign, Cleaner Browser & UI Refinements (2026-06-02)

- **Minimal landing page** (`frontend/app/page.tsx`): removed the old marketing sections (hero search panel, how-it-works, trust band, join, market strip). Now a **compact photo hero + public cleaner browser**. Top-right keeps Log in/Sign up (or role-aware Dashboard + user chip + Log out) + language picker; removed the dead hamburger menu and set `.site-header` grid to `1fr auto` so actions pin right.
- **Shared `CleanerBrowser.tsx`**: fetches all verified+approved cleaners once and filters **client-side by City + dependent District** dropdowns from `lib/cityDistricts.ts`. City filtering uses each cleaner's saved `city` first and falls back to reverse `zone → city` inference from `service_areas` for older blank-city profiles. Powers both `/` and `/cleaners`. Replaced the buggy free-text search bar on `/cleaners`; fixed a layout bug where `display:grid` + `min-height` on the same `<main>` pushed content far down (moved grid/padding to an inner `.cleaners-directory` wrapper). `/cleaners` header is now a narrow band.
- **Login redirect** (`frontend/app/login/page.tsx`): on success fetches `/me/` and forwards to the role dashboard (admin→`/admin`, host→`/host`, cleaner→`/cleaner`, agency→`/agency`, else `/app`).
- **Property card "Post a job"** (`frontend/app/host/page.tsx`): Properties-tab cards now have Edit (left, outline) + Post a job (right, brand-filled) pill buttons; `openJobForm` takes an optional `presetPropId` to pre-scope the job modal to that property. Card restyled (18px radius, hover lift, rounded stat chips).
- **Sentry sanitizer fix** (carried from prior session): recreated missing `frontend/lib/sentry-sanitize.ts`; Sentry env vars in gitignored `frontend/.env.local`.
- Verified: `npm.cmd run typecheck` passes; lint clean for all new/changed files.

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
