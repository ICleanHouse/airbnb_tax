from datetime import datetime, timedelta, timezone as dt_timezone

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.verification import VerificationConfiguration


class VerificationConfigurationTests(SimpleTestCase):
    def build(self, **overrides):
        now = datetime(2026, 7, 21, 9, 0, tzinfo=dt_timezone.utc)
        values = {
            "app_env": "local",
            "account_approval_required": True,
            "cleaner_verification_required": True,
            "phone_verification_required": False,
            "allow_pilot_verification_bypass": False,
            "bypass_owner": "",
            "bypass_reason": "",
            "bypass_start_at": "",
            "bypass_end_at": "",
            "genuine_job_intake_paused": False,
        }
        values.update(overrides)
        return VerificationConfiguration(**values), now

    def test_safe_defaults_are_valid(self):
        config, now = self.build()

        config.validate(now=now)

        self.assertFalse(config.uses_requirement_bypass)

    def test_all_truth_table_rows_are_valid_in_local_without_guard(self):
        for account_required in (True, False):
            for cleaner_required in (True, False):
                for phone_required in (True, False):
                    with self.subTest(
                        account=account_required,
                        cleaner=cleaner_required,
                        phone=phone_required,
                    ):
                        config, now = self.build(
                            account_approval_required=account_required,
                            cleaner_verification_required=cleaner_required,
                            phone_verification_required=phone_required,
                        )
                        config.validate(now=now)

    def test_unused_bypass_guard_is_rejected(self):
        config, now = self.build(allow_pilot_verification_bypass=True)

        with self.assertRaisesMessage(ImproperlyConfigured, "unused"):
            config.validate(now=now)

    def test_production_like_shortcut_requires_guard(self):
        for app_env in ("staging", "pilot", "prod", "production"):
            with self.subTest(app_env=app_env):
                config, now = self.build(
                    app_env=app_env,
                    account_approval_required=False,
                )
                with self.assertRaisesMessage(ImproperlyConfigured, "ALLOW_PILOT_VERIFICATION_BYPASS"):
                    config.validate(now=now)

    def test_guard_requires_metadata_aware_window_and_paused_intake(self):
        now = datetime(2026, 7, 21, 9, 0, tzinfo=dt_timezone.utc)
        valid = {
            "app_env": "pilot",
            "account_approval_required": False,
            "allow_pilot_verification_bypass": True,
            "bypass_owner": "pilot-owner",
            "bypass_reason": "load-rehearsal",
            "bypass_start_at": (now - timedelta(hours=1)).isoformat(),
            "bypass_end_at": (now + timedelta(hours=1)).isoformat(),
            "genuine_job_intake_paused": True,
        }

        config, _ = self.build(**valid)
        config.validate(now=now)

        invalid_cases = (
            ("bypass_owner", "", "owner"),
            ("bypass_reason", "", "reason"),
            ("bypass_start_at", "not-a-date", "start"),
            ("bypass_start_at", "2026-07-21T08:00:00", "timezone-aware"),
            ("bypass_end_at", (now - timedelta(hours=2)).isoformat(), "end"),
            ("genuine_job_intake_paused", False, "paused"),
        )
        for key, value, message in invalid_cases:
            with self.subTest(key=key):
                case = dict(valid)
                case[key] = value
                config, _ = self.build(**case)
                with self.assertRaisesMessage(ImproperlyConfigured, message):
                    config.validate(now=now)

    def test_expired_or_not_started_window_is_rejected_at_runtime(self):
        for start_delta, end_delta in ((-2, -1), (1, 2)):
            config, now = self.build(
                app_env="pilot",
                account_approval_required=False,
                allow_pilot_verification_bypass=True,
                bypass_owner="pilot-owner",
                bypass_reason="load-rehearsal",
                bypass_start_at=(datetime(2026, 7, 21, 9, tzinfo=dt_timezone.utc) + timedelta(hours=start_delta)).isoformat(),
                bypass_end_at=(datetime(2026, 7, 21, 9, tzinfo=dt_timezone.utc) + timedelta(hours=end_delta)).isoformat(),
                genuine_job_intake_paused=True,
            )
            with self.subTest(start_delta=start_delta):
                with self.assertRaisesMessage(ImproperlyConfigured, "active"):
                    config.validate(now=now)
