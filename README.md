# Host Cleaner Marketplace

## Restart Handoff

Docker Desktop requires a Windows restart before the production stack can be built and started. See `CURRENT_PROGRESS.md` for the exact resume point, completed deployment work, and next commands.

Marketplace for Bulgarian short-term rental hosts, verified cleaners, and cleaning agencies.

The MVP focuses on job posting, monthly cleaning batches, Airbnb iCal imports, cleaner applications, assignment, shared calendar coordination, email notifications, and two-way feedback. Payments are intentionally out of scope for v1.

## Documentation

- `BUSINESS.md`: business strategy, target market, monetization hypotheses, risks, and open questions.
- `architecture.md`: technical architecture and domain boundaries.
- `DEV.md`: development setup and operating guide.
- `DEPLOY.md`: production-style Docker hosting, Windows firewall, and router forwarding guide.
- `AGENT.md`: instructions for AI and developer agents.

## Stack

- Backend: Django 6.0+, Django REST Framework 3.17+, PostgreSQL 16+, Redis 7+, Celery 5.4+.
- Frontend: Next.js 15.5+ / React 19.2+ responsive web/PWA, TypeScript 5.9+.
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
- Session-cookie signup, login, logout, current-user APIs, and email confirmation links with CSRF enforcement.
- Account approval states (pending / approved / rejected / suspended) and admin approve/reject/suspend actions.
- **Signup email notifications** — Celery sends a confirmation email to the new user and emails all admin/staff accounts with a direct approval link. Tasks retry 3× on SMTP failure.
- Agency profiles, invitations, memberships, and delegated cleaner assignments.
- Cookie consent records for optional analytics and marketing cookies.
- Property management: CRUD, external calendar connections, reservations.
- **Airbnb ICS parsing** — `POST /api/properties/parse-ics/` accepts a multipart-uploaded `.ics` file, filters blocked-date placeholders, returns parsed reservation list.
- Marketplace service functions: publish jobs, submit applications, accept applications, complete jobs, two-way reviews.
- Notification records; email via configurable Django mail backend. `.env.example` is configured for Gmail SMTP with a Google App Password.
- Calendar conflict API; Google Calendar sync and iCal export are planned.

### Frontend (Next.js App Router)

| Route | Status | Description |
|---|---|---|
| `/` | ✅ Done | Public landing page — auth-aware header with role-based dashboard link |
| `/login` | ✅ Done | Session login |
| `/signup` | ✅ Done | Role-based signup with custom field validation, password checklist, UI-only Google/Apple buttons |
| `/app` | ✅ Done | Generic workspace — auto-redirects hosts → `/host`, admins → `/admin` |
| `/admin` | ✅ Done | Admin approval dashboard — list / filter / approve / reject; reads `?filter=pending` URL param |
| `/host` | ✅ Done | Host dashboard — property CRUD, job posting, month calendar, publish jobs, **ICS import** |
| `/cleaner` | ✅ Done | Cleaner dashboard — calendar, profile, open jobs, applications, assignments |
| `/agency` | ⬜ Not built | Agency dashboard — manage members, view assigned jobs |

### Shared infrastructure

- `frontend/lib/api.ts` — `apiFetch` wrapper with automatic CSRF token injection; `Content-Type` only set for JSON string bodies (not FormData). `CurrentUser` type includes `is_platform_admin`.
- `frontend/next.config.mjs` — `trailingSlash: true` + dual rewrite rules for Django `APPEND_SLASH` compatibility.
- `frontend/app/globals.css` — CSS design tokens and shared component classes (see `DEV.md` for full reference).

## Email Configuration

Copy `.env.example` to `.env`, then fill in Gmail SMTP values. Use a Google App Password, not your regular Gmail password:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=your@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=your@gmail.com
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
```

`BACKEND_URL` is used in the confirmation button sent to new users.

See `DEV.md` for full environment variable reference.
