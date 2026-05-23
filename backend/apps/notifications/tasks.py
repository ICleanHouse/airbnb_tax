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

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    approve_link = f"{frontend_url}/admin?filter=pending"

    subject = f"[Marketplace] New account awaiting approval — {full_name}"
    message = (
        "A new account has been created and is awaiting your approval.\n\n"
        f"Name:   {full_name}\n"
        f"Email:  {new_user.email or '—'}\n"
        f"Phone:  {new_user.phone_number or '—'}\n"
        f"Role:   {role_display}\n\n"
        f"Review this account here:\n{approve_link}\n"
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


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_account_confirmation_email(self, user_id: int) -> None:
    from django.conf import settings
    from django.contrib.auth import get_user_model
    from django.core.mail import EmailMultiAlternatives
    from django.urls import reverse
    from django.utils.encoding import force_bytes
    from django.utils.html import escape
    from django.utils.http import urlsafe_base64_encode

    from apps.accounts.tokens import email_verification_token

    User = get_user_model()

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    if not user.email or user.email_verified_at:
        return

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    backend_url = getattr(settings, "BACKEND_URL", "").rstrip("/") or frontend_url
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = email_verification_token.make_token(user)
    path = reverse("account-confirm-email", kwargs={"uidb64": uid, "token": token})
    confirmation_link = f"{backend_url}{path}"
    display_name = user.get_full_name().strip() or user.email.split("@")[0]
    html_display_name = escape(display_name)

    subject = "Confirm your Host Cleaners account"
    text_body = (
        f"Welcome to Host Cleaners, {display_name}.\n\n"
        "Confirm your email address to complete your registration:\n"
        f"{confirmation_link}\n\n"
        "If you did not create this account, you can ignore this email."
    )
    html_body = f"""
<!doctype html>
<html>
  <body style="margin:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dddddd;border-radius:8px;overflow:hidden;">
            <tr>
              <td>
                <img src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1120&q=80" alt="Clean apartment" width="560" style="display:block;width:100%;height:auto;">
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#111;">Welcome to Host Cleaners</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#555;">Hi {html_display_name}, confirm your email address to complete your registration and continue setting up your account.</p>
                <p style="margin:0 0 24px;">
                  <a href="{confirmation_link}" style="display:inline-block;background:#ff385c;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-weight:700;">Confirm registration</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#777;">If the button does not work, open this link:<br><a href="{confirmation_link}" style="color:#e21d48;">{confirmation_link}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    email.attach_alternative(html_body, "text/html")

    try:
        email.send(fail_silently=False)
    except Exception as exc:
        raise self.retry(exc=exc)

