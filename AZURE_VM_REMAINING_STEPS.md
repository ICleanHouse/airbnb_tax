# Azure VM Deployment — Remaining Steps

**Source of truth:** [Azure VM deployment plan](docs/deployment/AZURE_VM_DEPLOYMENT_PLAN.md)

This is the concise pre-deployment checklist. It intentionally contains no
Azure deployment commands.

| Area | Complete before deployment |
| --- | --- |
| Application | Finish applicable Stage 1 release gates; pass backend/frontend checks and Linux/Ubuntu Compose validation. |
| Compose/Caddy | Only Caddy exposes 80/443; configure `chistoe.bg` + `www`, HTTPS, `/api`, trusted proxy headers, media denial, health checks, restart policy, limits, and log rotation. |
| Secrets | Create the production secret-store values; validate production hosts/origins/URLs, secure cookies, database/Redis, Resend, verification, Sentry, support, storage, and geocoding settings. Never commit them. |
| Azure/SSH | Create the Ubuntu VM, static IP, NSG (80/443 + restricted SSH only), key-only hardened SSH, updates, budget alerts, and monitoring. |
| Data | Record persistent PostgreSQL/media/Caddy locations; implement daily compressed PostgreSQL-to-Blob backups, retention, alerts, and media backup if VM-hosted. |
| Recovery | Prove a disposable database restore; retain a prior image; rehearse rollback without losing persistent data. |
| Release process | Complete a reviewed GHCR-based (or documented manual) image release design with migrations, health verification, image retention, and no secret logging. |
| Sign-off | Record security/network review, test results, restore and rollback evidence, alert checks, cost approval, and Gate C approval. |

Do not deploy until every applicable row is evidenced and the owner explicitly
requests the deployment procedure.
