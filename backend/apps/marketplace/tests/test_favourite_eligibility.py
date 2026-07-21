from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import AgencyProfile, CleanerProfile, HostProfile, User
from apps.marketplace.models import FavouriteCleaner


@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class FavouriteEligibilityTests(TestCase):
    ineligible_detail = "Only cleaners with active marketplace access can be favourited."

    def setUp(self):
        self.client = APIClient()
        self.host = self.create_host("host")
        self.other_host = self.create_host("other-host")
        self.cleaner = self.create_cleaner("verified-cleaner")

    def create_host(self, username, *, status=User.AccountStatus.APPROVED):
        host = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=status,
        )
        HostProfile.objects.create(user=host, city="Sofia")
        return host

    def create_cleaner(
        self,
        username,
        *,
        status=User.AccountStatus.APPROVED,
        verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        is_active=True,
        with_profile=True,
        profile_image="",
    ):
        cleaner = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=status,
            is_active=is_active,
        )
        if with_profile:
            CleanerProfile.objects.create(
                user=cleaner,
                display_name=username,
                verification_status=verification_status,
                profile_image=profile_image,
                service_areas=["Sofia"],
            )
        return cleaner

    def create_agency(self, username):
        agency_user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        AgencyProfile.objects.create(user=agency_user, company_name=username, city="Sofia")
        return agency_user

    def create_admin(self, username):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.ADMIN,
        )

    def rows(self, response):
        return response.data["results"] if isinstance(response.data, dict) else response.data

    def post_favourite(self, cleaner_id, *, actor=None):
        self.client.force_authenticate(actor or self.host)
        return self.client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": cleaner_id},
            format="json",
        )

    def assert_no_private_fields(self, payload):
        private_fields = {
            "email",
            "phone_number",
            "birth_date",
            "account_status",
            "approved_at",
            "approved_by",
            "verification_status",
        }
        self.assertTrue(private_fields.isdisjoint(payload.keys()))

    def test_host_can_favourite_eligible_cleaner_and_duplicate_is_idempotent(self):
        first = self.post_favourite(self.cleaner.id)
        second = self.post_favourite(self.cleaner.id)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(FavouriteCleaner.objects.filter(host=self.host, cleaner=self.cleaner).count(), 1)
        self.assertEqual(first.data["cleaner"], self.cleaner.id)
        self.assert_no_private_fields(first.data)

    def test_ineligible_cleaner_account_states_are_rejected_without_rows(self):
        cases = [
            ("pending", self.create_cleaner("pending", status=User.AccountStatus.PENDING)),
            ("rejected", self.create_cleaner("rejected", status=User.AccountStatus.REJECTED)),
            ("suspended", self.create_cleaner("suspended", status=User.AccountStatus.SUSPENDED)),
            ("inactive", self.create_cleaner("inactive", is_active=False)),
            (
                "approved-unverified",
                self.create_cleaner(
                    "approved-unverified",
                    verification_status=CleanerProfile.VerificationStatus.PENDING,
                ),
            ),
            (
                "verification-rejected",
                self.create_cleaner(
                    "verification-rejected",
                    verification_status=CleanerProfile.VerificationStatus.REJECTED,
                ),
            ),
            (
                "verification-suspended",
                self.create_cleaner(
                    "verification-suspended",
                    verification_status=CleanerProfile.VerificationStatus.SUSPENDED,
                ),
            ),
            ("missing-profile", self.create_cleaner("missing-profile", with_profile=False)),
        ]

        for label, cleaner in cases:
            with self.subTest(label=label):
                response = self.post_favourite(cleaner.id)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data, {"detail": self.ineligible_detail})
                self.assertFalse(FavouriteCleaner.objects.filter(host=self.host, cleaner=cleaner).exists())

    def test_non_cleaner_targets_are_rejected(self):
        targets = [
            ("host", self.other_host),
            ("agency", self.create_agency("agency")),
            ("admin", self.create_admin("admin")),
        ]

        for label, target in targets:
            with self.subTest(label=label):
                response = self.post_favourite(target.id)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data, {"detail": self.ineligible_detail})
                self.assertFalse(FavouriteCleaner.objects.filter(host=self.host, cleaner=target).exists())

    def test_non_host_or_unapproved_actors_cannot_create_host_favourites(self):
        actors = [
            ("cleaner", self.cleaner),
            ("agency", self.create_agency("actor-agency")),
            ("admin", self.create_admin("actor-admin")),
            ("pending-host", self.create_host("pending-host", status=User.AccountStatus.PENDING)),
        ]

        for label, actor in actors:
            with self.subTest(label=label):
                response = self.post_favourite(self.cleaner.id, actor=actor)
                self.assertEqual(response.status_code, 403)
                self.assertFalse(FavouriteCleaner.objects.filter(host=actor, cleaner=self.cleaner).exists())

        self.client.force_authenticate(None)
        anonymous_response = self.client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": self.cleaner.id},
            format="json",
        )
        self.assertEqual(anonymous_response.status_code, 403)

    def test_delete_and_list_are_scoped_to_requesting_host(self):
        favourite = FavouriteCleaner.objects.create(host=self.host, cleaner=self.cleaner)

        self.client.force_authenticate(self.other_host)
        list_response = self.client.get("/api/marketplace/favourites/")
        delete_response = self.client.delete(f"/api/marketplace/favourites/{favourite.id}/")

        self.assertEqual(self.rows(list_response), [])
        self.assertEqual(delete_response.status_code, 404)
        self.assertTrue(FavouriteCleaner.objects.filter(id=favourite.id).exists())

    def test_malformed_and_nonexistent_ids_return_controlled_errors(self):
        malformed = self.post_favourite("not-an-id")
        nonexistent = self.post_favourite(999999)

        self.assertEqual(malformed.status_code, 400)
        self.assertIn(nonexistent.status_code, (400, 404))
        self.assertFalse(FavouriteCleaner.objects.exists())

    def test_profile_images_serialize_text_urls_and_data_strings_without_private_fields(self):
        data_cleaner = self.create_cleaner(
            "data-image-cleaner",
            profile_image="data:image/png;base64,abc123",
        )
        url_cleaner = self.create_cleaner(
            "url-image-cleaner",
            profile_image="https://cdn.example.test/profile.png",
        )
        FavouriteCleaner.objects.create(host=self.host, cleaner=data_cleaner)
        FavouriteCleaner.objects.create(host=self.host, cleaner=url_cleaner)

        self.client.force_authenticate(self.host)
        response = self.client.get("/api/marketplace/favourites/")
        rows_by_cleaner = {row["cleaner"]: row for row in self.rows(response)}

        self.assertEqual(rows_by_cleaner[data_cleaner.id]["profile_image"], "data:image/png;base64,abc123")
        self.assertEqual(rows_by_cleaner[url_cleaner.id]["profile_image"], "https://cdn.example.test/profile.png")
        for row in rows_by_cleaner.values():
            self.assert_no_private_fields(row)

    def test_historical_unavailable_favourite_remains_visible_and_safe(self):
        favourite = FavouriteCleaner.objects.create(host=self.host, cleaner=self.cleaner)
        self.cleaner.account_status = User.AccountStatus.SUSPENDED
        self.cleaner.is_active = False
        self.cleaner.save(update_fields=["account_status", "is_active"])
        profile = self.cleaner.cleaner_profile
        profile.verification_status = CleanerProfile.VerificationStatus.SUSPENDED
        profile.save(update_fields=["verification_status"])

        self.client.force_authenticate(self.host)
        list_response = self.client.get("/api/marketplace/favourites/")
        rows = self.rows(list_response)

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], favourite.id)
        self.assert_no_private_fields(rows[0])

        self.client.force_authenticate(self.other_host)
        new_create_response = self.client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": self.cleaner.id},
            format="json",
        )
        self.assertEqual(new_create_response.status_code, 400)
        self.assertEqual(new_create_response.data, {"detail": self.ineligible_detail})
        self.assertFalse(
            FavouriteCleaner.objects.filter(host=self.other_host, cleaner=self.cleaner).exists()
        )
