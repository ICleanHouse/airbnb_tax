from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.marketplace.models import (
    Assignment,
    CleanerApplication,
    CleaningBatch,
    CleaningJob,
    FavouriteCleaner,
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
    title = serializers.CharField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    currency = serializers.CharField()
    price = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, allow_null=True)
    property_name = serializers.CharField()
    property_city = serializers.CharField(allow_blank=True)
    property_neighborhood = serializers.CharField(allow_blank=True)
    host_name = serializers.CharField()
    job_status = serializers.CharField()
    application_status = serializers.CharField(required=False, allow_blank=True)
    application_origin = serializers.CharField(required=False, allow_blank=True)
    host_completed_at = serializers.DateTimeField(required=False, allow_null=True)
    cleaner_completed_at = serializers.DateTimeField(required=False, allow_null=True)
    completed_at = serializers.DateTimeField(required=False, allow_null=True)
    can_apply = serializers.BooleanField()
    can_complete = serializers.BooleanField()


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
        return obj.host.get_full_name() or obj.host.get_username()

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
            url = profile.profile_image.url
            return request.build_absolute_uri(url) if request else url
        return None

    def get_service_areas(self, obj):
        profile = self._profile(obj)
        return profile.service_areas if profile else []
