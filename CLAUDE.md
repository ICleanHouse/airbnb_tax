# Host Cleaner Marketplace — Claude Code Guide

## Restart Handoff

Before continuing deployment or signup-flow work, read `CURRENT_PROGRESS.md` for the current resume point.

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
- Frontend animations: Motion (`motion/react`) for reusable React transitions
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
    signup/         Single-route React signup wizard
    app/            Generic workspace — auto-redirects hosts → /host, admins → /admin
    admin/          Admin approval panel (list / approve / reject, ?filter=pending URL param)
    host/           Host dashboard (properties, jobs, calendar, ICS import, applications, assignments, reviews)
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
| `/signup` | No | All | 🟨 In progress — single React wizard with Motion transitions, email-code verification, role selection, cleaner personal/language/experience/availability steps, and final account creation. Old step URLs redirect to `/signup`. |
| `/app` | Yes | All roles | ✅ Live — redirects hosts/admins automatically |
| `/admin` | Yes | `admin` role only | ✅ Live — reads `?filter=pending` URL param |
| `/host` | Yes | `host` role only | ✅ Live — properties, jobs + calendar, ICS import, applications panel (filter cards, accept/reject, active assignments, completed + reviews), host rating display |
| `/cleaner` | Yes | `cleaner` role only | ✅ Live |
| `/agency` | Yes | `agency` role only | ⬜ Not built yet |

## Implemented Features

- **Admin email on signup**: `send_admin_new_account_email` Celery task fires on every new account. Emails all admin/staff users with a direct link to `/admin?filter=pending`. Retries 3× on SMTP failure. Synchronous fallback (`_FakeTask`) when Celery not installed.
- **User email-code confirmation before signup**: `send_signup_email_code` sends a 6-digit code through Resend only. `POST /api/accounts/signup/verify-email-code/` returns the token required by final signup.
- **Signup email template**: the code email HTML is rendered from `backend/apps/notifications/templates/notifications/signup_code_email.html`.
- **Email config**: `EMAIL_RESEND_APIKEY` and `EMAIL_RESEND_FROM_EMAIL` are required for signup confirmation. `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` are for non-signup emails.
- **`FRONTEND_URL` / `BACKEND_URL` settings**: frontend URL builds admin links; backend URL remains for legacy confirmation links.
- **python-dotenv auto-load**: `settings.py`, `manage.py`, `wsgi.py`, `asgi.py` load `.env` for local manual runs.
- **Admin panel URL filter**: reads `?filter=pending` via `useSearchParams()` — pre-selects the pending tab when following email approval links.
- **ICS file import**: `POST /api/properties/parse-ics/` parses uploaded Airbnb `.ics` files, filters blocked-date placeholders, returns reservation list. Host dashboard two-step modal: upload → review → bulk-create Draft jobs.
- **`apiFetch` FormData fix**: `Content-Type: application/json` only set for string bodies, not `FormData`.
- **`is_platform_admin` in CurrentUser**: added to `frontend/lib/api.ts` interface.
- **Signup UX (in progress)**: single-route `/signup` React wizard with custom field errors, email validation, Resend 6-digit email-code step, live password checklist, role step, cleaner personal-info step, location/service-area step, native-language step, experience step, availability step, and final account creation. Continue and Back update React state and animate with Motion instead of navigating between pages.
- **Signup database alignment**: cleaner signup now requires persisted `birth_date`, `sex`, `native_language`, `experience_level`, `work_preference`, and `preferred_time_slots`; optional `weekly_availability` is stored as JSON. Any future signup changes for Cleaner, Host, or Agency must update database fields, migrations, serializers, and tests together.
- **Cleaner dashboard**: calendar, open jobs, applications, assignments, profile form with service area, sex, bio, and profile image upload preview.

### Host dashboard — job flow (2026-06-01)

- **Job form — date + time range**: separate cleaning date + start time / end time fields (replaced single datetime-local input).
- **Delete job**: two-step confirm UI; backend guard in `CleaningJobViewSet.destroy()` — only `draft` or `open` jobs may be deleted.
- **Host can mark job complete**: "Mark done" button on assigned jobs in both calendar panel and applications section; reuses `completeJob` handler.
- **Job completion email**: `send_job_completed_email` Celery task fires from `complete_job` service; sends via Resend. Template: `notifications/job_completed_email.html`.
- **Application submitted email**: `send_application_submitted_email` Celery task fires from `submit_application` service; sends via Resend. Template: `notifications/application_submitted_email.html`.
- **Star rating + review form**: after completion, host rates cleaner (1–5 stars + comment). `POST /api/feedback/reviews/` — body must use `job_id` and `reviewee_id` (not `job`/`reviewee`).
- **Applications dashboard redesign**: 4-card summary (Pending / Active / Completed / Open jobs). Cards are `<button>` elements with `appFilter` state; clicking a card filters the subsections shown below. Open jobs subsection appears only when `appFilter === "open"`.
- **Host rating display**: `hostRatingAvg` computed from `reviews.filter(r => r.reviewee === me.id)` (reviews written by cleaners about the host); shown in Applications header as ★ stars + numeric score.
- **Job activity context in calendar panel**: shows "👤 cleaner" (assigned), "✓ cleaner" (completed), or "N applications" (open with pending apps).

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

**Applications dashboard classes:**
- `.host-appdash-grid` — 4-col responsive grid (2-col ≤860px, 1-col ≤480px)
- `.host-appdash-card` — `<button>` styled as stat card; border-top accent colour; variants: `--gold`, `--green`, `--teal`
- `.host-appdash-card--active` — selected/filtered state; ring shadow matches border-top colour per variant
- `.host-rating-display` / `.host-rating-stars` / `.host-rating-score` / `.host-rating-count` — host received-rating row in Applications header
- `.host-job-activity` + `--done` (green) / `--assigned` (gold) / `--apps` (brand-red) — activity context line in calendar job list
- `.host-delete-btn` / `.host-delete-confirm` / `.host-delete-confirm-yes` / `.host-delete-confirm-no` — two-step delete confirm UI
- `.host-job-complete-btn` — green pill button for mark-complete action
- `.host-app-review-row` — full-width row in completed assignment cards (`grid-column: 1 / -1`)
- `.host-review-trigger` / `.host-review-form` / `.host-stars` / `.host-star` / `.host-star--on` — review input UI
- `.host-review-textarea` / `.host-review-actions` / `.host-review-submit` / `.host-review-cancel`
- `.host-review-given` / `.host-review-given-stars` / `.host-review-given-comment` — submitted review read-only display
- `.host-app-badge--open` — teal badge for open-job entries

## Git / GitHub

Primary remote: `https://github.com/DjimitarYo/airbnb_tax.git`
Team remote: `https://github.com/ICleanHouse/airbnb_tax` (user pulls from this)

If Git reports a safe-directory ownership warning, run:
```powershell
git config --global --add safe.directory "C:/Users/d.yordanov/OneDrive - Intelligent Systems Bulgaria Ltd/Personal/Personal Projects/AirBnbMarketplace/airbnb_tax"
```
