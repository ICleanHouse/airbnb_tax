# S1-D04 — Privacy, publication, processor, retention, and anonymization decision

| Field | Value |
|---|---|
| Status | **Owner-approved implementation contract — 2026-07-28** |
| Owner | Project owner / accountable privacy reviewer |
| Prepared | 2026-07-28 |
| Authority | `docs/STAGE_1_SOFIA_PILOT_PLAN.md` S1-D04; it supersedes implementation assumptions and older operational proposals |
| Current implementation | Publication opt-in/grace, opaque public identifiers, closure/anonymization, holds, dry-run cleanup and a fail-closed Geoapify production guard are implemented; production/provider and runtime evidence remain open |

This is a repository-grounded engineering and product decision package, not legal
advice. It separates current code, documented policy, recommendations, and
decisions that need an explicit owner selection. No existing implementation is
treated as approval merely because it exists.

## 1. Current inventory

### Account and contact data

| Category | Models/fields and location | Visibility and processors | Current deletion/retention | Decision gap |
|---|---|---|---|---|
| Account/contact | `accounts.User`: `email`, `phone_number`, `preferred_language`, `account_status`, `approved_at`, `email_verified_at`, `phone_verified_at`; `accounts.SignupEmailVerification`: email, code hash, token, expiry/attempts | Subject, authorized operator/admin; serializers exclude contact from public cleaners. No third-party processor except email delivery. | History-free user may be hard-deleted; protected history routes to support. No approved lifecycle expiry for verification challenges. | Final E02 phone/birth-date policy and expiry/erasure rule. |
| Password recovery | `accounts.recovery`, Django password-reset token (not stored); `notifications.NotificationEvent`/`NotificationDelivery`; `core.AuditLog` | Recipient, operators with authorized admin access; Resend is the configured mail processor. | Token is derived and single-use after password change; event/delivery history remains. | Delivery/audit period and processor deletion action. |
| Decision/evidence | `PilotEvidenceExclusion`, account transition/audit records and restricted internal notes | Admin/support only; never public. | Preserved with account records or `SET_NULL` audit actor relationship. | Case/audit period and hold rules. |

### Profiles and publication

| Category | Models/fields and location | Current public surface | Current deletion/retention | Decision gap |
|---|---|---|---|---|
| Cleaner profile | `CleanerProfile`: display name, bio, city/service areas, languages, preferences, experience, transport, image, rating summary; also private sex, age/birth date | `PublicCleanerSerializer` explicit projection used by `PublicCleanerViewSet`; tests `accounts/tests/test_public_cleaners.py` prove contact, birth date, sex and operational fields are absent. The projection currently includes internal `id` and `user_id`. | Profile cascades if the user is hard-deleted; protected-history users are currently support-routed. | Explicit opt-in/status, exact public allowlist, unpublish and redaction behavior; whether opaque public ID is permitted. |
| Reviews | `feedback.Review`: job, reviewer/reviewee, rating, comment, private note, private-issue flag | Public cleaner detail emits non-identifying `verified_host`, rating/comment/date only after double-blind visibility; tests prove job/reviewer/private-note absence. | Review is protected history; no public moderation/redaction projection. | Consent/publication, moderation/redaction, reviewer labels, post-unpublish display. |
| Agency | `AgencyProfile`, `AgencyMembership`, `AgencyInvitation` | Agency workspace is role protected; invitations/members are not public directory data. | Membership/invitation rows currently block self-service deletion. | Closure/tombstone treatment for representatives/members. |

### Property and operational data

| Category | Models/fields and location | Visibility and processors | Current deletion/retention | Decision gap |
|---|---|---|---|---|
| Properties/media | `properties.Property` (name, address, coordinate/location fields, instructions); `PropertyImage`; storage streaming views | Owner/admin full access; assigned participant gets minimum operational detail; raw `/media/*` denied and image stream is object-authorized. | Job/property relations preserve lineage; protected history blocks deletion. | Media retention/erasure following closure and backup expiry. |
| Calendar/reservations | `calendars` connections/import data and `Reservation` | Owner and authorized workflows only. | Operational records are retained with property/job history. | Period, closure exposure, external calendar removal procedure. |
| Marketplace | `CleaningJob`, `TurnoverLineage`, `CleanerApplication`, `Assignment`, price/schedule fields | Audience-specific serializer tiers in `marketplace.selectors/serializers`; anonymous sees canonical city/district aggregates only. | Lifecycle and lineage are deliberately immutable/protected under ADR-0001. | Period, tombstone identity, legal/support hold, and disclosure after closure. |

### Historical, support, and technical data

| Category | Models/fields and location | Visibility/processors | Current behavior | Decision gap |
|---|---|---|---|---|
| Recovery/disputes/incidents | `JobLifecycleEvent`, `ReplacementRequest`, `Dispute`, `DisputeUpdate`, incident/reschedule records | Participants receive safe status; raw case narrative is restricted to authorized staff. | Append-only/protected relationships; unresolved cases block deletion. | D03-20 proposes 5-year structured history and 24-month case narrative, but S1-D04 needs final cross-domain execution and hold rules. |
| Connections/messages | `connections.Connection`, `Message` | Counterpart participants only. | Any connection/message blocks self-service deletion. | D03-20 proposes 12 months; final trigger/anonymization and hold policy. |
| Notifications | `NotificationEvent`, `NotificationDelivery`, attempts, `Notification` | Recipient/admin as authorized; email processor receives localized delivery payload. | Events/deliveries currently block self-service deletion. | Delivery evidence period, Resend deletion/no-action, backup treatment. |
| Audit/logs/Sentry | `core.AuditLog` stores actor, action, entity, request ID, IP, user agent, metadata; request logging sanitizes endpoint/request IDs; Sentry integration is configured in `apps.core` | Operators/infrastructure only. | `AuditLog.actor` becomes null on user deletion; no approved expiry. | Audit/log/Sentry period, access, incident hold and deletion procedure. |
| Geoapify/geocoding | `locations` service/endpoints, cache; `GEOAPIFY_API_KEY` server-only | Approved host/admin → owned backend → `api-eu.geoapify.com`; browser has no key/direct provider call. | Raw responses are minimized/not persisted; raw addresses/coordinates excluded from logs/audit/Sentry by contract. | Processor/DPA, terms, budget, attribution, notice and production approval. |
| Cache/backups/browser | Django Redis/locmem cache; database/media backups; browser cookies and React memory | Cache is deployment infrastructure; browser recovery secrets are memory-only. | No approved backup expiry or cache data-class schedule. | Backup lifecycle, restore handling, cache TTLs, analytics/survey processor rule. |

## 2. Existing policy versus decision status

- **Implemented:** S1-E01 explicit anonymous, evaluator, assigned, history,
  public-cleaner/review, and media disclosure controls; S1-E10 backend proxy,
  minimization, no-store, fallback and throttles; S1-E08 generic reset and
  support-routed deletion eligibility.
- **Documented but not S1-D04-approved:** D03-20 proposes five-year structured
  history, 24-month case narrative, 12-month messages, legal holds and
  support-only closed-account access. Its execution is explicitly delegated to
  privacy work; it does not define field-level erasure/anonymization, backups,
  processors, or all data categories.
- **Unresolved:** publication consent/status/redaction, Geoapify production
  approval, and the complete retention/closure/anonymization matrix. Therefore
  no destructive migration, cleanup task, or account-history rewrite is authorized.

## 3. Owner decision package

### A. Public cleaner/review publication — recommended: approve with the following contract

Public directory/detail allowlist: display name, public profile image, voluntary
bio, native/other languages, city-level service areas, experience level,
voluntary extra services/transport fields, rating average and review count.
Do **not** publish phone/email, birth date/age/sex, exact availability, internal
or user IDs, job/property references, evidence, account status, or internal
notes. Replace `id`/`user_id` with an opaque public profile identifier if a
stable client key is necessary.

Publication must be a stored explicit opt-in, reversible through pause/unpublish.
Unpublish removes directory/detail/media projection immediately but preserves
protected transactional history. Publish only moderated/redactable review text;
show a non-identifying reviewer label (`verified_host`/`verified_cleaner`), never
job references. Redaction changes only the public projection, not the protected
underlying review/audit record. “Verified” remains contact-only wording, never
identity or quality verification.

Alternatives: (1) disable all public profile/review text for Stage 1; lowest
privacy risk but weakens discovery/trust; (2) publish current projection without
opt-in/moderation; not recommended because it lacks an explicit user choice and
redaction control.

**Approved:** Opt-in profiles; fixed 14-day public pause grace; no early removal
during that grace; immediate removal on formal closure. Full review text and
full account name are visible to all authenticated users only. Contacts, IDs,
job/property references and private notes remain excluded.

### B. Geoapify — recommended: approve the documented backend-only boundary for Stage 1

The browser sends exact search text or coordinates only to the owned API; the
backend sends the minimum request plus normal transport metadata to Geoapify EU.
The key is server-only, results are minimized and not persisted raw, and failure
keeps manual address/canonical-district entry available. Anonymous/pending/
rejected/suspended/ineligible users cannot invoke it. Existing documentation
records provider DPA/terms evidence but does not itself constitute acceptance.

Before production, record the selected plan/budget cap, DPA/terms version,
EU endpoint/data location assessment, provider retention/logging assessment,
attribution, notice wording, re-review owner/date, and an approved-host network
trace. Alternative: disable exact third-party geocoding; retain manual address
and district selection, eliminating this processor boundary.

**Approved:** Geoapify under this backend-only EU boundary, with production
enablement still conditional on the documented notice, budget, attribution,
terms/DPA record and authenticated browser trace.

### C. Retention, closure, and anonymization — recommended architecture

Use a policy version and a central retention classification, not model-local
ad-hoc deletion. History-free accounts may be hard-deleted after the approved
period. Accounts with protected history must be closed/anonymized: immediately
disable authentication/revoke sessions/unpublish; replace retained display
identity with a neutral tombstone; remove direct contact/birth-date/public media
when eligible; retain immutable operational relationships, review integrity,
safe audit evidence and non-personal financial context. Active obligations,
unresolved disputes and holds block execution. Each operation must be atomic,
idempotent, dry-run first, operator-authorized and free of personal data in
Celery arguments/audit metadata. Do not use fake shared emails or unsalted hashes
as anonymization.

Proposed periods below are **product recommendations requiring owner approval
and qualified legal review where indicated**, not asserted legal requirements.

| Category | Recommendation after closure/expiry | Action | Hold/backup/processor |
|---|---|---|---|
| Expired reset/challenge/cache state | 24 hours after expiry; cache TTL only | Delete temporary state | No backup-specific claim; processor event evidence follows notification period |
| History-free pending/closed account | 30 days | Hard delete after support/hold check | Backups age out on approved schedule |
| Public profile projection/media | Immediate unpublish; delete media within 30 days if no protected use | Remove projection/media | Backup expiry applies |
| Structured job/assignment/application/lineage/price | 5 years | Retain with tombstone identity | Legal/dispute/support hold overrides; backup expiry required |
| Dispute/incident/support narrative | 24 months after closure | Restrict then delete/redact narrative | Hold overrides; legal review required |
| Messages/connections | 12 months after closure | Restrict then delete/anonymize per counterpart need | Hold overrides |
| Reviews/public projection | 5 years underlying rating integrity; public projection withdrawn on unpublish | Tombstone identity; redact public text if moderated | Hold/review appeal rule needed |
| Notification events/delivery attempts | 24 months | Pseudonymize recipient linkage where feasible | Resend processor action/contract to record |
| Audit logs | 5 years | Retain action/opaque actor reference, remove direct contact payload | Security/incident hold overrides |
| Request logs/Sentry | 90 days recommended | TTL/delete | Sentry plan/config and incident hold need review |
| Geoapify raw/cached data | no persistence; cache only bounded TTL | Expire cache | Provider contract governs processor-side retention |
| Analytics/surveys | 12 months only with separate approved consent/processor | Delete/anonymize | No collection without approval |
| Database/media backups | 90 days approved | Immutable backup expiry, not immediate erasure | Restore must reapply closure queue; legal review required |

**Approved:** Recommended retention matrix and periods; anonymization for
protected-history accounts; legal/dispute/support holds overriding normal expiry;
and 90-day backup expiry with closure reapplication after restore. Platform
admins manage holds with audit evidence. Closed reviewers use a neutral tombstone
label.

## 4. Consequences after approval

Implementation batches will be: publication contract; Geoapify production guard
and notice; retention classifications/dry-run preview; atomic account closure
and tombstoning; scheduled cleanup; user/operator surfaces; migrations and
PostgreSQL/Redis/Celery/browser verification. Rollback cannot restore irreversibly
anonymized data; early batches must therefore ship dry-run/preview and explicit
operator confirmation before destructive execution.

## 5. Acceptance evidence required after approval

Serializer/media/log/audit/notification assertions, public unpublish/redaction
tests, provider boundary/fallback trace, retention dry-run, atomic/idempotent
closure tests, PostgreSQL concurrency, Redis/Celery cleanup, media/provider
cleanup, and seeded browser journeys. S1-D04 and policy-dependent S1-E08 work
remain incomplete until that evidence is recorded.

## 6. Implementation status — 2026-07-28

The approved contract is represented by `AccountRetentionHold`, the atomic
account-closure service, and a bounded cleanup task/preview command. Closure
immediately disables authentication, removes direct account/profile identifiers
and public projection, and retains protected relationships under a neutral
former-user identity. History-free closed accounts are eligible for physical
deletion only after 30 days and never while an active hold exists.

The Geoapify endpoint remains backend-only and fails closed in production unless
its explicit approval flag, attribution and budget configuration are all
present. This code guard does **not** prove a DPA/terms review, privacy notice,
budget approval, Redis/Celery delivery, provider smoke test, or authenticated
browser trace; those remain release evidence.
