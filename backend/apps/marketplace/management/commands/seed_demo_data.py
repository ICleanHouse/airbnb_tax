from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.properties.models import Property
from apps.marketplace.models import CleaningJob, CleanerApplication
from apps.accounts.models import CleanerProfile
from django.utils import timezone

User = get_user_model()

class Command(BaseCommand):
    help = "Seed the database with demo data for development/testing."

    def handle(self, *args, **options):
        # Clear old demo data
        CleanerApplication.objects.all().delete()
        CleaningJob.objects.all().delete()
        Property.objects.all().delete()
        CleanerProfile.objects.all().delete()
        User.objects.filter(email__startswith="demo_").delete()

        # Create demo hosts
        host1 = User.objects.create_user(username="demo_host1", email="demo_host1@example.com", password="demo1234", role="host", first_name="Host", last_name="One")
        host2 = User.objects.create_user(username="demo_host2", email="demo_host2@example.com", password="demo1234", role="host", first_name="Host", last_name="Two")

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
        job1 = CleaningJob.objects.create(property=prop1, host=host1, title="Clean Studio near NDK", description="Standard cleaning after guest checkout.", scheduled_start=timezone.now(), scheduled_end=timezone.now() + timezone.timedelta(hours=2), currency="EUR", proposed_price=40, agreed_price=40, status="open", cleaning_instructions="")
        job2 = CleaningJob.objects.create(property=prop2, host=host2, title="Clean Old Town house", description="Deep cleaning before new guest.", scheduled_start=timezone.now(), scheduled_end=timezone.now() + timezone.timedelta(hours=3), currency="EUR", proposed_price=50, agreed_price=50, status="open", cleaning_instructions="")

        # Create cleaner applications
        CleanerApplication.objects.create(job=job1, cleaner=cleaner1, proposed_price=38, status="pending", message="Available next week")
        CleanerApplication.objects.create(job=job2, cleaner=cleaner2, proposed_price=48, status="pending", message="Can do weekends")

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully!"))
