from datetime import timedelta
from importlib import import_module

from django.apps import apps as django_apps
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.locations.models import City, ServiceZone
from apps.marketplace.models import CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property
from apps.properties.serializers import PropertySerializer


class PropertyServiceZoneSerializerTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(
            username="host@example.com",
            email="host@example.com",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        self.lozenets = ServiceZone.objects.get(city__slug="sofia", slug="osm-66")
        self.center = ServiceZone.objects.get(city__slug="sofia", slug="osm-77")

    def test_new_sofia_property_accepts_stable_zone_id(self):
        serializer = PropertySerializer(
            data={"name": "Flat", "city": "Sofia", "service_zone_id": "sofia:osm-66"}
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        property_obj = serializer.save(host=self.host)
        self.assertEqual(property_obj.service_zone, self.lozenets)
        data = PropertySerializer(property_obj).data
        self.assertEqual(data["service_zone_id"], "sofia:osm-66")
        self.assertEqual(data["service_zone_name_bg"], "ж.к. Лозенец")
        self.assertEqual(data["service_zone_name_en"], "ж.к. Лозенец")

    def test_new_sofia_property_requires_canonical_zone(self):
        serializer = PropertySerializer(data={"name": "Flat", "city": "Sofia"})

        self.assertFalse(serializer.is_valid())
        self.assertIn("service_zone_id", serializer.errors)

    def test_human_readable_sofia_alias_id_is_rejected(self):
        ServiceZone.objects.create(
            city=self.lozenets.city,
            slug="lozenets",
            name_bg="Лозенец",
            name_en="Lozenets",
        )
        serializer = PropertySerializer(
            data={"name": "Flat", "city": "Sofia", "service_zone_id": "sofia:lozenets"}
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("service_zone_id", serializer.errors)

    def test_zone_must_belong_to_the_property_city(self):
        plovdiv = City.objects.create(slug="plovdiv", name_bg="Пловдив", name_en="Plovdiv")
        zone = ServiceZone.objects.create(
            city=plovdiv,
            slug="center",
            name_bg="Център",
            name_en="Center",
        )
        serializer = PropertySerializer(
            data={"name": "Flat", "city": "Sofia", "service_zone_id": zone.zone_id}
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("service_zone_id", serializer.errors)

    def test_non_sofia_property_may_remain_without_a_zone(self):
        serializer = PropertySerializer(data={"name": "Flat", "city": "Varna"})

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_zone_change_is_locked_while_property_has_active_job(self):
        property_obj = Property.objects.create(
            host=self.host,
            name="Flat",
            city="Sofia",
            service_zone=self.lozenets,
        )
        start = timezone.now() + timedelta(days=1)
        create_cleaning_job_record(
            property=property_obj,
            host=self.host,
            title="Open clean",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            status=CleaningJob.Status.OPEN,
        )
        serializer = PropertySerializer(
            property_obj,
            data={"service_zone_id": self.center.zone_id},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_unrelated_update_does_not_force_zone_on_legacy_property(self):
        property_obj = Property.objects.create(host=self.host, name="Legacy", city="Sofia")
        serializer = PropertySerializer(
            property_obj,
            data={"description": "Updated privately"},
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_relocating_legacy_sofia_property_requires_canonical_zone(self):
        property_obj = Property.objects.create(host=self.host, name="Legacy", city="Sofia")
        serializer = PropertySerializer(
            property_obj,
            data={"address": "A different private address"},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("service_zone_id", serializer.errors)


class PropertyServiceZoneBackfillTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(
            username="legacy-host@example.com",
            email="legacy-host@example.com",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )

    def test_backfill_matches_only_exact_canonical_names(self):
        exact_bg = Property.objects.create(
            host=self.host,
            name="Exact BG",
            city="Sofia",
            neighborhood="ж.к. Лозенец",
        )
        exact_en = Property.objects.create(
            host=self.host,
            name="Exact EN",
            city="Sofia",
            neighborhood="Centre",
        )
        wrong_case = Property.objects.create(
            host=self.host,
            name="Wrong case",
            city="Sofia",
            neighborhood="ж.к. лозенец",
        )
        address_only = Property.objects.create(
            host=self.host,
            name="Address only",
            city="Sofia",
            neighborhood="Unknown",
            address="1 Street, ж.к. Лозенец",
        )

        migration = import_module("apps.properties.migrations.0005_backfill_property_service_zones")
        migration.backfill_property_service_zones(django_apps, None)

        for property_obj in (exact_bg, exact_en, wrong_case, address_only):
            property_obj.refresh_from_db()
        self.assertEqual(exact_bg.service_zone.zone_id, "sofia:osm-66")
        self.assertEqual(exact_en.service_zone.zone_id, "sofia:osm-77")
        self.assertIsNone(wrong_case.service_zone)
        self.assertIsNone(address_only.service_zone)

    def test_backfill_never_selects_noncanonical_alias_zone(self):
        sofia = City.objects.get(slug="sofia")
        ServiceZone.objects.create(
            city=sofia,
            slug="lozenets-alias",
            name_bg="Legacy Lozenets alias",
            name_en="Legacy Lozenets alias",
            is_active=True,
        )
        legacy_alias = Property.objects.create(
            host=self.host,
            name="Alias only",
            city="Sofia",
            neighborhood="Legacy Lozenets alias",
        )

        migration = import_module("apps.properties.migrations.0005_backfill_property_service_zones")
        migration.backfill_property_service_zones(django_apps, None)

        legacy_alias.refresh_from_db()
        self.assertIsNone(legacy_alias.service_zone)
