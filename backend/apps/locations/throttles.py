from rest_framework.throttling import UserRateThrottle


class GeocodingUserThrottle(UserRateThrottle):
    """Bound private geocoding by the authenticated account, not a user header."""

    scope = "geocoding"
