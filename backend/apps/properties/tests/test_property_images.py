import tempfile
from base64 import b64decode
from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AgencyProfile, CleanerProfile, User
from apps.marketplace.models import Assignment, CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property, PropertyImage
from apps.properties.serializers import PropertyImageSerializer


PNG_BYTES = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class PropertyImagePrivacyTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.media_root.cleanup)

        self.host = self._user("host@example.com", User.Role.HOST)
        self.other_host = self._user("other-host@example.com", User.Role.HOST)
        self.cleaner = self._user("cleaner@example.com", User.Role.CLEANER)
        CleanerProfile.objects.create(
            user=self.cleaner,
            display_name="Verified Cleaner",
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        )
        self.unverified_cleaner = self._user("unverified@example.com", User.Role.CLEANER)
        CleanerProfile.objects.create(
            user=self.unverified_cleaner,
            display_name="Unverified Cleaner",
            verification_status=CleanerProfile.VerificationStatus.PENDING,
        )
        self.agency = self._user("agency@example.com", User.Role.AGENCY)
        AgencyProfile.objects.create(user=self.agency, company_name="Agency")
        self.admin = self._user("admin@example.com", User.Role.ADMIN)

        self.property = Property.objects.create(host=self.host, name="Private Flat", city="Sofia")
        self.image = PropertyImage.objects.create(
            property=self.property,
            image=ContentFile(PNG_BYTES, name="private-flat-bedroom.png"),
        )
        self.url = reverse("property-image-content", kwargs={"pk": self.image.pk})

    @staticmethod
    def _user(email, role, *, account_status=User.AccountStatus.APPROVED):
        return User.objects.create_user(
            username=email,
            email=email,
            password=None,
            role=role,
            account_status=account_status,
        )

    def _client(self, user=None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        return client

    def _assign(self, cleaner, *, assigned_member=None, cancelled=False):
        start = timezone.now() + timedelta(days=1)
        job = create_cleaning_job_record(
            property=self.property,
            host=self.host,
            title="Assigned clean",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            status=CleaningJob.Status.ASSIGNED,
        )
        return Assignment.objects.create(
            job=job,
            cleaner=cleaner,
            assigned_member=assigned_member,
            cancelled_at=timezone.now() if cancelled else None,
        )

    def assert_safe_image_response(self, response):
        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')
        self.assertEqual(response["Cross-Origin-Resource-Policy"], "same-origin")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertIn("Cookie", response["Vary"])
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertIn("property-image.png", response["Content-Disposition"])
        self.assertNotIn(str(self.image.pk), response["Content-Disposition"])
        self.assertNotIn("property_images", response["Content-Disposition"])
        self.assertNotIn("private-flat-bedroom", response["Content-Disposition"])

    def test_serializer_exposes_only_protected_content_url(self):
        data = PropertyImageSerializer(self.image).data

        self.assertEqual(data["content_url"], self.url)
        self.assertNotIn("image", data)
        self.assertNotIn("property_id", data)
        self.assertNotIn(self.image.image.name, str(data))

    def test_image_upload_field_is_write_only(self):
        serializer = PropertyImageSerializer(
            data={
                "property_id": self.property.pk,
                "image": ContentFile(PNG_BYTES, name="upload.png"),
                "caption": "Bedroom",
                "order": 0,
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        uploaded = serializer.save()
        self.assertNotIn("image", PropertyImageSerializer(uploaded).data)

    def test_owner_can_stream_image_with_safe_headers_in_one_query(self):
        with self.assertNumQueries(1):
            response = self._client(self.host).get(self.url)

        self.assert_safe_image_response(response)
        self.assertEqual(b"".join(response.streaming_content), PNG_BYTES)

    def test_head_uses_the_same_authorization_and_safe_headers(self):
        response = self._client(self.host).head(self.url)

        self.assert_safe_image_response(response)

    def test_assigned_verified_cleaner_can_stream_image(self):
        self._assign(self.cleaner)

        with self.assertNumQueries(2):
            response = self._client(self.cleaner).get(self.url)

        self.assert_safe_image_response(response)

    def test_assigned_participant_cannot_stream_non_primary_property_image(self):
        secondary = PropertyImage.objects.create(
            property=self.property,
            image=ContentFile(PNG_BYTES, name="secondary.png"),
            order=1,
        )
        self._assign(self.cleaner)

        with self.assertNumQueries(2):
            response = self._client(self.cleaner).get(
                reverse("property-image-content", kwargs={"pk": secondary.pk})
            )

        self.assertEqual(response.status_code, 404)

    def test_owner_can_stream_non_primary_property_image(self):
        secondary = PropertyImage.objects.create(
            property=self.property,
            image=ContentFile(PNG_BYTES, name="secondary.png"),
            order=1,
        )

        with self.assertNumQueries(1):
            response = self._client(self.host).get(
                reverse("property-image-content", kwargs={"pk": secondary.pk})
            )

        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)

    def test_completed_assignment_does_not_grant_image_access(self):
        assignment = self._assign(self.cleaner)
        assignment.job.status = CleaningJob.Status.COMPLETED
        assignment.job.save(update_fields=["status"])

        with self.assertNumQueries(2):
            response = self._client(self.cleaner).get(self.url)

        self.assertEqual(response.status_code, 404)

    def test_admin_can_stream_image(self):
        with self.assertNumQueries(1):
            response = self._client(self.admin).get(self.url)

        self.assert_safe_image_response(response)

    def test_assigned_agency_can_stream_image(self):
        self._assign(self.agency)

        with self.assertNumQueries(2):
            response = self._client(self.agency).get(self.url)

        self.assert_safe_image_response(response)

    def test_assigned_verified_agency_member_can_stream_image(self):
        self._assign(self.agency, assigned_member=self.cleaner)

        with self.assertNumQueries(2):
            response = self._client(self.cleaner).get(self.url)

        self.assert_safe_image_response(response)

    def test_anonymous_request_preserves_authentication_failure(self):
        response = self._client().get(self.url)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')
        self.assertEqual(response["Cross-Origin-Resource-Policy"], "same-origin")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertIn("Cookie", response["Vary"])

    def test_raw_property_storage_path_is_not_served_in_debug(self):
        response = self._client(self.host).get(f"/media/{self.image.image.name}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')
        self.assertEqual(response["Cross-Origin-Resource-Policy"], "same-origin")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")

    def test_no_raw_media_path_is_served_even_when_a_file_exists(self):
        path = default_storage.save(
            "unexpected-private/probe.txt",
            ContentFile(b"PRIVATE_RAW_MEDIA_SENTINEL"),
        )
        self.addCleanup(default_storage.delete, path)

        response = self._client(self.host).get(f"/media/{path}")

        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b"PRIVATE_RAW_MEDIA_SENTINEL", response.content)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')
        self.assertEqual(response["Cross-Origin-Resource-Policy"], "same-origin")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")

    def test_property_and_image_api_responses_clear_previously_cached_private_data(self):
        client = self._client(self.host)
        urls = (
            reverse("property-list"),
            reverse("property-detail", kwargs={"pk": self.property.pk}),
            reverse("property-image-list"),
            reverse("property-image-detail", kwargs={"pk": self.image.pk}),
        )

        for url in urls:
            with self.subTest(url=url):
                response = client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["Cache-Control"], "private, no-store")
                self.assertEqual(response["Pragma"], "no-cache")
                self.assertEqual(response["Clear-Site-Data"], '"cache"')

    def test_unrelated_authenticated_user_receives_404(self):
        response = self._client(self.other_host).get(self.url)

        self.assertEqual(response.status_code, 404)

    def test_verified_worker_or_agency_without_assignment_receives_404(self):
        for user in (self.cleaner, self.agency):
            with self.subTest(role=user.role):
                response = self._client(user).get(self.url)
                self.assertEqual(response.status_code, 404)

    def test_pending_owner_receives_404(self):
        pending_host = self._user(
            "pending-host@example.com",
            User.Role.HOST,
            account_status=User.AccountStatus.PENDING,
        )
        self.property.host = pending_host
        self.property.save(update_fields=["host"])

        response = self._client(pending_host).get(self.url)

        self.assertEqual(response.status_code, 404)

        list_response = self._client(pending_host).get(reverse("property-image-list"))
        detail_response = self._client(pending_host).get(
            reverse("property-image-detail", kwargs={"pk": self.image.pk})
        )
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data, [])
        self.assertEqual(detail_response.status_code, 404)

    def test_unverified_assigned_cleaner_receives_404(self):
        self._assign(self.unverified_cleaner)

        response = self._client(self.unverified_cleaner).get(self.url)

        self.assertEqual(response.status_code, 404)

    def test_cancelled_assignment_does_not_grant_image_access(self):
        self._assign(self.cleaner, cancelled=True)

        response = self._client(self.cleaner).get(self.url)

        self.assertEqual(response.status_code, 404)

    def test_unsupported_file_extension_returns_404(self):
        unsupported = PropertyImage.objects.create(
            property=self.property,
            image=ContentFile(PNG_BYTES, name="renamed.svg"),
            order=2,
        )

        response = self._client(self.host).get(
            reverse("property-image-content", kwargs={"pk": unsupported.pk})
        )

        self.assertEqual(response.status_code, 404)

    def test_invalid_image_content_returns_404(self):
        invalid = PropertyImage.objects.create(
            property=self.property,
            image=ContentFile(b"not an image", name="spoofed.png"),
            order=2,
        )

        response = self._client(self.host).get(
            reverse("property-image-content", kwargs={"pk": invalid.pk})
        )

        self.assertEqual(response.status_code, 404)
