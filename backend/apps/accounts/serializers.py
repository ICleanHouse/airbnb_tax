from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from rest_framework import serializers

from apps.accounts.models import (
    AgencyInvitation,
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    CookieConsent,
    HostProfile,
)


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    is_approved = serializers.BooleanField(read_only=True)
    is_platform_admin = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "preferred_language",
            "role",
            "account_status",
            "is_approved",
            "is_platform_admin",
            "approved_at",
            "email_verified_at",
            "phone_verified_at",
            "password",
        ]
        read_only_fields = [
            "id",
            "is_approved",
            "is_platform_admin",
            "approved_at",
            "email_verified_at",
            "phone_verified_at",
            "account_status",
        ]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()

        if user.is_host:
            HostProfile.objects.get_or_create(user=user)
        elif user.is_cleaner:
            CleanerProfile.objects.get_or_create(user=user)
        elif user.is_agency:
            AgencyProfile.objects.get_or_create(user=user, defaults={"company_name": user.get_full_name() or user.username})

        return user


class SignupSerializer(serializers.Serializer):
    ROLE_CHOICES = [
        (User.Role.HOST, "Property owner"),
        (User.Role.CLEANER, "Cleaner"),
        (User.Role.AGENCY, "Agency"),
    ]

    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone_number = serializers.CharField(max_length=32, allow_blank=True, required=False)
    city = serializers.CharField(max_length=120, allow_blank=True, required=False)
    preferred_language = serializers.ChoiceField(
        choices=User.Language.choices,
        default=User.Language.BULGARIAN,
    )
    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def create(self, validated_data):
        name = validated_data.pop("name").strip()
        city = validated_data.pop("city", "").strip()
        password = validated_data.pop("password")
        email = validated_data.pop("email")

        first_name, _, last_name = name.partition(" ")
        user = User(
            username=email,
            email=email,
            first_name=first_name,
            last_name=last_name,
            account_status=User.AccountStatus.PENDING,
            **validated_data,
        )
        user.set_password(password)
        user.save()

        if user.is_host:
            HostProfile.objects.create(user=user, city=city)
        elif user.is_cleaner:
            CleanerProfile.objects.create(user=user, display_name=name)
        elif user.is_agency:
            AgencyProfile.objects.create(user=user, company_name=name, city=city)

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        password = attrs["password"]
        user = authenticate(
            request=self.context.get("request"),
            username=email,
            password=password,
        )
        if user is None:
            raise serializers.ValidationError("Unable to log in with the provided credentials.")
        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")
        attrs["user"] = user
        return attrs


class HostProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = HostProfile
        fields = ["id", "user", "company_name", "city", "notes", "created_at", "updated_at"]
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class CleanerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    is_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = CleanerProfile
        fields = [
            "id",
            "user",
            "kind",
            "verification_status",
            "display_name",
            "bio",
            "service_areas",
            "sex",
            "profile_image",
            "average_rating",
            "completed_jobs_count",
            "is_verified",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "average_rating",
            "completed_jobs_count",
            "is_verified",
            "created_at",
            "updated_at",
        ]


class AgencyProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    members_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = AgencyProfile
        fields = [
            "id",
            "user",
            "company_name",
            "city",
            "service_areas",
            "description",
            "members_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "members_count", "created_at", "updated_at"]


class AgencyInviteSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=32, required=False, allow_blank=True)
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        phone_number = attrs.get("phone_number", "").strip()
        if not email and not phone_number:
            raise serializers.ValidationError("Provide an email or phone number for the cleaner invitation.")
        attrs["email"] = email
        attrs["phone_number"] = phone_number
        return attrs


class AgencyInvitationSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.company_name", read_only=True)

    class Meta:
        model = AgencyInvitation
        fields = [
            "id",
            "agency",
            "agency_name",
            "email",
            "phone_number",
            "status",
            "cleaner",
            "message",
            "expires_at",
            "accepted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "agency",
            "agency_name",
            "status",
            "cleaner",
            "accepted_at",
            "created_at",
            "updated_at",
        ]


class AgencyMembershipSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.company_name", read_only=True)
    cleaner_email = serializers.EmailField(source="cleaner.email", read_only=True)
    cleaner_name = serializers.SerializerMethodField()

    class Meta:
        model = AgencyMembership
        fields = [
            "id",
            "agency",
            "agency_name",
            "cleaner",
            "cleaner_email",
            "cleaner_name",
            "invited_by",
            "invitation",
            "status",
            "joined_at",
            "revoked_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_cleaner_name(self, obj):
        return obj.cleaner.get_full_name() or obj.cleaner.username


class CookieConsentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CookieConsent
        fields = [
            "id",
            "visitor_id",
            "consent_version",
            "policy_version",
            "essential",
            "analytics",
            "marketing",
            "source",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        visitor_id = attrs.get("visitor_id", "").strip()
        if not visitor_id and not (request and request.user and request.user.is_authenticated):
            raise serializers.ValidationError("visitor_id is required for anonymous cookie consent.")
        attrs["visitor_id"] = visitor_id
        attrs["essential"] = True
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data["user"] = request.user
        if request:
            validated_data["user_agent"] = request.META.get("HTTP_USER_AGENT", "")
            validated_data["ip_address"] = request.META.get("REMOTE_ADDR")
        return super().create(validated_data)
