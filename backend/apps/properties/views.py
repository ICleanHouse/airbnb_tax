import datetime as dt

from icalendar import Calendar
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.properties.models import ExternalCalendarConnection, Property, Reservation
from apps.properties.serializers import (
    ExternalCalendarConnectionSerializer,
    PropertySerializer,
    ReservationSerializer,
)


_ICS_SKIP_KEYWORDS = ("not available", "blocked", "unavailable")


class ParseIcsView(APIView):
    """
    Parse an Airbnb / iCal .ics file and return the list of reservation events.

    POST /api/properties/parse-ics/
    Body:  multipart/form-data   field: ics_file
    Returns: list of {uid, summary, checkin, checkout, nights}

    Entries whose summary contains "not available", "blocked", or "unavailable"
    are filtered out — these are Airbnb blocked-date placeholders, not real
    guest reservations.
    """

    parser_classes = [MultiPartParser]

    def post(self, request):
        ics_file = request.FILES.get("ics_file")
        if not ics_file:
            return Response(
                {"detail": "ics_file is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            cal = Calendar.from_ical(ics_file.read())
        except Exception as exc:
            return Response(
                {"detail": f"Could not parse ICS file: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        events = []
        for component in cal.walk():
            if component.name != "VEVENT":
                continue

            summary = str(component.get("SUMMARY", "")).strip()
            uid = str(component.get("UID", ""))
            dtstart = component.get("DTSTART")
            dtend = component.get("DTEND")

            if not dtstart or not dtend:
                continue

            # Skip Airbnb blocked-date placeholders
            summary_lower = summary.lower()
            if any(kw in summary_lower for kw in _ICS_SKIP_KEYWORDS):
                continue

            # Normalise to date — DTSTART/DTEND can be date or datetime
            start_val = dtstart.dt
            end_val = dtend.dt
            start_date = start_val.date() if isinstance(start_val, dt.datetime) else start_val
            end_date = end_val.date() if isinstance(end_val, dt.datetime) else end_val

            nights = (end_date - start_date).days

            events.append({
                "uid": uid,
                "summary": summary or "Reservation",
                "checkin": start_date.isoformat(),
                "checkout": end_date.isoformat(),
                "nights": nights,
            })

        events.sort(key=lambda e: e["checkin"])
        return Response(events)


class HostOwnedQuerysetMixin:
    def filter_for_user(self, queryset):
        user = self.request.user
        if user.is_platform_admin:
            return queryset
        if not user.is_approved:
            return queryset.none()
        return queryset.filter(property__host=user)


class PropertyViewSet(viewsets.ModelViewSet):
    serializer_class = PropertySerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Property.objects.select_related("host").all()
        if user.is_platform_admin:
            return queryset
        if not user.is_approved:
            return queryset.none()
        return queryset.filter(host=user)

    def perform_create(self, serializer):
        if not (self.request.user.is_platform_admin or self.request.user.is_host):
            raise PermissionDenied("Only hosts can create properties.")
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before creating properties.")
        serializer.save(host=self.request.user)


class ExternalCalendarConnectionViewSet(HostOwnedQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = ExternalCalendarConnectionSerializer

    def get_queryset(self):
        queryset = ExternalCalendarConnection.objects.select_related("property", "property__host")
        return self.filter_for_user(queryset)

    def perform_create(self, serializer):
        property = serializer.validated_data["property"]
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before creating calendar connections.")
        if not self.request.user.is_platform_admin and property.host_id != self.request.user.id:
            raise PermissionDenied("Calendar connections can be created only for owned properties.")
        serializer.save()


class ReservationViewSet(HostOwnedQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = ReservationSerializer

    def get_queryset(self):
        queryset = Reservation.objects.select_related("property", "property__host")
        return self.filter_for_user(queryset)

    def perform_create(self, serializer):
        property = serializer.validated_data["property"]
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before creating reservations.")
        if not self.request.user.is_platform_admin and property.host_id != self.request.user.id:
            raise PermissionDenied("Reservations can be created only for owned properties.")
        serializer.save()
