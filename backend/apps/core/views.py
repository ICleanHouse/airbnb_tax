import logging

from django.http import JsonResponse

from apps.core.middleware import get_endpoint_template


logger = logging.getLogger("apps.security")


def health_check(_request):
    return JsonResponse({"status": "ok"})


def csrf_failure(request, reason=""):
    logger.warning(
        "CSRF validation failed",
        extra={
            "event": "csrf.failed",
            "method": request.method,
            "endpoint_template": get_endpoint_template(request),
            "status_code": 403,
        },
    )
    return JsonResponse({"detail": "CSRF verification failed."}, status=403)
