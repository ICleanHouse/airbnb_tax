from __future__ import annotations

import base64
from io import BytesIO

from django.test import TestCase
from PIL import Image

from apps.accounts.models import CleanerProfile, User
from apps.accounts.serializers import CleanerProfileSerializer, SignupSerializer


CLEANER_MAX_DECODED_BYTES = 2 * 1024 * 1024


def data_url(image_format: str = "PNG", *, size: tuple[int, int] = (1000, 500)) -> str:
    image = Image.new("RGB", size, "blue")
    output = BytesIO()
    image.save(output, format=image_format)
    mime = {"JPEG": "jpeg", "PNG": "png", "WEBP": "webp"}[image_format]
    return f"data:image/{mime};base64,{base64.b64encode(output.getvalue()).decode('ascii')}"


def decode_data_url(value: str) -> Image.Image:
    encoded = value.split(",", 1)[1]
    image = Image.open(BytesIO(base64.b64decode(encoded)))
    image.load()
    return image


class CleanerProfileImageSecurityTests(TestCase):
    def setUp(self):
        self.cleaner = User.objects.create_user(
            username="profile-cleaner@example.test",
            email="profile-cleaner@example.test",
            role=User.Role.CLEANER,
            account_status=User.AccountStatus.APPROVED,
            preferred_language="en",
        )
        self.profile = CleanerProfile.objects.create(
            user=self.cleaner,
            display_name="Cleaner",
            profile_image="https://legacy.example.test/profile.jpg",
        )

    def update_image(self, value: str):
        serializer = CleanerProfileSerializer(
            self.profile,
            data={"profile_image": value},
            partial=True,
        )
        valid = serializer.is_valid()
        return serializer, valid

    def test_new_cleaner_png_is_stored_as_metadata_free_720_square_jpeg(self):
        serializer, valid = self.update_image(data_url("PNG"))

        self.assertTrue(valid, serializer.errors)
        updated = serializer.save()
        self.assertTrue(updated.profile_image.startswith("data:image/jpeg;base64,"))
        decoded = decode_data_url(updated.profile_image)
        self.addCleanup(decoded.close)
        self.assertEqual(decoded.format, "JPEG")
        self.assertEqual(decoded.mode, "RGB")
        self.assertEqual(decoded.size, (720, 720))
        self.assertEqual(dict(decoded.getexif()), {})

    def test_identical_legacy_url_remains_unchanged(self):
        legacy_url = self.profile.profile_image

        serializer, valid = self.update_image(legacy_url)

        self.assertTrue(valid, serializer.errors)
        self.assertEqual(serializer.save().profile_image, legacy_url)

    def test_different_new_external_url_is_rejected(self):
        serializer, valid = self.update_image("https://new.example.test/profile.jpg")

        self.assertFalse(valid)
        self.assertEqual(serializer.errors["profile_image"]["code"], "invalid_image")
        self.assertNotIn("new.example.test", str(serializer.errors))

    def test_profile_image_removal_remains_supported(self):
        serializer, valid = self.update_image("")

        self.assertTrue(valid, serializer.errors)
        self.assertEqual(serializer.save().profile_image, "")

    def test_signup_rejects_external_profile_image_urls(self):
        serializer = SignupSerializer()

        with self.assertRaises(Exception) as raised:
            serializer.validate_profile_image("https://new.example.test/profile.jpg")

        self.assertNotIn("new.example.test", str(raised.exception))

    def test_signup_normalizes_supported_data_url(self):
        serializer = SignupSerializer()

        normalized = serializer.validate_profile_image(data_url("JPEG"))

        decoded = decode_data_url(normalized)
        self.addCleanup(decoded.close)
        self.assertEqual(decoded.format, "JPEG")
        self.assertEqual(decoded.size, (720, 720))

    def test_invalid_and_oversized_data_urls_fail_with_safe_generic_error(self):
        serializer = SignupSerializer()
        oversized = "data:image/png;base64," + base64.b64encode(
            b"X" * (CLEANER_MAX_DECODED_BYTES + 1)
        ).decode("ascii")

        for value in ("data:image/png;base64,not-valid-base64!", oversized):
            with self.subTest(length=len(value)):
                with self.assertRaises(Exception) as raised:
                    serializer.validate_profile_image(value)
                body = str(raised.exception)
                self.assertNotIn("base64", body.casefold())
                self.assertNotIn("PRIVATE", body)
