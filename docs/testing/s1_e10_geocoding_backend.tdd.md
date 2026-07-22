# S1-E10 Private Geocoding and Maps — TDD Evidence

**Date:** 2026-07-22  
**Scope:** approved-host/platform-admin Geoapify search and reverse-geocoding,
plus the private property picker and local GeoJSON district map migrations.

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

## Frontend red/green

Added two browser-boundary test suites before changing the components:

```powershell
cd frontend
npm.cmd test -- PropertyLocationPicker.test.tsx
npm.cmd test -- DistrictMapSelector.test.tsx
```

Initial result: **RED** — the property picker made no owned API call and
initialized `tile.openstreetmap.org`; the district selector also initialized an
OpenStreetMap raster source. Checkpoints: `73fd577` and `3b8370e`.

The green implementation:

- replaces every private-picker Nominatim request with `apiFetch` calls to the
  owned search/reverse endpoints;
- uses the current locale for each request, validates the minimized response,
  presents a localized manual-entry fallback, and labels the search input;
- removes the private picker’s public raster layer, so clicking to pin remains
  usable without a direct third-party location request; and
- renders `DistrictMapSelector` from the committed canonical GeoJSON only, with
  no remote map source. `OpenJobMap` already followed this pattern.

```powershell
npm.cmd test -- PropertyLocationPicker.test.tsx DistrictMapSelector.test.tsx OpenJobMap.test.tsx
npm.cmd run typecheck
npx.cmd eslint components/PropertyLocationPicker.tsx components/PropertyLocationPicker.test.tsx components/DistrictMapSelector.tsx components/DistrictMapSelector.test.tsx
```

Result: **8 focused frontend tests passed**, TypeScript passed, and focused
ESLint passed. The repository-wide `npm.cmd run lint` remains blocked by
generated `frontend/.next/dev` chunks with unavailable third-party rule
definitions; it is unrelated to these source files and was not suppressed.

## Remaining completion work

- Perform the browser network trace through property create/edit, including
  manual-entry fallback, against a running authenticated approved-host session.
- Before production enablement, complete the provider privacy/terms,
  attribution, retention, and processor/recipient review recorded in the
  [S1-E10 capability contract](../S1_E10_MAP_GEOCODING_CAPABILITY.md).
- Add the approved provider disclosure to the privacy notice before release.
