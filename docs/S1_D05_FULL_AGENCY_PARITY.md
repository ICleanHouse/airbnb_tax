# S1-D05 — Full Agency Parity

**Implementation decision:** 2026-07-27  
**Status:** implemented in code; ADR-0003 adds open-live recovery and group
reviews. Launch evidence remains gated by S1-E02 phone verification, S1-O03
operator-confirmed supply availability, PostgreSQL concurrency proof, and
notification runtime smoke.

## Boundary

Stage 1 agencies use a representative account and a public agency name. There
is no company registration, UIC/VAT collection, registry lookup, payment,
payout, billing, SMS-provider, or legal-document workflow in this decision.

## Readiness and privacy

An agency is marketplace-ready only when its account/contact state is eligible,
its profile has a public name, `Sofia`, and one or more service areas, and it
has an active separately eligible cleaner member. The API exposes only these
stable blockers: `account_not_eligible`, `contact_not_verified`,
`profile_incomplete`, and `no_eligible_active_member`.

Invitations select an existing public-directory cleaner by ID. They never take
or return email, phone, token, username, birth date, or other account contact
data. Membership is non-exclusive. A revoke/leave immediately prevents future
selection, but preserves all historical assignments, recovery authority, work
completion and review rights.

## State and authority

```
invitation: pending -> accepted | declined | revoked | expired | superseded
membership: active <-> revoked (a new invitation is required to reactivate)
application/offer: pending -> member_selected -> accepted assignment
assignment: agency + immutable assigned_member
```

The agency chooses an active eligible member while an agency application or
offer remains pending. Host/offer acceptance locks and rechecks that member and
creates the single member-bound assignment. New agency assignments are never
undelegated; only legacy assignments retain the controlled initial
`assign-member` path.

For agency-backed work, host and agency may cancel, reschedule, request or
authorize replacement, and file disputes. The assigned member may report an
incident, complete work, and review. Replacement is a new lineage-linked draft:
the original assignment and assigned member are never changed. Reviews are
only host <-> actual assigned member.

## Stable errors

Validation failures use 400, known forbidden actions use 403, hidden objects
use 404, and readiness/invitation/membership/member-selection/immutability or
schedule conflicts use 409. Relevant codes include
`agency_marketplace_ineligible`, `agency_member_selection_required`,
`agency_member_ineligible`, and `agency_membership_inactive`.

## Release evidence still required

- PostgreSQL transaction tests for invitation creation, membership revocation
  versus selection/acceptance, and concrete-worker overlap.
- Redis/Celery/provider notification smoke and delivery evidence.
- Full authenticated browser journeys and accessibility checks.
- S1-E02 and S1-O03 operator-confirmed supply-availability launch gates. This
  concierge activation control does not add persisted cleaner availability or
  work-preference fields.
