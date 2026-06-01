import datetime as dt
import logging
import urllib.request

from icalendar import Calendar
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services import write_audit_log
from apps.properties.models import ExternalCalendarConnection, Property, PropertyImage, Reservation
from apps.properties.serializers import (
    ExternalCalendarConnectionSerializer,
    PropertyImageSerializer,
    PropertySerializer,
    ReservationSerializer,
)


_ICS_SKIP_KEYWORDS = ("not available", "blocked", "unavailable")
logger = logging.getLogger("apps.properties")


def _parse_ics_bytes(content: bytes):
    """
    Parse raw ICS bytes and return a sorted list of reservation event dicts.
    Raises ValueError on parse failure.
    """
    try:
        cal = Calendar.from_ical(content)
    except Exception as exc:
        raise ValueError(f"Could not parse ICS content: {exc}") from exc

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

        summary_lower = summary.lower()
        if any(kw in summary_lower for kw in _ICS_SKIP_KEYWORDS):
            continue

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
    return events


class ParseIcsView(APIView):
    """
    Parse an uploaded Airbnb / iCal .ics file and return reservation events.

    POST /api/properties/parse-ics/
    Body:  multipart/form-data   field: ics_file
    Returns: list of {uid, summary, checkin, checkout, nights}
    """

    parser_classes = [MultiPartParser]

    def post(self, request):
        ics_file = request.FILES.get("ics_file")
        if not ics_file:
            return Response(
                {"detail": "ics_file is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        write_audit_log(
            actor=request.user,
            action="ics.import.started",
            entity_type="ICSImport",
            request=request,
            metadata={"source": "upload"},
        )
        try:
            events = _parse_ics_bytes(ics_file.read())
        except ValueError as exc:
            logger.error(
                "ICS upload parse failed",
                extra={"event": "ics.parse_failed", "metadata": {"source": "upload"}},
            )
            write_audit_log(
                actor=request.user,
                action="ics.import_failed",
                entity_type="ICSImport",
                request=request,
                metadata={"source": "upload", "reason": str(exc)},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        write_audit_log(
            actor=request.user,
            action="ics.import.completed",
            entity_type="ICSImport",
            request=request,
            metadata={"source": "upload", "event_count": len(events)},
        )
        return Response(events)


class FetchIcsUrlView(APIView):
    """
    Fetch an Airbnb / iCal URL server-side and return the reservation events.

    POST /api/properties/fetch-ics-url/
    Body:  { "url": "https://www.airbnb.com/calendar/ical/..." }
    Returns: list of {uid, summary, checkin, checkout, nights}

    The fetch is done server-side to avoid browser CORS restrictions on
    Airbnb's calendar export URLs.
    """

    parser_classes = [JSONParser]

    def post(self, request):
        url = (request.data.get("url") or "").strip()
        if not url:
            return Response({"detail": "url is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not url.startswith(("http://", "https://")):
            return Response({"detail": "url must start with http:// or https://."}, status=status.HTTP_400_BAD_REQUEST)

        write_audit_log(
            actor=request.user,
            action="ics.import.started",
            entity_type="ICSImport",
            request=request,
            metadata={"source": "url"},
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as response:
                content = response.read()
        except Exception as exc:
            logger.error(
                "ICS URL fetch failed",
                extra={"event": "external_calendar.sync_failed", "metadata": {"source": "url"}},
            )
            write_audit_log(
                actor=request.user,
                action="ics.import_failed",
                entity_type="ICSImport",
                request=request,
                metadata={"source": "url", "reason": str(exc)},
            )
            return Response(
                {"detail": f"Could not fetch the calendar URL: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            events = _parse_ics_bytes(content)
        except ValueError as exc:
            logger.error(
                "ICS URL parse failed",
                extra={"event": "ics.parse_failed", "metadata": {"source": "url"}},
            )
            write_audit_log(
                actor=request.user,
                action="ics.import_failed",
                entity_type="ICSImport",
                request=request,
                metadata={"source": "url", "reason": str(exc)},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        write_audit_log(
            actor=request.user,
            action="ics.import.completed",
            entity_type="ICSImport",
            request=request,
            metadata={"source": "url", "event_count": len(events)},
        )
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
        queryset = Property.objects.select_related("host").prefetch_related("images").all()
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
        property = serializer.save(host=self.request.user)
        write_audit_log(
            actor=self.request.user,
            action="property.created",
            entity_type="Property",
            entity_id=property.id,
            request=self.request,
        )


class PropertyImageViewSet(viewsets.ModelViewSet):
    serializer_class = PropertyImageSerializer
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if user.is_platform_admin:
            return PropertyImage.objects.select_related("property").all()
        return PropertyImage.objects.filter(property__host=user).select_related("property")

    def perform_create(self, serializer):
        prop = serializer.validated_data["property"]
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before uploading images.")
        if not self.request.user.is_platform_admin and prop.host_id != self.request.user.id:
            raise PermissionDenied("You can only add images to your own properties.")
        serializer.save()


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
