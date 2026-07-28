from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.accounts.models import AgencyMembership, CleanerProfile, User
from apps.marketplace.models import CleanerApplication
from apps.notifications.models import Notification


@override_settings(DEBUG=True, APP_ENV="test")
class S1E07E2ESeedCommandTests(TestCase):
    def test_creates_deterministic_disposable_accounts_and_agency_work(self):
        call_command("seed_s1_e07_e2e", password="test-only-password", reset=True)

        host = User.objects.get(email="s1e07-e2e-host@e2e.invalid")
        cleaner = User.objects.get(email="s1e07-e2e-cleaner@e2e.invalid")
        agency = User.objects.get(email="s1e07-e2e-agency@e2e.invalid")
        self.assertTrue(host.is_marketplace_eligible)
        self.assertEqual(cleaner.cleaner_profile.verification_status, CleanerProfile.VerificationStatus.VERIFIED)
        self.assertTrue(agency.is_marketplace_eligible)
        self.assertTrue(AgencyMembership.objects.filter(agency=agency.agency_profile, cleaner=cleaner).exists())
        self.assertTrue(CleanerApplication.objects.filter(cleaner=agency).exists())
        self.assertEqual(Notification.objects.filter(user=agency).count(), 1)

    @override_settings(DEBUG=False)
    def test_refuses_non_debug_environment(self):
        with self.assertRaises(CommandError):
            call_command("seed_s1_e07_e2e", password="test-only-password")
