# Agent Instructions

## Mission

Help build and maintain a Bulgarian-market marketplace that connects short-term rental hosts with verified cleaners.

The product direction for v1 is:

- Responsive web/PWA.
- Public landing page first, with marketplace operations behind authenticated app screens later.
- Django REST Framework backend.
- React/Next.js frontend.
- PostgreSQL, Redis, and Celery.
- Bulgarian and English UI.
- EUR currency.
- Verified cleaners.
- Single cleaning and monthly batch posting.
- Google Calendar sync and iCal import/export.
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
- Handle external calendar and notification failures explicitly.
- Keep secrets out of source control.
- Do not run `npm run build` while `npm run dev` is running against the same `frontend/.next` directory; stop dev or clear `.next` first to avoid stale Next.js runtime errors.

## Marketplace Rules To Preserve

- Cleaners must be verified before applying for marketplace jobs.
- Hosts can post one cleaning or a monthly batch.
- Cleaners apply; hosts accept or reject.
- Price can be proposed or agreed in the app, but payment is handled outside the platform in v1.
- A cleaning job can have only one accepted cleaner assignment.
- Reviews are two-way and only allowed after job completion.
- Admins must be able to inspect marketplace history for disputes and moderation.

## Current Implementation State

- Backend exists under `backend/` as a Django/DRF modular monolith.
- Frontend exists under `frontend/` as a Next.js app.
- The public landing page lives at `frontend/app/page.tsx`.
- The current landing page uses local UI state only; search/lead actions are not yet persisted to the backend.
- Backend domain apps include accounts, properties, marketplace, calendars, feedback, and notifications.
- Marketplace services currently cover publishing jobs, verified cleaner applications, accepting applications, completing jobs, and submitting reviews.
- Google Calendar, iCal parsing, email/SMS providers, and object storage are placeholder boundaries, not finished integrations.

## Before Making Changes

Check the current repository state and read the relevant docs first. For product, marketplace, launch, monetization, or success-metric changes, read `BUSINESS.md` before proposing or editing technical implementation.

If Git reports a safe-directory ownership warning, do not work around it destructively. The developer may need:

```powershell
git config --global --add safe.directory C:/Users/35987/Desktop/airbnb_tax
```

Only run commands that match the current project state. This repository may contain documentation before it contains application scaffolding.

## Handoff Expectations

Every substantial change should end with:

- What changed.
- What tests or checks were run.
- Any commands that failed and why.
- Any follow-up work that is genuinely needed.
