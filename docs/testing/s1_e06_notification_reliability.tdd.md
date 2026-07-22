# S1-E06 Notification Reliability — TDD and Verification Record

**Date:** 2026-07-22  
**Implementation state:** complete  
**Stage tracker state:** In progress — PostgreSQL/Redis/provider runtime gates pending

## Scope and contract

S1-E06 implements in-app and email only. It does not add SMS, Viber,
WhatsApp, native push, WebSockets, payments, agency recovery parity, or an
automated reminder scheduler.

The authoritative version 1 event/recipient/channel contract is
[`docs/S1_E06_NOTIFICATION_MATRIX.md`](../S1_E06_NOTIFICATION_MATRIX.md). It
covers the implemented account, explicit matching/direct-offer, application,
assignment/delegation, S1-E05 direct recovery, completion/review,
connection/message, and operator-reminder events. Unresolved S1-D02 outcomes
and unsupported lifecycle transitions are explicitly reserved rather than
invented.

The pre-change, read-only inventory is
[`s1_e06_notification_reliability_maturity_audit.md`](s1_e06_notification_reliability_maturity_audit.md).

## TDD sequence

The work was developed in bounded red/green slices:

1. A failing model/service contract established durable events, per-channel
   deliveries, attempts, database uniqueness, and commit-only scheduling.
2. Failing delivery tests established replay safety, transient retry, final
   failure, one operator alert, safe errors, and localized rendering.
3. A failing matrix-parity test established every Stage 1 canonical event and
   Bulgarian/English template parity.
4. Failing health and routing tests established admin-only operational health
   and role-safe frontend deep links/fallbacks.
5. Domain wiring was added a bounded group at a time, with recovery/reminder
   recipient and rollback tests before the final integration pass.
6. A production-audit pass removed dormant direct email tasks and added a
   fail-closed test for ambiguous SMTP delivery results.

Representative commits preserve those red/green checkpoints:
`b09212c`, `e6409c4`, `de7a6d3`, `f0d219f`, `5ed546c`, `d881372`,
`b599c85`, `fc2cf80`, `125a8f5`, and `a65ab48`.

## Data and migration decisions

Migration `notifications/0003_notificationdelivery_notification_delivery_and_more.py`
is additive and keeps every pre-existing `Notification` valid:

- `NotificationEvent` is the recipient-specific canonical occurrence.
- `NotificationDelivery` is the unique event/channel delivery and holds only
  status, safe identifiers, safe source references, counters, and timestamps.
- `NotificationDeliveryAttempt` is the immutable attempt history with a unique
  `(delivery, attempt_number)` boundary.
- `OperatorNotificationAlert` is one-to-one with a terminally failed delivery,
  preventing recursive or duplicate alerts.
- Nullable one-to-one links connect new in-app rows to their event/delivery;
  legacy rows need no fabricated backfill.

The migration does not drop or reinterpret existing data. Runtime uniqueness
is enforced by the database, not an application-only `exists()` check.

## Deduplication and transaction boundary

For one recipient-specific event:

```text
event_key = SHA256(contract_version | event_type | recipient_id | occurrence_key)
delivery_key = SHA256(event_key | channel)
```

The occurrence key is defined per event in the matrix and is made from stable
persisted IDs/state-transition occurrences. It never contains an address,
contact detail, token, narrative, or provider payload.

`emit_notification_event()` validates the registry, recipient, safe metadata,
and safe relative destination, then atomically reserves the event, deliveries,
attempt-zero in-app result, and user-visible row. Only a newly created queued
email delivery registers `deliver_notification.apply_async()` with
`transaction.on_commit()`. A rollback therefore creates neither deliverable
state nor a broker call. Broker publication failure is recorded without
changing the already successful domain transition.

## Delivery, retry, and final failure

`deliver_notification(delivery_id)` loads and atomically claims queued or
retryable work under `select_for_update()`. Sent, skipped, final-failed, and
actively leased processing rows exit successfully. Each real claim creates one
attempt row.

- Permanent recipient/configuration/provider rejection fails on the first
  attempt.
- Transient failures retry at most four total attempts using bounded
  exponential backoff plus jitter.
- Unexpected exceptions are reduced to safe category/code values and reported
  to Sentry with delivery ID only; raw exception strings are not persisted.
- Exhausted or permanent failures create exactly one admin-visible
  `OperatorNotificationAlert` and a structured safe error log.
- Resend receives the delivery key as `Idempotency-Key`. Its documented
  provider window is 24 hours; the code uses a 23-hour safety margin for a
  stale claim. Plain Django SMTP and claims outside that window fail closed as
  `ambiguous_delivery_result` instead of risking a duplicate email.
- `_FakeTask` invokes the same claim/status/attempt state machine; it is not an
  idempotency bypass.

The Django mail adapter exists for local/test use. Resend is the required
pilot/production adapter because ordinary SMTP cannot provide external
idempotency.

## Privacy, localization, and routing

Event metadata is an explicit empty-by-default allowlist. The ordinary in-app
row contains only the validated `destination`; source IDs remain on restricted
operator records. Celery receives one delivery ID and an optional normalized
request-ID header.

Email content is rendered at delivery time from static Bulgarian/English
contract templates selected by persisted `User.preferred_language`; unsupported
or missing values fall back to Bulgarian. Subjects, bodies, logs, attempts,
alerts, and task arguments exclude exact addresses, entry details, guest data,
contacts, evidence, tokens, internal IDs, application/cancellation/incident/
dispute free text, provider secrets, provider bodies, and raw exceptions.

Only validated relative destinations below `/admin`, `/app`, `/host`, and
`/cleaner` are accepted. The frontend routing map revalidates canonical and
legacy values and returns a role-safe generic fallback for unknown event types.

## Domain wiring and reminders

The central service is called after successful state changes; it never owns or
rolls back domain state. The concrete delegated agency member receives
operational/completion/review events. The agency receives only the explicit
agency-level events in the matrix. Unsupported agency recovery continues to
return the existing safe `409` and emits nothing.

Upcoming-work reminders are staff-triggered through the existing job API. The
request supplies an occurrence timestamp; job, recipient, and occurrence form
the stable key. The host and concrete direct/delegated worker are the only
recipients, and replaying the same action returns the existing deliveries. No
Celery Beat schedule is deployed, so scheduler health is not applicable.

## Operator visibility

Django admin provides read-only event, delivery, attempt, and terminal-alert
inspection. The admin-only notification health API reports:

- worker ping state;
- broker/queue connectivity;
- oldest queued timestamp;
- queued, retryable-failed, and final-failed counts.

It returns no recipient address, domain narrative, or provider response. A
manual retry action was intentionally not added; operators inspect a failed
row and resolve/replay it through an approved support procedure without cloning
its key.

## Verification evidence

Completed on Windows with the repository's SQLite test configuration:

| Command | Outcome |
|---|---|
| `python manage.py makemigrations --check --dry-run` | PASS — no changes detected |
| `python manage.py migrate --plan` | PASS — additive marketplace `0009` and notifications `0003` shown for the unmigrated local DB |
| `python manage.py check` | PASS — 0 issues |
| `python manage.py test apps.notifications` | PASS — 27 tests; PostgreSQL-only claim test skipped |
| `python manage.py test apps.accounts` | PASS — 85 tests |
| `python manage.py test apps.marketplace` | PASS — 189 tests |
| `python manage.py test apps.feedback` | PASS — 37 tests |
| `python manage.py test` | PASS — 470 tests in 478.555s; 9 environment/engine-specific skips |
| Focused notification/domain reliability selections | PASS, including replay, transient retry then success, terminal alert once, rollback, reminder replay, recipient matrix, privacy, locale, and safe health |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd test -- components/notificationRouting.test.ts` | PASS — 4 tests |
| `npm.cmd test` | PASS — 16 files / 64 tests |
| `npx.cmd eslint components/NotificationBell.tsx components/notificationRouting.ts components/notificationRouting.test.ts` | PASS |
| `npm.cmd run lint` | BLOCKED by an unrelated generated duplicate `.next` tree under `frontend/CUsers...`; 214 generated-file errors and 10 warnings. Changed files pass targeted ESLint. The artifact was not deleted while a dev process may own `.next`. |

## Environment-gated evidence

- **PostgreSQL 16 concurrency:** UNVERIFIED. The test is present and guarded by
  `connection.vendor == "postgresql"`; it was correctly skipped under SQLite.
  Docker Desktop's engine was unavailable and no PostgreSQL listener existed
  on port 5432. SQLite results are not counted as row-locking evidence.
- **Live Redis/Celery/provider smoke:** UNVERIFIED. Docker Desktop's engine was
  unavailable and no Redis listener existed on port 6379, so the required solo
  worker smoke could not be run. Eager/local tests cover the same state machine
  but are not represented as live worker/provider proof.
- **Scheduler health:** not applicable. Automated reminders/Celery Beat are
  explicitly deferred; the operator-triggered reminder path is implemented.

## Deferred items and known limitations

- Phone/manual verification outcomes remain reserved pending S1-D02.
- Agency recovery parity, reschedule withdrawal/expiry, incident update, and
  unsupported offer-withdrawal transitions are not invented.
- Automated reminder scans and scheduler health are deferred.
- Signup-code email is a separate pre-account authentication flow backed by
  `SignupEmailVerification`; task arguments now contain only its stable ID.
- Production readiness remains gated on the two unverified runtime checks and
  real Bulgarian/English delivery through a verified Resend sender.

S1-E06 must remain **In progress** until the PostgreSQL 16 and live
Redis/Celery/provider checks pass; the skipped gates are not passing evidence.
