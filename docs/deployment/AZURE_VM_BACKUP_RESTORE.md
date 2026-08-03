# Azure VM Backup and Restore Requirements

**Status:** design and acceptance criteria only; no backup job or restore has
been configured or tested.

## Required design

- Run an automated daily `pg_dump` of PostgreSQL; produce timestamped,
  compressed backups and upload them to private Azure Blob Storage.
- Define retention and an Azure Storage lifecycle rule consistent with the
  Stage 1 90-day backup baseline, subject to legal review.
- Alert on failed, missing, or overdue backups without emitting secrets or
  personal data in logs.
- Treat VM snapshots as supplementary only, never as the database backup.
- If operational media stays on the VM, back it up separately and preserve the
  existing object-authorized access boundary.
- Document the persistent Docker locations for PostgreSQL, media, and Caddy
  state before implementation; Redis is persistent only by deliberate choice.

## Required evidence before deployment

1. A backup completes, reaches the intended private storage location, and is
   readable.
2. A current backup restores into a disposable PostgreSQL database without
   overwriting live data.
3. The restored application data passes agreed integrity and migration checks.
4. Retention, failure alerting, access restrictions, and media backup (if
   applicable) are demonstrated.

The execution procedure will be added only when deployment is explicitly
requested.
