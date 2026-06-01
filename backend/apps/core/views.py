import logging

from django.http import JsonResponse


logger = logging.getLogger("apps.security")


def health_check(_request):
    return JsonResponse({"status": "ok"})


def csrf_failure(request, reason=""):
    logger.warning(
        "CSRF validation failed",
        extra={
            "event": "csrf.failed",
            "method": request.method,
            "path": request.path,
            "status_code": 403,
            "metadata": {"reason": reason},
        },
    )
    return JsonResponse({"detail": "CSRF verification failed."}, status=403)
