from rest_framework import serializers

from apps.properties.models import ExternalCalendarConnection, Property, PropertyImage, Reservation


class PropertyImageSerializer(serializers.ModelSerializer):
    property_id = serializers.PrimaryKeyRelatedField(
        source="property",
        queryset=Property.objects.all(),
        write_only=True,
    )

    class Meta:
        model = PropertyImage
        fields = ["id", "property_id", "image", "caption", "order", "created_at"]
        read_only_fields = ["id", "created_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if instance.image:
            ret["image"] = instance.image.url
        return ret


class PropertySerializer(serializers.ModelSerializer):
    host = serializers.PrimaryKeyRelatedField(read_only=True)
    images = PropertyImageSerializer(many=True, read_only=True)

    class Meta:
        model = Property
        fields = [
            "id",
            "host",
            "name",
            "address",
            "city",
            "neighborhood",
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

