# Generated manually to keep the aggregate-only S1-E10 ledger reviewable.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("locations", "0003_seed_canonical_sofia_zones")]

    operations = [
        migrations.CreateModel(
            name="GeocodingUsageDaily",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("provider", models.CharField(default="geoapify", max_length=40)),
                ("usage_date", models.DateField()),
                ("outbound_request_count", models.PositiveIntegerField(default=0)),
            ],
            options={"ordering": ["-usage_date", "provider"]},
        ),
        migrations.CreateModel(
            name="GeocodingUsageAlert",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("threshold", models.PositiveIntegerField()),
                (
                    "delivery_state",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("delivering", "Delivering"),
                            ("sent", "Sent"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("delivery_attempted_at", models.DateTimeField(blank=True, null=True)),
                ("delivered_at", models.DateTimeField(blank=True, null=True)),
                (
                    "usage",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="alerts",
                        to="locations.geocodingusagedaily",
                    ),
                ),
            ],
            options={"ordering": ["usage__usage_date", "threshold"]},
        ),
        migrations.AddConstraint(
            model_name="geocodingusagedaily",
            constraint=models.UniqueConstraint(
                fields=("provider", "usage_date"),
                name="unique_geocoding_usage_provider_day",
            ),
        ),
        migrations.AddConstraint(
            model_name="geocodingusagealert",
            constraint=models.UniqueConstraint(
                fields=("usage", "threshold"),
                name="unique_geocoding_usage_alert_threshold",
            ),
        ),
    ]
