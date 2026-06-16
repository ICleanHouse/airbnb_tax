from rest_framework.routers import DefaultRouter

from apps.marketplace.views import (
    AreaStatsView,
    AssignmentViewSet,
    CleanerApplicationViewSet,
    CleaningBatchViewSet,
    CleaningJobViewSet,
    FavouriteCleanerViewSet,
    MarketplaceCalendarView,
    OpenJobLocationsView,
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
    path("area-stats/", AreaStatsView.as_view(), name="marketplace-area-stats"),
    path("open-job-locations/", OpenJobLocationsView.as_view(), name="marketplace-open-job-locations"),
] + router.urls
