# Stage 1 Sofia Pilot — Remaining Steps

**Source of truth:** [Stage 1 Sofia Pilot Plan](docs/STAGE_1_SOFIA_PILOT_PLAN.md)
**Snapshot:** 2026-07-30

This is the concise execution checklist for all unfinished Stage 1 work. Follow
the gates in order: **A/B readiness → C release → D supply → E 90-day
observation → F signed decision**. Do not start genuine pilot jobs before all
applicable Gate A–D work has passed.

## Immediate critical path — Gates A and B

| ID | Remaining step | Dependency / exit condition |
| --- | --- | --- |
| S1-D05 | Complete the remaining agency launch evidence: phone-ready roles, S1-O03 operator-confirmed supply availability, notification runtime, browser/accessibility journeys, and controlled recovery activation. | Full launch-critical agency path passes end to end. |
| S1-E02 | Approve an EEA SMS provider and limits; implement phone OTP, unique-number handling, private 18+ date handling, contact-change recovery, owner-admin restoration, seven-day pending expiry/cleanup, and the scoped badge. | Every role requires confirmed email, EEA phone, and private 18+ result before live access. |
| S1-E06 | Run an explicitly approved live Resend acceptance smoke using the configured provider. | Mark done only after provider acceptance; PostgreSQL, Redis/Celery, local success, retryable failure, and terminal-alert evidence already pass. |
| S1-E08 | Complete the account-recovery/deletion runtime evidence matrix. | Recovery, closure/anonymization, and their runtime proofs meet the approved policy. |
| S1-E10 | Configure the production secret-store alert recipient and remaining validated server-only settings; then enable Geoapify only when the approved controls hold. | Exact-provider traffic remains disabled until this passes; manual fallback stays available. |
| S1-UX01 | Build the Sofia landing page: honest value/coverage/verification wording, privacy-safe lead capture, text alternative, policy and support links. | BG/EN conversion page is safe and complete. |
| S1-UX02 | Make onboarding show the real email, phone, age, profile, and activation journey, including locked states. | No misleading “verified” or dead-end activation state. |
| S1-UX03 | Test and repair the complete pilot flow at 320/360/390/430 CSS pixels on Android Chrome and iOS Safari. | Mobile pilot workflow passes. |

## Recently completed implementation evidence

| ID | Delivered slice | Evidence / remaining deployment boundary |
| --- | --- | --- |
| S1-E05 | Agency-backed recovery preserves immutable source delegation; delegated completion/review prompts route only between host and concrete member. | [Focused TDD and PostgreSQL evidence](docs/testing/s1_e05_agency_recovery_parity.tdd.md). Enable the fail-closed recovery flag only after target-environment migrations are applied. |
| S1-UX04 | Complete WCAG 2.2 AA language, contrast, focus, errors, target size, reflow, map alternative, axe, keyboard, and screen-reader checks. | Accessibility gate passes. |

### Ongoing Gate B controls

- S1-E01: retain public-data/media allowlists and recursive privacy tests.
- S1-E03: retain signup browser-storage and telemetry allowlist tests.
- S1-E04: retain hard-overlap regression coverage. S1-O03/S1-D05 own the
  operator-confirmed supply-availability launch gate for the concierge cohort.
- S1-E09: keep calendar URL fetching disabled and upload-security tests active.

## Gate C — release, support, and verification

| ID | Remaining step | Exit condition |
| --- | --- | --- |
| S1-R01 | Publish reviewed BG/EN privacy, terms, cookie, verification, processor, research/pilot, retention, deletion, support, and incident disclosures. | All required policy surfaces are live and reviewed. |
| S1-R02 | Publish monitored support channel/hours; create restricted tracker and runbooks; rehearse critical runbooks. | Support operation is usable and rehearsed. |
| S1-R03 | Prepare the Azure VM target: domain/TLS, production secrets, private PostgreSQL/Redis networking, protected admin, throttles/headers/scans, persistent media, and deployment evidence. Run Celery unprivileged. See [Azure VM remaining steps](AZURE_VM_REMAINING_STEPS.md). | Secure pilot environment is live. |
| S1-R04 | Configure encrypted database recovery and media backups; prove clean restore and release rollback. See [Azure backup/restore requirements](docs/deployment/AZURE_VM_BACKUP_RESTORE.md). | Restore and rollback evidence passes. |
| S1-R05 | Enable sanitized browser/Django/Celery errors, readiness/worker signals, external alerts, TLS/backup/notification monitoring, and request-ID tracing. | Operational observability is active. |
| S1-Q01 | Re-baseline event and metric dictionary for the 90-day product-led model: lineage, match mode, exclusions, operator time, consent, and raw counts. | Approved measurable evidence contract. |
| S1-Q02 | Map backend evidence to the full matrix; add missing authorization, lifecycle, concurrency, reset/throttle, time, audit, and isolation tests. | Backend matrix passes. |
| S1-Q03 | Add frontend/browser coverage for status, role, locale, mobile, accessibility, and the 12 golden/recovery paths. | Frontend/browser matrix passes. |
| S1-Q04 | Add frontend/browser tests to CI and collect reproducible build, deploy, delivery, security, alert, restore, rollback, and sign-off evidence. | Release evidence matrix is complete. |

## Gate D — select and activate supply

| ID | Remaining step | Dependency / exit condition |
| --- | --- | --- |
| S1-O01 | Select the Sofia operating cluster; verify each cleaner’s contact timestamps, private 18+ result, active/stored eligibility, evidence inclusion, honest badge, and absence of prohibited vetting data. | S1-E02 is complete and cleaner supply is eligible. |
| S1-O02 | Verify agency representative and every delegated member; confirm immutable delegation/recovery and operational responsibilities. | S1-D05 and S1-E02 are complete. |
| S1-O03 | Activate supply: complete profiles/zones/two-week availability, capacity/travel/notice limits, walkthrough, test message, and incident/cancellation training. Maintain two cleaners per launched district/time band. | S1-O01/O02 complete and backup capacity exists. |

## Gate E — free Sofia observation

| ID | Remaining step | Dependency / exit condition |
| --- | --- | --- |
| S1-P01 | Sign the observation charter: launch boundary/timestamp, role readiness, evidence-consent-retention, operator limits, and day-91 decision process. | Gates A–D passed. |
| S1-P02 | Onboard each real host: qualify the Sofia need, explain workflow/payment/cancellation, collect a genuine job, and record acknowledgement without guest data. | S1-P01 complete. |
| S1-P03 | Execute and record the 14-step per-job runbook for every genuine turnover lineage. | Gate E is live. |
| S1-P04 | Rehearse and use the failure runbook for cancellations, no response/no-show, safety/quality/privacy, and agency substitution. | Rehearsed before launch; then used for actual events. |
| S1-P05 | Optionally run the localized actual-user survey through the approved external tool. | Real users exist and processor/notice/retention approvals are in place. |

Run the observation for **90 days from full marketplace launch**. Report raw
counts beside every rate; keep urgent jobs, exclusions, and organic/direct/
operator-assisted match modes separate.

## Gate F — close Stage 1

| ID | Remaining step | Exit condition |
| --- | --- | --- |
| S1-F01 | Audit every artifact and gate; record limitations, counter-evidence, incidents, raw metrics, and unresolved P0/P1 issues; sign exactly one outcome: Proceed, Extend once, Pivot, or Stop. | One signed, dated, traceable final decision. |

## Signed deferrals — do not execute in Stage 1

S1-M01 research setup, S1-M02 recruitment targets, S1-M03 interviews,
S1-M04 competitor/current-state research, and S1-M05 interview-led closeout
are deferred by the signed product-led validation decision. Reopen them only in
a later approved research or monetization phase.

## Before the first genuine job

Confirm all applicable Gate A–D items above, no unresolved P0/P1 issue, full
agency parity, eligible backup supply, secure deployment/restore/alerts, and
the observation charter. Payments, nationwide expansion, native apps, PWA
installability, advanced automation, and pricing/billing remain outside Stage 1.
