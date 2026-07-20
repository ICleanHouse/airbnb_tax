# S1-E09 Calendar and Upload Security TDD Evidence

Date: 2026-07-20  
Scope: S1-E09 only; S1-E02 and all unrelated Stage 1 work are excluded.  
Outcome: complete after the verification commands recorded below passed.

## Stage 1 decision and compatibility boundary

The pilot uses the safest contract stated by S1-E09: server-side calendar URL
import is disabled, manual `.ics` upload remains enabled, and every image write
path actually used in Stage 1 is normalized. No hardened URL fetcher, redirect,
feature flag, compatibility endpoint, evidence upload, verification upload,
incident upload, dispute upload, or general private-media subsystem was added.

No product decision or database migration was required. Existing
`ExternalCalendarConnection` records and their `feed_url` field remain for data
compatibility, but are inert: no route, view, helper, task, signal, command, or
model method dereferences or fetches the URL. Recurrence expansion and legacy
media bulk rewrites remain outside this item.

## Phase 0 read-only inventory

The inventory was completed before production code was edited.

### Calendar routes and executable paths

- `backend/config/urls.py` mounts `apps.properties.urls` at
  `/api/properties/` and `apps.calendars.urls` at `/api/calendars/`.
- `backend/apps/properties/urls.py` registered
  `POST /api/properties/fetch-ics-url/` to
  `apps.properties.views.FetchIcsUrlView` and still registers the preserved
  `POST /api/properties/parse-ics/` to `ParseIcsView`.
- `backend/apps/properties/urls.py` also registers the inert external-calendar
  model API as `/api/properties/calendar-connections/` through
  `ExternalCalendarConnectionViewSet`.
- The only calendar outbound client was `urllib.request.Request` plus
  `urllib.request.urlopen` in `backend/apps/properties/views.py` inside
  `FetchIcsUrlView`. Calendar code had no `requests`, `httpx`, or socket client.
- `backend/apps/calendars/tasks.py::sync_ical_connection` and
  `sync_google_calendar` were and remain ID-returning placeholders with no
  network access. No calendar signal, management command, model method, or
  helper performed an outbound request.
- `backend/apps/properties/models.py::ExternalCalendarConnection.feed_url` and
  `ExternalCalendarConnectionSerializer` store/serialize a URL but do not use
  it. They are retained only as inert compatibility data.

### Calendar frontend surface

`frontend/features/host/HostDashboard.tsx` contained `icsInputMode`, `icsUrl`,
the URL branch in `parseIcs`, the paste-link tab/input, and the API call. The
associated surface also included:

- `.host-ics-mode-tabs`, `.host-ics-mode-tab`, and active/hover variants in
  `frontend/app/globals.css`;
- `uploadFile`, `pasteLink`, `urlLabel`, `urlPlaceholder`, `urlHint`, and
  `errorNoUrl` under `icsModal` in both locale files;
- `fetch-ics-url` endpoint-name allowlist entries in
  `frontend/api/client.ts` and `backend/apps/core/sentry.py`;
- no pre-existing component coverage for the file-only contract.

### Stage 1 upload inventory and classification

| Upload/data path | Repository contract before S1-E09 | Classification |
|---|---|---|
| Property images | Multipart `PropertyImage.image` (`ImageField`, `property_images/` storage); serializer accepted an `ImageField` and returned only object-authorized `content_url` | In scope |
| Cleaner signup image | Browser crop emitted a data URL into `SignupSerializer.profile_image`; stored in `CleanerProfile.profile_image` (`TextField`) | In scope |
| Cleaner profile image update | Browser crop emitted a data URL through `CleanerProfileSerializer`; field could also contain a legacy URL/string | In scope |
| Manual ICS | Multipart `ics_file` parsed in memory by `ParseIcsView`; response was a list of event dictionaries | In scope |
| Calendar URL import | JSON URL passed to `FetchIcsUrlView`, which fetched it with `urllib.request` | In scope for removal only |
| Existing property image reads | `/api/properties/images/{id}/content/` object-authorized streaming; raw `/media/*` returns 404 | Preserve |
| Public cleaner image reads | `profile_image` API/data string exposed only through existing approved public-profile projections | Preserve |
| External calendar model URLs | Stored but not needed by the pilot and not fetched outside the removed view | Inert compatibility |
| Verification, support, incident, dispute, or evidence files | No implemented upload path found | Explicitly excluded; none added |

No other file/image upload path was found. Audit logging uses
`apps.core.services.write_audit_log` and the append-only `AuditLog` model.
Existing property-image authorization is implemented in
`apps.properties.views._user_can_access_property_image`. Existing operator
permission convention is `IsPlatformAdmin`; approved host state comes from the
account role/status model. There was no endpoint-specific DRF throttle or
shared-cache configuration before this item.

## Centralized limits and rationale

### Manual ICS policy (`backend/apps/properties/ics_import.py`)

| Constant | Value | Rationale |
|---|---:|---|
| `ICS_MAX_UPLOAD_BYTES` | 1 MiB | Proposed pilot default; bounds memory before parser use |
| `ICS_MAX_EVENTS` | 1,000 | Proposed default; bounds response amplification |
| `ICS_MAX_UID_LENGTH` | 255 | Matches existing external UID storage width |
| `ICS_MAX_SUMMARY_LENGTH` | 500 | Preserves useful text while bounding attacker-controlled output |
| `ics_import` throttle | 30/hour/authenticated user | Proposed pilot default; DRF `UserRateThrottle` keys the database user |

Allowed declared MIME hints are `text/calendar`, `application/ics`, and
`application/octet-stream`; the `.ics` extension and a successfully parsed
`VCALENDAR` remain mandatory. Deployed environments use the Django Redis cache
configured by `CACHE_URL`; local development/tests use a named LocMem cache.

### Image policies (`backend/apps/core/image_uploads.py`)

| Policy | Encoded input | Dimensions/pixels | Output | Quality |
|---|---:|---:|---|---:|
| Property | 10 MiB | 8,192 max side; 40 MP | contain within 2,048 x 2,048 JPEG | 85 |
| Cleaner | 2 MiB | 8,192 max side; 40 MP | center cover-crop 720 x 720 JPEG | 85 |

Both policies accept only content decoded by Pillow as JPEG, PNG, or WebP,
require one frame, apply EXIF orientation, render into a new RGB buffer, and
write a new UUID-named JPEG. This strips EXIF/GPS, ICC, comments, XMP, original
filenames, and other source metadata. The selected limits are the S1-E09
defaults and match the established 720-square cleaner crop contract.

## Sequential TDD batches

### Batch A — remove calendar URL fetching

RED evidence:

- `python manage.py test apps.properties.tests.test_ics_import_security` found
  3 tests with 2 expected failures: the endpoint returned 400 instead of 404,
  and calendar runtime code still imported `urllib.request`.
- `npm.cmd test -- HostDashboard.test.tsx` found 7 tests with 1 expected
  failure because the paste-link control still rendered.

GREEN implementation and tests:

- Removed the route, `FetchIcsUrlView`, `urllib.request` import/use, telemetry
  endpoint allowlist entries, URL-mode state/API/UI, dead CSS, and dead locale
  keys.
- Added a literal 404 regression test, source-level forbidden-client test, and
  placeholder-task no-outbound test.
- Added a host component assertion that only the file control renders and both
  locale files explain that URL import is unavailable during the pilot.
- Focused backend result: 3/3 passed. Initial focused host result: 7/7 passed.

### Batch B — harden manual ICS upload

RED evidence:

- The first focused 31-test run failed as expected across missing permission,
  size/type/content bounds, safe errors, headers, throttle, audit redaction,
  and compatibility contracts.

GREEN implementation and tests:

- `IsApprovedHostOrPlatformAdmin`, `IcsImportUserThrottle`, centralized upload
  validation/parser helpers, safe BG/EN errors, private/no-store headers, and
  metadata-only audit outcomes were added.
- Validation is ordered before parsing; uploaded bytes/calendar content are
  never persisted. All VEVENTs require supported matching date/datetime types,
  `DTSTART`, `DTEND`, and a strictly increasing normalized interval.
- The existing response contract remains
  `[{uid, summary, checkin, checkout, nights}]`; blocked/unavailable entries are
  still filtered.
- Explicit compatibility decisions: all-day, timezone-aware, and floating
  datetimes are accepted; duplicate UIDs remain separate in stable order;
  missing UID is `""`; missing summary is `"Reservation"`; recurring events
  are not expanded; folded lines use the parser's unfolded value; malformed
  components reject the whole upload generically.
- Focused result:
  `python manage.py test apps.properties.tests.test_ics_upload_hardening apps.properties.tests.test_ics_import_security`
  — 38 tests passed in 0.663s.

### Batch C — normalize Stage 1 images

RED evidence:

- The initial 21-test backend image run failed as expected before the shared
  normalization service and legacy cleaner-field rules existed.
- The focused frontend run failed first on the missing validation helper and
  the expected host image/ICS immediate-feedback assertions.

GREEN implementation and tests:

- Added one Pillow normalization service with separate immutable property and
  cleaner policies; connected it to property multipart writes, cleaner signup,
  and cleaner profile PATCH.
- Existing unchanged cleaner URL values survive; identical resubmission is a
  no-op; a different external URL is rejected; blank removal remains valid.
- Added browser-side type/byte hints without changing authoritative backend
  validation or multipart headers.
- Backend focused result:
  `python manage.py test apps.properties.tests.test_image_upload_security apps.accounts.tests.test_profile_image_security`
  — 21 tests passed in 0.805s.
- Frontend focused result:
  `npm.cmd test -- uploadValidation.test.ts HostDashboard.test.tsx`
  — 2 files and 13 tests passed. Cleaner profile component validation then
  passed 6/6 after the test used the component's actual accessible account-menu
  control.

## Test matrix

| Area | Proved behavior |
|---|---|
| URL removal | literal endpoint 404; no URL UI/API/allowlist; calendar runtime source has no network client; dormant tasks call no client |
| ICS access | anonymous, cleaner, agency, pending, rejected, suspended, and inactive denied; approved host/admin allowed |
| ICS request bounds | required field/name/extension; empty, exact 1 MiB, oversized; uppercase `.ICS`; MIME hint cases |
| ICS content | VCALENDAR, exact/excess event limit, dates/datetimes, order, strings, filtering, folded lines, recurrence, duplicates/defaults |
| ICS privacy/abuse | stable localized errors, no-store headers, user-key throttle, started/succeeded/rejected/throttled audits without sensitive values |
| Property images | JPEG/PNG/WebP, spoofing, malformed/truncated/unsupported/animated, byte/side/pixel/bomb limits, EXIF orientation, metadata stripping, resize/format/UUID, object authorization |
| Cleaner images | normalization to 720 JPEG data URL, signup/update safe errors, size/format limits, unchanged legacy URL, external URL rejection, removal |
| Frontend | file-only ICS modal, FormData path, immediate ICS/property/cleaner file feedback, matching BG/EN keys |

## Verification record

The requested `backend/.venv/Scripts/Activate.ps1` does not exist in this
checkout (`Test-Path` returned `False`), so the repository's installed global
Python 3.14.3 environment was used. Node was v24.14.1 and npm 11.12.1.

| Command | Exact result |
|---|---|
| `python -m ruff check` on all changed backend Python files | Passed, `All checks passed!` |
| `python manage.py check` | Passed, 0 issues |
| `python manage.py makemigrations --check --dry-run` | Passed, no changes detected |
| `python manage.py test apps.properties apps.accounts apps.calendars apps.core` | Passed, 145 tests in 55.424s |
| `python manage.py test` | Passed, 373 tests in 335.358s; 1 skipped |
| `npm.cmd test` | Passed, 8 files / 43 tests |
| `npm.cmd run typecheck` | Passed, `tsc --noEmit` |
| `npm.cmd run lint` | Passed with 0 errors and 5 existing hook-dependency warnings |
| `git diff --check` | Passed; only Windows line-ending notices |

No frontend build was run, in accordance with the repository instruction.

## Post-implementation security searches

- Runtime search for `fetch-ics-url`, `FetchIcsUrlView`, `urllib.request`,
  `requests.`, `httpx.`, and `socket.` under property/calendar/host code found
  no executable match. The removed endpoint and client tokens remain only in
  `test_ics_import_security.py` as negative regression sentinels.
- Search for `icsUrl`, `setIcsUrl`, URL parse mode, removed translation names,
  and `.host-ics-mode-*` returned no matches.
- No new direct frontend `fetch` was introduced. The approved wrapper contains
  the expected native call in `frontend/api/client.ts`.
- One unrelated, pre-existing direct browser call remains at
  `frontend/components/PropertyLocationPicker.tsx:111`; it is tracked by
  S1-E10/S1-B17 and was not changed here.
- Search found no unsafe `.url` dereference on cleaner text/data-URL image
  fields.

## Remaining limitations

- Calendar-link import is intentionally unavailable for the whole pilot.
- External-calendar model rows can be managed but are not synchronized; both
  calendar tasks are deliberately inert.
- Recurring VEVENT rules are not expanded and duplicate UIDs are not collapsed,
  preserving the prior response behavior.
- Existing property files and legacy cleaner image strings are not bulk
  rewritten. Every new/changed Stage 1 image is normalized.
- Browser checks are immediate usability hints only; the backend decoder and
  parser remain authoritative.
- The five existing React hook-dependency lint warnings and the unrelated
  location-picker direct fetch remain outside S1-E09.

