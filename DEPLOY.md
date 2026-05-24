# Production Hosting On This Machine

## Restart Handoff

Docker Desktop requires a Windows restart before continuing. See `CURRENT_PROGRESS.md` first after reboot, then resume at step 4 in this guide once Docker reports ready.

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
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.14,backend
FRONTEND_TRUSTED_ORIGINS=http://localhost,http://127.0.0.1,http://192.168.1.14
FRONTEND_URL=http://192.168.1.14
BACKEND_URL=http://192.168.1.14
```

When you know the router public IP, add it:

```dotenv
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.14,backend,<public-ip>
FRONTEND_TRUSTED_ORIGINS=http://localhost,http://127.0.0.1,http://192.168.1.14,http://<public-ip>
FRONTEND_URL=http://<public-ip>
BACKEND_URL=http://<public-ip>
```

Keep `SESSION_COOKIE_SECURE=false` and `CSRF_COOKIE_SECURE=false` while serving raw-IP HTTP. Change them to `true` only after HTTPS is working through a real domain.

For real email delivery, configure Gmail SMTP with a Google App Password:

```dotenv
DEFAULT_FROM_EMAIL=your-gmail-address@gmail.com
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=your-gmail-address@gmail.com
EMAIL_HOST_PASSWORD=your-google-app-password
```

`BACKEND_URL` is used in user email confirmation links. `FRONTEND_URL` is used for frontend redirects and admin approval links.

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
