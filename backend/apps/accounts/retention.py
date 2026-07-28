"""Central, policy-approved retention classifications for S1-D04.

Periods are product policy and deliberately do not claim a legal basis.  Any
legal, dispute, or support hold takes precedence over ordinary expiry.
"""

from datetime import timedelta


HISTORY_FREE_CLOSURE_RETENTION = timedelta(days=30)
STRUCTURED_MARKETPLACE_RETENTION = timedelta(days=365 * 5)
CASE_AND_NOTIFICATION_RETENTION = timedelta(days=365 * 2)
MESSAGE_RETENTION = timedelta(days=365)
TECHNICAL_STATE_RETENTION = timedelta(days=1)
BACKUP_RETENTION = timedelta(days=90)
DEFAULT_CLEANUP_BATCH_SIZE = 100


def history_free_deletion_due_at(closed_at):
    return closed_at + HISTORY_FREE_CLOSURE_RETENTION
