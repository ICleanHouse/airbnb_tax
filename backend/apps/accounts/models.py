from datetime import timedelta
import hashlib
import secrets
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser, UserManager
from django.core.validators import MaxLengthValidator
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


def default_invitation_expires_at():
    return timezone.now() + timedelta(days=14)


def default_signup_code_expires_at():
    return timezone.now() + timedelta(minutes=10)


def hash_signup_email_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


class PlatformUserManager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", self.model.Role.ADMIN)
        extra_fields.setdefault("account_status", self.model.AccountStatus.APPROVED)
        return super().create_superuser(username, email, password, **extra_fields)

    def genuine_stage1_evidence(self):
        return self.get_queryset().filter(pilot_evidence_exclusion__isnull=True)


class User(AbstractUser):
    class Role(models.TextChoices):
        HOST = "host", "Host"
        CLEANER = "cleaner", "Cleaner"
        AGENCY = "agency", "Agency"
        ADMIN = "admin", "Admin"

    class Language(models.TextChoices):
        BULGARIAN = "bg", "Bulgarian"
        ENGLISH = "en", "English"

    class AccountStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        SUSPENDED = "suspended", "Suspended"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.HOST)
    account_status = models.CharField(
        max_length=20,
        choices=AccountStatus.choices,
        default=AccountStatus.PENDING,
    )
    phone_number = models.CharField(max_length=32, blank=True)
    preferred_language = models.CharField(
        max_length=8,
        choices=Language.choices,
        default=Language.BULGARIAN,
    )
    # Per-user UI preferences (e.g. the Applications dashboard card layout:
    # which summary cards are shown and in what order). Free-form JSON so the
    # frontend can extend it without a migration per tweak.
    dashboard_prefs = models.JSONField(default=dict, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="approved_users",
        null=True,
        blank=True,
    )
    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)

    objects = PlatformUserManager()

    @property
    def is_host(self) -> bool:
        return self.role == self.Role.HOST

    @property
    def is_cleaner(self) -> bool:
        return self.role == self.Role.CLEANER

    @property
    def is_agency(self) -> bool:
        return self.role == self.Role.AGENCY

    @property
    def is_platform_admin(self) -> bool:
        return self.role == self.Role.ADMIN or self.is_staff

    @property
    def is_approved(self) -> bool:
        return self.is_platform_admin or self.account_status == self.AccountStatus.APPROVED

    @property
    def is_email_verified(self) -> bool:
        return self.email_verified_at is not None

    @property
    def is_phone_verified(self) -> bool:
        return self.phone_verified_at is not None

    @property
    def is_contact_verified(self) -> bool:
        return self.is_email_verified and (
            not settings.PHONE_VERIFICATION_REQUIRED or self.is_phone_verified
        )

    @property
    def is_fully_verified(self) -> bool:
        return self.is_email_verified and self.is_phone_verified

    @property
    def is_marketplace_eligible(self) -> bool:
        if self.is_platform_admin:
            return True
        if not self.is_active or self.account_status != self.AccountStatus.APPROVED:
            return False
        if not self.is_cleaner:
            return True
        profile = getattr(self, "cleaner_profile", None)
        return bool(profile and profile.is_verified)

    @property
    def is_public_marketplace_eligible_cleaner(self) -> bool:
        if (
            not self.is_cleaner
            or not self.is_active
            or self.account_status != self.AccountStatus.APPROVED
        ):
            return False
        profile = getattr(self, "cleaner_profile", None)
        return bool(profile and profile.is_verified)

    def save(self, *args, **kwargs):
        if self.role == self.Role.ADMIN or self.is_superuser:
            self.role = self.Role.ADMIN
            self.account_status = self.AccountStatus.APPROVED
            self.is_staff = True
            self.is_superuser = True
            if self.approved_at is None:
                self.approved_at = timezone.now()

            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = set(update_fields) | {
                    "role",
                    "account_status",
                    "is_staff",
                    "is_superuser",
                    "approved_at",
                }

        super().save(*args, **kwargs)


class HostProfile(TimeStampedModel):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="host_profile",
    )
    company_name = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.company_name or self.user.get_username()


class PilotEvidenceExclusion(models.Model):
    class ReasonCategory(models.TextChoices):
        VERIFICATION_REQUIREMENT_BYPASS = (
            "verification_requirement_bypass",
            "Verification requirement bypass",
        )

    user = models.OneToOneField(
        User,
        on_delete=models.PROTECT,
        related_name="pilot_evidence_exclusion",
    )
    excluded_at = models.DateTimeField(default=timezone.now, editable=False)
    reason_category = models.CharField(
        max_length=64,
        choices=ReasonCategory.choices,
        default=ReasonCategory.VERIFICATION_REQUIREMENT_BYPASS,
        editable=False,
    )
    account_approval_required = models.BooleanField(editable=False)
    cleaner_verification_required = models.BooleanField(editable=False)
    phone_verification_required = models.BooleanField(editable=False)

    class Meta:
        ordering = ["-excluded_at"]

    def __str__(self) -> str:
        return f"Pilot evidence exclusion for user {self.user_id}"


class CleanerProfile(TimeStampedModel):
    class Kind(models.TextChoices):
        INDIVIDUAL = "individual", "Individual"
        AGENCY = "agency", "Agency"

    class VerificationStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"
        SUSPENDED = "suspended", "Suspended"

    class Sex(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        PREFER_NOT_TO_SAY = "prefer_not_to_say", "Prefer not to say"

    class Education(models.TextChoices):
        NONE = "none", "No education"
        PRIMARY = "primary", "Primary education"
        HIGH_SCHOOL = "high_school", "High school"
        HIGHER = "higher", "Higher education"

    class ExperienceLevel(models.TextChoices):
        NONE = "none", "No experience"
        ONE_YEAR = "1_year", "1 year"
        TWO_YEARS = "2_years", "2 years"
        THREE_YEARS = "3_years", "3 years"
        FOUR_YEARS = "4_years", "4 years"
        FIVE_YEARS = "5_years", "5 years"
        MORE_THAN_FIVE_YEARS = "more_than_5_years", "More than 5 years"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="cleaner_profile",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.INDIVIDUAL)
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING,
    )
    display_name = models.CharField(max_length=255, blank=True)
    bio = models.CharField(max_length=1500, blank=True, validators=[MaxLengthValidator(1500)])
    city = models.CharField(max_length=120, blank=True)
    service_areas = models.JSONField(default=list, blank=True)
    sex = models.CharField(
        max_length=32,
        choices=Sex.choices,
        default=Sex.PREFER_NOT_TO_SAY,
    )
    native_language = models.CharField(max_length=80, blank=True)
    other_languages = models.JSONField(default=list, blank=True)
    personal_preferences = models.JSONField(default=list, blank=True)
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    education = models.CharField(max_length=32, choices=Education.choices, blank=True)
    experience_level = models.CharField(max_length=32, choices=ExperienceLevel.choices, blank=True)
    has_driving_license = models.BooleanField(null=True, blank=True)
    has_own_car = models.BooleanField(null=True, blank=True)
    smoker = models.BooleanField(null=True, blank=True)
    profile_image = models.TextField(blank=True)
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    completed_jobs_count = models.PositiveIntegerField(default=0)

    @property
    def is_verified(self) -> bool:
        return self.verification_status == self.VerificationStatus.VERIFIED

    @classmethod
    def public_marketplace_eligible_filter(cls) -> dict:
        return {
            "verification_status": cls.VerificationStatus.VERIFIED,
            "user__account_status": User.AccountStatus.APPROVED,
            "user__is_active": True,
        }

    def __str__(self) -> str:
        return self.display_name or self.user.get_username()


class AgencyProfile(TimeStampedModel):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="agency_profile",
    )
    company_name = models.CharField(max_length=255)
    city = models.CharField(max_length=120, blank=True)
    service_areas = models.JSONField(default=list, blank=True)
    description = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.company_name or self.user.get_username()


class AgencyInvitation(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    agency = models.ForeignKey(
        AgencyProfile,
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="sent_agency_invitations",
        null=True,
        blank=True,
    )
    cleaner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="accepted_agency_invitations",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    token = models.CharField(max_length=64, unique=True)
    message = models.TextField(blank=True)
    expires_at = models.DateTimeField(default=default_invitation_expires_at)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(email="") | ~models.Q(phone_number=""),
                name="agency_invitation_has_contact",
            )
        ]

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    def __str__(self) -> str:
        contact = self.email or self.phone_number
        return f"{contact} invited to {self.agency}"


class AgencyMembership(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        REVOKED = "revoked", "Revoked"

    agency = models.ForeignKey(
        AgencyProfile,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    cleaner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="agency_memberships",
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_agency_memberships",
        null=True,
        blank=True,
    )
    invitation = models.ForeignKey(
        AgencyInvitation,
        on_delete=models.SET_NULL,
        related_name="memberships",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    joined_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["agency__company_name", "cleaner__username"]
        constraints = [
            models.UniqueConstraint(
                fields=["agency", "cleaner"],
                name="unique_cleaner_per_agency",
            )
        ]

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE

    def __str__(self) -> str:
        return f"{self.cleaner} at {self.agency}"


class SignupEmailVerification(TimeStampedModel):
    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=64)
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    expires_at = models.DateTimeField(default=default_signup_code_expires_at)
    verified_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def create_for_email(cls, email: str) -> tuple["SignupEmailVerification", str]:
        code = f"{secrets.randbelow(1_000_000):06d}"
        verification = cls.objects.create(
            email=email.strip().lower(),
            code_hash=hash_signup_email_code(code),
        )
        return verification, code

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @property
    def is_verified(self) -> bool:
        return self.verified_at is not None

    def __str__(self) -> str:
        return f"Signup email verification for {self.email}"


class CookieConsent(TimeStampedModel):
    class Source(models.TextChoices):
        BANNER = "banner", "Banner"
        ACCOUNT = "account", "Account"
        API = "api", "API"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="cookie_consents",
        null=True,
        blank=True,
    )
    visitor_id = models.CharField(max_length=80, blank=True, db_index=True)
    consent_version = models.CharField(max_length=40, default="v1")
    policy_version = models.CharField(max_length=40, default="v1")
    essential = models.BooleanField(default=True)
    analytics = models.BooleanField(default=False)
    marketing = models.BooleanField(default=False)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.BANNER)
    user_agent = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        subject = self.user_id or self.visitor_id
        return f"Cookie consent {subject} ({self.policy_version})"
