from rest_framework.routers import DefaultRouter

from apps.marketplace.views import (
    AssignmentViewSet,
    CleanerApplicationViewSet,
    CleaningBatchViewSet,
    CleaningJobViewSet,
    FavouriteCleanerViewSet,
    MarketplaceCalendarView,
)
from django.urls import path


router = DefaultRouter()
router.register("batches", CleaningBatchViewSet, basename="cleaning-batch")
router.register("jobs", CleaningJobViewSet, basename="cleaning-job")
router.register("applications", CleanerApplicationViewSet, basename="cleaner-application")
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("favourites", FavouriteCleanerViewSet, basename="favourite-cleaner")

urlpatterns = [
    path("calendar/", MarketplaceCalendarView.as_view(), name="marketplace-calendar"),
] + router.urls
