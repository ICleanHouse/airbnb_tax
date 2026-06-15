from django.db import migrations


def remove_legacy_sofia_service_zones(apps, schema_editor):
    ServiceZone = apps.get_model("locations", "ServiceZone")
    current_slugs = [f"osm-{source_id}" for source_id in range(1, 145)]
    sofia_zones = ServiceZone.objects.filter(city__slug="sofia")
    sofia_zones.exclude(slug__in=current_slugs).delete()
    sofia_zones.filter(slug__in=current_slugs).update(legacy_names=[])


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(remove_legacy_sofia_service_zones, migrations.RunPython.noop),
    ]
