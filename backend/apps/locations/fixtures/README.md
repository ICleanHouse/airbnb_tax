# Location Fixtures

Place approved city boundary GeoJSON files here before importing them.

Expected first file:

```text
backend/apps/locations/fixtures/sofia_service_zones.geojson
```

Validate and import:

```powershell
python manage.py validate_zone_geojson --city sofia --file apps/locations/fixtures/sofia_service_zones.geojson --save --source "Approved source" --source-license "Approved license"
```
