# Azure VM Operations Runbook Scope

**Status:** preparation scope only. This is not a deployment instruction set.

Before the first deployment, complete runbooks for:

- service health and container restart investigation;
- JSON/request-ID and Sentry triage without exposing sensitive data;
- disk, CPU/memory, Docker-log, TLS, and backup-failure alerts;
- PostgreSQL restore and application rollback;
- SSH/access incident response and support escalation; and
- a release verification record covering frontend, backend, PostgreSQL, Redis,
  Celery, Caddy, and external health checks.

The operations owner, monitored support channel, alert recipients, retention,
and escalation path must be named in restricted operational records rather
than committed here. Command-level runbooks will be written when deployment is
explicitly requested.
