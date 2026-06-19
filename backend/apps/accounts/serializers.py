from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from rest_framework import serializers

from apps.accounts.models import (
    AgencyInvitation,
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    CookieConsent,
    HostProfile,
    SignupEmailVerification,
    hash_signup_email_code,
)


User = get_user_model()

def age_from_birth_date(birth_date):
    today = timezone.localdate()
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return years


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

    @transaction.atomic
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

    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)
    email_verification_token = serializers.UUIDField(write_only=True)
    city = serializers.CharField(max_length=120, required=False, allow_blank=True)
    service_areas = serializers.ListField(
        child=serializers.CharField(max_length=160),
        required=False,
        allow_empty=True,
    )
    birth_date = serializers.DateField(required=False)
    sex = serializers.ChoiceField(choices=CleanerProfile.Sex.choices, required=False)
    bio = serializers.CharField(max_length=1500, required=False, allow_blank=True, trim_whitespace=True)
    native_language = serializers.CharField(max_length=80, required=False, allow_blank=True)
    education = serializers.ChoiceField(choices=CleanerProfile.Education.choices, required=False, allow_blank=True)
    experience_level = serializers.ChoiceField(choices=CleanerProfile.ExperienceLevel.choices, required=False, allow_blank=True)
    has_driving_license = serializers.BooleanField(required=False)
    has_own_car = serializers.BooleanField(required=False)
    smoker = serializers.BooleanField(required=False, allow_null=True)
    profile_image = serializers.CharField(required=False, allow_blank=True)
    company_name = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate(self, attrs):
        password = attrs.get("password", "")
        password_confirm = attrs.get("password_confirm", "")

        if password != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})

        if len(password) < 8:
            raise serializers.ValidationError({"password": "Password must be at least 8 characters long."})
        if not any(char.isalpha() for char in password):
            raise serializers.ValidationError({"password": "Password must include at least one letter."})
        if not any(char.isdigit() for char in password):
            raise serializers.ValidationError({"password": "Password must include at least one number."})
        if not any(not char.isalnum() for char in password):
            raise serializers.ValidationError({"password": "Password must include at least one special symbol."})

        email = attrs.get("email")
        token = attrs.get("email_verification_token")
        verification = (
            SignupEmailVerification.objects.filter(
                email__iexact=email,
                token=token,
                verified_at__isnull=False,
            )
            .order_by("-verified_at")
            .first()
        )
        if verification is None:
            raise serializers.ValidationError({"email_verification_token": "Confirm your email before creating the account."})
        attrs["email_verification"] = verification

        if attrs.get("role") == User.Role.CLEANER:
            birth_date = attrs.get("birth_date")
            if birth_date is None:
                raise serializers.ValidationError({"birth_date": "Birth date is required."})
            if age_from_birth_date(birth_date) < 18:
                raise serializers.ValidationError({"birth_date": "You must be at least 18 years old to sign up as a cleaner."})
            if not attrs.get("sex"):
                raise serializers.ValidationError({"sex": "Sex is required."})
            if not attrs.get("native_language", "").strip():
                raise serializers.ValidationError({"native_language": "Native language is required."})

        return attrs

    def create(self, validated_data):
        first_name = validated_data.pop("first_name").strip()
        last_name = validated_data.pop("last_name").strip()
        password = validated_data.pop("password")
        validated_data.pop("password_confirm", None)
        validated_data.pop("email_verification_token", None)
        validated_data.pop("email_verification", None)
        city = validated_data.pop("city", "").strip()
        service_areas = validated_data.pop("service_areas", [])
        birth_date = validated_data.pop("birth_date", None)
        age = age_from_birth_date(birth_date) if birth_date else None
        sex = validated_data.pop("sex", CleanerProfile.Sex.PREFER_NOT_TO_SAY)
        bio = validated_data.pop("bio", "")
        native_language = validated_data.pop("native_language", "").strip()
        education = validated_data.pop("education", "")
        experience_level = validated_data.pop("experience_level", "")
        has_driving_license = validated_data.pop("has_driving_license", None)
        has_own_car = validated_data.pop("has_own_car", None)
        smoker = validated_data.pop("smoker", None)
        profile_image = validated_data.pop("profile_image", "")
        company_name = validated_data.pop("company_name", "").strip()
        email = validated_data.pop("email")

        user = User(
            username=email,
            email=email,
            first_name=first_name,
            last_name=last_name,
            account_status=User.AccountStatus.APPROVED,
            email_verified_at=timezone.now(),
            **validated_data,
        )
        user.set_password(password)
        user.save()

        if user.is_host:
            HostProfile.objects.create(user=user, city=city, company_name=company_name)
        elif user.is_cleaner:
            display_name = f"{first_name} {last_name}".strip()
            CleanerProfile.objects.create(
                user=user,
                display_name=display_name,
                city=city,
                service_areas=service_areas,
                age=age,
                birth_date=birth_date,
                sex=sex,
                bio=bio,
                native_language=native_language,
                education=education,
                experience_level=experience_level,
                has_driving_license=has_driving_license,
                has_own_car=has_own_car,
                smoker=smoker,
                profile_image=profile_image,
                verification_status=CleanerProfile.VerificationStatus.VERIFIED,
            )
        elif user.is_agency:
            agency_name = company_name or f"{first_name} {last_name}".strip()
            AgencyProfile.objects.create(user=user, company_name=agency_name, city=city, service_areas=service_areas)

        return user


class SignupEmailCodeRequestSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField()

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email


class SignupEmailCodeVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.RegexField(regex=r"^\d{6}$", error_messages={"invalid": "Enter the 6-digit code."})

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        code = attrs["code"]
        verification = SignupEmailVerification.objects.filter(email__iexact=email).order_by("-created_at").first()

        if verification is None:
            raise serializers.ValidationError({"code": "Request a new confirmation code."})
        if verification.is_verified:
            attrs["verification"] = verification
            attrs["email"] = email
            return attrs
        if verification.is_expired:
            raise serializers.ValidationError({"code": "This code has expired. Request a new one."})
        if verification.attempts >= 5:
            raise serializers.ValidationError({"code": "Too many attempts. Request a new code."})

        verification.attempts += 1
        verification.save(update_fields=["attempts", "updated_at"])

        if not constant_time_compare(verification.code_hash, hash_signup_email_code(code)):
            raise serializers.ValidationError({"code": "The confirmation code is incorrect."})

        verification.verified_at = timezone.now()
        verification.save(update_fields=["verified_at", "updated_at"])
        attrs["verification"] = verification
        attrs["email"] = email
        return attrs


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
            "city",
            "service_areas",
            "sex",
            "native_language",
            "other_languages",
            "personal_preferences",
            "age",
            "birth_date",
            "education",
            "experience_level",
            "has_driving_license",
            "has_own_car",
            "smoker",
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

    def update(self, instance, validated_data):
        if "birth_date" in validated_data:
            birth_date = validated_data["birth_date"]
            validated_data["age"] = age_from_birth_date(birth_date) if birth_date else None
        return super().update(instance, validated_data)


class PublicCleanerSerializer(serializers.ModelSerializer):
    """Safe, browsable cleaner card — no PII (no email/phone/birth_date)."""

    user_id = serializers.IntegerField(source="user.id", read_only=True)
    is_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = CleanerProfile
        fields = [
            "id",
            "user_id",
            "kind",
            "display_name",
            "bio",
            "city",
            "service_areas",
            "native_language",
            "other_languages",
            "personal_preferences",
            "experience_level",
            "has_driving_license",
            "has_own_car",
            "profile_image",
            "average_rating",
            "completed_jobs_count",
            "is_verified",
        ]
        read_only_fields = fields


class PublicCleanerDetailSerializer(PublicCleanerSerializer):
    """Full public profile + the cleaner's received reviews."""

    reviews = serializers.SerializerMethodField()

    class Meta(PublicCleanerSerializer.Meta):
        fields = PublicCleanerSerializer.Meta.fields + ["reviews"]
        read_only_fields = fields

    def get_reviews(self, obj):
        from apps.feedback.serializers import ReviewSerializer
        from apps.feedback.services import revealed_received_reviews

        # Only reviews revealed under the double-blind rule (counterpart submitted,
        # or the review window has closed) are shown publicly.
        reviews = (
            revealed_received_reviews(obj.user)
            .select_related("reviewer", "job")
            .order_by("-created_at")
        )
        return ReviewSerializer(reviews, many=True, context=self.context).data


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
