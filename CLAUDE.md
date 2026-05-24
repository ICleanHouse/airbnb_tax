# Host Cleaner Marketplace — Claude Code Guide

## Restart Handoff

Before continuing deployment, read `CURRENT_PROGRESS.md`. Docker Desktop requires a Windows restart and the production stack has not been built or started yet.

Bulgarian-market marketplace connecting short-term rental hosts with verified cleaners. MVP covers job posting, cleaner applications, assignment, calendar coordination, notifications, and two-way reviews. No in-app payments in v1.

## Documentation Map

- `TGN.md` — **Temporal Graph Network**: full entity graph, state machines, module dependencies, API surface, event/task graph, data model summary, and critical rules index. **Read this first in any new session.**
- `AGENT.md` — agent working rules, marketplace invariants, code quality rules, handoff expectations
- `BUSINESS.md` — business strategy, target users, monetization hypotheses, open questions
- `architecture.md` — technical architecture, domain boundaries, API shape, future service boundaries
- `DEV.md` — stack, local dev setup, test commands, documentation expectations

Read `TGN.md` at the start of every session to reconstruct full project context. Read `AGENT.md` before making any changes. Read `BUSINESS.md` before product, marketplace, or monetization changes.

## Stack

- Backend: Django 6.0+ / DRF 3.17+, PostgreSQL 16+ (Docker), SQLite (local), Redis 7+, Celery 5.4+
- Frontend: Next.js 15.5+ / React 19.2+ (responsive web/PWA), TypeScript 5.9+
- Timezone: `Europe/Sofia` | Currency: EUR | Languages: BG/EN
- Local infra: Docker Compose

## Key Commands

**Full stack (Docker):**
```powershell
docker compose up --build
```

**Backend only (from `backend/`):**
```powershell
python -m venv .venv && .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate && python manage.py runserver
python manage.py test
```

**Frontend only (from `frontend/`):**
```powershell
npm.cmd install
npm.cmd run dev -- --hostname 127.0.0.1
npm.cmd run typecheck && npm.cmd run lint
```

> Use `npm.cmd` not `npm` on Windows to avoid PowerShell execution policy errors.
> Never run `npm.cmd run build` while `npm.cmd run dev` is running — both write to `.next`.

**Service URLs:**
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/api/health/`
- Django admin: `http://localhost:8000/admin/`

## Critical Invariants

- Cleaners must be verified before applying for jobs.
- A job has at most one accepted cleaner assignment.
- Reviews are two-way and only allowed after job completion.
- Payments happen outside the platform — never add payment processing unless explicitly requested.
- Public `/` is a marketing landing page; authenticated workspaces go behind auth routes.
- Internal app calendar is the source of truth; external calendars (Google, iCal) sync into it.
- Never call `fetch` directly — always use `apiFetch` from `frontend/lib/api.ts`.
- Never set `Content-Type: application/json` for `FormData` uploads — browser sets multipart boundary.

## Repo Structure

```
backend/
  config/           Django project config (settings, celery, wsgi, asgi)
  apps/             accounts, properties, marketplace, calendars, feedback, notifications
frontend/
  app/
    page.tsx        Public landing page (auth-aware header)
    login/          Session login
    signup/         Role-based signup
    app/            Generic workspace — auto-redirects hosts → /host, admins → /admin
    admin/          Admin approval panel (list / approve / reject, ?filter=pending URL param)
    host/           Host dashboard (properties, jobs, month calendar, ICS import)
    cleaner/        Cleaner dashboard (calendar, profile, open jobs, applications, assignments)
    components/     CookieConsentBanner
  lib/
    api.ts          apiFetch wrapper — CSRF + Content-Type, FormData-safe, CurrentUser type
  app/globals.css   CSS design tokens + all shared component classes (incl. .host-ics-*)
  next.config.mjs   trailingSlash: true + dual rewrite rules (required for Django APPEND_SLASH)
docker-compose.yml
.env.example        → copy to .env before running
```

## Frontend Routes — Current State

| Route | Auth required | Who can access | Status |
|---|---|---|---|
| `/` | No | All | ✅ Live |
| `/login` | No | All | ✅ Live |
| `/signup` | No | All | ✅ Live — custom validation + email confirmation |
| `/app` | Yes | All roles | ✅ Live — redirects hosts/admins automatically |
| `/admin` | Yes | `admin` role only | ✅ Live — reads `?filter=pending` URL param |
| `/host` | Yes | `host` role only | ✅ Live — ICS import + calendar + jobs |
| `/cleaner` | Yes | `cleaner` role only | ✅ Live |
| `/agency` | Yes | `agency` role only | ⬜ Not built yet |

## Implemented Features (this session)

- **Admin email on signup**: `send_admin_new_account_email` Celery task fires on every new account. Emails all admin/staff users with a direct link to `/admin?filter=pending`. Retries 3× on SMTP failure. Synchronous fallback (`_FakeTask`) when Celery not installed.
- **User confirmation email on signup**: `send_account_confirmation_email` sends an HTML welcome email with confirmation button. The link marks `email_verified_at` and redirects to `/login?email_confirmed=1`.
- **SMTP email config**: `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` all configurable via `.env`. `.env.example` uses Gmail SMTP placeholders.
- **`FRONTEND_URL` / `BACKEND_URL` settings**: frontend URL builds admin links; backend URL builds email confirmation links.
- **python-dotenv auto-load**: `settings.py`, `manage.py`, `wsgi.py`, `asgi.py` load `.env` for local manual runs.
- **Admin panel URL filter**: reads `?filter=pending` via `useSearchParams()` — pre-selects the pending tab when following email approval links.
- **ICS file import**: `POST /api/properties/parse-ics/` parses uploaded Airbnb `.ics` files, filters blocked-date placeholders, returns reservation list. Host dashboard two-step modal: upload → review → bulk-create Draft jobs.
- **`apiFetch` FormData fix**: `Content-Type: application/json` only set for string bodies, not `FormData`.
- **`is_platform_admin` in CurrentUser**: added to `frontend/lib/api.ts` interface.
- **Signup UX**: first/last name for host/cleaner, agency-name field for agencies, custom per-field errors, email domain validation, live password checklist, UI-only Google/Apple buttons.
- **Cleaner dashboard**: calendar, open jobs, applications, assignments, profile form with service area, sex, bio, and profile image upload preview.

## CSS Design System (globals.css)

All UI is written in plain CSS with these shared tokens and classes. **Do not add a CSS library — extend globals.css.**

**Tokens:**
```css
--brand: #ff385c   /* Airbnb red — CTAs, icons */
--teal: #008489    /* Trust, success, cleaner chip */
--gold: #b7791f    /* Warnings, ratings, assigned status */
--ink: #111111     /* Heavy headings */
--muted: #6a6a6a   /* Secondary text */
--line: #dddddd    /* Borders and dividers */
--surface: #ffffff /* Card backgrounds */
--radius: 8px
```

**Shared classes:**
- `.eyebrow` — uppercase label in `--brand`
- `.site-brand` — logo + text combo
- `.user-chip` — logged-in user pill in header
- `.text-link` — header nav link / button
- `.primary-link` — brand-red filled button
- `.secondary-link` — bordered outline button
- `.form-error` — red error box inside forms
- `.form-grid` — 2-column label grid inside forms
- `.admin-gate` — centered "access denied / not logged in" card

**Page shells:**
- `.auth-page` / `.auth-panel` — login and signup pages
- `.app-page` / `.app-shell` — generic workspace at `/app`
- `.admin-page` / `.admin-topbar` / `.admin-body` / `.admin-sidebar` / `.admin-main` — admin panel
- `.host-page` / `.host-topbar` / `.host-section` / `.host-calendar` / `.host-job-*` — host dashboard

**Modal pattern (used in host dashboard):**
```
.host-modal-backdrop   (fixed full-screen overlay)
  .host-modal          (centered white card)
    .host-modal-header
    .host-form
      .form-grid
      .host-form-actions
```

**ICS import modal pattern (two-step):**
```
.host-modal--wide      (wider variant for event checklist)
  .host-modal-subtitle
  .host-ics-drop-zone  (step 1 — file upload area)
  .host-ics-events     (step 2 — scrollable event list)
    .host-ics-event[.selected]
      .host-ics-event-info
      .host-ics-event-summary / .host-ics-event-dates / .host-ics-event-nights
  .host-ics-done       (success state)
```

## Git / GitHub

Remote: `https://github.com/DjimitarYo/airbnb_tax.git`

If Git reports a safe-directory ownership warning, run:
```powershell
git config --global --add safe.directory "C:/Users/d.yordanov/OneDrive - Intelligent Systems Bulgaria Ltd/Personal/Personal Projects/AirBnbMarketplace/airbnb_tax"
```
