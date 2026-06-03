import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.locations.models import City, ServiceZone, ServiceZoneGeometry


REQUIRED_PROPERTIES = {"zone_id", "city_slug", "zone_slug", "name_bg", "name_en"}
ALLOWED_GEOMETRY_TYPES = {"Polygon", "MultiPolygon"}


class Command(BaseCommand):
    help = "Validate a city service-zone GeoJSON file and optionally import it."

    def add_arguments(self, parser):
        parser.add_argument("--city", required=True, help="Expected city slug, for example sofia.")
        parser.add_argument("--file", required=True, help="Path to a GeoJSON FeatureCollection.")
        parser.add_argument("--save", action="store_true", help="Import/update city zones and geometries after validation.")
        parser.add_argument("--source", default="", help="Boundary data source label.")
        parser.add_argument("--source-license", default="", help="Boundary data license label.")
        parser.add_argument("--source-url", default="", help="Boundary data source URL.")
        parser.add_argument("--attribution", default="", help="Attribution text to expose with GeoJSON features.")

    def handle(self, *args, **options):
        city_slug = options["city"].strip()
        file_path = Path(options["file"]).resolve()
        payload = self._load_geojson(file_path)
        features = self._validate_payload(payload, city_slug)

        city = City.objects.filter(slug=city_slug).first()
        if city and not options["save"]:
            existing_zone_slugs = set(city.zones.values_list("slug", flat=True))
            incoming_zone_slugs = {feature["properties"]["zone_slug"] for feature in features}
            missing = sorted(incoming_zone_slugs - existing_zone_slugs)
            if missing:
                raise CommandError(f"GeoJSON contains zones that do not exist in the database: {', '.join(missing)}")

        if options["save"]:
            self._save_features(city_slug, features, options)

        self.stdout.write(self.style.SUCCESS(f"Validated {len(features)} features for {city_slug}."))

    def _load_geojson(self, file_path: Path):
        if not file_path.exists():
            raise CommandError(f"GeoJSON file does not exist: {file_path}")
        try:
            return json.loads(file_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON: {exc}") from exc

    def _validate_payload(self, payload, city_slug: str):
        if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
            raise CommandError("GeoJSON must be a FeatureCollection.")
        features = payload.get("features")
        if not isinstance(features, list) or not features:
            raise CommandError("GeoJSON FeatureCollection must include at least one feature.")

        seen_zone_ids = set()
        for index, feature in enumerate(features, start=1):
            if not isinstance(feature, dict) or feature.get("type") != "Feature":
                raise CommandError(f"Feature {index} must be a GeoJSON Feature.")
            properties = feature.get("properties")
            if not isinstance(properties, dict):
                raise CommandError(f"Feature {index} must include properties.")
            missing = REQUIRED_PROPERTIES - set(properties)
            if missing:
                raise CommandError(f"Feature {index} is missing properties: {', '.join(sorted(missing))}")
            if properties["city_slug"] != city_slug:
                raise CommandError(f"Feature {index} city_slug must be {city_slug}.")
            expected_zone_id = f"{city_slug}:{properties['zone_slug']}"
            if properties["zone_id"] != expected_zone_id:
                raise CommandError(f"Feature {index} zone_id must be {expected_zone_id}.")
            if properties["zone_id"] in seen_zone_ids:
                raise CommandError(f"Duplicate zone_id: {properties['zone_id']}")
            seen_zone_ids.add(properties["zone_id"])

            geometry = feature.get("geometry")
            if not isinstance(geometry, dict) or geometry.get("type") not in ALLOWED_GEOMETRY_TYPES:
                allowed = ", ".join(sorted(ALLOWED_GEOMETRY_TYPES))
                raise CommandError(f"Feature {index} geometry must be one of: {allowed}.")
            if not geometry.get("coordinates"):
                raise CommandError(f"Feature {index} geometry must include coordinates.")

        return features

    @transaction.atomic
    def _save_features(self, city_slug: str, features: list[dict], options: dict):
        city, _ = City.objects.get_or_create(
            slug=city_slug,
            defaults=self._city_defaults(city_slug),
        )

        for sort_order, feature in enumerate(features, start=1):
            properties = feature["properties"]
            zone, _ = ServiceZone.objects.update_or_create(
                city=city,
                slug=properties["zone_slug"],
                defaults={
                    "name_bg": properties["name_bg"],
                    "name_en": properties["name_en"],
                    "zone_type": properties.get("zone_type", "district"),
                    "legacy_names": properties.get("legacy_names", [properties["name_bg"]]),
                    "sort_order": sort_order,
                    "is_active": True,
                },
            )
            ServiceZoneGeometry.objects.update_or_create(
                zone=zone,
                defaults={
                    "geometry": feature["geometry"],
                    "simplified_geometry": feature.get("simplified_geometry"),
                    "source": options["source"],
                    "source_license": options["source_license"],
                    "source_url": options["source_url"],
                    "attribution": options["attribution"],
                },
            )

    def _city_defaults(self, city_slug: str) -> dict:
        if city_slug == "sofia":
            return {
                "name_bg": "\u0421\u043e\u0444\u0438\u044f",
                "name_en": "Sofia",
                "country_code": "BG",
                "center_lat": "42.697700",
                "center_lng": "23.321900",
                "default_zoom": 10,
                "sort_order": 1,
            }
        return {
            "name_bg": city_slug.title(),
            "name_en": city_slug.title(),
            "country_code": "BG",
            "default_zoom": 11,
        }
