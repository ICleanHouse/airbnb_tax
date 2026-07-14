from __future__ import annotations

import logging
import re
import time
import uuid

from apps.core.logging import reset_log_context, set_log_context


logger = logging.getLogger("apps.request")
TRUSTED_REQUEST_ID = re.compile(r"^req_[0-9a-f]{32}$")


def normalize_request_id(value: str | None) -> str:
    value = (value or "").strip()
    if TRUSTED_REQUEST_ID.fullmatch(value):
        return value
    return f"req_{uuid.uuid4().hex}"


def get_endpoint_template(request) -> str:
    """Return Django's resolver route without path parameters or query values."""
    resolver_match = getattr(request, "resolver_match", None)
    route = getattr(resolver_match, "route", "") if resolver_match else ""
    return str(route or "unresolved")


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started_at = time.perf_counter()
        request_id = normalize_request_id(request.headers.get("X-Request-ID"))
        request.request_id = request_id

        context_tokens = set_log_context(request_id=request_id)

        try:
            response = self.get_response(request)
        except Exception:
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            endpoint_template = get_endpoint_template(request)
            logger.exception(
                f"{request.method} {endpoint_template} 500",
                extra={
                    "event": "request.crashed",
                    "method": request.method,
                    "endpoint_template": endpoint_template,
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
        endpoint_template = get_endpoint_template(request)
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
            f"{request.method} {endpoint_template} {status_code}",
            extra={
                "event": event,
                "request_id": request_id,
                "method": request.method,
                "endpoint_template": endpoint_template,
                "status_code": status_code,
                "duration_ms": duration_ms,
            },
        )
        return response
