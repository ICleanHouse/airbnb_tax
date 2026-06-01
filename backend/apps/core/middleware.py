from __future__ import annotations

import logging
import time
import uuid

from apps.core.logging import reset_log_context, set_log_context


logger = logging.getLogger("apps.request")


def normalize_request_id(value: str | None) -> str:
    value = (value or "").strip()
    if value and len(value) <= 100 and all(char.isalnum() or char in "-_." for char in value):
        return value
    return f"req_{uuid.uuid4().hex}"


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started_at = time.perf_counter()
        request_id = normalize_request_id(request.headers.get("X-Request-ID"))
        request.request_id = request_id

        user = getattr(request, "user", None)
        user_id = getattr(user, "id", "") if getattr(user, "is_authenticated", False) else ""
        role = getattr(user, "role", "") if getattr(user, "is_authenticated", False) else ""
        context_tokens = set_log_context(request_id=request_id, user_id=user_id, role=role)

        try:
            response = self.get_response(request)
        except Exception:
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            response_user = getattr(request, "user", None)
            response_user_id = (
                getattr(response_user, "id", "") if getattr(response_user, "is_authenticated", False) else ""
            )
            response_role = (
                getattr(response_user, "role", "") if getattr(response_user, "is_authenticated", False) else ""
            )
            logger.exception(
                "Unhandled request exception",
                extra={
                    "event": "request.crashed",
                    "user_id": response_user_id,
                    "role": response_role,
                    "method": request.method,
                    "path": request.path,
                    "status_code": 500,
                    "duration_ms": duration_ms,
                },
            )
            raise
        finally:
            reset_log_context(context_tokens)

        response["X-Request-ID"] = request_id
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        status_code = getattr(response, "status_code", 0)
        response_user = getattr(request, "user", None)
        response_user_id = getattr(response_user, "id", "") if getattr(response_user, "is_authenticated", False) else ""
        response_role = getattr(response_user, "role", "") if getattr(response_user, "is_authenticated", False) else ""
        if status_code >= 500:
            log = logger.error
            event = "request.failed"
        elif status_code in {400, 401, 403, 404}:
            log = logger.warning
            event = "request.rejected"
        else:
            log = logger.info
            event = "request.completed"

        log(
            f"{request.method} {request.path} {status_code}",
            extra={
                "event": event,
                "request_id": request_id,
                "user_id": response_user_id,
                "role": response_role,
                "method": request.method,
                "path": request.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
            },
        )
        return response
