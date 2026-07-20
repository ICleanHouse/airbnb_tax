from __future__ import annotations

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.properties.ics_import import (
    ICS_MAX_EVENTS as CONFIGURED_ICS_MAX_EVENTS,
    ICS_MAX_SUMMARY_LENGTH,
    ICS_MAX_UID_LENGTH,
    ICS_MAX_UPLOAD_BYTES as CONFIGURED_ICS_MAX_UPLOAD_BYTES,
    IcsImportValidationError,
    validate_and_read_ics_upload,
)
from apps.properties.models import Reservation


ICS_MAX_UPLOAD_BYTES = 1024 * 1024
ICS_MAX_EVENTS = 1_000


def event_lines(
    *,
    uid: str | None = "reservation-1",
    summary: str | None = "Guest reservation",
    dtstart: str | None = "DTSTART;VALUE=DATE:20260720",
    dtend: str | None = "DTEND;VALUE=DATE:20260722",
    extra: tuple[str, ...] = (),
) -> list[str]:
    lines = ["BEGIN:VEVENT"]
    if uid is not None:
        lines.append(f"UID:{uid}")
    if summary is not None:
        lines.append(f"SUMMARY:{summary}")
    if dtstart is not None:
        lines.append(dtstart)
    if dtend is not None:
        lines.append(dtend)
    lines.extend(extra)
    lines.append("END:VEVENT")
    return lines


def calendar_bytes(*events: list[str], calendar_lines: tuple[str, ...] = ()) -> bytes:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//S1-E09 tests//EN",
        *calendar_lines,
    ]
    for event in events:
        lines.extend(event)
    lines.append("END:VCALENDAR")
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")


VALID_ICS = calendar_bytes(event_lines())


class ManualIcsUploadSecurityTests(TestCase):
    url = reverse("parse-ics")

    def setUp(self):
        cache.clear()
        self.host = self.create_user("host", User.Role.HOST, preferred_language="en")
        self.admin = self.create_user("admin", User.Role.ADMIN, preferred_language="en")

    @staticmethod
    def create_user(
        username: str,
        role: str,
        *,
        status: str = User.AccountStatus.APPROVED,
        is_active: bool = True,
        preferred_language: str = "en",
    ) -> User:
        return User.objects.create_user(
            username=f"{username}@example.test",
            email=f"{username}@example.test",
            role=role,
            account_status=status,
            is_active=is_active,
            preferred_language=preferred_language,
        )

    def post_file(
        self,
        content: bytes = VALID_ICS,
        *,
        user: User | None = None,
        name: str = "calendar.ics",
        content_type: str = "text/calendar",
    ):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        upload = SimpleUploadedFile(name, content, content_type=content_type)
        return client.post(self.url, {"ics_file": upload}, format="multipart")

    def assert_safe_error(self, response, *, code: str = "invalid_ics_file"):
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], code)
        body = str(response.data)
        self.assertNotIn("calendar.ics", body)
        self.assertNotIn("reservation-1", body)
        self.assertNotIn("Guest reservation", body)
        self.assertNotIn("Traceback", body)
        self.assertNotIn("apps.properties", body)

    def test_success_contract_is_unchanged_for_approved_host(self):
        before = Reservation.objects.count()

        response = self.post_file(user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            [{
                "uid": "reservation-1",
                "summary": "Guest reservation",
                "checkin": "2026-07-20",
                "checkout": "2026-07-22",
                "nights": 2,
            }],
        )
        self.assertEqual(Reservation.objects.count(), before)

    def test_platform_admin_can_parse_manual_upload(self):
        response = self.post_file(user=self.admin)

        self.assertEqual(response.status_code, 200)

    def test_only_active_approved_hosts_and_platform_admins_are_allowed(self):
        denied_users = (
            self.create_user("cleaner", User.Role.CLEANER),
            self.create_user("agency", User.Role.AGENCY),
            self.create_user("pending", User.Role.HOST, status=User.AccountStatus.PENDING),
            self.create_user("rejected", User.Role.HOST, status=User.AccountStatus.REJECTED),
            self.create_user("suspended", User.Role.HOST, status=User.AccountStatus.SUSPENDED),
            self.create_user("inactive", User.Role.HOST, is_active=False),
        )

        for denied_user in denied_users:
            with self.subTest(role=denied_user.role, status=denied_user.account_status):
                response = self.post_file(user=denied_user)
                self.assertEqual(response.status_code, 403)

    def test_anonymous_user_is_denied(self):
        response = self.post_file()

        self.assertEqual(response.status_code, 403)

    def test_missing_file_is_rejected_with_stable_code(self):
        client = APIClient()
        client.force_authenticate(self.host)

        response = client.post(self.url, {}, format="multipart")

        self.assert_safe_error(response, code="ics_file_required")

    def test_empty_file_is_rejected(self):
        response = self.post_file(b"", user=self.host)

        self.assert_safe_error(response)

    def test_upload_at_exact_byte_limit_is_accepted(self):
        prefix = calendar_bytes(event_lines())[:-len(b"END:VCALENDAR\r\n")]
        suffix = b"\r\nEND:VCALENDAR\r\n"
        padding_length = ICS_MAX_UPLOAD_BYTES - len(prefix) - len(suffix) - len(b"X-PADDING:")
        content = prefix + b"X-PADDING:" + (b"A" * padding_length) + suffix
        self.assertEqual(len(content), ICS_MAX_UPLOAD_BYTES)

        response = self.post_file(content, user=self.host)

        self.assertEqual(response.status_code, 200, response.data)

    def test_oversized_upload_is_rejected_before_calendar_parsing(self):
        response = self.post_file(b"X" * (ICS_MAX_UPLOAD_BYTES + 1), user=self.host)

        self.assert_safe_error(response, code="ics_file_too_large")

    def test_uppercase_ics_extension_is_accepted(self):
        response = self.post_file(user=self.host, name="CALENDAR.ICS")

        self.assertEqual(response.status_code, 200)

    def test_invalid_extension_is_rejected(self):
        response = self.post_file(user=self.host, name="calendar.txt")

        self.assert_safe_error(response)

    def test_misleading_declared_mime_type_does_not_bypass_content_validation(self):
        response = self.post_file(
            b"not a calendar",
            user=self.host,
            content_type="text/calendar",
        )

        self.assert_safe_error(response)

    def test_unsupported_declared_mime_type_is_rejected(self):
        response = self.post_file(
            VALID_ICS,
            user=self.host,
            content_type="image/png",
        )

        self.assert_safe_error(response)

    def test_valid_octet_stream_calendar_is_accepted(self):
        response = self.post_file(
            VALID_ICS,
            user=self.host,
            content_type="application/octet-stream",
        )

        self.assertEqual(response.status_code, 200)

    def test_valid_application_ics_calendar_is_accepted(self):
        response = self.post_file(
            VALID_ICS,
            user=self.host,
            content_type="application/ics",
        )

        self.assertEqual(response.status_code, 200)

    def test_malformed_vcalendar_is_rejected(self):
        response = self.post_file(b"BEGIN:VEVENT\r\nEND:VEVENT\r\n", user=self.host)

        self.assert_safe_error(response)

    def test_excessive_vevent_count_is_rejected(self):
        events = [event_lines(uid=f"event-{index}") for index in range(ICS_MAX_EVENTS + 1)]

        response = self.post_file(calendar_bytes(*events), user=self.host)

        self.assert_safe_error(response)

    def test_exact_vevent_limit_is_accepted(self):
        events = [event_lines(uid=f"event-{index}") for index in range(ICS_MAX_EVENTS)]

        response = self.post_file(calendar_bytes(*events), user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), ICS_MAX_EVENTS)

    def test_missing_or_invalid_dates_are_rejected(self):
        invalid_events = (
            event_lines(dtstart=None),
            event_lines(dtend=None),
            event_lines(dtstart="DTSTART:not-a-date"),
            event_lines(dtend="DTEND:not-a-date"),
        )

        for invalid_event in invalid_events:
            with self.subTest(event=invalid_event):
                response = self.post_file(calendar_bytes(invalid_event), user=self.host)
                self.assert_safe_error(response)

    def test_equal_or_reverse_event_bounds_are_rejected(self):
        invalid_events = (
            event_lines(dtend="DTEND;VALUE=DATE:20260720"),
            event_lines(dtend="DTEND;VALUE=DATE:20260719"),
        )

        for invalid_event in invalid_events:
            with self.subTest(event=invalid_event):
                response = self.post_file(calendar_bytes(invalid_event), user=self.host)
                self.assert_safe_error(response)

    def test_uid_and_summary_lengths_are_bounded(self):
        invalid_events = (
            event_lines(uid="u" * 256),
            event_lines(summary="s" * 501),
        )

        for invalid_event in invalid_events:
            with self.subTest(field=invalid_event[1][:7]):
                response = self.post_file(calendar_bytes(invalid_event), user=self.host)
                self.assert_safe_error(response)

    def test_blocked_and_unavailable_entries_are_filtered(self):
        content = calendar_bytes(
            event_lines(uid="blocked", summary="Blocked"),
            event_lines(uid="unavailable", summary="Not available"),
            event_lines(uid="kept", summary="Guest reservation"),
        )

        response = self.post_file(content, user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([event["uid"] for event in response.data], ["kept"])

    def test_errors_are_localized_without_exposing_parser_or_input_details(self):
        bulgarian_host = self.create_user(
            "host-bg",
            User.Role.HOST,
            preferred_language="bg",
        )
        sentinel = b"PRIVATE-CALENDAR-CONTENT-SENTINEL"

        response = self.post_file(
            sentinel,
            user=bulgarian_host,
            name="PRIVATE-FILENAME-SENTINEL.ics",
        )

        self.assert_safe_error(response)
        self.assertIn("календар", response.data["detail"].casefold())
        self.assertNotIn("SENTINEL", str(response.data))

    def test_success_and_error_responses_are_private_and_not_cacheable(self):
        responses = (
            self.post_file(user=self.host),
            self.post_file(b"invalid", user=self.host),
        )

        for response in responses:
            with self.subTest(status=response.status_code):
                self.assertIn("private", response["Cache-Control"])
                self.assertIn("no-store", response["Cache-Control"])
                self.assertEqual(response["Pragma"], "no-cache")
                self.assertEqual(response["Expires"], "0")

    def test_throttle_is_scoped_to_authenticated_user_at_30_per_hour(self):
        other_host = self.create_user("other-host", User.Role.HOST, preferred_language="en")

        for _ in range(30):
            response = self.post_file(user=self.host)
            self.assertEqual(response.status_code, 200)

        throttled = self.post_file(user=self.host)
        unaffected = self.post_file(user=other_host)

        self.assertEqual(throttled.status_code, 429)
        self.assertEqual(throttled.data["code"], "ics_import_rate_limited")
        self.assertEqual(unaffected.status_code, 200)

    def test_audit_records_metadata_only_outcomes_and_redacts_inputs(self):
        secret_content = b"PRIVATE-CALENDAR-CONTENT-SENTINEL"
        response = self.post_file(
            secret_content,
            user=self.host,
            name="PRIVATE-FILENAME-SENTINEL.ics",
        )
        self.assertEqual(response.status_code, 400)

        actions = list(
            AuditLog.objects.filter(entity_type="ICSImport")
            .order_by("created_at")
            .values_list("action", flat=True)
        )
        self.assertEqual(actions, ["ics.import.started", "ics.import.rejected"])
        serialized_logs = str(
            list(
                AuditLog.objects.filter(entity_type="ICSImport")
                .values("action", "entity_id", "metadata")
            )
        )
        self.assertNotIn("PRIVATE-FILENAME-SENTINEL", serialized_logs)
        self.assertNotIn("PRIVATE-CALENDAR-CONTENT-SENTINEL", serialized_logs)
        self.assertNotIn("Could not parse", serialized_logs)
        rejected = AuditLog.objects.get(action="ics.import.rejected")
        self.assertEqual(set(rejected.metadata), {"source", "reason_code"})

    def test_audit_records_success_event_count_and_throttled_reason(self):
        for _ in range(31):
            self.post_file(user=self.host)

        succeeded = AuditLog.objects.filter(action="ics.import.succeeded").first()
        throttled = AuditLog.objects.filter(action="ics.import.throttled").first()
        self.assertIsNotNone(succeeded)
        self.assertEqual(succeeded.metadata, {"source": "upload", "event_count": 1})
        self.assertIsNotNone(throttled)
        self.assertEqual(
            throttled.metadata,
            {"source": "upload", "reason_code": "rate_limited"},
        )


class IcsParserCompatibilityTests(TestCase):
    url = reverse("parse-ics")

    def setUp(self):
        cache.clear()
        self.host = ManualIcsUploadSecurityTests.create_user(
            "parser-host",
            User.Role.HOST,
            preferred_language="en",
        )

    def post_file(
        self,
        content: bytes = VALID_ICS,
        *,
        user: User | None = None,
        name: str = "calendar.ics",
        content_type: str = "text/calendar",
    ):
        return ManualIcsUploadSecurityTests.post_file(
            self,
            content,
            user=user,
            name=name,
            content_type=content_type,
        )

    def test_all_day_date_contract(self):
        response = self.post_file(user=self.host)

        self.assertEqual(response.data[0]["checkin"], "2026-07-20")
        self.assertEqual(response.data[0]["checkout"], "2026-07-22")
        self.assertEqual(response.data[0]["nights"], 2)

    def test_timezone_aware_datetime_contract(self):
        content = calendar_bytes(event_lines(
            dtstart="DTSTART;TZID=Europe/Sofia:20260720T100000",
            dtend="DTEND;TZID=Europe/Sofia:20260720T120000",
        ))

        response = self.post_file(content, user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["checkin"], "2026-07-20")
        self.assertEqual(response.data[0]["checkout"], "2026-07-20")
        self.assertEqual(response.data[0]["nights"], 0)

    def test_floating_datetime_contract(self):
        content = calendar_bytes(event_lines(
            dtstart="DTSTART:20260720T100000",
            dtend="DTEND:20260720T120000",
        ))

        response = self.post_file(content, user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["nights"], 0)

    def test_duplicate_uids_are_preserved_in_stable_order(self):
        content = calendar_bytes(
            event_lines(uid="duplicate", summary="First"),
            event_lines(uid="duplicate", summary="Second"),
        )

        response = self.post_file(content, user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(event["uid"], event["summary"]) for event in response.data],
            [("duplicate", "First"), ("duplicate", "Second")],
        )

    def test_missing_uid_and_summary_keep_legacy_defaults(self):
        content = calendar_bytes(event_lines(uid=None, summary=None))

        response = self.post_file(content, user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["uid"], "")
        self.assertEqual(response.data[0]["summary"], "Reservation")

    def test_recurring_event_is_not_expanded(self):
        content = calendar_bytes(event_lines(extra=("RRULE:FREQ=DAILY;COUNT=3",)))

        response = self.post_file(content, user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_folded_summary_is_parsed(self):
        content = calendar_bytes(event_lines(summary="Folded summary\r\n continuation"))

        response = self.post_file(content, user=self.host)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["summary"], "Folded summarycontinuation")


class IcsUploadLimitConfigurationTests(TestCase):
    def test_stage_one_limits_are_centralized_at_the_selected_values(self):
        self.assertEqual(CONFIGURED_ICS_MAX_UPLOAD_BYTES, ICS_MAX_UPLOAD_BYTES)
        self.assertEqual(CONFIGURED_ICS_MAX_EVENTS, ICS_MAX_EVENTS)
        self.assertEqual(ICS_MAX_UID_LENGTH, 255)
        self.assertEqual(ICS_MAX_SUMMARY_LENGTH, 500)

    def test_nonempty_filename_is_required_before_content_parsing(self):
        upload = SimpleUploadedFile("calendar.ics", VALID_ICS, content_type="text/calendar")
        upload._name = ""

        with self.assertRaises(IcsImportValidationError) as raised:
            validate_and_read_ics_upload(upload)

        self.assertEqual(raised.exception.reason_code, "missing_filename")
