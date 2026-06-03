from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.locations.models import City, ServiceZone, ServiceZoneGeometry


class LocationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.sofia = City.objects.create(
            slug="sofia",
            name_bg="Sofia",
            name_en="Sofia",
            center_lat="42.697700",
            center_lng="23.321900",
            sort_order=1,
        )
        self.inactive_city = City.objects.create(
            slug="hidden",
            name_bg="Hidden",
            name_en="Hidden",
            is_active=False,
            sort_order=2,
        )
        self.lozenets = ServiceZone.objects.create(
            city=self.sofia,
            slug="lozenets",
            name_bg="Lozenets",
            name_en="Lozenets",
            legacy_names=["Lozenets"],
            sort_order=1,
        )
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
        self.assertEqual(response.data[0]["zone_id"], "sofia:lozenets")
        self.assertEqual(response.data[0]["slug"], "lozenets")

    def test_zone_id_is_stable_and_unique_per_city_slug(self):
        self.assertEqual(self.lozenets.zone_id, "sofia:lozenets")
        with self.assertRaises(IntegrityError), transaction.atomic():
            ServiceZone.objects.create(
                city=self.sofia,
                slug="lozenets",
                name_bg="Duplicate",
                name_en="Duplicate",
            )

    def test_geojson_endpoint_returns_active_feature_collection(self):
        response = self.client.get("/api/locations/cities/sofia/zones.geojson/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["type"], "FeatureCollection")
        self.assertEqual(len(response.data["features"]), 1)
        feature = response.data["features"][0]
        self.assertEqual(feature["properties"]["zone_id"], "sofia:lozenets")
        self.assertEqual(feature["properties"]["attribution"], "Test attribution")
        self.assertEqual(feature["geometry"]["type"], "Polygon")

    def test_inactive_city_is_not_exposed(self):
        response = self.client.get("/api/locations/cities/hidden/zones/")

        self.assertEqual(response.status_code, 404)
