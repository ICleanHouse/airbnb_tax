# Master Remaining Tasks

**Snapshot:** 2026-08-03  
**Scope:** all currently tracked Stage 1 pilot and Azure-preparation work.

This is the single high-level checklist. Detailed acceptance criteria remain in
[Stage 1 remaining steps](STAGE_1_REMAINING_STEPS.md) and
[Azure VM remaining steps](AZURE_VM_REMAINING_STEPS.md). Signed Stage 1
deferrals are excluded and must not be reopened without approval.

## A/B — product and launch readiness

- [ ] **S1-D05:** finish agency launch evidence: phone-ready roles, supply
  availability, notification runtime, browser/accessibility journeys, and
  controlled recovery activation.
- [ ] **S1-E02:** select the EEA SMS provider and limits; add phone OTP,
  unique-number handling, private 18+ validation, contact-change recovery,
  owner-admin restoration, expiry/cleanup, and the contact-scoped badge.
- [ ] **S1-E06:** run the explicitly approved live Resend acceptance smoke.
- [ ] **S1-E08:** complete recovery and closure/anonymization runtime evidence.
- [ ] **S1-E10:** configure the server-only Geoapify alert recipient and other
  required settings before enabling provider traffic.
- [ ] **S1-UX01:** complete the Sofia landing page and privacy-safe lead path.
- [ ] **S1-UX02:** make the real email, phone, age, profile, and locked-state
  activation journey clear.
- [ ] **S1-UX03:** pass the full mobile flow at 320/360/390/430 CSS pixels on
  Android Chrome and iOS Safari.
- [ ] **S1-UX04:** complete WCAG 2.2 AA checks, including browser/assistive-
  technology evidence; resolve the outstanding frontend test-environment
  dependency/cache blockers.
- [ ] Retain release regressions for privacy/media (S1-E01), signup-storage and
  telemetry (S1-E03), assignment overlap (S1-E04), and disabled calendar URL
  fetching/upload security (S1-E09).

## C — release, support, and quality

- [ ] **S1-R01:** publish reviewed BG/EN legal, privacy, verification,
  retention, deletion, support, and incident disclosures.
- [ ] **S1-R02:** establish the monitored support channel, restricted tracker,
  operating runbooks, and rehearsals.
- [ ] **S1-R03:** complete secure Azure VM, domain/TLS, production-secret,
  private-networking, protected-admin, media, and unprivileged-worker evidence.
- [ ] **S1-R04:** prove encrypted database/media backup, disposable restore,
  and release rollback.
- [ ] **S1-R05:** enable sanitized error reporting, health/worker signals,
  alerts, request-ID tracing, and TLS/backup/notification monitoring.
- [ ] **S1-Q01:** approve the product-led metric/event dictionary.
- [ ] **S1-Q02:** complete backend authorization, lifecycle, concurrency,
  throttle, time, audit, and isolation coverage.
- [ ] **S1-Q03:** complete browser coverage for role/status/locale/mobile/
  accessibility and the golden/recovery paths.
- [ ] **S1-Q04:** run frontend/browser tests in CI and collect reproducible
  build, delivery, security, alert, restore, rollback, and sign-off evidence.

## Azure pre-deployment work

- [ ] Validate the Compose stack on Ubuntu or Linux CI and retain Windows local
  development unchanged.
- [ ] Configure domain Caddy routing, automatic HTTPS, trusted proxy headers,
  raw-media denial, health checks, resource limits, and Docker log rotation.
- [ ] Create and validate production secrets without committing them.
- [ ] Provision/harden the Ubuntu VM, static IP, restricted SSH, NSG, updates,
  budget alerts, and operational monitoring.
- [ ] Document persistent PostgreSQL/media/Caddy locations and implement daily
  compressed PostgreSQL-to-Blob backups, retention, alerts, and VM-media backup
  where applicable.
- [ ] Test a restore into a disposable database and rehearse application
  rollback using a retained previous image.
- [ ] Complete an image-based GHCR release design (or approved manual
  equivalent) with migration safety and health verification.

See [Azure VM deployment plan](docs/deployment/AZURE_VM_DEPLOYMENT_PLAN.md),
[backup/restore](docs/deployment/AZURE_VM_BACKUP_RESTORE.md), and
[rollback](docs/deployment/AZURE_VM_ROLLBACK.md). Deployment commands remain
out of scope until explicitly requested.

## D — activate eligible Sofia supply

- [ ] **S1-O01:** select the operating cluster and confirm each cleaner's
  contact/18+/eligibility/evidence/badge requirements.
- [ ] **S1-O02:** verify each agency representative and delegated member, plus
  delegation/recovery responsibilities.
- [ ] **S1-O03:** activate profiles, zones, availability, limits, walkthroughs,
  test messages, incident training, and two-cleaner backup capacity per
  launched district/time band.

## E — 90-day Sofia observation

- [ ] **S1-P01:** sign the observation charter.
- [ ] **S1-P02:** onboard qualified real hosts and record acknowledgements
  without guest data.
- [ ] **S1-P03:** run and record the 14-step per-job workflow for every real
  turnover lineage.
- [ ] **S1-P04:** rehearse and use the failure/recovery runbook.
- [ ] **S1-P05:** optionally conduct the approved localized actual-user survey.
- [ ] Run the observation for 90 days from full launch, with raw counts and
  separate urgent, exclusion, and match-mode reporting.

## F — close Stage 1

- [ ] **S1-F01:** audit all artifacts and gates; record limitations,
  counter-evidence, incidents, metrics, and open P0/P1 issues; sign exactly one
  outcome: Proceed, Extend once, Pivot, or Stop.

## Explicitly deferred

Do not execute S1-M01 through S1-M05 (research setup, recruitment targets,
interviews, competitor research, and interview-led closeout) in Stage 1 unless
a later approved research or monetization phase reopens them. Payments,
nationwide expansion, native apps, PWA installability, and pricing/billing also
remain out of scope.
