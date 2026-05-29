# Agent Instructions

## Restart Handoff

Before doing more deployment or signup-flow work, read `CURRENT_PROGRESS.md` for the current resume point.

## Mission

Help build and maintain a Bulgarian-market marketplace that connects short-term rental hosts with verified cleaners.

The product direction for v1 is:

- Responsive web/PWA.
- Public landing page first, with marketplace operations behind authenticated app screens later.
- Session-cookie authentication with manual admin approval for v1.
- Django REST Framework backend.
- React/Next.js frontend.
- PostgreSQL, Redis, and Celery.
- Bulgarian and English UI.
- EUR currency.
- Verified cleaners.
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
- Keep the unauthenticated `/` frontend experience as a public marketing/lead-generation landing page, not an internal dashboard.
- Keep changes scoped to the user request.
- Do not introduce unrelated refactors.
- Do not add payment processing, payouts, wallets, invoices, or platform fees unless the user explicitly asks for that change.
- Prefer explicit business services for workflows instead of burying state transitions in API views.
- Keep calendar behavior centered on the internal app calendar as the source of truth.
- Keep Bulgarian-market assumptions visible: BG/EN, EUR, `Europe/Sofia`, verified cleaners, no in-app payments, two-way reviews.

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

## Marketplace Rules To Preserve

- Cleaners must be verified before applying for marketplace jobs.
- Users must be approved before full marketplace rights are enabled.
- Agencies must assign accepted agency jobs only to active member cleaners.
- Hosts can post one cleaning or a monthly batch, or bulk-import from an Airbnb `.ics` file.
- Cleaners apply; hosts accept or reject.
- Price can be proposed or agreed in the app, but payment is handled outside the platform in v1.
- A cleaning job can have only one accepted cleaner assignment.
- Reviews are two-way and only allowed after job completion.
- Admins must be able to inspect marketplace history for disputes and moderation.

## Current Implementation State

### Backend — what is implemented

**Auth and accounts (`apps/accounts`)**

- Session-cookie auth with CSRF enforcement on all auth views.
- Account approval states: pending, approved, rejected, suspended.
- Admin approve / reject / suspend actions.
- Host, cleaner, agency, and admin role profiles.
- Agency invitations and memberships.
- Cookie consent records.
- Admin email notification on new account signup — `send_admin_new_account_email` Celery task:
  - Sends to all `role=admin` or `is_staff=True` users (excluding blank emails and inactive accounts).
  - Email includes name, email, phone, role, and a direct link to the admin panel with `?filter=pending`.
  - Retries up to 3 times with 60-second delays on mail-backend failure.
  - Falls back to synchronous execution when Celery is not installed (via `_FakeTask` stub in `apps/notifications/tasks.py`).
- User email-code confirmation before signup — `send_signup_email_code` Celery task:
  - Sends a 6-digit code through Resend only.
  - The server stores only the code hash in `SignupEmailVerification`.
  - `POST /api/accounts/signup/verify-email-code/` returns `email_verification_token`.
- Final signup requires `email_verification_token` and sets `email_verified_at`.
- Cleaner signup persists birth date, sex, native language, experience level, work preference, preferred time slots, and optional weekly availability.
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

- Cleaning job CRUD (draft → open → assigned → completed lifecycle).
- Monthly batch CRUD.
- Cleaner applications.
- Application acceptance (creates assignment, rejects competing applications).
- Agency member delegation for accepted agency jobs.
- Job completion.

**Notifications (`apps/notifications`)**

- In-app notification records.
- Email dispatch via Resend only for signup codes and Django's configurable mail backend (`EMAIL_BACKEND` in settings) for admin emails.
- `send_admin_new_account_email` task: ✅ implemented and tested.
- `send_signup_email_code` task: ✅ implemented and tested.
- `send_account_confirmation_email` task: legacy link-based task retained.
- Other notification triggers: placeholder — not yet wired.

**Feedback (`apps/feedback`)**

- Two-way reviews after completion.
- Cleaner rating summary updates.

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
- `CurrentUser` interface includes: `id`, `username`, `email`, `first_name`, `last_name`, `phone_number`, `preferred_language`, `role`, `account_status`, `is_approved`, `is_platform_admin`.

**`frontend/next.config.mjs`** — critical config:

- `trailingSlash: true` — required so Next.js does not strip slashes before Django sees them.
- Two rewrite rules matching `/api/:path*/` and `/api/:path*` — required to preserve trailing slashes through to Django's `APPEND_SLASH`.

**`frontend/app/page.tsx`** — public landing page:

- Auth-aware header: shows role-correct dashboard link when logged in.

**`frontend/app/login/page.tsx`** — session login, redirects to `/` after success.

**`frontend/app/signup/*`** — signup is centered on `frontend/app/signup/page.tsx`, a single client-side React wizard at `/signup`. It uses custom field errors, email validation, Resend 6-digit email-code confirmation, live password checklist, role selection, cleaner personal details, location/service areas, native language, experience, availability, and final account creation. Continue and Back update React state and animate with Motion instead of loading new pages. Old step route files redirect to `/signup`. Google and Apple buttons are UI-only placeholders.

**`frontend/app/app/page.tsx`** — generic workspace:

- Auto-redirects: hosts → `/host`, admins → `/admin`.
- For cleaners/agencies: shows account status.

**`frontend/app/admin/page.tsx`** — admin approval panel:

- Gate: redirects to `/login` if unauthenticated, shows "Admin only" if not admin role.
- Fetches all accounts, client-side filters by status.
- Reads `?filter=pending` URL param via `useSearchParams()` to pre-select tab — used in admin notification email approval links.
- Approve: `POST /api/accounts/users/{id}/approve/`.
- Reject: `POST /api/accounts/users/{id}/reject/`.

**`frontend/app/host/page.tsx`** — host dashboard:

- Properties section: add property via modal.
- Jobs & Calendar section: month calendar grid, post job, publish job.
- **ICS import** — two-step modal:
  - Step 1: upload `.ics` file, select property, set default cleaning start time.
  - Step 2: review parsed events (checkin, checkout, nights), select/deselect, confirm.
  - Calls `POST /api/properties/parse-ics/` with `FormData` (multipart).
  - Creates one Draft job per selected event checkout date via `POST /api/marketplace/jobs/`.

**`frontend/app/cleaner/page.tsx`** — cleaner dashboard:

- Calendar view, open jobs, applications, assigned jobs, and profile sections.
- Profile form supports first/last name, service-area dropdown, sex dropdown, bio, and profile picture upload preview.
- Cleaner applications call `POST /api/marketplace/applications/`.
- Assigned jobs can be marked complete through `POST /api/marketplace/jobs/{id}/complete/`.

### Cleaner signup state

- Birth date uses a compact dropdown-style calendar and must prove the cleaner is at least 18.
- Required fields: birth date, sex, native language, experience level, work preference, and at least one preferred time slot.
- Optional signup availability detail: weekly availability by day and time slot.
- The frontend stores draft wizard state in `sessionStorage` only for refresh recovery.

### What is NOT built yet (next priorities)

1. **Applications panel in host dashboard** — host sees applications per job, calls `POST /api/marketplace/applications/{id}/accept/`.
2. **`/agency` dashboard** — agency manages members, views assigned jobs.
3. **Cleaner verification** — admin marks cleaner as verified before they can apply.
4. **Real search on landing page** — connect to `GET /api/accounts/cleaners/` with location filter.
5. **Google Calendar sync** — OAuth flow and feed polling (backend placeholders exist).
6. **iCal export** — generate `.ics` for host and cleaner calendars.
7. **Additional notification triggers** — application submitted, application accepted/rejected, assignment created, upcoming reminder, review prompt.

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
