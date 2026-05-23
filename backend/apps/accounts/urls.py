from rest_framework.routers import DefaultRouter

from django.urls import path

from apps.accounts.views import (
    AgencyInvitationViewSet,
    AgencyMembershipViewSet,
    AgencyProfileViewSet,
    CleanerProfileViewSet,
    ConfirmEmailView,
    CookieConsentView,
    HostProfileViewSet,
    LoginView,
    LogoutView,
    MeView,
    SignupView,
    UserViewSet,
)


router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("hosts", HostProfileViewSet, basename="host-profile")
router.register("cleaners", CleanerProfileViewSet, basename="cleaner-profile")
router.register("agencies", AgencyProfileViewSet, basename="agency-profile")
router.register("agency-invitations", AgencyInvitationViewSet, basename="agency-invitation")
router.register("agency-memberships", AgencyMembershipViewSet, basename="agency-membership")

urlpatterns = [
    path("signup/", SignupView.as_view(), name="account-signup"),
    path("confirm-email/<str:uidb64>/<str:token>/", ConfirmEmailView.as_view(), name="account-confirm-email"),
    path("login/", LoginView.as_view(), name="account-login"),
    path("logout/", LogoutView.as_view(), name="account-logout"),
    path("me/", MeView.as_view(), name="account-me"),
    path("cookie-consent/", CookieConsentView.as_view(), name="cookie-consent"),
] + router.urls
