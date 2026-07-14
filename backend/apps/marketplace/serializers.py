from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.marketplace.models import (
    Assignment,
    CleanerApplication,
    CleaningBatch,
    CleaningJob,
    FavouriteCleaner,
)
from apps.marketplace.selectors import (
    canonical_location_values,
    safe_host_display_name,
    user_has_operational_job_access,
)
from apps.properties.models import Property


User = get_user_model()


class CleaningBatchSerializer(serializers.ModelSerializer):
    property_id = serializers.PrimaryKeyRelatedField(
        source="property",
        queryset=Property.objects.all(),
        write_only=True,
    )
    host = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = CleaningBatch
        fields = [
            "id",
            "property_id",
            "property",
            "host",
            "title",
            "month",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "property", "host", "status", "created_at", "updated_at"]


class AssignmentSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source="job.title", read_only=True)
    job_scheduled_start = serializers.DateTimeField(source="job.scheduled_start", read_only=True)
    job_scheduled_end = serializers.DateTimeField(source="job.scheduled_end", read_only=True)
    job_status = serializers.CharField(source="job.status", read_only=True)
    job_property_name = serializers.CharField(source="job.property.name", read_only=True)
    job_property_city = serializers.CharField(source="job.property.city", read_only=True)
    job_property_neighborhood = serializers.CharField(source="job.property.neighborhood", read_only=True)
    cleaner_name = serializers.SerializerMethodField()
    cleaner_email = serializers.EmailField(source="cleaner.email", read_only=True)
    cleaner_profile_image = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "job",
            "job_title",
            "job_scheduled_start",
            "job_scheduled_end",
            "job_status",
            "job_property_name",
            "job_property_city",
            "job_property_neighborhood",
            "cleaner",
            "cleaner_name",
            "cleaner_email",
            "cleaner_profile_image",
            "assigned_member",
            "application",
            "agreed_price",
            "assigned_at",
            "cancelled_at",
            "host_completed_at",
            "cleaner_completed_at",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_cleaner_name(self, obj):
        return obj.cleaner.get_full_name() or obj.cleaner.get_username()

    def get_cleaner_profile_image(self, obj):
        profile = getattr(obj.cleaner, "cleaner_profile", None)
        return (getattr(profile, "profile_image", "") or "") or None


class AssignMemberSerializer(serializers.Serializer):
    assigned_member_id = serializers.IntegerField()


class MarketplaceCalendarItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    item_type = serializers.ChoiceField(choices=["open_job", "application", "assignment", "offer"])
    job = serializers.IntegerField()
    application = serializers.IntegerField(required=False, allow_null=True)
    assignment = serializers.IntegerField(required=False, allow_null=True)
    access_tier = serializers.ChoiceField(
        choices=["evaluator", "assigned", "history", "owner", "admin"]
    )
    city_slug = serializers.CharField(allow_blank=True)
    city_name_bg = serializers.CharField(allow_blank=True)
    city_name_en = serializers.CharField(allow_blank=True)
    zone_id = serializers.CharField(required=False, allow_null=True)
    zone_name_bg = serializers.CharField(required=False, allow_null=True)
    zone_name_en = serializers.CharField(required=False, allow_null=True)
    scheduled_start = serializers.DateTimeField()
    scheduled_end = serializers.DateTimeField()
    currency = serializers.CharField()
    proposed_price = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, allow_null=True)
    bedrooms = serializers.IntegerField(required=False, allow_null=True)
    square_metres = serializers.DecimalField(max_digits=7, decimal_places=2, required=False, allow_null=True)
    status = serializers.CharField()
    title = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    property_name = serializers.CharField(required=False, allow_blank=True)
    property_address = serializers.CharField(required=False, allow_blank=True)
    property_image = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    host = serializers.IntegerField(required=False)
    host_name = serializers.CharField(required=False, allow_blank=True)
    agreed_price = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, allow_null=True)
    cleaning_instructions = serializers.CharField(required=False, allow_blank=True)
    application_status = serializers.CharField(required=False, allow_blank=True)
    application_origin = serializers.CharField(required=False, allow_blank=True)
    host_completed_at = serializers.DateTimeField(required=False, allow_null=True)
    cleaner_completed_at = serializers.DateTimeField(required=False, allow_null=True)
    completed_at = serializers.DateTimeField(required=False, allow_null=True)
    can_apply = serializers.BooleanField()
    can_complete = serializers.BooleanField()

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        return {key: value for key, value in representation.items() if key in instance}


class CleaningJobSerializer(serializers.ModelSerializer):
    property_id = serializers.PrimaryKeyRelatedField(
        source="property",
        queryset=Property.objects.all(),
        write_only=True,
    )
    batch_id = serializers.PrimaryKeyRelatedField(
        source="batch",
        queryset=CleaningBatch.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    host = serializers.PrimaryKeyRelatedField(read_only=True)
    host_name = serializers.SerializerMethodField()
    property_name = serializers.CharField(source="property.name", read_only=True)
    property_city = serializers.CharField(source="property.city", read_only=True)
    property_neighborhood = serializers.CharField(source="property.neighborhood", read_only=True)
    property_address = serializers.CharField(source="property.address", read_only=True)
    assignment = AssignmentSerializer(read_only=True)

    class Meta:
        model = CleaningJob
        fields = [
            "id",
            "property_id",
            "property",
            "property_name",
            "property_city",
            "property_neighborhood",
            "property_address",
            "host",
            "host_name",
            "batch_id",
            "batch",
            "title",
            "description",
            "scheduled_start",
            "scheduled_end",
            "currency",
            "proposed_price",
            "agreed_price",
            "status",
            "cleaning_instructions",
            "assignment",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "property",
            "host",
            "batch",
            "agreed_price",
            "status",
            "assignment",
            "created_at",
            "updated_at",
        ]
        validators = []

    def get_host_name(self, obj):
        return safe_host_display_name(obj.host)

    def validate(self, attrs):
        property_obj = attrs.get("property", getattr(self.instance, "property", None))
        scheduled_start = attrs.get("scheduled_start", getattr(self.instance, "scheduled_start", None))
        scheduled_end = attrs.get("scheduled_end", getattr(self.instance, "scheduled_end", None))
        if scheduled_start and scheduled_end and scheduled_end <= scheduled_start:
            raise serializers.ValidationError("scheduled_end must be after scheduled_start.")
        if property_obj and scheduled_start and scheduled_end:
            duplicate = CleaningJob.objects.filter(
                property=property_obj,
                scheduled_start=scheduled_start,
                scheduled_end=scheduled_end,
            )
            if self.instance is not None:
                duplicate = duplicate.exclude(id=self.instance.id)
            if duplicate.exists():
                raise serializers.ValidationError({
                    "scheduled_start": "This property already has a job scheduled for that exact time.",
                })
        return attrs


class PublicDemandDistrictSerializer(serializers.Serializer):
    zone_id = serializers.CharField()
    zone_name_bg = serializers.CharField()
    zone_name_en = serializers.CharField(allow_blank=True)
    open_job_count = serializers.IntegerField(min_value=0)


class PublicDemandCitySerializer(serializers.Serializer):
    city_slug = serializers.CharField()
    city_name_bg = serializers.CharField()
    city_name_en = serializers.CharField()
    open_job_count = serializers.IntegerField(min_value=0)
    zones = PublicDemandDistrictSerializer(many=True)


class PublicDemandSerializer(serializers.Serializer):
    cities = PublicDemandCitySerializer(many=True)


class EvaluatorCleaningJobSerializer(serializers.ModelSerializer):
    access_tier = serializers.SerializerMethodField()
    city_slug = serializers.SerializerMethodField()
    city_name_bg = serializers.SerializerMethodField()
    city_name_en = serializers.SerializerMethodField()
    zone_id = serializers.SerializerMethodField()
    zone_name_bg = serializers.SerializerMethodField()
    zone_name_en = serializers.SerializerMethodField()
    bedrooms = serializers.IntegerField(source="property.bedrooms", allow_null=True, read_only=True)
    square_metres = serializers.DecimalField(
        source="property.square_meters",
        max_digits=7,
        decimal_places=2,
        allow_null=True,
        read_only=True,
    )
    can_apply = serializers.SerializerMethodField()

    class Meta:
        model = CleaningJob
        fields = [
            "id",
            "access_tier",
            "city_slug",
            "city_name_bg",
            "city_name_en",
            "zone_id",
            "zone_name_bg",
            "zone_name_en",
            "scheduled_start",
            "scheduled_end",
            "currency",
            "proposed_price",
            "bedrooms",
            "square_metres",
            "status",
            "can_apply",
        ]
        read_only_fields = fields

    def get_access_tier(self, obj):
        return "evaluator"

    def _location(self, obj):
        return canonical_location_values(obj)

    def get_city_slug(self, obj):
        return self._location(obj)["city_slug"]

    def get_city_name_bg(self, obj):
        return self._location(obj)["city_name_bg"]

    def get_city_name_en(self, obj):
        return self._location(obj)["city_name_en"]

    def get_zone_id(self, obj):
        return self._location(obj)["zone_id"]

    def get_zone_name_bg(self, obj):
        return self._location(obj)["zone_name_bg"]

    def get_zone_name_en(self, obj):
        return self._location(obj)["zone_name_en"]

    def get_can_apply(self, obj):
        if self.context.get("force_can_apply") is not None:
            return bool(self.context["force_can_apply"])
        return not bool(getattr(obj, "has_user_application", True))


class AssignedWorkerAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = [
            "id",
            "job",
            "cleaner",
            "assigned_member",
            "application",
            "agreed_price",
            "assigned_at",
            "cancelled_at",
            "host_completed_at",
            "cleaner_completed_at",
            "completed_at",
        ]
        read_only_fields = fields


class AssignedWorkerCleaningJobSerializer(serializers.ModelSerializer):
    access_tier = serializers.SerializerMethodField()
    property_name = serializers.CharField(source="property.name", read_only=True)
    property_address = serializers.CharField(source="property.address", read_only=True)
    property_image = serializers.SerializerMethodField()
    host = serializers.PrimaryKeyRelatedField(read_only=True)
    host_name = serializers.SerializerMethodField()
    city_slug = serializers.SerializerMethodField()
    city_name_bg = serializers.SerializerMethodField()
    city_name_en = serializers.SerializerMethodField()
    zone_id = serializers.SerializerMethodField()
    zone_name_bg = serializers.SerializerMethodField()
    zone_name_en = serializers.SerializerMethodField()
    bedrooms = serializers.IntegerField(source="property.bedrooms", allow_null=True, read_only=True)
    square_metres = serializers.DecimalField(
        source="property.square_meters",
        max_digits=7,
        decimal_places=2,
        allow_null=True,
        read_only=True,
    )
    assignment = AssignedWorkerAssignmentSerializer(read_only=True)
    can_apply = serializers.SerializerMethodField()

    class Meta:
        model = CleaningJob
        fields = [
            "id",
            "access_tier",
            "property_name",
            "property_address",
            "property_image",
            "host",
            "host_name",
            "city_slug",
            "city_name_bg",
            "city_name_en",
            "zone_id",
            "zone_name_bg",
            "zone_name_en",
            "scheduled_start",
            "scheduled_end",
            "currency",
            "proposed_price",
            "agreed_price",
            "bedrooms",
            "square_metres",
            "status",
            "cleaning_instructions",
            "assignment",
            "can_apply",
        ]
        read_only_fields = fields

    def get_access_tier(self, obj):
        if obj.status == CleaningJob.Status.ASSIGNED:
            return "assigned"
        return "history"

    def get_host_name(self, obj):
        return safe_host_display_name(obj.host)

    def get_property_image(self, obj):
        if obj.status != CleaningJob.Status.ASSIGNED:
            return None
        first_image = min(
            obj.property.images.all(),
            key=lambda image: (image.order, image.id),
            default=None,
        )
        if first_image is None:
            return None
        return f"/api/properties/images/{first_image.id}/content/"

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if instance.status == CleaningJob.Status.ASSIGNED:
            return representation
        history_fields = set(EvaluatorCleaningJobSerializer.Meta.fields) | {
            "host",
            "host_name",
            "agreed_price",
            "assignment",
        }
        return {
            key: value
            for key, value in representation.items()
            if key in history_fields
        }

    def _location(self, obj):
        return canonical_location_values(obj)

    def get_city_slug(self, obj):
        return self._location(obj)["city_slug"]

    def get_city_name_bg(self, obj):
        return self._location(obj)["city_name_bg"]

    def get_city_name_en(self, obj):
        return self._location(obj)["city_name_en"]

    def get_zone_id(self, obj):
        return self._location(obj)["zone_id"]

    def get_zone_name_bg(self, obj):
        return self._location(obj)["zone_name_bg"]

    def get_zone_name_en(self, obj):
        return self._location(obj)["zone_name_en"]

    def get_can_apply(self, obj):
        return False


class WorkerCleaningJobSerializer(serializers.BaseSerializer):
    """Dispatch per object without inheriting the broad host/admin serializer."""

    def to_representation(self, instance):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        serializer_class = (
            AssignedWorkerCleaningJobSerializer
            if user is not None and user_has_operational_job_access(user, instance)
            else EvaluatorCleaningJobSerializer
        )
        return serializer_class(instance, context=self.context).data


class CleanerApplicationSerializer(serializers.ModelSerializer):
    job_id = serializers.PrimaryKeyRelatedField(
        source="job",
        queryset=CleaningJob.objects.all(),
        write_only=True,
    )
    cleaner = serializers.PrimaryKeyRelatedField(read_only=True)
    cleaner_name = serializers.SerializerMethodField()
    cleaner_email = serializers.EmailField(source="cleaner.email", read_only=True)
    cleaner_profile_id = serializers.SerializerMethodField()
    job_title = serializers.CharField(source="job.title", read_only=True)
    job_scheduled_start = serializers.DateTimeField(source="job.scheduled_start", read_only=True)
    job_scheduled_end = serializers.DateTimeField(source="job.scheduled_end", read_only=True)
    job_status = serializers.CharField(source="job.status", read_only=True)
    job_property_name = serializers.CharField(source="job.property.name", read_only=True)
    job_property_city = serializers.CharField(source="job.property.city", read_only=True)
    job_property_neighborhood = serializers.CharField(source="job.property.neighborhood", read_only=True)
    job_proposed_price = serializers.DecimalField(
        source="job.proposed_price", max_digits=8, decimal_places=2, read_only=True, allow_null=True
    )

    class Meta:
        model = CleanerApplication
        fields = [
            "id",
            "job_id",
            "job",
            "job_title",
            "job_scheduled_start",
            "job_scheduled_end",
            "job_status",
            "job_property_name",
            "job_property_city",
            "job_property_neighborhood",
            "job_proposed_price",
            "cleaner",
            "cleaner_name",
            "cleaner_email",
            "cleaner_profile_id",
            "status",
            "origin",
            "proposed_price",
            "message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "job",
            "cleaner",
            "cleaner_name",
            "cleaner_email",
            "status",
            "origin",
            "created_at",
            "updated_at",
        ]

    def get_cleaner_name(self, obj):
        return obj.cleaner.get_full_name() or obj.cleaner.get_username()

    def get_cleaner_profile_id(self, obj):
        profile = getattr(obj.cleaner, "cleaner_profile", None)
        return profile.id if profile else None


class CleanerApplicationCreateSerializer(serializers.Serializer):
    job_id = serializers.IntegerField(min_value=1)
    proposed_price = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    message = serializers.CharField(required=False, allow_blank=True, default="")


class WorkerCleanerApplicationSerializer(serializers.ModelSerializer):
    job_summary = EvaluatorCleaningJobSerializer(source="job", read_only=True)

    class Meta:
        model = CleanerApplication
        fields = [
            "id",
            "job",
            "job_summary",
            "status",
            "origin",
            "proposed_price",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class OfferJobSerializer(serializers.Serializer):
    job_id = serializers.PrimaryKeyRelatedField(source="job", queryset=CleaningJob.objects.all())
    cleaner_id = serializers.PrimaryKeyRelatedField(source="cleaner", queryset=User.objects.all())
    proposed_price = serializers.DecimalField(
        max_digits=8, decimal_places=2, required=False, allow_null=True
    )
    message = serializers.CharField(required=False, allow_blank=True, default="")


class OfferToCleanerSerializer(serializers.Serializer):
    """Input for offering a job to a cleaner by property + time slot.

    The job is found-or-created server-side for the exact (property, start, end)
    slot, so the caller never has to create the job first and risk colliding with
    the unique-slot constraint on a re-offer.
    """

    property_id = serializers.PrimaryKeyRelatedField(
        source="property", queryset=Property.objects.all()
    )
    cleaner_id = serializers.PrimaryKeyRelatedField(source="cleaner", queryset=User.objects.all())
    scheduled_start = serializers.DateTimeField()
    scheduled_end = serializers.DateTimeField()
    title = serializers.CharField(required=False, allow_blank=True, default="")
    proposed_price = serializers.DecimalField(
        max_digits=8, decimal_places=2, required=False, allow_null=True
    )
    message = serializers.CharField(required=False, allow_blank=True, default="")


class FavouriteCleanerSerializer(serializers.ModelSerializer):
    cleaner_id = serializers.PrimaryKeyRelatedField(source="cleaner", queryset=User.objects.all())
    cleaner_name = serializers.SerializerMethodField()
    cleaner_profile_id = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    completed_jobs_count = serializers.SerializerMethodField()
    profile_image = serializers.SerializerMethodField()
    service_areas = serializers.SerializerMethodField()

    class Meta:
        model = FavouriteCleaner
        fields = [
            "id",
            "cleaner_id",
            "cleaner",
            "cleaner_name",
            "cleaner_profile_id",
            "average_rating",
            "completed_jobs_count",
            "profile_image",
            "service_areas",
            "created_at",
        ]
        read_only_fields = ["id", "cleaner", "created_at"]

    def _profile(self, obj):
        return getattr(obj.cleaner, "cleaner_profile", None)

    def get_cleaner_name(self, obj):
        return obj.cleaner.get_full_name() or obj.cleaner.get_username()

    def get_cleaner_profile_id(self, obj):
        profile = self._profile(obj)
        return profile.id if profile else None

    def get_average_rating(self, obj):
        profile = self._profile(obj)
        return float(profile.average_rating) if profile else None

    def get_completed_jobs_count(self, obj):
        profile = self._profile(obj)
        return profile.completed_jobs_count if profile else 0

    def get_profile_image(self, obj):
        profile = self._profile(obj)
        if profile and profile.profile_image:
            request = self.context.get("request")
            image = profile.profile_image
            url = getattr(image, "url", None) or str(image)
            if request and not url.startswith(("http://", "https://", "data:")):
                return request.build_absolute_uri(url)
            return url
        return None

    def get_service_areas(self, obj):
        profile = self._profile(obj)
        return profile.service_areas if profile else []
