from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_platform_admin)


class IsHost(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_host)


class IsCleaner(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_cleaner)


class IsVerifiedCleaner(BasePermission):
    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated or not request.user.is_cleaner:
            return False
        profile = getattr(request.user, "cleaner_profile", None)
        return bool(profile and profile.is_verified)


class IsApprovedAccount(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_approved)


class IsApprovedHostOrPlatformAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_platform_admin:
            return True
        return bool(user.is_active and user.is_host and user.is_approved)
