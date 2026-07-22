# S1-E10 Private Geocoding Backend — TDD Evidence

**Date:** 2026-07-22  
**Scope:** approved-host/platform-admin Geoapify search and reverse-geocoding
API foundation. The browser property-picker migration is deliberately outside
this backend slice.

## Behaviour under test

| Journey | Expected result |
|---|---|
| Approved host searches an address | The server calls the configured provider and returns at most six normalized candidates. |
| Platform admin reverse-geocodes a point | The server returns at most one normalized candidate. |
| Anonymous, ineligible, suspended, or inactive account calls either endpoint | `403`; no provider call. |
| Bad query or Bulgaria-out-of-bounds coordinate | `400`; no provider call. |
| Provider key is absent or provider transport fails | `503` with a generic manual-entry fallback; raw provider data never appears in the response or audit metadata. |
| Shared provider budget is exhausted | `429` with a safe rate-limit code; no raw query is stored. |

Both endpoints require the persisted approved-host/platform-admin permission,
apply a per-user `30/hour` DRF throttle plus a shared provider ceiling, return
`private, no-store` responses, and write audit events containing only action,
reason code, and result count.

## Red

Added `backend/apps/locations/tests/test_geocoding_api.py` before the feature.

```powershell
cd backend
python manage.py test apps.locations.tests.test_geocoding_api
```

Initial result: **RED** — seven tests ran and failed because the geocoding
routes and `apps.locations.geocoding` module did not yet exist. Checkpoint:
`2610788` (`test: add S1-E10 geocoding API reproducer`).

## Green

Implemented the minimized Geoapify client, serializers, approved-host/admin
views, user and shared-provider throttles, audit-safe error handling, and
server-only settings.

```powershell
cd backend
python manage.py test apps.locations.tests.test_geocoding_api
```

Result: **PASS** — 7 tests, 0 failures.

Additional backend verification:

```powershell
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test apps.locations
```

Result: system check clean, no model changes pending, and **17 location tests
passed**. `python -m coverage --version` could not run because the local Python
environment does not have the `coverage` module installed; this checkpoint does
not add or alter project dependencies merely to produce a coverage figure.

## Scope and remaining completion work

- No frontend UI or browser tile implementation is included here, so browser
  E2E testing is not applicable to this backend-only checkpoint.
- The existing property picker must switch from direct browser Nominatim calls
  to these owned endpoints through `apiFetch`, retain manual address/district
  entry as its fallback, and use the committed Sofia GeoJSON zones.
- Before production enablement, complete the provider privacy/terms,
  attribution, retention, and processor/recipient review recorded in the
  [S1-E10 capability contract](../S1_E10_MAP_GEOCODING_CAPABILITY.md).
