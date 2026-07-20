from django.core.files.base import ContentFile
from django.urls import reverse
from rest_framework import serializers

from apps.core.image_uploads import (
    PROPERTY_IMAGE_POLICY,
    ImageUploadValidationError,
    normalize_uploaded_image,
    public_image_error,
    request_language,
)
from apps.locations.models import ServiceZone
from apps.marketplace.models import CleaningJob
from apps.properties.models import ExternalCalendarConnection, Property, PropertyImage, Reservation

_ADDRESS_FIELDS = {"address", "city", "neighborhood", "service_zone", "latitude", "longitude"}
_ACTIVE_JOB_STATUSES = {CleaningJob.Status.DRAFT, CleaningJob.Status.OPEN, CleaningJob.Status.ASSIGNED}


def _city_matches_zone(value: str, zone: ServiceZone) -> bool:
    normalized = value.strip().casefold()
    return normalized in {
        zone.city.slug.casefold(),
        zone.city.name_bg.casefold(),
        zone.city.name_en.casefold(),
    }


def _is_sofia_city(value: str) -> bool:
    return isinstance(value, str) and value.strip().casefold() in {"sofia", "софия"}


class ServiceZoneReferenceField(serializers.RelatedField):
    default_error_messages = {
        "invalid": "Select a valid active service zone.",
        "noncanonical_sofia": "Sofia properties require a canonical sofia:osm-1 through sofia:osm-144 zone ID.",
    }

    def to_internal_value(self, data):
        if not isinstance(data, str) or data.count(":") != 1:
            self.fail("invalid")
        city_slug, zone_slug = data.split(":", 1)
        if city_slug == "sofia":
            if not zone_slug.startswith("osm-"):
                self.fail("noncanonical_sofia")
            try:
                source_id = int(zone_slug.removeprefix("osm-"))
            except ValueError:
                self.fail("noncanonical_sofia")
            if not 1 <= source_id <= 144 or zone_slug != f"osm-{source_id}":
                self.fail("noncanonical_sofia")
        try:
            return self.get_queryset().select_related("city").get(
                city__slug=city_slug,
                city__is_active=True,
                slug=zone_slug,
                is_active=True,
            )
        except ServiceZone.DoesNotExist:
            self.fail("invalid")

    def to_representation(self, value):
        return value.zone_id


class PropertyImageSerializer(serializers.ModelSerializer):
    image = serializers.FileField(write_only=True, allow_empty_file=False)
    content_url = serializers.SerializerMethodField()
    property_id = serializers.PrimaryKeyRelatedField(
        source="property",
        queryset=Property.objects.all(),
        write_only=True,
    )

    class Meta:
        model = PropertyImage
        fields = ["id", "property_id", "image", "content_url", "caption", "order", "created_at"]
        read_only_fields = ["id", "content_url", "created_at"]

    def get_content_url(self, instance):
        return reverse("property-image-content", kwargs={"pk": instance.pk})

    def validate_image(self, value):
        try:
            normalized = normalize_uploaded_image(value, PROPERTY_IMAGE_POLICY)
        except ImageUploadValidationError as error:
            request = self.context.get("request")
            raise serializers.ValidationError(
                public_image_error(request_language(request))
            ) from error
        return ContentFile(normalized.content, name=normalized.filename)


class PropertySerializer(serializers.ModelSerializer):
    host = serializers.PrimaryKeyRelatedField(read_only=True)
    images = PropertyImageSerializer(many=True, read_only=True)
    service_zone_id = ServiceZoneReferenceField(
        source="service_zone",
        queryset=ServiceZone.objects.all(),
        required=False,
        allow_null=True,
    )
    service_zone_name_bg = serializers.CharField(
        source="service_zone.name_bg",
        read_only=True,
        allow_null=True,
    )
    service_zone_name_en = serializers.CharField(
        source="service_zone.name_en",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Property
        fields = [
            "id",
            "host",
            "name",
            "address",
            "city",
            "neighborhood",
            "service_zone_id",
            "service_zone_name_bg",
            "service_zone_name_en",
            "latitude",
            "longitude",
            "country",
            "timezone",
            "description",
            "bedrooms",
            "square_meters",
            "access_notes",
            "cleaning_instructions",
            "default_cleaning_duration_minutes",
            "default_price_eur",
            "images",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "host", "created_at", "updated_at"]

    def validate(self, attrs):
        instance = self.instance
        effective_city = attrs.get("city", instance.city if instance else "")
        effective_zone = attrs.get("service_zone", instance.service_zone if instance else None)

        if effective_zone is not None and not _city_matches_zone(effective_city, effective_zone):
            raise serializers.ValidationError(
                {"service_zone_id": "The service zone must belong to the property's city."}
            )

        if instance is None:
            if _is_sofia_city(effective_city) and effective_zone is None:
                raise serializers.ValidationError(
                    {"service_zone_id": "Sofia properties require a canonical service zone."}
                )
            return attrs

        changing_address = _ADDRESS_FIELDS.intersection(attrs)
        if not changing_address:
            return attrs

        actual_changes = set()
        for field in changing_address:
            incoming = attrs[field]
            current = getattr(instance, field)
            if field == "service_zone":
                incoming_id = incoming.pk if incoming is not None else None
                current_id = current.pk if current is not None else None
                if incoming_id != current_id:
                    actual_changes.add(field)
            elif str(incoming) != str(current or ""):
                actual_changes.add(field)
        if not actual_changes:
            return attrs

        if _is_sofia_city(effective_city) and effective_zone is None:
            raise serializers.ValidationError(
                {"service_zone_id": "Relocating a Sofia property requires a canonical service zone."}
            )

        has_active_jobs = CleaningJob.objects.filter(
            property=instance,
            status__in=_ACTIVE_JOB_STATUSES,
        ).exists()
        if has_active_jobs:
            raise serializers.ValidationError(
                "Cannot change the address while there are active jobs (draft, open, or assigned) on this property."
            )

        return attrs


class ExternalCalendarConnectionSerializer(serializers.ModelSerializer):
    property_id = serializers.PrimaryKeyRelatedField(
        source="property",
        queryset=Property.objects.all(),
        write_only=True,
    )

    class Meta:
        model = ExternalCalendarConnection
        fields = [
            "id",
            "property_id",
            "property",
            "provider",
            "name",
            "direction",
            "feed_url",
            "external_calendar_id",
            "status",
            "last_sync_at",
            "last_error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "property",
            "status",
            "last_sync_at",
            "last_error",
            "created_at",
            "updated_at",
        ]


class ReservationSerializer(serializers.ModelSerializer):
    property_id = serializers.PrimaryKeyRelatedField(
        source="property",
        queryset=Property.objects.all(),
        write_only=True,
    )

    class Meta:
        model = Reservation
        fields = [
            "id",
            "property_id",
            "property",
            "source",
            "external_uid",
            "guest_name",
            "starts_at",
            "ends_at",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "property", "created_at", "updated_at"]

