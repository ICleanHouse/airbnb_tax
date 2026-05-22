try:
    from celery import shared_task
except ImportError:  # pragma: no cover - runs without Celery in local dev / tests.
    import functools as _functools

    class _FakeTaskSelf:
        """Minimal stand-in for Celery's bound-task ``self`` when bind=True."""
        max_retries = 3

        def retry(self, exc=None, **_kwargs):
            if exc is not None:
                raise exc

    class _FakeTask:
        def __init__(self, func, bind: bool = False):
            self._func = func
            self._bind = bind
            _functools.update_wrapper(self, func)

        def __call__(self, *args, **kwargs):
            if self._bind:
                return self._func(_FakeTaskSelf(), *args, **kwargs)
            return self._func(*args, **kwargs)

        def delay(self, *args, **kwargs):
            return self(*args, **kwargs)

        def apply(self, args=(), kwargs=None, **_options):
            return self(*(args or ()), **(kwargs or {}))

    def shared_task(func=None, bind: bool = False, **_kwargs):  # type: ignore[misc]
        def decorator(f):
            return _FakeTask(f, bind=bind)
        if func is None:
            return decorator
        return _FakeTask(func, bind=bind)


@shared_task
def dispatch_notification(notification_id: int) -> int:
    # Provider integration will be added when email/SMS vendors are selected.
    return notification_id


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_admin_new_account_email(self, user_id: int) -> None:
    """
    Send an email to every admin/staff user when a new account is created.

    Safe to retry — looks up the user and admin list fresh each attempt.
    Does nothing if the user no longer exists or if there are no admin emails.
    """
    from django.conf import settings
    from django.contrib.auth import get_user_model
    from django.core.mail import send_mail
    from django.db.models import Q

    User = get_user_model()

    try:
        new_user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return  # Account deleted before the task ran — nothing to do.

    admin_emails = list(
        User.objects.filter(
            Q(role="admin") | Q(is_staff=True),
            is_active=True,
        )
        .exclude(email="")
        .values_list("email", flat=True)
    )
    if not admin_emails:
        return  # No admins configured — skip silently.

    full_name = new_user.get_full_name().strip() or "—"
    role_display = new_user.get_role_display()

    subject = f"[Marketplace] New account awaiting approval — {full_name}"
    message = (
        "A new account has been created and is awaiting your approval.\n\n"
        f"Name:   {full_name}\n"
        f"Email:  {new_user.email or '—'}\n"
        f"Phone:  {new_user.phone_number or '—'}\n"
        f"Role:   {role_display}\n\n"
        "Log in to the admin panel to review this account.\n"
    )

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=admin_emails,
            fail_silently=False,
        )
    except Exception as exc:
        raise self.retry(exc=exc)

