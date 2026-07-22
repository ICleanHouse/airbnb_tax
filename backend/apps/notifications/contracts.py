from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LocalizedNotificationTemplate:
    title: str
    body: str
    email_subject: str
    email_body: str


@dataclass(frozen=True)
class NotificationEventSpec:
    channels: tuple[str, ...]
    templates: dict[str, LocalizedNotificationTemplate]
    allowed_metadata: frozenset[str] = frozenset()


EVENT_CONTRACT_VERSION = 1
SUPPORTED_LANGUAGES = frozenset({"bg", "en"})
DEFAULT_LANGUAGE = "bg"


EVENT_SPECS: dict[str, NotificationEventSpec] = {
    "account.approved": NotificationEventSpec(
        channels=("in_app", "email"),
        templates={
            "en": LocalizedNotificationTemplate(
                title="Marketplace account active",
                body="Your account can now use the available marketplace features.",
                email_subject="Your Host Cleaners account is active",
                email_body="Your marketplace account is active. Open Host Cleaners for details.",
            ),
            "bg": LocalizedNotificationTemplate(
                title="Акаунтът в платформата е активен",
                body="Вече можете да използвате достъпните функции на платформата.",
                email_subject="Акаунтът ви в Host Cleaners е активен",
                email_body="Акаунтът ви в платформата е активен. Отворете Host Cleaners за подробности.",
            ),
        },
    ),
}


def get_event_spec(event_type: str) -> NotificationEventSpec | None:
    return EVENT_SPECS.get(event_type)

