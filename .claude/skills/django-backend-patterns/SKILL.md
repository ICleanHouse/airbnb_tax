---
name: django-backend-patterns
description: Backend conventions for the Host-Cleaner marketplace Django app — app boundaries, service-layer pattern, Celery task idempotency, settings/env loading, and the marketplace invariants that must hold in any backend change. Use when touching backend/apps/* (accounts, properties, marketplace, calendars, feedback, notifications, connections, locations) or config/.
metadata:
  origin: adapted-from-ECC
  source: https://github.com/affaan-m/ECC (skills/django-patterns, skills/django-celery, skills/django-security)
---

# Host-Cleaner Backend Patterns

Stack: Django 6.0+ / DRF 3.17+, PostgreSQL 16+ (Docker) / SQLite (local), Redis 7+, Celery 5.4+.
Timezone `Europe/Sofia`, currency EUR, languages BG/EN.

## When to Activate

- Adding or editing models, serializers, views, or services under `backend/apps/`.
- Adding a Celery task or changing an existing one.
- Touching `config/settings.py` or env loading.
- Writing or updating backend tests.

Read `TGN.md` and `AGENT.md` at repo root before starting — they're the source of truth for entity graph and working rules. This skill is a checklist on top of them, not a replacement.

## App Boundaries

```
backend/apps/
  accounts/       auth, roles (host/cleaner/agency/admin), approval state, signup verification
  properties/     property CRUD, ICS import/parse
  marketplace/    cleaning jobs, batches, applications, assignments, offers, favourites
  calendars/      calendar conflict checks, external sync (Google/iCal — mostly placeholders)
  feedback/       two-way double-blind reviews, rating aggregation
  notifications/  in-app notifications + Celery email tasks (Resend)
  connections/    host↔cleaner relationship + in-app polled chat
  locations/      service-area / district reference data
```

Do not cross these boundaries with direct imports of another app's models when a service function already exists. If you need data from another domain, prefer querying through that domain's existing service or serializer-safe fields — this keeps `apps/connections` and `apps/marketplace` (the two most cross-cutting domains) decoupled enough to refactor independently later.

## Service-Layer Convention

Business logic and state transitions belong in a `services.py` per app, not in views. Views/viewsets call services; services raise domain exceptions or return typed results; serializers stay dumb (validation + shape only).

```python
# apps/marketplace/services.py
def complete_job(job, actor):
    """Single-step completion by assigned cleaner or admin. No host confirmation step."""
    if job.status != CleaningJob.Status.ASSIGNED:
        raise InvalidJobState(...)
    job.status = CleaningJob.Status.COMPLETED
    job.completed_at = timezone.now()
    job.save(update_fields=["status", "completed_at"])
    notify_review_requested(job)  # fires for both host and cleaner
    return job
```

This is why `complete_job`, `submit_application`, `submit_review`, `offer_job`, `accept_offer` etc. already live in each app's `services.py` — keep new state-transition logic there, not in `views.py`.

## Marketplace Invariants — Never Silently Break These

Any backend change that touches jobs, applications, assignments, or reviews must keep these true (full detail in `AGENT.md` / `TGN.md`):

- A cleaner must be `verified` before they can apply for a job.
- A `CleaningJob` has at most one accepted `Assignment`.
- Job completion is one step, by the assigned cleaner or an admin — there is no host confirmation step. Don't reintroduce one.
- Reviews are two-way, only allowed after completion, and double-blind: a received review is revealed only once both sides have submitted, or the 14-day window (`REVIEW_WINDOW_DAYS`) closes. `refresh_cleaner_rating` and any new rating aggregation must count **revealed reviews only**.
- Payments happen outside the platform. Never add payment processing, payouts, wallets, invoices, or platform fees unless explicitly asked — this is a hard product rule, not an oversight.

If a task seems to require breaking one of these, stop and flag it rather than implementing — these are documented invariants the user has set deliberately.

## Celery Task Rules

- `config/celery.py` wires the app; tasks live in each app's `tasks.py` and are auto-discovered.
- Make tasks idempotent where possible — re-running a task (e.g. after a retry) must not double-send emails or double-create records. Check existing state before acting (e.g. "has this notification already been sent for this job+event pair?").
- Retry with backoff on external failures (SMTP, Resend API) — never silently swallow. The existing pattern is 3 retries / 60s delay (`send_admin_new_account_email`, `send_signup_email_code`).
- When Celery isn't installed/running locally, fall back to synchronous execution via the existing `_FakeTask` stub pattern in `apps/notifications/tasks.py` rather than making the feature hard-depend on Celery.
- Email sending: signup-code emails go through Resend only; other notification emails use Django's configurable `EMAIL_BACKEND`. Don't mix these up when adding a new notification type — check which path the notification belongs to first.

## Settings & Env

- `settings.py` loads env via `python-dotenv`. `DATABASE_URL` absent → SQLite; present → PostgreSQL.
- Real secrets go only in gitignored `backend/.env`. Committed `.env.example` carries placeholders only — never put a real key, token, or credential in a tracked file, log line, or doc example.
- Don't touch `config/settings.py` production settings without being explicitly asked (this mirrors the ClickUp `env-change` tag rule — flag it instead of proceeding).

## Testing

- Add or update tests for business logic, API behavior, migrations, permissions, and background tasks whenever you touch them — this isn't optional cleanup, it's the working rule in `AGENT.md`.
- Run from `backend/` (PowerShell): `.\.venv\Scripts\Activate.ps1` then `python manage.py test`. Run `makemigrations`/`migrate`/`check` whenever models change.
- Look for the relevant `apps/<app>/tests/` module first (e.g. `apps/marketplace/tests/test_offers.py`, `apps/connections/tests/test_connections.py`) — extend the existing test file for a feature area instead of starting a new one unless the area genuinely has none yet.

## Migrations

- Keep migrations intentional and reviewable — one logical change per migration where practical.
- Never write a migration that drops a column or table without the user explicitly asking for that change.
