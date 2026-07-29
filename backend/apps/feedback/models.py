from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class ReviewGroup(TimeStampedModel):
    """Immutable participant snapshot for a completed delegated agency job."""

    job = models.OneToOneField(
        "marketplace.CleaningJob", on_delete=models.PROTECT, related_name="review_group"
    )
    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="hosted_review_groups")
    agency = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="agency_review_groups")
    delegated_member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="delegated_review_groups")

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(host=models.F("agency"))
                & ~models.Q(host=models.F("delegated_member"))
                & ~models.Q(agency=models.F("delegated_member")),
                name="review_group_distinct_participants",
            )
        ]

    @property
    def participant_ids(self) -> tuple[int, int, int]:
        return (self.host_id, self.agency_id, self.delegated_member_id)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            original = type(self).objects.get(pk=self.pk)
            if self.participant_ids != original.participant_ids or self.job_id != original.job_id:
                raise ValueError("Review-group participants are immutable.")
        super().save(*args, **kwargs)


class Review(TimeStampedModel):
    job = models.ForeignKey(
        "marketplace.CleaningJob",
        on_delete=models.CASCADE,
        related_name="reviews",
    )
    group = models.ForeignKey(ReviewGroup, on_delete=models.PROTECT, related_name="reviews", null=True, blank=True)
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
