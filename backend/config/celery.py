import os
import logging

from celery import Celery
from celery.signals import before_task_publish, task_failure, task_postrun, task_prerun, task_retry

from apps.core.logging import get_request_id, reset_log_context, set_log_context

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("airbnb_cleaners")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


logger = logging.getLogger("celery")


@before_task_publish.connect
def add_request_id_to_task_headers(headers=None, **_kwargs):
    request_id = get_request_id()
    if request_id and headers is not None:
        headers["request_id"] = request_id


@task_prerun.connect
def log_task_started(task=None, task_id=None, **_kwargs):
    headers = getattr(getattr(task, "request", None), "headers", None) or {}
    request_id = headers.get("request_id", "")
    tokens = set_log_context(request_id=request_id)
    if task is not None:
        task.request.log_context_tokens = tokens
    logger.info(
        "Celery task started",
        extra={
            "event": "celery.task_started",
            "request_id": request_id,
            "task_id": task_id,
            "task_name": getattr(task, "name", ""),
        },
    )


@task_postrun.connect
def log_task_finished(task=None, task_id=None, state=None, **_kwargs):
    if state == "SUCCESS":
        logger.info(
            "Celery task succeeded",
            extra={
                "event": "celery.task_succeeded",
                "task_id": task_id,
                "task_name": getattr(task, "name", ""),
            },
        )
    tokens = getattr(getattr(task, "request", None), "log_context_tokens", None)
    if tokens:
        reset_log_context(tokens)


@task_retry.connect
def log_task_retry(request=None, reason=None, **_kwargs):
    logger.warning(
        "Celery task retry scheduled",
        extra={
            "event": "celery.task_retry",
            "task_id": getattr(request, "id", ""),
            "task_name": getattr(request, "task", ""),
            "metadata": {"reason": str(reason)},
        },
    )


@task_failure.connect
def log_task_failed(task_id=None, exception=None, sender=None, **_kwargs):
    logger.error(
        "Celery task failed",
        extra={
            "event": "celery.task_failed",
            "task_id": task_id,
            "task_name": getattr(sender, "name", ""),
            "metadata": {"exception": str(exception)},
        },
        exc_info=True,
    )
