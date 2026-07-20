from rest_framework.throttling import UserRateThrottle


class IcsImportUserThrottle(UserRateThrottle):
    """Limit manual imports by authenticated database user, never by a header."""

    scope = "ics_import"
