# Option 2 — Azure VM Deployment Preparation

## Goal

Prepare `chistoe.bg` for deployment to a single Azure Linux VM using the existing Docker Compose production architecture.

This is the low-cost pilot deployment model.

## Target architecture

```text
Internet
  |
Azure public IP
  |
Caddy container
  |
  +-- Next.js frontend
  +-- Django API
  +-- Celery worker
  +-- Celery Beat, if required
  +-- PostgreSQL
  +-- Redis
```

Only Caddy may expose public ports.

PostgreSQL, Redis, Django, Celery, and Next.js must remain inside the Docker network.

## Expected Azure resources

- One Azure Linux VM.
- Ubuntu LTS.
- Initial size: approximately 2 vCPU and 4 GB RAM.
- Upgrade path: 2 vCPU and 8 GB RAM if memory usage is high.
- One managed OS disk.
- Optional separate managed data disk for PostgreSQL and Docker volumes.
- Static public IP.
- Network Security Group.
- Azure Storage account for backups and optionally private media.
- Azure Budget alerts.
- DNS records for `chistoe.bg`.
- HTTPS managed by Caddy.

## Existing project stack

- Django REST Framework backend.
- Next.js frontend.
- PostgreSQL.
- Redis.
- Celery.
- Docker Compose.
- Caddy as the public reverse proxy.
- JSON logs and request IDs.
- Optional Sentry integration.

Read these files before making changes:

1. `CURRENT_PROGRESS.md`
2. `TGN.md`
3. `AGENT.md`
4. `architecture.md`
5. `DEV.md`
6. `DEPLOY.md`
7. `docker-compose.prod.yml`
8. `.env.example`

## Required preparation work

### 1. Audit the current production Compose stack

Confirm that `docker-compose.prod.yml` contains:

- Caddy.
- Next.js frontend.
- Django backend.
- Celery worker.
- Redis.
- PostgreSQL.
- Persistent volumes.
- Restart policies.
- Health checks where appropriate.
- No unnecessary public port exposure.

Only Caddy should publish ports `80` and `443`.

### 2. Make the stack Linux-compatible

The current development machine is Windows, but Azure will run Ubuntu.

Check for:

- Windows-only paths.
- PowerShell-only runtime assumptions.
- Bind mounts that depend on Windows paths.
- CRLF-related shell-script issues.
- File permission assumptions.
- Case-sensitive import problems.
- Linux-incompatible Docker commands.

Do not remove the existing Windows development workflow.

### 3. Production environment contract

Review `.env.example` and production settings.

Production must require safe values for:

```dotenv
APP_ENV=production
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=
DJANGO_ALLOWED_HOSTS=chistoe.bg,www.chistoe.bg
FRONTEND_TRUSTED_ORIGINS=https://chistoe.bg,https://www.chistoe.bg
FRONTEND_URL=https://chistoe.bg
BACKEND_URL=https://chistoe.bg

POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=
DATABASE_URL=

CELERY_BROKER_URL=
CELERY_RESULT_BACKEND=
CACHE_URL=

EMAIL_RESEND_APIKEY=
EMAIL_RESEND_FROM_EMAIL=

SESSION_COOKIE_SECURE=true
CSRF_COOKIE_SECURE=true

ACCOUNT_APPROVAL_REQUIRED=true
CLEANER_VERIFICATION_REQUIRED=true
ALLOW_PILOT_VERIFICATION_BYPASS=false
PHONE_VERIFICATION_REQUIRED=false
```

Also include any currently required Sentry, support-channel, storage, and geocoding variables.

Never commit real secrets.

### 4. Persistent data

Identify all state that must survive container replacement:

- PostgreSQL data.
- Uploaded media.
- Caddy certificates and state.
- Redis data only if persistence is intentionally required.

Use named Docker volumes or explicit mounted data directories.

Document every persistent path.

### 5. Backup and restore

Create a backup design for PostgreSQL.

Minimum requirements:

- Automated daily `pg_dump`.
- Timestamped compressed backups.
- Upload backups to Azure Blob Storage.
- Retention policy.
- Failure logging.
- Restore instructions.
- A tested restore into a disposable database.

Do not treat VM snapshots as the only database backup.

If media remains on the VM, back it up separately.

### 6. Caddy, DNS, and HTTPS

Prepare Caddy for:

- `chistoe.bg`.
- `www.chistoe.bg`.
- Automatic HTTPS.
- Redirecting HTTP to HTTPS.
- Same-origin `/api/*` routing to Django.
- Frontend routing to Next.js.
- Denying raw `/media/*` access.
- Forwarding trusted proxy headers correctly.

Do not expose Django directly to the internet.

### 7. Security and network rules

Prepare an Azure Network Security Group with:

- Public TCP 80.
- Public TCP 443.
- SSH restricted to trusted administrator IP addresses.
- No public PostgreSQL port.
- No public Redis port.
- No public Django or Next.js internal port.

Review SSH hardening:

- Key-based authentication.
- Password login disabled.
- Root login disabled.
- Automatic security updates.
- Fail2ban or equivalent protection if appropriate.

### 8. Resource limits

Add explicit container resource expectations where practical.

Pay special attention to:

- PostgreSQL memory.
- Next.js memory.
- Celery concurrency.
- Redis memory.
- Docker log growth.

For an initial 4 GB VM:

- Keep Celery concurrency low.
- Use conservative Gunicorn worker counts.
- Avoid excessive Next.js memory use.
- Configure log rotation.

Do not guess high worker counts based only on CPU count.

### 9. Deployment workflow

Prepare a repeatable deployment process.

Preferred flow:

```text
GitHub Actions
  -> run backend tests
  -> run frontend tests
  -> build images
  -> push images to GHCR
  -> SSH to Azure VM
  -> pull images
  -> run migrations
  -> restart services
  -> verify health
```

A simpler initial manual deployment is acceptable, but document every command.

Deployment must include:

- Database migration step.
- Health check.
- Rollback procedure.
- Previous image tag retention.
- No secret output in logs.

### 10. Observability

Confirm production support for:

- JSON logs.
- Request IDs.
- Sentry.
- Container restart visibility.
- Disk usage monitoring.
- CPU and memory monitoring.
- PostgreSQL backup failures.
- Health endpoint checks.

Configure Docker log rotation to prevent disk exhaustion.

### 11. Azure cost protection

Document the initial resource assumptions and configure:

- Azure monthly budget.
- Alerts at 50%, 75%, 90%, and 100%.
- Disk usage alert.
- VM CPU and memory alerts where available.
- Backup storage lifecycle rules.

Do not add Front Door, WAF, AKS, managed Redis, or managed PostgreSQL during this preparation unless explicitly approved.

## Non-goals

Do not:

- Migrate to AKS.
- Introduce microservices.
- Add Azure Front Door or WAF.
- Add Azure Managed Redis.
- Add PostgreSQL Flexible Server.
- Add payment infrastructure.
- Change marketplace business rules.
- Change verification policy.
- Expose raw media URLs.
- Replace the existing local Windows workflow.
- Perform the real Azure deployment without explicit approval.

## Expected deliverables

Produce or update:

1. `docs/deployment/AZURE_VM_DEPLOYMENT_PLAN.md`
2. `docs/deployment/AZURE_VM_RUNBOOK.md`
3. `docs/deployment/AZURE_VM_BACKUP_RESTORE.md`
4. `docs/deployment/AZURE_VM_ROLLBACK.md`
5. Production-safe Caddy configuration.
6. Linux-compatible deployment scripts.
7. Updated `.env.example` with placeholders only.
8. Updated `docker-compose.prod.yml`, if required.
9. Health checks and restart policies.
10. Verification checklist.

Update existing documentation instead of duplicating authoritative information where practical.

## Verification commands

Run the relevant existing test suite.

Backend:

```powershell
cd backend
python manage.py check
python manage.py check --deploy
python manage.py test
```

Frontend:

```powershell
cd frontend
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

Docker:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

Also verify the stack on a Linux environment or CI runner.

Do not report Windows-only Docker success as proof that the Azure Ubuntu deployment is ready.

## Acceptance criteria

The preparation is complete when:

- The production Compose stack runs successfully on Linux.
- Only ports 80, 443, and restricted SSH are publicly reachable.
- HTTPS and domain routing are fully documented.
- Production settings fail safely when required values are missing.
- PostgreSQL and media survive container replacement.
- Automated backups upload successfully to Azure Blob Storage.
- A restore has been tested.
- Deployment and rollback commands are documented.
- Docker logs cannot grow without limit.
- Health checks cover frontend, backend, PostgreSQL, Redis, and worker readiness where practical.
- No real secret appears in tracked files.
- Backend tests pass.
- Frontend tests, typecheck, and lint pass.
- `python manage.py check --deploy` has no unexplained production warnings.
- The expected initial Azure monthly cost remains within the approved pilot budget.

## Codex working instruction

Start in plan mode.

First perform a read-only audit of the current deployment files and documentation. Identify gaps between the existing production Compose setup and the Azure Ubuntu VM target.

Do not modify files until the audit is complete.

For every recommended change, cite exact file paths and explain whether it is:

- Required before deployment.
- Recommended before deployment.
- Safe to defer until after the pilot.

Preserve the existing architecture, security boundaries, marketplace invariants, and Windows development workflow.
