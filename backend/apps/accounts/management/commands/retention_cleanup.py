from django.core.management.base import BaseCommand

from apps.accounts.cleanup import cleanup_expired_temporary_state, cleanup_history_free_accounts
from apps.accounts.models import SignupEmailVerification, User
from apps.accounts.retention import HISTORY_FREE_CLOSURE_RETENTION, TECHNICAL_STATE_RETENTION
from django.utils import timezone


class Command(BaseCommand):
    help = "Preview or run bounded S1-D04 retention cleanup without printing personal data."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        limit = max(1, min(options["limit"], 500))
        now = timezone.now()
        temporary = SignupEmailVerification.objects.filter(expires_at__lt=now - TECHNICAL_STATE_RETENTION).count()
        history_free = User.objects.filter(closed_at__lte=now - HISTORY_FREE_CLOSURE_RETENTION, is_active=False).count()
        if options["dry_run"]:
            self.stdout.write(self.style.SUCCESS(f"dry-run temporary_state={temporary} history_free_candidates={history_free} limit={limit}"))
            return
        temporary_deleted = cleanup_expired_temporary_state(limit=limit)
        accounts_deleted = cleanup_history_free_accounts(limit=limit)
        self.stdout.write(self.style.SUCCESS(f"completed temporary_state={temporary_deleted} history_free_accounts={accounts_deleted}"))
