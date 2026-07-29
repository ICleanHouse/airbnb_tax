# ADR-0003: Open-live agency recovery and three-party reviews

**Date:** 2026-07-29
**Status:** accepted
**Decider:** Repository owner
**Approval:** explicit S1-D05 implementation instruction

## Decision

Stage 1 agencies are open-live: normally eligible agencies may sign up,
apply, accept work, and delegate an eligible member. This ADR supersedes only
ADR-0001's old agency-recovery deferral; its lineage, immutable assignment,
terminal-attempt, one-assignment, lock-order, and partial-unique invariants
remain unchanged.

An immutable delegated member may create an append-only release request. Only
the assigned agency resolves it. Cancellation and replacement use explicit
atomic lifecycle services: a cancelled source is retained and a host-authorized
successor is a new attempt in the same lineage. No PATCH or admin edit may
replace `assigned_member` on the source assignment.

`AGENCY_LIVE_RECOVERY_ENABLED` is fail-closed until migrations and PostgreSQL
concurrency evidence are deployed. When disabled, new agency recovery writes
return stable `409 agency_live_recovery_disabled` before mutation.

A completed delegated-agency attempt uses a `ReviewGroup` snapshot of host,
agency, and delegated member. Each participant may review each other
participant (six directed reviews). The group reveals to its three participants
after six submissions or review-window expiry. Direct and undelegated agency
work retains two-party reviews. Group-review records are not public.

## Consequences

- Recovery notifications include host, agency, delegated member, and operators.
- Group-review notifications include only group participants.
- Operators may read/audit/classify incidents and update disputes, but never
  impersonate a host or authorize a replacement.
- Payments, compensation, agency priority, and reassignment-in-place remain
  out of scope.
