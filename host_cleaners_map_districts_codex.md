# Host Cleaners — Map & District Selection System

## Current implementation status (2026-06-16)

This document began as a design proposal. The Sofia implementation is now
live, and the current state below overrides older proposal/migration examples
later in this document.

```text
Canonical editable GeoJSON:
  districits_sofia/sofia_districts_ready.geojson

Hardcoded frontend ID/name catalog:
  frontend/lib/sofiaDistricts.ts

Runtime map geometry:
  frontend/public/maps/sofia/districts.geojson

Stable IDs:
  sofia:osm-1 through sofia:osm-144
```

Current rules:

- The three Sofia sources above must contain exactly the same 144 unique
  ID/name pairs.
- Canonical Bulgarian names are displayed unchanged, including `кв.` and
  `ж.к.` prefixes.
- The cleaner-profile district map and both public cleaner-search dropdowns
  load the same zones through `frontend/lib/locations.ts`.
- Search dropdowns sort by canonical Bulgarian name and use stable zone IDs as
  option values.
- Sofia `legacy_names` are empty. Do not restore stripped-name aliases.
- `backend/apps/locations/fixtures/sofia_service_zones.geojson` was removed and
  must not be restored.
- `backend/apps/locations/migrations/0002_remove_legacy_sofia_service_zones.py`
  removes obsolete Sofia database zones while retaining `osm-1..144` rows and
  clearing aliases.
- `a1_populate_tables_test.py` validates the canonical GeoJSON and synchronizes
  current Sofia zone/geometry rows before creating test data.
- Cleaner profiles still persist canonical district-name strings in
  `service_areas`; selectors use stable IDs internally and convert selected IDs
  back to canonical names when saving.

The remaining architecture guidance uses the current Sofia IDs and canonical
names. Some staged-normalization notes still describe possible future database
work for profiles and non-Sofia cities.

## Purpose

Build a scalable city/district selection system for the Host Cleaners marketplace.

The current project already uses city/district selection in cleaner signup, cleaner profile service areas, the public cleaner browser, and host search. Today, cleaners store `service_areas` as a flat `string[]` of Cyrillic district names, and the frontend reverse-maps zones to cities through `frontend/lib/cityDistricts.ts`.

This document defines the next architecture so the feature can grow from MVP into a full SaaS geography module without rebuilding it later.

## Decision

Use a free/open-source geospatial stack:

```text
Frontend map engine: MapLibre GL JS
District boundaries: GeoJSON / TopoJSON polygons
Initial storage: static GeoJSON files + backend canonical zone records
Long-term storage: PostgreSQL + PostGIS
Future tile hosting: OpenMapTiles + TileServer GL, self-hosted
Base map data: OpenStreetMap, with required attribution
```

Do not use Google Maps or Mapbox as the core dependency for this feature. They are good products, but they create vendor lock-in and possible costs later. Use them only if a future business decision explicitly accepts that dependency.

## Why MapLibre, not Leaflet

Leaflet is easier for a quick MVP, but MapLibre is better for a SaaS that may later need:

- many Bulgarian cities;
- vector tiles;
- smoother mobile/PWA performance;
- custom map styling;
- self-hosted maps;
- no dependency on Google or Mapbox;
- district polygons now, more advanced geospatial features later.

MapLibre supports GeoJSON sources and styled polygon layers. That is enough for the first implementation, while still keeping a path toward vector tiles and self-hosted base maps.

## Licensing rule

If OpenStreetMap data is used anywhere, display visible attribution near the map:

```text
© OpenStreetMap contributors
```

Do not assume that data from municipal GIS websites is free for commercial SaaS use. For Sofia and other cities, check the data license before importing official boundaries into the project.

## Current project context

Relevant current implementation:

```text
frontend/app/page.tsx
  Public landing page: compact hero + CleanerBrowser

frontend/app/cleaners/page.tsx
  Host/admin cleaner directory using CleanerBrowser

frontend/app/components/CleanerBrowser.tsx
  Shared city/district cleaner browser

frontend/lib/sofiaDistricts.ts
  Canonical Sofia stable ID/name catalog

frontend/lib/cityDistricts.ts
  City configuration and non-Sofia fallback lists

frontend/app/signup/page.tsx
  Signup wizard, including location/service-area step

frontend/app/cleaner/page.tsx
  Cleaner profile, including service-area editing

backend/apps/accounts
  CleanerProfile currently stores service_areas as JSON list
  HostProfile and AgencyProfile use city/service-area data
```

Important project rules:

- Do not call `fetch` directly in frontend code. Use `frontend/lib/api.ts` / `apiFetch`.
- Do not set `Content-Type: application/json` manually for `FormData`.
- Keep signup changes end-to-end: frontend state, backend models, serializers, migrations, and tests.
- Public `/` remains a public entry point, not an authenticated dashboard.
- Keep Bulgarian/English UI support.
- No payments or unrelated marketplace refactors.

## Target UX

Create a reusable district map selector for city service areas.

The UX should support both map interaction and non-map interaction:

```text
Desktop/tablet:
- city selector
- interactive district map
- click district to select/deselect
- hover district to highlight and show tooltip
- selected districts shown as tags/list
- clear all / select all visible

Mobile:
- map can still be shown, but must not be the only control
- searchable checklist fallback is required
- selected districts remain visible as removable tags
```

The map should visually support:

```text
Default district: light neutral fill
Hovered district: stronger border/fill
Selected district: brand/teal fill
Disabled district: greyed out
District with active cleaners: optional badge/count later
```

## Proposed frontend component

Create a reusable client component:

```tsx
// frontend/app/components/DistrictMapSelector.tsx

export type DistrictMapSelectorProps = {
  citySlug: string;
  selectedZoneIds: string[];
  onChange: (nextZoneIds: string[]) => void;
  disabledZoneIds?: string[];
  mode?: "single" | "multiple";
  language?: "bg" | "en";
  showListFallback?: boolean;
};
```

Behavior:

- Load zone metadata from backend API.
- Load city GeoJSON from backend API or static file.
- Match each GeoJSON feature to backend zone by stable `zone_id` / `slug`.
- Render polygon fill/border state based on selection.
- Keep selection controlled through `selectedZoneIds`.
- Provide a list fallback below the map.
- Use `apiFetch` for backend calls.
- Use dynamic import or a client-only wrapper so MapLibre does not break Next.js SSR.

Suggested files:

```text
frontend/app/components/DistrictMapSelector.tsx
frontend/app/components/DistrictChecklist.tsx
frontend/app/components/DistrictSelectedTags.tsx
frontend/lib/locations.ts
frontend/types/locations.ts
```

## Backend architecture

Create a dedicated location/geography domain app:

```text
backend/apps/locations/
```

Reason: districts/cities will be shared by accounts, marketplace, search, landing page, cleaner browser, admin, and future map features. It should not live inside `accounts` or only in frontend constants.

### Models

Start without requiring PostGIS so local SQLite remains simple. Store GeoJSON geometry as JSON for now. Prepare field names so migration to PostGIS later is clean.

```python
# backend/apps/locations/models.py

from django.db import models


class City(models.Model):
    slug = models.SlugField(unique=True)
    name_bg = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    country_code = models.CharField(max_length=2, default="BG")
    center_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    center_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    default_zoom = models.PositiveSmallIntegerField(default=11)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name_bg"]

    def __str__(self):
        return self.name_bg


class ServiceZone(models.Model):
    city = models.ForeignKey(City, related_name="zones", on_delete=models.CASCADE)
    slug = models.SlugField()
    name_bg = models.CharField(max_length=150)
    name_en = models.CharField(max_length=150, blank=True)
    zone_type = models.CharField(max_length=50, default="district")
    legacy_names = models.JSONField(default=list, blank=True)
    center_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    center_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("city", "slug")]
        ordering = ["city__sort_order", "sort_order", "name_bg"]

    def __str__(self):
        return f"{self.city.slug}: {self.name_bg}"


class ServiceZoneGeometry(models.Model):
    zone = models.OneToOneField(ServiceZone, related_name="geometry", on_delete=models.CASCADE)
    geometry = models.JSONField()
    simplified_geometry = models.JSONField(null=True, blank=True)
    source = models.CharField(max_length=150, blank=True)
    source_license = models.CharField(max_length=150, blank=True)
    source_url = models.URLField(blank=True)
    attribution = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

Later, when production uses PostgreSQL/PostGIS, replace or extend `ServiceZoneGeometry.geometry` with a real geometry field. Do not block the MVP on PostGIS.

### Optional profile normalization

Current profiles use JSON `service_areas`. Keep that working to avoid breaking signup/profile flows.

Add canonical zone IDs gradually:

```python
# Later migration, not necessarily first PR
CleanerProfile.service_zones = ManyToManyField(ServiceZone, blank=True)
HostProfile.service_zones = ManyToManyField(ServiceZone, blank=True)
AgencyProfile.service_zones = ManyToManyField(ServiceZone, blank=True)
```

Current staged migration approach:

1. Add `City`, `ServiceZone`, `ServiceZoneGeometry`.
2. Synchronize Sofia zones from the canonical GeoJSON IDs and names.
3. Keep writing canonical district-name strings to `service_areas` while using zone IDs internally.
4. Add profile `service_zones` relations in a second migration.
5. Backfill `service_zones` from exact canonical `service_areas` names.
6. Update frontend to use zone IDs internally.
7. Keep Sofia `legacy_names` empty; add aliases only for future non-Sofia migrations that require them.

## API design

Add public read-only location endpoints:

```text
GET /api/locations/cities/
GET /api/locations/cities/{city_slug}/zones/
GET /api/locations/cities/{city_slug}/zones.geojson/
```

Example city response:

```json
[
  {
    "slug": "sofia",
    "name_bg": "София",
    "name_en": "Sofia",
    "center": [23.3219, 42.6977],
    "default_zoom": 11
  }
]
```

Example zones response:

```json
[
  {
    "id": 1,
    "city_slug": "sofia",
    "slug": "osm-66",
    "zone_id": "sofia:osm-66",
    "name_bg": "ж.к. Лозенец",
    "name_en": "Lozenets",
    "zone_type": "district",
    "is_active": true
  }
]
```

Example GeoJSON feature:

```json
{
  "type": "Feature",
  "properties": {
    "zone_id": "sofia:osm-66",
    "city_slug": "sofia",
    "zone_slug": "osm-66",
    "name_bg": "ж.к. Лозенец",
    "name_en": "Lozenets"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": []
  }
}
```

## Admin behavior

Register these models in Django admin:

```text
City
ServiceZone
ServiceZoneGeometry
```

Admin should support:

- search by Bulgarian/English name;
- filter by city and active state;
- read-only preview fields for source/license;
- safe editing of names, sort order, active state;
- avoid editing raw geometry directly unless needed.

Optional later admin feature:

```text
Upload GeoJSON → validate → preview → import/update zones
```

Do not build the upload/import UI in the first PR unless explicitly requested.

## Data files

Current Sofia runtime file location:

```text
frontend/public/maps/sofia/districts.geojson
```

Canonical editable Sofia source:

```text
districits_sofia/sofia_districts_ready.geojson
```

Sofia metadata is validated against `frontend/lib/sofiaDistricts.ts`. The
obsolete backend Sofia fixture was removed. Non-Sofia cities may still use the
backend location API and fixture/import workflow.

## GeoJSON preparation workflow

Use QGIS or `mapshaper` outside the app to prepare clean files.

Current Sofia source properties per feature:

```json
{
  "id": "66",
  "name": "ж.к. Лозенец",
  "name:en": "Lozenets"
}
```

Validation requirements:

- every feature has an `id` in the stable `1..144` range;
- every derived `sofia:osm-{id}` matches the frontend catalog;
- no duplicate IDs or names;
- geometry type is `Polygon` or `MultiPolygon`;
- file size is reasonable for web use;
- polygons are simplified enough for frontend performance;
- names exactly match canonical service-area names; Sofia aliases remain empty.

Add a script later:

```text
backend/apps/locations/management/commands/validate_zone_geojson.py
```

Example command:

```powershell
python manage.py check
```

## Frontend integration points

### 1. Cleaner signup

Replace or enhance the current service-area picker with `DistrictMapSelector`.

Requirements:

- The selected values should become canonical zone IDs internally.
- Until the backend profile migration is complete, convert selected zone IDs back to current `service_areas` display names for the existing signup payload.
- Do not break existing cleaner signup tests.

### 2. Cleaner profile

Replace or enhance the current `Add districts` overlay.

Requirements:

- preserve current selected service areas;
- show map and list fallback;
- support city-scoped selection;
- validate that at least one service area exists when required;
- keep inline field errors.

### 3. Public landing and `/cleaners`

Update `CleanerBrowser` to use backend location metadata instead of hardcoded city/district constants.

First step can keep the old constants as fallback:

```text
Try API locations → if unavailable, fall back to frontend/lib/cityDistricts.ts
```

### 4. Host dashboard/search

For host search or direct offers, the same selector should be reusable later to select job location, property area, or cleaner filter.

Do not add new host workflow unless requested. Only build reusable plumbing.

## Suggested implementation phases

### Phase 1 — Canonical location backend

Create:

```text
backend/apps/locations/
  models.py
  serializers.py
  views.py
  urls.py
  admin.py
  tests/
```

Implement:

- `City`
- `ServiceZone`
- `ServiceZoneGeometry`
- read-only API endpoints
- admin registration
- seed fixture for Sofia city + districts based on current frontend constants
- tests for list endpoints and GeoJSON endpoint

Do not modify signup/profile flows in Phase 1.

Acceptance criteria:

```text
python manage.py makemigrations
python manage.py migrate
python manage.py check
python manage.py test apps.locations
```

### Phase 2 — Map component with static Sofia GeoJSON

Add:

```text
frontend/app/components/DistrictMapSelector.tsx
frontend/app/components/DistrictChecklist.tsx
frontend/app/components/DistrictSelectedTags.tsx
frontend/lib/locations.ts
frontend/types/locations.ts
```

Install:

```powershell
npm.cmd install maplibre-gl
```

Implementation requirements:

- client-only component;
- `apiFetch` only;
- no direct `fetch`;
- controlled selection;
- accessible checklist fallback;
- OSM attribution visible if OSM-derived data or tiles are used;
- no CSS library;
- styles added to `frontend/app/globals.css`.

Acceptance criteria:

```powershell
cd frontend
npm.cmd run typecheck
npm.cmd run lint
```

### Phase 3 — Integrate into cleaner profile only

Use the component inside cleaner profile service-area editing.

Why cleaner profile first: lower risk than signup because an existing user can correct data, and the current signup flow remains stable.

Requirements:

- selected old strings are mapped to zone IDs using `legacy_names` / `name_bg`;
- saved output still matches current backend serializer expectations;
- no breaking change to `CleanerProfile.service_areas` yet;
- map selector and list fallback both update the same state.

### Phase 4 — Integrate into signup

After profile integration is stable, update signup location step.

Requirements:

- update frontend state/payload;
- update backend serializer if canonical service-zone IDs are accepted;
- add/update tests;
- keep old district-string support until migration is complete.

### Phase 5 — Normalize profile service areas

Add canonical relations:

```text
CleanerProfile ↔ ServiceZone
HostProfile ↔ ServiceZone
AgencyProfile ↔ ServiceZone
```

Backfill from legacy strings.

Then progressively update:

- cleaner signup;
- cleaner profile;
- host search;
- public `CleanerBrowser`;
- `/cleaners` directory;
- agency profile later.

Do not remove legacy `service_areas` until all frontend and API users are migrated.

### Phase 6 — PostGIS and self-hosted map tiles later

When the project is production SaaS and needs real geospatial queries:

- enable PostgreSQL + PostGIS;
- move geometry into spatial columns;
- add spatial indexes;
- support radius search, overlap checks, bounding-box filtering;
- self-host OpenMapTiles / TileServer GL or another open-source tile pipeline.

This is not required for the first implementation.

## Styling guidance

Use existing design tokens:

```css
--brand: #ff385c;
--teal: #008489;
--gold: #b7791f;
--ink: #111111;
--muted: #6a6a6a;
--line: #dddddd;
--surface: #ffffff;
--radius: 8px;
```

Suggested CSS class names:

```css
.district-selector
.district-selector__toolbar
.district-selector__map
.district-selector__legend
.district-selector__fallback
.district-selector__list
.district-selector__zone
.district-selector__zone--selected
.district-selector__tags
.district-selector__tag
```

Do not introduce Tailwind, Bootstrap, MUI, or another CSS library.

## Testing expectations

Backend tests:

- city list endpoint returns active cities;
- zone list endpoint returns active zones for city;
- GeoJSON endpoint returns valid FeatureCollection;
- inactive city or zone is excluded unless admin endpoint is added later;
- `zone_id` is stable and unique;
- fixtures can be loaded safely.

Frontend checks:

- TypeScript passes;
- lint passes;
- component works with empty selection;
- component works with preselected values;
- disabled zones cannot be selected;
- checklist fallback updates same selection state;
- no direct `fetch` usage.

Manual QA:

- select and deselect a Sofia district on map;
- select and deselect from checklist;
- switch city and confirm stale districts are cleared or handled safely;
- resize to mobile width and confirm list fallback remains usable;
- verify selected tags are removable;
- verify current cleaner profile data still displays correctly.

## Risks

### 1. Boundary data quality

The hard part is not rendering the map. The hard part is finding, licensing, cleaning, and maintaining good district polygons for each Bulgarian city.

Mitigation:

- start with Sofia only;
- keep source/license metadata;
- keep Sofia canonical names and IDs exact, with empty `legacy_names`;
- validate GeoJSON before using it;
- avoid overpromising all Bulgarian cities at once.

### 2. Current `service_areas` are flat strings

Current data has no city field per service area. This can produce ambiguity if two cities contain districts with the same name.

Mitigation:

- introduce canonical `ServiceZone` with `city + slug`;
- match Sofia profiles using exact canonical names and stable IDs;
- avoid deleting legacy fields until migration is complete.

### 3. Map usability on mobile

District polygons are hard to tap precisely on mobile.

Mitigation:

- always include searchable checklist fallback;
- selected tags must be removable without using the map.

### 4. Free tile services are not production infrastructure

Do not rely on free public tile servers for production traffic.

Mitigation:

- first version can use a blank/light polygon map or minimal self-hosted/static approach;
- later self-host tiles with OpenMapTiles/TileServer GL.

## Codex implementation instruction

Start with Phase 1 and Phase 2 only unless explicitly told otherwise.

Do not refactor the large host or cleaner dashboard in this task.
Do not change marketplace workflows.
Do not change payment assumptions.
Do not remove existing `frontend/lib/cityDistricts.ts` yet.
Do not remove existing `CleanerProfile.service_areas` JSON behavior yet.

After Phase 1 and Phase 2 are complete, report:

```text
- files changed
- migrations created
- commands run
- tests/checks passed or failed
- any source/licensing assumptions for the Sofia GeoJSON file
- next recommended integration point
```

## Recommended first Codex task title

```text
feat(locations): add canonical city and service-zone backend plus reusable district map selector
```

## References for implementation research

- MapLibre GL JS documentation: GeoJSON sources and examples.
- OpenStreetMap Foundation attribution guidelines.
- PostGIS documentation for long-term spatial storage and queries.
- OpenMapTiles / TileServer GL documentation for self-hosted vector tiles.
