import logging

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


logger = logging.getLogger("apps.notifications")


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
        logger.error(
            "Admin new account email failed",
            extra={"event": "resend.email_failed", "entity_type": "User", "entity_id": user_id},
        )
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
        logger.error(
            "Account confirmation email failed",
            extra={"event": "resend.email_failed", "entity_type": "User", "entity_id": user_id},
        )
        raise self.retry(exc=exc)


def _send_resend_email(*, api_key: str, from_email: str, to_email: str, subject: str, text: str, html: str) -> None:
    import json
    from urllib import error, request

    payload = json.dumps(
        {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "text": text,
            "html": html,
        }
    ).encode("utf-8")
    resend_request = request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "airbnb-tax-app/1.0",
        },
        method="POST",
    )
    try:
        with request.urlopen(resend_request, timeout=15) as response:
            if response.status >= 400:
                raise RuntimeError(f"Resend returned HTTP {response.status}")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend returned HTTP {exc.code}: {detail}") from exc


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_application_submitted_email(self, application_id: int) -> None:
    """
    Notify the job's host by email when a cleaner submits an application.

    Sends via the Resend API (same infrastructure as signup-code emails).
    """
    from django.conf import settings
    from django.core.exceptions import ImproperlyConfigured
    from django.template.loader import render_to_string
    from django.utils.html import escape

    from apps.marketplace.models import CleanerApplication

    try:
        application = (
            CleanerApplication.objects
            .select_related("job", "job__property", "job__host", "cleaner")
            .get(id=application_id)
        )
    except CleanerApplication.DoesNotExist:
        return

    host = application.job.host
    if not host.email:
        return

    cleaner = application.cleaner
    job = application.job

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    dashboard_url = f"{frontend_url}/host"

    host_name = host.get_full_name().strip() or host.email.split("@")[0]
    cleaner_name = cleaner.get_full_name().strip() or cleaner.get_username()

    scheduled_start = job.scheduled_start.strftime("%d %b %Y, %H:%M") if job.scheduled_start else "—"

    context = {
        "host_name": escape(host_name),
        "cleaner_name": escape(cleaner_name),
        "job_title": escape(job.title),
        "property_name": escape(job.property.name),
        "property_city": escape(job.property.city or ""),
        "scheduled_start": scheduled_start,
        "proposed_price": application.proposed_price or "",
        "message": escape(application.message or ""),
        "dashboard_url": dashboard_url,
    }

    subject = f'New application for "{job.title}" — {cleaner_name}'
    text_body = (
        f"Hi {host_name},\n\n"
        f"{cleaner_name} has applied for your cleaning job: {job.title}\n\n"
        f"Property:  {job.property.name}{', ' + job.property.city if job.property.city else ''}\n"
        f"Scheduled: {scheduled_start}\n"
    )
    if application.proposed_price:
        text_body += f"Proposed price: €{application.proposed_price}\n"
    if application.message:
        text_body += f"Message: \"{application.message}\"\n"
    text_body += f"\nReview this application in your dashboard:\n{dashboard_url}\n"

    html_body = render_to_string("notifications/application_submitted_email.html", context)

    try:
        api_key = getattr(settings, "EMAIL_RESEND_APIKEY", "")
        from_email = getattr(settings, "EMAIL_RESEND_FROM_EMAIL", "")
        if not api_key:
            raise ImproperlyConfigured("EMAIL_RESEND_APIKEY is required for application notification emails.")
        if not from_email:
            raise ImproperlyConfigured("EMAIL_RESEND_FROM_EMAIL is required for application notification emails.")

        _send_resend_email(
            api_key=api_key,
            from_email=from_email,
            to_email=host.email,
            subject=subject,
            text=text_body,
            html=html_body,
        )
    except Exception as exc:
        logger.error(
            "Application notification email failed",
            extra={
                "event": "resend.email_failed",
                "entity_type": "CleanerApplication",
                "entity_id": application_id,
            },
        )
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_job_completed_email(self, job_id: int) -> None:
    """
    Notify the job's host by email when a cleaning job is marked complete.
    """
    from django.conf import settings
    from django.core.exceptions import ImproperlyConfigured
    from django.template.loader import render_to_string
    from django.utils.html import escape

    from apps.marketplace.models import CleaningJob

    try:
        job = (
            CleaningJob.objects
            .select_related("property", "host", "assignment", "assignment__cleaner")
            .get(id=job_id)
        )
    except CleaningJob.DoesNotExist:
        return

    host = job.host
    if not host.email:
        return

    try:
        assignment = job.assignment
        cleaner = assignment.cleaner
    except Exception:
        return

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    dashboard_url = f"{frontend_url}/host"

    host_name = host.get_full_name().strip() or host.email.split("@")[0]
    cleaner_name = cleaner.get_full_name().strip() or cleaner.get_username()
    scheduled_start = job.scheduled_start.strftime("%d %b %Y, %H:%M") if job.scheduled_start else "—"

    context = {
        "host_name": escape(host_name),
        "cleaner_name": escape(cleaner_name),
        "job_title": escape(job.title),
        "property_name": escape(job.property.name),
        "property_city": escape(job.property.city or ""),
        "scheduled_start": scheduled_start,
        "agreed_price": assignment.agreed_price or "",
        "dashboard_url": dashboard_url,
    }

    subject = f'Cleaning complete: "{job.title}"'
    text_body = (
        f"Hi {host_name},\n\n"
        f"{cleaner_name} has marked your cleaning job as complete.\n\n"
        f"Job:       {job.title}\n"
        f"Property:  {job.property.name}"
        + (f", {job.property.city}" if job.property.city else "") + "\n"
        + f"Scheduled: {scheduled_start}\n"
    )
    if assignment.agreed_price:
        text_body += f"Agreed price: €{assignment.agreed_price}\n"
    text_body += f"\nLeave feedback for your cleaner:\n{dashboard_url}\n"

    html_body = render_to_string("notifications/job_completed_email.html", context)

    try:
        api_key = getattr(settings, "EMAIL_RESEND_APIKEY", "")
        from_email = getattr(settings, "EMAIL_RESEND_FROM_EMAIL", "")
        if not api_key:
            raise ImproperlyConfigured("EMAIL_RESEND_APIKEY is required for job completion emails.")
        if not from_email:
            raise ImproperlyConfigured("EMAIL_RESEND_FROM_EMAIL is required for job completion emails.")

        _send_resend_email(
            api_key=api_key,
            from_email=from_email,
            to_email=host.email,
            subject=subject,
            text=text_body,
            html=html_body,
        )
    except Exception as exc:
        logger.error(
            "Job completion email failed",
            extra={"event": "resend.email_failed", "entity_type": "CleaningJob", "entity_id": job_id},
        )
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_signup_email_code(self, verification_id: int, code: str) -> None:
    from django.conf import settings
    from django.core.exceptions import ImproperlyConfigured
    from django.template.loader import render_to_string

    from apps.accounts.models import SignupEmailVerification

    try:
        verification = SignupEmailVerification.objects.get(id=verification_id)
    except SignupEmailVerification.DoesNotExist:
        return

    if verification.is_expired or verification.is_verified:
        return

    subject = "Your Host Cleaners confirmation code"
    text_body = (
        "Use this 6-digit code to confirm your Host Cleaners email address:\n\n"
        f"{code}\n\n"
        "This code expires in 10 minutes. If you did not request it, you can ignore this email."
    )
    html_body = render_to_string("notifications/signup_code_email.html", {"code": code})

    try:
        api_key = getattr(settings, "EMAIL_RESEND_APIKEY", "")
        from_email = getattr(settings, "EMAIL_RESEND_FROM_EMAIL", "")
        if not api_key:
            raise ImproperlyConfigured("EMAIL_RESEND_APIKEY is required for signup email confirmation.")
        if not from_email:
            raise ImproperlyConfigured("EMAIL_RESEND_FROM_EMAIL is required for signup email confirmation.")

        _send_resend_email(
            api_key=api_key,
            from_email=from_email,
            to_email=verification.email,
            subject=subject,
            text=text_body,
            html=html_body,
        )
    except Exception as exc:
        logger.error(
            "Signup confirmation code email failed",
            extra={
                "event": "resend.email_failed",
                "entity_type": "SignupEmailVerification",
                "entity_id": verification_id,
            },
        )
        raise self.retry(exc=exc)

