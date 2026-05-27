# Development Guide

## Restart Handoff

Docker Desktop requires a Windows restart before the production stack can be built and started. See `CURRENT_PROGRESS.md` for the current deployment progress and resume commands.

## Project Purpose

This project is a Bulgarian-market marketplace for connecting Airbnb and short-term rental hosts with verified cleaners.

The MVP should let hosts post one cleaning or a month of cleaning jobs, let verified cleaners apply, let both sides agree on price outside the platform, share calendar availability, and collect two-way feedback after completed work.

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
- Frontend: React 19.2+ with Next.js 15.5+ as a responsive web/PWA.
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
  apps/             accounts, properties, marketplace, calendars, feedback, notifications
frontend/
  app/
    page.tsx        Public landing page (auth-aware header)
    login/          Session login
    signup/         Role-based signup
    app/            Generic workspace (auto-redirects hosts → /host, admins → /admin)
    admin/          Admin approval panel (list / approve / reject, URL filter param)
    host/           Host dashboard (properties, jobs, calendar, ICS import)
    cleaner/        Cleaner dashboard (calendar, profile, open jobs, applications, assignments)
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
| `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` | Switch to `smtp.EmailBackend` in production |
| `EMAIL_HOST` | *(empty)* | SMTP server hostname, e.g. `smtp.gmail.com` |
| `EMAIL_PORT` | `587` | STARTTLS port |
| `EMAIL_USE_TLS` | `true` | |
| `EMAIL_HOST_USER` | *(empty)* | SMTP username / Gmail address |
| `EMAIL_HOST_PASSWORD` | *(empty)* | SMTP password or Gmail App Password |
| `DEFAULT_FROM_EMAIL` | `noreply@example.local` | Sender address for outbound emails |
| `FRONTEND_URL` | `http://localhost:3000` | Base URL used to build links in outbound emails |
| `BACKEND_URL` | `http://localhost:8000` | Base URL used for email confirmation links |
| `FRONTEND_TRUSTED_ORIGINS` | `http://localhost:3000,...` | CSRF trusted origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api` | API base URL for the frontend |

### Local vs Docker DATABASE_URL

The local `.env` should have `DATABASE_URL` **commented out** so Django falls back to SQLite:

```dotenv
# DATABASE_URL=postgres://airbnb_cleaners:airbnb_cleaners@db:5432/airbnb_cleaners
```

Docker Compose can use the Docker hostname `db`, but manual PowerShell runs cannot. Use SQLite locally or point PostgreSQL to `localhost`.

### Email in local development

`.env.example` is set up for Gmail SMTP. To receive real emails during local dev, use:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=your@gmail.com
EMAIL_HOST_PASSWORD=your-gmail-app-password
DEFAULT_FROM_EMAIL=your@gmail.com
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
```

Use a Gmail **App Password** (not your account password). Generate one at Google Account -> Security -> App passwords. Restart both the backend and Celery after changing `.env`.

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

Run a Celery worker after Redis is available and dependencies are installed. On Windows, use `--pool=solo`:

```powershell
python -m celery -A config worker --loglevel=info --pool=solo
```

Signup email delivery requires Redis and the Celery worker when Celery is installed. The `_FakeTask` fallback only applies when Celery is not installed.

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
| `/signup` | No | All | 🟨 In progress — multi-step flow started (`/signup` -> `/signup/role` -> `/signup/location`). **Cleaner signup is not finished yet.** |
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

### Landing page (`/`)

- Audience toggle for hosts and cleaners.
- Search-style lead form with city, month, and property/capacity inputs.
- Local demo results only — not yet connected to backend cleaner search.
- Auth-aware header: when logged in, shows the correct dashboard link for the current role.

### Admin panel (`/admin`)

- Lists all user accounts with client-side filtering by status (pending / approved / all).
- Approve or reject pending accounts with instant local state update.
- Reads `?filter=pending` URL query param on load — used in admin notification email links to pre-select the pending tab.
- Accessible to `admin` role only — redirects others.

### Host dashboard (`/host`)

- Two sections toggled in the topbar: **Properties** and **Jobs & Calendar**.
- Properties section: add property via modal form (`POST /api/properties/properties/`).
- Jobs section: month calendar grid with coloured status dots per day.
  - Click an empty day → job form pre-filled with that date.
  - Click a day with jobs → filters the list panel to that day.
  - Post a job via modal form (`POST /api/marketplace/jobs/`) — saved as Draft.
  - Publish button: `POST /api/marketplace/jobs/{id}/publish/` → transitions to Open.
  - **Import ICS** button: two-step modal for Airbnb `.ics` file import:
    1. Upload file + select property + set default cleaning start time.
    2. Review parsed reservations (checkin, checkout, nights) — select which ones to import.
    3. Confirm: creates one Draft cleaning job per selected checkout date via `POST /api/marketplace/jobs/`.
- Pending hosts see a gold warning banner but can still view the UI.

### Signup flow (`/signup`, `/signup/role`, `/signup/location`)

- Multi-step signup UX is in progress.
- Step 1 (`/signup`): first/last name, email, password + confirmation, custom field validation, and live password checklist.
- Step 2 (`/signup/role`): role selection (host / cleaner / agency) with progress indicator.
- Step 3 (`/signup/location`): city and district selection with dual-list transfer UI.
- UI-only Google and Apple buttons are present but not connected to OAuth.
- **Cleaner signup is not finished yet** (the end-to-end final step and submission flow are still incomplete).

### Cleaner dashboard (`/cleaner`)

- Calendar view with open jobs, applications, and assignments.
- Open jobs list with apply action gated by account approval and cleaner verification.
- Applications and assigned jobs views.
- Profile form with first/last name, service-area dropdown, sex dropdown, bio, verification status, and profile picture upload preview.

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
- Pending, approved, rejected, and suspended account status.
- Admin approval, rejection, and suspension actions.
- **Email confirmation on new account signup** — `send_account_confirmation_email` sends the new user a confirmation link that sets `email_verified_at`.
- **Admin email notification on new account signup** — `send_admin_new_account_email` Celery task sends email to all `role=admin` or `is_staff=True` users with a direct link to the pending-tab admin panel. Retries up to 3 times on SMTP failure.
- Agency profile, invitation, membership, and member assignment APIs.
- Cookie consent records for essential, analytics, and marketing choices.
- **ICS file parsing** — `POST /api/properties/parse-ics/` accepts a multipart-uploaded Airbnb `.ics` file, parses VEVENT entries, filters blocked-date placeholders, returns `[{uid, summary, checkin, checkout, nights}]`.
- Publish draft cleaning jobs.
- Allow approved, verified cleaners and approved agencies to apply to open jobs.
- Allow hosts/admins to accept one application.
- Allow assigned agencies to delegate accepted work to active member cleaners.
- Reject competing applications after assignment.
- Mark assigned jobs completed.
- Allow two-way reviews only after completion.
- Update cleaner rating summaries after reviews.

Placeholder integrations (not complete):

- Google Calendar sync is a placeholder.
- SMS dispatch is a placeholder.
- Object storage is planned for future file/photo/document uploads.
- iCal export (for host/cleaner calendars) is planned.

## Email Configuration

Email dispatch uses Django's configurable mail backend. `.env.example` is set for Gmail SMTP; set `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `DEFAULT_FROM_EMAIL` in `.env`.

The `send_admin_new_account_email` task reads `settings.FRONTEND_URL` to build the approval link. The `send_account_confirmation_email` task reads `settings.BACKEND_URL` to build the confirmation link.

When `celery` is not installed locally, the task runs synchronously via the `_FakeTask` fallback stub in `apps/notifications/tasks.py`.

## Git Setup Note

If Git commands fail with `detected dubious ownership`, run:

```powershell
git config --global --add safe.directory "C:/Users/d.yordanov/OneDrive - Intelligent Systems Bulgaria Ltd/Personal/Personal Projects/AirBnbMarketplace/airbnb_tax"
```

## Testing Expectations

When code exists, test coverage should focus on:

- Job lifecycle transitions.
- Cleaner verification and permissions.
- Application and assignment rules.
- Calendar conflict detection.
- iCal parsing (blocked-date filtering, date normalization, sorting).
- Google Calendar and iCal sync behavior.
- Notification triggers, especially `send_account_confirmation_email` and `send_admin_new_account_email`.
- Review eligibility and two-way review constraints.
- Admin moderation actions.
- Email task retry behavior on SMTP failure.

Every change to business logic, data models, API permissions, migrations, or background tasks should include tests or a clear explanation for why tests were not added.

Use `django.core.mail.backends.locmem.EmailBackend` with `@override_settings` in email tests. Call Celery tasks via `.apply(args=[...])` for synchronous test execution without a broker.

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
