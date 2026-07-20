# S1-D03 Lifecycle and Support Policy Contract

**Status:** approved  
**Last reviewed:** 2026-07-20  
**Architecture dependency:** [ADR-0001](adr/0001-turnover-lineage-recovery.md) — accepted  
**Accountable owner:** Repository owner  
**Approval reference:** Explicit owner approval in the Codex conversation on 2026-07-20

This file is the approved implementation policy for S1-E05. On 2026-07-20 the
repository owner explicitly approved every proposed default below. The same
owner is accountable for Stage 1, engineering, pilot operations, privacy
review, and incident adjudication until those responsibilities are delegated
in a later signed update.

## Fixed constraints supplied for S1-E05

- Use a dedicated `TurnoverLineage`.
- Preserve every job as a historical attempt and every accepted assignment on
  its original job.
- Never reopen a cancelled or failed attempt.
- Recovery creates a linked successor in the same lineage.
- Disputes remain orthogonal to job, completion, review, and rating state.
- Replace physical job deletion with an explicit lifecycle transition.
- Never overwrite agency member delegation.
- Agency recovery parity is deferred and S1-E05 remains Partially complete.
- Account de-identification is separate; S1-E05 owns only deletion blocking and
  support routing.
- Stage 1 uses operator-assisted workflows and minimal participant request or
  acknowledgement UI, not a general case-management platform.

## Blocking implementation decisions

| ID | Decision and affected transitions | Actors | Recommended default — not approved | Security or operational consequence | Required final owner decision | Owner | Final value / approval reference | Date |
|---|---|---|---|---|---|---|---|---|
| D03-01 | Cancellation authority: `draft/open/assigned -> cancelled` | Host, assigned cleaner, admin | Owner/admin cancel; direct individual assignee cancels with mandatory reason | Too little authority traps schedules; too much permits unauthorized cancellation | Approve the actor/status matrix and immediate-cancel versus release-request behavior | Repository owner | Approved proposed default; direct individual cancellation is immediate — Codex conversation approval | 2026-07-20 |
| D03-02 | Cancellation reason taxonomy | Host, cleaner, admin | Versioned neutral reason codes plus optional restricted note | Poor categories weaken support; narrative can leak | Approve exact codes, required notes, and participant-visible wording | Repository owner | Approved codes: `host_change`, `property_unavailable`, `cleaner_unavailable`, `illness`, `safety`, `access`, `no_show`, `scheduling_error`, `other`; reason required, restricted note optional — Codex conversation approval | 2026-07-20 |
| D03-03 | Cancellation notice bands | All cancellation actors/operator | Proposed `>=48h`, `24-<48h`, `<24h`, `after_start`, Europe/Sofia | Changes urgency, metrics, and support promises | Approve exact boundaries and clock semantics | Repository owner | Approved exact bands using absolute instants with Europe/Sofia presentation — Codex conversation approval | 2026-07-20 |
| D03-04 | Assigned-cleaner release | Direct individual assignee, host, admin | Immediate direct cancellation with notification and interval release | Approval delay can leave false availability; immediate action surprises host | Choose cancellation versus request/acknowledgement and escalation | Repository owner | Approved immediate cancellation, interval release, and host/operator notification — Codex conversation approval | 2026-07-20 |
| D03-05 | Reschedule consent | Host, direct assignee, admin | Either participant proposes; counterpart accepts/declines; proposer withdraws | Unilateral changes can cause unsafe access or overlap | Approve proposer, acceptor, admin authority, and post-acceptance rules | Repository owner | Approved proposed counterpart-consent rule; admin requires recorded authority — Codex conversation approval | 2026-07-20 |
| D03-06 | Proposal expiry | Host, direct assignee, admin | Proposed `min(created + 24h, start - 2h)` | Stale acceptance creates operational risk | Approve duration, cutoff, and expired-record behavior | Repository owner | Approved `min(created_at + 24h, scheduled_start - 2h)`; expired records remain history — Codex conversation approval | 2026-07-20 |
| D03-07 | No-show grace | Host, direct assignee, admin | Proposed 15 minutes after scheduled start | Too short creates false reports; too long delays recovery | Approve exact grace, clock source, and notice-band variation | Repository owner | Approved 15 minutes after the stored scheduled-start instant with no notice-band variation — Codex conversation approval | 2026-07-20 |
| D03-08 | Dispute categories, visibility, and outcomes | Host, direct assignee, admin | Restricted narratives; safe status summary only | Allegation, address, and access-detail disclosure risk | Approve categories, audiences, updates, resolution and dismissal codes | Repository owner | Approved categories `safety`, `access`, `quality`, `damage`, `privacy`, `conduct`, `schedule`, `other`; admin-only raw narrative and participant-safe status summary — Codex conversation approval | 2026-07-20 |
| D03-09 | Dispute filing window | Host, direct assignee, admin | Proposed seven calendar days after completion/cancellation/incident | Short window suppresses cases; long window expands retention burden | Approve duration and admin override. Do not reuse the 14-day review window | Repository owner | Approved seven absolute days with documented admin override; review window remains separate — Codex conversation approval | 2026-07-20 |
| D03-10 | Replacement eligibility | Host, direct assignee, admin | Cancelled and incomplete source with qualifying incident; completed source excluded | Loose eligibility can duplicate work or alter completion evidence | Approve source states/incidents and completed-job policy | Repository owner | Approved cancelled, incomplete source plus qualifying incident; completed attempts excluded — Codex conversation approval | 2026-07-20 |
| D03-11 | Host replacement authorization | Host, operator/admin | Host request authorizes; operator-created request needs host approval | Operator must not impersonate or commit the host | Approve authorization evidence and standing pre-authorization policy | Repository owner | Approved host-created authorization; operator-created requests require later host approval; no standing pre-authorization — Codex conversation approval | 2026-07-20 |
| D03-12 | Emergency replacement approver | Host, operator/admin | Host approves; admin only with host request or valid pre-authorization | Overbroad admin authority can create unrequested work | Name approvers and permitted override | Repository owner | Approved host approval; admin only for a host-created request or documented unexpired pre-authorization — Codex conversation approval | 2026-07-20 |
| D03-13 | Replacement expiry | Host, operator/admin | Proposed `min(request + 4h, source end)` | Stale recovery can create unusable work | Approve duration, cutoff, and urgent/standard variation | Repository owner | Approved `min(requested_at + 4h, source scheduled_end)` with no cohort variation — Codex conversation approval | 2026-07-20 |
| D03-14 | R17/actionable states | All actors | `draft/open/assigned` actionable; `completed/cancelled` historical; one actionable exact slot and lineage | Irreversible constraint change after same-slot history exists | Formally approve ADR-0001 and both partial uniqueness rules | Repository owner | Approved ADR-0001 and both PostgreSQL partial uniqueness rules — Codex conversation approval | 2026-07-20 |
| D03-15 | Agency recovery boundary | Agency/member, host, admin | Agency-backed reschedule/replacement unsupported; stable 409 before mutation | Partial parity can overwrite member history or expose the wrong participant | Confirm deferral now and define a future separate support path | Repository owner | Approved deferral; unsupported agency recovery returns `agency_recovery_not_supported` before mutation — Codex conversation approval | 2026-07-20 |
| D03-16 | Support channel, hours, response, emergency limits | All participants/operator | Proposed one channel, 08:00-20:00 Sofia, two staffed hours, no emergency guarantee | Unsupported promises create safety risk | Name channel, hours, response target, escalation owner, limitation copy | Repository owner | Approved configurable monitored support email, 08:00–20:00 Europe/Sofia daily, two staffed-hour target, repository owner escalation, no emergency-service guarantee — Codex conversation approval | 2026-07-20 |
| D03-17 | Account-deletion blockers and support route | Host, cleaner, agency, support | Block actionable jobs, incomplete assignments, pending recovery, unresolved disputes; route history to support | Current deletion cascades marketplace history | Approve blocker query and support outcome with privacy reviewer | Repository owner | Approved active-obligation blocker and support routing for any protected marketplace history; no de-identification in S1-E05 — Codex conversation approval | 2026-07-20 |
| D03-18 | Incident categories, severity, adjudicator | Host, cleaner, admin/operator | Versioned `critical/major/standard`; operator classifies | User-selected severity is abusable; automation can be unsafe | Approve matrix, adjudicator, and escalation path | Repository owner | Approved versioned `critical`, `major`, `standard`; operator classifies and repository owner adjudicates critical incidents — Codex conversation approval | 2026-07-20 |
| D03-19 | Lifecycle API throttling | Authenticated lifecycle actors/admin | Proposed 30 lifecycle writes/hour and 10 incident/dispute creates/hour | No limit permits spam; strict limits block urgent help | Approve scoped limits and operator bypass | Repository owner | Approved 30 lifecycle writes/hour and 10 incident/dispute creations/hour per user; platform admins bypass — Codex conversation approval | 2026-07-20 |
| D03-20 | Retention | Participants, admin, privacy reviewer | Proposed five-year structured history, 24-month case narrative, 12-month messages | Premature purge loses truth; excess retention increases exposure | Approve per-model periods, holds, anonymization, and closed-account access | Repository owner | Approved five-year structured lifecycle history, 24-month closed case narrative, 12-month messages, legal holds, and support-only closed-account access; execution belongs to privacy Batch 6 — Codex conversation approval | 2026-07-20 |

## Pilot and launch decisions

| ID | Decision | Recommended default — not approved | Required final owner decision | Owner | Final value / approval reference | Date |
|---|---|---|---|---|---|---|
| D03-21 | Operational-success evidence and schedule tolerance | Affirmative host outcome; proposed +/-30 minutes | Approve evidence sources and exact tolerance | Repository owner | Approved affirmative host outcome and +/-30 minutes — Codex conversation approval | 2026-07-20 |
| D03-22 | Activation window | Proposed 14 days | Approve fixed pre-launch window | Repository owner | Approved 14 days — Codex conversation approval | 2026-07-20 |
| D03-23 | Match-mode precedence and organic threshold | Prior targeted outreach makes response non-organic; proposed 40% within 24h | Approve precedence and threshold | Repository owner | Approved precedence and 40% within 24 hours — Codex conversation approval | 2026-07-20 |
| D03-24 | Operator-time formula | All recurring minutes / operational successes; proposed maximum 15 minutes | Approve included activity and threshold | Repository owner | Approved formula and 15-minute maximum — Codex conversation approval | 2026-07-20 |
| D03-25 | Host cancellation after supply exposure | Keep lineage in denominator with outcome/reason | Formally approve measurement rule | Repository owner | Approved retention in denominator with outcome and reason — Codex conversation approval | 2026-07-20 |

## Approval checklist

- [x] Repository owner is the accountable Stage 1 owner.
- [x] Repository owner is the accountable engineering owner.
- [x] Repository owner is the pilot operator and backup until delegated.
- [x] Repository owner is the accountable privacy/legal reviewer for this product decision.
- [x] Repository owner is the incident adjudicator and escalation owner until delegated.
- [x] Every D03 row has a final value, accountable owner, approval reference, and date.
- [x] ADR-0001 is accepted by its decider.
- [x] Agency recovery remains explicitly deferred and unsupported.

## Engineering handoff

Batch 2 is authorized to begin with tests and the
expand/backfill/validate/constrain migration sequence. Later reschedule,
incident, replacement, dispute, messaging, and de-identification batches remain
separate reviewable work.
