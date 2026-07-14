# Host Cleaner Marketplace

## Restart Handoff

See `CURRENT_PROGRESS.md` for the current resume point, completed deployment work, and active signup-flow notes.

Marketplace for Bulgarian short-term rental hosts, verified cleaners, and cleaning agencies.

The MVP focuses on job posting, monthly cleaning batches, Airbnb iCal imports, cleaner applications, assignment, shared calendar coordination, email notifications, and two-way feedback. Payments are intentionally out of scope for v1.

## Documentation

- [Stage 1 Sofia Pilot Plan](docs/STAGE_1_SOFIA_PILOT_PLAN.md): canonical launch-safety, research, Sofia pilot, metrics, and Stage 1 exit plan.
- `BUSINESS.md`: business strategy, target market, monetization hypotheses, risks, and open questions.
- `architecture.md`: technical architecture and domain boundaries.
- `DEV.md`: development setup and operating guide.
- `DEPLOY.md`: production-style Docker hosting, Windows firewall, and router forwarding guide.
- `AGENT.md`: instructions for AI and developer agents.

## Stack

- Backend: Django 6.0+, Django REST Framework 3.17+, PostgreSQL 16+, Redis 7+, Celery 5.4+.
- Frontend: Next.js 15.5+ / React 19.2+ responsive web, TypeScript 5.9+, Motion for reusable React animations. PWA installability is deferred until the mobile workflow and repeat use are validated.
- Local infrastructure: Docker Compose with PostgreSQL, Redis, backend, worker, and frontend services.

## Quick Start

Copy environment defaults:

```powershell
Copy-Item .env.example .env
```

Run the full local stack:

```powershell
docker compose up --build
```

Default URLs:

- Frontend: `http://localhost:3000`
- Backend health check: `http://localhost:8000/api/health/`
- Django admin: `http://localhost:8000/admin/`

> **Local dev without Docker**: comment out `DATABASE_URL` in `.env` — Django falls back to SQLite automatically. Use `localhost` Redis URLs (`redis://localhost:6379/...`) when running Django and Celery from PowerShell.

## Host From This Machine

Production-style local hosting is defined in `docker-compose.prod.yml` with Caddy as the only public entrypoint on ports `80` and `443`. It keeps PostgreSQL, Redis, Django, Celery, and Next.js on Docker's private network.

See `DEPLOY.md` for the full Docker Desktop, Windows firewall, router forwarding, and verification steps.

## Current Implementation Status

### Backend

- Django project and domain apps (`accounts`, `properties`, `marketplace`, `calendars`, `feedback`, `notifications`).
- Session-cookie signup, login, logout, current-user APIs, and email-code confirmation with CSRF enforcement.
- Account approval states (pending / approved / rejected / suspended) and admin approve/reject/suspend actions.
- **Signup email confirmation** — Celery sends a 6-digit confirmation code through Resend only. Admin/staff accounts still receive a direct approval link after account creation.
- Agency profiles, invitations, memberships, and delegated cleaner assignments.
- Cookie consent records for optional analytics and marketing cookies.
- Property management: CRUD, external calendar connections, reservations.
- **Airbnb ICS parsing** — `POST /api/properties/parse-ics/` accepts a multipart-uploaded `.ics` file, filters blocked-date placeholders, returns parsed reservation list.
- Marketplace service functions: publish jobs, submit applications, accept applications, complete jobs, direct offers, favourites, and two-way reviews. Duplicate jobs for the same property and exact time range are rejected.
- Public work discovery: canonical `GET /api/marketplace/public-demand/?city=sofia` exposes only canonical city/zone names and aggregate open-job counts. `GET /api/marketplace/open-job-locations/` is a temporary compatibility alias with the identical safe body and a 15 October 2026 sunset. Exact property/job details are server-gated to approved workflow roles; operational property images use object-authorized API streaming and every raw `/media/*` path is denied. Approved public cleaner profile media remains an API/data value rather than `PropertyImage` storage.
- Notification records; signup email codes are sent through Resend only and require `EMAIL_RESEND_APIKEY` plus `EMAIL_RESEND_FROM_EMAIL`.
- Canonical Sofia district catalog: 144 GeoJSON-backed districts with stable `sofia:osm-1` through `sofia:osm-144` IDs. Old Sofia zone aliases and the obsolete backend fixture were removed.
- Observability: JSON backend/Celery logs with request IDs, Sentry crash reporting, and read-only `AuditLog` records for key account/marketplace actions.
- Calendar conflict API; Google Calendar sync and iCal export are planned.

### Frontend (Next.js App Router)

| Route | Status | Description |
|---|---|---|
| `/` | ✅ Done | Public landing page — auth-aware header, centered audience toggle, public cleaner browser for hosts, and canonical district-level demand counts without per-job pins |
| `/login` | ✅ Done | Session login |
| `/signup` | 🟨 In progress | Single React signup wizard with Motion transitions, Resend email code confirmation, role selection, cleaner personal details, location/service areas, native language, experience, introduction, profile photo, and final account creation. Old step URLs redirect back to `/signup`. |
| `/app` | ✅ Done | Generic workspace — auto-redirects hosts → `/host`, admins → `/admin` |
| `/admin` | ✅ Done | Admin approval dashboard — list / filter / approve / reject; reads `?filter=pending` URL param |
| `/host` | ✅ Done | Host dashboard — property CRUD, job posting, month calendar, publish jobs, **ICS import** |
| `/cleaner` | ✅ Done | Cleaner dashboard — calendar, profile forms, open jobs, offers, assignments, inline validation, host feedback, and notification deep-links |
| `/agency` | ⬜ Not built | Agency dashboard — manage members, view assigned jobs |

### Shared infrastructure

- `frontend/lib/api.ts` — `apiFetch` wrapper with automatic CSRF token injection; `Content-Type` only set for JSON string bodies (not FormData). `CurrentUser` type includes `is_platform_admin`.
- `frontend/next.config.mjs` — `trailingSlash: true` + dual rewrite rules for Django `APPEND_SLASH` compatibility.
- `frontend/app/globals.css` — CSS design tokens and shared component classes (see `DEV.md` for full reference).

### Cleaner signup details

- Signup email confirmation uses a 6-digit code delivered through Resend only.
- The email HTML is rendered from `backend/apps/notifications/templates/notifications/signup_code_email.html`.
- Per-email toggles live in `.env` / `.env.example`: `EMAIL_VER_USER_SIGNUP`, `EMAIL_VER_USER_CONFIRMATION`, `EMAIL_NOTIF_ADMIN_NEW_ACCOUNT`, `EMAIL_NOTIF_HOST_APPLICATION_SUBMITTED`, `EMAIL_NOTIF_HOST_JOB_COMPLETED`.
- When `EMAIL_VER_USER_SIGNUP=False`, the signup email-code step is bypassed and the backend returns the verification token immediately instead of sending an email.
- `/signup` stays on one browser route during onboarding. Continue and Back update React state and animate the current form out while the next form enters.
- Motion animations use `motion/react`; reduced-motion users get non-animated transitions.
- Progress tracking starts at `Choose account type`, not at credentials or email confirmation.
- Cleaner flow: choose account type → personal information → location → native language → experience → introduction → profile photo → account creation.
- Host and agency flow: choose account type → location → account creation.
- Cleaner personal info currently captures birth date with 18+ validation and sex.
- Cleaner language, experience, introduction, and optional profile photo are collected before account creation.
- Date of birth uses a compact dropdown-style calendar.
- Google and Apple buttons are UI-only placeholders; OAuth is not connected yet.
- Cleaner profile editing includes a GeoJSON-backed Sofia district map (`Add districts`), selected-district tags, other-languages management, profile image cropping, driving-license/own-car fields, `Extra services offered` toggles, inline field validation, and an account menu dropdown with the cleaner identity shown above `Profile`.
- Sofia district names shown by the cleaner-profile map and both public cleaner-search dropdowns come from the same canonical catalog and preserve exact GeoJSON names, including `кв.` and `ж.к.` prefixes. Search dropdowns are sorted by canonical Bulgarian name while retaining stable zone IDs.
- Authenticated homepage, host dashboard, and cleaner dashboard headers use the same notification-bell and profile-icon controls. Profile, logout, and the persistent BG/EN language slider live inside the profile menu.
- Cleaner profile birth date editing uses the compact calendar picker and enforces the 18+ rule during profile updates as well as signup.
- Cleaner completion flow is time-aware: the cleaner can mark done after the scheduled start time, even if the end time is still ahead; the host can confirm completion only after the scheduled end time.
- Cleaner notifications deep-link into the relevant feedback/review location in the dashboard.

### Signup database notes

- Signup payloads and profile serializers must stay aligned with the database schema for all roles.
- Cleaner signup currently requires `birth_date`, `sex`, `native_language`, and `experience_level`.
- Host signup creates/updates `HostProfile` with city data; agency signup creates/updates `AgencyProfile` with company/city/service-area data.
- Any future change to the Cleaner, Host, or Agency signup flow must include matching model fields, migrations, serializer validation, profile serialization, and signup tests.

## Email Configuration

Copy `.env.example` to `.env`, then fill in Resend values. Signup email-code delivery uses Resend only:

```dotenv
EMAIL_RESEND_APIKEY=re_...
EMAIL_RESEND_FROM_EMAIL=you@your-verified-domain.com
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
```

Use a Resend verified sender/domain for `EMAIL_RESEND_FROM_EMAIL`.

See `DEV.md` for full environment variable reference.

## Logging

- Technical logs go to stdout/Docker logs as JSON. Search by normalized
  `request_id` (`req_` plus 32 lowercase hexadecimal characters), controlled
  event, or sanitized endpoint template. Actor/business history stays in the
  separate audit log.
- Business history is stored in Django admin at `/admin/core/auditlog/`.
- Sentry is enabled only when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set.
