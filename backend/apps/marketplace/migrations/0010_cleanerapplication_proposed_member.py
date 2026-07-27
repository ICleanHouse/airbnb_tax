import django.db.models.deletion

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("marketplace", "0009_dispute_disputeupdate_jobincident_replacementrequest_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="cleanerapplication",
            name="proposed_member",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="proposed_agency_assignments",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddIndex(
            model_name="cleanerapplication",
            index=models.Index(
                fields=["proposed_member"], name="app_proposed_member_idx"
            ),
        ),
    ]
