from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone as datetime_timezone

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils.dateparse import parse_datetime


PRODUCTION_LIKE_ENVIRONMENTS = frozenset({"staging", "pilot", "prod", "production"})


@dataclass(frozen=True)
class VerificationConfiguration:
    app_env: str
    account_approval_required: bool
    cleaner_verification_required: bool
    phone_verification_required: bool
    allow_pilot_verification_bypass: bool
    bypass_owner: str
    bypass_reason: str
    bypass_start_at: str
    bypass_end_at: str
    genuine_job_intake_paused: bool

    @property
    def uses_requirement_bypass(self) -> bool:
        return not (
            self.account_approval_required and self.cleaner_verification_required
        )

    @property
    def is_production_like(self) -> bool:
        return self.app_env.strip().lower() in PRODUCTION_LIKE_ENVIRONMENTS

    def _parse_aware(self, value: str, *, field_name: str) -> datetime:
        parsed = parse_datetime(value.strip()) if value else None
        if parsed is None:
            raise ImproperlyConfigured(
                f"{field_name} must be a valid timezone-aware date and time."
            )
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ImproperlyConfigured(f"{field_name} must be timezone-aware.")
        return parsed

    def validate(self, *, now: datetime | None = None) -> None:
        if self.allow_pilot_verification_bypass and not self.uses_requirement_bypass:
            raise ImproperlyConfigured(
                "ALLOW_PILOT_VERIFICATION_BYPASS is enabled but unused."
            )

        if not self.uses_requirement_bypass:
            return

        if self.is_production_like and not self.allow_pilot_verification_bypass:
            raise ImproperlyConfigured(
                "ALLOW_PILOT_VERIFICATION_BYPASS must be enabled for a "
                "production-like verification shortcut."
            )

        # Local/test shortcuts intentionally work without pilot metadata when
        # the second guard is off. Turning the guard on opts into the full
        # operator-controlled contract in every environment.
        if not self.allow_pilot_verification_bypass:
            return

        if not self.bypass_owner.strip():
            raise ImproperlyConfigured(
                "PILOT_VERIFICATION_BYPASS_OWNER must identify an owner."
            )
        if not self.bypass_reason.strip():
            raise ImproperlyConfigured(
                "PILOT_VERIFICATION_BYPASS_REASON must contain a reason."
            )
        start_at = self._parse_aware(
            self.bypass_start_at,
            field_name="PILOT_VERIFICATION_BYPASS_START_AT",
        )
        end_at = self._parse_aware(
            self.bypass_end_at,
            field_name="PILOT_VERIFICATION_BYPASS_END_AT",
        )
        if end_at <= start_at:
            raise ImproperlyConfigured(
                "PILOT_VERIFICATION_BYPASS_END_AT must be after the start."
            )
        if not self.genuine_job_intake_paused:
            raise ImproperlyConfigured(
                "PILOT_GENUINE_JOB_INTAKE_PAUSED must be true while a bypass is active."
            )

        current = now or datetime.now(datetime_timezone.utc)
        if not start_at <= current <= end_at:
            raise ImproperlyConfigured(
                "The pilot verification bypass window is not active."
            )


def current_verification_configuration() -> VerificationConfiguration:
    return VerificationConfiguration(
        app_env=settings.APP_ENV,
        account_approval_required=settings.ACCOUNT_APPROVAL_REQUIRED,
        cleaner_verification_required=settings.CLEANER_VERIFICATION_REQUIRED,
        phone_verification_required=settings.PHONE_VERIFICATION_REQUIRED,
        allow_pilot_verification_bypass=settings.ALLOW_PILOT_VERIFICATION_BYPASS,
        bypass_owner=settings.PILOT_VERIFICATION_BYPASS_OWNER,
        bypass_reason=settings.PILOT_VERIFICATION_BYPASS_REASON,
        bypass_start_at=settings.PILOT_VERIFICATION_BYPASS_START_AT,
        bypass_end_at=settings.PILOT_VERIFICATION_BYPASS_END_AT,
        genuine_job_intake_paused=settings.PILOT_GENUINE_JOB_INTAKE_PAUSED,
    )


def validate_runtime_verification_configuration() -> VerificationConfiguration:
    configuration = current_verification_configuration()
    configuration.validate()
    return configuration
