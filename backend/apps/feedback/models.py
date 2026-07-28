from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class Review(TimeStampedModel):
    job = models.ForeignKey(
        "marketplace.CleaningJob",
        on_delete=models.CASCADE,
        related_name="reviews",
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reviews_given",
    )
    reviewee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reviews_received",
    )
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    # Moderation affects only the authenticated public projection. The original
    # protected record remains intact for dispute/audit interpretation.
    public_comment_redacted = models.BooleanField(default=False)
    public_comment_replacement = models.TextField(blank=True)
    private_note = models.TextField(blank=True)
    is_private_issue = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["job", "reviewer", "reviewee"], name="unique_review_per_pair_per_job")
        ]

    def __str__(self) -> str:
        return f"{self.reviewer} reviewed {self.reviewee} for {self.job}"
