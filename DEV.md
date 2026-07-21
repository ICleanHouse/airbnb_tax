# Development Guide

> `Security Audit Plan.txt` is absent from the checked-out repository.
> The supplied audit-plan requirements and `docs/STAGE_1_SOFIA_PILOT_PLAN.md`
> are external planning inputs for the release privacy work.

## Restart Handoff

See `CURRENT_PROGRESS.md` for the current deployment progress, local-development notes, and signup-flow status.

## Project Purpose

This project is a Bulgarian-market marketplace connecting Airbnb and short-term
rental hosts with cleaners who have active marketplace access.

The MVP should let hosts post one cleaning or a month of cleaning jobs, let
marketplace-eligible cleaners apply, let both sides agree on price outside the
platform, share calendar availability, and collect two-way feedback after
completed work.

## MVP Scope

The first production version should include:

- Property owner (`host`), cleaner, agency, and admin user roles.
- Session-cookie signup/login/logout/current-user APIs.
- Manual admin approval before marketplace rights are enabled.
- Agency invitations and agency-cleaner memberships.
- Consent-first cookie recording for optional analytics and marketing cookies.
- Host property management.
- Single cleaning job posting.
- Monthly cleaning batch creation from reservations or manual dates.
- Bulk cleaning job creation by importing an Airbnb `.ics` calendar file.
- Cleaner verification before marketplace access.
- Cleaner applications to individual jobs or monthly batches.
- Assignment workflow after host approval.
- Agreed price tracking in EUR without in-app payments.
- Internal calendar as the source of truth.
- Google Calendar sync plus iCal import/export.
- Email, in-app, and SMS notifications for important workflow events.
- Two-way reviews after completed jobs.
- Admin moderation for cleaners, reviews, disputes, and marketplace activity.

Out of scope for v1 unless explicitly requested:

- In-app payments, payouts, invoices, platform fees, or wallet balances.
- Native mobile apps.
- Property management system integrations such as Guesty or Hostaway.
- Advanced operations such as supplies inventory, photo inspections, or damage claim workflows.

## Expected Stack

Use this baseline stack unless the architecture document is intentionally updated:

- Backend: Python 3.13+, Django 6.0+, Django REST Framework 3.17+.
- Frontend: React 19.2+ with Next.js 15.5+ as a responsive web/PWA; Motion is used for reusable React animations.
- Database: PostgreSQL 16+ (Docker/production); SQLite (local dev without Docker).
- Cache and broker: Redis 7+.
- Background jobs: Celery 5.4+.
- Object storage: EU-hosted S3-compatible storage for future uploaded assets.
- Hosting: EU managed cloud infrastructure.
- Timezone: `Europe/Sofia`.
- Currency: EUR.
- Languages: Bulgarian and English.

## Repository State

```text
backend/
  config/           Django project config (settings, celery, wsgi, asgi)
  apps/             accounts, properties, marketplace, calendars, feedback, notifications, locations
frontend/
  app/
    page.tsx        Public landing page (auth-aware header)
    login/          Session login
    signup/         Single-route React signup wizard with email code, role, cleaner details, location, language, experience, introduction, profile photo
    app/            Generic workspace (auto-redirects hosts → /host, admins → /admin)
    admin/          Admin approval panel (list / approve / reject, URL filter param)
    host/           Host dashboard (properties, jobs, calendar, ICS import)
    cleaner/        Cleaner dashboard (calendar, profile forms, open jobs, applications, assignments)
    components/     CookieConsentBanner
  lib/
    api.ts          apiFetch wrapper — CSRF + Content-Type, FormData-safe
  app/globals.css   CSS design tokens + all shared component classes
  next.config.mjs   trailingSlash: true + dual rewrite rules (required for APPEND_SLASH)
docker-compose.yml
.env.example        → copy to .env before running
```

Keep the backend modular even before services are split. Each backend domain should own its models, serializers, services, permissions, tests, and migrations.

Prefer explicit service-layer functions for business workflows such as accepting applications, assigning cleaners, completing jobs, and submitting reviews. Avoid putting marketplace state transitions directly inside views.

## Environment Setup

### Copying the example file

```powershell
Copy-Item .env.example .env
```

### Environment variables

`python-dotenv` loads `.env` automatically at startup from `settings.py`, `manage.py`, `wsgi.py`, and `asgi.py` using `override=False` where applicable — shell environment variables take precedence.

Key variables and their defaults:

| Variable | Local default | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | `dev-only-change-me` | **Change in production** |
| `DJANGO_DEBUG` | `true` | |
| `DATABASE_URL` | *(absent → SQLite)* | **Comment out for local dev without Docker** |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/1` | |
| `CACHE_URL` | *(absent → LocMem)* | Required in deployed environments; use a dedicated Redis database (example: `redis://redis:6379/2`) for user-keyed throttles/cache |
| `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` | Django mail backend for non-signup emails only |
| `EMAIL_HOST` | *(empty)* | Optional SMTP hostname for non-signup emails |
| `EMAIL_PORT` | `587` | Optional SMTP port |
| `EMAIL_USE_TLS` | `true` | Optional SMTP TLS setting |
| `EMAIL_HOST_USER` | *(empty)* | Optional SMTP username |
| `EMAIL_HOST_PASSWORD` | *(empty)* | Optional SMTP password |
| `DEFAULT_FROM_EMAIL` | `noreply@example.local` | Sender address for outbound emails |
| `EMAIL_RESEND_APIKEY` | *(empty)* | Required Resend API key for signup email-code delivery |
| `EMAIL_RESEND_FROM_EMAIL` | *(empty)* | Required verified Resend sender address for signup codes |
| `EMAIL_VER_USER_SIGNUP` | `True` | Sends the 6-digit signup email verification code when enabled |
| `ACCOUNT_APPROVAL_REQUIRED` | `True` | Require stored contact-policy satisfaction before normal account approval; false is a test/rehearsal shortcut |
| `CLEANER_VERIFICATION_REQUIRED` | `True` | Require stored contact-policy satisfaction before normal cleaner marketplace activation; false is a test/rehearsal shortcut |
| `ALLOW_PILOT_VERIFICATION_BYPASS` | `False` | Required second guard for any production-like requirement shortcut; invalid when no shortcut is active |
| `PHONE_VERIFICATION_REQUIRED` | `False` | False uses the interim email-only policy; true stops new normal advancement until both timestamps exist |
| `PILOT_VERIFICATION_BYPASS_OWNER` | *(empty)* | Non-empty operator/owner identifier required for a guarded bypass |
| `PILOT_VERIFICATION_BYPASS_REASON` | *(empty)* | Non-empty internal reason required for a guarded bypass; full value is not logged |
| `PILOT_VERIFICATION_BYPASS_START_AT` / `PILOT_VERIFICATION_BYPASS_END_AT` | *(empty)* | Timezone-aware active window required for a guarded bypass |
| `PILOT_GENUINE_JOB_INTAKE_PAUSED` | `False` | Must be true while a production-like bypass is active |
| `EMAIL_VER_USER_CONFIRMATION` | `True` | Sends the legacy link-based account confirmation email when enabled |
| `EMAIL_NOTIF_ADMIN_NEW_ACCOUNT` | `True` | Sends admin/staff new-account notification emails when enabled |
| `EMAIL_NOTIF_HOST_APPLICATION_SUBMITTED` | `True` | Sends host emails when a cleaner applies to a job |
| `EMAIL_NOTIF_HOST_JOB_COMPLETED` | `True` | Sends host emails when a cleaner marks a job complete |
| `FRONTEND_URL` | `http://localhost:3000` | Base URL used to build links in outbound emails |
| `BACKEND_URL` | `http://localhost:8000` | Base URL used by legacy email-confirmation links |
| `FRONTEND_TRUSTED_ORIGINS` | `http://localhost:3000,...` | CSRF trusted origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | API base URL for the frontend |
| `APP_ENV` | `local` | Environment label included in JSON logs |
| `LOG_LEVEL` | `INFO` | Backend/Celery log verbosity |
| `SENTRY_DSN` | *(empty)* | Enables Django/Celery crash reporting |
| `NEXT_PUBLIC_SENTRY_DSN` | *(empty)* | Enables Next.js browser crash reporting |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `local` | Sentry environment labels |
| `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | `0.0` | Keep disabled unless performance tracing is needed |

### Local vs Docker DATABASE_URL

The local `.env` should have `DATABASE_URL` **commented out** so Django falls back to SQLite:

```dotenv
# DATABASE_URL=postgres://airbnb_cleaners:airbnb_cleaners@db:5432/airbnb_cleaners
```

Docker Compose can use the Docker hostname `db`, but manual PowerShell runs cannot. Use SQLite locally or point PostgreSQL to `localhost`.

### Email in local development

`.env.example` includes Resend signup-code variables. Signup confirmation codes use Resend only:

```dotenv
EMAIL_RESEND_APIKEY=re_...
EMAIL_RESEND_FROM_EMAIL=you@your-verified-domain.com
FRONTEND_URL=http://localhost:3000
```

Use a verified Resend sender/domain for `EMAIL_RESEND_FROM_EMAIL`. Restart both the backend and Celery after changing `.env`.

If `EMAIL_VER_USER_SIGNUP=False` in local/test, the backend auto-verifies the
signup email request and returns `email_verification_token` immediately so the
frontend skips the email-code step. That testing shortcut is rejected at
startup in `staging`, `pilot`, `prod`, and `production`; automatic contact
reconciliation must never treat a fabricated production email confirmation as
genuine evidence. The token remains in React memory only and is never part of
browser recovery state.

Normal signup writes `pending` account and cleaner state first, then invokes
one atomic contact reconciliation. With the safe defaults and a confirmed
email, accounts advance to `approved` and cleaners to the stored marketplace
eligibility state. This is contact confirmation only—not identity, reference,
interview, or trial-job review. Configuration changes do not retroactively
rewrite existing users.

Signup refresh recovery uses only `sessionStorage` key `signup_wizard_state`
with a 24-hour explicit allowlist: `version`, `savedAt`, `role`, `citySlug`,
`selectedZoneIds`, and `experienceLevel`. Passwords, confirmation, email,
verification codes/tokens, names, identity/profile fields, errors, and response
data are intentionally lost on refresh. Do not replace this with localStorage,
IndexedDB, cookies, URL parameters, or encrypted browser persistence.

The signup code email body is rendered from:

```text
backend/apps/notifications/templates/notifications/signup_code_email.html
```

## Docker Development

Run the full local stack:

```powershell
docker compose up --build
```

Useful service URLs:

- Frontend: `http://localhost:3000`
- Backend health check: `http://localhost:8000/api/health/`
- Django admin: `http://localhost:8000/admin/`

Run backend commands through Docker:

```powershell
docker compose run --rm backend python manage.py migrate
docker compose run --rm backend python manage.py createsuperuser
docker compose run --rm backend python manage.py test
```

## Backend Local Commands

From `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Run tests and checks:

```powershell
python manage.py check
python manage.py test
python -m compileall .
```

### Lifecycle migration and PostgreSQL verification

S1-E05 migrations `0006`–`0008` use an expand → deterministic backfill →
validate → constrain sequence. Migration `0008` is non-atomic so PostgreSQL can
create the two actionable-job unique indexes concurrently. Do not squash or
reorder this sequence, and do not derive required backfill values from
`AuditLog`.

Before deployment, run:

```powershell
python manage.py makemigrations --check --dry-run
python manage.py migrate --plan
python manage.py test apps.marketplace.tests.test_lifecycle_migrations
python manage.py test apps.marketplace.tests.test_lifecycle_foundation
python manage.py test apps.accounts.tests.test_deletion_blockers
```

Run `apps.marketplace.tests.test_postgres_lifecycle_constraints` against a real
PostgreSQL database. A SQLite pass, including thread-based tests, is not evidence
that PostgreSQL concurrent-index or locking behavior is correct. If PostgreSQL
is unavailable, record that suite as unverified rather than treating its skip as
a pass.

Operational lifecycle changes must use `apps.marketplace.services`; direct ORM,
ordinary PATCH, Django admin edits, and physical job deletion are not supported
state-transition paths. `MARKETPLACE_SUPPORT_CHANNEL` must name the monitored
account-deletion support route before pilot deployment.

Run a Celery worker after Redis is available and dependencies are installed. On Windows, use `--pool=solo`:

```powershell
python -m celery -A config worker --loglevel=info --pool=solo
```

Signup email delivery requires Redis and the Celery worker when Celery is installed. The `_FakeTask` fallback only applies when Celery is not installed.

## Logging And Observability

- Backend and Celery logs are JSON on stdout. Each request gets `X-Request-ID`
  in the exact form `req_` plus 32 lowercase hexadecimal characters; invalid
  inbound IDs are replaced. Request telemetry uses resolver route templates,
  never raw paths, queries, request/response bodies, user text, or actor IDs.
- Startup emits `django.started` for server/worker commands only.
- Important account/marketplace actions create read-only `AuditLog` rows in Django admin at `/admin/core/auditlog/`.
- Use normal `logging.getLogger("apps.<area>")` for technical logs; use `write_audit_log(...)` only for important business history.
- Sentry reports backend/Celery crashes when `SENTRY_DSN` is set and frontend crashes/API failures when `NEXT_PUBLIC_SENTRY_DSN` is set.

## Frontend Local Commands

From `frontend/`:

```powershell
npm.cmd install
npm.cmd run dev -- --hostname 127.0.0.1
```

Run frontend checks:

```powershell
npm.cmd run typecheck
npm.cmd run lint
```

## Localisation (i18n)

The frontend is fully localised with **next-intl v4** (App Router native). Bulgarian is the default/primary locale (no URL prefix); English is `/en/…`.

### Message files

```
frontend/messages/en.json   ← English (source of truth)
frontend/messages/bg.json   ← Bulgarian (default locale)
```

Both files must always be in sync — adding a key to one requires adding it to the other. Keys are in English camelCase; only the values differ between files.

### Infrastructure files

```
frontend/i18n/request.ts    ← next-intl server config (loads the right messages/locale)
frontend/i18n/routing.ts    ← locale list + defaultLocale + localePrefix config
frontend/middleware.ts       ← next-intl locale-detection middleware
frontend/app/[locale]/      ← all app routes live under this segment
```

### Using translations

In any Client Component:

```typescript
import { useTranslations } from "next-intl";

const t = useTranslations("namespace");  // dot-separated nesting works too
return <p>{t("key")}</p>;
// ICU plural:  t("count", { count: n })
// Interpolation: t("greeting", { name: "Ana" })
// Arrays:  t.raw("monthsFull") as string[]
```

For module-level functions that need translated strings, move them inside the component as closures over `t` — `useTranslations` returns a stable reference so adding `t` to a `useEffect`/`useMemo` dependency array is safe.

### Adding new user-facing strings

1. Add the key + English value to `frontend/messages/en.json` under the matching namespace.
2. Add the same key + Bulgarian value to `frontend/messages/bg.json`.
3. Use `t("key")` in the component.
4. Run `npm.cmd run typecheck && npm.cmd run lint` — both must pass clean.

### Namespace map

| Namespace | Covers |
|---|---|
| `nav` | Shared header nav links (landing) |
| `landing` | Landing page hero/copy |
| `login` | Login page |
| `signup` | Signup wizard (all steps, validation, modals) |
| `host` | Host dashboard (topbar, rail, calendar, forms, ICS import, modals) |
| `cleaner` | Cleaner dashboard (topbar, tabs, profile form) |
| `admin` | Admin panel |
| `cleaners` | `/cleaners` directory page |
| `app` | `/app` workspace page |
| `common` | Shared primitives (months, weekdays, cancel/save/back/continue) |
| `errors` | Global error boundary strings |
| `components.*` | Shared components (see sub-namespaces below) |

Component sub-namespaces under `components`:

`cookieBanner`, `cleanerBrowser`, `cleanerCard`, `cleanerProfileModal`, `appdashGrid`, `ratingStars`, `reviewModal`, `notificationBell`, `connectButton`, `jobOfferModal`, `connections`, `accountDeletionPanel`, `areaDemandPanel`, `openJobMap`, `districtMapSelector`, `propertyLocationPicker`, `districtChecklist`, `districtSelectedTags`

### Domain glossary (Bulgarian)

| English | Bulgarian |
|---|---|
| Job (cleaning job) | Поръчка |
| Host | Домакин |
| Cleaner | Почистващ |
| Assignment | Назначение |
| Applications | Позиции |
| Offer | Оферта |
| Verified | Верифициран |
| Rating | Рейтинг |
| Property | Имот |
| Dashboard | Табло |

PowerShell may block `npm.ps1` with an execution policy error. Use `npm.cmd` commands on Windows to avoid changing execution policy.

Do not run `npm.cmd run build` while `npm.cmd run dev` is running. Both write to `frontend/.next`, and running them together can produce missing generated files. If the frontend shows a stale Next.js runtime error, stop the dev server, remove `.next`, and restart:

```powershell
Remove-Item -Recurse -Force frontend/.next
cd frontend && npm.cmd run dev -- --hostname 127.0.0.1
```

## Current Frontend Behavior

### Routing overview

| Route | Auth required | Who | Status |
|---|---|---|---|
| `/` | No | All | ✅ Live |
| `/login` | No | All | ✅ Live |
| `/signup` | No | All | 🟨 In progress — single React wizard with Motion transitions, email-code confirmation, role selection, cleaner-only personal/language/experience/introduction/profile-photo steps, and final account creation. |
| `/app` | Yes | All roles | ✅ Live — redirects hosts/admins automatically |
| `/admin` | Yes | `admin` role | ✅ Live |
| `/host` | Yes | `host` role | ✅ Live |
| `/cleaner` | Yes | `cleaner` role | ✅ Live |
| `/agency` | Yes | `agency` role | ⬜ Not built yet |

### Key frontend files

**`frontend/lib/api.ts`** — all HTTP calls go through `apiFetch`. Handles CSRF automatically.

- Sets `Content-Type: application/json` only when `body` is a string — does **not** set it for `FormData` (the browser sets the correct multipart boundary automatically).
- Reads the Django `csrftoken` cookie and injects `X-CSRFToken` on state-changing requests.
- Never call `fetch` directly in any page.

**`frontend/next.config.mjs`** — has `trailingSlash: true` and two rewrite rules for `/api/:path*`. Do not simplify to one rewrite rule — Django's `APPEND_SLASH` requires both forms.

**`frontend/app/globals.css`** — single CSS file for the entire app. All new pages should add their styles here following existing naming conventions (`.host-*`, `.admin-*`, etc.).

**`frontend/app/components/DistrictMapSelector.tsx`** — reusable district selector for city service areas. It uses MapLibre when GeoJSON boundaries exist and provides a searchable checklist fallback. Sofia metadata comes from `frontend/lib/sofiaDistricts.ts`; map geometry comes from `frontend/public/maps/sofia/districts.geojson`. Both must contain the same 144 stable `sofia:osm-N` ID/name pairs. Cleaner profile integration uses zone IDs internally and currently persists canonical district names in `service_areas`.

**Sofia district maintenance**

- Canonical source file: `districits_sofia/sofia_districts_ready.geojson`.
- Hardcoded frontend catalog: `frontend/lib/sofiaDistricts.ts`.
- Runtime map asset: `frontend/public/maps/sofia/districts.geojson`.
- Preserve exact canonical names, including `кв.` and `ж.к.` prefixes.
- Do not add stripped-name aliases or restore `backend/apps/locations/fixtures/sofia_service_zones.geojson`.
- After changing the GeoJSON, update the catalog and public map together and verify all IDs/names match exactly.
- `a1_populate_tables_test.py` validates IDs `1..144`, synchronizes `ServiceZone`/geometry rows as `osm-N`, removes obsolete Sofia zones, clears aliases, and seeds cleaner/property districts from canonical names.

### Landing page (`/`)

- Compact centered public hero plus an audience toggle.
- `Find a cleaner` renders the shared `CleanerBrowser`, which fetches `/api/accounts/public-cleaners/` and filters marketplace-eligible cleaners by selected city and dependent district.
- `Find cleaning work` renders `AreaDemandPanel` and the compatibility-named `OpenJobMap`. Canonical `/api/marketplace/public-demand/?city=sofia` returns city/zone aggregate counts only. `/api/marketplace/open-job-locations/` is a temporary identical-body alias with deprecation headers and a 15 October 2026 sunset.
- Public discovery renders canonical district counts using catalog geometry/names only. It must never request or render per-job/property IDs, job-derived coordinates, address fragments, photos, exact schedules/prices, host identity, or free text. Applications remain in the authenticated marketplace-eligible cleaner dashboard.

The anonymous response contract is:

```json
{
  "cities": [
    {
      "city_slug": "sofia",
      "city_name_bg": "София",
      "city_name_en": "Sofia",
      "open_job_count": 4,
      "zones": [
        {
          "zone_id": "sofia:osm-66",
          "zone_name_bg": "ж.к. Лозенец",
          "zone_name_en": "ж.к. Лозенец",
          "open_job_count": 2
        }
      ]
    }
  ]
}
```

Only exact canonical `sofia:osm-1` through `sofia:osm-144` IDs/names may
appear. Unmatched legacy jobs contribute only to a canonical city total. The
alias adds `Deprecation: true`, a successor `Link`, and
`Sunset: Thu, 15 Oct 2026 00:00:00 GMT`.

Marketplace-eligible cleaners and eligible approved agencies receive only the
S1-D04 evaluator job projection. A current active assigned participant may
receive the minimum operational property/address/instructions/agreed-price and
one protected primary image. Completed or otherwise retained worker records use
the `history` projection: evaluator fields plus host display, agreed price, and
assignment history, with no property name/address/image/instructions.
Owners/admins retain legitimate full views.
Operational property images stream from
`/api/properties/images/{id}/content/`; every raw `/media/*` request is denied.
Approved public cleaner profile media is the `profile_image` API/data value, not
a `PropertyImage` storage path.
New property and changed cleaner images accept only decoded single-frame
JPEG/PNG/WebP within the centralized Stage 1 limits. The backend applies EXIF
orientation, renders a fresh RGB buffer, strips source metadata, resizes, and
encodes a new JPEG. Client MIME/extension values are hints, not trust anchors.
Do not preserve an uploaded property filename or accept a new third-party
cleaner-image URL. An unchanged legacy cleaner value may remain.

`GET /api/connections/{id}/shared/` is no-store and is available only for an
accepted connection when the requester is active/approved and, for a worker
requester, is an eligible verified evaluator. It includes current,
non-cancelled assignments only. Property rows contain `name`, `city`, and
`cleanings`; cleaning rows contain `job_id`, `property_name`, `scheduled_start`,
`status`, `agreed_price`, and `currency`. It excludes addresses, images,
instructions, coordinates, host identity, and free text.
- City matching for `CleanerBrowser` uses the cleaner profile `city` field first and falls back to district inference from `service_areas` for older blank-city profiles.
- Auth-aware header: when logged in, shows the correct dashboard link plus the same notification bell and profile-icon menu used by dashboards. Profile, logout, and the persistent BG/EN segmented language control live inside the profile menu. Logged-out visitors retain the standalone language selector.

### Admin panel (`/admin`)

- Lists all user accounts with client-side filtering by status (pending / approved / all).
- Displays email, phone, configured-contact, account, cleaner marketplace,
  full-contact, latest-decision, and authorized evidence-exclusion state.
- Reconciles pending accounts from stored timestamps, rejects pending accounts,
  and suspends pending/approved accounts through structured atomic transitions.
- Review history is admin-only; internal notes do not appear in ordinary user
  serializers. Cleaner status is not directly editable.
- Reads `?filter=pending` on load for legacy/bookmarked filtered views; signup
  notifications link to the neutral account-review surface.
- Accessible to `admin` role only — redirects others.

### Host dashboard (`/host`)

- Two topbar sections: **Jobs & Calendar** and **Applications**. Properties are selected from the property navigation rail.
- Property rail: select/filter a property, edit it, or add a property via modal form (`POST /api/properties/properties/`).
- Jobs section: month calendar grid with coloured status dots per day.
  - Click an empty day → job form pre-filled with that date.
  - Click a day with jobs → filters the list panel to that day.
  - Post a job via modal form (`POST /api/marketplace/jobs/`) — saved as Draft.
  - Publish button: `POST /api/marketplace/jobs/{id}/publish/` → transitions to Open.
  - **Import ICS** button: two-step, file-only modal for Airbnb `.ics` import.
    Calendar URL/paste-link import is unavailable for the Sofia pilot:
    1. Download the `.ics` file, then upload it + select property + set default cleaning start time.
    2. Review parsed reservations (checkin, checkout, nights) — select which ones to import.
    3. Confirm: creates one Draft cleaning job per selected checkout date via `POST /api/marketplace/jobs/`.
- Pending hosts see a gold warning banner but can still view the UI.

### Signup flow (`/signup`)

- Signup is a single client-side React wizard at `/signup`; normal Continue/Back actions do not navigate to new pages.
- Old step URLs (`/signup/confirm-email`, `/signup/role`, `/signup/location`, `/signup/personal-info`, `/signup/native-language`, `/signup/experience`) redirect to `/signup`.
- Motion (`motion/react`) powers step transitions. Keep transitions compact and respect reduced-motion behavior.
- The auth panel, logo, heading area, and progress bar should stay visually stable while only the form content changes.
- Step 1: first/last name, email, password + confirmation, custom field validation, and live password checklist.
- Step 2: sends a Resend email containing a 6-digit code and verifies it before role selection.
- Progress starts at `Choose account type`, not during credentials or email confirmation.
- Cleaner flow after role selection: personal information → location/service areas → native language → experience → introduction → profile photo → final `POST /api/accounts/signup/`.
- Host/agency flow after role selection: location/service areas → final `POST /api/accounts/signup/`.
- Cleaner required fields: birth date proving age 18+, sex, native language, experience level, work preference, and at least one preferred time slot.
- UI-only Google and Apple buttons are present but not connected to OAuth.
- When changing signup for Cleaner, Host, or Agency, update frontend state/payloads, backend models, migrations, serializer validation, profile serializers, admin/profile visibility when needed, and tests together.

### Cleaner dashboard (`/cleaner`)

- Calendar view with open jobs, applications, and assignments.
- Open jobs list with apply action gated by account approval and cleaner verification.
- Applications and assigned jobs views.
- Profile forms with:
  - shared `Save changes` action and 5-second success message near the save button.
  - account/personal info with profile-image crop overlay.
  - location management through city selection + `Add districts` dual-list overlay (drag/drop) and service-area tags.
  - experience fields including driving-license and conditional own-car inputs.
  - other-languages dual-list overlay and selected-language tags.
  - extra-services-offered toggle switches.
- Cleaner signup captures birth date, calculated age, sex, native language, experience level, introduction, optional profile photo, and any future verification fields added to the profile schema.

### CSS conventions

All pages use plain CSS in `frontend/app/globals.css`. No external CSS libraries.

CSS variable reference:
```
--brand: #ff385c    primary CTA colour
--teal: #008489     trust, cleaner, success
--gold: #b7791f     warnings, ratings, assigned
--ink: #111111      strong headings
--muted: #6a6a6a    secondary text
--line: #dddddd     borders
--surface: #ffffff  card backgrounds
--radius: 8px
```

Naming conventions:
- Public landing: no prefix, or `.hero-*`, `.section`, `.trust-*`, `.join-*`
- Auth pages: `.auth-*`
- Generic workspace: `.app-*`
- Admin panel: `.admin-*`
- Host dashboard: `.host-*`
- Modals: `.host-modal-backdrop` → `.host-modal` → `.host-modal-header` + `.host-form`
- ICS import modal: `.host-ics-*`

When building a new role dashboard (cleaner, agency), follow the host pattern:
1. Create `frontend/app/{role}/page.tsx` with auth gate, role check, and data fetch.
2. Add `.{role}-*` CSS classes to the bottom of `globals.css` following the same structure as `.host-*`.
3. Update the redirect in `frontend/app/app/page.tsx` to redirect that role.
4. Update the header link in `frontend/app/page.tsx` for that role.

## Current Backend Behavior

The backend has initial domain models, migrations, admin registrations, serializers, viewsets, and service functions.

Implemented service-level behavior:

- Signup, login, logout, and current-user APIs using Django sessions.
- Public read-only location APIs: `GET /api/locations/cities/`, `GET /api/locations/cities/<city_slug>/zones/`, and `GET /api/locations/cities/<city_slug>/zones.geojson/`.
- Pending, approved, rejected, and suspended account status.
- Admin approval, rejection, and suspension actions.
- **Email-code confirmation before account creation** — `POST /api/accounts/signup/email-code/` creates a hashed 6-digit code record and `send_signup_email_code` sends it through Resend only. `POST /api/accounts/signup/verify-email-code/` returns the token required by final signup.
- Cleaner signup persistence includes `birth_date`, `sex`, `native_language`, `experience_level`, `bio`, and optional `profile_image`.
- Host and agency signup payloads create their role profiles from location/service-area data. Add fields only with corresponding migrations and serializer/test updates.
- **Admin email notification on new account signup** — `send_admin_new_account_email` Celery task sends email to all `role=admin` or `is_staff=True` users with a direct link to the pending-tab admin panel. Retries up to 3 times on SMTP failure.
- Agency profile, invitation, membership, and member assignment APIs.
- Cookie consent records for essential, analytics, and marketing choices.
- **ICS file parsing** — `POST /api/properties/parse-ics/` accepts only a
  multipart-uploaded `.ics` file from an active approved host or platform admin.
  It enforces 1 MiB/1,000-event/string bounds, parses in memory, filters blocked
  placeholders, returns the unchanged
  `[{uid, summary, checkin, checkout, nights}]` shape, is user-throttled at
  30/hour, audits metadata-only outcomes, and sends private/no-store headers.
  There is no server-side calendar URL-fetch route. External-calendar tasks are
  intentionally network-inert during Stage 1.
- Publish draft cleaning jobs.
- Allow marketplace-eligible cleaners and approved agencies to apply to open jobs.
- Allow hosts/admins to accept one application.
- Allow assigned agencies to delegate accepted work to active member cleaners.
- Reject competing applications after assignment.
- Mark assigned jobs complete with timing guards: cleaners can mark done after the scheduled start time; hosts/admins can complete after the scheduled end time.
- Prevent duplicate jobs for the same property at the exact same start and end time.
- Allow two-way reviews only after completion.
- Update cleaner rating summaries after reviews.

Placeholder integrations (not complete):

- Google Calendar sync is a placeholder.
- SMS dispatch is a placeholder.
- Object storage is planned for future file/photo/document uploads.
- iCal export (for host/cleaner calendars) is planned.

## Email Configuration

Email dispatch uses Resend only for signup confirmation codes. Django's configurable mail backend remains available for non-signup emails.

The `send_admin_new_account_email` task reads `settings.FRONTEND_URL` to build the approval link. The `send_signup_email_code` task reads `settings.EMAIL_RESEND_APIKEY` and `settings.EMAIL_RESEND_FROM_EMAIL`.

When `celery` is not installed locally, the task runs synchronously via the `_FakeTask` fallback stub in `apps/notifications/tasks.py`.

## Git Setup Note

If Git commands fail with `detected dubious ownership`, run:

```powershell
git config --global --add safe.directory "C:/Users/d.yordanov/OneDrive - Intelligent Systems Bulgaria Ltd/Personal/Personal Projects/AirBnbMarketplace/airbnb_tax"
```

Current local path used in this workspace:

```powershell
git config --global --add safe.directory "C:/Users/35987/Desktop/airbnb_tax"
```

## Testing Expectations

When code exists, test coverage should focus on:

- Job lifecycle transitions.
- Cleaner verification and permissions.
- Application and assignment rules.
- Calendar conflict detection.
- iCal parsing (blocked-date filtering, date normalization, sorting).
- Google Calendar and iCal sync behavior.
- Notification triggers, especially `send_signup_email_code` and `send_admin_new_account_email`.
- Review eligibility and two-way review constraints.
- Admin moderation actions.
- Email task retry behavior on Resend/API failure.

Every change to business logic, data models, API permissions, migrations, or background tasks should include tests or a clear explanation for why tests were not added.

Mock `_send_resend_email` in signup-code tests. Use `django.core.mail.backends.locmem.EmailBackend` only for Django mail-backend tests. Call Celery tasks via `.apply(args=[...])` for synchronous test execution without a broker.

## Documentation Expectations

Update documentation in the same change when modifying:

- Business strategy, target users, marketplace assumptions, monetization hypotheses, launch strategy, or success metrics.
- Architecture boundaries.
- User workflows.
- Data model concepts.
- API behavior.
- Local development commands.
- Deployment assumptions.
- External integrations.

Documentation roles:

- `BUSINESS.md` defines the business strategy, target market, value proposition, marketplace model, monetization hypotheses, success metrics, risks, and open business questions.
- `architecture.md` defines technical architecture, domain boundaries, data concepts, integrations, and future service extraction.
- `DEV.md` defines developer setup, project conventions, expected stack, and maintenance expectations.
- `AGENT.md` defines how AI and developer agents should work in the repository.
