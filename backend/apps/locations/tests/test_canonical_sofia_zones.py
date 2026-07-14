from importlib import import_module

from django.apps import apps as django_apps
from django.test import TestCase

from apps.locations.models import City, ServiceZone


class CanonicalSofiaZoneMigrationTests(TestCase):
    def test_migration_seeds_the_exact_stable_sofia_catalog(self):
        zones = ServiceZone.objects.filter(city__slug="sofia").order_by("sort_order")

        self.assertEqual(zones.count(), 144)
        self.assertEqual(zones.first().zone_id, "sofia:osm-1")
        self.assertEqual(zones.first().name_bg, "ж.к. Банишора")
        self.assertEqual(zones.get(slug="osm-66").name_bg, "ж.к. Лозенец")
        self.assertEqual(zones.get(slug="osm-77").name_bg, "Център")
        self.assertEqual(zones.last().zone_id, "sofia:osm-144")
        self.assertEqual(zones.last().name_bg, "м. Смърдана")
        self.assertEqual(
            set(zones.values_list("slug", flat=True)),
            {f"osm-{source_id}" for source_id in range(1, 145)},
        )
        self.assertFalse(zones.exclude(legacy_names=[]).exists())
        self.assertFalse(zones.filter(slug="lozenets").exists())

    def test_seed_is_additive_and_does_not_delete_preexisting_zones(self):
        sofia = City.objects.get(slug="sofia")
        custom = ServiceZone.objects.create(
            city=sofia,
            slug="legacy-custom-zone",
            name_bg="Legacy custom zone",
            name_en="Legacy custom zone",
        )
        migration = import_module("apps.locations.migrations.0003_seed_canonical_sofia_zones")

        migration.seed_canonical_sofia_zones(django_apps, None)

        self.assertTrue(ServiceZone.objects.filter(pk=custom.pk).exists())
