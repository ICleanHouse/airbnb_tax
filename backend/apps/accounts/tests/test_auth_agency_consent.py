from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import (
    AgencyInvitation,
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    CookieConsent,
    HostProfile,
    SignupEmailVerification,
    User,
)
from apps.marketplace.models import Assignment, CleaningJob
from apps.marketplace.services import accept_application, publish_job, submit_application
from apps.properties.models import Property


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_RESEND_APIKEY="test-resend-key",
    EMAIL_RESEND_FROM_EMAIL="onboarding@example.test",
    EMAIL_NOTIF_ADMIN_NEW_ACCOUNT=True,
    EMAIL_VER_USER_SIGNUP=True,
    EMAIL_VER_USER_CONFIRMATION=True,
    SENTRY_DSN="",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class AccountAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def make_verified_signup_token(self, email: str) -> str:
        verification, _code = SignupEmailVerification.create_for_email(email)
        verification.verified_at = timezone.now()
        verification.save(update_fields=["verified_at"])
        return str(verification.token)

    def test_signup_creates_approved_user_and_profile_session(self):
        email = "owner@example.com"
        response = self.client.post(
            reverse("account-signup"),
            {
                "first_name": "Host",
                "last_name": "Owner",
                "email": email,
                "role": User.Role.HOST,
                "password": "Password123!",
                "password_confirm": "Password123!",
                "email_verification_token": self.make_verified_signup_token(email),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email=email)
        self.assertEqual(user.account_status, User.AccountStatus.APPROVED)
        self.assertIsNotNone(user.email_verified_at)
        self.assertTrue(HostProfile.objects.filter(user=user).exists())

        me_response = self.client.get(reverse("account-me"))
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.data["account_status"], User.AccountStatus.APPROVED)
        self.assertFalse(me_response.data["is_platform_admin"])

    def test_signup_does_not_allow_admin_role(self):
        response = self.client.post(
            reverse("account-signup"),
            {
                "first_name": "Platform",
                "last_name": "Admin",
                "email": "admin-signup@example.com",
                "role": User.Role.ADMIN,
                "password": "Password123!",
                "password_confirm": "Password123!",
                "email_verification_token": self.make_verified_signup_token("admin-signup@example.com"),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="admin-signup@example.com").exists())

    def test_signup_requires_verified_email_token(self):
        response = self.client.post(
            reverse("account-signup"),
            {
                "first_name": "Cleaner",
                "last_name": "One",
                "email": "cleaner-start@example.com",
                "role": User.Role.CLEANER,
                "password": "Password123!",
                "password_confirm": "Password123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="cleaner-start@example.com").exists())

    def test_cleaner_signup_saves_service_areas(self):
        email = "cleaner-area@example.com"
        response = self.client.post(
            reverse("account-signup"),
            {
                "first_name": "Cleaner",
                "last_name": "Area",
                "email": email,
                "role": User.Role.CLEANER,
                "password": "Password123!",
                "password_confirm": "Password123!",
                "email_verification_token": self.make_verified_signup_token(email),
                "city": "Sofia",
                "service_areas": ["Lozenets", "Center"],
                "birth_date": "1994-04-30",
                "sex": CleanerProfile.Sex.FEMALE,
                "native_language": "Български",
                "education": CleanerProfile.Education.HIGHER,
                "bio": "Reliable cleaner with short-term rental turnover experience.",
                "has_driving_license": True,
                "has_own_car": True,
                "smoker": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        profile = CleanerProfile.objects.get(user__email=email)
        self.assertEqual(profile.city, "Sofia")
        self.assertEqual(profile.service_areas, ["Lozenets", "Center"])
        self.assertEqual(profile.age, 32)
        self.assertEqual(profile.birth_date.isoformat(), "1994-04-30")
        self.assertEqual(profile.native_language, "Български")
        self.assertEqual(profile.bio, "Reliable cleaner with short-term rental turnover experience.")

    def test_cleaner_signup_rejects_overlong_bio(self):
        email = "long-bio-cleaner@example.com"
        response = self.client.post(
            reverse("account-signup"),
            {
                "first_name": "Cleaner",
                "last_name": "Bio",
                "email": email,
                "role": User.Role.CLEANER,
                "password": "Password123!",
                "password_confirm": "Password123!",
                "email_verification_token": self.make_verified_signup_token(email),
                "city": "Sofia",
                "service_areas": ["Center"],
                "birth_date": "1994-04-30",
                "sex": CleanerProfile.Sex.FEMALE,
                "native_language": "Български",
                "bio": "a" * 1501,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("bio", response.data)
        self.assertFalse(User.objects.filter(email=email).exists())

    def test_cleaner_signup_rejects_underage_user(self):
        email = "underage-cleaner@example.com"
        response = self.client.post(
            reverse("account-signup"),
            {
                "first_name": "Young",
                "last_name": "Cleaner",
                "email": email,
                "role": User.Role.CLEANER,
                "password": "Password123!",
                "password_confirm": "Password123!",
                "email_verification_token": self.make_verified_signup_token(email),
                "city": "Sofia",
                "service_areas": ["Center"],
                "birth_date": f"{timezone.localdate().year - 17}-01-01",
                "sex": CleanerProfile.Sex.MALE,
                "has_driving_license": False,
                "has_own_car": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email=email).exists())

    @mock.patch("apps.notifications.tasks._send_resend_email")
    def test_signup_email_code_flow_returns_token(self, send_resend_email):
        response = self.client.post(
            reverse("account-signup-email-code"),
            {
                "first_name": "Cleaner",
                "last_name": "One",
                "email": "cleaner-code@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        verification = SignupEmailVerification.objects.get(email="cleaner-code@example.com")
        self.assertFalse(verification.is_verified)
        send_resend_email.assert_called_once()
        _, kwargs = send_resend_email.call_args
        self.assertEqual(kwargs["api_key"], "test-resend-key")
        self.assertEqual(kwargs["from_email"], "onboarding@example.test")
        self.assertEqual(kwargs["to_email"], "cleaner-code@example.com")
        self.assertRegex(kwargs["text"], r"\b\d{6}\b")

    def test_email_code_verification_accepts_latest_code(self):
        verification, code = SignupEmailVerification.create_for_email("cleaner-code@example.com")
        response = self.client.post(
            reverse("account-signup-verify-email-code"),
            {"email": "cleaner-code@example.com", "code": code},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email_verification_token"], str(verification.token))
        verification.refresh_from_db()
        self.assertIsNotNone(verification.verified_at)

    def test_anonymous_user_endpoint_cannot_create_admin_account(self):
        response = self.client.post(
            "/api/accounts/users/",
            {
                "username": "public-admin",
                "email": "public-admin@example.com",
                "password": "password123",
                "role": User.Role.ADMIN,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="public-admin").exists())

    def test_superuser_defaults_to_platform_admin(self):
        user = User.objects.create_superuser(
            username="root",
            email="root@example.com",
            password="password123",
        )

        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertEqual(user.account_status, User.AccountStatus.APPROVED)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_platform_admin)

    def test_login_and_logout_use_session_authentication(self):
        user = User.objects.create_user(
            username="cleaner@example.com",
            email="cleaner@example.com",
            password="password123",
            role=User.Role.CLEANER,
        )
        CleanerProfile.objects.create(user=user)

        login_response = self.client.post(
            reverse("account-login"),
            {"email": "cleaner@example.com", "password": "password123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(self.client.get(reverse("account-me")).status_code, 200)

        logout_response = self.client.post(reverse("account-logout"))
        self.assertEqual(logout_response.status_code, 204)
        self.assertEqual(self.client.get(reverse("account-me")).status_code, 403)

    def test_admin_can_approve_user_through_api(self):
        admin = User.objects.create_user(
            username="admin",
            password="password123",
            role=User.Role.ADMIN,
            account_status=User.AccountStatus.APPROVED,
        )
        pending = User.objects.create_user(
            username="pending",
            password="password123",
            role=User.Role.HOST,
        )
        self.client.force_authenticate(admin)

        response = self.client.post(f"/api/accounts/users/{pending.id}/approve/")

        self.assertEqual(response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.account_status, User.AccountStatus.APPROVED)
        self.assertEqual(pending.approved_by, admin)

    def test_pending_host_cannot_create_property_or_job(self):
        host = User.objects.create_user(username="host", password="password123", role=User.Role.HOST)
        HostProfile.objects.create(user=host)
        property = Property.objects.create(host=host, name="Flat", city="Sofia")
        self.client.force_authenticate(host)

        property_response = self.client.post(
            "/api/properties/properties/",
            {"name": "New Flat", "city": "Sofia"},
            format="json",
        )
        job_response = self.client.post(
            "/api/marketplace/jobs/",
            {
                "property_id": property.id,
                "title": "Turnover",
                "scheduled_start": (timezone.now() + timedelta(days=1)).isoformat(),
                "scheduled_end": (timezone.now() + timedelta(days=1, hours=2)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(property_response.status_code, 403)
        self.assertEqual(job_response.status_code, 403)

    def test_cookie_consent_records_anonymous_visitor_choices(self):
        response = self.client.post(
            reverse("cookie-consent"),
            {
                "visitor_id": "visitor-123",
                "analytics": True,
                "marketing": False,
                "policy_version": "v1",
                "consent_version": "v1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        consent = CookieConsent.objects.get(visitor_id="visitor-123")
        self.assertTrue(consent.essential)
        self.assertTrue(consent.analytics)
        self.assertFalse(consent.marketing)


class AgencyWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.agency_user = User.objects.create_user(
            username="agency@example.com",
            email="agency@example.com",
            password="password123",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        self.agency = AgencyProfile.objects.create(
            user=self.agency_user,
            company_name="Agency One",
            city="Sofia",
        )
        self.cleaner = User.objects.create_user(
            username="cleaner@example.com",
            email="cleaner@example.com",
            password="password123",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.cleaner,
            display_name="Cleaner One",
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )

    def test_agency_invites_and_cleaner_accepts_membership(self):
        self.client.force_authenticate(self.agency_user)
        invite_response = self.client.post(
            f"/api/accounts/agencies/{self.agency.id}/invite-cleaner/",
            {"email": "cleaner@example.com"},
            format="json",
        )
        duplicate_response = self.client.post(
            f"/api/accounts/agencies/{self.agency.id}/invite-cleaner/",
            {"email": "cleaner@example.com"},
            format="json",
        )

        self.assertEqual(invite_response.status_code, 201)
        self.assertEqual(duplicate_response.status_code, 400)

        invitation = AgencyInvitation.objects.get()
        self.client.force_authenticate(self.cleaner)
        accept_response = self.client.post(f"/api/accounts/agency-invitations/{invitation.id}/accept/")

        self.assertEqual(accept_response.status_code, 201)
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, AgencyInvitation.Status.ACCEPTED)
        self.assertTrue(
            AgencyMembership.objects.filter(
                agency=self.agency,
                cleaner=self.cleaner,
                status=AgencyMembership.Status.ACTIVE,
            ).exists()
        )

    def test_agency_can_assign_accepted_job_to_active_member(self):
        AgencyMembership.objects.create(agency=self.agency, cleaner=self.cleaner, invited_by=self.agency_user)
        host = User.objects.create_user(
            username="host",
            password="password123",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        property = Property.objects.create(host=host, name="Center Flat", city="Sofia")
        job = CleaningJob.objects.create(
            property=property,
            host=host,
            title="Turnover",
            scheduled_start=timezone.now() + timedelta(days=1),
            scheduled_end=timezone.now() + timedelta(days=1, hours=2),
        )

        publish_job(job)
        application = submit_application(job=job, cleaner=self.agency_user)
        assignment = accept_application(application=application, accepted_by=host)

        self.client.force_authenticate(self.agency_user)
        response = self.client.post(
            f"/api/marketplace/assignments/{assignment.id}/assign-member/",
            {"assigned_member_id": self.cleaner.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.assigned_member, self.cleaner)
        self.assertEqual(Assignment.objects.filter(assigned_member=self.cleaner).count(), 1)
