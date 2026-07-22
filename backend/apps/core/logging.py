from __future__ import annotations

import contextvars
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any


request_id_var = contextvars.ContextVar("request_id", default="")
user_id_var = contextvars.ContextVar("user_id", default="")
role_var = contextvars.ContextVar("role", default="")

SENSITIVE_KEYS = {
    "api_key",
    "apikey",
    "authorization",
    "code",
    "cookie",
    "csrf",
    "csrftoken",
    "email_verification_token",
    "password",
    "password_confirm",
    "secret",
    "session",
    "sessionid",
    "token",
}
SENSITIVE_SUBSTRINGS = {
    "authorization",
    "cookie",
    "csrf",
    "password",
    "secret",
    "session",
    "token",
}
SAFE_EVENT = re.compile(r"^[a-z0-9_.-]{1,100}$")


def is_sensitive_key(key: str) -> bool:
    normalized = key.lower()
    return (
        normalized in SENSITIVE_KEYS
        or normalized.endswith("_token")
        or normalized.endswith("_password")
        or normalized.endswith("_secret")
        or normalized.endswith("verification_code")
        or any(sensitive in normalized for sensitive in SENSITIVE_SUBSTRINGS)
    )


def get_request_id() -> str:
    return request_id_var.get()


def set_log_context(*, request_id: str = "", user_id: str | int = "", role: str = ""):
    return (
        request_id_var.set(str(request_id or "")),
        user_id_var.set(str(user_id or "")),
        role_var.set(role or ""),
    )


def reset_log_context(tokens) -> None:
    request_id_var.reset(tokens[0])
    user_id_var.reset(tokens[1])
    role_var.reset(tokens[2])


def sanitize_log_value(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            key_text = str(key)
            if is_sensitive_key(key_text):
                cleaned[key_text] = "[redacted]"
            else:
                cleaned[key_text] = sanitize_log_value(item)
        return cleaned
    if isinstance(value, (list, tuple)):
        return [sanitize_log_value(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        raw_event = getattr(record, "event", "")
        event = raw_event if isinstance(raw_event, str) and SAFE_EVENT.fullmatch(raw_event) else ""
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).astimezone().isoformat(),
            "level": record.levelname,
            "service": getattr(record, "service", os.getenv("SERVICE_NAME", "backend")),
            "environment": os.getenv("APP_ENV") or os.getenv("SENTRY_ENVIRONMENT") or "local",
            "logger": record.name,
            "request_id": getattr(record, "request_id", ""),
            "event": event,
            "message": event or "application.event",
        }

        optional_fields = (
            "method",
            "endpoint_template",
            "status_code",
            "duration_ms",
            "task_name",
            "error_code",
            "delivery_id",
            "notification_event_type",
            "channel",
            "attempt_number",
            "delivery_result",
        )
        for field in optional_fields:
            value = getattr(record, field, None)
            if value not in (None, ""):
                payload[field] = value

        if record.exc_info:
            payload["exception"] = "Application error"
        elif record.exc_text:
            payload["exception"] = "Application error"
        elif getattr(record, "stack_info", None):
            payload["exception"] = "Application error"

        return json.dumps(sanitize_log_value(payload), ensure_ascii=False, default=str)
