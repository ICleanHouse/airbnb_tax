from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("accounts", "0021_s1_d04_publication_and_closure")]

    operations = [
        migrations.CreateModel(
            name="AccountRetentionHold",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("category", models.CharField(choices=[("legal", "Legal"), ("dispute", "Dispute"), ("support", "Support")], max_length=16)),
                ("reason_code", models.CharField(max_length=64)),
                ("released_at", models.DateTimeField(blank=True, null=True)),
                ("release_reason_code", models.CharField(blank=True, max_length=64)),
                ("placed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="placed_retention_holds", to=settings.AUTH_USER_MODEL)),
                ("released_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="released_retention_holds", to=settings.AUTH_USER_MODEL)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="retention_holds", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.AddIndex(
            model_name="accountretentionhold",
            index=models.Index(fields=["user", "released_at"], name="retention_hold_active_idx"),
        ),
    ]
