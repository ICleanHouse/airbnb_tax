# Azure VM Rollback Requirements

**Status:** rollback is not yet implemented or rehearsed.

## Required design

- Build and retain immutable, identifiable previous image tags; never rely on
  an untagged mutable image as the rollback target.
- Record the release version, migration set, and pre-release database-backup
  reference for every production release.
- Keep database changes backward-compatible until the prior application image
  is no longer needed, or provide a separately reviewed data-recovery plan.
- Define health and smoke evidence that decides whether a release is accepted
  or must return to the prior image.
- Preserve PostgreSQL, media, and Caddy state during application rollback.
- Rehearse the rollback against a non-production target before the first real
  release, including a migration-compatible recovery case.

The operational command sequence is deliberately deferred until the owner asks
to deploy.
