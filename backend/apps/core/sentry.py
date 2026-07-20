from __future__ import annotations

import re
from urllib.parse import unquote, urlsplit


SAFE_HTTP_METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
SAFE_ERROR_CODES = {
    "csrf_failed",
    "http_error",
    "internal_error",
    "network_error",
    "not_found",
    "permission_denied",
    "validation_error",
}
SAFE_ENDPOINT_SEGMENTS = {
    "accept",
    "accept-offer",
    "accounts",
    "agencies",
    "agency-invitations",
    "agency-memberships",
    "api",
    "applications",
    "approve",
    "area-stats",
    "assign-member",
    "assignments",
    "batches",
    "calendar",
    "calendar-connections",
    "calendars",
    "cities",
    "cleaners",
    "complete",
    "confirm-email",
    "connections",
    "content",
    "cookie-consent",
    "csrf",
    "decline",
    "decline-offer",
    "email-code",
    "favourites",
    "feedback",
    "health",
    "images",
    "jobs",
    "locations",
    "login",
    "logout",
    "marketplace",
    "me",
    "notifications",
    "offer-to-cleaner",
    "open-job-locations",
    "parse-ics",
    "properties",
    "public-cleaners",
    "public-demand",
    "publish",
    "read-all",
    "reject",
    "reservations",
    "reviews",
    "shared",
    "signup",
    "unread-count",
    "users",
    "verify-email-code",
    "withdraw",
    "zones",
}
SAFE_REQUEST_ID = re.compile(r"^req_[0-9a-f]{32}$")


def sanitize_endpoint_template(value: object) -> str:
    if not isinstance(value, str):
        return "/:value"
    try:
        path = urlsplit(value).path
    except (TypeError, ValueError):
        return "/:value"
    if not path.startswith("/"):
        return "/:value"

    trailing_slash = path.endswith("/")
    segments = []
    for raw_segment in path.split("/"):
        if not raw_segment:
            continue
        try:
            segment = unquote(raw_segment)
        except (TypeError, ValueError):
            segment = ""
        normalized = segment.lower()
        if segment.isdecimal() or normalized == ":id":
            segments.append(":id")
        elif normalized in SAFE_ENDPOINT_SEGMENTS:
            segments.append(normalized)
        else:
            segments.append(":value")

    if not segments:
        return "/"
    suffix = "/" if trailing_slash else ""
    return f"/{'/'.join(segments)}{suffix}"


def _safe_method(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    method = value.upper()
    return method if method in SAFE_HTTP_METHODS else None


def _safe_extra(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        return {}
    safe: dict[str, object] = {}
    endpoint = value.get("endpoint_template")
    if isinstance(endpoint, str):
        safe["endpoint_template"] = sanitize_endpoint_template(endpoint)
    error_code = value.get("error_code")
    if isinstance(error_code, str) and error_code in SAFE_ERROR_CODES:
        safe["error_code"] = error_code
    method = _safe_method(value.get("method"))
    if method:
        safe["method"] = method
    request_id = value.get("request_id")
    if isinstance(request_id, str) and SAFE_REQUEST_ID.fullmatch(request_id):
        safe["request_id"] = request_id
    status_code = value.get("status_code")
    if isinstance(status_code, int) and 100 <= status_code <= 599:
        safe["status_code"] = status_code
    return safe


def sanitize_sentry_event(event: dict, _hint: object) -> dict:
    """Rebuild Sentry events from non-identifying, controlled fields only."""
    sanitized: dict[str, object] = {"message": "Application error"}
    for key in ("event_id", "level", "platform", "timestamp", "environment", "release"):
        value = event.get(key)
        if isinstance(value, (str, int, float)):
            sanitized[key] = value

    request = event.get("request")
    if isinstance(request, dict):
        safe_request: dict[str, str] = {}
        method = _safe_method(request.get("method"))
        if method:
            safe_request["method"] = method
        url = request.get("url")
        if isinstance(url, str):
            safe_request["url"] = sanitize_endpoint_template(url)
        if safe_request:
            sanitized["request"] = safe_request

    extra = _safe_extra(event.get("extra"))
    if extra:
        sanitized["extra"] = extra

    tags = event.get("tags")
    if isinstance(tags, dict):
        error_code = tags.get("error_code")
        if isinstance(error_code, str) and error_code in SAFE_ERROR_CODES:
            sanitized["tags"] = {"error_code": error_code}

    return sanitized


def drop_sentry_transaction(_event: dict, _hint: object) -> None:
    """Do not emit transaction/span payloads outside the telemetry allowlist."""
    return None
