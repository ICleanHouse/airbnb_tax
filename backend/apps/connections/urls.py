from rest_framework.routers import DefaultRouter

from apps.connections.views import ConnectionViewSet


router = DefaultRouter()
router.register("", ConnectionViewSet, basename="connection")

urlpatterns = router.urls
