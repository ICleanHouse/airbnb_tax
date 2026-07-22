# S1-E10 — Map and Geocoding Capability Contract

| Field | Value |
|---|---|
| Status | Draft implementation contract — Geoapify capability validated; provider/terms approval pending |
| Date | 2026-07-22 |
| Stage 1 item | S1-E10 |
| Owner direction | Keep third-party map/geocoding capability; use OpenStreetMap-derived map data for exact property selection; do not expose private location data to anonymous users. |

## Capability

An approved, active host can search for and select a property location while
creating or editing a property.  The application may use an approved
third-party map/geocoding provider, but it controls access, data minimisation,
logging, and failure behaviour.  Anonymous users continue to see only the
existing city/district aggregate-demand map and list.

## Current baseline

- The anonymous `GET /api/marketplace/public-demand/` response and
  `OpenJobMap` are already aggregate-only: they contain no property/job ID,
  address, coordinate, schedule, price, host, or media value.
- `PropertyLocationPicker` now sends address searches and clicked coordinates
  to the owned private endpoints through `apiFetch`. It uses a neutral
  click-to-pin Leaflet surface with no remote tile request; its localized
  fallback keeps manual address/district entry usable.
- `DistrictMapSelector` now renders the canonical GeoJSON and parks data over
  a neutral background, without a remote map tile source.
- The existing locations app owns the canonical city and Sofia-zone catalog;
  it is the correct boundary for geocoding, not a property serializer or view.

## Fixed constraints

- Public demand remains canonical city/Sofia-zone aggregation only.  No
  anonymous response, map marker, or browser request may contain an exact
  property location or a private job/property/host identifier.
- Private location lookup is available only to an active, approved host or a
  platform admin.  Pending, suspended, cleaner, agency, and anonymous callers
  are denied.
- The browser uses `apiFetch` for every owned endpoint.  Provider credentials
  exist only in the gitignored backend environment.
- The backend validates and minimises search text and coordinates before an
  outbound request.  It never log raw queries, addresses, coordinates,
  provider URLs, or provider bodies; audit/telemetry records only an allowed
  event, result count bucket, and non-sensitive reason code.
- A provider outage, malformed upstream response, disabled configuration, or
  rate limit produces a localized, generic response and leaves manual
  address/canonical district entry usable.
- Property addresses and coordinates retain the existing private/no-store
  treatment and never enter the public-demand pipeline.

## Provider recommendation and approval required

**Recommended provider: Geoapify Maps and Geocoding.** Geoapify provides
OpenStreetMap-based vector and raster tiles, forward/reverse geocoding, address
autocomplete, routing, and other location services. Its card-free Free plan
currently includes 3,000 credits per day and up to five requests per second;
the planned host-only property lookup is comfortably below that rate.

On 2026-07-22, the locally configured key was tested with one non-sensitive
Sofia forward lookup, one reverse lookup for public Sofia-centre coordinates,
and one `osm-bright` raster tile. All three returned HTTP 200. No key, private
address, request URL, or response body was recorded.

The owner must approve Geoapify's plan/budget and privacy terms before pilot
release. The prepared [Geoapify provider review](S1_E10_GEOAPIFY_PROVIDER_REVIEW.md)
records the DPA/privacy evidence, the EU-only endpoint correction, attribution,
and the explicit decision checklist. The approval record must cover its
DPA/privacy terms, data location, retention/logging, rate and usage limits,
attribution, credential restrictions, and incident/support contact.

The public `nominatim.openstreetmap.org` service is not a valid production
processor for private property addresses: its current policy says not to submit
confidential material and prohibits client autocomplete. The current public OSM
tile service is best-effort and may block non-compliant use. It must not remain
in the private picker. Geoapify is the approved-processor candidate because it
supplies OSM-based tiles and geocoding with a production account boundary. See the
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
and [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/),
plus [Geoapify pricing](https://www.geoapify.com/pricing/) and
[Geoapify OSM tiles](https://apidocs.geoapify.com/docs/maps/).

## Implementation contract

### API

Add two private, no-store endpoints in `apps.locations`:

| Endpoint | Input | Success output | Access |
|---|---|---|---|
| `POST /api/locations/geocode/search/` | `{ query, locale }` | Up to six normalized location suggestions | approved host or admin |
| `POST /api/locations/geocode/reverse/` | `{ latitude, longitude, locale }` | One normalized location suggestion | approved host or admin |

The response contract is provider-neutral:

```json
{
  "results": [{
    "latitude": 42.6977,
    "longitude": 23.3219,
    "address": "…",
    "city": "Sofia",
    "neighborhood": "…"
  }]
}
```

No upstream identifier, confidence diagnostic, raw display body, request URL,
or provider error is returned.  Search accepts 3–160 trimmed characters;
reverse lookup accepts finite decimal coordinates in the Bulgaria bounding box.
The backend caps results at six and requests Bulgarian/English output only.

### Service and configuration

- Add a provider-neutral service in `apps.locations` with an injectable HTTP
  client for tests; views only validate/authorize and serialize responses.
- Add `geocoding` user throttling in DRF configuration and a shared cache-backed
  provider budget.  The exact limits follow the approved provider plan; no
  browser-side timer is authoritative.
- Add fail-closed configuration for a server-only Geoapify geocoding key. It
  is never committed or returned to the browser. A future third-party browser
  tile layer would require a separately approved, origin-restricted browser
  key; the Stage 1 implementation intentionally has no such layer. An absent
  or invalid server configuration makes the endpoints return the documented
  unavailable response.
- Geoapify permits storage of its results under its terms, but raw
  address/coordinate values remain excluded from cache keys, logs, audit
  metadata, Sentry, and analytics.

### Frontend maps

- `PropertyLocationPicker` uses the two owned endpoints through `apiFetch` and
  has removed Nominatim-specific caching, delay, types, and wording.
- Retain Leaflet as a neutral private click-to-pin surface with no browser tile
  request. Backend calls to Geoapify Geocoding retain the server-only key.
- `DistrictMapSelector` renders local canonical GeoJSON against the same
  neutral, no-tile background used by the public demand map.
- Keep `OpenJobMap` self-contained.  It must retain its local canonical
  GeoJSON and aggregate list fallback and must not add tile, marker, or
  geocoding requests.
- Add localized provider disclosure and a keyboard-operable manual address and
  district alternative.  The map cannot be the sole means of providing a
  location.

## Test and release evidence

- Backend: anonymous/wrong-role/pending denial; host/admin success; input
  bounds; provider timeout/malformed/error; unavailable configuration; user
  and global throttling; no-store headers; and redacted logs/audit/Sentry.
- Frontend: `PropertyLocationPicker` calls only `apiFetch`, shows localized
  failure/fallback states, and contains no Nominatim URL or direct `fetch`.
  Add a regression assertion that the public map has no external tile source
  and receives only aggregate demand data.
- Manual browser trace: anonymous landing has no exact location in requests;
  property create/edit sends private lookup only to the owned API and approved
  map processor; all required attribution is visible.
- Update the BG/EN privacy notice with the approved provider/recipient,
  purpose, data categories, retention/logging, and non-map fallback before
  pilot release.

## Execution order

1. Approve the Geoapify account, server-only key, budget limit, and privacy
   review before production enablement.
2. [x] Add the Geoapify-backed backend service, endpoints, settings, throttles,
   and backend tests using a fake upstream.
3. [x] Migrate `PropertyLocationPicker` to the owned API with a neutral
   click-to-pin surface and make `DistrictMapSelector` GeoJSON-only; preserve
   manual entry and public-map isolation.
4. [x] Add focused frontend tests and BG/EN failure/fallback copy. Complete the
   authenticated browser network trace and provider privacy notice next.
5. Attach provider review, network trace, test results, and release evidence to
   S1-E10; then update the Stage 1 tracker from **Not started** to **Done**.

## Non-goals

- No public property search, exact public pins, route planning, autocomplete
  based on typing, bulk geocoding, location history, or background map
  prefetching.
- No map/geocoding use by a cleaning-job discovery endpoint.
- No provider key, payment, or contractual approval is created by engineering.

## Handoff

The API and UI foundations are implemented and covered by fake-provider tests.
Production use of the configured processor remains blocked on the
named-provider approval, privacy notice, and authenticated network trace above.
