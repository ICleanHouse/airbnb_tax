from __future__ import annotations

import tempfile
from io import BytesIO
from unittest import skipUnless
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image, PngImagePlugin, features
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.properties.models import Property, PropertyImage


PROPERTY_MAX_INPUT_BYTES = 10 * 1024 * 1024


def image_bytes(
    image_format: str,
    *,
    size: tuple[int, int] = (64, 40),
    mode: str = "RGB",
    exif=None,
    png_info=None,
    icc_profile: bytes | None = None,
) -> bytes:
    image = Image.new(mode, size, "red" if mode != "1" else 1)
    output = BytesIO()
    save_kwargs = {}
    if exif is not None:
        save_kwargs["exif"] = exif
    if png_info is not None:
        save_kwargs["pnginfo"] = png_info
    if icc_profile is not None:
        save_kwargs["icc_profile"] = icc_profile
    image.save(output, format=image_format, **save_kwargs)
    return output.getvalue()


def animated_image_bytes(image_format: str) -> bytes:
    frames = [Image.new("RGB", (20, 20), color) for color in ("red", "blue")]
    output = BytesIO()
    frames[0].save(
        output,
        format=image_format,
        save_all=True,
        append_images=frames[1:],
        duration=100,
        loop=0,
    )
    return output.getvalue()


class PropertyImageUploadSecurityTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.media_root.cleanup)
        self.host = User.objects.create_user(
            username="image-host@example.test",
            email="image-host@example.test",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
            preferred_language="en",
        )
        self.other_host = User.objects.create_user(
            username="other-image-host@example.test",
            email="other-image-host@example.test",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
            preferred_language="en",
        )
        self.property = Property.objects.create(host=self.host, name="Flat", city="Sofia")
        self.client = APIClient()
        self.client.force_authenticate(self.host)
        self.url = reverse("property-image-list")

    def upload(
        self,
        content: bytes,
        *,
        name: str = "PRIVATE-ORIGINAL-NAME.png",
        content_type: str = "image/png",
        property_id: int | None = None,
    ):
        upload = SimpleUploadedFile(name, content, content_type=content_type)
        return self.client.post(
            self.url,
            {
                "property_id": property_id or self.property.pk,
                "image": upload,
                "order": 0,
            },
            format="multipart",
        )

    def assert_safe_image_error(self, response):
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["image"]["code"], "invalid_image")
        body = str(response.data)
        self.assertNotIn("PRIVATE-ORIGINAL-NAME", body)
        self.assertNotIn("cannot identify image", body.casefold())
        self.assertNotIn("DecompressionBomb", body)
        self.assertNotIn("PIL", body)

    def assert_normalized_jpeg(self, image: PropertyImage, expected_size: tuple[int, int]):
        self.assertNotIn("PRIVATE-ORIGINAL-NAME", image.image.name)
        self.assertRegex(image.image.name, r"property_images/\d{4}/\d{2}/[0-9a-f]{32}\.jpg$")
        with image.image.open("rb") as stored:
            data = stored.read()
        with Image.open(BytesIO(data)) as decoded:
            decoded.load()
            self.assertEqual(decoded.format, "JPEG")
            self.assertEqual(decoded.mode, "RGB")
            self.assertEqual(decoded.size, expected_size)
            self.assertEqual(dict(decoded.getexif()), {})
            self.assertNotIn("icc_profile", decoded.info)
            self.assertNotIn("comment", decoded.info)
        return data

    def test_valid_jpeg_and_png_are_reencoded_as_generated_jpegs(self):
        cases = (("JPEG", "photo.jpg", "image/jpeg"), ("PNG", "photo.png", "image/png"))

        for image_format, filename, content_type in cases:
            with self.subTest(image_format=image_format):
                response = self.upload(
                    image_bytes(image_format),
                    name=filename,
                    content_type=content_type,
                )
                self.assertEqual(response.status_code, 201, response.data)
                self.assert_normalized_jpeg(PropertyImage.objects.get(pk=response.data["id"]), (64, 40))

    @skipUnless(features.check("webp"), "Pillow WebP support is unavailable")
    def test_valid_webp_is_reencoded_as_generated_jpeg(self):
        response = self.upload(
            image_bytes("WEBP"),
            name="photo.webp",
            content_type="image/webp",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assert_normalized_jpeg(PropertyImage.objects.get(pk=response.data["id"]), (64, 40))

    def test_extension_and_mime_are_not_authoritative_for_allowed_decoded_content(self):
        response = self.upload(
            image_bytes("PNG"),
            name="spoofed.svg",
            content_type="image/svg+xml",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assert_normalized_jpeg(PropertyImage.objects.get(pk=response.data["id"]), (64, 40))

    def test_invalid_truncated_and_unsupported_images_are_rejected(self):
        jpeg = image_bytes("JPEG")
        cases = (
            (b"PRIVATE-DECODER-SENTINEL", "invalid.png", "image/png"),
            (jpeg[:-20], "truncated.jpg", "image/jpeg"),
            (b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', "vector.svg", "image/svg+xml"),
            (image_bytes("GIF"), "image.gif", "image/gif"),
            (image_bytes("BMP"), "image.bmp", "image/bmp"),
            (image_bytes("TIFF"), "image.tiff", "image/tiff"),
        )

        for content, filename, content_type in cases:
            with self.subTest(filename=filename):
                response = self.upload(content, name=filename, content_type=content_type)
                self.assert_safe_image_error(response)

    def test_animated_image_is_rejected(self):
        response = self.upload(
            animated_image_bytes("GIF"),
            name="animated.gif",
            content_type="image/gif",
        )

        self.assert_safe_image_error(response)

    @skipUnless(features.check("webp"), "Pillow animated WebP support is unavailable")
    def test_animated_supported_format_is_rejected(self):
        response = self.upload(
            animated_image_bytes("WEBP"),
            name="animated.webp",
            content_type="image/webp",
        )

        self.assert_safe_image_error(response)

    def test_oversized_encoded_input_is_rejected_before_decoding(self):
        response = self.upload(b"X" * (PROPERTY_MAX_INPUT_BYTES + 1))

        self.assert_safe_image_error(response)

    def test_excessive_dimension_and_decoded_pixel_count_are_rejected(self):
        cases = (
            image_bytes("PNG", size=(8193, 1), mode="1"),
            image_bytes("PNG", size=(7000, 6000), mode="1"),
        )

        for content in cases:
            with self.subTest(encoded_size=len(content)):
                response = self.upload(content)
                self.assert_safe_image_error(response)

    def test_pillow_decompression_bomb_is_rejected_safely(self):
        with patch.object(Image, "MAX_IMAGE_PIXELS", 1):
            response = self.upload(image_bytes("PNG", size=(20, 20)))

        self.assert_safe_image_error(response)

    def test_exif_orientation_is_applied_before_rendering(self):
        exif = Image.Exif()
        exif[0x0112] = 6

        response = self.upload(image_bytes("JPEG", size=(40, 20), exif=exif))

        self.assertEqual(response.status_code, 201, response.data)
        self.assert_normalized_jpeg(PropertyImage.objects.get(pk=response.data["id"]), (20, 40))

    def test_exif_gps_icc_comments_and_other_metadata_are_removed(self):
        exif = Image.Exif()
        exif[0x0112] = 1
        exif[0x010E] = "PRIVATE-EXIF-SENTINEL"
        exif[0x8825] = {1: "N", 2: (1.0, 2.0, 3.0)}
        png_info = PngImagePlugin.PngInfo()
        png_info.add_text("Comment", "PRIVATE-COMMENT-SENTINEL")
        png_info.add_text("XML:com.adobe.xmp", "PRIVATE-XMP-SENTINEL")

        jpeg_response = self.upload(
            image_bytes("JPEG", exif=exif, icc_profile=b"PRIVATE-ICC-SENTINEL"),
            name="metadata.jpg",
            content_type="image/jpeg",
        )
        png_response = self.upload(
            image_bytes("PNG", png_info=png_info),
            name="metadata.png",
            content_type="image/png",
        )

        self.assertEqual(jpeg_response.status_code, 201, jpeg_response.data)
        self.assertEqual(png_response.status_code, 201, png_response.data)
        stored = b"".join(
            self.assert_normalized_jpeg(PropertyImage.objects.get(pk=response.data["id"]), (64, 40))
            for response in (jpeg_response, png_response)
        )
        self.assertNotIn(b"PRIVATE-EXIF-SENTINEL", stored)
        self.assertNotIn(b"PRIVATE-ICC-SENTINEL", stored)
        self.assertNotIn(b"PRIVATE-COMMENT-SENTINEL", stored)
        self.assertNotIn(b"PRIVATE-XMP-SENTINEL", stored)

    def test_large_image_is_resized_within_2048_bounds(self):
        response = self.upload(image_bytes("JPEG", size=(4000, 2000)))

        self.assertEqual(response.status_code, 201, response.data)
        self.assert_normalized_jpeg(PropertyImage.objects.get(pk=response.data["id"]), (2048, 1024))

    def test_nonowner_cannot_upload_to_another_hosts_property(self):
        other_property = Property.objects.create(host=self.other_host, name="Other", city="Sofia")

        response = self.upload(image_bytes("PNG"), property_id=other_property.pk)

        self.assertEqual(response.status_code, 403)

    def test_authorized_content_route_serves_only_the_normalized_jpeg(self):
        upload_response = self.upload(image_bytes("PNG"))
        image = PropertyImage.objects.get(pk=upload_response.data["id"])

        response = self.client.get(reverse("property-image-content", kwargs={"pk": image.pk}))

        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/jpeg")
        self.assertIn("property-image.jpg", response["Content-Disposition"])
