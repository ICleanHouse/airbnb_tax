# Production Hosting On This Machine

## Restart Handoff

See `CURRENT_PROGRESS.md` for the current production-hosting and local-development resume point.

This deployment runs the app with Docker Compose and exposes only the reverse proxy on host ports `80` and `443`.

## 1. Install prerequisites

Install Docker Desktop for Windows, then restart PowerShell so `docker` is available on `PATH`.

Verify:

```powershell
docker --version
docker compose version
```

If PowerShell cannot find `docker` immediately after install, the helper script will also try Docker Desktop's default CLI path: `C:\Program Files\Docker\Docker\resources\bin\docker.exe`.

## 2. Configure the production environment

Edit `.env.production` before exposing the app publicly. For current local/manual development, use `.env`; `.env.production` is only for the production Compose stack.

For LAN testing, the local defaults use:

```dotenv
APP_ENV=production
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.14,backend
POSTGRES_DB=airbnb_cleaners
POSTGRES_USER=airbnb_cleaners
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgres://airbnb_cleaners:<strong-random-password>@db:5432/airbnb_cleaners
FRONTEND_TRUSTED_ORIGINS=http://localhost,http://127.0.0.1,http://192.168.1.14
FRONTEND_URL=http://192.168.1.14
BACKEND_URL=http://192.168.1.14
ACCOUNT_APPROVAL_REQUIRED=True
CLEANER_VERIFICATION_REQUIRED=True
ALLOW_PILOT_VERIFICATION_BYPASS=False
PHONE_VERIFICATION_REQUIRED=False
```

When you know the router public IP, add it:

```dotenv
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.14,backend,<public-ip>
FRONTEND_TRUSTED_ORIGINS=http://localhost,http://127.0.0.1,http://192.168.1.14,http://<public-ip>
FRONTEND_URL=http://<public-ip>
BACKEND_URL=http://<public-ip>
```

Keep `SESSION_COOKIE_SECURE=false` and `CSRF_COOKIE_SECURE=false` while serving raw-IP HTTP. Change them to `true` only after HTTPS is working through a real domain.

Production settings fail fast when `APP_ENV=production` and any required value is unsafe or missing. Before starting the stack, confirm:

- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY` is unique and at least 32 characters
- `DATABASE_URL`, `DJANGO_ALLOWED_HOSTS`, and `FRONTEND_TRUSTED_ORIGINS` are set
- `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` match `DATABASE_URL`
- `EMAIL_VER_USER_SIGNUP=true`; production-like startup rejects the local fake-confirmation shortcut
- `ACCOUNT_APPROVAL_REQUIRED=true`, `CLEANER_VERIFICATION_REQUIRED=true`,
  `ALLOW_PILOT_VERIFICATION_BYPASS=false`, and
  `PHONE_VERIFICATION_REQUIRED=false` for the owner-approved interim policy

For signup email-code delivery, configure Resend. Do not use Gmail or SMTP for signup confirmation:

```dotenv
EMAIL_RESEND_APIKEY=re_...
EMAIL_RESEND_FROM_EMAIL=you@your-verified-domain.com
```

For crash reporting, configure Sentry:

```dotenv
APP_ENV=production
LOG_LEVEL=INFO
SENTRY_DSN=https://...
NEXT_PUBLIC_SENTRY_DSN=https://...
SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.0
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.0
```

`FRONTEND_URL` is used for frontend redirects and admin approval links. `BACKEND_URL` remains available for legacy backend links. Django's configurable mail backend may still be used by non-signup notification paths until those are migrated.

Signup is a single React wizard at `/signup`; old signup step URLs redirect there. Cleaner signup writes additional profile fields such as `native_language` and `experience_level`. Before deploying signup-flow changes for Cleaner, Host, or Agency, ensure the matching Django migrations are included and applied so production profile tables match the final frontend payloads.

### Guarded verification rehearsal

Do not disable either normal requirement while accepting genuine pilot jobs.
If a time-bounded production-like rehearsal is explicitly approved, set
`ALLOW_PILOT_VERIFICATION_BYPASS=True`, provide non-empty owner/reason metadata,
provide timezone-aware start/end values, and set
`PILOT_GENUINE_JOB_INTAKE_PAUSED=True`. Django validates this at startup and
again during signup; an expired window returns stable 503 and creates no user.
The operator warning contains no personal data and does not log the full reason.

### Verification rollback

1. Set `ACCOUNT_APPROVAL_REQUIRED=True` to stop new account shortcuts.
2. Set `CLEANER_VERIFICATION_REQUIRED=True` to stop new cleaner shortcuts.
3. Set `PHONE_VERIFICATION_REQUIRED=True` to stop new email-only normal
   advancement. This does not downgrade existing approved or eligible users.
4. Suspend affected existing accounts through the admin transition when access
   must stop; do not delete jobs, assignments, messages, audit history, or the
   evidence-exclusion ledger.
5. Use the restricted pilot ledger when excluding affected users from Stage 1
   metrics. Never clear exclusions implicitly.
6. Any bulk downgrade/reconciliation or user notification campaign requires a
   separately approved operator procedure; changing flags alone is not a
   rollback of existing state.

## 3. Open Windows Firewall

Run PowerShell as Administrator:

```powershell
.\deploy\open-firewall.ps1
```

This allows inbound TCP traffic on ports `80` and `443`.

## 4. Start the production stack

From the project root:

```powershell
.\deploy\start-production.ps1
```

Equivalent manual command:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up --build -d
```

The public reverse proxy exposes:

- Frontend: `http://localhost/`
- Backend health check: `http://localhost/api/health/`
- Django admin: `http://localhost/admin/`
- Operational property images: authenticated
  `/api/properties/images/{id}/content/` only

Production uploads are stored in the Docker volume `django_media`, but neither
Caddy, Django development routing, nor Next.js serves raw storage URLs. Every
`/media/*` request returns 404 with private/no-store, cache-purge, same-origin,
and nosniff headers. Django streams authorized `PropertyImage` content from
`/api/properties/images/{id}/content/` without redirects, raw storage paths, or
original filenames. Approved public cleaner profile media remains the
`profile_image` API/data value; it is not a `PropertyImage` file or an exception
to the raw-media denial. For a larger SaaS deployment, move property uploads to
private S3-compatible object storage and preserve the same object-authorization
boundary.

The privacy release temporarily sends `Clear-Site-Data: "cache"` on affected
API and denied-media responses to purge previously exposed payloads. Remove
that header no later than 2026-10-15, when the compatibility
`/api/marketplace/open-job-locations/` alias also sunsets. Do not include
`storage` or `cookies` in this purge.

Apply database migrations whenever signup/profile fields change:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend python manage.py migrate
```

For local/manual backend runs, use:

```powershell
cd backend
python manage.py migrate
```

## 5. Configure the router

On the router at `192.168.1.1`, reserve this machine as `192.168.1.14`, then forward:

- External TCP `80` -> `192.168.1.14:80`
- External TCP `443` -> `192.168.1.14:443`

Port `443` is mapped now for future HTTPS, but raw public-IP deployment should be tested over HTTP first.

## 6. Verify

Local:

```powershell
Invoke-WebRequest http://localhost/api/health/
```

LAN:

```powershell
Invoke-WebRequest http://192.168.1.14/api/health/
```

Public internet:

- Disconnect a phone from Wi-Fi.
- Open `http://<public-ip>/`.
- Confirm signup/login works without CSRF errors.

Useful logs:

```powershell
docker compose -f docker-compose.prod.yml logs -f proxy
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml ps
```

Backend/Celery logs are JSON. HTTP requests receive a normalized `request_id` in
the exact form `req_` plus 32 lowercase hexadecimal characters; invalid inbound
values are replaced, and Celery propagates IDs from normalized request context.
Request telemetry records resolver route templates rather than raw paths,
queries, or actor IDs. Business audit events remain separate and are visible in
Django admin at `/admin/core/auditlog/`. Sentry receives crashes only when DSNs
are configured.

## 7. Release quality gates

Run these before deploying a larger change:

```powershell
cd frontend
npm run typecheck
npm run lint
npm run build
cd ..
```

```powershell
cd backend
python manage.py check --deploy
python manage.py makemigrations --check --dry-run
pytest
cd ..
```

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```
