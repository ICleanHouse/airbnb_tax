import logging
import os
import sys

from django.apps import AppConfig


logger = logging.getLogger("apps.startup")


def should_log_startup(argv: list[str] | None = None) -> bool:
    argv = argv or sys.argv
    command_line = " ".join(argv).lower()
    skipped_commands = ("makemigrations", "migrate", "check", "test", "shell", "collectstatic")
    if any(command in command_line for command in skipped_commands):
        return False
    return any(command in command_line for command in ("runserver", "gunicorn", "celery", "daphne", "uvicorn"))


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self):
        if not should_log_startup():
            return
        logger.info(
            "Application process started",
            extra={
                "event": "django.started",
                "metadata": {
                    "pid": os.getpid(),
                    "command": " ".join(sys.argv),
                },
            },
        )
