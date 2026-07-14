# Release-blocking privacy fix: TDD evidence

## Source and journeys

The source plan was supplied in the implementation request and recorded in
`docs/STAGE_1_SOFIA_PILOT_PLAN.md` as S1-D04. The two release journeys were:

1. As an anonymous marketplace visitor, I can see useful Sofia district demand
   without learning which property, host, address, coordinate, photo, schedule,
   or price produced that demand.
2. As a signup user, I can recover only non-sensitive selections after refresh;
   passwords, confirmation values, codes, and tokens remain memory-only and
   must be re-entered.

Supporting journeys cover approved evaluator/assigned/history tiers, protected
property images, safe telemetry, legacy recovery cleanup, and stable query
budgets.

## RED and GREEN record

| Task | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Anonymous demand contract | New aggregate-schema, recursive sentinel, alias, canonical-zone, role/status, and alternate-endpoint tests failed against the legacy per-job discovery response before the endpoint/serializers were replaced. | `python manage.py test apps.marketplace` — 136/136 PASS | Anonymous responses are district/city aggregates only and the compatibility alias is identical and deprecated. |
| Evaluator, assignment, history, and media tiers | New serializer-key, nested-leak, HTTP matrix, raw-media, protected-content, and query-budget tests failed before the dedicated projections and object authorization existed. | Security-focused backend run — 135/135 PASS; `python manage.py test apps.locations apps.properties apps.calendars apps.feedback` — 85/85 PASS | Server-side allowlists and object-level media authorization enforce each workflow tier without raw storage paths. |
| Revoked/stale transition eligibility | Ten new service tests failed when actors/applicants were revoked or jobs had already started. | Marketplace transition surface — 54/54 PASS; included in marketplace 136/136 | Assignment and offer transitions re-fetch locked current actors and reject revoked or past-start work. |
| Non-contact host display | `python manage.py test apps.marketplace.tests.test_marketplace_privacy.EvaluatorJobPrivacyTests.test_assigned_and_history_host_display_never_falls_back_to_email` failed with `PRIVATE_HOST_CONTACT@example.test != Host`. | The same command PASS | Blank host names never expose the login username/email to assigned or history workers. |
| Signup persistence allowlist | Recovery tests failed against broad wizard-state persistence and legacy sensitive records. Two later catalog tests also failed because synthetic slug-shaped values such as `password:secret` survived. | Signup recovery and page tests — 13/13 PASS | Only recognized allowlisted selections are stored; legacy secrets and unknown catalog values are removed. |
| Obsolete verification code | `npm.cmd test -- features/signup/SignupPage.test.tsx -t "clears an obsolete verification code"` failed because the input retained `123456`. | SignupPage focused test PASS | A successful resend clears the obsolete code from React state/UI. |
| Telemetry request IDs | `python manage.py test apps.core.tests.test_observability.CeleryRequestIdTests.test_untrusted_broker_request_id_is_replaced_before_logging` failed because `password-secret-sentinel` reached the log record. | `CeleryRequestIdTests` — 2/2 PASS | HTTP and broker request IDs must match `req_` plus 32 lowercase hex characters; untrusted values are replaced. |
| Frontend aggregate and safe projections | Component/API tests initially targeted the old marker shape and operational fields. | Focused frontend run — 7 files, 35/35 PASS; full `npm.cmd test` — 35/35 PASS | The demand UI consumes aggregates only; evaluator, assigned, and history screens accept their safe shapes. |

## Final validation

- `python manage.py check` — PASS.
- `python manage.py makemigrations --check` — PASS, no changes detected.
- `python manage.py test apps.marketplace` — 136/136 PASS.
- `python manage.py test apps.accounts` — 37/37 PASS.
- `python manage.py test apps.locations apps.properties apps.calendars apps.feedback` — 85/85 PASS.
- `python manage.py test` — 299/299 PASS.
- `npm.cmd test` — 35/35 PASS.
- `npm.cmd run typecheck` — PASS.
- `npm.cmd run lint` — PASS with zero errors and five existing hook-dependency warnings.
- Ruff across all changed Python files — PASS.
- Fresh in-memory migrated WSGI smoke — canonical/alias 200, unknown city 404,
  protected media GET/HEAD 403 when anonymous, and raw media 404, with the
  required no-store/security headers.

## Coverage and known gaps

The repository has no frontend `test:coverage` script and the backend
environment does not have the `coverage` module installed, so no percentage is
claimed. All 299 backend tests and all 35 configured frontend tests passed.
The in-app browser connection was unavailable, so service-worker absence was
verified statically and the HTTP/cache contract was exercised through a fresh
migrated WSGI application. A production browser/proxy cache smoke remains a
deployment gate.

No TDD checkpoint commits were created; the user requested implementation in
the working tree and no commit operation was authorized. RED/GREEN evidence is
preserved here and in the test names.

## Exact changed-file inventory

The final working-tree implementation contains these 88 files:

```text
a1_populate_tables_test.py
AGENT.md
AGENTS.md
architecture.md
backend/apps/accounts/serializers.py
backend/apps/accounts/services.py
backend/apps/accounts/tests/test_auth_agency_consent.py
backend/apps/accounts/tests/test_public_cleaners.py
backend/apps/accounts/views.py
backend/apps/calendars/services.py
backend/apps/calendars/tests/__init__.py
backend/apps/calendars/tests/test_conflict_privacy.py
backend/apps/calendars/views.py
backend/apps/connections/tests/test_connections.py
backend/apps/connections/views.py
backend/apps/core/logging.py
backend/apps/core/middleware.py
backend/apps/core/sentry.py
backend/apps/core/tests/test_observability.py
backend/apps/core/views.py
backend/apps/feedback/serializers.py
backend/apps/feedback/services.py
backend/apps/feedback/tests/test_review_invariants.py
backend/apps/feedback/tests/test_review_notifications.py
backend/apps/locations/migrations/0003_seed_canonical_sofia_zones.py
backend/apps/locations/tests/test_canonical_sofia_zones.py
backend/apps/locations/tests/test_locations_api.py
backend/apps/locations/views.py
backend/apps/marketplace/selectors.py
backend/apps/marketplace/serializers.py
backend/apps/marketplace/services.py
backend/apps/marketplace/tests/test_account_status_gates.py
backend/apps/marketplace/tests/test_agency_delegation_contract.py
backend/apps/marketplace/tests/test_area_stats.py
backend/apps/marketplace/tests/test_marketplace_api_permissions.py
backend/apps/marketplace/tests/test_marketplace_privacy.py
backend/apps/marketplace/tests/test_offers.py
backend/apps/marketplace/tests/test_open_job_locations.py
backend/apps/marketplace/tests/test_services.py
backend/apps/marketplace/urls.py
backend/apps/marketplace/views.py
backend/apps/properties/migrations/0004_property_service_zone.py
backend/apps/properties/migrations/0005_backfill_property_service_zones.py
backend/apps/properties/models.py
backend/apps/properties/serializers.py
backend/apps/properties/tests/__init__.py
backend/apps/properties/tests/test_property_images.py
backend/apps/properties/tests/test_property_service_zones.py
backend/apps/properties/views.py
backend/config/celery.py
backend/config/settings.py
backend/config/urls.py
CURRENT_PROGRESS.md
DEPLOY.md
deploy/Caddyfile
DEV.md
docs/STAGE_1_SOFIA_PILOT_PLAN.md
docs/testing/release_blocking_privacy_fix.tdd.md
frontend/api/client.test.ts
frontend/api/client.ts
frontend/app/globals.css
frontend/components/AreaDemandPanel.tsx
frontend/components/CleanerProfileModal.tsx
frontend/components/Connections.tsx
frontend/components/OpenJobMap.test.tsx
frontend/components/OpenJobMap.tsx
frontend/components/README.md
frontend/features/cleaner/CleanerDashboard.test.tsx
frontend/features/cleaner/CleanerDashboard.tsx
frontend/features/host/HostDashboard.test.tsx
frontend/features/host/HostDashboard.tsx
frontend/features/signup/SignupPage.test.tsx
frontend/features/signup/SignupPage.tsx
frontend/features/signup/signupRecovery.test.ts
frontend/features/signup/signupRecovery.ts
frontend/instrumentation-client.ts
frontend/lib/sentry-sanitize.test.ts
frontend/lib/sentry-sanitize.ts
frontend/messages/bg.json
frontend/messages/en.json
frontend/next.config.mjs
frontend/sentry.edge.config.ts
frontend/sentry.server.config.ts
frontend/types/connection.ts
frontend/types/property.ts
README.md
TEST_PLAN.md
TGN.md
```
