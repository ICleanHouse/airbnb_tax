from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Connection(TimeStampedModel):
    """A LinkedIn-style relationship between a host and a cleaner/agency.

    Either side may send the request; the other accepts. Only ACCEPTED
    connections may exchange messages.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        REMOVED = "removed", "Removed"

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="connections_sent",
    )
    addressee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="connections_received",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["requester", "addressee"], name="unique_connection_pair"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.requester_id} ↔ {self.addressee_id} ({self.status})"

    def other_user(self, user):
        return self.addressee if self.requester_id == user.id else self.requester

    def involves(self, user) -> bool:
        return user.id in (self.requester_id, self.addressee_id)


class Message(TimeStampedModel):
    connection = models.ForeignKey(
        Connection, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_messages"
    )
    body = models.TextField()
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"msg {self.id} in connection {self.connection_id}"
