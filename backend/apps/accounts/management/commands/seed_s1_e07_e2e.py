"""Create deterministic, disposable local data for the S1-E07 browser suite."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import OperationalError, transaction
from django.utils import timezone

from apps.accounts.models import (
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    HostProfile,
    User,
)
from apps.connections.models import Connection
from apps.marketplace.models import (
    Assignment,
    CleanerApplication,
    CleaningJob,
    JobLifecycleEvent,
    TurnoverLineage,
)
from apps.notifications.models import Notification
from apps.properties.models import Property


PREFIX = "s1e07-e2e-"


class Command(BaseCommand):
    help = "Seed disposable S1-E07 browser-test data in a local or test environment."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            required=True,
            help="Disposable password supplied at runtime; it is never stored in source control.",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Reset only S1-E07 test connections and in-app notifications before seeding.",
        )

    def handle(self, *args, **options):
        environment = settings.APP_ENV.lower()
        if not settings.DEBUG or environment not in {"local", "test", "testing"}:
            raise CommandError("S1-E07 E2E seed data can run only with DEBUG in a local or test environment.")

        try:
            with transaction.atomic():
                seeded = self._seed(password=options["password"], reset=options["reset"])
        except OperationalError as exc:
            raise CommandError(
                "The local database schema is not current for the S1-E07 E2E seed. "
                "Apply the project's existing migrations before running this command."
            ) from exc

        self.stdout.write(self.style.SUCCESS("Seeded S1-E07 E2E data."))
        for label, user in seeded.items():
            self.stdout.write(f"{label}: {user.email}")

    def _user(self, *, key, password, role, status=User.AccountStatus.APPROVED, active=True, admin=False):
        email = f"{PREFIX}{key}@e2e.invalid"
        if admin:
            user, _ = User.objects.get_or_create(username=email, defaults={"email": email})
            user.role = User.Role.ADMIN
            user.account_status = User.AccountStatus.APPROVED
            user.is_staff = True
            user.is_superuser = True
            user.approved_at = timezone.now()
        else:
            user, _ = User.objects.get_or_create(
                username=email,
                defaults={"email": email, "role": role, "account_status": status},
            )
            user.role = role
            user.account_status = status
            user.is_staff = False
            user.is_superuser = False
            user.approved_at = timezone.now() if status == User.AccountStatus.APPROVED else None
        user.email = email
        user.is_active = active
        user.first_name = "S1 E2E"
        user.last_name = key.replace("-", " ").title()
        user.preferred_language = User.Language.ENGLISH
        user.email_verified_at = timezone.now() if active else None
        user.set_password(password)
        user.save()
        return user

    def _seed(self, *, password, reset):
        users = {
            "host": self._user(key="host", password=password, role=User.Role.HOST),
            "cleaner": self._user(key="cleaner", password=password, role=User.Role.CLEANER),
            "agency": self._user(key="agency", password=password, role=User.Role.AGENCY),
            "admin": self._user(key="admin", password=password, role=User.Role.ADMIN, admin=True),
            "pending-host": self._user(key="pending-host", password=password, role=User.Role.HOST, status=User.AccountStatus.PENDING),
            "pending-cleaner": self._user(key="pending-cleaner", password=password, role=User.Role.CLEANER, status=User.AccountStatus.PENDING),
            "pending-agency": self._user(key="pending-agency", password=password, role=User.Role.AGENCY, status=User.AccountStatus.PENDING),
            "rejected": self._user(key="rejected", password=password, role=User.Role.HOST, status=User.AccountStatus.REJECTED),
            "suspended": self._user(key="suspended", password=password, role=User.Role.HOST, status=User.AccountStatus.SUSPENDED),
            "inactive": self._user(key="inactive", password=password, role=User.Role.HOST, active=False),
        }

        HostProfile.objects.get_or_create(user=users["host"], defaults={"city": "Sofia"})
        for key in ("pending-host", "rejected", "suspended", "inactive"):
            HostProfile.objects.get_or_create(user=users[key], defaults={"city": "Sofia"})

        for key, verification_status in (("cleaner", CleanerProfile.VerificationStatus.VERIFIED), ("pending-cleaner", CleanerProfile.VerificationStatus.PENDING)):
            CleanerProfile.objects.update_or_create(
                user=users[key],
                defaults={
                    "display_name": f"S1 E2E {key.title()} Cleaner",
                    "city": "Sofia",
                    "service_areas": ["Center"],
                    "verification_status": verification_status,
                    "bio": "Disposable browser-test profile.",
                    # The browser suite exercises only the public UUID route;
                    # explicit publication is required by the S1-D04 contract.
                    "publication_enabled": key == "cleaner",
                    "publication_paused_at": None,
                },
            )

        for key, complete in (("agency", True), ("pending-agency", True)):
            AgencyProfile.objects.update_or_create(
                user=users[key],
                defaults={
                    "company_name": f"S1 E2E {key.title()} Agency",
                    "city": "Sofia" if complete else "",
                    "service_areas": ["Center"] if complete else [],
                    "description": "Disposable browser-test agency.",
                },
            )
        agency = users["agency"].agency_profile
        AgencyMembership.objects.update_or_create(
            agency=agency,
            cleaner=users["cleaner"],
            defaults={"invited_by": users["agency"], "status": AgencyMembership.Status.ACTIVE, "revoked_at": None},
        )

        if reset:
            test_user_ids = [user.id for user in users.values()]
            Connection.objects.filter(requester_id__in=test_user_ids).delete()
            Connection.objects.filter(addressee_id__in=test_user_ids).delete()
            Notification.objects.filter(user_id__in=test_user_ids).delete()

        property, _ = Property.objects.get_or_create(
            host=users["host"],
            name="S1 E2E Sofia apartment",
            defaults={"city": "Sofia", "address": "Test-only address"},
        )
        job = CleaningJob.objects.filter(host=users["host"], title="S1 E2E agency application").first()
        if job is None:
            start = timezone.now() + timedelta(days=14)
            lineage = TurnoverLineage.objects.create(property=property, host=users["host"])
            job = CleaningJob.objects.create(
                lineage=lineage,
                property=property,
                host=users["host"],
                title="S1 E2E agency application",
                scheduled_start=start,
                scheduled_end=start + timedelta(hours=2),
                proposed_price=Decimal("45.00"),
                status=CleaningJob.Status.OPEN,
                published_at=timezone.now(),
            )
            JobLifecycleEvent.objects.create(
                lineage=lineage,
                job=job,
                actor=users["host"],
                actor_role_snapshot=users["host"].role,
                event_type=JobLifecycleEvent.EventType.JOB_CREATED,
                to_status=CleaningJob.Status.OPEN,
                metadata={"source": "s1_e07_e2e_seed"},
            )
        CleanerApplication.objects.update_or_create(
            job=job,
            cleaner=users["agency"],
            defaults={"status": CleanerApplication.Status.PENDING, "proposed_member": None, "message": "Disposable E2E application."},
        )

        recovery_job = (
            CleaningJob.objects.filter(
                host=users["host"],
                title="S1 E05 Recovery Browser",
                status=CleaningJob.Status.ASSIGNED,
                assignment__cleaner=users["agency"],
                assignment__assigned_member=users["cleaner"],
            )
            .order_by("-id")
            .first()
        )
        if recovery_job is None:
            recovery_start = timezone.now() - timedelta(minutes=5)
            recovery_lineage = TurnoverLineage.objects.create(property=property, host=users["host"])
            recovery_job = CleaningJob.objects.create(
                lineage=recovery_lineage,
                property=property,
                host=users["host"],
                title="S1 E05 Recovery Browser",
                scheduled_start=recovery_start,
                scheduled_end=recovery_start + timedelta(hours=2),
                proposed_price=Decimal("45.00"),
                status=CleaningJob.Status.ASSIGNED,
                published_at=timezone.now(),
            )
            recovery_application = CleanerApplication.objects.create(
                job=recovery_job,
                cleaner=users["agency"],
                status=CleanerApplication.Status.ACCEPTED,
                proposed_member=users["cleaner"],
                message="Disposable delegated recovery assignment.",
            )
            Assignment.objects.create(
                job=recovery_job,
                cleaner=users["agency"],
                assigned_member=users["cleaner"],
                application=recovery_application,
                agreed_price=Decimal("45.00"),
            )
            JobLifecycleEvent.objects.create(
                lineage=recovery_lineage,
                job=recovery_job,
                actor=users["host"],
                actor_role_snapshot=users["host"].role,
                event_type=JobLifecycleEvent.EventType.JOB_ASSIGNED,
                to_status=CleaningJob.Status.ASSIGNED,
                metadata={"source": "s1_e05_recovery_e2e_seed"},
            )

        notifications = (
            (users["host"], "application.submitted", "S1 E2E host notification", "/host?section=applications&appFilter=pending"),
            (users["cleaner"], "review.requested", "S1 E2E cleaner notification", f"/cleaner?section=assignments&reviewJob={job.id}"),
            (users["agency"], "application.submitted", "S1 E2E agency notification", "/agency?section=work"),
            (users["host"], "legacy.deleted_target", "S1 E2E unavailable notification", ""),
        )
        for user, notification_type, title, destination in notifications:
            Notification.objects.update_or_create(
                user=user,
                title=title,
                defaults={"notification_type": notification_type, "body": "Disposable browser-test notification.", "metadata": {"destination": destination}, "read_at": None},
            )
        return users
