import django.db.models.deletion

from django.conf import settings
from django.db import migrations, models


def supersede_targetless_pending_invitations(apps, schema_editor):
    invitation = apps.get_model("accounts", "AgencyInvitation")
    invitation.objects.filter(status="pending", target_cleaner__isnull=True).update(
        status="superseded"
    )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0019_pilotevidenceexclusion")]

    operations = [
        migrations.RenameField(
            model_name="agencyinvitation",
            old_name="cleaner",
            new_name="target_cleaner",
        ),
        migrations.AlterField(
            model_name="agencyinvitation",
            name="target_cleaner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="agency_invitation_targets",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="agencyinvitation",
            name="reissued_from",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reissued_invitation",
                to="accounts.agencyinvitation",
            ),
        ),
        migrations.AlterField(
            model_name="agencyinvitation",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("accepted", "Accepted"),
                    ("declined", "Declined"),
                    ("revoked", "Revoked"),
                    ("expired", "Expired"),
                    ("superseded", "Superseded"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.RunPython(
            supersede_targetless_pending_invitations,
            migrations.RunPython.noop,
        ),
        migrations.RemoveConstraint(
            model_name="agencyinvitation",
            name="agency_invitation_has_contact",
        ),
        migrations.AddConstraint(
            model_name="agencyinvitation",
            constraint=models.CheckConstraint(
                condition=(
                    ~models.Q(status="pending")
                    | models.Q(target_cleaner__isnull=False)
                ),
                name="agency_invitation_pending_has_target",
            ),
        ),
        migrations.AddConstraint(
            model_name="agencyinvitation",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    status="pending", target_cleaner__isnull=False
                ),
                fields=("agency", "target_cleaner"),
                name="unique_pending_agency_invitation_target",
            ),
        ),
        migrations.AddIndex(
            model_name="agencyinvitation",
            index=models.Index(
                fields=["target_cleaner", "status"],
                name="agency_inv_target_status_idx",
            ),
        ),
    ]
