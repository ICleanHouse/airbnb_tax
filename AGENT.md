# Agent Instructions

## Restart Handoff

Before doing more deployment or signup-flow work, read `CURRENT_PROGRESS.md` for the current resume point.

## Mission

Help build and maintain a Bulgarian-market marketplace that connects short-term rental hosts with contact-eligible cleaners.

The product direction for v1 is:

- Responsive web/PWA.
- Public landing page first, with marketplace operations behind authenticated app screens later.
- Session-cookie authentication with automatic contact eligibility and
  owner-admin safety exceptions for v1.
- Django REST Framework backend.
- React/Next.js frontend.
- PostgreSQL, Redis, and Celery.
- Bulgarian and English UI.
- EUR currency.
- Cleaners whose email and phone are confirmed; the Stage 1 “Verified” badge is
  explicitly contact-scoped and is not an identity or quality claim.
- Agency accounts that invite separate cleaner users into agency groups.
- Consent-first cookie handling for optional analytics and marketing cookies.
- Single cleaning and monthly batch posting.
- Bulk cleaning job creation from Airbnb iCal calendar imports.
- Google Calendar sync and iCal import/export.
- Signup email confirmation via Resend only. Other notification email paths still use Django's mail backend until migrated.
- Signup is a single React wizard at `/signup` with Motion-based transitions; old step routes are compatibility redirects.
- Two-way reviews.
- No in-app payments in v1.

## Working Rules

- Treat `BUSINESS.md` as the source of truth for business strategy, target users, marketplace assumptions, monetization hypotheses, and open business questions.
- Preserve the service-ready modular architecture described in `architecture.md`.
- Keep the unauthenticated `/` frontend experience as a public, lead-generation entry point (centered hero + audience toggle: `CleanerBrowser` for hosts, `AreaDemandPanel`/`OpenJobMap` for cleaners), not an internal dashboard.
- Keep changes scoped to the user request.
- Do not introduce unrelated refactors.
- Do not add payment processing, payouts, wallets, invoices, or platform fees unless the user explicitly asks for that change.
- Prefer explicit business services for workflows instead of burying state transitions in API views.
- Keep calendar behavior centered on the internal app calendar as the source of truth.
- Keep Bulgarian-market assumptions visible: BG/EN, EUR, `Europe/Sofia`,
  contact-eligible cleaners with an explicitly scoped badge, no in-app
  payments, and two-way reviews.

## Documentation Rules

Update docs in the same change when altering:

- Business strategy, target users, monetization assumptions, launch strategy, or success metrics.
- Architecture boundaries.
- Business workflows.
- Data model concepts.
- API routes or behavior.
- Local development commands.
- Test commands.
- External integrations.
- Deployment assumptions.

Use:

- `TGN.md` for the full project knowledge graph — entities, relationships, state machines, API surface, event triggers, and critical rules. Read this first in every new session.
- `README.md` for project overview and quick-start entry points.
- `BUSINESS.md` for business strategy, target market, user segments, monetization hypotheses, success metrics, risks, and open business questions.
- `DEV.md` for developer setup and project operating instructions.
- `architecture.md` for technical architecture and domain boundaries.
- `AGENT.md` for agent-specific working rules.

When documents overlap, use this priority:

- `BUSINESS.md` decides what the business is trying to achieve and which assumptions are locked.
- `architecture.md` decides how the system is structured technically.
- `DEV.md` decides how developers run and maintain the project.
- `AGENT.md` decides how agents should work inside the repository.

## Code Quality Rules

When code exists:

- Add or update tests for business logic, API behavior, migrations, permissions, and background tasks.
- Keep migrations intentional and reviewable.
- Avoid cross-domain imports that bypass service boundaries.
- Prefer typed, explicit interfaces for shared workflow inputs.
- Make background jobs idempotent where possible.
- Handle external calendar and notification failures explicitly — retry with backoff, never silently swallow.
- Keep secrets out of source control — use `.env` (never committed) and `.env.example` (committed, no real values).
- Do not run `npm run build` while `npm run dev` is running against the same `frontend/.next` directory; stop dev or clear `.next` first to avoid stale Next.js runtime errors.
- Never call `fetch` directly in the frontend — always use `apiFetch` from `frontend/lib/api.ts`.
- Never set `Content-Type: application/json` for `FormData` bodies — let the browser set the multipart boundary.
- Keep signup field changes end-to-end: React wizard state and payloads, backend model fields, migrations, serializer validation, profile serializers, and tests must change together for Cleaner, Host, and Agency onboarding.

## Environment & Tooling Conventions

This is a Windows dev machine. Commands and paths must match it.

- Frontend lives in `frontend/`. Use `npm.cmd` / `npx.cmd` (not bare `npm`/`npx`). Verify changes with `npm.cmd run typecheck` and `npm.cmd run lint`.
- Backend runs under PowerShell: `cd backend; .\.venv\Scripts\Activate.ps1; python manage.py <cmd>`. Run `makemigrations`, `migrate`, `check`, and `test` when touching models/services.
- Do not run `npm.cmd run build` while the dev server (`npm.cmd run dev`) is running against the same `frontend/.next` — it produces stale-runtime errors.
- Prefer the dedicated file tools; the repo path contains spaces, so always quote paths in shell commands.

## Frontend Structure Conventions

- Extract reusable UI into `frontend/app/components/` rather than inlining into the large dashboards (`host/page.tsx` ~2.3k lines, `cleaner/page.tsx` ~2.6k lines). Existing shared pieces: `CleanerBrowser`, `CleanerProfileCard`, `CleanerProfileModal`.
- All styles go in `frontend/app/globals.css` using the existing design tokens (`--brand` #ff385c, `--teal` #008489, `--gold` #b7791f, `--ink`, `--muted`, `--line`, `--surface`, `--radius`). No CSS library.
- City/district filtering is client-side: cleaner profiles expose `city` plus a flat `string[]` of canonical district names in `service_areas`. Prefer the saved `city` for city filtering. Sofia search and the cleaner-profile map must use the shared `loadServiceZones` path and stable `sofia:osm-1..144` IDs from `frontend/lib/sofiaDistricts.ts`; preserve exact GeoJSON names including `кв.` and `ж.к.` prefixes and do not restore Sofia aliases.
- CSS Grid pitfall to avoid: `display:grid` + `min-height` on the same element defaults to `align-content: stretch` and inflates rows; put grid/padding on an inner wrapper instead.

## Secrets Handling

- Real secrets (Sentry DSNs/auth tokens, account credentials, API keys) go only in gitignored env files — `frontend/.env.local` for the frontend, `backend/.env` for the backend. Never commit them, never echo them into tracked files, logs, or doc examples.
- Committed example files (`.env.example`) carry placeholder values only.

## Marketplace Rules To Preserve

- Cleaners must be active, automatically contact-approved, and in the stored
  contact-eligible cleaner state before applying for marketplace jobs.
- Users must confirm email and a unique EEA phone and pass the private
  self-declared 18+ signup rule before full marketplace rights are enabled.
- Agencies must assign accepted agency jobs only to active member cleaners.
- Agency member delegation is immutable through the normal agency API after the first member assignment; reassignment requires a separate explicit admin/support workflow.
- Hosts can create favourites only for active, approved, stored
  contact-eligible cleaner accounts that are eligible for the public cleaner
  directory. Historical favourites are retained and serialized safely if
  eligibility later changes.
- Hosts can post one cleaning or a monthly batch, or bulk-import from an Airbnb `.ics` file.
- Cleaners apply; hosts accept or reject.
- Price can be proposed or agreed in the app, but payment is handled outside the platform in v1.
- A cleaning job can have only one accepted cleaner assignment.
- The assigned cleaner (or an admin) marks a job done in a single step — there is no separate host confirmation. The host's post-completion role is to review.
- Reviews are two-way and only allowed after job completion, and are double-blind: a received review is revealed only once both sides have reviewed that job or the 14-day window closes, and public ratings count revealed reviews only.
- Admins must be able to inspect marketplace history for disputes and moderation.

## Current Implementation State

### Backend — what is implemented

**Auth and accounts (`apps/accounts`)**

- Session-cookie auth with CSRF enforcement on all auth views.
- Account approval states: pending, approved, rejected, suspended.
- Automatic contact reconciliation plus owner-admin reject / suspend actions;
  S1-D02 restoration remains to be implemented.
- Host, cleaner, agency, and admin role profiles.
- Agency invitations and memberships.
- Cookie consent records.
- New account/signup outcomes emit localized canonical events for the user and
  each active operator. Operator previews contain no user contact details.
- User email-code confirmation before signup — `send_signup_email_code` Celery task:
  - Sends a 6-digit code through Resend only.
  - The server stores only the code hash in `SignupEmailVerification`.
  - `POST /api/accounts/signup/verify-email-code/` returns `email_verification_token`.
- Final signup requires `email_verification_token` and sets `email_verified_at`.
- Cleaner signup persists birth date, sex, native language, experience level, introduction, and optional profile photo.
- Host and agency signup currently create role profiles from location/service-area data.

**Properties (`apps/properties`)**

- Property CRUD with address, timezone, default cleaning duration, and default price.
- External calendar connections and reservation records.
- **ICS file parsing** — `POST /api/properties/parse-ics/`:
  - Accepts multipart upload with `ics_file` field.
  - Parses VEVENT entries using the `icalendar` library.
  - Filters Airbnb blocked-date placeholders (entries whose summary contains "not available", "blocked", or "unavailable").
  - Normalises `DTSTART`/`DTEND` from `datetime.datetime` or `datetime.date` to plain `date`.
  - Returns `[{uid, summary, checkin, checkout, nights}]` sorted by checkin date.

**Marketplace (`apps/marketplace`)**

- Turnover lineages with immutable job attempts
  (`draft → open → assigned → completed/cancelled`) and append-only lifecycle
  events. Physical job deletion is replaced by structured cancellation.
- One actionable job per exact property/time slot and per lineage; terminal
  cancelled/completed attempts may share historical slots.
- Monthly batch CRUD.
- Cleaner applications.
- Application acceptance (creates assignment, rejects competing applications).
- Agency member delegation for accepted agency jobs; normal agency assignment is immutable after the first delegated cleaner member.
- Host favourites for public marketplace-eligible cleaners, with historical favourites retained if a saved cleaner later becomes unavailable.
- Single-step job completion by the assigned cleaner (or admin) after `scheduled_start`; on completion both host and cleaner get a `review.requested` notification.
- S1-E05 agency recovery is explicitly unsupported. Account deletion blocks
  active obligations and routes protected marketplace history to support;
  de-identification is separate privacy work.

**Notifications (`apps/notifications`)**

- Versioned recipient/event/channel contract with Bulgarian/English parity.
- Durable events, unique in-app/email deliveries, immutable attempt history,
  post-commit Celery dispatch, bounded retry, and one terminal-failure alert.
- Resend provider idempotency for pilot/production; Django mail is local/test.
- Account, matching/offers, applications, assignment/delegation, direct S1-E05
  recovery, completion/reviews, connections/messages, and operator reminders
  are wired. No automated reminder scheduler is deployed.
- `send_signup_email_code` remains the separate pre-account authentication task
  and receives only the stable verification-record ID.

**Feedback (`apps/feedback`)**

- Two-way **double-blind** reviews after completion (`submit_review`): a received review is revealed only once both parties review the job or the `REVIEW_WINDOW_DAYS = 14` window closes (`revealed_received_reviews`); `ReviewViewSet.get_queryset` enforces this. Submitting the second review notifies both ("Reviews are now visible"); otherwise the counterpart gets a `review.requested` prompt.
- Cleaner rating summary (`refresh_cleaner_rating`) averages **revealed reviews only**.

**Calendars (`apps/calendars`)**

- Calendar conflict API.
- Google Calendar sync: placeholder.
- iCal feed polling: placeholder.
- iCal export for hosts/cleaners: planned.

**Configuration (`config/`)**

- `settings.py`: loads env via python-dotenv; DATABASE_URL absent → SQLite, present → PostgreSQL; email backend config block; Resend signup-code settings; `FRONTEND_URL` for frontend links; `BACKEND_URL` for legacy email confirmation links.
- `settings.py`, `manage.py`, `wsgi.py`, `asgi.py`: load `.env` with `python-dotenv` so manual backend and Celery runs see local environment values.
- `celery.py`: Celery app wiring.

### Frontend — what exists

**`frontend/lib/api.ts`** — all API calls must go through `apiFetch`. It:

- Sets `Content-Type: application/json` only when `body` is a `string` — not for `FormData`.
- Reads `csrftoken` cookie and adds `X-CSRFToken` header on POST/PUT/PATCH/DELETE.
- Returns raw `Response` — callers check `.ok` and call `.json()`.
- Forces `cache: "no-store"`, attaches a safe request ID, and reports failures
  with only method, request ID, status, controlled error code, and a sanitized
  endpoint template. Never send bodies, queries, raw errors, addresses, or IDs
  to telemetry.
- `CurrentUser` interface includes: `id`, `username`, `email`, `first_name`, `last_name`, `phone_number`, `preferred_language`, `role`, `account_status`, `is_approved`, `is_platform_admin`.

**`frontend/next.config.mjs`** — critical config:

- `trailingSlash: true` — required so Next.js does not strip slashes before Django sees them.
- Two rewrite rules matching `/api/:path*/` and `/api/:path*` — required to preserve trailing slashes through to Django's `APPEND_SLASH`.
- There is no general `/media/` proxy: every raw `/media/*` request is denied.
  Property images use the protected API content endpoint. Approved public
  cleaner profile media remains an API/data value and is not raw
  `PropertyImage` storage.

**`frontend/app/page.tsx`** — public landing page (host/cleaner audience entry point):

- Stripped-down public entry point — no marketing sections. A centered hero with audience toggle renders `CleanerBrowser` for hosts and `AreaDemandPanel`/`OpenJobMap` for cleaners. `CleanerBrowser` lists public cleaner profiles filterable by city/district. The compatibility-named `OpenJobMap` consumes `/api/marketplace/public-demand/` and renders only canonical district counts; it never receives per-job markers, coordinates, addresses, media, schedules, or prices.
- Auth-aware header (pinned top-right): logged-out shows Log in / Sign up plus the standalone language selector; logged-in shows a role-correct Dashboard/Admin link, notification bell, and profile icon. Profile, persistent BG/EN segmented language slider, and Log out live inside the profile menu.

**`frontend/app/components/CleanerBrowser.tsx`** — shared public cleaner directory:

- Reused by both `/` and `/cleaners`. Fetches `/api/accounts/public-cleaners/` once, then filters client-side by City and a dependent District dropdown. Sofia dropdowns use stable zone IDs and the same canonical names as the cleaner-profile district map. City filtering uses the cleaner's saved `city` first and falls back to district inference for older blank-city profiles. Renders loading skeletons, empty states, a `CleanerProfileCard` grid, and `CleanerProfileModal`.

**`frontend/app/cleaners/page.tsx`** — host/admin cleaner directory: same `CleanerBrowser`, gated to host/admin, with a narrow `cleaners-directory-head` band on top.

**`frontend/app/login/page.tsx`** — session login. On success it calls `/api/accounts/me/` and forwards to the role's dashboard via `dashboardPath` (admin → `/admin`, host → `/host`, cleaner → `/cleaner`, agency → `/agency`, else `/app`).

**`frontend/app/signup/*`** — signup is centered on `frontend/app/signup/page.tsx`, a single client-side React wizard at `/signup`. It uses custom field errors, email validation, Resend 6-digit email-code confirmation, live password checklist, role selection, cleaner personal details, location/service areas, native language, experience, introduction, profile photo, and final account creation. Continue and Back update React state and animate with Motion instead of loading new pages. Refresh recovery is a 24-hour `sessionStorage` allowlist containing only `version`, `savedAt`, `role`, `citySlug`, `selectedZoneIds`, and `experienceLevel`; passwords, confirmation, codes, tokens, email, names, and profile data are memory-only and refresh empty. Old step route files redirect to `/signup`. Google and Apple buttons are UI-only placeholders.

**`frontend/app/app/page.tsx`** — generic workspace:

- Auto-redirects: hosts → `/host`, admins → `/admin`.
- For cleaners/agencies: shows account status.

**`frontend/app/admin/page.tsx`** — admin approval panel:

- Gate: redirects to `/login` if unauthenticated, shows "Admin only" if not admin role.
- Fetches all accounts, client-side filters by status.
- Reads `?filter=pending` via `useSearchParams()` for legacy/bookmarked filtered
  views; signup notifications now link to the neutral account-review surface.
- Approve: `POST /api/accounts/users/{id}/approve/`.
- Reject: `POST /api/accounts/users/{id}/reject/`.

**`frontend/app/host/page.tsx`** — host dashboard:

- Properties section: add property via modal. Each property card has two pill buttons — Edit (outline, left) and Post a job (brand-filled, right) that opens the job form preset to that property.
- Jobs & Calendar section: month calendar grid, post job, publish job.
- Applications panel: host reviews per-job applications and accepts/rejects via `POST /api/marketplace/applications/{id}/accept/` (and reject).
- **ICS import** — two-step modal:
  - Step 1: upload `.ics` file, select property, set default cleaning start time.
  - Step 2: review parsed events (checkin, checkout, nights), select/deselect, confirm.
  - Calls `POST /api/properties/parse-ics/` with `FormData` (multipart).
  - Creates one Draft job per selected event checkout date via `POST /api/marketplace/jobs/`.

**`frontend/app/cleaner/page.tsx`** — cleaner dashboard:

- Calendar view, open jobs, applications, assigned jobs, and profile sections.
- Profile form supports first/last name, service-area dropdown, sex dropdown, bio, and profile picture upload preview.
- Cleaner applications call `POST /api/marketplace/applications/`.
- The assigned cleaner marks a job done through `POST /api/marketplace/jobs/{id}/complete/` after the scheduled start time — a single step that completes the job (no host confirmation). Both parties then review each other through the shared `ReviewModal` (double-blind), opened from the completed job or a `review.requested` notification (`?reviewJob=<id>`).

### Cleaner signup state

- Birth date uses a compact dropdown-style calendar and must prove the cleaner is at least 18.
- Required fields: birth date, sex, native language, and experience level.
- Signup recovery stores only `version`, `savedAt`, `role`, `citySlug`,
  `selectedZoneIds`, and `experienceLevel` in `sessionStorage` for 24 hours.
  Credentials, verification secrets, identity fields, profile media, errors, and
  responses must never be persisted. Sensitive progress is intentionally lost
  on refresh; encrypted browser persistence is not an alternative.

### What is NOT built yet (next priorities)

1. **`/agency` dashboard** — full launch-critical agency parity, including
   recovery, is required by S1-D01/S1-D05 before marketplace launch.
2. **S1-D02 completion** — implement EEA phone OTP, all-role private birth
   dates/18+ validation, contact-change recovery, number reservation/transfer,
   owner-admin restoration, seven-day pending expiry, retention cleanup, and
   the scoped “Verified” badge. Do not add manual identity or quality vetting.
3. **Google Calendar sync** — OAuth flow and feed polling (backend placeholders exist).
4. **iCal export** — generate `.ics` for host and cleaner calendars.
5. **Additional notification triggers** — assignment created, upcoming reminder, review prompt.

Done since earlier handoffs: applications panel in host dashboard; public cleaner directory with real city/district filtering (`CleanerBrowser` against `GET /api/accounts/public-cleaners/`); role-based post-login routing; direct offers, favourites, and the notification center.

## Before Making Changes

Check the current repository state and read the relevant docs first. For product, marketplace, launch, monetization, or success-metric changes, read `BUSINESS.md` before proposing or editing technical implementation.

If Git reports a safe-directory ownership warning:

```powershell
git config --global --add safe.directory "C:/Users/d.yordanov/OneDrive - Intelligent Systems Bulgaria Ltd/Personal/Personal Projects/AirBnbMarketplace/airbnb_tax"
```

Only run commands that match the current project state. This repository may contain documentation before it contains application scaffolding.

## Handoff Expectations

Every substantial change should end with:

- What changed.
- What tests or checks were run.
- Any commands that failed and why.
- Any follow-up work that is genuinely needed.
