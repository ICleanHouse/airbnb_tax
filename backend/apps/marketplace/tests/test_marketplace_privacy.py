from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AgencyProfile, CleanerProfile, HostProfile, User
from apps.locations.models import City, ServiceZone
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property, PropertyImage


PRIVATE_SENTINELS = {
    "PRIVATE PROPERTY TITLE",
    "99 Private Street",
    "PRIVATE HOST",
    "PRIVATE JOB TITLE",
    "PRIVATE DESCRIPTION",
    "PRIVATE INSTRUCTIONS",
    "property-secret.jpg",
}


@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class MarketplacePrivacyBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.application_email_patcher = patch(
            "apps.marketplace.services.send_application_submitted_email.delay",
            return_value=None,
        )
        self.application_email_patcher.start()
        self.addCleanup(self.application_email_patcher.stop)
        self.city = City.objects.get(slug="sofia")
        self.zone = ServiceZone.objects.get(city=self.city, slug="osm-66")
        self.host = User.objects.create_user(
            username="private-host",
            first_name="PRIVATE",
            last_name="HOST",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        HostProfile.objects.create(user=self.host, city="Sofia")
        self.property = Property.objects.create(
            host=self.host,
            service_zone=self.zone,
            name="PRIVATE PROPERTY TITLE",
            address="99 Private Street",
            city="Sofia",
            neighborhood="ж.к. Лозенец",
            latitude=Decimal("42.680001"),
            longitude=Decimal("23.320001"),
            bedrooms=2,
            square_meters=Decimal("74.50"),
            cleaning_instructions="PRIVATE PROPERTY INSTRUCTIONS",
        )
        self.image = PropertyImage.objects.create(
            property=self.property,
            image=ContentFile(b"private image", name="property-secret.jpg"),
        )
        self.job = self.create_job()
        self.cleaner = self.create_cleaner("verified-cleaner")
        self.unverified_cleaner = self.create_cleaner(
            "unverified-cleaner",
            verification_status=CleanerProfile.VerificationStatus.PENDING,
        )
        self.agency = User.objects.create_user(
            username="approved-agency",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        AgencyProfile.objects.create(user=self.agency, company_name="Approved Agency")

    def create_cleaner(
        self,
        username,
        *,
        account_status=User.AccountStatus.APPROVED,
        verification_status=CleanerProfile.VerificationStatus.VERIFIED,
    ):
        user = User.objects.create_user(
            username=username,
            role=User.Role.CLEANER,
            account_status=account_status,
        )
        CleanerProfile.objects.create(
            user=user,
            display_name=username,
            verification_status=verification_status,
        )
        return user

    def create_job(self, *, days=2, status=CleaningJob.Status.OPEN, host=None, property_obj=None):
        host = host or self.host
        property_obj = property_obj or self.property
        start = timezone.now().replace(microsecond=0) + timedelta(days=days)
        return create_cleaning_job_record(
            property=property_obj,
            host=host,
            title="PRIVATE JOB TITLE",
            description="PRIVATE DESCRIPTION",
            cleaning_instructions="PRIVATE INSTRUCTIONS",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            proposed_price=Decimal("45.00"),
            agreed_price=Decimal("55.00") if status != CleaningJob.Status.OPEN else None,
            status=status,
        )

    def assert_no_private_sentinels(self, value):
        serialized = str(value)
        for sentinel in PRIVATE_SENTINELS:
            self.assertNotIn(sentinel, serialized)
        self.assertNotIn("42.680001", serialized)
        self.assertNotIn("23.320001", serialized)

    def assert_forbidden_keys_absent(self, value):
        forbidden = {
            "property",
            "property_id",
            "host",
            "host_id",
            "latitude",
            "longitude",
            "address",
            "property_address",
            "property_image",
            "image",
            "media",
            "title",
            "description",
            "cleaning_instructions",
            "agreed_price",
        }
        if isinstance(value, dict):
            self.assertTrue(forbidden.isdisjoint(value))
            for nested in value.values():
                self.assert_forbidden_keys_absent(nested)
        elif isinstance(value, list):
            for nested in value:
                self.assert_forbidden_keys_absent(nested)


class PublicDemandPrivacyTests(MarketplacePrivacyBase):
    def test_public_demand_is_canonical_aggregate_only(self):
        response = self.client.get("/api/marketplace/public-demand/?city=sofia")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')
        self.assertEqual(
            response.data,
            {
                "cities": [
                    {
                        "city_slug": "sofia",
                        "city_name_bg": "София",
                        "city_name_en": "Sofia",
                        "open_job_count": 1,
                        "zones": [
                            {
                                "zone_id": "sofia:osm-66",
                                "zone_name_bg": "ж.к. Лозенец",
                                "zone_name_en": self.zone.name_en,
                                "open_job_count": 1,
                            }
                        ],
                    }
                ]
            },
        )
        self.assert_no_private_sentinels(response.data)
        self.assert_forbidden_keys_absent(response.data)

    def test_compatibility_alias_is_safe_and_deprecated(self):
        canonical = self.client.get("/api/marketplace/public-demand/")
        alias = self.client.get("/api/marketplace/open-job-locations/")

        self.assertEqual(alias.status_code, 200)
        self.assertEqual(alias.data, canonical.data)
        self.assertEqual(alias["Deprecation"], "true")
        self.assertEqual(alias["Sunset"], "Thu, 15 Oct 2026 00:00:00 GMT")
        self.assertIn("/api/marketplace/public-demand/", alias["Link"])
        self.assertEqual(alias["Cache-Control"], "no-store")
        self.assert_no_private_sentinels(alias.data)
        self.assert_forbidden_keys_absent(alias.data)

    def test_public_demand_excludes_stale_and_ineligible_host_jobs(self):
        self.create_job(days=-2)
        blocked_host = User.objects.create_user(
            username="blocked-host",
            role=User.Role.HOST,
            account_status=User.AccountStatus.SUSPENDED,
        )
        blocked_property = Property.objects.create(
            host=blocked_host,
            service_zone=self.zone,
            name="Blocked",
            city="Sofia",
        )
        self.create_job(host=blocked_host, property_obj=blocked_property)

        response = self.client.get("/api/marketplace/public-demand/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cities"][0]["open_job_count"], 1)

    def test_unknown_city_slug_is_public_404(self):
        response = self.client.get("/api/marketplace/public-demand/?city=unknown")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')

    def test_malformed_city_filters_are_public_400(self):
        for city in ("Sofia", "not a slug", "sofia%00", "x" * 65):
            with self.subTest(city=city):
                response = self.client.get(
                    "/api/marketplace/public-demand/",
                    {"city": city},
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "invalid_city_filter")
                self.assertEqual(response["Cache-Control"], "no-store")
                self.assertEqual(response["Clear-Site-Data"], '"cache"')

    def test_noncanonical_sofia_alias_is_never_emitted(self):
        alias_zone = ServiceZone.objects.create(
            city=self.city,
            slug="lozenets",
            name_bg="Лозенец alias",
            name_en="Lozenets alias",
        )
        alias_property = Property.objects.create(
            host=self.host,
            service_zone=alias_zone,
            name="Alias property",
            city="Sofia",
            neighborhood="Legacy Alias",
        )
        alias_job = self.create_job(property_obj=alias_property)

        public_response = self.client.get("/api/marketplace/public-demand/?city=sofia")
        self.assertEqual(public_response.status_code, 200)
        self.assertEqual(public_response.data["cities"][0]["open_job_count"], 2)
        self.assertNotIn("sofia:lozenets", str(public_response.data))

        self.client.force_authenticate(self.cleaner)
        evaluator_response = self.client.get("/api/marketplace/jobs/")
        alias_result = next(item for item in evaluator_response.data if item["id"] == alias_job.id)
        self.assertEqual(alias_result["city_slug"], "sofia")
        self.assertIsNone(alias_result["zone_id"])
        self.assertIsNone(alias_result["zone_name_bg"])
        self.assertIsNone(alias_result["zone_name_en"])

    def test_non_sofia_zone_is_city_only_and_evaluator_zone_is_null(self):
        plovdiv = City.objects.create(
            slug="plovdiv",
            name_bg="Пловдив",
            name_en="Plovdiv",
            sort_order=200,
        )
        unapproved_zone = ServiceZone.objects.create(
            city=plovdiv,
            slug="center",
            name_bg="Център",
            name_en="Center",
        )
        property_obj = Property.objects.create(
            host=self.host,
            service_zone=unapproved_zone,
            name="Plovdiv property",
            city="Plovdiv",
            neighborhood="Center",
        )
        job = self.create_job(property_obj=property_obj)

        public_response = self.client.get("/api/marketplace/public-demand/")
        plovdiv_result = next(
            city for city in public_response.data["cities"] if city["city_slug"] == "plovdiv"
        )
        self.assertEqual(plovdiv_result["open_job_count"], 1)
        self.assertEqual(plovdiv_result["zones"], [])
        self.assertNotIn("plovdiv:center", str(public_response.data))

        self.client.force_authenticate(self.cleaner)
        evaluator_response = self.client.get("/api/marketplace/jobs/")
        evaluator_job = next(item for item in evaluator_response.data if item["id"] == job.id)
        self.assertEqual(evaluator_job["city_slug"], "plovdiv")
        self.assertIsNone(evaluator_job["zone_id"])

    def test_legacy_city_fallback_is_strictly_case_sensitive(self):
        legacy_property = Property.objects.create(
            host=self.host,
            name="Wrong case city",
            city="sOfIa",
        )
        legacy_job = self.create_job(property_obj=legacy_property)

        public_response = self.client.get("/api/marketplace/public-demand/")
        self.assertEqual(public_response.data["cities"][0]["open_job_count"], 1)

        self.client.force_authenticate(self.cleaner)
        evaluator_response = self.client.get("/api/marketplace/jobs/")
        legacy_result = next(
            item for item in evaluator_response.data if item["id"] == legacy_job.id
        )
        self.assertEqual(legacy_result["city_slug"], "")
        self.assertEqual(legacy_result["city_name_bg"], "")
        self.assertIsNone(legacy_result["zone_id"])

    def test_ambiguous_exact_legacy_zone_name_remains_city_only(self):
        duplicate_zone = ServiceZone.objects.get(city=self.city, slug="osm-67")
        duplicate_zone.name_bg = self.zone.name_bg
        duplicate_zone.save(update_fields=["name_bg", "updated_at"])
        legacy_property = Property.objects.create(
            host=self.host,
            name="Ambiguous legacy zone",
            city=self.city.name_en,
            neighborhood=self.zone.name_bg,
        )
        self.create_job(property_obj=legacy_property)

        response = self.client.get("/api/marketplace/public-demand/?city=sofia")

        self.assertEqual(response.status_code, 200)
        city = response.data["cities"][0]
        self.assertEqual(city["open_job_count"], 2)
        osm_66 = next(zone for zone in city["zones"] if zone["zone_id"] == "sofia:osm-66")
        self.assertEqual(osm_66["open_job_count"], 1)


class EvaluatorJobPrivacyTests(MarketplacePrivacyBase):
    evaluator_keys = {
        "id",
        "access_tier",
        "city_slug",
        "city_name_bg",
        "city_name_en",
        "zone_id",
        "zone_name_bg",
        "zone_name_en",
        "scheduled_start",
        "scheduled_end",
        "currency",
        "proposed_price",
        "bedrooms",
        "square_metres",
        "status",
        "can_apply",
    }
    assigned_job_keys = evaluator_keys | {
        "property_name",
        "property_address",
        "property_image",
        "host",
        "host_name",
        "agreed_price",
        "cleaning_instructions",
        "assignment",
        "available_actions",
    }
    history_job_keys = evaluator_keys | {
        "host",
        "host_name",
        "agreed_price",
        "assignment",
    }
    assigned_assignment_keys = {
        "id",
        "job",
        "cleaner",
        "assigned_member",
        "application",
        "agreed_price",
        "assigned_at",
        "cancelled_at",
        "host_completed_at",
        "cleaner_completed_at",
        "completed_at",
        "available_actions",
    }

    def test_anonymous_job_discovery_preserves_authentication_response(self):
        response = self.client.get("/api/marketplace/jobs/")
        self.assertEqual(response.status_code, 403)

    def test_verified_cleaner_receives_only_s1_d04_evaluator_allowlist(self):
        self.client.force_authenticate(self.cleaner)
        response = self.client.get("/api/marketplace/jobs/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(set(response.data[0]), self.evaluator_keys)
        self.assertEqual(response.data[0]["access_tier"], "evaluator")
        self.assertEqual(response.data[0]["zone_id"], "sofia:osm-66")
        self.assertEqual(response.data[0]["square_metres"], "74.50")
        self.assertTrue(response.data[0]["can_apply"])
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')
        self.assert_no_private_sentinels(response.data[0])
        self.assert_forbidden_keys_absent(response.data[0])

    def test_evaluator_filters_never_probe_raw_property_location_text(self):
        self.property.neighborhood = "Private Probe Token"
        self.property.save(update_fields=["neighborhood", "updated_at"])
        self.client.force_authenticate(self.cleaner)

        unfiltered = self.client.get("/api/marketplace/jobs/")
        raw_neighborhood_probe = self.client.get(
            "/api/marketplace/jobs/",
            {"neighborhood": "Private Probe Token"},
        )
        nonmatching_neighborhood_probe = self.client.get(
            "/api/marketplace/jobs/",
            {"neighborhood": "Definitely Not The Private Value"},
        )
        canonical_city = self.client.get(
            "/api/marketplace/jobs/",
            {"city": "sofia"},
        )
        raw_city_probe = self.client.get(
            "/api/marketplace/jobs/",
            {"city": "Sofia"},
        )
        canonical_zone = self.client.get(
            "/api/marketplace/jobs/",
            {"zone_id": "sofia:osm-66"},
        )

        self.assertEqual(unfiltered.status_code, 200)
        self.assertEqual(raw_neighborhood_probe.data, unfiltered.data)
        self.assertEqual(nonmatching_neighborhood_probe.data, unfiltered.data)
        self.assertEqual(canonical_city.data, unfiltered.data)
        self.assertEqual(canonical_zone.data, unfiltered.data)
        self.assertEqual(raw_city_probe.status_code, 400)
        self.assertNotIn("Private Probe Token", str(raw_neighborhood_probe.data))

    def test_approved_agency_receives_same_evaluator_allowlist(self):
        self.client.force_authenticate(self.agency)
        response = self.client.get("/api/marketplace/jobs/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data[0]), self.evaluator_keys)

    def test_unverified_cleaner_sees_no_jobs_and_detail_is_hidden(self):
        self.client.force_authenticate(self.unverified_cleaner)

        listing = self.client.get("/api/marketplace/jobs/")
        detail = self.client.get(f"/api/marketplace/jobs/{self.job.id}/")

        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data, [])
        self.assertEqual(detail.status_code, 404)

    def test_evaluator_can_read_but_cannot_mutate_visible_open_job(self):
        self.client.force_authenticate(self.cleaner)

        delete_response = self.client.delete(f"/api/marketplace/jobs/{self.job.id}/")
        offer_response = self.client.post(
            f"/api/marketplace/jobs/{self.job.id}/offer/",
            {"cleaner_id": self.unverified_cleaner.id},
            format="json",
        )
        complete_response = self.client.post(
            f"/api/marketplace/jobs/{self.job.id}/complete/"
        )

        self.assertEqual(delete_response.status_code, 404)
        for response in (offer_response, complete_response):
            self.assertEqual(response.status_code, 403)
        for response in (delete_response, offer_response, complete_response):
            self.assertEqual(response["Cache-Control"], "private, no-store")
            self.assertEqual(response["Clear-Site-Data"], '"cache"')
        self.assertTrue(CleaningJob.objects.filter(pk=self.job.pk).exists())

    def test_worker_create_routes_reject_before_resolving_private_property_ids(self):
        self.client.force_authenticate(self.cleaner)

        for endpoint in (
            "/api/marketplace/jobs/",
            "/api/marketplace/batches/",
            "/api/marketplace/jobs/offer-to-cleaner/",
        ):
            with self.subTest(endpoint=endpoint, property="existing"):
                existing = self.client.post(
                    endpoint,
                    {"property_id": self.property.id},
                    format="json",
                )
            with self.subTest(endpoint=endpoint, property="unknown"):
                unknown = self.client.post(
                    endpoint,
                    {"property_id": self.property.id + 999_999},
                    format="json",
                )

            self.assertEqual(existing.status_code, 403)
            self.assertEqual(unknown.status_code, 403)

    def test_assigned_cleaner_receives_operational_tier_without_raw_media_paths(self):
        application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            status=CleanerApplication.Status.ACCEPTED,
        )
        assignment = Assignment.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            application=application,
            agreed_price=Decimal("55.00"),
        )
        self.job.status = CleaningJob.Status.ASSIGNED
        self.job.agreed_price = Decimal("55.00")
        self.job.save(update_fields=["status", "agreed_price", "updated_at"])
        self.client.force_authenticate(self.cleaner)

        response = self.client.get(f"/api/marketplace/jobs/{self.job.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), self.assigned_job_keys)
        self.assertEqual(set(response.data["assignment"]), self.assigned_assignment_keys)
        self.assertEqual(response.data["access_tier"], "assigned")
        self.assertEqual(response.data["property_address"], "99 Private Street")
        self.assertEqual(
            response.data["property_image"],
            f"/api/properties/images/{self.image.id}/content/",
        )
        self.assertEqual(response.data["assignment"]["id"], assignment.id)
        self.assertNotIn("title", response.data)
        self.assertNotIn("description", response.data)
        self.assertNotIn("latitude", response.data)
        self.assertNotIn("longitude", response.data)
        self.assertNotIn("/media/", str(response.data))
        self.assertEqual(response["Clear-Site-Data"], '"cache"')

        assignment_response = self.client.get("/api/marketplace/assignments/")
        self.assertEqual(assignment_response.status_code, 200)
        self.assertEqual(len(assignment_response.data), 1)
        self.assertEqual(
            set(assignment_response.data[0]),
            self.assigned_assignment_keys,
        )

    def test_assigned_cleaner_calendar_has_exact_operational_allowlist(self):
        application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            status=CleanerApplication.Status.ACCEPTED,
        )
        assignment = Assignment.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            application=application,
            agreed_price=Decimal("55.00"),
        )
        self.job.status = CleaningJob.Status.ASSIGNED
        self.job.agreed_price = Decimal("55.00")
        self.job.save(update_fields=["status", "agreed_price", "updated_at"])
        self.client.force_authenticate(self.cleaner)

        response = self.client.get("/api/marketplace/calendar/")

        expected_keys = {
            "id",
            "item_type",
            "job",
            "application",
            "assignment",
            "access_tier",
            "city_slug",
            "city_name_bg",
            "city_name_en",
            "zone_id",
            "zone_name_bg",
            "zone_name_en",
            "scheduled_start",
            "scheduled_end",
            "currency",
            "proposed_price",
            "bedrooms",
            "square_metres",
            "status",
            "property_name",
            "property_address",
            "property_image",
            "host",
            "host_name",
            "agreed_price",
            "cleaning_instructions",
            "application_status",
            "application_origin",
            "host_completed_at",
            "cleaner_completed_at",
            "completed_at",
            "can_apply",
            "can_complete",
        }
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(set(response.data[0]), expected_keys)
        self.assertEqual(response.data[0]["assignment"], assignment.id)
        self.assertEqual(
            response.data[0]["property_image"],
            f"/api/properties/images/{self.image.id}/content/",
        )
        self.assertNotIn("title", response.data[0])
        self.assertNotIn("description", response.data[0])

    def test_assigned_and_history_host_display_never_falls_back_to_email(self):
        host_contact = "PRIVATE_HOST_CONTACT@example.test"
        self.host.username = host_contact
        self.host.email = host_contact
        self.host.first_name = ""
        self.host.last_name = ""
        self.host.save(update_fields=["username", "email", "first_name", "last_name"])
        application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            status=CleanerApplication.Status.ACCEPTED,
        )
        assignment = Assignment.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            application=application,
            agreed_price=Decimal("55.00"),
        )
        self.job.status = CleaningJob.Status.ASSIGNED
        self.job.save(update_fields=["status", "updated_at"])
        self.client.force_authenticate(self.cleaner)

        assigned_detail = self.client.get(f"/api/marketplace/jobs/{self.job.id}/")
        assigned_calendar = self.client.get("/api/marketplace/calendar/")

        assignment.completed_at = timezone.now()
        assignment.save(update_fields=["completed_at", "updated_at"])
        self.job.status = CleaningJob.Status.COMPLETED
        self.job.save(update_fields=["status", "updated_at"])
        history_detail = self.client.get(f"/api/marketplace/jobs/{self.job.id}/")
        history_calendar = self.client.get("/api/marketplace/calendar/")

        responses = (
            assigned_detail.data,
            assigned_calendar.data[0],
            history_detail.data,
            history_calendar.data[0],
        )
        for payload in responses:
            self.assertEqual(payload["host_name"], "Host")
            self.assertNotIn(host_contact, str(payload))

    def test_completed_job_uses_history_tier_without_operational_property_secrets(self):
        application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            status=CleanerApplication.Status.ACCEPTED,
        )
        assignment = Assignment.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            application=application,
            agreed_price=Decimal("55.00"),
            completed_at=timezone.now(),
        )
        self.job.status = CleaningJob.Status.COMPLETED
        self.job.agreed_price = Decimal("55.00")
        self.job.save(update_fields=["status", "agreed_price", "updated_at"])
        self.client.force_authenticate(self.cleaner)

        detail = self.client.get(f"/api/marketplace/jobs/{self.job.id}/")
        calendar = self.client.get("/api/marketplace/calendar/")

        self.assertEqual(detail.status_code, 200)
        self.assertEqual(set(detail.data), self.history_job_keys)
        self.assertEqual(detail.data["access_tier"], "history")
        self.assertEqual(detail.data["host"], self.host.id)
        self.assertEqual(detail.data["assignment"]["id"], assignment.id)
        for forbidden in (
            "property_name",
            "property_address",
            "property_image",
            "cleaning_instructions",
        ):
            self.assertNotIn(forbidden, detail.data)

        self.assertEqual(calendar.status_code, 200)
        history_item = next(item for item in calendar.data if item["job"] == self.job.id)
        self.assertEqual(history_item["access_tier"], "history")
        for forbidden in (
            "property_name",
            "property_address",
            "property_image",
            "cleaning_instructions",
        ):
            self.assertNotIn(forbidden, history_item)
        self.assertEqual(history_item["host"], self.host.id)
        self.assertEqual(history_item["assignment"], assignment.id)

    def test_accept_offer_response_uses_worker_assignment_allowlist(self):
        offer = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            origin=CleanerApplication.Origin.HOST_OFFERED,
            status=CleanerApplication.Status.PENDING,
            proposed_price=Decimal("55.00"),
        )
        self.client.force_authenticate(self.cleaner)

        response = self.client.post(
            f"/api/marketplace/applications/{offer.id}/accept-offer/"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.data), self.assigned_assignment_keys)
        self.assertNotIn("job_title", response.data)
        self.assertNotIn("job_property_neighborhood", response.data)
        self.assertNotIn("cleaner_email", response.data)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')

    def test_other_cleaner_cannot_retrieve_assigned_job(self):
        other = self.create_cleaner("other-cleaner")
        application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            status=CleanerApplication.Status.ACCEPTED,
        )
        Assignment.objects.create(job=self.job, cleaner=self.cleaner, application=application)
        self.job.status = CleaningJob.Status.ASSIGNED
        self.job.save(update_fields=["status", "updated_at"])
        self.client.force_authenticate(other)

        response = self.client.get(f"/api/marketplace/jobs/{self.job.id}/")
        self.assertEqual(response.status_code, 404)


class ApplicationStatusMatrixTests(MarketplacePrivacyBase):
    worker_application_keys = {
        "id",
        "job",
        "job_summary",
        "status",
        "origin",
        "proposed_price",
        "created_at",
        "updated_at",
    }

    def test_application_create_status_matrix(self):
        anonymous = self.client.post(
            "/api/marketplace/applications/",
            {"job_id": self.job.id},
            format="json",
        )

        self.client.force_authenticate(self.unverified_cleaner)
        unverified = self.client.post(
            "/api/marketplace/applications/",
            {"job_id": self.job.id},
            format="json",
        )

        self.client.force_authenticate(self.host)
        wrong_role = self.client.post(
            "/api/marketplace/applications/",
            {"job_id": self.job.id},
            format="json",
        )

        stale = self.create_job(days=-2)
        self.client.force_authenticate(self.cleaner)
        hidden_stale = self.client.post(
            "/api/marketplace/applications/",
            {"job_id": stale.id},
            format="json",
        )
        created = self.client.post(
            "/api/marketplace/applications/",
            {
                "job_id": self.job.id,
                "proposed_price": "50.00",
                "message": "PRIVATE_APPLICATION_MESSAGE_SENTINEL",
            },
            format="json",
        )
        duplicate = self.client.post(
            "/api/marketplace/applications/",
            {"job_id": self.job.id, "proposed_price": "51.00"},
            format="json",
        )

        self.assertEqual(anonymous.status_code, 403)
        self.assertEqual(unverified.status_code, 404)
        self.assertEqual(wrong_role.status_code, 403)
        self.assertEqual(hidden_stale.status_code, 404)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(duplicate.data["code"], "application_not_allowed")
        self.assertEqual(created["Cache-Control"], "private, no-store")
        self.assertEqual(created["Clear-Site-Data"], '"cache"')
        self.assertEqual(set(created.data), self.worker_application_keys)
        self.assertNotIn("job_property_name", created.data)
        self.assertNotIn("job_title", created.data)
        self.assertNotIn("message", created.data)
        self.assertNotIn("PRIVATE_APPLICATION_MESSAGE_SENTINEL", str(created.data))
        self.assert_no_private_sentinels(created.data)


class MarketplaceQueryCountTests(MarketplacePrivacyBase):
    def query_count(self, request):
        with CaptureQueriesContext(connection) as captured:
            response = request()
            response.render()
        return response, len(captured)

    def test_canonical_public_demand_uses_one_cardinality_stable_query(self):
        response, small_count = self.query_count(
            lambda: self.client.get("/api/marketplace/public-demand/")
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(small_count, 1)

        for index in range(12):
            self.create_job(days=3 + index)

        response, large_count = self.query_count(
            lambda: self.client.get("/api/marketplace/public-demand/")
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(large_count, small_count)
        self.assertLessEqual(large_count, 1)

    def test_legacy_public_demand_fallback_is_cardinality_stable_within_three_queries(self):
        legacy_property = Property.objects.create(
            host=self.host,
            name="Legacy property",
            city="Sofia",
            neighborhood=self.zone.name_bg,
        )
        self.create_job(property_obj=legacy_property, days=3)

        response, small_count = self.query_count(
            lambda: self.client.get("/api/marketplace/public-demand/")
        )
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(small_count, 3)

        for index in range(12):
            self.create_job(property_obj=legacy_property, days=4 + index)

        response, large_count = self.query_count(
            lambda: self.client.get("/api/marketplace/public-demand/")
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(large_count, small_count)
        self.assertLessEqual(large_count, 3)

    def test_cleaner_job_list_query_count_is_cardinality_stable(self):
        self.client.force_authenticate(self.cleaner)
        response, small_count = self.query_count(
            lambda: self.client.get("/api/marketplace/jobs/")
        )
        self.assertEqual(response.status_code, 200)

        for index in range(12):
            self.create_job(days=3 + index)

        response, large_count = self.query_count(
            lambda: self.client.get("/api/marketplace/jobs/")
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(large_count, small_count)
        self.assertLessEqual(large_count, 2)

    def test_cleaner_calendar_is_safe_and_query_count_is_cardinality_stable(self):
        self.client.force_authenticate(self.cleaner)
        self.client.get("/api/marketplace/calendar/")  # warm relation caches consistently
        response, small_count = self.query_count(
            lambda: self.client.get("/api/marketplace/calendar/")
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["access_tier"], "evaluator")
        self.assertTrue(response.data[0]["can_apply"])
        self.assert_forbidden_keys_absent(response.data[0])
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Clear-Site-Data"], '"cache"')

        for index in range(12):
            self.create_job(days=3 + index)

        response, large_count = self.query_count(
            lambda: self.client.get("/api/marketplace/calendar/")
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(large_count, small_count)
        self.assertLessEqual(large_count, 5)

    def test_assigned_job_and_assignment_detail_query_budgets(self):
        application = CleanerApplication.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            status=CleanerApplication.Status.ACCEPTED,
        )
        assignment = Assignment.objects.create(
            job=self.job,
            cleaner=self.cleaner,
            application=application,
        )
        self.job.status = CleaningJob.Status.ASSIGNED
        self.job.save(update_fields=["status", "updated_at"])
        self.client.force_authenticate(self.cleaner)
        self.client.get(f"/api/marketplace/jobs/{self.job.id}/")

        job_response, job_query_count = self.query_count(
            lambda: self.client.get(f"/api/marketplace/jobs/{self.job.id}/")
        )

        self.assertEqual(job_response.status_code, 200)
        self.assertEqual(
            job_response.data["property_image"],
            f"/api/properties/images/{self.image.id}/content/",
        )
        self.assertLessEqual(job_query_count, 2)

        response, query_count = self.query_count(
            lambda: self.client.get(f"/api/marketplace/assignments/{assignment.id}/")
        )

        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(query_count, 2)
        self.assertEqual(response["Clear-Site-Data"], '"cache"')
