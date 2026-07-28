from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("feedback", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="review",
            name="public_comment_redacted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="review",
            name="public_comment_replacement",
            field=models.TextField(blank=True),
        ),
    ]
