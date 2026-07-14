from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.locations.models import City, ServiceZone, ServiceZoneGeometry


class LocationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.sofia = City.objects.get(slug="sofia")
        self.sofia.center_lat = "42.697700"
        self.sofia.center_lng = "23.321900"
        self.sofia.sort_order = 1
        self.sofia.save(update_fields=["center_lat", "center_lng", "sort_order"])
        self.inactive_city = City.objects.create(
            slug="hidden",
            name_bg="Hidden",
            name_en="Hidden",
            is_active=False,
            sort_order=2,
        )
        ServiceZone.objects.filter(city=self.sofia).update(is_active=False)
        self.lozenets = ServiceZone.objects.get(city=self.sofia, slug="osm-66")
        self.lozenets.is_active = True
        self.lozenets.sort_order = 1
        self.lozenets.save(update_fields=["is_active", "sort_order"])
        self.hidden_zone = ServiceZone.objects.create(
            city=self.sofia,
            slug="hidden-zone",
            name_bg="Hidden zone",
            name_en="Hidden zone",
            is_active=False,
            sort_order=2,
        )
        ServiceZone.objects.create(
            city=self.inactive_city,
            slug="inactive-city-zone",
            name_bg="Inactive city zone",
            name_en="Inactive city zone",
        )
        ServiceZoneGeometry.objects.create(
            zone=self.lozenets,
            geometry={
                "type": "Polygon",
                "coordinates": [
                    [
                        [23.30, 42.68],
                        [23.31, 42.68],
                        [23.31, 42.69],
                        [23.30, 42.69],
                        [23.30, 42.68],
                    ]
                ],
            },
            source="Test source",
            source_license="Test license",
            attribution="Test attribution",
        )

    def test_city_list_returns_active_cities(self):
        response = self.client.get("/api/locations/cities/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([city["slug"] for city in response.data], ["sofia"])
        self.assertEqual(response.data[0]["center"], [23.3219, 42.6977])

    def test_zone_list_returns_active_zones_for_city(self):
        response = self.client.get("/api/locations/cities/sofia/zones/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["zone_id"], "sofia:osm-66")
        self.assertEqual(response.data[0]["slug"], "osm-66")

    def test_sofia_zone_list_excludes_active_noncanonical_alias(self):
        alias = ServiceZone.objects.create(
            city=self.sofia,
            slug="lozenets",
            name_bg="Лозенец alias",
            name_en="Lozenets alias",
            is_active=True,
        )

        response = self.client.get("/api/locations/cities/sofia/zones/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([zone["zone_id"] for zone in response.data], ["sofia:osm-66"])
        self.assertTrue(ServiceZone.objects.filter(pk=alias.pk, is_active=True).exists())

    def test_zone_id_is_stable_and_unique_per_city_slug(self):
        self.assertEqual(self.lozenets.zone_id, "sofia:osm-66")
        with self.assertRaises(IntegrityError), transaction.atomic():
            ServiceZone.objects.create(
                city=self.sofia,
                slug="osm-66",
                name_bg="Duplicate",
                name_en="Duplicate",
            )

    def test_geojson_endpoint_returns_active_feature_collection(self):
        response = self.client.get("/api/locations/cities/sofia/zones.geojson/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["type"], "FeatureCollection")
        self.assertEqual(len(response.data["features"]), 1)
        feature = response.data["features"][0]
        self.assertEqual(feature["properties"]["zone_id"], "sofia:osm-66")
        self.assertEqual(feature["properties"]["attribution"], "Test attribution")
        self.assertEqual(feature["geometry"]["type"], "Polygon")

    def test_sofia_geojson_excludes_active_noncanonical_alias(self):
        alias = ServiceZone.objects.create(
            city=self.sofia,
            slug="lozenets",
            name_bg="Лозенец alias",
            name_en="Lozenets alias",
            is_active=True,
        )
        ServiceZoneGeometry.objects.create(
            zone=alias,
            geometry={"type": "Point", "coordinates": [23.32, 42.69]},
            attribution="Private alias attribution",
        )

        response = self.client.get("/api/locations/cities/sofia/zones.geojson/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [feature["properties"]["zone_id"] for feature in response.data["features"]],
            ["sofia:osm-66"],
        )
        self.assertTrue(ServiceZone.objects.filter(pk=alias.pk, is_active=True).exists())

    def test_non_sofia_zone_catalog_keeps_active_custom_zones(self):
        city = City.objects.create(
            slug="plovdiv",
            name_bg="Пловдив",
            name_en="Plovdiv",
            is_active=True,
        )
        custom_zone = ServiceZone.objects.create(
            city=city,
            slug="kapana",
            name_bg="Капана",
            name_en="Kapana",
            is_active=True,
        )
        ServiceZoneGeometry.objects.create(
            zone=custom_zone,
            geometry={"type": "Point", "coordinates": [24.75, 42.15]},
        )

        list_response = self.client.get("/api/locations/cities/plovdiv/zones/")
        geojson_response = self.client.get("/api/locations/cities/plovdiv/zones.geojson/")

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual([zone["zone_id"] for zone in list_response.data], [custom_zone.zone_id])
        self.assertEqual(geojson_response.status_code, 200)
        self.assertEqual(
            [feature["properties"]["zone_id"] for feature in geojson_response.data["features"]],
            [custom_zone.zone_id],
        )

    def test_inactive_city_is_not_exposed(self):
        response = self.client.get("/api/locations/cities/hidden/zones/")

        self.assertEqual(response.status_code, 404)
