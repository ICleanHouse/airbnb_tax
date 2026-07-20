from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AgencyMembership, AgencyProfile, CleanerProfile, HostProfile, User
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob, FavouriteCleaner
from apps.marketplace.tests.factories import create_cleaning_job_record
from apps.properties.models import Property


class ReviewScenarioMixin:
    def create_host(self, username: str = "host", *, status=User.AccountStatus.APPROVED) -> User:
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
        username: str = "cleaner",
        *,
        status=User.AccountStatus.APPROVED,
        verification_status=CleanerProfile.VerificationStatus.VERIFIED,
        is_active: bool = True,
    ) -> User:
        cleaner = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.CLEANER,
            account_status=status,
            is_active=is_active,
        )
        CleanerProfile.objects.create(
            user=cleaner,
            display_name=username,
            city="Sofia",
            verification_status=verification_status,
        )
        return cleaner

    def create_agency(self, username: str = "agency") -> tuple[User, AgencyProfile]:
        agency_user = User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="Password123!",
            role=User.Role.AGENCY,
            account_status=User.AccountStatus.APPROVED,
        )
        agency = AgencyProfile.objects.create(
            user=agency_user,
            company_name=username,
            city="Sofia",
        )
        return agency_user, agency

    def create_property(self, host: User, name: str = "Central Flat") -> Property:
        return Property.objects.create(host=host, name=name, city="Sofia")

    def create_job(
        self,
        *,
        host: User | None = None,
        cleaner: User | None = None,
        property: Property | None = None,
        status=CleaningJob.Status.COMPLETED,
        completed_at=None,
        assigned_member: User | None = None,
        application_status=CleanerApplication.Status.ACCEPTED,
        application: CleanerApplication | None = None,
        start=None,
        with_completion_timestamps: bool = True,
    ) -> tuple[CleaningJob, Assignment]:
        host = host or self.host
        cleaner = cleaner or self.cleaner
        property = property or self.property
        start = start or timezone.now() - timedelta(days=1, hours=2)
        job = create_cleaning_job_record(
            property=property,
            host=host,
            title=f"Turnover {CleaningJob.objects.count() + 1}",
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=2),
            proposed_price=Decimal("45.00"),
            status=status,
        )
        if application is None:
            application = CleanerApplication.objects.create(
                job=job,
                cleaner=cleaner,
                status=application_status,
            )
        assignment = Assignment.objects.create(
            job=job,
            cleaner=cleaner,
            assigned_member=assigned_member,
            application=application,
            agreed_price=Decimal("45.00"),
        )
        if completed_at is None and status == CleaningJob.Status.COMPLETED and with_completion_timestamps:
            completed_at = timezone.now() - timedelta(hours=1)
        if completed_at is not None:
            assignment.completed_at = completed_at
            assignment.cleaner_completed_at = completed_at
            assignment.host_completed_at = completed_at
            assignment.save(
                update_fields=[
                    "completed_at",
                    "cleaner_completed_at",
                    "host_completed_at",
                    "updated_at",
                ]
            )
        return job, assignment

    def create_agency_job(self, *, assigned_member: User | None = None):
        agency_application = CleanerApplication.objects.create(
            job=create_cleaning_job_record(
                property=self.property,
                host=self.host,
                title="Agency turnover",
                scheduled_start=timezone.now() - timedelta(days=1, hours=2),
                scheduled_end=timezone.now() - timedelta(days=1),
                proposed_price=Decimal("55.00"),
                status=CleaningJob.Status.COMPLETED,
            ),
            cleaner=self.agency_user,
            status=CleanerApplication.Status.ACCEPTED,
        )
        completed_at = timezone.now() - timedelta(hours=1)
        assignment = Assignment.objects.create(
            job=agency_application.job,
            cleaner=self.agency_user,
            assigned_member=assigned_member,
            application=agency_application,
            agreed_price=Decimal("55.00"),
            completed_at=completed_at,
            cleaner_completed_at=completed_at,
            host_completed_at=completed_at,
        )
        return agency_application.job, assignment

    def make_active_member(self, agency: AgencyProfile, cleaner: User) -> AgencyMembership:
        return AgencyMembership.objects.create(
            agency=agency,
            cleaner=cleaner,
            invited_by=agency.user,
            status=AgencyMembership.Status.ACTIVE,
        )

    def api_post_review(self, actor: User | None, *, job: CleaningJob, reviewee: User, **overrides):
        client = APIClient()
        if actor is not None:
            client.force_authenticate(actor)
        payload = {
            "job_id": job.id,
            "reviewee_id": reviewee.id,
            "rating": overrides.pop("rating", 5),
            "comment": overrides.pop("comment", "Clean and punctual."),
        }
        payload.update(overrides)
        return client.post("/api/feedback/reviews/", payload, format="json")

    def assert_no_sensitive_error_data(self, response, *users: User):
        rendered = str(getattr(response, "data", response.content))
        forbidden = ["Traceback", "IntegrityError", "UNIQUE constraint", "unique_review_per_pair_per_job"]
        for user in users:
            forbidden.extend([user.email, user.phone_number or ""])
        for value in forbidden:
            if value:
                self.assertNotIn(value, rendered)

    def create_connection_or_favourite_context(self, host: User, cleaner: User) -> None:
        FavouriteCleaner.objects.create(host=host, cleaner=cleaner)
