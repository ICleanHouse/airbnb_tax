# Generated manually for the additive S1-D05 delegated-agency review contract.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import F, Q


class Migration(migrations.Migration):
    dependencies = [
        ("feedback", "0005_public_review_redaction_projection"),
        ("marketplace", "0011_assignmentreleaserequest"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ReviewGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("agency", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="agency_review_groups", to=settings.AUTH_USER_MODEL)),
                ("delegated_member", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="delegated_review_groups", to=settings.AUTH_USER_MODEL)),
                ("host", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="hosted_review_groups", to=settings.AUTH_USER_MODEL)),
                ("job", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="review_group", to="marketplace.cleaningjob")),
            ],
        ),
        migrations.AddField(
            model_name="review",
            name="group",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reviews", to="feedback.reviewgroup"),
        ),
        migrations.AddConstraint(
            model_name="reviewgroup",
            constraint=models.CheckConstraint(condition=~Q(("host", F("agency"))) & ~Q(("host", F("delegated_member"))) & ~Q(("agency", F("delegated_member"))), name="review_group_distinct_participants"),
        ),
    ]
