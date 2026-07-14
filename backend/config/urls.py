from django.conf import settings
from django.contrib import admin
from django.http import HttpResponseNotFound
from django.urls import include, path

from apps.core.views import health_check


def raw_media_not_found(_request, **_kwargs):
    response = HttpResponseNotFound()
    response["Cache-Control"] = "private, no-store"
    response["Pragma"] = "no-cache"
    response["Clear-Site-Data"] = '"cache"'
    response["Cross-Origin-Resource-Policy"] = "same-origin"
    response["X-Content-Type-Options"] = "nosniff"
    return response

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/locations/", include("apps.locations.urls")),
    path("api/properties/", include("apps.properties.urls")),
    path("api/marketplace/", include("apps.marketplace.urls")),
    path("api/feedback/", include("apps.feedback.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/calendars/", include("apps.calendars.urls")),
    path("api/connections/", include("apps.connections.urls")),
    path(
        f"{settings.MEDIA_URL.lstrip('/')}<path:path>",
        raw_media_not_found,
        name="raw-media-not-found",
    ),
]

