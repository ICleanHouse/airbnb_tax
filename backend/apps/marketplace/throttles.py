from rest_framework.throttling import UserRateThrottle


class LifecycleWriteThrottle(UserRateThrottle):
    scope = "lifecycle"

    def allow_request(self, request, view):
        if request.user.is_authenticated and request.user.is_platform_admin:
            return True
        return super().allow_request(request, view)

