# Location Fixtures

Place approved non-Sofia city boundary GeoJSON files here before importing
them with `validate_zone_geojson`.

Sofia districts are intentionally not maintained in this fixtures directory.
Their canonical source and runtime files are:

```text
districits_sofia/sofia_districts_ready.geojson
frontend/lib/sofiaDistricts.ts
frontend/public/maps/sofia/districts.geojson
```

All three must contain the same 144 stable ID/name pairs. Sofia zone IDs use
`sofia:osm-1` through `sofia:osm-144`, canonical names retain prefixes such as
`кв.` and `ж.к.`, and Sofia `legacy_names` must remain empty.

`a1_populate_tables_test.py` validates and synchronizes the current Sofia
catalog into local database rows when test data is populated.
