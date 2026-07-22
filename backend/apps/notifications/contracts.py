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


def _spec(
    en_title: str,
    en_body: str,
    bg_title: str,
    bg_body: str,
    *,
    channels: tuple[str, ...] = ("in_app", "email"),
    en_subject: str = "Action required in Host Cleaners",
    bg_subject: str = "Необходимо е действие в Host Cleaners",
) -> NotificationEventSpec:
    return NotificationEventSpec(
        channels=channels,
        templates={
            "en": LocalizedNotificationTemplate(en_title, en_body, en_subject, en_body),
            "bg": LocalizedNotificationTemplate(bg_title, bg_body, bg_subject, bg_body),
        },
    )


EVENT_SPECS: dict[str, NotificationEventSpec] = {
    "account.created_operator_review": _spec(
        "Account review required", "A new account requires operator review.",
        "Необходим е преглед на акаунт", "Нов акаунт изисква преглед от оператор.",
    ),
    "account.approved": _spec(
        "Marketplace account active", "Your account can now use the available marketplace features.",
        "Акаунтът в платформата е активен", "Вече можете да използвате достъпните функции на платформата.",
        en_subject="Your Host Cleaners account is active",
        bg_subject="Акаунтът ви в Host Cleaners е активен",
    ),
    "account.rejected": _spec(
        "Marketplace access unavailable", "Your account could not be activated. Open Host Cleaners for support options.",
        "Достъпът до платформата не е наличен", "Акаунтът ви не може да бъде активиран. Отворете Host Cleaners за помощ.",
    ),
    "account.suspended": _spec(
        "Marketplace access suspended", "New marketplace actions are unavailable. Your permitted history remains accessible.",
        "Достъпът до платформата е спрян", "Новите действия в платформата не са налични. Разрешената история остава достъпна.",
    ),
    "cleaner.marketplace_access_activated": _spec(
        "Marketplace access active", "Your email-confirmed marketplace profile can now use cleaner actions.",
        "Достъпът до платформата е активен", "Профилът ви с потвърден имейл вече може да използва действията за изпълнители.",
    ),
    "matching.operator_invitation": _spec(
        "Work invitation", "An operator invited you to consider eligible work.",
        "Покана за работа", "Оператор ви покани да разгледате подходяща работа.",
    ),
    "offer.received": _spec(
        "Direct offer received", "A host sent you a direct offer.",
        "Получена директна оферта", "Домакин ви изпрати директна оферта.",
    ),
    "application.submitted": _spec(
        "New application", "A cleaner submitted an application for your job.",
        "Нова кандидатура", "Изпълнител подаде кандидатура за вашата задача.",
    ),
    "application.accepted": _spec(
        "Application accepted", "Your application was accepted and an assignment was created.",
        "Кандидатурата е приета", "Кандидатурата ви беше приета и е създадено възлагане.",
    ),
    "application.rejected": _spec(
        "Application update", "Your application was not selected.",
        "Промяна по кандидатура", "Вашата кандидатура не беше избрана.",
    ),
    "application.withdrawn": _spec(
        "Application withdrawn", "A cleaner withdrew an application.",
        "Оттеглена кандидатура", "Изпълнител оттегли кандидатура.",
    ),
    "offer.accepted": _spec(
        "Direct offer accepted", "A direct offer was accepted and an assignment was created.",
        "Директната оферта е приета", "Директната оферта беше приета и е създадено възлагане.",
    ),
    "offer.declined": _spec(
        "Direct offer update", "A direct offer was declined or withdrawn.",
        "Промяна по директна оферта", "Директната оферта беше отказана или оттеглена.",
    ),
    "assignment.created": _spec(
        "Cleaning assignment created", "A cleaning assignment involving you was created.",
        "Създадено възлагане", "Създадено е възлагане за почистване, което ви засяга.",
    ),
    "assignment.member_delegated": _spec(
        "Agency assignment delegated", "An agency delegated a cleaning assignment to you.",
        "Възлагане от агенция", "Агенция ви възложи задача за почистване.",
    ),
    "job.cancelled": _spec(
        "Cleaning job cancelled", "A cleaning job involving you was cancelled.",
        "Задачата за почистване е отменена", "Задача за почистване, която ви засяга, беше отменена.",
        en_subject="Your cleaning assignment was updated",
        bg_subject="Възлагането ви за почистване е променено",
    ),
    "job.reschedule_proposed": _spec(
        "Schedule change proposed", "A new time was proposed and needs your response.",
        "Предложена е промяна на часа", "Предложен е нов час, който очаква вашия отговор.",
        en_subject="A schedule change needs your response",
        bg_subject="Промяна на графика очаква вашия отговор",
    ),
    "job.reschedule_accepted": _spec(
        "Schedule change accepted", "The proposed schedule change was accepted.",
        "Промяната на часа е приета", "Предложената промяна на графика беше приета.",
        en_subject="Your cleaning assignment was updated",
        bg_subject="Възлагането ви за почистване е променено",
    ),
    "job.reschedule_declined": _spec(
        "Schedule change declined", "The proposed schedule change was declined.",
        "Промяната на часа е отказана", "Предложената промяна на графика беше отказана.",
    ),
    "job.incident_reported": _spec(
        "Operational incident recorded", "An incident was recorded. Open Host Cleaners for authorized details.",
        "Регистриран оперативен инцидент", "Регистриран е инцидент. Отворете Host Cleaners за разрешените подробности.",
    ),
    "dispute.opened": _spec(
        "Dispute opened", "A dispute was opened and requires operator review.",
        "Отворен спор", "Отворен е спор, който изисква преглед от оператор.",
    ),
    "dispute.status_changed": _spec(
        "Dispute updated", "The status of a dispute involving you changed.",
        "Спорът е актуализиран", "Статусът на спор, който ви засяга, е променен.",
    ),
    "replacement.authorization_requested": _spec(
        "Replacement request", "A replacement draft needs host authorization.",
        "Заявка за заместваща задача", "Чернова за заместваща задача очаква одобрение от домакина.",
    ),
    "replacement.draft_created": _spec(
        "Replacement draft created", "A replacement cleaning draft was created.",
        "Създадена е заместваща чернова", "Създадена е чернова за заместващо почистване.",
    ),
    "replacement.declined": _spec(
        "Replacement request declined", "The replacement request was declined.",
        "Заявката за заместване е отказана", "Заявката за заместваща задача беше отказана.",
    ),
    "job.completed": _spec(
        "Cleaning job completed", "A cleaning job involving you was marked complete.",
        "Задачата за почистване е завършена", "Задача за почистване, която ви засяга, е отбелязана като завършена.",
        en_subject="A cleaning job was completed",
        bg_subject="Задача за почистване е завършена",
    ),
    "review.requested": _spec(
        "Leave a review", "Leave your review to unlock both participants' reviews.",
        "Оставете отзив", "Оставете своя отзив, за да отключите отзивите и на двете страни.",
        channels=("in_app",),
    ),
    "review.revealed": _spec(
        "Reviews are now visible", "Both participants submitted reviews, which are now visible.",
        "Отзивите вече са видими", "И двете страни изпратиха отзив и те вече са видими.",
        channels=("in_app",),
    ),
    "job.upcoming_reminder": _spec(
        "Upcoming cleaning reminder", "You have an upcoming cleaning assignment.",
        "Напомняне за предстоящо почистване", "Имате предстоящо възлагане за почистване.",
    ),
}


def get_event_spec(event_type: str) -> NotificationEventSpec | None:
    return EVENT_SPECS.get(event_type)
