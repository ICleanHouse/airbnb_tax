from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.services import write_audit_log
from apps.notifications.services import create_notification

from apps.connections.models import Connection, Message
from apps.accounts.models import User


class ConnectionError(ValueError):
    pass


def _name(user) -> str:
    return user.get_full_name() or user.get_username()


def _is_worker(user) -> bool:
    return bool(user.is_cleaner or user.is_agency)


def _valid_pairing(a, b) -> bool:
    """Connections are between one host and one worker (cleaner/agency)."""
    return (a.is_host and _is_worker(b)) or (_is_worker(a) and b.is_host)


def _fresh_participants(*users):
    by_id = {
        user.id: user
        for user in User.objects.select_related("cleaner_profile").filter(
            id__in=[candidate.id for candidate in users]
        )
    }
    return tuple(by_id[user.id] for user in users)


def _ensure_marketplace_eligible(*users) -> None:
    for user in users:
        if not user.is_marketplace_eligible:
            raise ConnectionError(
                "Both participants must have active marketplace access."
            )


def find_pair(u1, u2):
    return Connection.objects.filter(
        Q(requester=u1, addressee=u2) | Q(requester=u2, addressee=u1)
    ).first()


@transaction.atomic
def request_connection(*, requester, addressee, request=None) -> Connection:
    requester, addressee = _fresh_participants(requester, addressee)
    if requester.id == addressee.id:
        raise ConnectionError("You cannot connect with yourself.")
    if not _valid_pairing(requester, addressee):
        raise ConnectionError("Connections are between a host and a cleaner.")
    _ensure_marketplace_eligible(requester, addressee)

    existing = find_pair(requester, addressee)
    if existing is not None:
        if existing.status == Connection.Status.ACCEPTED:
            raise ConnectionError("You are already connected.")
        if existing.status == Connection.Status.PENDING:
            # The other person already requested me → accept instead of duplicating.
            if existing.addressee_id == requester.id:
                return accept_connection(connection=existing, user=requester, request=request)
            raise ConnectionError("A connection request is already pending.")
        # declined / removed → re-open as a fresh pending request from this requester.
        existing.requester = requester
        existing.addressee = addressee
        existing.status = Connection.Status.PENDING
        existing.save(update_fields=["requester", "addressee", "status", "updated_at"])
        connection = existing
    else:
        connection = Connection.objects.create(
            requester=requester, addressee=addressee, status=Connection.Status.PENDING
        )

    create_notification(
        user=addressee,
        notification_type="connection.request",
        title="New connection request",
        body=f"{_name(requester)} wants to connect.",
        metadata={"connection_id": connection.id},
    )
    write_audit_log(
        actor=requester,
        action="connection.requested",
        entity_type="Connection",
        entity_id=connection.id,
        request=request,
        metadata={"addressee_id": addressee.id},
    )
    return connection


@transaction.atomic
def accept_connection(*, connection, user, request=None) -> Connection:
    connection = Connection.objects.select_for_update().select_related(
        "requester", "addressee"
    ).get(id=connection.id)
    if connection.addressee_id != user.id:
        raise ConnectionError("Only the recipient can accept this request.")
    if connection.status != Connection.Status.PENDING:
        raise ConnectionError("Only pending requests can be accepted.")
    requester, addressee = _fresh_participants(
        connection.requester, connection.addressee
    )
    _ensure_marketplace_eligible(requester, addressee)

    connection.status = Connection.Status.ACCEPTED
    connection.save(update_fields=["status", "updated_at"])

    create_notification(
        user=connection.requester,
        notification_type="connection.accepted",
        title="Connection accepted",
        body=f"{_name(user)} accepted your connection.",
        metadata={"connection_id": connection.id},
    )
    write_audit_log(
        actor=user,
        action="connection.accepted",
        entity_type="Connection",
        entity_id=connection.id,
        request=request,
    )
    return connection


@transaction.atomic
def decline_connection(*, connection, user, request=None) -> Connection:
    connection = Connection.objects.select_for_update().get(id=connection.id)
    if connection.addressee_id != user.id:
        raise ConnectionError("Only the recipient can decline this request.")
    if connection.status != Connection.Status.PENDING:
        raise ConnectionError("Only pending requests can be declined.")

    connection.status = Connection.Status.DECLINED
    connection.save(update_fields=["status", "updated_at"])
    write_audit_log(
        actor=user,
        action="connection.declined",
        entity_type="Connection",
        entity_id=connection.id,
        request=request,
    )
    return connection


@transaction.atomic
def remove_connection(*, connection, user, request=None) -> Connection:
    connection = Connection.objects.select_for_update().get(id=connection.id)
    if not connection.involves(user):
        raise ConnectionError("You are not part of this connection.")

    connection.status = Connection.Status.REMOVED
    connection.save(update_fields=["status", "updated_at"])
    write_audit_log(
        actor=user,
        action="connection.removed",
        entity_type="Connection",
        entity_id=connection.id,
        request=request,
    )
    return connection


@transaction.atomic
def send_message(*, connection, sender, body, request=None) -> Message:
    connection = Connection.objects.select_for_update().select_related(
        "requester", "addressee"
    ).get(id=connection.id)
    if not connection.involves(sender):
        raise ConnectionError("You are not part of this connection.")
    if connection.status != Connection.Status.ACCEPTED:
        raise ConnectionError("You can only message accepted connections.")
    requester, addressee = _fresh_participants(
        connection.requester, connection.addressee
    )
    _ensure_marketplace_eligible(requester, addressee)
    body = (body or "").strip()
    if not body:
        raise ConnectionError("Message cannot be empty.")

    message = Message.objects.create(connection=connection, sender=sender, body=body)
    other = connection.other_user(sender)
    create_notification(
        user=other,
        notification_type="message.received",
        title=f"Message from {_name(sender)}",
        body=body[:80],
        metadata={"connection_id": connection.id, "message_id": message.id},
    )
    write_audit_log(
        actor=sender,
        action="connection.message_sent",
        entity_type="Message",
        entity_id=message.id,
        request=request,
        metadata={"connection_id": connection.id},
    )
    # Bump the connection so it sorts to the top of both users' lists.
    connection.save(update_fields=["updated_at"])
    return message


def mark_messages_read(*, connection, reader) -> int:
    return (
        Message.objects.filter(connection=connection, read_at__isnull=True)
        .exclude(sender=reader)
        .update(read_at=timezone.now())
    )
