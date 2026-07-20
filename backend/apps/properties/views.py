import logging

from django.db.models import OuterRef, Q, Subquery
from django.http import FileResponse, Http404
from django.utils.cache import patch_vary_headers
from PIL import Image, UnidentifiedImageError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsApprovedHostOrPlatformAdmin
from apps.core.services import write_audit_log
from apps.marketplace.models import Assignment, CleaningJob
from apps.properties.ics_import import (
    IcsImportValidationError,
    parse_ics_bytes,
    public_ics_error,
    validate_and_read_ics_upload,
)
from apps.properties.models import ExternalCalendarConnection, Property, PropertyImage, Reservation
from apps.properties.serializers import (
    ExternalCalendarConnectionSerializer,
    PropertyImageSerializer,
    PropertySerializer,
    ReservationSerializer,
)
from apps.properties.throttles import IcsImportUserThrottle


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
    response["Expires"] = "0"
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


def _request_language(request) -> str:
    return "bg" if getattr(request.user, "preferred_language", "en") == "bg" else "en"


class IcsImportRateLimited(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "ics_import_rate_limited"


def _ics_error_response(request, error: IcsImportValidationError) -> Response:
    metadata: dict[str, str | int] = {
        "source": "upload",
        "reason_code": error.reason_code,
    }
    if error.event_count is not None:
        metadata["event_count"] = error.event_count
    write_audit_log(
        actor=request.user,
        action="ics.import.rejected",
        entity_type="ICSImport",
        request=request,
        metadata=metadata,
    )
    logger.warning(
        "ICS upload rejected",
        extra={
            "event": "ics.import.rejected",
            "metadata": {"source": "upload", "reason_code": error.reason_code},
        },
    )
    return Response(
        public_ics_error(error.public_code, _request_language(request)),
        status=status.HTTP_400_BAD_REQUEST,
    )


class ParseIcsView(PrivateNoStoreResponseMixin, APIView):
    """
    Parse an uploaded Airbnb / iCal .ics file and return reservation events.

    POST /api/properties/parse-ics/
    Body:  multipart/form-data   field: ics_file
    Returns: list of {uid, summary, checkin, checkout, nights}
    """

    parser_classes = [MultiPartParser]
    permission_classes = [IsApprovedHostOrPlatformAdmin]
    throttle_classes = [IcsImportUserThrottle]

    def throttled(self, request, wait):
        write_audit_log(
            actor=request.user,
            action="ics.import.throttled",
            entity_type="ICSImport",
            request=request,
            metadata={"source": "upload", "reason_code": "rate_limited"},
        )
        raise IcsImportRateLimited(
            public_ics_error("ics_import_rate_limited", _request_language(request))
        )

    def post(self, request):
        write_audit_log(
            actor=request.user,
            action="ics.import.started",
            entity_type="ICSImport",
            request=request,
            metadata={"source": "upload"},
        )
        ics_file = request.FILES.get("ics_file")
        if ics_file is None:
            return _ics_error_response(
                request,
                IcsImportValidationError("ics_file_required", "missing_file"),
            )
        try:
            content = validate_and_read_ics_upload(ics_file)
            events = parse_ics_bytes(content)
        except IcsImportValidationError as error:
            return _ics_error_response(request, error)
        write_audit_log(
            actor=request.user,
            action="ics.import.succeeded",
            entity_type="ICSImport",
            request=request,
            metadata={"source": "upload", "event_count": len(events)},
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
