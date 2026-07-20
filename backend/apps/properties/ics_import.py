from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import PurePath

from django.utils import timezone
from icalendar import Calendar


# Stage 1 limits intentionally bound request memory and response amplification.
ICS_MAX_UPLOAD_BYTES = 1 * 1024 * 1024
ICS_MAX_EVENTS = 1_000
ICS_MAX_UID_LENGTH = 255
ICS_MAX_SUMMARY_LENGTH = 500
ICS_ALLOWED_CONTENT_TYPES = frozenset(
    {"text/calendar", "application/ics", "application/octet-stream"}
)
ICS_SKIP_KEYWORDS = ("not available", "blocked", "unavailable")


ICS_PUBLIC_MESSAGES = {
    "en": {
        "ics_file_required": "Select an .ics calendar file.",
        "ics_file_too_large": "The calendar file is too large.",
        "invalid_ics_file": "The calendar file is invalid. Download it again and upload the .ics file.",
        "ics_import_rate_limited": "Too many calendar import attempts. Try again later.",
    },
    "bg": {
        "ics_file_required": "Изберете .ics файл с календар.",
        "ics_file_too_large": "Файлът с календара е твърде голям.",
        "invalid_ics_file": "Файлът с календара е невалиден. Изтеглете го отново и качете .ics файла.",
        "ics_import_rate_limited": "Направени са твърде много опити за импорт на календар. Опитайте отново по-късно.",
    },
}


@dataclass(frozen=True)
class IcsImportValidationError(Exception):
    public_code: str
    reason_code: str
    event_count: int | None = None


def public_ics_error(code: str, language: str) -> dict[str, str]:
    messages = ICS_PUBLIC_MESSAGES.get(language, ICS_PUBLIC_MESSAGES["en"])
    return {"code": code, "detail": messages[code]}


def validate_and_read_ics_upload(uploaded_file) -> bytes:
    filename = uploaded_file.name if isinstance(uploaded_file.name, str) else ""
    if not filename.strip():
        raise IcsImportValidationError("invalid_ics_file", "missing_filename")
    if PurePath(filename).suffix.casefold() != ".ics":
        raise IcsImportValidationError("invalid_ics_file", "invalid_extension")

    declared_type = (uploaded_file.content_type or "").split(";", 1)[0].strip().casefold()
    if declared_type and declared_type not in ICS_ALLOWED_CONTENT_TYPES:
        raise IcsImportValidationError("invalid_ics_file", "invalid_media_type")

    declared_size = getattr(uploaded_file, "size", None)
    if declared_size is not None and declared_size > ICS_MAX_UPLOAD_BYTES:
        raise IcsImportValidationError("ics_file_too_large", "file_too_large")
    if declared_size == 0:
        raise IcsImportValidationError("invalid_ics_file", "empty_file")

    chunks: list[bytes] = []
    total = 0
    for chunk in uploaded_file.chunks(chunk_size=64 * 1024):
        total += len(chunk)
        if total > ICS_MAX_UPLOAD_BYTES:
            raise IcsImportValidationError("ics_file_too_large", "file_too_large")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise IcsImportValidationError("invalid_ics_file", "empty_file")
    return content


def _safe_text(component, field: str, *, fallback: str, maximum: int) -> str:
    try:
        value = str(component.get(field, "")).strip()
    except Exception as exc:
        raise IcsImportValidationError("invalid_ics_file", f"invalid_{field.casefold()}") from exc
    value = value or fallback
    if len(value) > maximum:
        raise IcsImportValidationError("invalid_ics_file", f"{field.casefold()}_too_long")
    return value


def _normalized_bounds(component) -> tuple[dt.date, dt.date, int]:
    try:
        start_property = component.get("DTSTART")
        end_property = component.get("DTEND")
        if start_property is None or end_property is None:
            raise TypeError
        start_value = start_property.dt
        end_value = end_property.dt
    except Exception as exc:
        raise IcsImportValidationError("invalid_ics_file", "invalid_event_bounds") from exc

    if isinstance(start_value, dt.datetime) and isinstance(end_value, dt.datetime):
        if timezone.is_aware(start_value) != timezone.is_aware(end_value):
            raise IcsImportValidationError("invalid_ics_file", "mixed_event_timezones")
        comparable_start = start_value.astimezone(dt.UTC) if timezone.is_aware(start_value) else start_value
        comparable_end = end_value.astimezone(dt.UTC) if timezone.is_aware(end_value) else end_value
        start_date = start_value.date()
        end_date = end_value.date()
    elif (
        isinstance(start_value, dt.date)
        and not isinstance(start_value, dt.datetime)
        and isinstance(end_value, dt.date)
        and not isinstance(end_value, dt.datetime)
    ):
        comparable_start = start_value
        comparable_end = end_value
        start_date = start_value
        end_date = end_value
    else:
        raise IcsImportValidationError("invalid_ics_file", "mixed_event_value_types")

    if comparable_start >= comparable_end:
        raise IcsImportValidationError("invalid_ics_file", "invalid_event_order")
    return start_date, end_date, (end_date - start_date).days


def parse_ics_bytes(content: bytes) -> list[dict[str, str | int]]:
    try:
        calendar = Calendar.from_ical(content)
    except Exception as exc:
        raise IcsImportValidationError("invalid_ics_file", "calendar_parse_failed") from exc
    if getattr(calendar, "name", "") != "VCALENDAR":
        raise IcsImportValidationError("invalid_ics_file", "invalid_calendar_root")

    try:
        components = [component for component in calendar.walk() if component.name == "VEVENT"]
    except Exception as exc:
        raise IcsImportValidationError("invalid_ics_file", "calendar_walk_failed") from exc
    event_count = len(components)
    if event_count > ICS_MAX_EVENTS:
        raise IcsImportValidationError(
            "invalid_ics_file",
            "event_limit_exceeded",
            event_count=event_count,
        )

    events: list[dict[str, str | int]] = []
    for component in components:
        try:
            summary = _safe_text(
                component,
                "SUMMARY",
                fallback="Reservation",
                maximum=ICS_MAX_SUMMARY_LENGTH,
            )
            if any(keyword in summary.casefold() for keyword in ICS_SKIP_KEYWORDS):
                continue
            uid = _safe_text(
                component,
                "UID",
                fallback="",
                maximum=ICS_MAX_UID_LENGTH,
            )
            start_date, end_date, nights = _normalized_bounds(component)
        except IcsImportValidationError as exc:
            raise IcsImportValidationError(
                exc.public_code,
                exc.reason_code,
                event_count=event_count,
            ) from exc
        except Exception as exc:
            raise IcsImportValidationError(
                "invalid_ics_file",
                "invalid_event",
                event_count=event_count,
            ) from exc

        events.append(
            {
                "uid": uid,
                "summary": summary,
                "checkin": start_date.isoformat(),
                "checkout": end_date.isoformat(),
                "nights": nights,
            }
        )

    events.sort(key=lambda event: event["checkin"])
    return events
