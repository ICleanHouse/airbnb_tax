from django.urls import path

from apps.locations.views import CityListView, CityZoneGeoJSONView, CityZoneListView


urlpatterns = [
    path("cities/", CityListView.as_view(), name="location-city-list"),
    path("cities/<slug:city_slug>/zones/", CityZoneListView.as_view(), name="location-city-zones"),
    path("cities/<slug:city_slug>/zones.geojson/", CityZoneGeoJSONView.as_view(), name="location-city-zones-geojson"),
]
