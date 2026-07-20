# Architecture

## Restart Handoff

See `CURRENT_PROGRESS.md` for the current production-hosting and signup-flow resume point.

## Overview

The application is a service-ready modular marketplace for Bulgarian Airbnb and short-term rental hosts who need reliable cleaners.

The v1 architecture is a modular Django backend with a Next.js PWA frontend. This keeps the first build practical while preserving clear domain boundaries that can later be extracted into independently deployed microservices.

The app calendar is the source of truth. External calendars, including Airbnb iCal feeds and Google Calendar, sync into or out of the application.

The public landing page is the entry point. Signup lives at a single React route (`/signup`) with animated wizard steps. Authenticated host, cleaner, and admin workspaces live behind separate authenticated routes.

## Architecture Style

Modular monolith for v1:

- One deployable backend API.
- One primary PostgreSQL database (SQLite for local dev without Docker).
- Redis for cache, locks, and Celery broker/result needs.
- Celery workers for asynchronous email, sync, and notification work.
- One Next.js frontend serving the public landing page and authenticated host, cleaner, and admin experiences.

The code is organised around business domains, not technical layers. Domain modules communicate through explicit service functions and events rather than reaching into each other's internals.

Future extraction into microservices should be possible without rewriting core business logic.

## Current Implementation Modules

### Backend — `backend/apps/`

- `apps.accounts`: users, host profiles, cleaner profiles, agency profiles, agency invitations, agency memberships, cookie consent, signup email-code verification state, and role permissions. New account creation requires a verified signup email token; admin notification tasks are dispatched via Celery after signup.
- `apps.properties`: host properties, inert external calendar connection data,
  reservations, and bounded file-only iCal parsing
  (`POST /api/properties/parse-ics/`). There is no calendar URL-fetch route or
  runtime network client in the Stage 1 calendar domain.
- `apps.marketplace`: cleaning batches, jobs, applications, assignments, and marketplace workflow services.
- `apps.calendars`: conflict checks and deliberately network-inert placeholder
  background sync tasks.
- `apps.feedback`: two-way reviews and cleaner reputation updates.
- `apps.notifications`: in-app notification records, Resend-only signup-code email delivery, Django mail-backend admin emails, and Celery task for admin signup alerts.
- `apps.locations`: canonical cities, service zones, optional GeoJSON district geometry, and public read-only location APIs for city/district selectors.
- `apps.core`: timestamp base model, request-ID middleware, JSON logging helpers,
  read-only `AuditLog`, health check, CSRF failure view, and reusable Stage 1
  image decoding/normalization policies.

### Backend — `backend/config/`

- `settings.py`: Django settings. Environment variables are loaded automatically from `.env` at startup via `python-dotenv`. Key settings include:
  - `DATABASE_URL`: absent → SQLite (local); present → PostgreSQL (Docker/production).
  - `EMAIL_BACKEND`: Django mail backend for non-signup emails.
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`: optional SMTP credentials for non-signup emails.
  - `DEFAULT_FROM_EMAIL`: sender address for outbound emails.
  - `FRONTEND_URL`: base URL of the frontend, used to build links in outbound emails (e.g. approval links).
  - `BACKEND_URL`: base URL used by legacy email-confirmation links.
  - `EMAIL_RESEND_APIKEY`, `EMAIL_RESEND_FROM_EMAIL`: Resend signup-code delivery settings.
  - `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`: Redis connection strings.
  - `CACHE_URL`: required Redis-backed shared cache in deployed environments;
    local development and tests use LocMem. The manual ICS throttle uses this
    cache and is keyed by authenticated user.
  - `APP_ENV`, `LOG_LEVEL`, `SENTRY_DSN`: JSON logging and backend/Celery crash reporting.
- `celery.py`: Celery application wiring.
- `manage.py`, `wsgi.py`, `asgi.py`: all load `.env` via `python-dotenv` before Django starts.

### Frontend — `frontend/`

- `frontend/lib/api.ts`: shared HTTP client. All pages use `apiFetch` — it injects JSON `Content-Type` only when safe, sets CSRF headers, adds a normalized `X-Request-ID` (`req_` plus 32 lowercase hexadecimal characters), forces no-store, and reports failed API responses through a controlled telemetry allowlist when configured. Never call `fetch` directly.
- `frontend/next.config.mjs`: `trailingSlash: true` + two `/api/:path*` rewrite rules that proxy to the Django backend while preserving trailing slashes for `APPEND_SLASH` compatibility.
- `frontend/app/page.tsx`: public landing page. Auth-aware header shows the role-correct dashboard link and, for authenticated users, the shared notification bell plus profile-icon menu containing Profile, persistent BG/EN language slider, and Log out. The first screen has a centered hero and audience toggle: `Find a cleaner` renders the shared `CleanerBrowser` (`/api/accounts/public-cleaners/`, city/district filters), while `Find cleaning work` renders aggregate supply/demand counts and canonical district demand.
- `frontend/components/OpenJobMap.tsx`: compatibility-named aggregate demand component for the landing page. It loads canonical `GET /api/marketplace/public-demand/?city=sofia` and renders canonical Sofia zone/count rows. It has no job/property marker, coordinate, media, address, schedule, price, host, or application contract. `/open-job-locations/` is a deprecated response-compatible alias only.
- `frontend/app/login/page.tsx`: session login — redirects to `/` on success.
- `frontend/app/signup/page.tsx`: single-route signup wizard. It handles credentials, Resend 6-digit email-code verification, role selection, cleaner personal details, location/service-area selection, native language, experience, introduction, profile photo, and final account creation without full page reloads between steps. It uses Motion (`motion/react`) for reusable panel transitions. Refresh recovery is 24-hour `sessionStorage` state built from the explicit `version`, `savedAt`, `role`, `citySlug`, `selectedZoneIds`, and `experienceLevel` allowlist; credentials, codes, tokens, identity/profile data, errors, and responses remain memory-only and refresh empty.
- `frontend/app/signup/confirm-email/page.tsx`, `frontend/app/signup/role/page.tsx`, `frontend/app/signup/location/page.tsx`, `frontend/app/signup/personal-info/page.tsx`, `frontend/app/signup/native-language/page.tsx`, `frontend/app/signup/experience/page.tsx`: lightweight compatibility redirects to `/signup`.
- `frontend/app/app/page.tsx`: generic authenticated workspace. Automatically redirects hosts to `/host` and admins to `/admin`. For cleaners and agencies shows account status.
- `frontend/app/admin/page.tsx`: admin account approval panel. Lists all accounts, filters by pending / approved / all. Supports `?filter=pending` URL param to pre-select a tab (used in approval email links). Approve and reject actions call `POST /api/accounts/users/{id}/approve/` and `/reject/`. Accessible to `admin` role only.
- `frontend/app/host/page.tsx`: host dashboard with two sections toggled in the topbar:
  - **Properties** — lists host properties as cards with job counts. "Add property" modal POSTs to `POST /api/properties/properties/`.
  - **Jobs & Calendar** — custom month calendar grid with coloured status dots per day. "Post a job" modal POSTs to `POST /api/marketplace/jobs/` (saved as Draft). Publish button calls `POST /api/marketplace/jobs/{id}/publish/` to transition Draft → Open. **"Import ICS"** is file-only during the pilot: upload a downloaded Airbnb `.ics` file → review parsed reservations → bulk-create draft cleaning jobs (one per selected checkout date) via repeated `POST /api/marketplace/jobs/`. Calendar-link import is unavailable.
- `frontend/app/cleaner/page.tsx`: cleaner dashboard with calendar, open jobs, applications, assigned jobs, and modular profile forms (city-scoped service areas, district map/checklist selector overlay, other-languages overlay, profile-image crop editor, driving-license/own-car inputs, and extra-services toggles).
- `frontend/components/CookieConsentBanner.tsx`: consent-first GDPR cookie banner.
- `frontend/app/components/DistrictMapSelector.tsx`: reusable MapLibre district selector with selected tags and checklist fallback for city service areas. Sofia zones and both public search dropdowns share the hardcoded `frontend/lib/sofiaDistricts.ts` catalog and stable `sofia:osm-N` IDs; runtime geometry is loaded from `frontend/public/maps/sofia/districts.geojson`.
- `frontend/app/globals.css`: single CSS file for all routes using plain CSS variables and named component classes. No CSS library.

### Not yet built

- `/agency` — agency dashboard (manage members, view jobs).
- Applications review panel inside the host dashboard (host sees applications per job, accepts one).
- Cleaner verification flow in the admin panel.
- Real search connected to the backend cleaner/agency API.
- Google Calendar sync (backend placeholder exists in `apps/calendars/`).

## Product Domains

### Identity and Access

Responsibilities:

- User authentication.
- Property owner, cleaner, agency, and admin roles.
- Django session-cookie authentication with CSRF protection for the v1 web app.
- Account approval states: pending, approved, rejected, and suspended.
- Profile data.
- Cleaner verification status.
- Agency profiles, agency invitations, and agency-cleaner memberships.
- Cookie consent records for essential, analytics, and marketing choices.
- Permissions and role-based API access.
- Email-code confirmation before account creation and admin email notification after new account signup.
- Signup wizard state, including role-specific final payload construction.

Rules:

- Pending users can log in and complete onboarding, but cannot post jobs, apply for jobs, accept assignments, or assign agency work.
- Property owners are stored with the `host` role value and presented in the UI as "Property owner".
- Cleaners who work for an agency remain separate users with their own cleaner profile and calendar.
- Agencies invite cleaners into their group; cleaners accept invitations from their own account.
- Email-code confirmation is implemented for signup. SMS code verification remains planned.
- Normal signup stays on `/signup`; old signup step routes exist only as redirects.
- Signup UI fields must map to backend serializer fields and persistent profile fields. When Cleaner, Host, or Agency onboarding changes, update models, migrations, serializer validation, profile serializers, frontend payloads, and tests in the same change.

### Hosts and Properties

Responsibilities:

- Host-owned properties.
- Property address and access metadata.
- Cleaning instructions.
- Default cleaning duration and pricing hints.
- Linked external calendars for each property.
- Parsing uploaded Airbnb iCal files to extract reservation checkout dates for job creation.

### Cleaners

Responsibilities:

- Cleaner profile.
- Service areas.
- Verification state.
- Public rating summary.
- Native language and experience level.
- Other languages and extra services offered.

Service-area selection now has a canonical location foundation. `apps.locations` exposes active cities, city-scoped service zones, and optional GeoJSON polygons. Sofia has 144 stable `sofia:osm-1` through `sofia:osm-144` zones whose exact canonical names preserve `кв.` and `ж.к.` prefixes. Cleaner profile editing and public search use zone IDs internally while `CleanerProfile.service_areas` currently stores canonical district-name strings. Old Sofia aliases and the obsolete Sofia backend fixture are intentionally removed.

### Agencies

Responsibilities:

- Agency profile and service areas.
- Cleaner invitations and agency membership management.
- Agency-level job applications.
- Assigning accepted agency work to active member cleaner calendars.

Rules:

- Agencies must be approved before applying for jobs or assigning work.
- Agencies can assign work only to active cleaner members.
- Member cleaners must still have approved accounts and verified cleaner profiles before receiving agency work.
- Once an accepted agency assignment is delegated to a member cleaner, the normal agency API cannot replace that member. The delegated cleaner owns calendar and operational responsibility, so reassignment needs a separate explicit admin/support workflow with reason and notification semantics.

### Marketplace Jobs

Responsibilities:

- Single cleaning job creation.
- Monthly batch creation.
- Bulk job creation from iCal reservation imports.
- Job search and filtering.
- Job lifecycle state transitions.
- Assignment rules.
- Agency assignment delegation to an active member cleaner; normal delegation is immutable after the first assigned member.
- Cancellation and dispute flags.

Recommended job lifecycle:

```text
draft -> open -> assigned -> completed
              -> cancelled
assigned -> disputed
```

Applications exist between `open` and `assigned`. A job should have at most one accepted cleaner assignment.

Rules:

- A property cannot have two jobs with the exact same `scheduled_start` and `scheduled_end`.
- Assigned jobs use two-sided completion: cleaners can mark done once `scheduled_start` is in the past, while hosts and admins can complete only once `scheduled_end` is in the past.

### Favourite Cleaners

Responsibilities:

- Host-owned saved cleaner list.
- Idempotent save behavior for duplicate `(host, cleaner)` requests.
- Safe serialization for authenticated host views.

Rules:

- New favourites can target only public marketplace-eligible cleaners: role `cleaner`, active user, approved account, existing cleaner profile, and verified cleaner status.
- Hosts cannot favourite pending, rejected, suspended, inactive, unverified, missing-profile, host, agency, or admin targets.
- Historical favourites are retained if the cleaner later becomes unavailable. They remain visible to the owning host through the existing safe favourite fields and are not automatically deleted.

### Applications

Responsibilities:

- Cleaner applications to jobs or monthly batches.
- Proposed price or note when needed.
- Host acceptance or rejection.
- Application history for audit and admin review.

Payments are not processed in v1. The app may store proposed and agreed EUR amounts for visibility, but money moves outside the platform.

### Calendar

Responsibilities:

- Internal cleaning-job calendar.
- Reservation import from uploaded iCal (.ics) files — parsing done by `ParseIcsView`, job creation done by the host from the parsed results.
- Google Calendar sync (placeholder).
- iCal export for hosts and cleaners (planned).
- Conflict detection.
- Reminder scheduling.

Rules:

- Internal calendar is the source of truth for cleaning jobs.
- Use `Europe/Sofia` for default timezone handling.
- Store timestamps in UTC.
- Surface conflicts instead of silently overwriting external events.
- Keep sync failures visible to the affected user and admins.

### Notifications

Responsibilities:

- In-app notifications.
- Signup email confirmation through Resend only. Other notification email paths use Django's mail backend until they are migrated.
- SMS notifications for urgent workflow events (placeholder).

Implemented notification triggers:

- **Signup email-code request** → `send_signup_email_code` Celery task sends a 6-digit code through Resend only. The server stores only a hash of the code.
- Signup email HTML is rendered from `backend/apps/notifications/templates/notifications/signup_code_email.html`.
- **New account signup** → `send_admin_new_account_email` Celery task sends an email to all `role=admin` or `is_staff=True` users with a direct link to the admin approval panel (`FRONTEND_URL/admin?filter=pending`).

Planned notification triggers:

- Cleaner application submitted.
- Host accepts or rejects an application.
- Assignment created or cancelled.
- Calendar sync failure.
- Upcoming cleaning reminder.
- Review prompt after completion.

### Feedback and Reputation

Responsibilities:

- Two-way reviews after completed jobs.
- Host-to-cleaner ratings.
- Cleaner-to-host/property ratings.
- Private issue reporting.
- Admin review and moderation.

Reviews should only be created for completed jobs by parties involved in that job.

### Admin

Responsibilities:

- Cleaner verification.
- Review moderation.
- Dispute inspection.
- Job and application visibility.
- User support and account status management.
- Receiving email notifications when new accounts are created.

## Core Data Concepts

The implemented schema covers these concepts:

- User account (role, account status, approval metadata, language preference).
- Host profile.
- Cleaner profile (verification status, city, service areas, birth date, calculated age, sex, native language, other languages, personal preferences/extra services, experience level, education, driving-license details, own-car status, smoker status, rating summary).
- Agency profile (company name, service areas, member count).
- Agency invitation (token, expiry, status).
- Agency membership (status, active/revoked).
- Cookie consent (essential, analytics, marketing; visitor or user).
- Property (address, city, country, timezone, default cleaning duration, default price).
- External calendar connection (provider, direction, feed URL, sync status).
- Reservation (source, external UID, guest name, dates).
- Cleaning job (property, title, schedule, price, status, description).
- Monthly cleaning batch.
- Cleaner application (job or batch, proposed price, message, status).
- Assignment (accepted application, assigned cleaner or agency member).
- Review (two-way, rating, comment, post-completion only).
- Notification (channel, type, title, body, read/sent timestamps).
- AuditLog (implemented in `apps.core`; append-only admin history for key account/marketplace actions).

Use explicit audit logging for important marketplace decisions.

## API Shape

REST APIs through Django REST Framework.

### Current API routes

| Route | Notes |
|---|---|
| `GET /api/health/` | Health check |
| `POST /api/accounts/signup/email-code/` | Sends a 6-digit signup email confirmation code. |
| `POST /api/accounts/signup/verify-email-code/` | Verifies the 6-digit code and returns `email_verification_token`. |
| `POST /api/accounts/signup/` | Creates user + role profile + auto-login after email-code verification. Host/agency payloads include location/service-area data. Cleaner payloads include personal information, native language, other languages, driving-license/own-car details, experience, introduction, and profile photo. Fires admin email notification. |
| `GET /api/accounts/confirm-email/{uidb64}/{token}/` | Confirms user email and redirects to frontend login. |
| `POST /api/accounts/login/` | Session login |
| `POST /api/accounts/logout/` | Session logout |
| `GET /api/accounts/me/` | Current authenticated user |
| `GET/POST /api/accounts/cookie-consent/` | Cookie consent record |
| `GET /api/accounts/users/` | Admin: list all users |
| `POST /api/accounts/users/{id}/approve/` | Admin: approve account |
| `POST /api/accounts/users/{id}/reject/` | Admin: reject account |
| `POST /api/accounts/users/{id}/suspend/` | Admin: suspend account |
| `GET/POST /api/accounts/hosts/` | Host profiles |
| `GET/POST /api/accounts/cleaners/` | Cleaner profiles |
| `GET /api/accounts/public-cleaners/` | Public verified-cleaner directory. Safe fields only; supports `city`, `service_area`, `min_rating`, and `q` filters. |
| `GET /api/accounts/public-cleaners/{id}/` | Public cleaner detail with dedicated public reviews; no job/reviewer/reviewee IDs or private issues. |
| `GET/POST /api/accounts/agencies/` | Agency profiles |
| `POST /api/accounts/agencies/{id}/invite-cleaner/` | Agency: invite a cleaner |
| `GET /api/accounts/agency-invitations/` | List invitations |
| `POST /api/accounts/agency-invitations/{id}/accept/` | Cleaner: accept invitation |
| `GET /api/accounts/agency-memberships/` | List memberships |
| `GET/POST /api/properties/properties/` | Host properties CRUD |
| `GET/POST /api/properties/calendar-connections/` | External calendar connections |
| `GET/POST /api/properties/reservations/` | Reservation records |
| `POST /api/properties/parse-ics/` | Active approved host/admin: parse a bounded multipart `.ics` file in memory → returns the unchanged `[{uid, summary, checkin, checkout, nights}]` shape. User-throttled, audited, private/no-store; filters blocked dates. |
| `GET/POST /api/marketplace/batches/` | Monthly cleaning batches |
| `GET/POST /api/marketplace/jobs/` | Cleaning jobs CRUD |
| `GET /api/marketplace/area-stats/` | Public aggregate cleaner/host/open-job counts for a canonical city. |
| `GET /api/marketplace/public-demand/` | Canonical public city/zone open-job counts only; no per-job or property fields. |
| `GET /api/marketplace/open-job-locations/` | Deprecated compatibility alias returning the identical safe aggregate body; sunset 2026-10-15. |
| `POST /api/properties/images/` | Decode a bounded single-frame JPEG/PNG/WebP, strip metadata, resize, and store a generated-name JPEG for the host-owned property. |
| `GET/HEAD /api/properties/images/{id}/content/` | Object-authorized property-image stream with private/no-store and nosniff headers; no raw storage redirect/path. |
| `POST /api/marketplace/jobs/{id}/publish/` | Transition Draft → Open |
| `POST /api/marketplace/jobs/{id}/complete/` | Mark assigned work complete. Cleaner side allowed after start time; host/admin side allowed after end time. |
| `GET/POST /api/marketplace/applications/` | Cleaner applications |
| `POST /api/marketplace/applications/{id}/accept/` | Host: accept application → creates assignment |
| `GET/POST /api/marketplace/assignments/` | Assignments |
| `POST /api/marketplace/assignments/{id}/assign-member/` | Agency: delegate to member cleaner; immutable after first delegation |
| `GET/POST/DELETE /api/marketplace/favourites/` | Host saved cleaners; create targets public marketplace-eligible cleaners only |
| `GET /api/connections/{id}/shared/` | Accepted connection; active/approved requester and worker-requester eligibility; no-store current-assignment safe projection |
| `GET/POST /api/feedback/reviews/` | Two-way reviews (post-completion only) |
| `GET /api/notifications/notifications/` | In-app notifications |
| `GET /api/calendars/conflicts/` | Calendar conflict check |
| `/admin/` | Django admin interface |

## Background Work

Celery tasks for work that should not block HTTP requests:

| Task | Status |
|---|---|
| `send_admin_new_account_email` | ✅ Implemented — emails all admins on signup with approval link |
| `send_signup_email_code` | ✅ Implemented — emails new users a 6-digit signup code through Resend |
| `send_account_confirmation_email` | Legacy — link-based confirmation task retained |
| `dispatch_notification` | Placeholder — provider integration pending |
| iCal feed polling | Placeholder — provider/schedule pending |
| Google Calendar sync | Placeholder — OAuth flow pending |
| Calendar conflict checks | Placeholder |
| SMS sending | Placeholder |
| Review prompt scheduling | Placeholder |
| Retry of failed integration jobs | Placeholder |

Background tasks are idempotent where possible and safe to retry. Signup email tasks retry up to 3 times with 60-second delays on Resend/API failure.

The Celery fallback stub in `apps/notifications/tasks.py` allows all tasks to run synchronously in local dev and tests when Celery is not installed.

## Future Microservice Boundaries

If scaling requires service extraction, split along these boundaries:

- Identity service.
- Marketplace service.
- Calendar and integrations service.
- Notification service.
- Feedback and reputation service.
- Admin and moderation service.

Before extraction, communicate across modules with explicit domain events such as:

- `account.created`
- `account.approved`
- `job.created`
- `application.submitted`
- `assignment.accepted`
- `assignment.cancelled`
- `job.completed`
- `review.submitted`
- `calendar.sync_failed`

## Infrastructure Direction

Target EU managed cloud infrastructure:

- Containerized backend and worker deployments.
- Managed PostgreSQL with automated backups.
- Managed Redis.
- Managed object storage (planned for uploaded photos/documents).
- HTTP request logs accept only `req_` plus 32 lowercase hexadecimal characters
  as request IDs and record resolver endpoint templates instead of raw paths,
  queries, or actor IDs. Celery propagates normalized IDs originating in that
  request context; centralized log storage is still future work.
- Sentry error tracking when DSNs are configured.
- Basic metrics and uptime monitoring.

The system is GDPR-conscious from the start. Store only necessary personal data, avoid secrets in source control, and document retention/deletion decisions when they are implemented.

### Environment Variables Reference

| Variable | Default | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | `dev-only-change-me` | Django secret key |
| `DJANGO_DEBUG` | `true` | Debug mode |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Allowed HTTP hosts |
| `DATABASE_URL` | *(absent → SQLite)* | PostgreSQL connection string (Docker only) |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Celery broker |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/1` | Celery results |
| `DEFAULT_FROM_EMAIL` | `noreply@example.local` | Outbound email sender address |
| `EMAIL_BACKEND` | `console.EmailBackend` | Django email backend class for non-signup emails |
| `EMAIL_HOST` | *(empty)* | Optional SMTP hostname for non-signup emails |
| `EMAIL_PORT` | `587` | Optional SMTP port |
| `EMAIL_USE_TLS` | `true` | Enable STARTTLS |
| `EMAIL_HOST_USER` | *(empty)* | Optional SMTP username |
| `EMAIL_HOST_PASSWORD` | *(empty)* | Optional SMTP password |
| `EMAIL_RESEND_APIKEY` | *(empty)* | Required Resend API key for signup email-code delivery |
| `EMAIL_RESEND_FROM_EMAIL` | *(empty)* | Required verified Resend sender address for signup codes |
| `EMAIL_VER_USER_SIGNUP` | `True` | Enables or disables the signup email-code send |
| `EMAIL_VER_USER_CONFIRMATION` | `True` | Enables or disables the legacy link-based confirmation email |
| `EMAIL_NOTIF_ADMIN_NEW_ACCOUNT` | `True` | Enables or disables admin/staff new-account email alerts |
| `EMAIL_NOTIF_HOST_APPLICATION_SUBMITTED` | `True` | Enables or disables host application notification emails |
| `EMAIL_NOTIF_HOST_JOB_COMPLETED` | `True` | Enables or disables host job-completed notification emails |
| `FRONTEND_URL` | `http://localhost:3000` | Base URL for links in outbound emails |
| `BACKEND_URL` | `http://localhost:8000` | Base URL for legacy email confirmation links |

If `EMAIL_VER_USER_SIGNUP=False`, `POST /api/accounts/signup/email-code/` auto-verifies the pending signup email and returns `email_verification_token` immediately instead of dispatching a Resend email.
| `FRONTEND_TRUSTED_ORIGINS` | `http://localhost:3000,...` | CSRF trusted origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | API base URL for frontend |

Cookie controls:

- Essential auth and security cookies are always available.
- Analytics and marketing cookies require explicit consent.
- Store consent choices with policy version, consent version, timestamp, and user or anonymous visitor identifier.
- Do not activate optional customer-insight tracking before consent is recorded.
