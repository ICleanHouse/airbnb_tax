from __future__ import annotations

import logging
from typing import Any

from django.contrib.auth.models import AnonymousUser

from apps.core.logging import get_request_id, sanitize_log_value
from apps.core.models import AuditLog


logger = logging.getLogger("apps.audit")


def get_client_ip(request) -> str | None:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def write_audit_log(
    *,
    actor=None,
    action: str,
    entity_type: str,
    entity_id: Any = "",
    request=None,
    request_id: str = "",
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    request_user = getattr(request, "user", None)
    actor = actor or request_user
    if isinstance(actor, AnonymousUser) or not getattr(actor, "is_authenticated", False):
        actor = None

    cleaned_metadata = sanitize_log_value(metadata or {})
    audit_log = AuditLog.objects.create(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else "",
        request_id=request_id or getattr(request, "request_id", "") or get_request_id(),
        ip_address=get_client_ip(request) if request is not None else None,
        user_agent=request.META.get("HTTP_USER_AGENT", "") if request is not None else "",
        metadata=cleaned_metadata,
    )
    logger.info(
        action,
        extra={
            "event": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id is not None else "",
            "metadata": cleaned_metadata,
        },
    )
    return audit_log
