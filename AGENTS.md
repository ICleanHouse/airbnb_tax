# Host Cleaner Marketplace - Codex Guide

This file is the lean Codex entrypoint for this repo. `CLAUDE.md` is intentionally left as the detailed guide for other coding agents; do not edit it for context-budget cleanup unless explicitly asked.

## Project Snapshot

Bulgarian short-term-rental marketplace connecting hosts with verified cleaners and agencies.

Stack:
- Backend: Django / DRF, PostgreSQL or local SQLite, Redis, Celery.
- Frontend: Next.js / React / TypeScript, plain CSS in `frontend/app/globals.css`.
- Locale and market: BG/EN, EUR, `Europe/Sofia`.

## Read Order

Read only what the task needs:
- `TGN.md`: source of truth for domain graph, state machines, routes, API behavior, and critical invariants. Read before non-trivial code changes.
- `AGENT.md`: detailed working rules and marketplace constraints. Read before changing product or workflow behavior.
- `DEV.md`: setup, commands, i18n rules, and verification procedures.
- `BUSINESS.md`: product, pricing, launch, monetization, or marketplace strategy.
- `architecture.md`: service boundaries, app ownership, and integration shape.
- `CURRENT_PROGRESS.md`: resume point for deployment or signup-flow work.
- `DEPLOY.md`: production Docker, firewall, router, and hosting work.

Instruction priority:
1. `BUSINESS.md`
2. `architecture.md`
3. `TGN.md`
4. `DEV.md`
5. `DEPLOY.md`
6. `CURRENT_PROGRESS.md`
7. `AGENT.md`
8. `.agents/skills/*/SKILL.md` or the active skill named by the user

## Critical Invariants

- Cleaners must be verified and users approved before full marketplace actions.
- A cleaning job can have only one accepted cleaner assignment.
- Reviews are two-way, post-completion only, and double-blind until both submit or the review window closes.
- Payments happen outside the platform in v1; do not add payment processing, payouts, wallets, invoices, or platform fees unless explicitly requested.
- Internal app calendar is the source of truth.
- Public `/` is the marketing/lead-generation route, not an authenticated dashboard.
- Store/display time consistently for `Europe/Sofia`.

## Frontend Rules

- Never call `fetch` directly; use `apiFetch` from `frontend/lib/api.ts`.
- Never set `Content-Type: application/json` for `FormData`; let the browser set the multipart boundary.
- User-facing strings must be localized in both `frontend/messages/en.json` and `frontend/messages/bg.json`.
- Keep styles in `frontend/app/globals.css`; do not add a CSS library.
- Preserve existing dashboard/modal CSS families such as `.host-modal-*`, `.host-appdash-*`, and `.host-rail-*`.
- Use `npm.cmd` / `npx.cmd` on Windows.
- Do not run `npm.cmd run build` while `npm.cmd run dev` is running against the same `frontend/.next`.

Frontend checks from `frontend/`:
```powershell
npm.cmd run typecheck
npm.cmd run lint
```

## Backend Rules

- Keep domain workflows in service functions, not hidden inside views.
- Avoid cross-domain imports that bypass service boundaries.
- Keep signup/profile field changes end to end: models, migrations, serializers, frontend payloads, profile exposure, and tests.
- Keep Celery/email tasks idempotent and retryable.
- Never commit real secrets; use gitignored `.env`, `backend/.env`, and `frontend/.env.local`.

Backend checks from `backend/` when relevant:
```powershell
python manage.py check
python manage.py test
```

## ClickUp Tasks

If the session starts with a ClickUp task ID or URL:
1. Fetch task details, comments, custom fields, and acceptance criteria.
2. Read `TGN.md` and `AGENT.md`.
3. Implement within the task scope.
4. Run relevant tests and, for frontend changes, `npm.cmd run typecheck` and `npm.cmd run lint`.
5. Comment on the task with changes and decisions.
6. Set task status to In Review.

Do not autonomously change `.env` files, rotate secrets, drop database columns/tables, reassign tasks, close/delete tasks, or touch production settings unless explicitly asked.

## Local Paths

Service URLs:
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/api/health/`
- Django admin: `http://localhost:8000/admin/`

Useful structure:
- `backend/apps/`: accounts, properties, marketplace, calendars, feedback, notifications, connections.
- `frontend/app/`: routes and global CSS.
- `frontend/features/`: dashboard feature components.
- `frontend/components/`: shared frontend components.
- `.agents/skills/`: local ECC skills that may be invoked by name.

If Git reports dubious ownership, use a per-command safe-directory override or add this workspace explicitly:
```powershell
git config --global --add safe.directory "C:/Users/35987/Desktop/airbnb_tax"
```
