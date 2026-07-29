# Generated manually for the additive S1-D05 release-request contract.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("marketplace", "0010_cleanerapplication_proposed_member"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AssignmentReleaseRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("reason_code", models.CharField(max_length=48)),
                ("narrative", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("acted", "Acted"), ("declined", "Declined"), ("expired", "Expired")], default="pending", max_length=16)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("assignment", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="release_requests", to="marketplace.assignment")),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="assignment_release_requests", to=settings.AUTH_USER_MODEL)),
                ("resolved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="resolved_assignment_release_requests", to=settings.AUTH_USER_MODEL)),
                ("replacement_request", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="release_requests", to="marketplace.replacementrequest")),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="assignmentreleaserequest",
            constraint=models.UniqueConstraint(condition=Q(("status", "pending")), fields=("assignment", "member"), name="uq_pending_release_per_assignment_member"),
        ),
    ]
