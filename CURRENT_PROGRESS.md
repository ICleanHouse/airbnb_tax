# Current Progress Handoff

Updated: 2026-05-27, after multi-step signup UI refactor updates.

## User Goal

Host this project on this Windows machine and expose it to outside traffic through router port forwarding. Runtime target is Docker Desktop. Public access target is raw public IP over HTTP on port `80`, with port `443` reserved for future HTTPS/domain work.

## Implemented In Repo

- Added production Compose stack: `docker-compose.prod.yml`.
- Added Caddy reverse proxy config: `deploy/Caddyfile`.
- Added production Dockerfiles:
  - `backend/Dockerfile.prod`
  - `frontend/Dockerfile.prod`
- Added deployment environment file: `.env.production`.
- Added helper scripts:
  - `deploy/start-production.ps1`
  - `deploy/open-firewall.ps1`
- Added deployment guide: `DEPLOY.md`.
- Added WhiteNoise static serving for Django with `DJANGO_DEBUG=false`.
- Added missing frontend API helper: `frontend/lib/api.ts`.
- Wrapped the admin page `useSearchParams` usage in `Suspense` so Next production builds do not fail on that route.
- Updated `.gitignore` to ignore `.env.production` and `.env.production.local` for future secret handling.
- Added user email confirmation on signup:
  - `send_account_confirmation_email` Celery task.
  - `GET /api/accounts/confirm-email/<uidb64>/<token>/` endpoint.
  - `BACKEND_URL` setting for confirmation links.
- Added Gmail SMTP template values to `.env.example`.
- Added `.env` loading from `settings.py` so manual Django and Celery runs read local environment values.
- Updated signup UI into a multi-step flow in progress:
  - `/signup` (credentials + validation + password checklist)
  - `/signup/role` (role selection step)
  - `/signup/location` (city + district selection step)
  - Cleaner signup is still not finished end-to-end.
- Added cleaner dashboard/profile updates: calendar, profile picture upload preview, service-area dropdown, sex dropdown, applications, assignments, and open jobs.

## Current Local Development Notes

- Ignore `.env.production` unless production Docker hosting is resumed.
- Use `.env` for local/manual PowerShell runs.
- For local SQLite, remove or comment out `DATABASE_URL`.
- For local Redis, use:

```dotenv
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
```

- Celery must be running for signup emails when Celery is installed:

```powershell
cd C:\Users\35987\Desktop\airbnb_tax\backend
python -m celery -A config worker --loglevel=info --pool=solo
```

## Verified

- Docker CLI exists at `C:\Program Files\Docker\Docker\resources\bin\docker.exe`.
- Docker Desktop daemon is running on the `desktop-linux` context.
- Docker Compose exists and reports version `v5.1.4`.
- Production Compose config validates with:

```powershell
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' compose --env-file .env.production -f docker-compose.prod.yml config
```

- PowerShell helper scripts parse successfully.
- Production stack was started with:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\start-production.ps1
```

- Docker containers are running:
  - `airbnb_tax-db-1`
  - `airbnb_tax-redis-1`
  - `airbnb_tax-backend-1`
  - `airbnb_tax-worker-1`
  - `airbnb_tax-frontend-1`
  - `airbnb_tax-proxy-1`
- Caddy exposes host ports `80` and `443`.
- Local backend health check works:

```powershell
Invoke-WebRequest http://localhost/api/health/
```

- LAN backend health check works from this machine:

```powershell
Invoke-WebRequest http://192.168.1.14/api/health/
```

- Frontend root works locally:

```powershell
Invoke-WebRequest http://localhost/
```

- Recent logs show Caddy, Next.js, Gunicorn, and Celery running.

## Remaining Blockers

- Windows Firewall rule creation requires an Administrator PowerShell session and was not applied from this non-admin shell.
- Router forwarding was not configured yet.
- Public IP was not added to `.env.production` yet.

## Next Steps

1. Open Administrator PowerShell in this repo:

```powershell
cd C:\Users\misho\OneDrive\Desktop\airbnb_tax
```

2. Open firewall ports:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\open-firewall.ps1
```

3. Configure router forwarding on `192.168.1.1`:
   - External TCP `80` -> `192.168.1.14:80`
   - External TCP `443` -> `192.168.1.14:443`

4. When the public IP is known, update `.env.production`:
   - add `<public-ip>` to `DJANGO_ALLOWED_HOSTS`
   - add `http://<public-ip>` to `FRONTEND_TRUSTED_ORIGINS`
   - set `FRONTEND_URL=http://<public-ip>`
   - set `BACKEND_URL=http://<public-ip>`

5. Restart the production stack after `.env.production` changes:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

6. Verify public access from a phone disconnected from Wi-Fi:

```powershell
http://<public-ip>/
```

## Useful Commands

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

## Important Notes

- This is raw-IP HTTP for now. Keep `SESSION_COOKIE_SECURE=false` and `CSRF_COOKIE_SECURE=false` until a domain with HTTPS is configured.
- Do not expose ports `8000`, `5432`, or `6379`; only Caddy should publish host ports.
- `.env.production` currently contains a placeholder production secret and local LAN defaults. Replace the secret before real public use.
