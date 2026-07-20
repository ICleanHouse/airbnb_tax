from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.properties.models import Property
from apps.marketplace.models import CleanerApplication
from apps.marketplace.services import create_cleaning_job, publish_job
from apps.accounts.models import CleanerProfile
from django.utils import timezone

User = get_user_model()

class Command(BaseCommand):
    help = "Seed the database with demo data for development/testing."

    def handle(self, *args, **options):
        if User.objects.filter(email__startswith="demo_").exists():
            self.stdout.write(
                self.style.WARNING(
                    "Demo users already exist; retained lifecycle history was not deleted."
                )
            )
            return

        # Create demo hosts
        host1 = User.objects.create_user(username="demo_host1", email="demo_host1@example.com", password="demo1234", role="host", account_status="approved", first_name="Host", last_name="One")
        host2 = User.objects.create_user(username="demo_host2", email="demo_host2@example.com", password="demo1234", role="host", account_status="approved", first_name="Host", last_name="Two")

        # Create demo cleaners
        cleaner1 = User.objects.create_user(username="demo_cleaner1", email="demo_cleaner1@example.com", password="demo1234", role="cleaner", first_name="Mira", last_name="Cleaning")
        cleaner2 = User.objects.create_user(username="demo_cleaner2", email="demo_cleaner2@example.com", password="demo1234", role="cleaner", first_name="Elena", last_name="Petrova")

        # Create cleaner profiles
        profile1 = CleanerProfile.objects.create(user=cleaner1, kind="agency", verification_status="verified", display_name="Mira Cleaning Agency", bio="Top-rated agency in Sofia.", city="Sofia", service_areas=["Sofia"], average_rating=4.9, completed_jobs_count=120)
        profile2 = CleanerProfile.objects.create(user=cleaner2, kind="individual", verification_status="verified", display_name="Elena Petrova", bio="Experienced individual cleaner.", city="Plovdiv", service_areas=["Plovdiv"], average_rating=4.8, completed_jobs_count=80)

        # Create properties
        prop1 = Property.objects.create(host=host1, name="Studio near NDK", address="NDK, Sofia", city="Sofia", country="Bulgaria", timezone="Europe/Sofia", access_notes="", cleaning_instructions="", default_cleaning_duration_minutes=120, default_price_eur=40)
        prop2 = Property.objects.create(host=host2, name="Old Town house", address="Old Town, Plovdiv", city="Plovdiv", country="Bulgaria", timezone="Europe/Sofia", access_notes="", cleaning_instructions="", default_cleaning_duration_minutes=120, default_price_eur=50)

        # Create cleaning jobs
        job1 = create_cleaning_job(actor=host1, property=prop1, title="Clean Studio near NDK", description="Standard cleaning after guest checkout.", scheduled_start=timezone.now(), scheduled_end=timezone.now() + timezone.timedelta(hours=2), currency="EUR", proposed_price=40, agreed_price=40, cleaning_instructions="")
        job2 = create_cleaning_job(actor=host2, property=prop2, title="Clean Old Town house", description="Deep cleaning before new guest.", scheduled_start=timezone.now(), scheduled_end=timezone.now() + timezone.timedelta(hours=3), currency="EUR", proposed_price=50, agreed_price=50, cleaning_instructions="")
        publish_job(job1, actor=host1)
        publish_job(job2, actor=host2)

        # Create cleaner applications
        CleanerApplication.objects.create(job=job1, cleaner=cleaner1, proposed_price=38, status="pending", message="Available next week")
        CleanerApplication.objects.create(job=job2, cleaner=cleaner2, proposed_price=48, status="pending", message="Can do weekends")

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully!"))
