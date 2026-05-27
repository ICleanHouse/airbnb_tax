# Architecture

## Restart Handoff

Production hosting changes have been added, but Docker Desktop needs a Windows restart before build/start verification. See `CURRENT_PROGRESS.md`.

## Overview

The application is a service-ready modular marketplace for Bulgarian Airbnb and short-term rental hosts who need reliable cleaners.

The v1 architecture is a modular Django backend with a Next.js PWA frontend. This keeps the first build practical while preserving clear domain boundaries that can later be extracted into independently deployed microservices.

The app calendar is the source of truth. External calendars, including Airbnb iCal feeds and Google Calendar, sync into or out of the application.

The public landing page is the entry point. Authenticated host, cleaner, and admin workspaces live behind separate authenticated routes.

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

- `apps.accounts`: users, host profiles, cleaner profiles, agency profiles, agency invitations, agency memberships, cookie consent, email verification state, and role permissions. On every new signup, confirmation email and admin notification tasks are dispatched via Celery.
- `apps.properties`: host properties, external calendar connections, reservations, and iCal file parsing (`POST /api/properties/parse-ics/`).
- `apps.marketplace`: cleaning batches, jobs, applications, assignments, and marketplace workflow services.
- `apps.calendars`: conflict checks and placeholder background sync tasks.
- `apps.feedback`: two-way reviews and cleaner reputation updates.
- `apps.notifications`: in-app notification records, Gmail/SMTP email dispatch via Django's mail backend, new-user confirmation email, and Celery task for admin signup alerts.

### Backend — `backend/config/`

- `settings.py`: Django settings. Environment variables are loaded automatically from `.env` at startup via `python-dotenv`. Key settings include:
  - `DATABASE_URL`: absent → SQLite (local); present → PostgreSQL (Docker/production).
  - `EMAIL_BACKEND`: `console.EmailBackend` by default; switch to `smtp.EmailBackend` in production.
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`: SMTP credentials.
  - `DEFAULT_FROM_EMAIL`: sender address for outbound emails.
  - `FRONTEND_URL`: base URL of the frontend, used to build links in outbound emails (e.g. approval links).
  - `BACKEND_URL`: base URL used to build email confirmation links.
  - `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`: Redis connection strings.
- `celery.py`: Celery application wiring.
- `manage.py`, `wsgi.py`, `asgi.py`: all load `.env` via `python-dotenv` before Django starts.

### Frontend — `frontend/`

- `frontend/lib/api.ts`: shared HTTP client. All pages use `apiFetch` — it injects `Content-Type: application/json` for string bodies only (not FormData), reads the Django `csrftoken` cookie, and sets `X-CSRFToken` on state-changing requests. Never call `fetch` directly.
- `frontend/next.config.mjs`: `trailingSlash: true` + two `/api/:path*` rewrite rules that proxy to the Django backend while preserving trailing slashes for `APPEND_SLASH` compatibility.
- `frontend/app/page.tsx`: public landing page. Auth-aware header shows role-correct dashboard link (`/admin` for admins, `/host` for hosts, `/cleaner` for cleaners, `/app` fallback). Search form uses local state only — not yet connected to backend.
- `frontend/app/login/page.tsx`: session login — redirects to `/` on success.
- `frontend/app/signup/page.tsx`, `frontend/app/signup/role/page.tsx`, `frontend/app/signup/location/page.tsx`: signup flow is being migrated to multi-step onboarding (`/signup` -> `/signup/role` -> `/signup/location`) with custom validation, role selection, and location selection. Cleaner signup is still not finished end-to-end.
- `frontend/app/app/page.tsx`: generic authenticated workspace. Automatically redirects hosts to `/host` and admins to `/admin`. For cleaners and agencies shows account status.
- `frontend/app/admin/page.tsx`: admin account approval panel. Lists all accounts, filters by pending / approved / all. Supports `?filter=pending` URL param to pre-select a tab (used in approval email links). Approve and reject actions call `POST /api/accounts/users/{id}/approve/` and `/reject/`. Accessible to `admin` role only.
- `frontend/app/host/page.tsx`: host dashboard with two sections toggled in the topbar:
  - **Properties** — lists host properties as cards with job counts. "Add property" modal POSTs to `POST /api/properties/properties/`.
  - **Jobs & Calendar** — custom month calendar grid with coloured status dots per day. "Post a job" modal POSTs to `POST /api/marketplace/jobs/` (saved as Draft). Publish button calls `POST /api/marketplace/jobs/{id}/publish/` to transition Draft → Open. **"Import ICS"** button opens a two-step modal: upload an Airbnb `.ics` file → review parsed reservations → bulk-create draft cleaning jobs (one per selected checkout date) via repeated `POST /api/marketplace/jobs/`.
- `frontend/app/cleaner/page.tsx`: cleaner dashboard with calendar, open jobs, applications, assigned jobs, profile edit form, service-area dropdown, sex dropdown, and profile picture upload preview.
- `frontend/app/components/CookieConsentBanner.tsx`: consent-first GDPR cookie banner.
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
- Email confirmation and admin email notification on new account signup.

Rules:

- Pending users can log in and complete onboarding, but cannot post jobs, apply for jobs, accept assignments, or assign agency work.
- Property owners are stored with the `host` role value and presented in the UI as "Property owner".
- Cleaners who work for an agency remain separate users with their own cleaner profile and calendar.
- Agencies invite cleaners into their group; cleaners accept invitations from their own account.
- Email confirmation is implemented for signup. SMS code verification remains planned.

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
- Availability.
- Verification state.
- Public rating summary.
- Work preferences.

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

### Marketplace Jobs

Responsibilities:

- Single cleaning job creation.
- Monthly batch creation.
- Bulk job creation from iCal reservation imports.
- Job search and filtering.
- Job lifecycle state transitions.
- Assignment rules.
- Agency assignment delegation to an active member cleaner.
- Cancellation and dispute flags.

Recommended job lifecycle:

```text
draft -> open -> assigned -> completed
              -> cancelled
assigned -> disputed
```

Applications exist between `open` and `assigned`. A job should have at most one accepted cleaner assignment.

### Applications

Responsibilities:

- Cleaner applications to jobs or monthly batches.
- Proposed price or note when needed.
- Host acceptance or rejection.
- Application history for audit and admin review.

Payments are not processed in v1. The app may store proposed and agreed EUR amounts for visibility, but money moves outside the platform.

### Calendar

Responsibilities:

- Internal job and availability calendar.
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
- Email notifications via Django's mail backend (SMTP in production, console in development).
- SMS notifications for urgent workflow events (placeholder).

Implemented notification triggers:

- **New account signup** → `send_account_confirmation_email` Celery task sends the new user an HTML email with a confirmation button. The link marks `email_verified_at` and redirects to `FRONTEND_URL/login?email_confirmed=1`.
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
- Cleaner profile (verification status, service areas, rating summary).
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
- Audit log (for verification changes, assignment cancellations, dispute transitions, review moderation).

Use explicit audit logging for important marketplace decisions.

## API Shape

REST APIs through Django REST Framework.

### Current API routes

| Route | Notes |
|---|---|
| `GET /api/health/` | Health check |
| `POST /api/accounts/signup/` | Creates user + auto-login. Fires user confirmation email and admin email notification. |
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
| `GET/POST /api/accounts/agencies/` | Agency profiles |
| `POST /api/accounts/agencies/{id}/invite-cleaner/` | Agency: invite a cleaner |
| `GET /api/accounts/agency-invitations/` | List invitations |
| `POST /api/accounts/agency-invitations/{id}/accept/` | Cleaner: accept invitation |
| `GET /api/accounts/agency-memberships/` | List memberships |
| `GET/POST /api/properties/properties/` | Host properties CRUD |
| `GET/POST /api/properties/calendar-connections/` | External calendar connections |
| `GET/POST /api/properties/reservations/` | Reservation records |
| `POST /api/properties/parse-ics/` | Parse uploaded Airbnb `.ics` file → returns `[{uid, summary, checkin, checkout, nights}]`. Filters blocked dates automatically. |
| `GET/POST /api/marketplace/batches/` | Monthly cleaning batches |
| `GET/POST /api/marketplace/jobs/` | Cleaning jobs CRUD |
| `POST /api/marketplace/jobs/{id}/publish/` | Transition Draft → Open |
| `GET/POST /api/marketplace/applications/` | Cleaner applications |
| `POST /api/marketplace/applications/{id}/accept/` | Host: accept application → creates assignment |
| `GET/POST /api/marketplace/assignments/` | Assignments |
| `POST /api/marketplace/assignments/{id}/assign-member/` | Agency: delegate to member cleaner |
| `GET/POST /api/feedback/reviews/` | Two-way reviews (post-completion only) |
| `GET /api/notifications/notifications/` | In-app notifications |
| `GET /api/calendars/conflicts/` | Calendar conflict check |
| `/admin/` | Django admin interface |

## Background Work

Celery tasks for work that should not block HTTP requests:

| Task | Status |
|---|---|
| `send_admin_new_account_email` | ✅ Implemented — emails all admins on signup with approval link |
| `send_account_confirmation_email` | ✅ Implemented — emails new users a confirmation link |
| `dispatch_notification` | Placeholder — provider integration pending |
| iCal feed polling | Placeholder — provider/schedule pending |
| Google Calendar sync | Placeholder — OAuth flow pending |
| Calendar conflict checks | Placeholder |
| SMS sending | Placeholder |
| Review prompt scheduling | Placeholder |
| Retry of failed integration jobs | Placeholder |

Background tasks are idempotent where possible and safe to retry. Signup email tasks retry up to 3 times with 60-second delays on SMTP failure.

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
- Centralized logs.
- Error tracking.
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
| `EMAIL_BACKEND` | `console.EmailBackend` | Django email backend class; `.env.example` uses Gmail SMTP |
| `EMAIL_HOST` | *(empty)* | SMTP server hostname, e.g. `smtp.gmail.com` |
| `EMAIL_PORT` | `587` | SMTP port |
| `EMAIL_USE_TLS` | `true` | Enable STARTTLS |
| `EMAIL_HOST_USER` | *(empty)* | SMTP username |
| `EMAIL_HOST_PASSWORD` | *(empty)* | SMTP password / app password |
| `FRONTEND_URL` | `http://localhost:3000` | Base URL for links in outbound emails |
| `BACKEND_URL` | `http://localhost:8000` | Base URL for email confirmation links |
| `FRONTEND_TRUSTED_ORIGINS` | `http://localhost:3000,...` | CSRF trusted origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | API base URL for frontend |

Cookie controls:

- Essential auth and security cookies are always available.
- Analytics and marketing cookies require explicit consent.
- Store consent choices with policy version, consent version, timestamp, and user or anonymous visitor identifier.
- Do not activate optional customer-insight tracking before consent is recorded.
