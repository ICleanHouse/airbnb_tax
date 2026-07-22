# S1-E06 Notification Event Matrix

**Contract version:** 1.0  
**Status:** implementation contract  
**Channels:** `in_app`, `email` only  
**Default locale:** Bulgarian (`bg`), with English (`en`) parity

## Contract rules

1. A canonical event is one recipient-specific occurrence. It is persisted
   with a deterministic SHA-256 key derived from contract version, canonical
   event name, persisted recipient ID, and the occurrence key below.
2. Every configured channel has one delivery row, protected by a database
   unique constraint. Re-emission returns the existing event/deliveries.
3. In-app creation is atomic with event persistence. Email dispatch is
   registered only with `transaction.on_commit()` and receives only the
   delivery ID plus the normalized request ID in Celery headers.
4. The only ordinary in-app metadata key is `destination`. Source entity type
   and ID live on the restricted event/delivery record, not in user-visible
   metadata, task arguments, provider payload metadata, audit metadata, or
   logs.
5. Destinations are validated relative URLs under `/admin`, `/app`, `/host`, or
   `/cleaner`; schemes, hosts, credentials, fragments, protocol-relative URLs,
   and unapproved query keys are rejected. Role-specific generic fallbacks are
   used when a detailed authorized screen is unavailable.
6. Subjects and preview bodies are generic. They never contain property/address
   text, access instructions/codes, guest data, contact details, evidence,
   tokens, internal IDs, application/cancellation/incident/dispute narratives,
   or provider error text.
7. Recipient language is read from persisted `User.preferred_language` when
   the event is created. Unsupported/missing values fall back to `bg`.
8. Email delivery uses at most four total attempts with bounded exponential
   backoff and jitter for transient failures. Permanent failures are final on
   the first attempt. A final failure creates one non-recursive operator alert.
9. Inactive/missing recipients and missing email addresses are recorded as
   `skipped`; they are not silently discarded.
10. There is no broad unsolicited job broadcast. Every work invitation has one
    explicit host offer or operator source and one persisted eligible recipient.

## Safe templates

Each canonical name below has complete `bg` and `en` in-app title/body and email
subject/body templates in the server-side contract registry. Email uses one
generic HTML wrapper and a validated authenticated destination. Event fields
are not interpolated into preview text in v1.

## Event → recipient → channel matrix

`Both` means one in-app delivery and one email delivery. `In-app` means no
email delivery is required for that event.

| Domain occurrence | Canonical event name | Triggering service/source | Recipients and eligibility | Channels | Safe destination | Deduplication occurrence key | Repetition | Final-failure action |
|---|---|---|---|---|---|---|---|---|
| Account created / operator review record | `account.created_operator_review` | Signup creation after pending base and reconciliation | Every persisted active `role=admin` or staff user; never an arbitrary address list | Both | `/admin` | new user ID + operator recipient ID + contract version | Once per account/operator | Operator alert identifies delivery/source IDs only |
| Account approved/reconciled | `account.approved` | `reconcile_contact_verification` | Transitioned user, including email-only interim-policy users | Both | `/app` or role dashboard | user ID + transition version | Once per effective transition version | Operator checks delivery and account state |
| Account rejected | `account.rejected` | `reject_account` | Rejected user | Both | `/app` | user ID + transition version | Once under current terminal policy | Operator contacts user through approved support route if needed |
| Account suspended | `account.suspended` | `suspend_account` | Suspended user | Both | `/app` | user ID + transition version | Once under current transition contract | Operator inspects suspension and delivery state |
| Cleaner marketplace access activated | `cleaner.marketplace_access_activated` | `reconcile_contact_verification` | Cleaner whose persisted legacy state moved pending → eligible | Both | `/cleaner` | cleaner-profile ID + transition version | Once per effective transition version | Operator verifies saved state; no identity claim |
| Future phone/manual verification outcome | reserved; not emitted | Future S1-D02 service only | None until S1-D02 defines states/actors/retention | — | — | — | — | Do not invent outcomes |
| Host-targeted eligible work | `offer.received` | Existing `offer_job` direct offer | Explicit persisted cleaner/agency that passes current workable checks | Both | cleaner: `/cleaner?section=jobs`; agency: `/app` | application ID + pending `updated_at` | Permitted after a prior terminal offer; each occurrence has a new timestamp key | Operator inspects offer/delivery; no job broadcast |
| Operator matching invitation | `matching.operator_invitation` | New explicit operator service/API | One active approved marketplace-eligible cleaner; source job must remain eligible | Both | `/cleaner?section=jobs` | job ID + cleaner ID + operator-provided occurrence token | Repeat only with a new explicit occurrence token | Operator follows up manually |
| Application submitted | `application.submitted` | `submit_application` | Owning active approved host | Both | `/host?section=applications&appFilter=pending` | application ID + submitted `updated_at` | Permitted after withdrawn application is re-opened | Operator inspects host delivery |
| Application accepted / assignment created | `assignment.created` | `accept_application` | Accepted applicant account; agency remains agency-level until delegation | Both | cleaner: `/cleaner?section=assignments`; agency: `/app` | assignment ID | Once per assignment | Operator checks assignment and recipient |
| Competing/manual application rejected | `application.rejected` | `accept_application` bulk outcome or `reject_application` | Each newly rejected applicant; unrelated users receive nothing | Both | cleaner: `/cleaner?section=applications`; agency: `/app` | application ID + rejected `updated_at` | Once per rejection occurrence | Operator may contact applicant through support |
| Application withdrawn | `application.withdrawn` | `withdraw_application` for cleaner-originated application | Owning host | Both | `/host?section=applications&appFilter=pending` | application ID + withdrawn `updated_at` | Permitted after a later re-open/new occurrence | Operator inspects host delivery |
| Direct offer accepted | `offer.accepted` | `accept_offer` | Owning host; assignee separately receives `assignment.created` | Both | `/host?section=applications&appFilter=active` | application ID + assignment ID | Once | Operator checks assignment/delivery |
| Direct offer declined | `offer.declined` | `decline_offer` | Owning host | Both | `/host?section=applications` | application ID + rejected `updated_at` | Once per decline occurrence | Operator may assist matching |
| Direct offer withdrawn by host | reserved; not emitted | No current lifecycle service/API | None | — | — | — | — | Deferred; do not infer from application withdrawal |
| Agency member delegated | `assignment.member_delegated` | `assign_member_to_assignment` | Concrete eligible member; agency is the actor and gets no duplicate | Both | `/cleaner?section=assignments` | assignment ID + immutable member ID | Once; identical delegation replay returns existing assignment | Operator checks immutable delegation |
| Other assignment participant change | reserved; not emitted | No supported normal reassignment path | None | — | — | — | — | Agency replacement parity remains unsupported |
| Job cancelled | `job.cancelled` | `cancel_job` | Host and direct cleaner/delegated member except the actor; platform-admin action notifies both | Both | role dashboard generic job/assignment section | cancellation lifecycle-event ID + recipient ID | Once per terminal cancellation | Operator runs cancellation/recovery follow-up |
| Reschedule proposed | `job.reschedule_proposed` | `propose_reschedule` | Direct counterpart only | Both | role dashboard generic job/assignment section | proposal ID + recipient ID | Once per proposal | Operator assists before expiry |
| Reschedule accepted | `job.reschedule_accepted` | `respond_to_reschedule_proposal` | Proposer; actor already sees API result | Both | role dashboard generic job/assignment section | proposal ID + accepted status | Once | Operator verifies revised schedule |
| Reschedule declined | `job.reschedule_declined` | `respond_to_reschedule_proposal` | Proposer | Both | role dashboard generic job/assignment section | proposal ID + declined status | Once | Operator assists matching/recovery if needed |
| Reschedule withdrawn | reserved; not emitted | No current withdrawal service/API | None | — | — | — | — | Deferred without inventing a transition |
| Reschedule expired | reserved; not emitted automatically | Current code has no persisted expiry scheduler/service | None | — | — | — | — | Deferred; if added, use proposal ID + expired status |
| Attendance/no-show incident created | `job.incident_reported` | `report_job_incident` | Active platform operators plus the direct counterpart; content remains private/admin-only | Both | operators: `/admin`; participant: role dashboard | incident ID + recipient ID | Once per incident | Operator opens restricted case record |
| Incident updated/classified | reserved; not emitted | No current update/classification service/API | None | — | — | — | — | Deferred until a real transition exists |
| Dispute opened | `dispute.opened` | `file_dispute` | Active platform operators and direct counterpart; never narrative/category in preview | Both | operators: `/admin`; participant: role dashboard | dispute ID + recipient ID | Once | Operator opens restricted dispute record |
| Dispute status changed | `dispute.status_changed` | `update_dispute` when status changes | Host and direct cleaner/delegated member except acting operator | Both | role dashboard generic history section | dispute-update ID + recipient ID + status | Once per persisted status update | Operator confirms participant delivery |
| Replacement requested / host authorization needed | `replacement.authorization_requested` | `create_replacement_request` by non-host operator/participant | Host | Both | `/host?section=applications` | replacement-request ID + pending status | Once | Operator follows up before expiry |
| Replacement draft created/authorized | `replacement.draft_created` | Host-created request or accepted `authorize_replacement_request` | Direct counterpart and requester except actor; no agency path | Both | host job section / cleaner assignments | replacement-request ID + successor ID + recipient ID | Once | Operator verifies draft and next host action |
| Replacement declined | `replacement.declined` | `authorize_replacement_request(..., accept=False)` | Original requester | Both | role dashboard generic history section | replacement-request ID + declined status | Once | Operator closes/follows up case |
| Replacement withdrawn/other advancement | reserved; not emitted | No current service/API | None | — | — | — | — | Deferred; never overwrite agency delegation |
| Job completed | `job.completed` | `complete_job` | Host | Both | `/host?section=applications&appFilter=completed` | job-completed lifecycle-event ID | Once | Operator checks completion delivery |
| Review requested after completion | `review.requested` | `complete_job` | Host and concrete assigned cleaner member; never agency account after delegation | In-app | Existing authorized `reviewJob` destination | job ID + reviewee ID + completion occurrence | Once per party/completion | Operator can remind manually |
| Counterpart review prompt | `review.requested` | `submit_review` first public review | Counterpart review party | In-app | Existing authorized `reviewJob` destination | review ID + reviewee ID | Once per submitted review | Operator may assist before window close |
| Reviews revealed/unlocked | `review.revealed` | `submit_review` completing public pair | Host and concrete assigned cleaner member | In-app | Existing authorized completed/review destination | second review ID + recipient ID | Once per recipient | No email escalation; in-app delivery remains inspectable |
| Operator upcoming-work reminder | `job.upcoming_reminder` | New admin-only reminder API/service | Host and concrete assigned cleaner/delegated member on one active assignment | Both | role dashboard generic job/assignment section | job ID + normalized reminder occurrence instant + recipient ID | Repeat only for a different occurrence instant | Operator contacts participant through approved support route |
| Connection request | `connection.requested` | `request_connection` | Eligible addressee | In-app | Connections drawer destination contract | connection ID + pending `updated_at` | Permitted after terminal connection is reopened | Operator alert only if in-app persistence fails before commit |
| Connection accepted | `connection.accepted` | `accept_connection` | Eligible requester | In-app | Connections drawer destination contract | connection ID + accepted `updated_at` | Once per acceptance occurrence | Same as above |
| Message received | `message.received` | `send_message` | Eligible counterpart | In-app | Connections drawer destination contract | message ID | Once per message | Body is generic; message text stays in authorized chat only |

## Retry and failure classification

| Category | Examples | Retry? |
|---|---|---|
| `transient_network` | timeout, connection reset, temporary DNS/provider 5xx | Yes |
| `provider_throttled` | HTTP 429 | Yes |
| `provider_rejected` | provider 4xx other than transient statuses | No |
| `provider_configuration` | missing/invalid sender or provider key | No |
| `recipient_unavailable` | blank/invalid persisted email | No; record `skipped` or final according to event contract |
| `queue_unavailable` | broker publish failure after commit | Keep queued; structured operator-visible health signal |
| `unexpected` | uncategorized exception | Retry to bounded exhaustion and capture sanitized Sentry event |

Attempt rows contain only category/code, attempt number, timestamps, and a
provider-safe message identifier. They never contain exception strings,
provider response bodies, addresses, email addresses, user text, or payloads.

## Reminder decision

Stage 1 uses an operator-triggered reminder endpoint. No Celery Beat service or
automated scan is introduced. The normalized occurrence instant is required
and is part of the deduplication key, so repeating the same operator action is
idempotent. Scheduler health is therefore **not applicable** for contract v1.0.

## Explicit deferrals

- Phone/manual cleaner/agency verification outcomes remain blocked by S1-D02.
- Reschedule withdrawal/automatic expiry, incident update/classification,
  replacement withdrawal, and direct-offer host withdrawal have no current
  domain transition and are not invented by S1-E06.
- Agency-backed recovery remains `agency_recovery_not_supported` and emits no
  misleading recovery notification after the safe 409.
- SMS, Viber, WhatsApp, native push, WebSockets, automated broad job broadcasts,
  and Celery Beat are outside this contract.
