from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0003_seed_canonical_sofia_zones"),
        ("properties", "0003_property_details_and_images"),
    ]

    operations = [
        migrations.AddField(
            model_name="property",
            name="service_zone",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="properties",
                to="locations.servicezone",
            ),
        ),
    ]
