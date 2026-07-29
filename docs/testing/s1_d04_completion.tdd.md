# S1-D04 approved-policy implementation evidence

Status: **Complete** (2026-07-29). The owner-approved policy is represented in
code. Local PostgreSQL, Redis/Celery, backup/restore, seeded-browser and
restricted authenticated Geoapify-network evidence passed. The owner record is
in `docs/S1_D04_PRIVACY_RETENTION_DECISION.md`; Geoapify remains disabled in
production until its server-only alert email and other production settings are
configured.

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

## 2026-07-29 runtime evidence

- PostgreSQL 16: `python manage.py test apps.accounts.tests.test_closure_postgres`
  passed (1 test) with a PostgreSQL test database. It proves simultaneous
  history-free closure yields one closure and one idempotent result.
- Redis/Celery: an isolated local worker using `redis://redis:6379/0` processed
  `run_retention_cleanup.delay(1)` with the bounded, non-PII argument `1` and
  returned `{'expired_temporary_state': 1, 'deleted_history_free_accounts': 1}`.
- Backup/restore: an isolated PostgreSQL rehearsal database was migrated, a
  protected-history cleaner was closed, a pre-closure dump was restored, and
  closure reconciliation was rerun. Both checks reported
  `protected_history_anonymized`, `CLOSED_OK`, and
  `RESTORE_RECONCILIATION_OK`. This validates restore-time reapplication, not
  production PITR/offsite backup operation; S1-R04 owns that operational work.
- Browser: the local guarded seed command produced disposable invalid-domain
  accounts. The focused Chromium guest Connect journey passed after UUID
  return-target support was added. The complete seeded Chromium suite then
  passed **10/10**, with no skips.
- Full Django suite: `python manage.py test` passed **492 tests, 10 skipped**.
  The earlier PostgreSQL command that exceeded its command ceiling remains
  unclaimed; the focused PostgreSQL concurrency, migration, and runtime-
  rehearsal results above remain independently recorded.
- CodeGraph: `codegraph sync .` completed with the graph already current.
  Caller analysis covered `safeInternalDestination`, `postAuthDestination`,
  `ConnectButton`, `AccountRetentionHold`, `close_account`, and
  `run_retention_cleanup`; it confirmed the updated redirect callers and the
  hold/closure/cleanup test surfaces listed in this evidence.

## Additional corrections

- The admin retention-hold actions were moved to `UserViewSet`; they had been
  attached to the agency profile viewset despite the intended user route. A
  permission test now proves that only a platform admin can place or release a
  hold.
- Public cleaner return targets now accept only canonical opaque UUIDs, not
  legacy numeric cleaner identifiers. The route remains constrained to the
  shared safe redirect allowlist.
- The public modal renders the approved authenticated review projection's
  reviewer name/tombstone label rather than an inaccurate verification label.

## Geoapify completion evidence and operational boundary

- The approved-host Playwright Geoapify network suite passed **2/2** on
  2026-07-29. It proves lookup requests stay on
  `/api/locations/geocode/*`, no Geoapify/Nominatim/OSM geocoding or tile
  request originates in the browser, and manual entry completes while
  geocoding is disabled.
- Its trace artifact is restricted local evidence in `frontend/test-results/`.
  It is intentionally untracked and excluded from Git.
- The project owner recorded the Free-tier, DPA/terms, EU endpoint,
  subprocessor/retention, attribution, fallback, alert-delivery, and
  re-review decisions in the S1-D04 decision. No recipient address is stored
  in repository evidence.

S1-D04 is complete. Geoapify production use remains disabled until
`GEOAPIFY_USAGE_ALERT_EMAIL` and the other server-only production requirements
are configured. That operational gate belongs to S1-E10 enablement and does
not reopen this decision record.
