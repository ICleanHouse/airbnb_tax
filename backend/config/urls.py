from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.core.views import health_check

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
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

