"""Password recovery services with no plaintext credential persistence."""

from __future__ import annotations

import hashlib
import logging
import uuid
from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode

from apps.accounts.tokens import password_reset_token
from apps.core.services import write_audit_log
from apps.notifications.services import NotificationEventRequest, emit_notification_event


User = get_user_model()
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PasswordResetConfirmationError(ValueError):
    code: str


def normalize_recovery_email(value: object) -> str:
    return value.strip().lower() if isinstance(value, str) else ""


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _consume_limit(key: str, *, limit: int, seconds: int) -> bool:
    """Atomic on Redis; deterministic and conservative under local/test cache."""
    if cache.add(key, 1, timeout=seconds):
        return True
    try:
        return int(cache.incr(key)) <= limit
    except ValueError:
        cache.set(key, 1, timeout=seconds)
        return True


def request_password_reset(*, raw_email: object, client_ip: str, request=None) -> None:
    """Always returns normally so the public endpoint cannot enumerate users."""
    email = normalize_recovery_email(raw_email)
    window = max(60, int(settings.PASSWORD_RESET_RATE_WINDOW_SECONDS))
    email_allowed = _consume_limit(
        f"password-reset:email:{_digest(email)}",
        limit=max(1, int(settings.PASSWORD_RESET_EMAIL_LIMIT)),
        seconds=window,
    )
    ip_allowed = _consume_limit(
        f"password-reset:ip:{_digest(client_ip or 'unknown')}",
        limit=max(1, int(settings.PASSWORD_RESET_IP_LIMIT)),
        seconds=window,
    )
    if not email_allowed or not ip_allowed or not email:
        return
    user = User.objects.filter(email__iexact=email).first()
    if user is None or not user.is_active:
        return
    bucket = int(timezone.now().timestamp()) // window
    try:
        emit_notification_event(
            NotificationEventRequest(
                event_type="account.password_reset_requested",
                recipient_id=user.id,
                occurrence_key=f"password-reset-request:{user.id}:{bucket}",
                # The email renderer replaces this safe fallback with the
                # ephemeral localized reset URL; no token is persisted in the event.
                destination="/app",
                source_entity_type="User",
                source_entity_id=str(user.id),
            )
        )
        write_audit_log(
            actor=user,
            action="account.password_reset_requested",
            entity_type="User",
            entity_id=user.id,
            request=request,
            metadata={},
        )
    except Exception:
        # Keep the public outcome generic during a downstream outage. Never log
        # the submitted email, reset token, or a full reset URL.
        logger.exception("Password-reset delivery event could not be queued")


@transaction.atomic
def confirm_password_reset(*, uid: str, token: str, password: str, password_confirm: str, request=None) -> None:
    if password != password_confirm:
        raise PasswordResetConfirmationError("password_mismatch")
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.select_for_update().get(pk=user_id)
    except (TypeError, ValueError, OverflowError, UnicodeDecodeError, User.DoesNotExist) as exc:
        raise PasswordResetConfirmationError("invalid_or_expired_link") from exc
    if not password_reset_token.check_token(user, token):
        raise PasswordResetConfirmationError("invalid_or_expired_link")
    try:
        validate_password(password, user=user)
    except Exception as exc:
        raise PasswordResetConfirmationError("password_invalid") from exc
    user.set_password(password)
    user.save(update_fields=["password"])
    emit_notification_event(
        NotificationEventRequest(
            event_type="account.password_reset_completed",
            recipient_id=user.id,
            occurrence_key=f"password-reset-completed:{user.id}:{uuid.uuid4().hex}",
            destination="/app",
            source_entity_type="User",
            source_entity_id=str(user.id),
        )
    )
    write_audit_log(
        actor=user,
        action="account.password_reset_completed",
        entity_type="User",
        entity_id=user.id,
        request=request,
        metadata={},
    )
