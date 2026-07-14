import datetime as dt
import logging
import urllib.request

from django.db.models import OuterRef, Q, Subquery
from django.http import FileResponse, Http404
from django.utils.cache import patch_vary_headers
from icalendar import Calendar
from PIL import Image, UnidentifiedImageError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services import write_audit_log
from apps.marketplace.models import Assignment, CleaningJob
from apps.properties.models import ExternalCalendarConnection, Property, PropertyImage, Reservation
from apps.properties.serializers import (
    ExternalCalendarConnectionSerializer,
    PropertyImageSerializer,
    PropertySerializer,
    ReservationSerializer,
)


_ICS_SKIP_KEYWORDS = ("not available", "blocked", "unavailable")
_SAFE_PROPERTY_IMAGE_TYPES = {
    ".gif": ("GIF", "image/gif", ".gif"),
    ".jpeg": ("JPEG", "image/jpeg", ".jpg"),
    ".jpg": ("JPEG", "image/jpeg", ".jpg"),
    ".png": ("PNG", "image/png", ".png"),
    ".webp": ("WEBP", "image/webp", ".webp"),
}
logger = logging.getLogger("apps.properties")


def _apply_private_no_store_headers(response):
    response["Cache-Control"] = "private, no-store"
    response["Pragma"] = "no-cache"
    response["Clear-Site-Data"] = '"cache"'
    response["X-Content-Type-Options"] = "nosniff"
    response["Cross-Origin-Resource-Policy"] = "same-origin"
    patch_vary_headers(response, ["Cookie"])
    return response


class PrivateNoStoreResponseMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        return _apply_private_no_store_headers(response)


def _user_can_access_property_image(user, property_image: PropertyImage) -> bool:
    if user.is_platform_admin:
        return True
    if not user.is_active or not user.is_approved:
        return False
    if user.is_host and property_image.property.host_id == user.id:
        return True

    assignment_filter = Q()
    if user.is_cleaner:
        from apps.accounts.models import CleanerProfile

        verified = CleanerProfile.VerificationStatus.VERIFIED
        assignment_filter = Q(
            cleaner_id=user.id,
            cleaner__cleaner_profile__verification_status=verified,
        ) | Q(
            assigned_member_id=user.id,
            assigned_member__cleaner_profile__verification_status=verified,
        )
    elif user.is_agency:
        assignment_filter = Q(
            cleaner_id=user.id,
            cleaner__agency_profile__isnull=False,
        )
    else:
        return False

    primary_image_id = PropertyImage.objects.filter(
        property_id=OuterRef("job__property_id")
    ).order_by("order", "id").values("id")[:1]
    return Assignment.objects.annotate(
        primary_image_id=Subquery(primary_image_id)
    ).filter(
        assignment_filter,
        job__property_id=property_image.property_id,
        job__status=CleaningJob.Status.ASSIGNED,
        cancelled_at__isnull=True,
        primary_image_id=property_image.pk,
    ).exists()


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


class PropertyViewSet(PrivateNoStoreResponseMixin, viewsets.ModelViewSet):
    serializer_class = PropertySerializer

    def get_queryset(self):
        user = self.request.user
        queryset = (
            Property.objects.select_related("host", "service_zone", "service_zone__city")
            .prefetch_related("images")
            .all()
        )
        if user.is_platform_admin:
            return queryset
        if not user.is_approved:
            return queryset.none()
        return queryset.filter(host=user)

    def _enforce_create_permission(self):
        if not (self.request.user.is_platform_admin or self.request.user.is_host):
            raise PermissionDenied("Only hosts can create properties.")
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before creating properties.")

    def create(self, request, *args, **kwargs):
        self._enforce_create_permission()
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        self._enforce_create_permission()
        property = serializer.save(host=self.request.user)
        write_audit_log(
            actor=self.request.user,
            action="property.created",
            entity_type="Property",
            entity_id=property.id,
            request=self.request,
        )


class PropertyImageViewSet(PrivateNoStoreResponseMixin, viewsets.ModelViewSet):
    serializer_class = PropertyImageSerializer
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        if user.is_platform_admin:
            return PropertyImage.objects.select_related("property").all()
        if not user.is_active or not user.is_approved or not user.is_host:
            return PropertyImage.objects.none()
        return PropertyImage.objects.filter(property__host=user).select_related("property")

    def perform_create(self, serializer):
        prop = serializer.validated_data["property"]
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before uploading images.")
        if not self.request.user.is_platform_admin and prop.host_id != self.request.user.id:
            raise PermissionDenied("You can only add images to your own properties.")
        serializer.save()

    @action(detail=True, methods=["get", "head"], url_path="content")
    def content(self, request, pk=None):
        try:
            property_image = PropertyImage.objects.select_related("property").get(pk=pk)
        except PropertyImage.DoesNotExist as exc:
            raise Http404 from exc

        if not _user_can_access_property_image(request.user, property_image):
            raise Http404

        image_name = property_image.image.name
        suffix = "." + image_name.rsplit(".", 1)[-1].lower() if "." in image_name else ""
        safe_type = _SAFE_PROPERTY_IMAGE_TYPES.get(suffix)
        if safe_type is None:
            raise Http404
        expected_format, content_type, safe_suffix = safe_type
        try:
            with property_image.image.open("rb") as verification_file:
                with Image.open(verification_file) as decoded_image:
                    image_format = decoded_image.format
                    decoded_image.verify()
            if image_format != expected_format:
                raise Http404
            image_file = property_image.image.open("rb")
        except (FileNotFoundError, OSError, UnidentifiedImageError, SyntaxError) as exc:
            raise Http404 from exc

        response = FileResponse(
            image_file,
            as_attachment=False,
            filename=f"property-image{safe_suffix}",
            content_type=content_type,
        )
        return _apply_private_no_store_headers(response)


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
