from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils import timezone

from apps.accounts.models import (
    AgencyInvitation,
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    CookieConsent,
    HostProfile,
    User,
)


@admin.register(User)
class AppUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (
            "Marketplace",
            {
                "fields": (
                    "role",
                    "account_status",
                    "approved_at",
                    "approved_by",
                    "phone_number",
                    "preferred_language",
                    "email_verified_at",
                    "phone_verified_at",
                )
            },
        ),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "Marketplace",
            {
                "classes": ("wide",),
                "fields": ("role", "account_status", "phone_number", "preferred_language"),
            },
        ),
    )
    list_display = ("username", "email", "role", "account_status", "is_staff", "is_active")
    list_filter = UserAdmin.list_filter + ("role", "account_status")
    readonly_fields = ("approved_at", "approved_by")

    def save_model(self, request, obj, form, change):
        if obj.role == User.Role.ADMIN or obj.is_superuser:
            obj.role = User.Role.ADMIN
            obj.account_status = User.AccountStatus.APPROVED
            obj.is_staff = True
            obj.is_superuser = True
        if obj.account_status == User.AccountStatus.APPROVED and obj.approved_at is None:
            obj.approved_at = timezone.now()
            obj.approved_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(HostProfile)
class HostProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "company_name", "city", "created_at")
    search_fields = ("user__username", "company_name", "city")


@admin.register(CleanerProfile)
class CleanerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "display_name",
        "city",
        "kind",
        "verification_status",
        "average_rating",
        "completed_jobs_count",
    )
    list_filter = ("kind", "verification_status", "city")
    search_fields = ("user__username", "display_name", "city", "service_areas")


@admin.register(AgencyProfile)
class AgencyProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "company_name", "city", "created_at")
    search_fields = ("user__username", "company_name", "city", "service_areas")


@admin.register(AgencyInvitation)
class AgencyInvitationAdmin(admin.ModelAdmin):
    list_display = ("agency", "email", "phone_number", "status", "expires_at", "accepted_at")
    list_filter = ("status",)
    search_fields = ("agency__company_name", "email", "phone_number", "cleaner__username")
    readonly_fields = ("token", "accepted_at")


@admin.register(AgencyMembership)
class AgencyMembershipAdmin(admin.ModelAdmin):
    list_display = ("agency", "cleaner", "status", "joined_at", "revoked_at")
    list_filter = ("status",)
    search_fields = ("agency__company_name", "cleaner__username", "cleaner__email")


@admin.register(CookieConsent)
class CookieConsentAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "visitor_id",
        "policy_version",
        "analytics",
        "marketing",
        "source",
        "created_at",
    )
    list_filter = ("policy_version", "analytics", "marketing", "source")
    search_fields = ("user__username", "user__email", "visitor_id")
    readonly_fields = ("user_agent", "ip_address", "created_at", "updated_at")
