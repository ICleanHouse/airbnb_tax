from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import CleanerProfile, HostProfile, User
from apps.marketplace.models import FavouriteCleaner


@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class FavouriteCleanerSerializerRegressionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = User.objects.create_user(
            username="host",
            email="host@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.host)
        self.cleaner = User.objects.create_user(
            username="cleaner",
            email="cleaner@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
        )
        CleanerProfile.objects.create(
            user=self.cleaner,
            display_name="Cleaner",
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
            profile_image="https://cdn.example.test/profile.jpg",
        )

    def test_favourite_profile_image_serializes_text_url_without_url_attribute(self):
        FavouriteCleaner.objects.create(host=self.host, cleaner=self.cleaner)
        self.client.force_authenticate(self.host)

        response = self.client.get("/api/marketplace/favourites/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["profile_image"], "https://cdn.example.test/profile.jpg")
