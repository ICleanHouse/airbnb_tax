from __future__ import annotations

import os
import logging
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR.parent / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def database_config() -> dict[str, object]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
            }
        }

    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("DATABASE_URL must use postgres:// or postgresql://")

    return {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname or "",
            "PORT": parsed.port or "",
        }
    }


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
APP_ENV = os.getenv("APP_ENV", "local")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
ACCOUNT_APPROVAL_REQUIRED = env_bool("ACCOUNT_APPROVAL_REQUIRED", True)
CLEANER_VERIFICATION_REQUIRED = env_bool("CLEANER_VERIFICATION_REQUIRED", True)
ALLOW_PILOT_VERIFICATION_BYPASS = env_bool(
    "ALLOW_PILOT_VERIFICATION_BYPASS", False
)
PHONE_VERIFICATION_REQUIRED = env_bool("PHONE_VERIFICATION_REQUIRED", False)
EMAIL_VER_USER_SIGNUP = env_bool("EMAIL_VER_USER_SIGNUP", True)
PILOT_VERIFICATION_BYPASS_OWNER = os.getenv(
    "PILOT_VERIFICATION_BYPASS_OWNER", ""
)
PILOT_VERIFICATION_BYPASS_REASON = os.getenv(
    "PILOT_VERIFICATION_BYPASS_REASON", ""
)
PILOT_VERIFICATION_BYPASS_START_AT = os.getenv(
    "PILOT_VERIFICATION_BYPASS_START_AT", ""
)
PILOT_VERIFICATION_BYPASS_END_AT = os.getenv(
    "PILOT_VERIFICATION_BYPASS_END_AT", ""
)
PILOT_GENUINE_JOB_INTAKE_PAUSED = env_bool(
    "PILOT_GENUINE_JOB_INTAKE_PAUSED", False
)
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.core",
    "apps.accounts",
    "apps.locations",
    "apps.properties",
    "apps.marketplace",
    "apps.feedback",
    "apps.notifications",
    "apps.calendars",
    "apps.connections",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "apps.core.middleware.RequestContextMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = database_config()

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

AUTH_USER_MODEL = "accounts.User"

LANGUAGE_CODE = "bg"
TIME_ZONE = "Europe/Sofia"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = env_bool("USE_X_FORWARDED_HOST", True)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Manual calendar parsing is deliberately modest during the Sofia pilot.
        "ics_import": "30/hour",
        "geocoding": "30/hour",
        "lifecycle": "30/hour",
        "recovery_case": "10/hour",
    },
}

GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY", "")
GEOAPIFY_GEOCODING_TIMEOUT_SECONDS = float(
    os.getenv("GEOAPIFY_GEOCODING_TIMEOUT_SECONDS", "5")
)
GEOAPIFY_PROVIDER_REQUESTS_PER_SECOND = max(
    1, int(os.getenv("GEOAPIFY_PROVIDER_REQUESTS_PER_SECOND", "4"))
)

MARKETPLACE_SUPPORT_CHANNEL = os.getenv(
    "MARKETPLACE_SUPPORT_CHANNEL", "support"
)

CACHE_URL = os.getenv("CACHE_URL", "")
if CACHE_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": CACHE_URL,
        }
    }
else:
    # Local development and the test runner do not require an external service.
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "host-cleaners-local-cache",
        }
    }

FRONTEND_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_TRUSTED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
CSRF_TRUSTED_ORIGINS = FRONTEND_TRUSTED_ORIGINS
CSRF_FAILURE_VIEW = "apps.core.views.csrf_failure"
SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_SAMESITE = os.getenv("CSRF_COOKIE_SAMESITE", "Lax")
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", not DEBUG)


def validate_production_settings() -> None:
    if APP_ENV.lower() not in {"prod", "production"}:
        return

    required_env = {
        "CACHE_URL": os.getenv("CACHE_URL"),
        "DATABASE_URL": os.getenv("DATABASE_URL"),
        "DJANGO_ALLOWED_HOSTS": os.getenv("DJANGO_ALLOWED_HOSTS"),
        "FRONTEND_TRUSTED_ORIGINS": os.getenv("FRONTEND_TRUSTED_ORIGINS"),
    }
    missing = [name for name, value in required_env.items() if not value]
    if missing:
        raise ImproperlyConfigured(
            "Production deployment is missing required environment variables: "
            + ", ".join(sorted(missing))
        )

    if DEBUG:
        raise ImproperlyConfigured("DJANGO_DEBUG must be false in production.")

    if SECRET_KEY == "dev-only-change-me" or len(SECRET_KEY) < 32:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a strong production secret.")


validate_production_settings()

from config.verification import VerificationConfiguration  # noqa: E402


VERIFICATION_CONFIGURATION = VerificationConfiguration(
    app_env=APP_ENV,
    account_approval_required=ACCOUNT_APPROVAL_REQUIRED,
    cleaner_verification_required=CLEANER_VERIFICATION_REQUIRED,
    phone_verification_required=PHONE_VERIFICATION_REQUIRED,
    signup_email_verification_required=EMAIL_VER_USER_SIGNUP,
    allow_pilot_verification_bypass=ALLOW_PILOT_VERIFICATION_BYPASS,
    bypass_owner=PILOT_VERIFICATION_BYPASS_OWNER,
    bypass_reason=PILOT_VERIFICATION_BYPASS_REASON,
    bypass_start_at=PILOT_VERIFICATION_BYPASS_START_AT,
    bypass_end_at=PILOT_VERIFICATION_BYPASS_END_AT,
    genuine_job_intake_paused=PILOT_GENUINE_JOB_INTAKE_PAUSED,
)
VERIFICATION_CONFIGURATION.validate()
if VERIFICATION_CONFIGURATION.uses_requirement_bypass:
    logging.getLogger("apps.accounts").warning(
        "Verification requirement bypass is active; genuine pilot intake must remain paused.",
        extra={"event": "verification.bypass_active"},
    )

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
CELERY_IMPORTS = ("apps.notifications.tasks",)

# Base URL of the frontend — used to build links in outbound emails.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@example.local")

# Django email backend for non-signup emails. Signup confirmation uses Resend only.
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)

EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_RESEND_APIKEY = os.getenv("EMAIL_RESEND_APIKEY", "")
EMAIL_RESEND_FROM_EMAIL = os.getenv("EMAIL_RESEND_FROM_EMAIL", "")
EMAIL_VER_USER_CONFIRMATION = env_bool("EMAIL_VER_USER_CONFIRMATION", True)
EMAIL_NOTIF_ADMIN_NEW_ACCOUNT = env_bool("EMAIL_NOTIF_ADMIN_NEW_ACCOUNT", True)
EMAIL_NOTIF_HOST_APPLICATION_SUBMITTED = env_bool("EMAIL_NOTIF_HOST_APPLICATION_SUBMITTED", True)
EMAIL_NOTIF_HOST_JOB_COMPLETED = env_bool("EMAIL_NOTIF_HOST_JOB_COMPLETED", True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_context": {
            "()": "apps.core.logging.RequestContextFilter",
        },
    },
    "formatters": {
        "json": {
            "()": "apps.core.logging.JsonFormatter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "filters": ["request_context"],
        },
        "null": {
            "class": "logging.NullHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "apps": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "apps.request": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "apps.audit": {
            "handlers": ["null"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "celery": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "django.request": {
            "handlers": ["null"],
            "level": "WARNING",
            "propagate": False,
        },
        "gunicorn.error": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "gunicorn.access": {
            "handlers": ["null"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
    },
}

SENTRY_DSN = os.getenv("SENTRY_DSN", "")
SENTRY_ENVIRONMENT = os.getenv("SENTRY_ENVIRONMENT", APP_ENV)
SENTRY_TRACES_SAMPLE_RATE = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))

if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    from apps.core.sentry import drop_sentry_transaction, sanitize_sentry_event

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=SENTRY_ENVIRONMENT,
        traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
        before_send=sanitize_sentry_event,
        before_send_transaction=drop_sentry_transaction,
        integrations=[
            DjangoIntegration(),
            CeleryIntegration(),
            LoggingIntegration(level=None, event_level=None),
        ],
    )
