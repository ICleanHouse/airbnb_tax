from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, HostProfile, User


@override_settings(SENTRY_DSN="")
class AccountStatusPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def create_user(
        self,
        username,
        *,
        role=User.Role.HOST,
        account_status=User.AccountStatus.APPROVED,
        is_staff=False,
        is_superuser=False,
    ):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=role,
            account_status=account_status,
            is_staff=is_staff,
            is_superuser=is_superuser,
        )
        if role == User.Role.HOST:
            HostProfile.objects.create(user=user)
        elif role == User.Role.CLEANER:
            CleanerProfile.objects.create(user=user)
        return user

    def create_cleaner(
        self,
        username,
        *,
        account_status=User.AccountStatus.APPROVED,
        verification_status=CleanerProfile.VerificationStatus.PENDING,
        is_active=True,
    ):
        cleaner = self.create_user(
            username,
            role=User.Role.CLEANER,
            account_status=account_status,
        )
        cleaner.is_active = is_active
        cleaner.save(update_fields=["is_active"])
        profile = cleaner.cleaner_profile
        profile.verification_status = verification_status
        profile.display_name = username
        profile.city = "Sofia"
        profile.birth_date = timezone.localdate().replace(year=1990)
        profile.save(
            update_fields=[
                "verification_status",
                "display_name",
                "city",
                "birth_date",
                "updated_at",
            ]
        )
        return cleaner

    def create_admin(self):
        return self.create_user(
            "platform-admin",
            role=User.Role.ADMIN,
            account_status=User.AccountStatus.APPROVED,
            is_staff=True,
            is_superuser=True,
        )

    def test_non_admin_user_field_mutations_are_rejected_or_ignored(self):
        user = self.create_user("normal-host")
        self.client.force_authenticate(user)

        protected_payloads = [
            {"role": User.Role.ADMIN},
            {"account_status": User.AccountStatus.APPROVED},
            {"is_staff": True},
            {"is_superuser": True},
        ]
        for payload in protected_payloads:
            with self.subTest(payload=payload):
                response = self.client.patch(
                    f"/api/accounts/users/{user.id}/",
                    payload,
                    format="json",
                )

                self.assertEqual(response.status_code, 403)
                user.refresh_from_db()
                self.assertEqual(user.role, User.Role.HOST)
                self.assertEqual(user.account_status, User.AccountStatus.APPROVED)
                self.assertFalse(user.is_staff)
                self.assertFalse(user.is_superuser)

        protected_timestamp_response = self.client.patch(
            f"/api/accounts/users/{user.id}/",
            {"approved_at": timezone.now().isoformat()},
            format="json",
        )
        self.assertEqual(protected_timestamp_response.status_code, 403)
        response = self.client.patch(
            f"/api/accounts/users/{user.id}/",
            {"first_name": "Allowed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertIsNone(user.approved_at)
        self.assertEqual(user.first_name, "Allowed")

    def test_normal_user_cannot_update_another_user_account(self):
        user = self.create_user("normal-user")
        other = self.create_user("other-user")
        self.client.force_authenticate(user)

        response = self.client.patch(
            f"/api/accounts/users/{other.id}/",
            {"first_name": "Changed"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        other.refresh_from_db()
        self.assertEqual(other.first_name, "")

    def test_cleaner_cannot_change_own_verification_status(self):
        cleaner = self.create_cleaner("cleaner-self")
        self.client.force_authenticate(cleaner)

        response = self.client.patch(
            f"/api/accounts/cleaners/{cleaner.cleaner_profile.id}/",
            {"verification_status": CleanerProfile.VerificationStatus.VERIFIED},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(
            cleaner.cleaner_profile.verification_status,
            CleanerProfile.VerificationStatus.PENDING,
        )

    def test_non_admins_cannot_change_another_cleaner_verification_status(self):
        host = self.create_user("host-viewer")
        cleaner = self.create_cleaner("target-cleaner")
        other_cleaner = self.create_cleaner("other-cleaner")

        self.client.force_authenticate(host)
        host_response = self.client.patch(
            f"/api/accounts/cleaners/{cleaner.cleaner_profile.id}/",
            {"verification_status": CleanerProfile.VerificationStatus.VERIFIED},
            format="json",
        )

        self.client.force_authenticate(other_cleaner)
        other_cleaner_response = self.client.patch(
            f"/api/accounts/cleaners/{cleaner.cleaner_profile.id}/",
            {"verification_status": CleanerProfile.VerificationStatus.VERIFIED},
            format="json",
        )

        self.assertEqual(host_response.status_code, 403)
        self.assertEqual(other_cleaner_response.status_code, 403)
        cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(
            cleaner.cleaner_profile.verification_status,
            CleanerProfile.VerificationStatus.PENDING,
        )

    def test_non_admin_cannot_update_another_cleaner_profile_fields(self):
        host = self.create_user("host-browser")
        cleaner = self.create_cleaner(
            "cleaner-profile-owner",
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        self.client.force_authenticate(host)

        response = self.client.patch(
            f"/api/accounts/cleaners/{cleaner.cleaner_profile.id}/",
            {"display_name": "Hijacked name"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(cleaner.cleaner_profile.display_name, "cleaner-profile-owner")

    def test_admin_uses_reconciliation_and_structured_account_transitions(self):
        admin = self.create_admin()
        host = self.create_user("status-target", account_status=User.AccountStatus.PENDING)
        host.email_verified_at = timezone.now()
        host.save(update_fields=["email_verified_at"])
        rejected = self.create_user("reject-target", account_status=User.AccountStatus.PENDING)
        suspended = self.create_user("suspend-target", account_status=User.AccountStatus.APPROVED)
        cleaner = self.create_cleaner("verification-target")
        self.client.force_authenticate(admin)

        approve_response = self.client.post(
            f"/api/accounts/users/{host.id}/reconcile-verification/"
        )
        reject_response = self.client.post(
            f"/api/accounts/users/{rejected.id}/reject/",
            {
                "expected_status": "pending",
                "reason_category": "policy_prerequisite_incomplete",
            },
            format="json",
        )
        suspend_response = self.client.post(
            f"/api/accounts/users/{suspended.id}/suspend/",
            {
                "expected_status": "approved",
                "reason_category": "operator_support",
            },
            format="json",
        )
        verify_response = self.client.patch(
            f"/api/accounts/cleaners/{cleaner.cleaner_profile.id}/",
            {"verification_status": CleanerProfile.VerificationStatus.VERIFIED},
            format="json",
        )

        self.assertEqual(approve_response.status_code, 200)
        self.assertEqual(reject_response.status_code, 200)
        self.assertEqual(suspend_response.status_code, 200)
        self.assertEqual(verify_response.status_code, 403)
        host.refresh_from_db()
        rejected.refresh_from_db()
        suspended.refresh_from_db()
        cleaner.cleaner_profile.refresh_from_db()
        self.assertEqual(host.account_status, User.AccountStatus.APPROVED)
        self.assertEqual(rejected.account_status, User.AccountStatus.REJECTED)
        self.assertEqual(suspended.account_status, User.AccountStatus.SUSPENDED)
        self.assertEqual(
            cleaner.cleaner_profile.verification_status,
            CleanerProfile.VerificationStatus.PENDING,
        )

    def test_public_cleaner_detail_excludes_private_fields(self):
        cleaner = self.create_cleaner(
            "public-cleaner",
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        cleaner.phone_number = "+359888000000"
        cleaner.save(update_fields=["phone_number"])

        response = self.client.get(f"/api/accounts/public-cleaners/{cleaner.cleaner_profile.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("email", response.data)
        self.assertNotIn("phone_number", response.data)
        self.assertNotIn("phone", response.data)
        self.assertNotIn("birth_date", response.data)
