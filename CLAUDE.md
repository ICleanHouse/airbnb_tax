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
- Job completion is a single step by the assigned cleaner (or admin) — there is no host confirmation step.
- Reviews are two-way, allowed only after job completion, and double-blind: a received review is revealed only once both sides review the job or the 14-day window closes; public ratings count revealed reviews only.
- Payments happen outside the platform — never add payment processing unless explicitly requested.
- Public `/` is a marketing landing page; authenticated workspaces go behind auth routes.
- Internal app calendar is the source of truth; external calendars (Google, iCal) sync into it.
- Never call `fetch` directly — always use `apiFetch` from `frontend/lib/api.ts`.
- Never set `Content-Type: application/json` for `FormData` uploads — browser sets multipart boundary.

## Repo Structure

```
backend/
  config/           Django project config (settings, celery, wsgi, asgi)
  apps/             accounts, properties, marketplace, calendars, feedback, notifications, connections
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
| `/` | No | All | ✅ Live — minimal landing: compact photo hero + public `CleanerBrowser` (city/district filters over verified cleaner cards). Logged-out users see Log in/Sign up + standalone language selector; authenticated users see Dashboard/Admin, notification bell, and profile icon containing Profile, persistent BG/EN slider, and Log out. |
| `/login` | No | All | ✅ Live — on success fetches `/me/` and forwards to the role's dashboard (admin→`/admin`, host→`/host`, cleaner→`/cleaner`, agency→`/agency`, else `/app`) |
| `/signup` | No | All | 🟨 In progress — single React wizard with Motion transitions, email-code verification, role selection, cleaner personal/language/experience/introduction/profile-photo steps, and final account creation. Old step URLs redirect to `/signup`. |
| `/app` | Yes | All roles | ✅ Live — redirects hosts/admins automatically |
| `/admin` | Yes | `admin` role only | ✅ Live — reads `?filter=pending` URL param |
| `/host` | Yes | `host` role only | ✅ Live — tabs are **Jobs & Calendar + Applications** (+ a **Connections** button); a slim left **property rail** (All · thumbnails · pencil-edit/plus-add) filters both tabs in place via `selectedPropertyId` (mobile → dropdown). Applications panel = 6 appdash cards incl. **Spent** + host rating; thumbnail calendar; ICS import; favourites + "My cleaners" + direct offers; notification bell. (The old `/host/properties/[id]` route was removed.) |
| `/cleaners` | Yes | `host` / `admin` | ✅ Live — cleaner directory via shared `CleanerBrowser` (city + dependent district dropdowns); narrow header band; profile cards + detail modal (rating + review history + **Connect** button, safe fields only) |
| `/cleaner` | Yes | `cleaner` role only | ✅ Live — mirrors host: tabs **Jobs & Calendar · Applications · Offers** (+ Connections button), Profile in the account menu. Thumbnail calendar; Applications = appdash cards incl. **Income**; notification bell. |
| `/agency` | Yes | `agency` role only | ⬜ Not built yet (deferred) |

## Implemented Features

- **Admin email on signup**: `send_admin_new_account_email` Celery task fires on every new account. Emails all admin/staff users with a direct link to `/admin?filter=pending`. Retries 3× on SMTP failure. Synchronous fallback (`_FakeTask`) when Celery not installed.
- **User email-code confirmation before signup**: `send_signup_email_code` sends a 6-digit code through Resend only. `POST /api/accounts/signup/verify-email-code/` returns the token required by final signup.
- **Signup email template**: the code email HTML is rendered from `backend/apps/notifications/templates/notifications/signup_code_email.html`.
- **Cleaner browser + landing redesign**: shared `CleanerBrowser.tsx` (city + dependent district dropdowns, client-side filter) powers both `/` and `/cleaners`. Sofia search dropdowns and the cleaner-profile map share `loadServiceZones`, `frontend/lib/sofiaDistricts.ts`, and stable `sofia:osm-1..144` IDs. Exact canonical names retain `кв.` and `ж.к.` prefixes. Minimal landing: compact photo hero + browser below.
- **Property card "Post a job"**: host Properties tab cards have Edit (outline) + Post a job (brand-filled) buttons; `openJobForm(day?, jobToEdit?, presetPropId?)` opens the job modal pre-scoped to that property.
- **Direct offers + favourites**: `CleanerApplication.origin` field (`cleaner_applied` / `host_offered`). Host offer = `CleanerApplication` row with `origin=host_offered, status=pending`. Services: `offer_job`, `accept_offer`, `decline_offer`. Endpoints: `offer` action on `CleaningJobViewSet`; `accept-offer`/`decline-offer` on `CleanerApplicationViewSet`; `FavouriteCleaner` CRUD. Cleaner Offers tab (gold accent). Tests: `apps/marketplace/tests/test_offers.py`.
- **Notification center**: `GET /api/notifications/`, `POST /api/notifications/<id>/read/`, `POST /api/notifications/read-all/`. `NotificationBell.tsx` shared component (polled via `apiFetch`) in host and cleaner topbars.
- **Connections + in-app chat (`apps.connections`)**: LinkedIn-style host↔cleaner relationship. `Connection` (requester/addressee, status pending/accepted/declined/removed, unique pair) + `Message`. Services guard host↔cleaner-only pairing, no self-connect, reverse-request auto-accepts, messaging only on accepted. Endpoints under `/api/connections/`: list · create(request) · `accept`/`decline` · DELETE(remove) · `messages` (GET marks read / POST send) · `read` · `unread-count` · `shared` (collaborated properties+cleanings, derived from `Assignment`s). Frontend: `components/Connections.tsx` = a **"Connections" button next to Applications** in both navs (polled badge) → right drawer (Requests/Connected/Pending) → polled chat thread + Shared panel; reusable `components/ConnectButton.tsx` in the cleaner profile modal. Chat is **polled** (no websockets). Tests: `apps/connections/tests/test_connections.py`.
- **Property navigation rail (host)**: replaced the Properties tab/grid with a slim left `.host-rail` (All · property thumbnails · pencil-edit + plus-add footer); selecting a property filters Jobs & Calendar + Applications in place (`selectedPropertyId`; state is `all*` with derived scoped `jobs/applications/assignments` memos). Mobile → dropdown.
- **Income/Expenditure card**: 6th appdash card — host **Spent** / cleaner **Income** = Σ `agreed_price` of completed assignments. Shared `frontend/lib/money.ts` (`money`, `formatMoney`).
- **Calendar property thumbnails**: `MarketplaceCalendarItemSerializer.property_image` + `AssignmentSerializer.cleaner_profile_image` power photo thumbnails in host/cleaner calendar day cells.
- **Observability**: `frontend/lib/sentry-sanitize.ts` strips PII before Sentry events ship. Sentry env vars live in gitignored `frontend/.env.local`.

## ClickUp Integration

- **Job form — date + time range**: separate cleaning date + start time / end time fields (replaced single datetime-local input).
- **Delete job**: two-step confirm UI; backend guard in `CleaningJobViewSet.destroy()` — only `draft` or `open` jobs may be deleted.
- **Single-step completion**: the assigned cleaner (or an admin) marks a job done after its scheduled start time, which completes the job outright — there is **no** host confirmation step (the host's mark-done button was removed). `complete_job` then sends a `review.requested` notification to **both** host and cleaner (metadata `{job_id, reviewee_id}`).
- **Job completion email**: `send_job_completed_email` Celery task fires from `complete_job` service; sends via Resend. Template: `notifications/job_completed_email.html`.
- **Application submitted email**: `send_application_submitted_email` Celery task fires from `submit_application` service; sends via Resend. Template: `notifications/application_submitted_email.html`.
- **Two-way double-blind review window** (`frontend/components/ReviewModal.tsx`): after completion both sides review each other through one shared modal (mounted in host + cleaner dashboards; opened from the completed job or a `review.requested` notification via `?reviewJob=<id>`). `POST /api/feedback/reviews/` — body uses `job_id` and `reviewee_id` (not `job`/`reviewee`). Double-blind: a received review is revealed only once both submit or the `REVIEW_WINDOW_DAYS = 14` window closes (`feedback/services.py` `revealed_received_reviews`; `ReviewViewSet.get_queryset`); `refresh_cleaner_rating` counts revealed reviews only. `NotificationBell` routes `review.requested` to `/host` or `/cleaner` based on the current path.
- **Applications dashboard redesign**: 4-card summary (Pending / Active / Completed / Open jobs). Cards are `<button>` elements with `appFilter` state; clicking a card filters the subsections shown below. Open jobs subsection appears only when `appFilter === "open"`.
- **Host rating display**: `hostRatingAvg` computed from `reviews.filter(r => r.reviewee === me.id)` (reviews written by cleaners about the host); shown in Applications header as ★ stars + numeric score.
- **Job activity context in calendar panel**: shows "👤 cleaner" (assigned), "✓ cleaner" (completed), or "N applications" (open with pending apps).
ClickUp is connected to Claude Code and Cowork via MCP (`https://mcp.clickup.com/mcp`). See `CLICKUP_CLAUDE_SETUP.md` in the repo root for full setup instructions.

### When a task is assigned to you via ClickUp

If a session starts with a ClickUp task ID or URL, follow this sequence:
1. Fetch the full task (description, comments, custom fields, acceptance criteria)
2. Read `TGN.md` to orient in the graph — identify which entities and state machines are touched
3. Read `AGENT.md` for working rules
4. Implement, staying within the affected files noted in the task
5. Run relevant tests (use the `Test Command` custom field if set, otherwise infer from affected app)
6. Typecheck and lint frontend if frontend files were changed: `npm.cmd run typecheck && npm.cmd run lint`
7. Post a comment on the ClickUp task summarising what changed and any decisions made
8. Set task status to **In Review**

**Phase 1 — Browsable cleaner profiles & reviews**
- **Public cleaner profile API** (safe fields only — no email/phone/birth_date): `GET /api/accounts/cleaners/` (directory; verified + approved only; `?city=&min_rating=&service_area=` filters) and `GET /api/accounts/cleaners/<id>/` (detail + that cleaner's received reviews via `ReviewSerializer` filtered on `reviewee`). In `apps/accounts/views.py` + `serializers.py`.
- **Frontend**: shared components `RatingStars.tsx`, `CleanerProfileCard.tsx`, `CleanerProfileModal.tsx` in `frontend/app/components/`. New `/cleaners` directory route. "View profile" entry points on host applicant cards; landing-page featured cleaners wired to the list endpoint. `PublicCleaner` / `CleanerReview` types in `lib/api.ts`.
- **Landing redesign + shared `CleanerBrowser.tsx` (updated 2026-06-16)**: stripped the old marketing landing down to a **compact photo hero + public cleaner browser**. Both browser copies load dependent district options through `loadServiceZones`; Sofia options share the cleaner-profile map's stable IDs and canonical names. Logged-out users retain Log in/Sign up + standalone language selector; authenticated users use Dashboard/Admin + notification bell + profile-icon menu with Profile, BG/EN slider, and Log out.
- **Property card "Post a job" (2026-06-02)**: host Properties tab cards now have Edit (left, outline) + **Post a job** (right, brand-filled) buttons; `openJobForm(day?, jobToEdit?, presetPropId?)` opens the job modal pre-scoped to that property. Card restyled — 18px radius, hover lift, stat chips.
### Commit message format for ClickUp tasks

```
<type>(<scope>): <summary> [CU-TASK-ID]

- bullet describing main change
- bullet describing secondary change

ClickUp: https://app.clickup.com/t/TASK-ID
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`
Scopes: `accounts`, `marketplace`, `calendars`, `notifications`, `feedback`, `host`, `cleaner`, `admin`, `landing`

### Task tag meanings

| Tag | Meaning |
|---|---|
| `claude-ready` | Fully spec'd, safe to implement autonomously |
| `needs-context` | Read linked tasks/comments before starting — may need clarification |
| `human-first` | Requires a decision before coding — do not implement, ask instead |
| `env-change` | Involves `.env` or secrets — flag to Dimitar, do not proceed |

If a task has no tag, ask before proceeding.

### What Claude should NOT do autonomously on ClickUp tasks

- Change `.env` files or rotate secrets
- Modify database migrations that drop columns or tables without explicit instruction
- Reassign tasks to other users
- Close or delete tasks
- Touch `config/settings.py` production settings without being asked

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
- `.cleaner-account-menu*` / `.account-language-slider` — authenticated profile-icon menu and persistent BG/EN segmented control
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
- `.host-prop-edit-btn` (left, outline) + `.host-prop-postjob-btn` (right, brand-filled) — matching 40px pill buttons (now used in the rail/job header); `.host-property-stats > div` are borderless stat cells (hairline separator)

**Property rail + workspace classes (host):**
- `.host-workspace` (flex row) / `.host-workspace-main` (flex:1) — wraps the rail + the sections
- `.host-rail` (sticky slim left column) / `.host-rail-item`(`--all`/`--active`) / `.host-rail-thumb--empty` / `.host-rail-list` / `.host-rail-footer` / `.host-rail-foot-btn`(`--add`)
- `.host-rail-mobile` / `.host-rail-mobile-select` / `.host-rail-mobile-add` — ≤860px dropdown selector
- `.host-appdash-card--money` / `--static` + `.host-appdash-value--money` — the static Spent/Income card

**Connections + chat classes:**
- `.connections-tab` (nav button) / `.connections-overlay` / `.connections-drawer` (right slide-in)
- `.connections-head` / `.connections-body` / `.connections-group(-title)` / `.connection-row`(`--btn`) / `.connection-avatar` / `.connection-unread`(`-dot`) / `.connections-accept` / `.connections-decline` / `.connections-cancel`
- `.connections-chat(-head/-who)` / `.connections-thread` / `.chat-bubble`(`--me`) / `.chat-bubble-body/-time` / `.connections-composer`
- `.connections-shared(-toggle/-title/-list/-count)` / `.connections-remove`
- `.connect-btn` (+ `--pending` / `--done`) — reusable Connect button; `.cleaner-profile-connect` wrapper in the profile modal

## Git / GitHub

Primary remote: `https://github.com/ICleanHouse/airbnb_tax`
Team remote: `https://github.com/ICleanHouse/airbnb_tax` (user pulls from this)

If Git reports a safe-directory ownership warning, run:
```powershell
git config --global --add safe.directory "C:/Users/d.yordanov/OneDrive - Intelligent Systems Bulgaria Ltd/Personal/Personal Projects/AirBnbMarketplace/airbnb_tax"
```
