# Stage 1 — Sofia Pilot Readiness and Validation Plan

| Plan field | Value |
|---|---|
| Status | Active execution plan — Gates A and B in progress |
| Created | 2026-07-13 |
| Last updated | 2026-07-21 |
| Scope | Product, engineering, research, operations, and release work required to complete Stage 1 |
| Decision at exit | Proceed, extend once, pivot, or stop |

**Start here:** Hold the Gate A owner-decision session and sign every M0/M1
entry criterion. Exact anonymous job/property disclosure and sensitive signup
storage have been contained, and authoritative cleaner-overlap protection is
implemented. Calendar URL fetching is disabled for the pilot, and every
enabled Stage 1 upload path is bounded and validated.

### Current progress snapshot — 2026-07-21

- **Done:** S1-D04, S1-E01, S1-E03, S1-E04, and S1-E09. Public
  disclosure/media, signup-secret persistence, cleaner schedule overlap, and
  calendar/upload protections are implemented and tested.
- **In progress — contact policy implemented:** ADR-0002 records the
  owner-approved contact policy; signup now creates safe pending state before
  atomic reconciliation, guarded shortcuts are evidence-excluded, and the
  admin/user surfaces describe the interim policy honestly. S1-E02 remains in
  progress because phone OTP and the S1-D02 manual cleaner/agency policy are
  unresolved.
- **Resolved launch blockers:** S1-B01 exact anonymous job/property disclosure,
  S1-B03 sensitive signup-browser persistence, S1-B04 cross-property cleaner
  double-booking, S1-B09 raw/private property-media exposure, and S1-B16
  unrestricted calendar URL fetching.
- **Gate status:** Gate A and Gate B are in progress. Gates C–F have not started.
- **Next critical work:** finish the Gate A owner decisions, implement S1-E06
  notification reliability, and complete S1-E10's provider approval, privacy
  notice, and authenticated browser trace.

---

## Contents

- [1. Purpose](#1-purpose)
- [2. Stage 1 capability](#2-stage-1-capability)
- [3. Fixed constraints and implementation contract](#3-fixed-constraints-and-implementation-contract)
- [4. Current baseline](#4-current-baseline)
- [5. Ownership](#5-ownership)
- [6. Stage 1 sequence](#6-stage-1-sequence)
- [7. Gate A — Required decisions and operating policy](#7-gate-a--required-decisions-and-operating-policy)
- [8. Gate B, part 1 — Launch-safety and workflow implementation](#8-gate-b-part-1--launch-safety-and-workflow-implementation)
- [9. Gate B, part 2 — Landing, onboarding, mobile, and accessibility](#9-gate-b-part-2--landing-onboarding-mobile-and-accessibility)
- [10. Gate C, part 1 — Support, policy, release, and operations](#10-gate-c-part-1--support-policy-release-and-operations)
- [11. Gate C, part 2 — Instrumentation and verification](#11-gate-c-part-2--instrumentation-and-verification)
- [12. Gate D, part 1 — Execute M1 research](#12-gate-d-part-1--execute-m1-research)
- [13. Gate D, part 2 — Supply verification and activation](#13-gate-d-part-2--supply-verification-and-activation)
- [14. Gate E — Free Sofia concierge fulfillment pilot](#14-gate-e--free-sofia-concierge-fulfillment-pilot)
- [15. Metrics and Stage 1 decision gates](#15-metrics-and-stage-1-decision-gates)
- [16. Gate F — Final readout and owner decision](#16-gate-f--final-readout-and-owner-decision)
- [17. Required evidence artifacts](#17-required-evidence-artifacts)
- [18. Deferred until after Stage 1](#18-deferred-until-after-stage-1)
- [19. Implementation handoff](#19-implementation-handoff)

---

## 1. Purpose

This document turns the current product review into one executable Stage 1 plan.
It is the canonical checklist for making the marketplace safe enough for real
users, executing the already-approved M1 research cycle, running a free Sofia
concierge fulfillment pilot, and making an evidence-based next-stage decision.

Stage 1 is broader than monetization Phase M1:

- **M1** is the existing two-week market, customer, and competitor research
  phase. It does not validate final willingness to pay.
- **Stage 1** includes M1, launch-readiness work, real supply verification, a
  free fulfillment pilot, and the final go/extend/pivot/stop readout.
- The free pilot in this plan is **not** the later paid M4 pilot from the
  monetization roadmap.
- Engineering work in this plan belongs to the broader Stage 1 milestone. It
  does not change the M1 document’s research-only scope.

Stage 1 can be completed with a no-go or pivot decision. “Completed” means the
evidence pack and owner decision exist. “Passed” means the Stage 2 entry gates
in this plan are met.

### Source-of-truth documents

This plan does not replace the repository’s higher-priority product rules:

- [BUSINESS.md](../BUSINESS.md)
- [architecture.md](../architecture.md)
- [TGN.md](../TGN.md)
- [DEV.md](../DEV.md)
- [AGENTS.md](../AGENTS.md)
- [M0 Monetization Constraints Brief](monetization/M0_MONETIZATION_CONSTRAINTS_BRIEF.md)
- [M1 Market, Customer, and Competitor Research Plan](monetization/M1_MARKET_CUSTOMER_COMPETITOR_RESEARCH_PLAN.md)
- [Monetization Implementation Roadmap](monetization/MONETIZATION_IMPLEMENTATION_ROADMAP.md)
- [Mobile Feasibility](MOBILE_FEASIBILITY.md)

If this plan conflicts with one of those documents, the priority order in
[AGENTS.md](../AGENTS.md) applies.

---

## 2. Stage 1 capability

After Stage 1 passes:

> A Sofia host can safely request or post a genuine turnover-cleaning job; only
> approved users and marketplace-eligible cleaners can participate; the platform
> prevents overlapping assignments, protects exact property details, preserves
> job history when something fails, and gives an operator enough information and
> control to support the job through completion. The business can measure
> liquidity, reliability, repeat use, and operator effort and can decide whether
> to continue.

### Primary users

- **Primary:** Sofia short-term-rental hosts managing approximately 4–20
  properties.
- **Secondary research segment:** Sofia cleaning agencies.
- **Supply-risk segment:** Individual cleaners with Sofia short-term-rental
  turnover experience.
- **Operator:** The person approving accounts, verifying supply, supporting
  live jobs, and maintaining the incident record.

### Stage 1 positioning

The narrow working position is:

> Verified Sofia turnover cleaners, dependable backup coverage, and reliable
> coordination when a regular cleaner cannot perform.

The product should not position itself as the cheapest cleaning option, a
general residential cleaning marketplace, or merely another calendar tool.

### Current market evidence and limitation

- Eurostat reports that EU guest nights booked through short-stay platforms
  increased 11.4% in 2025. This supports the category’s relevance but does not
  prove Sofia marketplace liquidity:
  [Eurostat, April 2026](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260401-1).
- Bulgarian vendor Hostler currently markets iCal synchronization,
  auto-generated cleaning schedules, a PWA, alerts, and per-property pricing.
  This is vendor-provided positioning, not independently verified traction:
  [Hostler](https://hostler.app/).
- Domestina demonstrates an established general-cleaning marketplace
  alternative in Sofia, while Turno demonstrates the mature international
  vacation-rental workflow of vetted supply, scheduling, checklists, and issue
  reporting:
  [Domestina](https://www.domestina.bg/en/house-cleaning-services/sofia) and
  [Turno](https://turno.com/features/photo-checklists/).

**Inference:** Stage 1 should test the narrower local wedge—verified turnover
supply and backup recovery—rather than compete feature-for-feature with
calendar software or general cleaning marketplaces.

### North Star

**Operationally successful Sofia turnover jobs per week.**

Registrations remain a funnel measure, not proof of marketplace value.

---

## 3. Fixed constraints and implementation contract

The following are not optional Stage 1 design choices:

- New accounts and cleaner profiles are persisted in the safest **pending**
  states before reconciliation.
- Email confirmation satisfies the owner-approved interim contact policy while
  phone is not required. With normal requirements enabled, reconciliation may
  automatically approve the account and activate cleaner marketplace access.
- `email_verified`, `phone_verified`, `contact_verified`,
  `marketplace_eligible`, and `fully_verified` are distinct. Full verification
  always requires both contact timestamps.
- An email-confirmed cleaner must never be represented as identity-, reference-,
  interview-, or trial-job-verified. Use “Email-confirmed marketplace profile”
  or “Marketplace access active.”
- A cleaner must be active, approved, and in the stored eligible cleaner state
  before marketplace work. Environment flags never authorize an endpoint.
- Approval/cleaner-requirement switches are delivery controls. A disabled
  requirement marks the user permanently excluded from genuine Stage 1
  evidence. Production-like use requires a signed, active, guarded rehearsal
  window and paused genuine intake.
- A cleaning job can have only one accepted cleaner assignment.
- Agency delegation cannot silently replace the first assigned member through
  the normal agency API.
- Reviews remain two-way, post-completion, and double-blind.
- Payments remain outside the platform.
- Trust, verification, safety, basic matching, assignments, completion, reviews,
  and calendar coordination remain free.
- The internal calendar is the scheduling source of truth.
- Datetimes are stored consistently and displayed for Europe/Sofia.
- The public home page is a marketing and lead-generation surface.
- Public users must not receive exact property, access, host, or job details.
- User-facing work must ship in Bulgarian and English.
- Domain transitions belong in service functions and must be auditable.
- Celery and email work must be idempotent and retryable.
- Stage 1 uses responsive web. PWA installability and native applications are
  deferred until the mobile workflow and repeat use are proven.

### Actors and owned surfaces

| Actor | Stage 1 surface | Allowed outcome |
|---|---|---|
| Anonymous visitor | Public landing, approximate demand, public cleaner profile, lead/waitlist | Understand the offer and begin a safe role-specific journey |
| Pending user | Role dashboard activation/status surface | Complete onboarding and understand what remains locked |
| Approved host | Host dashboard | Create properties/jobs, review eligible applicants, assign one cleaner, coordinate, cancel/reschedule through policy, and review |
| Approved marketplace-eligible cleaner | Cleaner dashboard | Manage availability, discover eligible work, apply/accept, coordinate, complete, report failure, and review |
| Controlled agency | Generic status surface for research-only agencies, or a minimum agency workspace for live participation, depending on Gate A | Never receive live work through the generic status surface |
| Platform admin/operator | Admin and support surfaces | Reconcile exceptional accounts, reject/suspend access, inspect history, support recovery, resolve disputes, and measure the pilot; manual supply vetting remains S1-D02 |
| Research participant | External consented research process | Provide evidence without being silently added to marketing or pilot cohorts |

### Required lifecycle transitions

| Domain | Required Stage 1 transitions |
|---|---|
| Account | pending → approved by contact reconciliation, or pending → rejected/suspended; approved → suspended |
| Cleaner marketplace eligibility | pending → stored eligible state by contact reconciliation; negative outcomes/restoration remain blocked by S1-D02 |
| Job | draft → open → assigned → completed; open/assigned → cancelled. A linked dispute may exist while work is assigned or after it is completed without replacing the job status |
| Application | pending → accepted, rejected, or withdrawn |
| Assignment | created → completed or cancelled; exactly one assignment belongs to one cleaning job |
| Replacement | a cancelled/failed job may create a new linked replacement job only after the R17 uniqueness decision below; the original job and assignment remain immutable history |
| Reschedule | proposed → accepted, declined, withdrawn, or expired |
| Dispute | open → reviewing → resolved or dismissed |
| Notification delivery | queued → sent or final-failed, with retry attempts and deduplication |

Disputes are orthogonal records, not replacement job statuses. Completed work
retains completed status. A linked Dispute records any later complaint so
post-completion reviews and completion metrics remain valid.

The exact database representation for linked replacement jobs, reschedules, and
disputes must be selected in an ADR before implementation. A replacement at the
same property/time conflicts with TGN rule R17 and the current database unique
constraint. The recommended resolution is a turnover lineage with immutable
cancelled/superseded job attempts and at most one actionable job for a
property/time slot. That is an owner-approved invariant change and requires
updates to BUSINESS.md, TGN.md, architecture.md, AGENTS.md, the constraint, and
their tests. Any proposal to allow multiple assignments for one job is a
separate higher-priority invariant change requiring the same approval; it is
not the recommended Stage 1 model.

### Interface and data implications

Stage 1 requires the following implementation-facing contracts:

- A public aggregate-demand response containing no private property or job
  identifier.
- Authenticated job-detail responses scoped by role, status, eligibility,
  ownership, and assignment.
- Admin-only account and verification transition services.
- An authoritative overlap check at every assignment-producing transition,
  using operator-confirmed availability during the concierge pilot.
- Explicit cancellation, reschedule, incident/dispute, and replacement actions
  rather than unrestricted job mutation.
- Privacy-reviewed lead capture that is distinct from CleaningJob—either a
  minimal dedicated record or a restricted external tracker—so anonymous
  interest cannot bypass host approval.
- Delivery/deduplication state for critical notifications and reminders.
- Privacy containment for any property, verification, dispute, and support
  media actually used in Stage 1. Suppress optional images/files rather than
  building a generalized private-media subsystem for future use.
- An approved geocoding/map boundary: either the browser calls an owned backend
  proxy through `apiFetch` and that proxy uses an approved processor, or exact
  third-party geocoding/maps are disabled.
- A restricted pilot ledger for operator effort and operational-success
  measures that do not belong in public product state.

No sensitive research, verification, address, access-code, or guest data may be
stored in source control.

---

## 4. Current baseline

### What already works

The core transaction is substantially implemented:

- Property and cleaning-job creation.
- Publishing open jobs.
- Cleaner applications and host acceptance.
- Direct offers.
- Single assignment.
- Cleaner completion.
- Two-way double-blind reviews.
- Favourites, connections, and in-app chat.
- Public cleaner profiles.
- In-app notification records.
- Manual ICS file parsing and draft-job creation.
- Admin account approval actions.
- Request IDs, JSON logs, audit records, and optional Sentry wiring.

Stage 1 should harden the real-world workflow rather than add another generic
dashboard.

### Launch blockers found in the current implementation

| ID | Blocker | Stage 1 disposition |
|---|---|---|
| S1-B01 | Resolved 2026-07-14: anonymous job/property disclosure was replaced by canonical city/zone aggregates | Retain recursive privacy tests and compatibility-alias sunset controls; see [privacy evidence](testing/release_blocking_privacy_fix.tdd.md) |
| S1-B02 | In progress: interim contact reconciliation, protected transitions, guarded shortcuts, evidence exclusion, honest UI, and PostgreSQL concurrency coverage are implemented; phone/manual vetting remains incomplete | Resolve the S1-D02 phone/manual cleaner/agency policy without claiming identity/quality review |
| S1-B03 | Resolved 2026-07-14: signup recovery now persists only a non-sensitive allowlist | Retain storage/telemetry regression tests; see [privacy evidence](testing/release_blocking_privacy_fix.tdd.md) |
| S1-B04 | Resolved 2026-07-15: concrete cleaners are protected at every implemented assignment-producing transition | Retain PostgreSQL concurrency coverage; see [S1-E04 evidence](testing/s1_e04_overlap_prevention.tdd.md) |
| S1-B05 | Assigned cancellation, rescheduling, no-show, dispute, and replacement recovery are not operational | Minimum history-preserving operator-supported workflows required |
| S1-B06 | Agency signup redirects to an unbuilt route | Hide/disable public agency signup or deliver a minimum workspace |
| S1-B07 | Delegated-agency completion notifications and review links target the agency instead of the assigned member | Must be corrected and tested |
| S1-B08 | Anonymous Connect and some other calls fail silently | Must end in a usable localized next step |
| S1-B09 | Resolved 2026-07-14 for property media: operational images are object-authorized and raw `/media/*` access is denied | Retain object-authorization/privacy tests; verification-media collection remains policy-gated |
| S1-B10 | Account deletion can remove or corrupt active operational history | Must be blocked or routed through support while active obligations exist |
| S1-B11 | Critical lifecycle notifications and reminder scheduling are incomplete | In-app and email reliability loop required |
| S1-B12 | No password-reset flow exists | Recovery flow required before public pilot |
| S1-B13 | Current deployment handoff uses raw-IP HTTP, insecure cookies, and a placeholder secret | Real domain, HTTPS, secure settings, backup/restore, and rollback required |
| S1-B14 | Product funnel evidence is not available from real usage | M1 research and a measured pilot are required |
| S1-B15 | Mobile, localization, and accessibility issues affect critical flows | Pilot-critical WCAG/mobile fixes and real-device verification required |
| S1-B16 | Resolved 2026-07-20: the ICS URL-import endpoint, server fetcher, URL UI, and telemetry references were removed | Retain the no-route/no-network regression coverage and manual-upload controls; see [S1-E09 evidence](testing/s1_e09_upload_security.tdd.md) |
| S1-B17 | The property location picker sends searches/exact coordinates directly from the browser to third-party OSM/Nominatim services | Approve and proxy a compliant provider with privacy controls, or disable third-party exact-location search/maps |
| S1-B18 | Resolved 2026-07-14: public cleaner/review responses use explicit safe projections and privacy tests | Retain publication, moderation/redaction, and object-level regression coverage |

Resolved rows remain in this baseline as historical launch-blocker evidence;
they must not be removed from regression coverage. “Partially resolved” does
not permit pilot launch until the linked work item meets all acceptance
criteria.

The local development database is seeded demonstration data. It must not be
reported as traction.

---

## 5. Ownership

Assign names before Stage 1 execution begins.

| Role | Accountable for |
|---|---|
| Stage 1 owner | Scope, priorities, decisions, and final sign-off |
| Engineering owner | Architecture decisions, implementation, tests, and release |
| Pilot operator | Approvals, verification, matching follow-up, support, and incident handling |
| Interview lead | Recruitment, consent, interviews, scoring, and synthesis |
| Backup operator | Coverage when the primary operator is unavailable |
| Privacy/legal reviewer | Pilot notices, terms, research consent, retention, and deletion policy |

One person may hold several roles, but every responsibility needs a named owner
and backup.

---

## 6. Stage 1 sequence

The work is arranged as gates, not as independent feature tickets.

1. **Gate A — Decisions and operating policy**
2. **Gate B — Launch-safety and workflow implementation**
3. **Gate C — Release, support, and operator rehearsal**
4. **Gate D — M1 research and supply preparation**
5. **Gate E — Free Sofia concierge pilot**
6. **Gate F — Evidence readout and owner decision**

M1 recruitment and interviews may begin as soon as Gate A research/privacy
decisions pass. They do not wait for engineering. Engineering and supply
discovery may run in parallel. Real pilot jobs must not begin before Gates A–C,
an M1 decision supporting the target segment/cluster, and supply activation all
pass. If M1 rejects the segment or cluster, Gate E is not run merely to complete
a checklist.

A practical target is eight to ten weeks if engineering and recruitment meet
their gates on schedule:

- Week 0: decisions, owners, and preparation.
- Weeks 1–2: launch blockers and M1 interviews in parallel.
- Week 3: production-like verification, supply activation, and release rehearsal.
- Weeks 3–5: frozen-cohort activation and live pilot, beginning only after all
  Gate E entry conditions above pass.
- Weeks 3–9: per-host 30-day repeat-use observation as hosts activate.
- Weeks 8–10: final evidence readout when the last qualifying host matures, then
  owner decision.

These are planning timeboxes, not engineering commitments. The final date is
controlled by cohort maturity, not a nominal week number: every host counted in
the repeat-use gate needs a full 30-day observation window after that host’s
first operationally successful job.

### Gate tracker

Update this table as the stage progresses. A gate is complete only when its
acceptance evidence is linked, not when work merely starts.

| Gate | Owner | Status | Target date | Evidence/readout |
|---|---|---|---|---|
| A — Decisions and policy |  | In progress |  | [S1-D04 disclosure tiers](#s1-d04--define-privacy-and-disclosure-tiers) |
| B — Product and workflow readiness |  | In progress |  | [S1-E02 policy](adr/0002-contact-based-verification.md); [S1-E02 maturity audit](testing/s1_e02_account_verification_maturity_audit.md); [Privacy remediation evidence](testing/release_blocking_privacy_fix.tdd.md); [S1-E04 evidence](testing/s1_e04_overlap_prevention.tdd.md); [S1-E09 evidence](testing/s1_e09_upload_security.tdd.md) |
| C — Release, support, and verification |  | Not started |  |  |
| D — M1 research and supply activation |  | Not started |  |  |
| E — Free Sofia pilot |  | Not started |  |  |
| F — Final decision |  | Not started |  |  |

### Work-item tracker and severity rules

Use this table for item-level control. Replace the accountable role with a
named person before that item starts, add a target date, and link evidence when
it is done. Allowed statuses are **Not started**, **In progress**, **Blocked**,
**Done**, and **Deferred by signed decision**.

| ID | Classification | Accountable role/name | Dependency | Status | Target | Evidence |
|---|---|---|---|---|---|---|
| S1-D01 | Must-have | Stage 1 owner | None | Not started |  |  |
| S1-D02 | Must-have | Stage 1 owner | S1-D01 | Not started |  |  |
| S1-D03 | Must-have | Repository owner | S1-D01 | Done | 2026-07-20 | [Approved lifecycle/support policy contract](S1_D03_LIFECYCLE_SUPPORT_POLICY.md) |
| S1-D04 | Must-have | Stage 1 owner | S1-D01 | Done | 2026-07-14 | [Recorded disclosure tiers](#s1-d04--define-privacy-and-disclosure-tiers) |
| S1-D05 | Must-have | Stage 1 owner | S1-D01 | Not started |  |  |
| S1-E01 | Must-have | Engineering owner | S1-D04 | Done | 2026-07-14 | [Privacy remediation evidence](testing/release_blocking_privacy_fix.tdd.md) |
| S1-E02 | Must-have | Engineering owner | ADR-0002; remaining S1-D02 items | In progress |  | [Owner policy](adr/0002-contact-based-verification.md); [maturity audit](testing/s1_e02_account_verification_maturity_audit.md); [TDD evidence](testing/s1_e02_account_verification.tdd.md) |
| S1-E03 | Must-have | Engineering owner | None | Done | 2026-07-14 | [Signup-secret TDD evidence](testing/release_blocking_privacy_fix.tdd.md) |
| S1-E04 | Must-have | Engineering owner | S1-D03 and scheduling ADR | Done | 2026-07-15 | [TDD and PostgreSQL evidence](testing/s1_e04_overlap_prevention.tdd.md) |
| S1-E05 | Must-have | Repository owner | S1-D03 and recovery ADR | Partially complete |  | [Accepted recovery ADR](adr/0001-turnover-lineage-recovery.md); [Batch 2 implementation evidence](testing/s1_e05_lifecycle_foundation.tdd.md); [Direct recovery workflow evidence](testing/s1_e05_recovery_workflows.tdd.md) |
| S1-E06 | Must-have; reminders may be operator-assisted | Engineering owner | S1-D03 | Not started |  |  |
| S1-E07 | Must-have | Engineering owner | S1-D05 | Not started |  |  |
| S1-E08 | Must-have | Engineering owner | S1-D03/D04 | Not started |  |  |
| S1-E09 | Must-have | Engineering owner | S1-D04 | Done | 2026-07-20 | [Calendar/upload security TDD evidence](testing/s1_e09_upload_security.tdd.md) |
| S1-E10 | Must-have | Engineering owner | S1-D04 and provider decision | In progress | 2026-07-22 | [Backend geocoding TDD evidence](testing/s1_e10_geocoding_backend.tdd.md) |
| S1-UX01 | Must-have | Engineering owner | S1-D04/D05 | Not started |  |  |
| S1-UX02 | Must-have | Engineering owner | S1-D02/D05 | Not started |  |  |
| S1-UX03 | Must-have | Engineering owner | Pilot-critical Gate B flows | Not started |  |  |
| S1-UX04 | Must-have | Engineering owner | Pilot-critical Gate B flows | Not started |  |  |
| S1-R01 | Must-have | Stage 1 owner | S1-D03/D04 | Not started |  |  |
| S1-R02 | Must-have | Pilot operator | S1-D03 | Not started |  |  |
| S1-R03 | Must-have | Engineering owner | Domain/TLS/hosting decisions | Not started |  |  |
| S1-R04 | Must-have | Engineering owner | S1-R03 | Not started |  |  |
| S1-R05 | Must-have | Engineering owner | S1-R03 | Not started |  |  |
| S1-Q01 | Must-have | Stage 1 owner | S1-D01 metric approval | Not started |  |  |
| S1-Q02 | Must-have | Engineering owner | Implemented backend scope | Not started |  |  |
| S1-Q03 | Must-have | Engineering owner | Implemented frontend scope | Not started |  |  |
| S1-Q04 | Must-have | Engineering owner | S1-Q02/Q03 and S1-R03–R05 | Not started |  |  |
| S1-M01 | Must-have for M1 | Interview lead | Gate A research/privacy decisions | Not started |  |  |
| S1-M02 | Must-have for M1 | Interview lead | S1-M01 | Not started |  |  |
| S1-M03 | Must-have for M1 | Interview lead | S1-M01/M02 | Not started |  |  |
| S1-M04 | Must-have for M1 | Interview lead | S1-M01 | Not started |  |  |
| S1-M05 | Must-have for M1 | Stage 1 owner | S1-M02–M04 | Not started |  |  |
| S1-O01 | Must-have before live jobs | Pilot operator | S1-D02 and selected cluster | Not started |  |  |
| S1-O02 | Must-have only if an agency enters the pilot; otherwise deferred | Pilot operator | S1-D05 | Not started |  |  |
| S1-O03 | Must-have before live jobs | Pilot operator | S1-O01/O02 as applicable | Not started |  |  |
| S1-P01 | Operator-assisted; required if Gate E runs | Pilot operator | Gates A–C, M1 supports the segment/cluster, supply activation | Not started |  |  |
| S1-P02 | Operator-assisted; required if Gate E runs | Pilot operator | S1-P01 | Not started |  |  |
| S1-P03 | Operator-assisted; required if Gate E runs | Pilot operator | S1-P01/P02 | Not started |  |  |
| S1-P04 | Operator-assisted; required if Gate E runs | Pilot operator | S1-P01 | Not started |  |  |
| S1-P05 | Operator-assisted; required if Gate E runs | Pilot operator | Completed pilot jobs | Not started |  |  |
| S1-F01 | Must-have to complete Stage 1 | Stage 1 owner | Applicable gate evidence | Not started |  |  |

Severity means:

- **P0:** credible safety, privacy, security, authorization, data-loss, or
  marketplace-integrity risk, or a pilot-critical flow is inaccessible. No live
  pilot job may begin with an unresolved P0.
- **P1:** a major failure in a core, recovery, reliability, localization,
  mobile, or accessibility flow. It must be fixed before the pilot unless the
  owner signs a bounded, user-safe workaround with an owner and expiry date.

Lower-severity defects may be scheduled after Stage 1 when they do not distort
the evidence, create unsafe manual work, or block a participant.

---

## 7. Gate A — Required decisions and operating policy

### S1-D01 — Confirm the Stage 1 charter

- [ ] Name the Stage 1 owner and all delivery roles.
- [ ] Accept or revise the M0 monetization-priority order: liquidity,
      trust/retention, learning speed, operational simplicity, business-plan
      readiness, then early recurring revenue.
- [ ] Sign off that the M0 free-core boundary remains free through validation
      and that M0–M5 will not select a payment provider, commission rate, final
      subscription price, or billing implementation.
- [ ] Confirm Sofia as the only launch cluster.
- [ ] Confirm portfolio hosts as primary.
- [ ] Confirm agencies as a research segment, not automatically a public launch
      role.
- [ ] Identify the current user/lead list and permitted read-only source, or
      record that no usable list exists.
- [ ] Accept the M1 competitor categories: direct turnover workflow, adjacent
      operations SaaS, home-services marketplace, travel marketplace, and
      payment providers as context only.
- [ ] Approve the M1 timebox, budget, incentives, and evidence-labeling standard
      from the M0/M1 documents.
- [ ] Treat `action_plan.docx` as background unless individual assumptions are
      explicitly approved.
- [ ] Acknowledge that the signup-approval mismatch prevents approval-funnel
      metrics from being treated as valid evidence until S1-E02 ships, while
      consented interviews may still proceed.
- [ ] Name the privacy/legal reviewer, or record that paid experiments remain
      deferred until qualified reviewers are identified.
- [ ] Confirm the platform remains free during this stage.
- [ ] Confirm cleaning payment remains outside the platform between the
      contracting parties: host and cleaner or agency.
- [ ] Approve the metric definitions and decision thresholds in this plan before
      the first live job.
- [ ] Approve completed/operationally successful jobs as the Stage 1 North Star
      and update BUSINESS.md, which currently documents registrations as the
      primary MVP signal.

**Done when:** The decision register below has an owner, date, and final value
for every blocking decision and every M1 entry criterion in the
[M0 brief](monetization/M0_MONETIZATION_CONSTRAINTS_BRIEF.md) is signed or has a
linked owner decision. Only then may M1 recruitment begin.

### S1-D02 — Define cleaner and agency verification

The exact verification standard is currently an open business decision.

ADR-0002 resolves only the interim contact-access policy: confirmed email may
activate marketplace access while phone is not required, without claiming any
identity or quality evidence. The checklist below remains open and continues to
block broader cleaner and agency vetting, negative outcomes, restoration,
re-review, and retention.

- [ ] Choose the cleaner evidence required: identity review, interview,
      references, trial job, or a documented combination.
- [ ] Decide whether identity documents are copied or only checked. The
      recommended Stage 1 default is to record the check outcome, not retain an
      unnecessary copy.
- [ ] Define verification result states and neutral rejection reasons.
- [ ] Define who can verify, suspend, restore, and reject.
- [ ] Define re-review triggers and dates.
- [ ] Define verification data access, storage, retention, and deletion.
- [ ] Define an agency verification checklist if controlled agencies enter the
      pilot.
- [ ] Require every delegated agency member to be separately active, approved,
      and verified.

**Done when:** A reviewer can apply the same written checklist to two applicants
and reach a traceable decision without inventing criteria.

### S1-D03 — Define lifecycle and support policy

- [x] Decide who may cancel an open or assigned job.
- [x] Define cancellation reason categories and notice bands.
- [x] Decide how an assigned cleaner requests release from a job.
- [x] Define the rescheduling proposal/acceptance rule.
- [x] Define no-show grace periods.
- [x] Define dispute categories, visibility, filing window, and admin outcomes.
- [x] Define when a cancelled/failed job may produce a linked replacement; do
      not “reopen” or overwrite the original job.
- [x] Resolve TGN R17 and the exact property/time unique constraint for linked
      replacement jobs, including the `assigned → cancelled` transition and a
      guarantee that only one job in the turnover lineage is actionable.
- [x] Require the host to create/accept a replacement or give explicit,
      time-bounded, auditable pre-authorization for the operator to create it.
- [x] Define who may approve an emergency replacement.
- [x] Define the agency member-replacement support path without weakening normal
      immutable delegation.
- [x] Define support hours, response expectations, and emergency limitations.
- [x] Define account-deletion handling when future or historical obligations
      exist.
- [ ] Approve the pilot incident-severity matrix and name its adjudicator.
- [ ] Approve the operational-success evidence rule and allowed completion-window
      tolerance.
- [ ] Approve the activation-window length.
- [ ] Approve match-mode precedence and the organic-liquidity claim threshold.
- [ ] Approve the operator-time accounting formula.
- [ ] Decide how a host cancellation after supply exposure remains in the
      measurement denominator.

**Done when:** The state-transition contract can be implemented and tested
without product decisions being made inside views or components.

### S1-D04 — Define privacy and disclosure tiers

**Decision recorded 2026-07-14:** Stage 1 uses canonical city/district
aggregation for anonymous demand and the audience-specific allowlists below.
Exact schedule, proposed price, bedrooms, and square metres are approved only
for active marketplace-eligible evaluators. They are not public
fields.

| Audience | Allowed job/location detail |
|---|---|
| Anonymous | Canonical city/district names and aggregate open-job counts only; no per-job marker, coordinate, centroid, date, price, scope, property, host, or media field |
| Pending, rejected, suspended, or unverified user | No private open-job detail |
| Marketplace-eligible cleaner or eligible agency | Job ID required to apply; canonical city/district; exact start/end; currency and proposed price; bedrooms and square metres; status and `can_apply`. No property ID/name/address/raw neighborhood/coordinates/media, host identity/contact, free text, instructions, agreed price, assignment, or batch data |
| Active non-cancelled assigned cleaner, agency, or immutable assigned member | Evaluator fields plus the minimum property name/address, instructions, agreed price, workflow IDs, non-contact host display information, and one object-authorized primary property image required to perform the job. A blank display name falls back to `Host`, never the login username/email. Latitude and longitude remain excluded |
| Completed or otherwise retained worker history | Evaluator fields plus the same non-contact host display, agreed price, and assignment history. Property name/address, image, instructions, coordinates, and other operational property details are removed |
| Owning host and platform admin | Full authorized operational record |

- [x] Public demand uses canonical district-level counts without job-derived
      coordinates or centroids. Jobs without a canonical district contribute
      only to a canonical city total.
- [x] The minimum evaluator fields are the explicit allowlist above.
- [x] Approved public cleaner profile media remains a public API/data value and
      is not raw `PropertyImage` storage. Operational property media and
      verification media are private and require object-level authorization;
      every raw `/media/*` route is denied.
- [ ] Define the informed cleaner choice and exact field allowlist for public
      profile publication, and the public display/redaction rules for reviewer
      identity, job references, and free-text comments.
- [x] Exact address and operational instructions become visible only after an
      active, non-cancelled assignment to the authorized participant.
- [ ] Approve the map/geocoding provider or proxy, processor/privacy terms,
      retention/logging, attribution/usage limits, and fallback when consent or
      service is unavailable. If none is approved, disable exact third-party
      maps/geocoding for Stage 1.
- [ ] Define a retention policy for job, support, verification, review, and
      research data.

**Done when:** Every relevant serializer and media route has an explicit
field/access allowlist for each audience.

### S1-D05 — Resolve agency participation and routing

Choose exactly one live-participation model:

- **Recommended — research only:** Disable public agency registration for Stage
  1, hide it in signup, reject it server-side, and route existing agency
  accounts to the generic status workspace. Prevent agency applications,
  offers, assignments, and member delegation in live pilot data.
- **Alternative — controlled live agency:** Public registration may remain
  disabled, but the minimum agency workspace becomes mandatory before the first
  agency job: membership/invitations, accepted jobs, assignments, immutable
  eligible-member delegation, notifications, role guards, and end-to-end tests.

Agency interviews and manual agency recruitment can continue while public signup
is disabled. A generic status page is never sufficient for an agency to handle
a live assignment.

**Done when:** No user role reaches a missing or misleading route, and no agency
can receive live work unless the controlled-live option and its workspace have
passed Gate B/C verification.

### Blocking decision register

| Decision | Recommended default | Owner | Final decision | Date |
|---|---|---|---|---|
| Monetization priority order | Liquidity → trust/retention → learning → simplicity → plan readiness → recurring revenue |  |  |  |
| Free-core/payment boundary | Preserve M0 free core through M0–M5; no provider, commission, final price, or billing build |  |  |  |
| Current user/lead data | Name a permitted read-only source or record none |  |  |  |
| M1 competitor categories | Accept the five M0 categories; payment providers are context only |  |  |  |
| M1 budget/timebox/incentives | Two-week research timebox; owner supplies budget and incentive ceiling |  |  |  |
| Evidence labeling | Use the M0 verified fact/internal planning input/estimate/assumption/hypothesis/recommendation/review/final decision labels |  |  |  |
| `action_plan.docx` status | Background only unless an assumption is separately approved |  |  |  |
| Qualified review | Name privacy/legal reviewer; defer paid experiments if unavailable |  |  |  |
| Public demand presentation | District aggregates; no exact pins |  |  |  |
| Public cleaner/review publication | Minimal consented profile allowlist; non-identifying review references; moderated/redactable public text |  |  |  |
| Map/geocoder boundary | Approved backend-proxied provider or disable exact third-party location features |  |  |  |
| Cleaner verification evidence | Identity check + behavior interview + reference or trial |  |  |  |
| Verification document copies | Do not retain unless qualified review requires it |  |  |  |
| Stage 1 agency participation | Research only; disable public signup and every live agency assignment route |  |  |  |
| Reminder timing | Approximately T−24h and T−2h for tight turnovers |  |  |  |
| Pilot incentives | Pay only for participant time, never positive answers |  |  |  |
| Research recording | Separate opt-in from notes, quotes, and follow-up |  |  |  |
| Support channel and hours | One monitored channel with published limitations |  |  |  |
| Pilot district cluster | Select from M1 demand/supply evidence |  |  |  |
| Standard-turnover notice threshold | First supply exposure at least 48 hours before required start; shorter turnovers form a separate urgent cohort |  |  |  |
| Incident severity/adjudication | Versioned severity matrix; named operator plus escalation owner |  |  |  |
| Operational-success evidence | Affirmative host outcome or pre-approved auditable evidence; agree schedule tolerance before launch |  |  |  |
| Cohort activation window | 14 days recommended |  |  |  |
| Match-mode precedence | Any targeted host/operator outreach before response makes that response non-organic |  |  |  |
| Organic-liquidity threshold | Approve before launch; 40% of evaluable standard turnover lineages receiving an organic qualified application within 24h is the recommended starting gate |  |  |  |
| Operator-time formula | Total recurring minutes across every evaluable standard turnover lineage / operationally successful lineages; 15-minute maximum recommended |  |  |  |
| Host cancellation after exposure | Retain as an exposed attempt and classify outcome/reason; never silently exclude |  |  |  |
| Replacement/R17 model | Owner-approved turnover lineage; immutable cancelled attempts; only one actionable same-slot job; host acceptance/pre-authorization |  |  |  |
| Stage 1 thresholds | Approve Section 15 before first job |  |  |  |
| Stage 1 North Star | Operationally successful Sofia jobs per week; registrations are a funnel metric |  |  |  |

---

## 8. Gate B, part 1 — Launch-safety and workflow implementation

### S1-E01 — Minimize public marketplace data and remove property/job leakage

Required work:

- [x] Replace the public map response with city/district-level demand.
- [x] Define one shared eligibility predicate for public demand and
      cleaner-visible open work: future, open, non-stale jobs owned by active,
      approved hosts.
- [x] Remove public job IDs, property IDs, property name, address, photo, exact
      coordinates, exact schedule, exact price, host identity, access
      instructions, and cleaning instructions.
- [x] Do not rely on random coordinate jitter for sparse locations; aggregation
      is safer.
- [x] Keep exact/open job detail behind role, status, verification, ownership,
      and assignment checks.
- [x] Restrict approved-but-unverified cleaners from full private job data.
- [x] Scope the calendar conflict API to authorized owners/participants.
- [x] Remove property media from public responses. For Stage 1, either serve
      pilot property media through authorization or disable it; do not build a
      generalized private-media subsystem merely for future use.
- [x] Define explicit allowlists for public cleaner profiles and rating/review
      responses. Exclude unnecessary personal attributes, internal/user/job
      identifiers, private contact details, verification evidence, and precise
      availability/location data.
- [x] Give cleaners an informed publication choice and explain exactly which
      approved profile fields become public and how publication can be paused.
- [x] Use a non-identifying reviewer label where public identity is unnecessary.
      Moderate, report, and redact public free-text reviews that contain an
      address, access instruction, guest data, contact details, harassment, or
      other unsafe content without altering the underlying audit record.
- [x] Do not collect verification/dispute files unless the approved policy
      requires them and authorized private storage exists.
- [x] Refactor the public map into an approximate demand visualization plus a
      non-map list/CTA alternative.
- [x] Update BG/EN copy to state that public demand is approximate.

Acceptance criteria:

- Anonymous responses contain no direct property/job identifiers, exact
  location, identifying property media, exact time, price, host data, or access
  information.
- Public profile/review responses contain only approved publication fields, no
  job ID or unnecessary reviewer identity, and no known unredacted operational
  secret or personal data in displayed text.
- Guests and ineligible users cannot retrieve private job details by guessing an
  API ID, property ID, or media URL.
- Eligible and assigned actors receive only the detail appropriate to their
  stage.
- Tests cover public cleaner/review allowlists plus guest, pending,
  approved-unverified, approved-verified, owner, unrelated host, assigned
  cleaner, controlled agency, and admin access.

### S1-E02 — Implement contact-based verification completion

**Status: In progress.** The owner-approved policy is recorded in
[ADR-0002](adr/0002-contact-based-verification.md), and the required pre-code
[maturity audit](testing/s1_e02_account_verification_maturity_audit.md) is
complete. The owner-approved interim contact capability is implemented and may
be enabled or stopped through its guarded configuration contract. Phone OTP,
manual cleaner evidence, negative cleaner outcomes, re-review, retention, and
agency verification remain incomplete, so the epic is not Done.

#### Policy and configuration contract

- Signup persists pending account/profile state first, then one atomic service
  reconciles from stored timestamps.
- Confirmed email satisfies interim contact verification while
  `PHONE_VERIFICATION_REQUIRED=False`. With normal requirements enabled, this
  automatically approves the account and activates cleaner marketplace access.
- Email-only confirmation is not identity, reference, interview, or trial-job
  verification. `fully_verified` means both email and phone timestamps exist.
- Normal enabled-requirement users are genuine Stage 1 evidence. Any disabled
  account/cleaner requirement creates a permanent restricted evidence exclusion.

| Variable | Safe default | Meaning |
|---|---:|---|
| `ACCOUNT_APPROVAL_REQUIRED` | `True` | Approval must be earned through contact reconciliation; false is a testing/rehearsal shortcut. |
| `CLEANER_VERIFICATION_REQUIRED` | `True` | Cleaner eligibility must be earned through contact reconciliation; false is a testing/rehearsal shortcut. |
| `ALLOW_PILOT_VERIFICATION_BYPASS` | `False` | Second guard for a production-like shortcut. Invalid when unused. |
| `PHONE_VERIFICATION_REQUIRED` | `False` | False applies the email-only interim policy; true waits for both contact timestamps. |

A production-like shortcut (`staging`, `pilot`, `prod`, `production`) also
requires non-empty owner/reason metadata, timezone-aware active start/end,
`PILOT_GENUINE_JOB_INTAKE_PAUSED=True`, startup and signup-time validation, and
a non-sensitive operator warning. Flags never authorize marketplace endpoints
and never retroactively rewrite existing users.

The complete configuration truth table and rollback semantics are normative in
ADR-0002.

Required work:

- [x] Record the owner decision and reconcile the Stage 1 source documents.
- [x] Complete and link the line-referenced implementation maturity audit.
- [x] Add the four primary settings and guarded bypass metadata validation.
- [x] Add pending-first atomic, row-locked, idempotent initialization and
      reconciliation.
- [x] Add restricted evidence exclusion and notification deduplication data.
- [x] Replace `/approve/` with honest admin reconciliation; centralize reject
      and suspend transitions with expected-state conflict handling.
- [x] Protect account/cleaner transition fields from generic PATCH and Django
      admin editing; add restricted review history.
- [x] Harden only the confirmed authorization gaps in connections/messages,
      private cleaner profiles, favourite creation, agency invitations and
      delegation.
- [x] Extend admin and user status UI with separate email, phone, contact,
      account, cleaner-marketplace, and full-verification states and BG/EN copy.
- [x] Add configuration, transition, authorization, frontend, rollback, and
      PostgreSQL concurrency evidence.
- [x] Document deploy configuration and operator rollback.

Acceptance criteria:

- The eight-row ADR truth table passes with a confirmed email and no phone;
  `fully_verified` remains false in all rows.
- Production-like unsafe or unused bypass configurations fail fast, and an
  expired runtime window returns stable 503 without creating a user.
- Normal email-only signup is automatically reconciled and remains genuine
  evidence; explicit shortcuts are auditable and excluded.
- Reconciliation never restores rejected/suspended records, repeated calls are
  safe, and audit/notification effects occur once per effective transition.
- Persisted eligibility—not environment flags—protects publication,
  connections, messages, favourites, applications, offers, assignments,
  invitations, delegation, property/job creation, and current calendar data.
- Admin/user BG/EN UI states are honest and never expose internal notes or
  bypass metadata.
- Phone OTP, manual evidence vetting, negative cleaner outcomes/restoration,
  re-review, retention, and agency verification remain explicitly blocked by
  S1-D02, so S1-E02 stays **In progress**.

### S1-E03 — Remove sensitive signup persistence

- [x] Never write password, password confirmation, email code, verification
      token, identity evidence, or access information to sessionStorage or
      localStorage.
- [x] Preserve only non-sensitive draft fields needed for refresh recovery.
- [x] Clear draft state after successful signup, explicit cancellation, and
      expiry.
- [x] Mask sensitive fields from logs, Sentry, analytics, and request-error
      reporting.
- [x] Verify browser history and page source do not expose secrets.

Acceptance criteria:

- A browser storage inspection during every signup step contains no password or
  verification secret.
- Refresh recovery still works for approved non-sensitive fields.

### S1-E04 — Prevent overlapping cleaner assignments

Required work:

Availability follow-up (kept separate from hard assignment-overlap
enforcement):

- [ ] Resolve the documented drift between required work preferences/preferred
      time slots and the migration that removed cleaner availability.
- [ ] Use operator-confirmed current availability for the concierge cohort.
- [ ] Restore the minimum documented work-preference/preferred-slot fields or
      obtain owner approval to update the higher-priority domain documentation.
      A full recurring-availability calendar and blockout UI are not a Stage 1
      requirement.

Implemented hard-overlap contract:

- [x] Use half-open overlap logic: existing start < candidate end and existing
      end > candidate start.
- [x] Re-check overlap authoritatively when:
  - accepting a cleaner application;
  - accepting a direct offer;
  - delegating an agency assignment to a concrete member.
- [x] Advisory checks may run earlier, but acceptance/delegation remains
      authoritative because schedules can change.
- [x] Serialize concurrent assignment attempts for the same concrete cleaner in
      one transaction using a PostgreSQL row lock.
- [x] Return a structured, non-sensitive `cleaner_schedule_conflict` response.
- [x] Review indexes needed for worker/time-range queries. Existing foreign-key
      indexes on `cleaner_id` and `assigned_member_id` are sufficient for the
      current selective worker-first query; no migration is justified without
      PostgreSQL query-plan evidence.
- [x] Test Europe/Sofia and UTC handling, including a daylight-saving boundary.

Assigned-job rescheduling and emergency-replacement acceptance services do not
exist yet. When introduced under their own workflow work, they must lock the
concrete cleaner and call the same authoritative overlap check in the
transaction that changes the schedule or produces the replacement assignment.
Their absence is not an unfinished S1-E04 implementation.

Acceptance criteria:

- A cleaner or delegated member cannot hold overlapping active assignments at
  different properties.
- Simultaneous acceptances cannot both succeed.
- Stale applications and offers are revalidated.
- Cancellation frees the occupied time.
- Back-to-back jobs where one ends exactly when another begins remain allowed.

### S1-E05 — Add history-preserving failure and recovery workflows

Write an ADR before implementation to choose the linked-job recovery and
scheduling model and resolve TGN R17. Preserve the invariant of exactly one
accepted cleaner assignment per cleaning job. Under the recommended model, a
replacement creates a new CleaningJob in the same turnover lineage, linked to
the cancelled/failed job; it does not add a second assignment or overwrite the
original cleaner/member. The constraint must ensure at most one actionable job
in that lineage/property/time slot.

Minimum Stage 1 capabilities. Batch 2 completed the checked foundation items;
the epic remains partially complete and cannot be Done while agency parity is
deferred:

- [x] Cancel draft/open work without silently losing published history.
- [x] Cancel assigned work with actor, timestamp, reason, and notifications.
- [x] Propose and accept/decline assigned-job rescheduling with conflict
      revalidation.
- [x] Record a no-show/failed attendance incident without falsely completing or
      deleting the job.
- [x] Open, review, resolve, and dismiss a private admin-visible dispute.
- [x] Request a linked replacement through an explicit host/support workflow;
      never reopen or mutate the original into a new attempt.
- [x] Require host creation/acceptance or documented, time-bounded host
      pre-authorization before an operator creates a replacement. The operator
      never impersonates the host.
- [x] Preserve the original job and its single assignment; link any replacement
      job back to that failed/cancelled record.
- [ ] Preserve agency delegation immutability; support replacement creates a new
      historical event rather than overwriting the delegated member.
- [x] Prevent agency-assigned work from completing before an eligible member is
      delegated.
- [ ] Correct delegated-agency completion notifications and review links so they
      target the actual assigned member. Review authorization already treats the
      host and member as the review parties.
- [x] Make account deletion refuse or defer while active jobs, assignments,
      disputes, or required history exist.
- [x] Make the linked job/audit chronology inspectable through the hardened
      Django admin or a minimal operator surface; a bespoke chronology UI is
      deferred.

Batch 2 already preserves existing agency delegation, blocks active jobs and
assignments, and routes all current protected marketplace history to support.
The two broader unchecked rows close only after replacement/dispute records are
implemented and included in those guards.

These capabilities must exist as authorized service/API actions with a safe,
audited operator route. Participant-facing request/acknowledgement UI is needed
only where the flow cannot be operated safely without it; complete self-service
reschedule, dispute, and recovery workspaces are deferred.

Acceptance criteria:

- Every transition has an authorized actor, reason, timestamp, audit record, and
  correct recipients.
- Illegal transitions fail atomically.
- Ordinary PATCH cannot unilaterally move an assigned cleaning.
- Replacement preserves the original job, assignment/member, and cancellation
  reason while creating one host-authorized linked job with its own single
  assignment, after the approved R17/constraint change prevents two actionable
  same-slot jobs.
- Completion and double-blind review invariants remain intact.
- An operator can reconstruct the complete history of a failed and recovered
  job.

Stage 1 requires a reliable operator-supported replacement path. Automated
city-wide emergency broadcasting can wait until the pilot proves the need.

### S1-E06 — Complete the reliability notification loop

Stage 1 channels are in-app plus email. SMS, Viber, WhatsApp, and native push
remain research questions.

- [ ] Define an event → recipient → channel matrix.
- [ ] Cover account and verification outcomes.
- [ ] Cover new eligible work or operator matching invitations.
- [ ] Cover application/direct-offer acceptance, rejection, and withdrawal.
- [ ] Cover assignment and agency delegation.
- [ ] Cover cancellation, rescheduling, no-show, dispute status, and
      replacement.
- [ ] Cover operator-recorded upcoming-work reminders. Automated scheduling is
      optional during the concierge pilot.
- [ ] Cover completion and review prompts.
- [ ] Add a stable deduplication key and delivery status/attempt record.
- [ ] Dispatch only after the domain transaction commits.
- [ ] If reminders are automated, add an explicit scheduler and monitor it.
- [ ] Make tasks retryable without duplicate messages.
- [ ] Localize by recipient preference.
- [ ] Keep exact address, access code, and sensitive dispute text out of email
      subjects and lock-screen-style bodies.
- [ ] Alert the operator after final delivery failure.

Acceptance criteria:

- Replaying a task does not duplicate the notification.
- Delivery failure never rolls back a successful marketplace transition.
- Repeated automated reminder scans, if enabled, do not send duplicates.
- Worker health—and scheduler health if deployed—is visible to the operator.

### S1-E07 — Repair conversion and role routing

- [ ] Logged-out Connect leads to localized login/signup and preserves a safe
      relative return target.
- [ ] Validate return targets to prevent open redirects.
- [ ] Pending, rejected, suspended, and wrong-role users see an explanation,
      not a silent failure.
- [ ] Do not call protected APIs only to decide the appearance of a guest CTA.
- [ ] Apply the selected agency decision in frontend and backend.
- [ ] Hide unimplemented OAuth controls.
- [ ] Ensure every visible CTA, header link, notification deep link, and
      post-login redirect has a usable destination.

Acceptance criteria:

- No visible action silently fails with 401/403.
- No role reaches a 404 after signup, login, header navigation, or notification
  click.
- Guest, status, and role behaviors are covered by component and API tests in
  both locales.

### S1-E08 — Add account recovery and safe account deletion

- [ ] Add localized Forgot password and reset-password screens.
- [ ] Use an expiring, one-use reset token.
- [ ] Rate-limit reset requests and avoid account enumeration.
- [ ] Notify users of a completed password reset.
- [ ] Provide a tested operator fallback.
- [ ] Prevent self-service deletion while future/active assignments, unresolved
      disputes, or required support history exist.
- [ ] Route blocked deletion through an explicit cancellation/support workflow.
- [ ] Apply the approved retention/anonymization policy to historical records.

Acceptance criteria:

- A user can recover an account without operator database access.
- Password-reset responses do not reveal whether an email exists.
- Account deletion cannot silently remove another participant’s live
  marketplace record.

### S1-E09 — Secure or disable calendar URL import and file uploads

The safest Stage 1 default is to keep manual ICS file import and disable
server-side URL fetching. That decision was implemented on 2026-07-20. The URL
fetch hardening checklist remains intentionally unchecked and not applicable
while URL import is absent; all items would become mandatory before any future
reintroduction.

- [x] Remove the calendar URL endpoint, fetcher, frontend mode, API call, dead
      state/styles/translations, and telemetry references; keep calendar sync
      placeholders network-inert.

Do not enable URL import until all of the following are implemented and tested:

- [ ] Permit only `http` and `https`; reject credentials, fragments, malformed
      hosts, and unsupported schemes.
- [ ] Resolve and validate every destination address. Block loopback, private,
      link-local, multicast, reserved, cloud-metadata, and otherwise non-public
      IPv4/IPv6 ranges.
- [ ] Re-resolve and revalidate every redirect destination; cap redirect count.
- [ ] Use strict connect/read timeouts and a small maximum response size.
- [ ] Validate expected content type and successfully parse calendar content
      before persisting anything.
- [ ] Return generic errors; do not expose network, DNS, filesystem, or parser
      exception detail.
- [ ] Rate-limit and audit URL import attempts without logging sensitive URLs or
      calendar contents.

Enabled upload controls:

- [x] Rate-limit and audit enabled manual import attempts without logging
      filenames, calendar content, UIDs, summaries, parser errors, or URLs.
- [x] Apply explicit byte-size, filename, extension, media-type, and content
      validation to direct ICS uploads.
- [x] For every Stage 1 image upload, decode and safely re-encode/resample it,
      enforce size/dimension/pixel/frame limits, and serve it only at its
      approved privacy tier.
- [x] Do not accept verification, dispute, or incident evidence files until an
      approved need, retention rule, malware-safe validation path, and
      authorized storage route exist.

Acceptance criteria:

- Future URL-import target/redirect/timeout tests are not applicable while the
  endpoint and fetcher are absent. They become mandatory if URL import is ever
  reintroduced.
- [x] Tests reject malformed calendars, misleading content types, oversized or
  malformed uploads, unsafe image formats/content, and unauthorized access.
- [x] Because URL import remains disabled, no API or UI path can invoke
  server-side URL fetching and the UI explains that users must download and
  upload an ICS file instead. See
  [S1-E09 evidence](testing/s1_e09_upload_security.tdd.md).

### S1-E10 — Govern maps, geocoding, and exact-location disclosure

**Implementation contract:** [S1-E10 map and geocoding capability](S1_E10_MAP_GEOCODING_CAPABILITY.md)
records the owner direction to retain third-party capability behind the owned
privacy boundary. Geoapify is configured as the server-side candidate; its
privacy/terms approval remains required before production enablement.

Choose an approved map/geocoding architecture before the public pilot:

- [x] Remove direct browser `fetch` calls to OSM/Nominatim or any other
      geocoder. Private-picker frontend calls use `apiFetch`; district and
      public-demand maps use owned canonical GeoJSON rather than remote tiles.
- [x] Route approved-host address search and reverse geocoding through owned,
      authenticated, private/no-store backend endpoints. The frontend picker
      migration remains to be completed.
- [ ] Review the provider’s processing terms, data location, retention/logging,
      usage limits, attribution, caching, credentials, and production-service
      suitability; document the provider as a processor/recipient where
      required.
- [x] Minimize the query sent upstream, authenticate/rate-limit the owned proxy,
      and prevent raw address/search/coordinate values from entering ordinary
      application logs, analytics, Sentry, or cache keys visible to users.
- [x] Ensure map tile requests cannot disclose an exact private property
      location to an unapproved third party. The private property picker and
      district selector use no remote tile source; private lookup uses the
      owned API only.
- [ ] Keep the public demand map aggregated and technically separate from the
      private property-location workflow.
- [ ] Provide BG/EN notice and a usable non-map fallback.

Acceptance criteria:

- A browser network trace through property creation and public demand shows no
  direct request containing an exact property address/coordinate to an
  unapproved third party and no direct `fetch` outside the shared API boundary.
- Tests cover provider failure, throttling, invalid input, authorization,
  logging redaction, and the no-provider fallback.

---

## 9. Gate B, part 2 — Landing, onboarding, mobile, and accessibility

### S1-UX01 — Build a safe conversion-complete landing page

Required content:

- [ ] Sofia-specific host value proposition.
- [ ] Primary host action: **Request a cleaner**.
- [ ] Primary supply action: **Apply to become verified**.
- [ ] A short How it works section.
- [ ] A factual verification explanation.
- [ ] Honest current coverage and no guaranteed-coverage claim.
- [ ] Waitlist/lead capture when a district has no supply.
- [ ] Approximate demand visualization plus a text/list alternative.
- [ ] Support/contact, privacy, terms, and cookie-preference links.
- [ ] Real proof only; seeded profiles or jobs must never be presented as live
      traction.

The unauthenticated host request must be minimal lead capture, never a
published CleaningJob. Use either a dedicated privacy-reviewed lead record or a
restricted external tracker; a new product subsystem is optional for Stage 1.
The capture route must not bypass account approval or host job-posting
permissions.

Recommended minimum lead fields:

- Role/intention.
- Sofia district.
- Property-count band.
- Next-checkout window.
- Contact details.
- Consent/privacy acknowledgement.
- Source/referral field.

Do not collect exact address, guest data, or access codes in the public lead
form.

Acceptance criteria:

- A first-time host or cleaner understands the offer and correct next action
  without opening the directory or map.
- The public page renders immediately while authentication status resolves.
- A zero-supply state produces a useful waitlist/support action.
- Every public form has clear success, error, and privacy states.

### S1-UX02 — Make onboarding and activation honest

- [ ] Rename the first signup action so it does not imply the account already
      exists when it only sends an email code.
- [ ] Show the whole journey, including email confirmation, role profile,
      account creation, approval, and cleaner verification.
- [ ] Keep host onboarding short.
- [ ] Give cleaners an activation checklist:
  - email confirmed;
  - required profile complete;
  - service area and availability complete;
  - account approval state;
  - verification state;
  - expected review timing;
  - support route;
  - marketplace actions that remain locked.
- [ ] Explain rejection and suspension status without exposing unsafe internal
      notes.
- [ ] Preserve required signup fields end to end across models, migrations,
      serializers, profile/admin exposure, frontend payload, and tests.
- [ ] Measure step drop-off before deciding on a larger account-first/profile-
      later redesign.

Acceptance criteria:

- Representative host and cleaner users complete signup on a phone without
  operator coaching.
- Pending users know what happens next.
- Refresh preserves non-sensitive progress and API errors preserve entered
  non-sensitive data.

### S1-UX03 — Mobile-responsive pilot workflow

Test 320, 360, 390, and 430 CSS-pixel widths on Android Chrome and iOS Safari.

- [ ] Fix OTP input overflow.
- [ ] Replace desktop-only or excessively long district dual-list behavior on
      phones with searchable checkboxes/chips or another compact interaction.
- [ ] Use a compact mobile navigation pattern for host and cleaner dashboards.
- [ ] Ensure the Today/upcoming/urgent action is visually primary.
- [ ] Ensure no horizontal overflow, clipped modal, hover-only action, or field
      hidden by the software keyboard.
- [ ] Verify reduced-motion behavior.

Acceptance criteria:

- Signup and the complete host → job → cleaner → assignment → completion path
  work on the supported phone widths and both target mobile browsers.

### S1-UX04 — WCAG 2.2 AA pilot gate

- [ ] Normal text contrast is at least 4.5:1.
- [ ] UI components and focus indicators reach at least 3:1.
- [ ] Correct the document language for BG and EN pages.
- [ ] Remove hardcoded English from critical role labels, notifications, and
      email templates.
- [ ] Give critical dialogs initial focus, containment, Escape behavior where
      safe, background inertness, and trigger-focus restoration.
- [ ] Associate field errors with their inputs and announce submission/status
      changes through appropriate live regions.
- [ ] Provide a keyboard and screen-reader alternative to map interaction.
- [ ] Remove the global rule that prevents users selecting/copying normal text.
- [ ] Support reflow at 400% zoom/320 CSS pixels.
- [ ] Meet the WCAG 2.2 minimum target-size requirement.
- [ ] Run automated axe checks as a floor, not as proof of conformance.
- [ ] Complete a manual desktop keyboard pass and at least one mobile
      screen-reader/browser pass on the pilot-critical flows.

Acceptance criteria:

- No known WCAG 2.2 Level A or AA failure remains in the pilot-critical landing,
  login, signup, host, cleaner, and modal flows after automated and manual
  evaluation.
- Automated axe, desktop keyboard, and mobile screen-reader/browser evidence is
  attached to the release checklist.
- The team does not claim whole-site WCAG conformance from this limited pilot
  evaluation.

---

## 10. Gate C, part 1 — Support, policy, release, and operations

### S1-R01 — Publish the pilot policy surfaces

Obtain qualified review before treating this as legal advice.

- [ ] BG/EN privacy notice.
- [ ] BG/EN marketplace terms.
- [ ] Cookie information and persistent preference controls.
- [ ] Separate terms/privacy version acceptance from cookie consent.
- [ ] Explain the platform’s coordination role and off-platform payment.
- [ ] Cover addresses, profile data, verification, reviews/issues, retention,
      deletion/access requests, and emergency limitations.
- [ ] Disclose any approved map/geocoding processor or recipient, purpose, data
      sent, retention/logging, and non-map fallback.
- [ ] Research/pilot consent wording and recording policy.
- [ ] Support and incident-contact route.

Acceptance criteria:

- No optional tracker runs before valid consent.
- Users can revise optional-cookie choices.
- The UI does not report consent as saved when persistence failed; failure is
  retried or clearly disclosed.
- Terms/privacy version and acceptance are recorded.
- Interview recording, quotations, and future contact use separate consent.

### S1-R02 — Establish the Stage 1 support operation

- [ ] Publish one monitored support email/phone/messaging channel.
- [ ] Publish staffed hours, expected response, and emergency limitations.
- [ ] Maintain a restricted support tracker:
  - user/job;
  - severity;
  - owner;
  - timestamps;
  - action;
  - outcome;
  - operator minutes.
- [ ] Write operator runbooks for:
  - account approval and cleaner verification;
  - password/account recovery;
  - cancellation and rescheduling;
  - no-show and emergency replacement;
  - dispute/quality/safety investigation;
  - unsafe content and suspension;
  - account deletion/data request;
  - email/worker/site outage;
  - rollback and restore;
  - privacy incident.
- [ ] Rehearse each critical runbook with test accounts.

No ticketing platform is required for Stage 1.

Acceptance criteria:

- A backup operator can follow each runbook without direct developer database
  intervention.

### S1-R03 — Deploy a secure pilot environment

- [ ] Use a real domain and valid TLS.
- [ ] Redirect HTTP to HTTPS.
- [ ] Use unique production secrets outside source control.
- [ ] Run PostgreSQL for the pilot database.
- [ ] Configure exact allowed hosts and trusted origins.
- [ ] Enable secure session and CSRF cookies.
- [ ] Keep debug off and make unsafe production settings fail fast.
- [ ] Expose only ports 80/443; keep Django, PostgreSQL, and Redis private.
- [ ] Protect Django admin with MFA where supported or a VPN/IP allowlist,
      least-privilege staff accounts, and audited admin actions.
- [ ] Disable production authentication methods that are not intentionally used,
      including Basic Authentication if it is unnecessary.
- [ ] Add login, signup/email-verification-code issue and resend, reset,
      connection, import, and other abuse-sensitive endpoint rate limits.
- [ ] Configure and test security headers, including content-type and frame
      protection, a deliberate referrer policy, CSP, and HSTS after TLS is
      confirmed.
- [ ] Audit tracked environment examples and deployment files so they contain
      placeholders rather than usable credentials or DSNs.
- [ ] Run dependency-vulnerability and committed-secret scans and resolve the
      release-blocking findings.
- [ ] Run application containers as non-root with the minimum required
      filesystem and network access.
- [ ] Keep production personal/operational data out of staging; use synthetic
      or irreversibly anonymized fixtures.
- [ ] Configure container restart behavior, resource bounds, and log rotation.
- [ ] Confirm persistent media storage and backup.
- [ ] Update deployment documentation for the final domain/TLS path.

Acceptance criteria:

- Production is reachable over plaintext only to redirect to HTTPS.
- A phone on mobile data can sign up and log in without CSRF/cookie errors.
- Production startup rejects default/short secrets and unsafe cookie/domain
  settings.
- Backend, database, and Redis are not publicly reachable.
- The deployment passes the Django deploy check without unresolved security
  warnings.

### S1-R04 — Add backup, restore, and rollback

- [ ] Take encrypted PostgreSQL base backups and continuously archive WAL (or
      use a managed equivalent) so point-in-time recovery is available during
      live pilot operations. A daily snapshot alone is not sufficient for the
      transactional database.
- [ ] Back up uploaded media daily.
- [ ] Encrypt and store backups off the application host.
- [ ] Define retention and ownership.
- [ ] Record the release commit/image for every deployment.
- [ ] Take a database backup before migrations.
- [ ] Use backward-compatible migrations where possible.
- [ ] Document deploy and rollback commands.
- [ ] Restore to a selected point in time in a clean environment.
- [ ] Verify restored users, jobs, assignments, reviews, audit history, and
      media.
- [ ] Invalidate active sessions/reset tokens as required by the recovery
      scenario and verify deletions, suspensions, cancellations, assignments,
      incidents, and access revocations at the chosen recovery point.
- [ ] If an emergency restore cannot reach the required point, keep the
      marketplace in maintenance mode while every later operational transition
      is reconciled against restricted operator/support evidence and participant
      confirmation. Do not reopen if any active assignment, cancellation,
      incident, deletion, suspension, or access state remains uncertain.
- [ ] Rehearse a release rollback.

Recommended pilot targets:

- Transactional database recovery point objective: no more than 15 minutes of
  data.
- Uploaded-media recovery point objective: no more than 24 hours of data.
- Recovery time objective: restore service within 4 hours.

Acceptance criteria:

- Point-in-time restore and rollback evidence is linked from the release
  checklist; the team does not merely assume backups work or rely on an
  incomplete side journal.

### S1-R05 — Make observability active

- [ ] Pass required frontend/server Sentry settings at build and runtime.
- [ ] Send sanitized test exceptions from browser, Django, and Celery.
- [ ] Alert the owner on new production unhandled errors and 5xx responses.
- [ ] Split simple liveness from readiness.
- [ ] Readiness checks database connectivity without exposing secrets.
- [ ] Add a worker health signal and a scheduler health signal only if an
      automated scheduler is deployed.
- [ ] Monitor landing, readiness, worker, any deployed scheduler, disk, TLS
      expiry, notification failures, and backup freshness from outside the
      host.
- [ ] Preserve request IDs and PII sanitization.

Acceptance criteria:

- A controlled failure can be followed from browser/API request ID to sanitized
  error and worker task where relevant.

---

## 11. Gate C, part 2 — Instrumentation and verification

### S1-Q01 — Define the Stage 1 event and metric contract

Use operational/audit data for the marketplace funnel. A large analytics
platform is not required.

- [ ] Standardize server-side events for:
  - signup and email confirmation;
  - account creation and approval outcome;
  - cleaner verification outcome;
  - property/job creation and publication;
  - application and direct offer;
  - assignment/delegation;
  - conflict-blocked acceptance;
  - cancellation/reschedule/no-show/dispute;
  - replacement request and fill;
  - completion and review;
  - final notification failure.
- [ ] In operational events or the restricted pilot ledger, give every exposed
      record a stable turnover-lineage ID and attempt ID; record first supply
      exposure, supersession/replacement links, outreach, first-response mode,
      assignment source, and exclusion reason.
- [ ] Create an anonymized weekly pilot report.
- [ ] Track operator minutes through a restricted pilot/support ledger.
- [ ] Apply data minimization and retention to operational events.
- [ ] Gate optional browser analytics behind existing analytics consent.
- [ ] Record counts beside percentages for the small pilot sample.

Acceptance criteria:

- The owner can review the Stage 1 metrics in Section 15 without ad hoc edits to
  production data.

### S1-Q02 — Backend test matrix

- [x] Signup creates pending users and pending cleaner state before atomic
      contact reconciliation advances allowed transitions.
- [ ] Approval and verification transitions and permissions.
- [ ] Serializer/API field allowlists by role and status.
- [ ] Object-level authorization for every pilot resource and action, including
      property, job, application, assignment, conversation, review, calendar,
      notification, and any enabled media route.
- [ ] Private property/media authorization for any media retained in Stage 1.
- [ ] Availability and overlap checks.
- [ ] Concurrent acceptance and replacement races on PostgreSQL.
- [ ] Cancellation, reschedule, no-show, dispute, and replacement transitions.
- [ ] Turnover-lineage/R17 behavior: immutable original attempt, host-authorized
      linked replacement, at most one actionable same-slot job, and one metric
      denominator across attempts.
- [ ] Exactly one accepted cleaner assignment per cleaning job and immutable
      agency delegation.
- [ ] Delegated-member completion and reviews.
- [x] Favourites may be created only for active, approved, marketplace-eligible cleaners
      eligible for the public directory; historical favourites remain and
      serialize safely after later suspension or loss of eligibility.
- [ ] Account-deletion guards and retention behavior.
- [ ] Notification dedupe, retries, post-commit dispatch, and reminders.
- [ ] Password reset token, expiry, rate limit, and enumeration resistance.
- [ ] Email-code issue/resend throttling and enumeration resistance.
- [ ] Calendar URL-import SSRF/redirect/size/parser tests, or tests proving the
      URL-fetch path is disabled; upload size/type/content tests.
- [ ] UTC/Sofia and daylight-saving boundaries.
- [ ] Audit chronology.
- [ ] Test isolation: full tests must not retry a live/unavailable Redis broker.

### S1-Q03 — Frontend and browser test matrix

- [ ] Guest, pending, rejected, suspended, wrong-role, and approved CTA behavior.
- [ ] Safe public demand and zero-demand state.
- [ ] Full BG/EN signup and activation status.
- [ ] Agency-disabled/fallback routing.
- [ ] Password reset.
- [ ] Conflict and lifecycle dialogs.
- [ ] Accessible dialog focus/error behavior.
- [ ] Mobile widths and software-keyboard behavior.
- [ ] Browser-level golden paths:
  1. Host signup → pending → approval.
  2. Cleaner signup → safe pending base → automatic contact reconciliation.
  3. Host property and job publication.
  4. Public demand without private property leakage.
  5. Cleaner application → host acceptance.
  6. Overlapping acceptance blocked.
  7. Cancellation → operator-supported replacement.
  8. Completion → two-way review.
  9. Every enabled role login destination.
  10. Logout, password reset, policy, and support.
  11. HTTPS/CSRF/private-media smoke.
  12. Property-location network/privacy path and non-map fallback.

### S1-Q04 — Release commands and evidence

- [ ] Add frontend tests to CI; the release gate must not rely only on
      typecheck, lint, and build.
- [ ] Add a minimum Playwright (or equivalent browser-level) smoke suite for the
      golden and recovery paths in S1-Q03.

From frontend:

    npm.cmd run test
    npm.cmd run typecheck
    npm.cmd run lint
    npm.cmd run build

Do not run build while a development server is using the same frontend/.next.

From backend:

    python manage.py check
    python manage.py check --deploy
    python manage.py makemigrations --check --dry-run
    pytest

Production-like:

- [ ] Validate Compose configuration.
- [ ] Reproduce the build.
- [ ] Apply migrations explicitly and verify them.
- [ ] Run browser smoke tests.
- [ ] Verify real BG and EN email delivery through the configured, verified
      sender and verify Celery processing.
- [ ] Run dependency-vulnerability and secret scans and confirm containers run
      as non-root.
- [ ] Verify Sentry and external uptime alerts.
- [ ] Verify mobile-data signup/login.
- [ ] Complete a point-in-time restore and prove assignments, cancellations,
      incidents, deletions, suspensions, revocations, and active-session state
      are correct before access is opened.
- [ ] Rehearse rollback.

Acceptance criteria:

- No unresolved P0 defect remains. A P1 may proceed only with an owner-approved
  bounded, user-safe workaround, named owner, and expiry date.
- The release sign-off links to test, accessibility, mobile, deployment,
  restore, rollback, and runbook-rehearsal evidence.

---

## 12. Gate D, part 1 — Execute M1 research

The detailed interview guides and templates remain in the
[M1 plan](monetization/M1_MARKET_CUSTOMER_COMPETITOR_RESEARCH_PLAN.md).

### S1-M01 — Research setup

- [ ] Confirm interview lead and note-taker.
- [ ] Confirm incentives and budget.
- [ ] Approve consent wording, recording policy, storage location, access list,
      and deletion/anonymization date.
- [ ] Identify host, agency, and cleaner contact sources.
- [ ] Confirm any internal user/lead data available for read-only review.
- [ ] Create, privacy-review, version, and link the communication templates used
      for:
  - host, agency, and cleaner research recruitment;
  - the consent opener and recording/quotation choices;
  - pilot invitation and acknowledgement;
  - withdrawal and data-removal requests;
  - post-job and pilot-end debriefs.
- [ ] Create restricted working trackers:
  - recruitment;
  - scheduling and consent;
  - interview notes and score;
  - assumption evidence;
  - contradiction log;
  - competitor findings;
  - source register;
  - unresolved questions.
- [ ] Use anonymous participant IDs in repo artifacts.
- [ ] Never commit names, contact details, identity documents, property
      addresses, access codes, guest data, or raw recordings.

### S1-M02 — Recruitment targets

| Segment | Contact target | Interview target | Hard minimum |
|---|---:|---:|---:|
| Sofia portfolio hosts, 4–20 properties | 15–25 | 8–12 | 5 |
| Sofia cleaning agencies | 10–15 | 5–8 | 3 |
| Sofia STR-experienced cleaners | Build Week 1; contact after early demand themes | 6–10 | 4 |
| Sofia small-host comparison, 1–3 properties | 5–8 | 3–5 | 2 |

- [ ] Recruit portfolio hosts and agencies first.
- [ ] Begin cleaner interviews after early host/agency themes reveal the supply
      assumptions to test.
- [ ] Send no more than two respectful follow-ups.
- [ ] Record opt-outs.
- [ ] Do not add research contacts to marketing without separate consent.

### S1-M03 — Interview procedure

- [ ] Screen against the M1 criteria.
- [ ] Capture separate consent for notes, recording, anonymized quotations, and
      future follow-up.
- [ ] Ask about the last real cleaning, conflict, cancellation, cleaner search,
      and workaround.
- [ ] Anchor responses to dates, counts, tools, time, consequences, and current
      spending.
- [ ] Do not lead with a feature or ask only whether an idea “sounds useful.”
- [ ] Capture exact language about reliability, trust, bypass, and ongoing
      platform value.
- [ ] Score every interview within 24 hours.
- [ ] Log contradictions and weak evidence immediately.
- [ ] Ask separately whether the participant may be invited to the free pilot.

### S1-M04 — Competitor and current-state research

- [ ] Research direct vacation-rental cleaning workflow products.
- [ ] Research adjacent vacation-rental operations tools.
- [ ] Research Bulgarian cleaning marketplaces/agencies and informal
      alternatives.
- [ ] Include Hostler, Turno, Domestina, direct cleaner relationships,
      WhatsApp/Viber/Facebook groups, property managers, and agencies where
      relevant.
- [ ] Record pricing and feature claims only from current sources.
- [ ] Label vendor claims as vendor claims.
- [ ] Do not infer Sofia host count, cleaner count, market size, traction, or
      willingness to pay without evidence.

### S1-M05 — M1 closeout

- [ ] Identify repeated pain and explicit counter-evidence.
- [ ] Map actual alternatives and current spending categories.
- [ ] Select or reject a narrow Sofia district cluster based on both demand and
      verified supply potential.
- [ ] Decide whether portfolio hosts remain primary.
- [ ] Decide whether agencies remain secondary.
- [ ] Document cleaner sensitivity to platform rules and fees.
- [ ] Complete the competitor/source register.
- [ ] Produce precise M2 hypotheses without running WTP tests yet.
- [ ] Issue an M1 decision: proceed, extend, or reject/reframe.

M1 is complete only when the minimum evidence and closeout requirements in the
existing M1 plan are satisfied.

---

## 13. Gate D, part 2 — Supply verification and activation

### S1-O01 — Cleaner verification checklist

Apply the owner-approved policy from S1-D02.

- [ ] Confirm email and account identity.
- [ ] Confirm the applicant is at least 18.
- [ ] Conduct the approved secure identity-review step.
- [ ] Confirm a working contact method.
- [ ] Record Sofia service districts and travel limits.
- [ ] Record availability, notice window, and practical capacity.
- [ ] Review a recent STR turnover example.
- [ ] Complete the approved reference or trial requirement.
- [ ] Confirm understanding of punctuality, keys/access codes, guest privacy,
      lost property, damage reporting, cancellation, issue escalation, and
      property instructions.
- [ ] Confirm the code of conduct, reviews, and off-platform payment model.
- [ ] Record reviewer, result, rationale category, timestamp, and next review
      date.
- [ ] Keep account approval separate from cleaner verification.
- [ ] Use secure storage; do not receive identity documents in ordinary email,
      WhatsApp, source control, or the pilot tracker.

If a trial is used for verification, it is a controlled assessment—not a live
pilot turnover. Obtain consent, compensate the applicant for their time,
supervise it in a non-guest-sensitive setting, provide no production access
code or guest information, and do not treat the applicant as eligible supply
until the reviewer records a passed verification decision. A reference-based
provisional route is acceptable only if the owner-approved policy defines the
extra monitoring and the person is fully verified before any live assignment.

### S1-O02 — Agency verification checklist

Only required if a controlled agency enters the pilot.

- [ ] Confirm legal/business name and authorized operating contact.
- [ ] Confirm Sofia service area, team size, capacity, and STR experience.
- [ ] Confirm substitution and quality-reporting procedure.
- [ ] Confirm every delegated member is separately active, approved, and
      verified.
- [ ] Confirm member-delegation immutability and the support replacement path.
- [ ] Confirm access-code, communication, incident, and review responsibilities.
- [ ] Record reviewer, result, rationale, and recheck date.

### S1-O03 — Activate verified supply

Before a cleaner enters the active pilot pool:

- [ ] Complete required profile and exact service zones.
- [ ] Confirm two-week availability.
- [ ] State notice window, travel limits, and capacity.
- [ ] Complete a product walkthrough/test scenario.
- [ ] Confirm urgent-contact preference.
- [ ] Respond successfully to a test message.
- [ ] Demonstrate how to decline when unavailable.
- [ ] Demonstrate how to report lateness, cancellation, safety, damage, and
      missing details.

Maintain a restricted capacity map by district, weekday/weekend, time band, and
notice period.

**Pilot district rule:** Do not open a district/time band without at least two
total eligible, activated cleaners: one potential assignee and one distinct
potential backup. This is capacity evidence, not a guarantee that both remain
available for every job.

---

## 14. Gate E — Free Sofia concierge fulfillment pilot

### S1-P01 — Pilot charter

Record before launch:

- [ ] Selected Sofia micro-cluster.
- [ ] Five to eight qualified hosts in a designated evaluation cohort. A
      qualified cohort host is an approved target-segment host with an active
      Sofia STR property and at least one genuine standard turnover expected
      inside the activation window.
- [ ] Activated marketplace-eligible cleaner pool; any stronger manual-evidence
      cohort label depends on S1-D02.
- [ ] Controlled agencies, if any.
- [ ] Cohort-freeze rule: designate five to eight qualified hosts and freeze
      membership before the first measured pilot job.
- [ ] Activation-window rule: approve a fixed activation window before launch
      (recommended: 14 days). At least five frozen-cohort hosts must reach a
      first operationally successful job inside it. Retain non-activating hosts
      as failed-activation evidence.
- [ ] Closeout rule: wait until every host who qualifies inside that activation
      window has 30 complete days after their own first operationally
      successful job. Analyze late hosts separately; never add them to the
      frozen repeat-use denominator.
- [ ] Free platform participation; cleaning payment remains off-platform.
- [ ] Operator hours and emergency channel.
- [ ] Manual actions the operator will perform.
- [ ] Honest limitations and no guarantee of coverage.
- [ ] Privacy and property-access rules.
- [ ] Incident/cancellation escalation.
- [ ] Approved thresholds in Section 15.

### S1-P02 — Per-host onboarding

- [ ] Confirm the host controls active Sofia STR properties.
- [ ] Confirm decision authority for cleaning.
- [ ] Record district, turnover cadence, normal time window, access method, and
      special constraints.
- [ ] Do not copy guest data into the pilot tracker.
- [ ] Ask for at least one genuine upcoming job.
- [ ] Explain job, application, assignment, completion, and review states.
- [ ] Explain off-platform payment and the single-assignment rule.
- [ ] Confirm emergency contact and cancellation expectations.
- [ ] Obtain pilot acknowledgement.

### S1-P03 — Per-job operating runbook

1. Host posts a genuine, complete job.
2. Operator verifies scope, removes unnecessary guest data, and freezes the
   job’s metric eligibility at publication. Record whether it is a standard or
   urgent job, the notice band, in-cluster status, and any exclusion reason.
   Before supply exposure, a materially changed record may be superseded and
   excluded with a reason. After exposure, the original attempt remains in its
   denominator with its outcome and the changed request creates a linked
   measurement attempt. Never reset or double-count an exposed attempt.
3. Eligible supply is determined at that time by approval, verification,
   district, availability, notice, and travel limits.
4. The job is surfaced through the platform; consented manual outreach may
   supplement it.
5. Record publish time, every targeted outreach event, first qualified response,
   first qualified application, `first_qualified_response_mode`, and
   `assignment_source`: `organic_application`, `host_direct_offer`, or
   `operator_assisted`. A response is organic only when no targeted host or
   operator outreach occurred before it. Assisted/direct-offer results must
   never be reported as organic marketplace liquidity.
6. Host selects and accepts one cleaner. The operator never impersonates the
   host.
7. Identify a backup option without assigning it.
8. Reconfirm the assigned cleaner around T−24 hours.
9. For tight turnovers, reconfirm readiness around T−2 hours.
10. Cleaner performs and completes through the platform workflow.
11. Operator requests an affirmative host outcome confirmation within 24
    hours: agreed-window completion and whether any material issue remains.
12. Remind both sides to use the standard review flow.
13. Log support minutes, manual interventions, incidents, and recovery.
14. Debrief after the first job and at pilot end.

Measure two separate outcomes:

- **System completion:** The assignment is marked completed.
- **Operational success:** The job completed in the agreed window with no
  no-show and no material unresolved issue, supported by affirmative host
  confirmation or another auditable evidence rule approved before pilot launch.
  Host non-response is **unknown**, never evidence of success and never part of
  the success numerator.

Do not change product state to fabricate the operational metric. Record it in
the restricted pilot ledger. Host outcome confirmation is research/operations
evidence only: it does not add a host-completion step, gate the assigned
cleaner/admin completion action, reverse completed status, or replace the
standard review flow.

### S1-P04 — Failure runbook

- Cleaner cancellation before T−24h: notify, request replacement, preserve
  history.
- Cleaner cancellation inside T−24h: mark urgent, contact eligible backups, and
  record recovery time.
- No response at T−2h: contact once through the agreed channel, then alert the
  operator and host.
- No-show or unsafe access: stop, notify, and do not pressure anyone to enter.
- Quality/damage/privacy concern: preserve minimal evidence, restrict access,
  and suspend matching if safety requires investigation.
- Agency substitution: use the support/admin replacement workflow; never
  overwrite normal member delegation.
- Critical safety/privacy incident: pause the affected workflow and escalate.

### S1-P05 — Post-job debrief

Ask both parties:

- What happened versus what was expected?
- Which step needed a call/message outside the product?
- What information was missing or late?
- Was the job completed in the agreed window?
- Did the operator intervene, and for how many minutes?
- Would this workflow be used for the next turnover?
- What would cause the relationship to bypass the platform?
- What is the single most important improvement?

---

## 15. Metrics and Stage 1 decision gates

These are recommended planning thresholds, not market facts. Approve them before
the first live job and do not move them after seeing results.

### Metric dictionary

| Metric | Definition |
|---|---|
| Genuine job | A real booked-property turnover requested by an approved target host; excludes seed/demo/test, duplicate, invalid, fabricated, and research-only records |
| Turnover lineage | One genuine turnover need plus its original, superseded, and linked replacement job/measurement attempts. Count the lineage once in volume, fill, completion, and operational-outcome metrics; retain attempt-level response, cancellation, recovery, and operator-work evidence |
| Frozen evaluation cohort | The five to eight qualified hosts designated before the first measured pilot job; membership does not change after launch |
| Evaluable standard turnover | A genuine turnover lineage in the selected cluster whose first exposed attempt is frozen as eligible at least the owner-approved minimum notice before start (recommended: 48 hours). A withdrawal/material change before supply exposure may be excluded/superseded with reason; after exposure the original attempt remains recorded and a changed request becomes a linked attempt without creating a second volume denominator |
| Urgent turnover | A genuine turnover whose first exposed attempt is below the minimum-notice threshold; report it as a separate cohort and never use it to lower the standard-turnover denominator |
| Qualified response | A response from an active marketplace-eligible in-area cleaner whose recorded availability/travel limits fit the job, through one recorded match mode |
| Match mode | Record outreach events, `first_qualified_response_mode`, and `assignment_source` as `organic_application`, `host_direct_offer`, or `operator_assisted`. Organic means no targeted host/operator outreach occurred before that response; assisted/direct results are not organic liquidity |
| Qualified-response rate | Evaluable standard turnover lineages receiving a qualified response within 24 hours of first supply exposure / evaluable standard turnover lineages |
| Organic qualified-application rate | Evaluable standard turnover lineages receiving an `organic_application` within 24 hours of first supply exposure / evaluable standard turnover lineages |
| Fill rate | Evaluable standard turnover lineages assigned before required start / evaluable standard turnover lineages |
| Time to first qualified response | First supply-exposure timestamp in the turnover lineage to first qualified response, segmented by match mode and notice band |
| System completion rate | Turnover lineages with a system-completed assignment / assigned evaluable standard turnover lineages |
| Operational success rate | Assigned evaluable standard turnover lineages with affirmative host confirmation or pre-approved auditable evidence of agreed-window completion and no material unresolved issue / assigned evaluable standard turnover lineages. Unknown outcomes remain in the denominator but not the numerator |
| Cancellation/no-show rate | Assigned evaluable standard turnover lineages with at least one cleaner cancellation or no-show / assigned evaluable standard turnover lineages |
| At-risk turnover | An assigned turnover lineage affected by cleaner cancellation, no-show, or another documented material delivery risk that activates the recovery runbook |
| Recovery rate | At-risk turnover lineages covered by a linked replacement job before required start / at-risk turnover lineages. With zero at-risk lineages, the result is `Not observed`, never 100% |
| Cohort activation rate | Frozen-cohort hosts reaching a first operationally successful job inside the approved activation window / all frozen-cohort hosts |
| Matured host | A frozen-cohort host who reached a first operationally successful job inside the activation window and has since received 30 complete observation days |
| Repeat-host rate | Matured hosts who intentionally publish a new genuine job after their first operational-success timestamp and within the following 30 days / all matured hosts. Pre-existing drafts, monthly-batch jobs, imports, or other jobs created before first success do not count as repeat behavior |
| Active eligible supply | Marketplace-eligible cleaners with current availability who respond during the pilot; email-only status is not an identity-verification claim |
| District coverage | Active district/time bands with at least two total eligible activated cleaners (one potential assignee plus one distinct potential backup) / all active district/time bands |
| Recurring operator effort per success | Total recurring operator minutes across all evaluable standard turnover lineages—including unfilled, cancelled, failed, and recovery work—/ operationally successful lineages |
| Per-turnover operator effort | Median and maximum recurring operator minutes across all evaluable standard turnover lineages |
| Host activation effort | Total and median onboarding/activation minutes per activated frozen-cohort host |
| Supply activation effort | Total and median verification/activation minutes per active cleaner or agency member |
| Material incident | Approved severity definition covering safety, privacy, damage, access, or unresolved quality |

Freeze eligibility and match mode at the events defined above. Retain and
report excluded turnover lineages with reason counts, but do not move lineages
between cohorts after viewing results. Segment urgent turnovers, direct offers,
and operator-assisted matches; never combine them into an “organic” claim.

### Evidence gate

- At least 5 qualified portfolio-host interviews.
- At least 3 qualified agency interviews.
- At least 4 qualified cleaner interviews.
- At least 2 qualified small-host comparison interviews.
- At least three independent participants from the same selected target segment
  describe the same recent, repeated problem with behavior evidence.
- The current time, money, or risk cost and responsible decision-maker are
  identifiable.
- There is a reason to continue using the platform after the first
  host-cleaner introduction.
- The Sofia cluster and target segment are explicitly supported or rejected.

### Pilot volume gate

- Five to eight qualified hosts are frozen before the first measured job, and
  at least 5 of them reach a first operationally successful job inside the
  pre-approved activation window.
- At least 10 evaluable standard turnover lineages are published. Linked
  replacement/superseded attempts do not increase this count. Urgent and
  excluded lineages are reported separately and do not satisfy this minimum.
- Every activated frozen-cohort host receives 30 complete observation days
  after their own first operationally successful job before the final
  repeat-use calculation. Non-activators never start a maturity clock; they
  remain in the cohort-activation denominator as failed-activation evidence.
- Hosts outside the frozen cohort and first successes after the activation
  window are reported separately and never added to the repeat denominator.
- Every launched district/time band has at least two total active verified
  cleaners: one potential assignee and one distinct potential backup.

### Reliability gate

- At least 70% of evaluable standard turnover lineages receive a qualified
  response within 24 hours of first supply exposure across the recorded match
  modes.
- Organic qualified-application rate is shown separately. Host direct offers
  and operator-assisted responses cannot satisfy or be described as organic
  liquidity.
- Apply the owner-approved pre-launch organic-liquidity threshold (recommended:
  at least 40% of evaluable standard turnover lineages receive an organic
  qualified application within 24 hours). If it fails, Stage 1 may validate only a
  concierge-assisted fulfillment model and must not claim self-service
  marketplace liquidity.
- At least 70% of evaluable standard turnover lineages are assigned before
  required start.
- At least 90% of assigned evaluable standard turnover lineages are operationally
  successful. A host non-response is unknown, not successful.
- At least two matured hosts publish a second genuine job within their
  individual 30-day window, and the repeat-host numerator and matured-host
  denominator are both reported.
- Recurring operator effort per operationally successful turnover lineage is no
  more than the pre-approved threshold (recommended: 15 minutes), and
  per-turnover median/max, host activation, and supply activation effort are
  reported separately.
- Recovery rate is reported with raw counts. With no genuine at-risk turnover,
  recovery is `Not observed`: Stage 1 may claim capacity and rehearsed readiness
  but not validated live backup recovery. That claim requires at least one
  genuine at-risk turnover lineage to be successfully recovered.
- No unresolved critical safety or privacy incident occurs.

Show raw counts beside every percentage, report exclusions by reason, and show
urgent turnovers and each match mode separately. The sample is small and is not
statistically representative.

### Product/release gate

- No anonymous API or media route leaks exact property data.
- Public cleaner/profile/review responses use approved allowlists and safe
  publication/redaction rules.
- Exact property search/coordinates never go directly to an unapproved map or
  geocoding third party.
- Calendar URL import is disabled or passes the SSRF/redirect/size/content gate.
- Real signup creates a safe pending base and then applies automatic contact
  reconciliation; manual cleaner evidence verification remains blocked by S1-D02.
- No enabled role has a dead route/action.
- No overlapping active cleaner assignments survive concurrency.
- Minimum cancellation, reschedule, no-show, dispute, and replacement recovery
  work end to end and preserve history.
- The owner-approved R17 turnover-lineage model preserves one accepted
  assignment per job, at most one actionable same-slot job, and one metric
  denominator per turnover.
- Critical notifications are idempotent and observable.
- HTTPS, strong secrets, secure cookies, backups, restore, rollback, and alerts
  are proven.
- BG/EN, mobile, accessibility, policy, and support gates pass.
- The golden path and a failed-job recovery path pass automated and manual
  rehearsal.

### Decision

#### Proceed to Stage 2

Proceed only when the evidence, volume, reliability, repeat-use, trust,
operator-effort, and release gates pass. The final readout must identify only
the next one to three product changes, each tied to observed failure evidence.

Stage 2 monetization/WTP work remains governed by the M2 entry gate; Stage 1 does
not approve prices or billing.

#### Extend once

Extend for no more than 14 days when:

- sample or job volume is below threshold but recruitment is credible;
- a temporary disruption distorted results; or
- one specific district/segment adjustment can resolve the uncertainty.

Write the extension hypothesis, owner, and deadline before continuing. An
extension means Stage 1 is not yet complete.

#### Pivot

Pivot when another segment, micro-cluster, or narrower emergency-backup use case
has materially stronger evidence than the current position.

#### Stop

Pause or stop when:

- ineligible supply reaches real work;
- a critical safety/privacy incident remains unresolved;
- there is no viable backup capacity;
- suitable participants cannot be recruited;
- users cannot describe repeated pain;
- the product provides only a first introduction with no ongoing value;
- operator effort is not consistently deliverable; or
- evidence quality cannot support a segment decision.

---

## 16. Gate F — Final readout and owner decision

### S1-F01 — Close Stage 1 explicitly

- [ ] Name the readout reviewer and final decision owner. Record conflicts of
      interest if the reviewer also operated the pilot or built the product.
- [ ] Audit the required artifacts in Section 17 for completeness, source,
      version, privacy, and traceability.
- [ ] Record **Pass**, **Fail**, **Not run**, or **Not applicable** for every
      gate and every threshold, with a linked artifact and a short rationale.
- [ ] Record cohort dates, exclusions, unknown outcomes, match-mode splits,
      limitations, counter-evidence, incidents, and unresolved P0/P1 items.
- [ ] Select exactly one outcome: **Proceed to Stage 2**, **Extend once**,
      **Pivot**, or **Stop**.
- [ ] Record the decision owner, signature/approval reference, and date.
- [ ] Update the gate and work-item trackers and the relevant source-of-truth
      roadmap/progress documents.

Closure rules:

- **Proceed** requires every applicable Gate A–E entry/exit condition and the
  product, evidence, volume, reliability, and repeat-use gates to pass.
- **Extend once** is temporary, lasts no more than 14 days, and requires a
  single written uncertainty, owner, target sample/job count, and final decision
  date. It does not complete Stage 1 until the follow-up readout selects
  Proceed, Pivot, or Stop.
- **Pivot** or **Stop** can complete Stage 1 without unnecessary engineering or
  a live pilot when evidence already rejects the segment or makes continuation
  unsafe. Failed and not-run gates, saved evidence, sunk work, and the reason
  for stopping must still be recorded.
- If M1 rejects the target segment/cluster, mark Gate E **Not run — rejected by
  M1 evidence**. Do not manufacture pilot activity to make the tracker look
  complete.

**Done when:** One signed, dated decision and its traceable evidence pack exist;
there are no competing or provisional final decisions.

---

## 17. Required evidence artifacts

Keep personal and operationally sensitive data in access-controlled storage.
Only anonymized templates, aggregates, and conclusions belong in the repo.

- [ ] Stage 1 charter and owner decisions.
- [ ] Metric dictionary and approved thresholds.
- [ ] Recruitment funnel by anonymous participant ID.
- [ ] Consent log with separate notes/recording/quote/follow-up choices.
- [ ] Versioned recruitment, consent, pilot invitation/acknowledgement,
      withdrawal/data-removal, and debrief communication templates.
- [ ] De-identified interview notes and scorecards.
- [ ] Theme/evidence matrix.
- [ ] Assumption and contradiction registers.
- [ ] Competitor table and source register.
- [ ] Selected Sofia cluster rationale.
- [ ] Verification policy and reviewer checklist.
- [ ] Restricted verification register; anonymized aggregates in repo only.
- [ ] Cleaner capacity/coverage map without home addresses.
- [ ] Pilot participant acknowledgements.
- [ ] Per-job pilot ledger.
- [ ] Operator time/intervention log.
- [ ] Incident, cancellation, no-show, and recovery log.
- [ ] Weekly metrics with numerator and denominator.
- [ ] Post-job and pilot-end debrief summaries.
- [ ] Release sign-off with tests, accessibility, mobile, deployment, restore,
      rollback, and rehearsal evidence.
- [ ] Final Stage 1 readout.
- [ ] Owner decision and date.

### Final readout structure

1. Decision.
2. What was tested.
3. Cohort and limitations.
4. M1 findings.
5. Pilot funnel and reliability metrics.
6. Trust and safety findings.
7. Retention and bypass evidence.
8. Operator workload.
9. Strongest counter-evidence.
10. Stage gates with raw counts and pass/fail.
11. Next one to three product priorities.
12. Explicit do-not-build list.
13. Owner decision and date.

---

## 18. Deferred until after Stage 1

Do not allow these items to delay the Stage 1 learning loop:

- Native iOS/Android applications or Capacitor.
- React Native/Expo rewrite.
- PWA service worker/installability work.
- Payments, payouts, wallets, invoices, commission, or billing.
- Advertising or sponsored placement.
- Nationwide launch.
- Full Google Calendar OAuth integration.
- Full automated iCal polling unless Stage 1 evidence makes scheduling
  automation the next priority.
- Automated emergency marketplace broadcasting beyond the minimum operator
  recovery workflow.
- Advanced inventory management.
- Advanced checklist/photo proof unless pilot quality failures support it.
- Full agency suite unless agency evidence and commitments support it.
- Advanced analytics dashboard.
- Cosmetic dashboard redesign without measured journey evidence.

Likely post-Stage 1 candidates, if supported by evidence:

1. Matching, cancellation, and urgent-replacement automation.
2. Saved idempotent iCal sync and auto-created draft jobs.
3. Property-specific checklists, completion proof, and issue reporting.
4. Minimum agency workspace if agencies remain research-only during Stage 1.
5. PWA installability after responsive mobile QA.

The technical recommendation in [Mobile Feasibility](MOBILE_FEASIBILITY.md)
remains useful. This plan intentionally changes only the sequencing: responsive
pilot UX and repeat-use evidence come before installability work.

---

## 19. Implementation handoff

Recommended engineering order:

1. Record the policy decisions, including agency participation, the R17
   turnover-lineage model, and the map/geocoder boundary, plus required ADRs.
2. ✅ Maintain S1-E01 public-data/profile/review and property-media containment
   regression coverage.
3. 🟨 S1-E02 interim contact verification and PostgreSQL concurrency coverage
   are implemented; phone/manual cleaner/agency verification remains governed
   by S1-D02.
4. ✅ Remove sensitive signup persistence; retain the allowlist and telemetry
   regression suite.
5. Repair anonymous conversion and contain agency routing.
6. ✅ Enforce authoritative assignment overlap checks for application/direct
   offer acceptance and concrete agency-member delegation.
7. Add history-preserving lifecycle/recovery services and UI.
8. ✅ Disable calendar URL import and validate every enabled upload.
9. Proxy an approved map/geocoder through the owned API boundary or disable
   exact third-party location features.
10. Wire reliable critical notifications and the operator reminder runbook;
   deploy an automated scheduler only if selected.
11. Complete onboarding, landing, mobile, accessibility, and recovery.
12. Add the test/instrumentation matrix.
13. Deploy behind domain/TLS, prove point-in-time restore, and rehearse
    rollback/support.
14. Start genuine pilot jobs only after the M1 segment/cluster decision plus
    release and marketplace-eligible-supply gates sign off.

For implementation:

- Use test-driven vertical slices.
- Keep domain rules in services.
- Update BG/EN together.
- Update models, migrations, serializers, profile/admin exposure, frontend
  payloads, and tests together for signup/profile changes.
- Update [BUSINESS.md](../BUSINESS.md), [architecture.md](../architecture.md),
  [TGN.md](../TGN.md), [DEV.md](../DEV.md), [DEPLOY.md](../DEPLOY.md), and
  [CURRENT_PROGRESS.md](../CURRENT_PROGRESS.md) whenever the implemented
  behavior changes their source-of-truth statements.
- Run the full verification gate before each pilot release.

Stage 1 implementation is **not ready to begin as one undifferentiated epic**.
The policy items in Gate A and the assignment-history/scheduling architecture
decision must be resolved first. The public data leak and sensitive browser
storage issue may be fixed immediately as isolated security hotfixes.
