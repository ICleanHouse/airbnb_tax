# S1-D04 approved-policy implementation evidence

Status: **In progress** (2026-07-28). The owner-approved policy is represented
in code; PostgreSQL, Redis/Celery, provider, backup/restore and browser evidence
is still required and is not claimed as passed.

## Implemented contract

- Public cleaner APIs use only `public_id`; public Connect and offer targets are
  resolved server-side with object-hiding semantics.
- Cleaner publication is opt-in with a fixed 14-day pause grace; closure removes
  public visibility immediately.
- Authenticated reviews show only full name, rating, public comment and date.
  Redaction changes a projection without rewriting the protected review record.
- Admin-held legal, dispute and support holds block closure/cleanup with
  sanitized audit entries.
- Closure locks the account, disables access, clears direct identifiers and
  public profile fields, and preserves protected history under a tombstone.
- A dry-run command and bounded Celery task process only temporary signup state
  and history-free closed accounts after the 30-day policy window.
- Geoapify remains backend-only and production fails closed without explicit
  processor approval, attribution and a positive budget configuration.

## Focused verification

```powershell
python manage.py makemigrations --check --dry-run
python manage.py migrate --plan
python manage.py migrate
python manage.py retention_cleanup --dry-run --limit 10
python manage.py test apps.accounts
python manage.py test apps.locations.tests.test_geocoding_api
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

`makemigrations --check`, migration planning, `migrate`, `check`, and the
retention dry-run passed. The initial plan applied the forward-only
`accounts.0023_retention_hold_preserve_released_evidence` migration; the
non-PII dry-run reported 20 temporary-state candidates and zero history-free
account candidates at a limit of 10. Focused closure/public-profile/connection
coverage passed (50 tests); `apps.accounts` passed 98 tests with 5 documented
PostgreSQL skips; Geoapify API coverage passed 9 tests including the production
fail-closed guard. Typecheck and Vitest passed (21 files, 83 tests). Lint passed
with four existing React hook-dependency warnings.

An earlier mixed cross-app command exceeded the local 120-second command limit
before a complete result. It is not a passing result and has not been used as
evidence for the full Django suite.

## Remaining evidence

Run the full Django suite, seeded Playwright UUID/publication/closure journeys,
PostgreSQL concurrency, Redis/Celery cleanup smoke, Geoapify provider/browser
trace, and a non-production backup-restore closure rehearsal before completion.
