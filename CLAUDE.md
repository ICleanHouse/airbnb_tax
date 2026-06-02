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
| `/` | No | All | ✅ Live — minimal landing: compact photo hero + public `CleanerBrowser` (city/district filters over verified cleaner cards). Top-right keeps Log in/Sign up (or role-aware Dashboard + user chip + Log out) and language picker. |
| `/login` | No | All | ✅ Live — on success fetches `/me/` and forwards to the role's dashboard (admin→`/admin`, host→`/host`, cleaner→`/cleaner`, agency→`/agency`, else `/app`) |
| `/signup` | No | All | 🟨 In progress — single React wizard with Motion transitions, email-code verification, role selection, cleaner personal/language/experience/availability steps, and final account creation. Old step URLs redirect to `/signup`. |
| `/app` | Yes | All roles | ✅ Live — redirects hosts/admins automatically |
| `/admin` | Yes | `admin` role only | ✅ Live — reads `?filter=pending` URL param |
| `/host` | Yes | `host` role only | ✅ Live — properties, jobs + calendar, ICS import, applications panel (filter cards, accept/reject, active assignments, completed + reviews), host rating display, favourites + "My cleaners" + direct job offers, notification bell |
| `/cleaners` | Yes | `host` / `admin` | ✅ Live — cleaner directory via shared `CleanerBrowser` (city + dependent district dropdowns); narrow header band; profile cards + detail modal (rating + review history, safe fields only) |
| `/cleaner` | Yes | `cleaner` role only | ✅ Live — open jobs, applications, Offers tab (host-offered jobs: accept/decline), assignments, calendar, profile, notification bell |
| `/agency` | Yes | `agency` role only | ⬜ Not built yet (deferred) |

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

### Marketplace stickiness layer — profiles, notifications, offers, favourites (2026-06-01)

Roadmap "Review-Based Marketplace" (Phases 1–3). Goal: hosts browse cleaners by reputation, re-hire trusted cleaners directly, both sides stay because notifications + calendar keep the relationship warm. **Agency dashboard, in-app chat, payments, and iCal two-way sync remain deferred.**

**Phase 1 — Browsable cleaner profiles & reviews**
- **Public cleaner profile API** (safe fields only — no email/phone/birth_date): `GET /api/accounts/cleaners/` (directory; verified + approved only; `?city=&min_rating=&service_area=` filters) and `GET /api/accounts/cleaners/<id>/` (detail + that cleaner's received reviews via `ReviewSerializer` filtered on `reviewee`). In `apps/accounts/views.py` + `serializers.py`.
- **Frontend**: shared components `RatingStars.tsx`, `CleanerProfileCard.tsx`, `CleanerProfileModal.tsx` in `frontend/app/components/`. New `/cleaners` directory route. "View profile" entry points on host applicant cards; landing-page featured cleaners wired to the list endpoint. `PublicCleaner` / `CleanerReview` types in `lib/api.ts`.
- **Landing redesign + shared `CleanerBrowser.tsx` (2026-06-02)**: stripped the old marketing landing (hero search panel, how-it-works, trust band, join, market strip) down to a **compact photo hero + public cleaner browser**. New `CleanerBrowser.tsx` fetches all verified+approved cleaners once and filters **client-side by City + dependent District** dropdowns sourced from `lib/cityDistricts.ts` (built a reverse `zone → city` map since cleaners store districts in `service_areas` and have no separate city field). Same component powers both `/` and `/cleaners`, so they stay in sync. Landing top-right keeps Log in/Sign up (or role-aware Dashboard + user chip + Log out) + language picker; dead hamburger removed and `.site-header` grid set to `1fr auto` so actions pin right.
- **Property card "Post a job" (2026-06-02)**: host Properties tab cards now have Edit (left, outline) + **Post a job** (right, brand-filled) buttons; `openJobForm(day?, jobToEdit?, presetPropId?)` opens the job modal pre-scoped to that property. Card restyled — 18px radius, hover lift, stat chips.

**Phase 2 — Direct offers + favourites (side by side with open pool)**
- **Reuses `CleanerApplication`** (not a parallel model): new `origin` field (`cleaner_applied` default / `host_offered`). A host offer = a `CleanerApplication` row with `origin=host_offered, status=pending`. Migration `apps/marketplace/migrations/0003_cleanerapplication_origin_favouritecleaner.py`.
- **Services** (`apps/marketplace/services.py`): `offer_job` (guards: host owns job, cleaner verified+approved, job draft/open, no assignment; fires notification + email), `accept_offer` (cleaner-initiated; reuses accept→`Assignment` path; one-assignment invariant; auto-rejects sibling apps; job→assigned), `decline_offer` (sets rejected; notifies host).
- **Endpoints**: `offer` action on `CleaningJobViewSet`; `accept-offer` / `decline-offer` actions on `CleanerApplicationViewSet`; `FavouriteCleaner` model + `GET/POST/DELETE /api/marketplace/favourites/`.
- **Calendar**: pending offers surface as an `offer` item type in `MarketplaceCalendarView` (gold), visible to both roles.
- **Frontend**: host ♥ favourite toggle + "My cleaners" list + "Offer a job" CTA → `JobOfferModal.tsx` (pick property + date/time + price → creates draft job then offers it). Cleaner **Offers** tab shows `host_offered` pending items with Accept / Decline + distinct gold badge.
- **Tests**: `apps/marketplace/tests/test_offers.py` — offer creates host_offered app; rejects unverified cleaner / non-owner host; accept creates exactly one assignment + rejects siblings; only offered cleaner can accept; decline notifies host; full API flow; offer on both calendars; favourite CRUD + idempotency + cleaner-cannot-create.

**Phase 3 — Notification center**
- Surfaces the already-persisted `Notification` model in-app: `GET /api/notifications/`, `POST /api/notifications/<id>/read/`, `POST /api/notifications/read-all/` (`apps/notifications/views.py` + `urls.py`; reuse `create_notification()`).
- **Frontend**: `NotificationBell.tsx` shared component (bell + unread count, polled via `apiFetch`) in host **and** cleaner topbars; dropdown with deep links.

**Observability fix (2026-06-01)**: restored missing `frontend/lib/sentry-sanitize.ts` (the `beforeSend` PII scrubber imported by `instrumentation-client.ts` / `sentry.edge.config.ts` / `sentry.server.config.ts` — strips emails, tokens, cookies, auth headers, query strings before events ship to Sentry). Sentry env vars (DSNs, environment, sample rates) live in gitignored `frontend/.env.local`; empty `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` are fine for local dev (source-map upload skipped).

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

**Stickiness-layer classes (profiles, offers, favourites, notifications):**
- `.cleaner-card` / `.cleaner-profile` / `.review-list` / `.review-item` — directory cards + profile modal + review history list
- `.host-fav-toggle` + `--on` — ♥ favourite toggle (brand-red when favourited)
- `.host-offer-trigger` — "Offer a job" CTA on applicant rows / My cleaners cards
- `.host-offer-field` / `.host-offer-row` — JobOfferModal form fields (reuses modal + host-form pattern)
- `.host-mycleaners-grid` / `.host-mycleaner-card` / `-avatar` / `-main` / `-name` / `-areas` / `-actions` — "My cleaners" saved-cleaner list
- `.host-tab-count--gold` — gold count badge (e.g. cleaner Offers tab)
- `.cleaner-offer-card` / `.cleaner-offer-badge` — host-offered job cards in the cleaner Offers tab (gold accent), Accept / Decline actions
- Notification bell + offer/calendar states reuse the gold token (`--gold`) for pending offers and brand-red (`--brand`) for favourites
- `.cleaner-browser` / `.cleaner-browser-filters` / `.cleaner-browser-field` / `.cleaner-browser-clear` / `.cleaner-browser-count` — shared city/district directory browser (landing + `/cleaners`); rounded pill selects
- `.hero--compact` — short variant of `.hero` (photo + headline) used on the minimal landing so the browser sits just below
- `.landing-directory` — centered max-width wrapper for the landing cleaner browser
- `.cleaners-directory` (inner wrapper, NOT the grid `main`) / `.cleaners-directory-head` — narrow header band on the `/cleaners` page
- `.host-prop-edit-btn` (left, outline) + `.host-prop-postjob-btn` (right, brand-filled) — matching 40px pill buttons in the property card action row; `.host-property-stats > div` are rounded grey stat chips

## Git / GitHub

Primary remote: `https://github.com/DjimitarYo/airbnb_tax.git`
Team remote: `https://github.com/ICleanHouse/airbnb_tax` (user pulls from this)

If Git reports a safe-directory ownership warning, run:
```powershell
git config --global --add safe.directory "C:/Users/d.yordanov/OneDrive - Intelligent Systems Bulgaria Ltd/Personal/Personal Projects/AirBnbMarketplace/airbnb_tax"
```
