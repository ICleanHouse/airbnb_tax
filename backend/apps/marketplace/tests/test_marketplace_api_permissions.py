from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, HostProfile, User
from apps.marketplace.models import Assignment, CleanerApplication, CleaningBatch, CleaningJob, FavouriteCleaner
from apps.properties.models import Property


@override_settings(
    SENTRY_DSN="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class MarketplaceApiNegativeBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.job_counter = 0
        self.application_email_patcher = patch(
            "apps.marketplace.services.send_application_submitted_email.delay",
            return_value=None,
        )
        self.completed_email_patcher = patch(
            "apps.marketplace.services.send_job_completed_email.delay",
            return_value=None,
        )
        self.application_email_patcher.start()
        self.completed_email_patcher.start()
        self.addCleanup(self.application_email_patcher.stop)
        self.addCleanup(self.completed_email_patcher.stop)

        self.host = self.create_host("host-a")
        self.other_host = self.create_host("host-b")
        self.property = self.create_property(self.host, "Host A Flat")
        self.other_property = self.create_property(self.other_host, "Host B Flat")
        self.cleaner = self.create_cleaner("cleaner-a")
        self.other_cleaner = self.create_cleaner("cleaner-b")

    def create_host(self, username, *, status=User.AccountStatus.APPROVED):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.HOST,
            account_status=status,
        )
        HostProfile.objects.create(user=user, city="Sofia")
        return user

    def create_cleaner(
        self,
        username,
        *,
        status=User.AccountStatus.APPROVED,
        verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        is_active=True,
    ):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=status,
            is_active=is_active,
        )
        CleanerProfile.objects.create(
            user=user,
            display_name=username,
            city="Sofia",
            verification_status=verification_status,
        )
        return user

    def create_agency(self, username="agency-a", *, status=User.AccountStatus.APPROVED):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=status,
        )
        profile = AgencyProfile.objects.create(user=user, company_name=username, city="Sofia")
        return user, profile

    def create_property(self, host, name):
        return Property.objects.create(host=host, name=name, city="Sofia")

    def next_window(self, *, days=1):
        self.job_counter += 1
        start = timezone.now().replace(microsecond=0) + timedelta(days=days + self.job_counter)
        return start, start + timedelta(hours=2)

    def create_job(self, *, host=None, property=None, status=CleaningJob.Status.DRAFT):
        host = host or self.host
        property = property or self.property
        start, end = self.next_window()
        return CleaningJob.objects.create(
            property=property,
            host=host,
            title=f"Turnover {self.job_counter}",
            scheduled_start=start,
            scheduled_end=end,
            proposed_price=Decimal("45.00"),
            status=status,
        )

    def job_payload(self, property, *, start=None, end=None, **overrides):
        if start is None or end is None:
            start, end = self.next_window(days=30)
        payload = {
            "property_id": property.id,
            "title": "API turnover",
            "scheduled_start": start.isoformat(),
            "scheduled_end": end.isoformat(),
            "proposed_price": "45.00",
        }
        payload.update(overrides)
        return payload

    def create_application(
        self,
        *,
        job=None,
        cleaner=None,
        status=CleanerApplication.Status.PENDING,
        origin=CleanerApplication.Origin.CLEANER_APPLIED,
    ):
        return CleanerApplication.objects.create(
            job=job or self.create_job(status=CleaningJob.Status.OPEN),
            cleaner=cleaner or self.cleaner,
            status=status,
            origin=origin,
            proposed_price=Decimal("50.00"),
            message="Available.",
        )

    def create_assignment(self, *, job=None, cleaner=None, application=None):
        job = job or self.create_job(status=CleaningJob.Status.ASSIGNED)
        cleaner = cleaner or self.cleaner
        application = application or self.create_application(
            job=job,
            cleaner=cleaner,
            status=CleanerApplication.Status.ACCEPTED,
        )
        assignment = Assignment.objects.create(
            job=job,
            cleaner=cleaner,
            application=application,
            agreed_price=Decimal("50.00"),
        )
        job.status = CleaningJob.Status.ASSIGNED
        job.agreed_price = assignment.agreed_price
        job.save(update_fields=["status", "agreed_price", "updated_at"])
        return assignment

    def assert_response_safe(self, response):
        body = str(getattr(response, "data", response.content))
        self.assertNotIn("Traceback", body)
        self.assertNotIn("SELECT ", body.upper())
        self.assertNotIn("@example.test", body)


class CleaningJobApiNegativeTests(MarketplaceApiNegativeBase):
    def test_host_cannot_access_or_mutate_another_hosts_private_job(self):
        job = self.create_job(status=CleaningJob.Status.DRAFT)
        original = {
            "title": job.title,
            "status": job.status,
            "property_id": job.property_id,
        }
        self.client.force_authenticate(self.other_host)

        responses = [
            self.client.get(f"/api/marketplace/jobs/{job.id}/"),
            self.client.patch(f"/api/marketplace/jobs/{job.id}/", {"title": "Hijacked"}, format="json"),
            self.client.post(f"/api/marketplace/jobs/{job.id}/publish/"),
            self.client.delete(f"/api/marketplace/jobs/{job.id}/"),
            self.client.post(f"/api/marketplace/jobs/{job.id}/complete/"),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 404)
            self.assert_response_safe(response)
        job.refresh_from_db()
        self.assertEqual(job.title, original["title"])
        self.assertEqual(job.status, original["status"])
        self.assertEqual(job.property_id, original["property_id"])
        self.assertTrue(CleaningJob.objects.filter(id=job.id).exists())

    def test_host_cannot_create_or_move_jobs_for_another_hosts_property(self):
        job = self.create_job(status=CleaningJob.Status.DRAFT)
        other_batch = CleaningBatch.objects.create(
            property=self.other_property,
            host=self.other_host,
            title="Other host batch",
            month=timezone.localdate().replace(day=1),
        )

        self.client.force_authenticate(self.other_host)
        create_response = self.client.post(
            "/api/marketplace/jobs/",
            self.job_payload(self.property),
            format="json",
        )
        self.assertEqual(create_response.status_code, 403)

        self.client.force_authenticate(self.host)
        update_response = self.client.patch(
            f"/api/marketplace/jobs/{job.id}/",
            {"property_id": self.other_property.id},
            format="json",
        )
        batch_response = self.client.patch(
            f"/api/marketplace/jobs/{job.id}/",
            {"batch_id": other_batch.id},
            format="json",
        )

        self.assertEqual(update_response.status_code, 403)
        self.assertEqual(batch_response.status_code, 403)
        self.assert_response_safe(update_response)
        job.refresh_from_db()
        self.assertEqual(job.property_id, self.property.id)
        self.assertEqual(job.host_id, self.host.id)
        self.assertIsNone(job.batch_id)
        self.assertFalse(
            CleaningJob.objects.filter(property=self.property).exclude(id=job.id).exists()
        )

    def test_only_draft_jobs_can_be_updated(self):
        self.client.force_authenticate(self.host)
        for state in [
            CleaningJob.Status.OPEN,
            CleaningJob.Status.ASSIGNED,
            CleaningJob.Status.COMPLETED,
            CleaningJob.Status.CANCELLED,
            CleaningJob.Status.DISPUTED,
        ]:
            with self.subTest(state=state):
                job = self.create_job(status=state)
                response = self.client.patch(
                    f"/api/marketplace/jobs/{job.id}/",
                    {"title": "Changed"},
                    format="json",
                )

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data, {"detail": "Only draft jobs can be edited."})
                job.refresh_from_db()
                self.assertNotEqual(job.title, "Changed")

    def test_publish_rejects_every_non_draft_status_without_state_changes(self):
        self.client.force_authenticate(self.host)
        for state in [
            CleaningJob.Status.OPEN,
            CleaningJob.Status.ASSIGNED,
            CleaningJob.Status.COMPLETED,
            CleaningJob.Status.CANCELLED,
            CleaningJob.Status.DISPUTED,
        ]:
            with self.subTest(state=state):
                job = self.create_job(status=state)
                response = self.client.post(f"/api/marketplace/jobs/{job.id}/publish/")

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data, {"detail": "Only draft jobs can be published."})
                job.refresh_from_db()
                self.assertEqual(job.status, state)

    def test_assigned_and_completed_jobs_cannot_be_deleted(self):
        self.client.force_authenticate(self.host)
        assigned = self.create_job(status=CleaningJob.Status.ASSIGNED)
        completed = self.create_job(status=CleaningJob.Status.COMPLETED)

        for job in [assigned, completed]:
            with self.subTest(status=job.status):
                response = self.client.delete(f"/api/marketplace/jobs/{job.id}/")

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data, {"detail": "Only draft or open jobs can be deleted."})
                self.assertTrue(CleaningJob.objects.filter(id=job.id).exists())

    def test_job_serializer_rejects_bad_times_and_real_duplicates(self):
        self.client.force_authenticate(self.host)
        start, end = self.next_window()
        original = self.create_job(status=CleaningJob.Status.DRAFT)

        bad_time_response = self.client.post(
            "/api/marketplace/jobs/",
            self.job_payload(self.property, start=start, end=start),
            format="json",
        )
        duplicate_response = self.client.post(
            "/api/marketplace/jobs/",
            self.job_payload(
                self.property,
                start=original.scheduled_start,
                end=original.scheduled_end,
            ),
            format="json",
        )
        same_slot_update_response = self.client.patch(
            f"/api/marketplace/jobs/{original.id}/",
            {
                "title": "Same slot, new title",
                "scheduled_start": original.scheduled_start.isoformat(),
                "scheduled_end": original.scheduled_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(bad_time_response.status_code, 400)
        self.assertEqual(duplicate_response.status_code, 400)
        self.assertEqual(same_slot_update_response.status_code, 200)
        original.refresh_from_db()
        self.assertEqual(original.title, "Same slot, new title")

    def test_status_and_assignment_fields_cannot_be_injected_through_job_payloads(self):
        self.client.force_authenticate(self.host)

        create_response = self.client.post(
            "/api/marketplace/jobs/",
            self.job_payload(self.property, status=CleaningJob.Status.OPEN, agreed_price="1.00"),
            format="json",
        )
        job = CleaningJob.objects.get(id=create_response.data["id"])
        update_response = self.client.patch(
            f"/api/marketplace/jobs/{job.id}/",
            {"status": CleaningJob.Status.COMPLETED, "agreed_price": "99.00"},
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(update_response.status_code, 200)
        job.refresh_from_db()
        self.assertEqual(job.status, CleaningJob.Status.DRAFT)
        self.assertIsNone(job.agreed_price)


class CleaningBatchApiNegativeTests(MarketplaceApiNegativeBase):
    def test_only_approved_hosts_can_create_batches(self):
        pending_host = self.create_host("pending-host", status=User.AccountStatus.PENDING)
        pending_property = self.create_property(pending_host, "Pending Flat")
        self.client.force_authenticate(pending_host)

        response = self.client.post(
            "/api/marketplace/batches/",
            {
                "property_id": pending_property.id,
                "title": "July batch",
                "month": "2026-07-01",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(CleaningBatch.objects.filter(property=pending_property).exists())

    def test_hosts_see_and_mutate_only_their_own_batches(self):
        batch = CleaningBatch.objects.create(
            property=self.property,
            host=self.host,
            title="Host A batch",
            month=timezone.localdate().replace(day=1),
        )
        other_batch = CleaningBatch.objects.create(
            property=self.other_property,
            host=self.other_host,
            title="Host B batch",
            month=timezone.localdate().replace(day=1),
        )
        self.client.force_authenticate(self.other_host)

        list_response = self.client.get("/api/marketplace/batches/")
        retrieve_response = self.client.get(f"/api/marketplace/batches/{batch.id}/")
        update_response = self.client.patch(
            f"/api/marketplace/batches/{batch.id}/",
            {"title": "Changed"},
            format="json",
        )
        delete_response = self.client.delete(f"/api/marketplace/batches/{batch.id}/")

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual([row["id"] for row in list_response.data], [other_batch.id])
        self.assertEqual(retrieve_response.status_code, 404)
        self.assertEqual(update_response.status_code, 404)
        self.assertEqual(delete_response.status_code, 404)
        batch.refresh_from_db()
        self.assertEqual(batch.title, "Host A batch")

    def test_batch_create_rejects_foreign_property_and_malformed_payloads(self):
        self.client.force_authenticate(self.other_host)
        foreign_property_response = self.client.post(
            "/api/marketplace/batches/",
            {
                "property_id": self.property.id,
                "title": "Foreign property batch",
                "month": "2026-07-01",
            },
            format="json",
        )
        malformed_response = self.client.post(
            "/api/marketplace/batches/",
            {"property_id": self.other_property.id, "month": "not-a-date"},
            format="json",
        )

        self.assertEqual(foreign_property_response.status_code, 403)
        self.assertEqual(malformed_response.status_code, 400)
        self.assertFalse(CleaningBatch.objects.filter(title="Foreign property batch").exists())

    def test_batch_update_rejects_moving_to_another_hosts_property(self):
        batch = CleaningBatch.objects.create(
            property=self.property,
            host=self.host,
            title="Owned batch",
            month=timezone.localdate().replace(day=1),
        )
        self.client.force_authenticate(self.host)

        response = self.client.patch(
            f"/api/marketplace/batches/{batch.id}/",
            {"property_id": self.other_property.id},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        batch.refresh_from_db()
        self.assertEqual(batch.property_id, self.property.id)
        self.assertEqual(batch.host_id, self.host.id)


class CleanerApplicationApiNegativeTests(MarketplaceApiNegativeBase):
    def test_cleaner_cannot_apply_twice_or_apply_to_non_open_jobs(self):
        open_job = self.create_job(status=CleaningJob.Status.OPEN)
        self.client.force_authenticate(self.cleaner)

        first = self.client.post(
            "/api/marketplace/applications/",
            {"job_id": open_job.id, "proposed_price": "50.00"},
            format="json",
        )
        second = self.client.post(
            "/api/marketplace/applications/",
            {"job_id": open_job.id, "proposed_price": "51.00"},
            format="json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(CleanerApplication.objects.filter(job=open_job, cleaner=self.cleaner).count(), 1)

        for state in [
            CleaningJob.Status.DRAFT,
            CleaningJob.Status.ASSIGNED,
            CleaningJob.Status.COMPLETED,
            CleaningJob.Status.CANCELLED,
            CleaningJob.Status.DISPUTED,
        ]:
            with self.subTest(state=state):
                job = self.create_job(status=state)
                response = self.client.post(
                    "/api/marketplace/applications/",
                    {"job_id": job.id, "proposed_price": "50.00"},
                    format="json",
                )

                self.assertEqual(response.status_code, 400)
                self.assertFalse(CleanerApplication.objects.filter(job=job, cleaner=self.cleaner).exists())

    def test_application_create_ignores_applicant_and_lifecycle_field_injection(self):
        job = self.create_job(status=CleaningJob.Status.OPEN)
        self.client.force_authenticate(self.cleaner)

        response = self.client.post(
            "/api/marketplace/applications/",
            {
                "job_id": job.id,
                "cleaner": self.other_cleaner.id,
                "status": CleanerApplication.Status.ACCEPTED,
                "origin": CleanerApplication.Origin.HOST_OFFERED,
                "proposed_price": "50.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        application = CleanerApplication.objects.get(id=response.data["id"])
        self.assertEqual(application.cleaner_id, self.cleaner.id)
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertEqual(application.origin, CleanerApplication.Origin.CLEANER_APPLIED)

    def test_host_cannot_submit_cleaner_application(self):
        job = self.create_job(status=CleaningJob.Status.OPEN)
        self.client.force_authenticate(self.host)

        response = self.client.post(
            "/api/marketplace/applications/",
            {"job_id": job.id, "message": "I will apply as host."},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(CleanerApplication.objects.filter(job=job).exists())

    def test_application_withdrawal_is_applicant_only_and_pending_only(self):
        pending = self.create_application()
        self.client.force_authenticate(self.other_cleaner)
        other_cleaner_response = self.client.post(
            f"/api/marketplace/applications/{pending.id}/withdraw/"
        )

        self.client.force_authenticate(self.host)
        host_response = self.client.post(f"/api/marketplace/applications/{pending.id}/withdraw/")

        self.client.force_authenticate(self.cleaner)
        own_response = self.client.post(f"/api/marketplace/applications/{pending.id}/withdraw/")

        self.assertEqual(other_cleaner_response.status_code, 404)
        self.assertEqual(host_response.status_code, 400)
        self.assertEqual(own_response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.status, CleanerApplication.Status.WITHDRAWN)

        for state in [
            CleanerApplication.Status.ACCEPTED,
            CleanerApplication.Status.REJECTED,
            CleanerApplication.Status.WITHDRAWN,
        ]:
            with self.subTest(state=state):
                application = self.create_application(
                    job=self.create_job(status=CleaningJob.Status.OPEN),
                    status=state,
                )
                response = self.client.post(
                    f"/api/marketplace/applications/{application.id}/withdraw/"
                )

                self.assertEqual(response.status_code, 400)
                application.refresh_from_db()
                self.assertEqual(application.status, state)

    def test_foreign_host_cannot_accept_or_reject_application(self):
        application = self.create_application()
        self.client.force_authenticate(self.other_host)

        accept_response = self.client.post(f"/api/marketplace/applications/{application.id}/accept/")
        reject_response = self.client.post(f"/api/marketplace/applications/{application.id}/reject/")

        self.assertEqual(accept_response.status_code, 404)
        self.assertEqual(reject_response.status_code, 404)
        application.refresh_from_db()
        self.assertEqual(application.status, CleanerApplication.Status.PENDING)
        self.assertFalse(Assignment.objects.filter(job=application.job).exists())

    def test_application_querysets_do_not_expose_private_cleaner_email_to_unrelated_users(self):
        application = self.create_application()

        self.client.force_authenticate(self.host)
        host_detail = self.client.get(f"/api/marketplace/applications/{application.id}/")
        self.assertEqual(host_detail.status_code, 200)
        self.assertEqual(host_detail.data["cleaner_email"], self.cleaner.email)

        self.client.force_authenticate(self.other_host)
        other_host_list = self.client.get("/api/marketplace/applications/")
        other_host_detail = self.client.get(f"/api/marketplace/applications/{application.id}/")

        self.client.force_authenticate(self.other_cleaner)
        other_cleaner_detail = self.client.get(f"/api/marketplace/applications/{application.id}/")

        self.assertEqual(other_host_list.status_code, 200)
        self.assertEqual(other_host_list.data, [])
        self.assertEqual(other_host_detail.status_code, 404)
        self.assertEqual(other_cleaner_detail.status_code, 404)
        self.assert_response_safe(other_host_detail)
        self.assert_response_safe(other_cleaner_detail)


class DirectOfferApiNegativeTests(MarketplaceApiNegativeBase):
    def test_foreign_host_and_cleaner_cannot_create_direct_offer(self):
        job = self.create_job(status=CleaningJob.Status.OPEN)

        self.client.force_authenticate(self.other_host)
        foreign_host_response = self.client.post(
            f"/api/marketplace/jobs/{job.id}/offer/",
            {"cleaner_id": self.cleaner.id},
            format="json",
        )

        self.client.force_authenticate(self.cleaner)
        cleaner_response = self.client.post(
            f"/api/marketplace/jobs/{job.id}/offer/",
            {"cleaner_id": self.other_cleaner.id},
            format="json",
        )

        self.assertEqual(foreign_host_response.status_code, 404)
        self.assertEqual(cleaner_response.status_code, 400)
        self.assertFalse(CleanerApplication.objects.filter(job=job).exists())

    def test_direct_offer_rejects_invalid_or_unworkable_target(self):
        job = self.create_job(status=CleaningJob.Status.OPEN)
        unapproved = self.create_cleaner("unapproved-cleaner", status=User.AccountStatus.PENDING)
        unverified = self.create_cleaner(
            "unverified-cleaner",
            verification_status=CleanerProfile.VerificationStatus.PENDING,
        )
        self.client.force_authenticate(self.host)

        for target in [self.host, unapproved, unverified]:
            with self.subTest(target=target.username):
                response = self.client.post(
                    f"/api/marketplace/jobs/{job.id}/offer/",
                    {"cleaner_id": target.id},
                    format="json",
                )

                self.assertEqual(response.status_code, 400)
                self.assert_response_safe(response)

        self.assertFalse(CleanerApplication.objects.filter(job=job).exists())

    def test_only_offered_cleaner_can_accept_or_decline_pending_offer(self):
        offer = self.create_application(origin=CleanerApplication.Origin.HOST_OFFERED)

        self.client.force_authenticate(self.host)
        host_accept = self.client.post(f"/api/marketplace/applications/{offer.id}/accept-offer/")

        self.client.force_authenticate(self.other_cleaner)
        other_accept = self.client.post(f"/api/marketplace/applications/{offer.id}/accept-offer/")
        other_decline = self.client.post(f"/api/marketplace/applications/{offer.id}/decline-offer/")

        self.client.force_authenticate(self.cleaner)
        own_decline = self.client.post(f"/api/marketplace/applications/{offer.id}/decline-offer/")
        repeat_decline = self.client.post(f"/api/marketplace/applications/{offer.id}/decline-offer/")

        self.assertEqual(host_accept.status_code, 400)
        self.assertEqual(other_accept.status_code, 404)
        self.assertEqual(other_decline.status_code, 404)
        self.assertEqual(own_decline.status_code, 200)
        self.assertEqual(repeat_decline.status_code, 400)
        offer.refresh_from_db()
        self.assertEqual(offer.status, CleanerApplication.Status.REJECTED)
        self.assertFalse(Assignment.objects.filter(job=offer.job).exists())

    def test_offer_cannot_be_accepted_after_job_is_already_assigned(self):
        offer = self.create_application(origin=CleanerApplication.Origin.HOST_OFFERED)
        other_application = self.create_application(job=offer.job, cleaner=self.other_cleaner)
        self.create_assignment(job=offer.job, cleaner=self.other_cleaner, application=other_application)
        self.client.force_authenticate(self.cleaner)

        response = self.client.post(f"/api/marketplace/applications/{offer.id}/accept-offer/")

        self.assertEqual(response.status_code, 400)
        offer.refresh_from_db()
        self.assertEqual(offer.status, CleanerApplication.Status.PENDING)
        self.assertEqual(Assignment.objects.filter(job=offer.job).count(), 1)

    def test_offer_to_cleaner_reuses_exact_slot_and_rejects_invalid_payload_without_partials(self):
        start, end = self.next_window()
        existing_job = CleaningJob.objects.create(
            property=self.property,
            host=self.host,
            title="Existing draft",
            scheduled_start=start,
            scheduled_end=end,
            proposed_price=Decimal("45.00"),
            status=CleaningJob.Status.DRAFT,
        )
        self.client.force_authenticate(self.host)

        exact_slot_response = self.client.post(
            "/api/marketplace/jobs/offer-to-cleaner/",
            {
                "property_id": self.property.id,
                "cleaner_id": self.cleaner.id,
                "scheduled_start": start.isoformat(),
                "scheduled_end": end.isoformat(),
                "title": "Should reuse existing",
            },
            format="json",
        )
        invalid_time_response = self.client.post(
            "/api/marketplace/jobs/offer-to-cleaner/",
            {
                "property_id": self.property.id,
                "cleaner_id": self.other_cleaner.id,
                "scheduled_start": end.isoformat(),
                "scheduled_end": start.isoformat(),
            },
            format="json",
        )
        foreign_property_response = self.client.post(
            "/api/marketplace/jobs/offer-to-cleaner/",
            {
                "property_id": self.other_property.id,
                "cleaner_id": self.other_cleaner.id,
                "scheduled_start": (end + timedelta(days=1)).isoformat(),
                "scheduled_end": (end + timedelta(days=1, hours=2)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(exact_slot_response.status_code, 201)
        self.assertEqual(invalid_time_response.status_code, 400)
        self.assertEqual(foreign_property_response.status_code, 400)
        self.assertEqual(CleaningJob.objects.filter(property=self.property, scheduled_start=start, scheduled_end=end).count(), 1)
        self.assertEqual(CleanerApplication.objects.get(id=exact_slot_response.data["id"]).job_id, existing_job.id)
        self.assertFalse(CleaningJob.objects.filter(property=self.other_property).exists())


class AssignmentApiNegativeTests(MarketplaceApiNegativeBase):
    def create_agency_assignment(self):
        agency_user, agency = self.create_agency()
        job = self.create_job(status=CleaningJob.Status.OPEN)
        application = self.create_application(
            job=job,
            cleaner=agency_user,
            status=CleanerApplication.Status.ACCEPTED,
        )
        assignment = Assignment.objects.create(job=job, cleaner=agency_user, application=application)
        job.status = CleaningJob.Status.ASSIGNED
        job.save(update_fields=["status", "updated_at"])
        return agency_user, agency, assignment

    def test_assignments_are_read_only_through_generic_methods(self):
        assignment = self.create_assignment()
        self.client.force_authenticate(self.host)

        create_response = self.client.post("/api/marketplace/assignments/", {}, format="json")
        patch_response = self.client.patch(
            f"/api/marketplace/assignments/{assignment.id}/",
            {"assigned_member": self.other_cleaner.id},
            format="json",
        )
        delete_response = self.client.delete(f"/api/marketplace/assignments/{assignment.id}/")

        self.assertEqual(create_response.status_code, 405)
        self.assertEqual(patch_response.status_code, 405)
        self.assertEqual(delete_response.status_code, 405)
        assignment.refresh_from_db()
        self.assertIsNone(assignment.assigned_member)

    def test_assignment_querysets_are_scoped_by_role(self):
        own_assignment = self.create_assignment()
        other_job = self.create_job(
            host=self.other_host,
            property=self.other_property,
            status=CleaningJob.Status.ASSIGNED,
        )
        other_assignment = self.create_assignment(job=other_job, cleaner=self.other_cleaner)

        self.client.force_authenticate(self.host)
        host_rows = self.client.get("/api/marketplace/assignments/").data

        self.client.force_authenticate(self.other_cleaner)
        cleaner_rows = self.client.get("/api/marketplace/assignments/").data

        self.assertEqual([row["id"] for row in host_rows], [own_assignment.id])
        self.assertEqual([row["id"] for row in cleaner_rows], [other_assignment.id])

    def test_agency_member_assignment_rejects_invalid_members_and_keeps_state(self):
        agency_user, agency, assignment = self.create_agency_assignment()
        other_agency_user, other_agency = self.create_agency("agency-b")
        active_member = self.cleaner
        AgencyMembership.objects.create(agency=agency, cleaner=active_member, invited_by=agency_user)
        foreign_member = self.create_cleaner("foreign-member")
        AgencyMembership.objects.create(
            agency=other_agency,
            cleaner=foreign_member,
            invited_by=other_agency_user,
        )
        revoked_member = self.create_cleaner("revoked-member")
        AgencyMembership.objects.create(
            agency=agency,
            cleaner=revoked_member,
            invited_by=agency_user,
            status=AgencyMembership.Status.REVOKED,
        )
        inactive_member = self.create_cleaner("inactive-member", is_active=False)
        AgencyMembership.objects.create(agency=agency, cleaner=inactive_member, invited_by=agency_user)
        pending_member = self.create_cleaner("pending-member", status=User.AccountStatus.PENDING)
        AgencyMembership.objects.create(agency=agency, cleaner=pending_member, invited_by=agency_user)
        unverified_member = self.create_cleaner(
            "unverified-member",
            verification_status=CleanerProfile.VerificationStatus.PENDING,
        )
        AgencyMembership.objects.create(agency=agency, cleaner=unverified_member, invited_by=agency_user)
        non_member = self.create_cleaner("non-member")
        self.client.force_authenticate(agency_user)

        for member in [foreign_member, revoked_member, inactive_member, pending_member, unverified_member, non_member]:
            with self.subTest(member=member.username):
                response = self.client.post(
                    f"/api/marketplace/assignments/{assignment.id}/assign-member/",
                    {"assigned_member_id": member.id},
                    format="json",
                )

                self.assertEqual(response.status_code, 400)
                assignment.refresh_from_db()
                self.assertIsNone(assignment.assigned_member)

        self.client.force_authenticate(self.host)
        host_response = self.client.post(
            f"/api/marketplace/assignments/{assignment.id}/assign-member/",
            {"assigned_member_id": active_member.id},
            format="json",
        )
        self.assertEqual(host_response.status_code, 400)
        assignment.refresh_from_db()
        self.assertIsNone(assignment.assigned_member)


class FavouriteCleanerApiNegativeTests(MarketplaceApiNegativeBase):
    def test_only_hosts_can_create_favourites_and_targets_must_be_cleaners_or_agencies(self):
        self.client.force_authenticate(self.cleaner)
        cleaner_response = self.client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": self.other_cleaner.id},
            format="json",
        )

        self.client.force_authenticate(self.host)
        invalid_role_response = self.client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": self.other_host.id},
            format="json",
        )

        self.assertEqual(cleaner_response.status_code, 403)
        self.assertEqual(invalid_role_response.status_code, 403)
        self.assertFalse(FavouriteCleaner.objects.exists())

    def test_favourite_creation_is_idempotent_and_delete_is_owner_scoped(self):
        self.client.force_authenticate(self.host)
        first = self.client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": self.cleaner.id},
            format="json",
        )
        second = self.client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": self.cleaner.id},
            format="json",
        )
        favourite = FavouriteCleaner.objects.get(host=self.host, cleaner=self.cleaner)

        self.client.force_authenticate(self.other_host)
        other_list = self.client.get("/api/marketplace/favourites/")
        delete_response = self.client.delete(f"/api/marketplace/favourites/{favourite.id}/")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(FavouriteCleaner.objects.filter(host=self.host, cleaner=self.cleaner).count(), 1)
        self.assertEqual(other_list.data, [])
        self.assertEqual(delete_response.status_code, 404)
        self.assertTrue(FavouriteCleaner.objects.filter(id=favourite.id).exists())

    def test_malformed_cleaner_id_is_rejected_without_server_error(self):
        self.client.force_authenticate(self.host)

        response = self.client.post(
            "/api/marketplace/favourites/",
            {"cleaner_id": "not-an-id"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assert_response_safe(response)
        self.assertFalse(FavouriteCleaner.objects.exists())


class MarketplaceCalendarApiNegativeTests(MarketplaceApiNegativeBase):
    def test_anonymous_users_cannot_access_calendar(self):
        response = self.client.get("/api/marketplace/calendar/")

        self.assertEqual(response.status_code, 403)

    def test_host_calendar_cannot_be_enumerated_with_query_params(self):
        own_job = self.create_job(status=CleaningJob.Status.OPEN)
        foreign_job = self.create_job(
            host=self.other_host,
            property=self.other_property,
            status=CleaningJob.Status.OPEN,
        )
        self.client.force_authenticate(self.host)

        response = self.client.get(
            "/api/marketplace/calendar/",
            {"host": self.other_host.id, "property": self.other_property.id},
        )
        job_ids = {row["job"] for row in response.data}

        self.assertEqual(response.status_code, 200)
        self.assertIn(own_job.id, job_ids)
        self.assertNotIn(foreign_job.id, job_ids)

    def test_cleaner_calendar_exposes_only_own_private_records_plus_open_jobs(self):
        own_offer = self.create_application(origin=CleanerApplication.Origin.HOST_OFFERED)
        other_offer = self.create_application(
            job=self.create_job(status=CleaningJob.Status.OPEN),
            cleaner=self.other_cleaner,
            origin=CleanerApplication.Origin.HOST_OFFERED,
        )
        self.client.force_authenticate(self.cleaner)

        response = self.client.get("/api/marketplace/calendar/")
        application_ids = {row.get("application") for row in response.data}

        self.assertEqual(response.status_code, 200)
        self.assertIn(own_offer.id, application_ids)
        self.assertNotIn(other_offer.id, application_ids)

    def test_non_approved_users_receive_empty_calendar(self):
        for status in [
            User.AccountStatus.PENDING,
            User.AccountStatus.REJECTED,
            User.AccountStatus.SUSPENDED,
        ]:
            with self.subTest(status=status):
                user = self.create_cleaner(f"calendar-{status}", status=status)
                self.client.force_authenticate(user)
                response = self.client.get("/api/marketplace/calendar/")

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data, [])
