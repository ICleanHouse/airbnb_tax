# Azure VM Deployment Plan

**Status:** preparation only — no Azure resources or production deployment have been performed.

## Target

Deploy the Stage 1 pilot to one Ubuntu LTS Azure VM (initially about 2 vCPU /
4 GB RAM) with a static public IP. Caddy is the only internet-facing
container; it terminates HTTPS for `chistoe.bg` and `www.chistoe.bg` and
routes same-origin `/api/*` to Django and all other traffic to Next.js.

PostgreSQL, Redis, Django, Celery, and Next.js remain private to Docker. This
pilot deliberately does not add AKS, Front Door/WAF, managed Redis,
PostgreSQL Flexible Server, or payment infrastructure.

## Current baseline and required work

`docker-compose.prod.yml` already defines Caddy, frontend, backend, worker,
PostgreSQL, Redis, named data volumes, restart policies, and service health
checks. It is not Azure-ready yet. Before deployment, complete and evidence:

- Domain-specific Caddy configuration with automatic HTTPS, trusted proxy
  handling, HTTP-to-HTTPS redirects, and continued raw `/media/*` denial.
- Linux-compatible images/scripts and a successful Ubuntu or Linux-CI Compose
  validation. Retain the Windows local-development workflow.
- A production environment contract with placeholder-only examples and
  fail-fast validation: HTTPS hosts/origins/URLs, secure session and CSRF
  cookies, database/Redis URLs, Resend, verification flags, plus enabled
  Sentry, support, storage, and geocoding settings.
- Explicit persistence records for PostgreSQL, media, Caddy state, and only
  intentionally persistent Redis data.
- Daily compressed PostgreSQL backups to Azure Blob Storage, retention,
  failure alerting, separate media backup when media stays on the VM, and a
  proven disposable restore.
- VM/NSG/SSH hardening: public TCP 80/443 only, SSH restricted to administrator
  IPs, no public internal services, keys only, disabled root/password login,
  security updates, and appropriate brute-force protection.
- Conservative resource limits, low Celery concurrency, Docker log rotation,
  and monitoring for health, restarts, disk, CPU/memory, and backup failures.
- A repeatable image-based release and rollback design with retained previous
  image tags, migration safety, and health verification. GitHub Actions → GHCR
  → VM is preferred; a documented manual equivalent is acceptable.
- Azure budget alerts at 50%, 75%, 90%, and 100%, plus backup-storage lifecycle
  and disk alerts.

## Evidence gate

The VM is not ready for a real deployment until the concise
[remaining-steps checklist](../../AZURE_VM_REMAINING_STEPS.md) is complete,
the Stage 1 Gate C release work is approved, and the required test, security,
backup/restore, and rollback evidence is recorded. Deployment commands are
intentionally withheld until the owner explicitly requests the deployment.

See also: [backup and restore](AZURE_VM_BACKUP_RESTORE.md),
[rollback](AZURE_VM_ROLLBACK.md), and the [operations runbook scope](AZURE_VM_RUNBOOK.md).
