from collections import defaultdict

from django.db import migrations


CANONICAL_SOFIA_ZONE_SLUGS = tuple(f"osm-{source_id}" for source_id in range(1, 145))


def backfill_property_service_zones(apps, schema_editor):
    Property = apps.get_model("properties", "Property")
    ServiceZone = apps.get_model("locations", "ServiceZone")

    zones = list(
        ServiceZone.objects.filter(
            city__slug="sofia",
            slug__in=CANONICAL_SOFIA_ZONE_SLUGS,
            is_active=True,
        ).values(
            "id",
            "name_bg",
            "name_en",
        )
    )
    candidates = defaultdict(set)
    for zone in zones:
        if zone["name_bg"]:
            candidates[zone["name_bg"]].add(zone["id"])
        if zone["name_en"]:
            candidates[zone["name_en"]].add(zone["id"])

    exact_unique_names = {
        name: next(iter(zone_ids))
        for name, zone_ids in candidates.items()
        if len(zone_ids) == 1
    }
    properties = Property.objects.filter(
        service_zone__isnull=True,
        city__in=("Sofia", "София", "sofia"),
    ).only("id", "neighborhood")
    for property_obj in properties.iterator():
        zone_id = exact_unique_names.get(property_obj.neighborhood)
        if zone_id is not None:
            Property.objects.filter(pk=property_obj.pk, service_zone__isnull=True).update(
                service_zone_id=zone_id
            )


class Migration(migrations.Migration):
    dependencies = [("properties", "0004_property_service_zone")]

    operations = [
        migrations.RunPython(
            backfill_property_service_zones,
            migrations.RunPython.noop,
        ),
    ]
