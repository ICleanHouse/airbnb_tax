# S1-E06 Notification Reliability Maturity Audit

**Date:** 2026-07-22  
**Scope:** Read-only baseline before S1-E06 production changes  
**Channels reviewed:** in-app and email only

## Executive finding

The repository has a usable owner-scoped in-app notification feed and several
working email tasks, but it does not yet have a reliable notification delivery
loop. A nullable unique key protects only selected `Notification` rows. There
is no canonical event record, per-channel delivery state, attempt history,
atomic worker claim, final-failure alert, worker-health surface, or provider
idempotency boundary. The existing marketplace Resend emails also copy
property/job/application narrative into email content, contrary to the S1-E06
privacy contract.

## 1. Existing `Notification` model

`backend/apps/notifications/models.py:7-34` defines one user-visible row with:

- recipient FK (`user`);
- `notification_type`;
- channel choices `in_app`, `email`, and legacy/planned `sms`;
- rendered `title`, `body`, unrestricted JSON `metadata`;
- `read_at`, `sent_at`, and timestamps;
- nullable globally unique `deduplication_key`.

The schema originated without deduplication
(`backend/apps/notifications/migrations/0001_initial.py:16-60`); migration
`0002` added a nullable unique column
(`backend/apps/notifications/migrations/0002_notification_deduplication_key.py:8-18`).
Existing rows require no backfill because null remains valid.

There are no status, attempt count, last-attempt, final-failure, provider ID,
source-entity, request-correlation, delivery-attempt, or event-contract fields.
There is no constraint limiting new reliability work to in-app/email, and
`sms` remains an unused model choice.

## 2. Existing notification creation services

- `create_notification` creates a row directly, or uses `get_or_create` only
  when a caller supplies a key (`backend/apps/notifications/services.py:11-42`).
- `create_notification_once` always uses a supplied key
  (`backend/apps/notifications/services.py:45-65`).
- Both accept arbitrary rendered text and arbitrary metadata. Neither validates
  an event registry, recipient eligibility, locale, destination, privacy
  allowlist, transaction boundary, or channel requirement.
- The `get_or_create` calls rely on the database unique constraint for the
  final race boundary, but a conflicting key with different recipient/event
  data silently returns the old row.
- Only the account transition helper supplies stable keys and registers an
  `on_commit` callback (`backend/apps/accounts/services.py:77-101`). The
  dispatched task is currently a placeholder.

## 3. Celery tasks and retry behavior

`backend/apps/notifications/tasks.py` contains:

| Task | Lines | Behavior | Retry/idempotency baseline |
|---|---:|---|---|
| `dispatch_notification` | 44-47 | Returns the notification ID; performs no delivery | No retry or state transition |
| `send_admin_new_account_email` | 50-115 | Django `send_mail` to all active admin/staff addresses | `max_retries=3`, fixed 60 seconds; replay sends again |
| `send_account_confirmation_email` | 118-205 | Legacy Django `EmailMultiAlternatives` confirmation link | `max_retries=3`, fixed 60 seconds; replay sends again |
| `send_application_submitted_email` | 240-333 | Loads application and sends through Resend | `max_retries=3`, fixed 60 seconds; replay sends again |
| `send_job_completed_email` | 336-424 | Loads job and sends through Resend | `max_retries=3`, fixed 60 seconds; replay sends again |
| `send_signup_email_code` | 427-479 | Loads verification and sends code through Resend | `max_retries=3`, fixed 60 seconds; raw code is a task argument |

All retrying tasks catch every exception and call `self.retry`; they do not
classify transient versus permanent provider/configuration/recipient failures.
No attempt is persisted before a retry, and exhausted retries do not create an
operator alert. The helper fallback supports `.delay()` and `.apply()` but not
`.apply_async()` and simply re-raises from `retry`
(`backend/apps/notifications/tasks.py:8-38`), so it cannot exercise a bounded
scheduled-retry state machine.

Celery request IDs are propagated into headers and worker lifecycle logs by
`backend/config/celery.py:20-85`, but notification task logs do not contain a
delivery ID, channel, attempt number, or safe result. Global retry/failure logs
place stringified exceptions in `metadata` (`backend/config/celery.py:60-84`);
the JSON formatter drops metadata from emitted JSON, but the raw logging record
still contains the value.

## 4. Email providers

- Django mail backend: admin-new-account and legacy confirmation tasks use
  `send_mail` / `EmailMultiAlternatives`
  (`backend/apps/notifications/tasks.py:58-60,102-109,120-123,190-199`).
- Resend: `_send_resend_email` posts JSON to the Resend API
  (`backend/apps/notifications/tasks.py:208-237`). Signup codes, application
  submission, and completion call it at lines 316-323, 411-418, and 462-469.
- The Resend helper discards the provider response and does not set a provider
  idempotency key. Its HTTP error includes the complete provider body in a new
  exception (`backend/apps/notifications/tasks.py:235-237`).
- Provider/configuration selection is path-specific rather than channel-
  specific. Documentation consequently disagrees about whether marketplace
  emails use Resend or Django mail.

## 5-7. Current triggers, side effects, and transaction boundaries

| Trigger | Current side effect | Exact source | Transaction/dispatch boundary |
|---|---|---|---|
| Signup email-code requested | Resend email | `backend/apps/accounts/views.py:107-124` | Verification row is autocommitted before direct `.delay()`; raw code is passed to broker |
| Account created | Django email to admins | `backend/apps/accounts/views.py:72-103` | Signup serializer's atomic create has returned before direct `.delay()`; no durable event |
| Account approved | Deduped in-app row; placeholder dispatch | `backend/apps/accounts/services.py:171-202` | Created inside atomic reconciliation; real dispatch registered with `on_commit` |
| Cleaner access activated | Deduped in-app row; placeholder dispatch | `backend/apps/accounts/services.py:204-241` | Created inside atomic reconciliation; real dispatch registered with `on_commit` |
| Account rejected | Deduped in-app row; placeholder dispatch | `backend/apps/accounts/services.py:250-309` | Created inside atomic service; placeholder dispatch registered with `on_commit` |
| Account suspended | Deduped in-app row; placeholder dispatch | `backend/apps/accounts/services.py:312-374` | Created inside atomic service; placeholder dispatch registered with `on_commit` |
| Connection requested | In-app row | `backend/apps/connections/services.py:55-99` | Created synchronously inside atomic domain transaction; no dispatch task |
| Connection accepted | In-app row | `backend/apps/connections/services.py:102-133` | Created synchronously inside atomic domain transaction; no dispatch task |
| Message sent | In-app row containing an 80-character message preview | `backend/apps/connections/services.py:174-210` | Created synchronously inside atomic domain transaction; no dispatch task |
| Job cancelled | In-app rows for non-actor participants | `backend/apps/marketplace/services.py:320-446` | Created synchronously inside atomic domain transaction; no email or delivery state |
| Reschedule proposed | Deduped in-app row for counterpart | `backend/apps/marketplace/services.py:486-519` | Created synchronously inside atomic domain transaction; no outcome notifications |
| Application submitted | In-app row plus Resend host email | `backend/apps/marketplace/services.py:754-830` | In-app row is inside atomic service; email `.delay()` uses `on_commit` |
| Application accepted / assignment created | In-app row for applicant | `backend/apps/marketplace/services.py:833-920` | Created synchronously inside atomic domain transaction; competing rejections use bulk update without notifications |
| Application rejected | In-app row for applicant | `backend/apps/marketplace/services.py:923-958` | Created synchronously inside atomic domain transaction |
| Application withdrawn | In-app row for host | `backend/apps/marketplace/services.py:961-999` | Created synchronously inside atomic domain transaction |
| Job completed / review requested | Two in-app review prompts plus Resend host email | `backend/apps/marketplace/services.py:1002-1090` | Rows are inside atomic service; email `.delay()` uses `on_commit`; agency path targets `assignment.cleaner`, not delegated member |
| Direct offer received | In-app row for offered worker | `backend/apps/marketplace/services.py:1201-1276` | Created synchronously inside atomic domain transaction |
| Direct offer accepted | In-app row for host | `backend/apps/marketplace/services.py:1338-1429` | Created synchronously inside atomic domain transaction |
| Direct offer declined | In-app row for host | `backend/apps/marketplace/services.py:1432-1471` | Created synchronously inside atomic domain transaction |
| Agency member delegated | In-app row for member | `backend/apps/marketplace/services.py:1474-1552` | Created synchronously inside atomic domain transaction |
| Review pair revealed | In-app rows for both parties | `backend/apps/feedback/services.py:105-134` | Review row uses an inner atomic block, but notifications are created after that commit |
| Counterpart review requested | In-app row | `backend/apps/feedback/services.py:135-142` | Created after the review transaction commits |

Recovery services currently produce no notification for accepted/declined
reschedules, incidents, replacement authorization/draft creation, dispute
opening, or dispute status changes
(`backend/apps/marketplace/services.py:522-709`). There is no implementation of
reschedule withdrawal, replacement withdrawal, incident update, reminder, or
targeted operator matching notification.

Repository-wide production searches found no `.apply_async()` call and only
five `.delay()` calls: account placeholder dispatch
(`backend/apps/accounts/services.py:97`), account-created and signup-code
emails (`backend/apps/accounts/views.py:94,116`), and the two marketplace
`on_commit` email callbacks
(`backend/apps/marketplace/services.py:816,1076`). Direct synchronous email
calls exist only inside notification tasks
(`backend/apps/notifications/tasks.py:103,190-199,316,411,462`). Direct
notification ORM creation exists only inside the two notification service
functions (`backend/apps/notifications/services.py:22-42,55-65`).

## 8. Localization

`User.preferred_language` supports Bulgarian and English and defaults to
Bulgarian (`backend/apps/accounts/models.py:43-65`). Existing in-app text and
all email subjects/bodies are hardcoded English. The marketplace tasks format
timestamps without recipient locale or `Europe/Sofia` conversion
(`backend/apps/notifications/tasks.py:279,293-304,375,388-399`). Existing HTML
templates are English-only. No task snapshots recipient language, and no
fallback behavior is tested.

## 9. Frontend notification types and deep links

- The API type accepts any string event and unrestricted metadata
  (`frontend/types/notification.ts:1-10`).
- `NotificationBell` polls unread count every 30 seconds and lists 20 recent
  rows (`frontend/components/NotificationBell.tsx:9-65`).
- Owner-scoped mark-read/read-all calls use `apiFetch`
  (`frontend/components/NotificationBell.tsx:79-91`).
- Review links read `job_id`/`review_id` metadata and route to host or cleaner
  review state (`frontend/components/NotificationBell.tsx:93-133`).
- Host application/offer mapping covers only submitted, withdrawn, accepted,
  and declined events (`frontend/components/NotificationBell.tsx:135-151`).
- Connection events dispatch an in-browser drawer event
  (`frontend/components/NotificationBell.tsx:153-187`).
- Unknown events are marked read but have no destination. There is no generic
  safe destination field or fallback, and there is no dedicated component test
  for the bell.

The backend list remains owner-scoped at
`backend/apps/notifications/views.py:10-33`; list, unread, mark-read, read-all,
and authentication are covered at
`backend/apps/notifications/tests/test_notification_api.py:31-81`.

## 10. Observability, audit, and health

- Request IDs and sanitized JSON logs exist
  (`backend/apps/core/middleware.py:25-84`,
  `backend/apps/core/logging.py:62-133`).
- Business `AuditLog` is read-only in Django admin
  (`backend/apps/core/admin.py:6-30`) and is not a delivery store.
- Sentry reconstructs events from a strict allowlist and drops tracing payloads
  (`backend/apps/core/sentry.py:92-175`).
- Celery task start/success/retry/failure logs exist
  (`backend/config/celery.py:29-85`).
- `/api/health/` returns only `{status: ok}` and checks neither database,
  broker, worker, queue age, nor notification failures
  (`backend/apps/core/views.py:9-10`).
- Django admin exposes only user-visible `Notification` rows and permits normal
  model changes/deletion (`backend/apps/notifications/admin.py:6-10`).
- Docker Compose configures Redis and a Celery worker, but no Celery Beat
  service is configured (`docker-compose.yml:13-45`). No automated reminder
  scheduler exists, so scheduler health is not applicable today.

Configured does not mean live: repository configuration proves that Redis,
Celery, Sentry, Django mail, and Resend can be configured, but it does not prove
current credentials, queue connectivity, a running worker, or a verified
sender. Those require runtime verification in Phase 10.

## 11. Duplicate, race, privacy, and failure gaps

### Duplicate/race

- Most in-app triggers omit a deduplication key and duplicate on replay.
- Email tasks have no durable identity, no sent marker, and no provider
  idempotency key; any replay or crash-after-provider-accept can duplicate.
- No worker claim prevents two workers from sending one logical delivery.
- Bulk competing-application rejection creates no recipient side effects.
- `_FakeTask` does not model scheduled retries or delivery transitions.

### Privacy

- Application email subjects/bodies/templates include job title, cleaner name,
  property name/city, schedule, price, and free-text application message
  (`backend/apps/notifications/tasks.py:279-306` and
  `templates/notifications/application_submitted_email.html:30-68`).
- Completion email contains job title, property, schedule, cleaner, and price
  (`backend/apps/notifications/tasks.py:373-401` and
  `templates/notifications/job_completed_email.html:36-73`).
- Admin signup email includes full name, email, and phone and places the name in
  the subject (`backend/apps/notifications/tasks.py:84-100`).
- Signup code is passed as a Celery argument
  (`backend/apps/accounts/views.py:113-116`).
- Message notification bodies copy user free text
  (`backend/apps/connections/services.py:191-199`).
- Arbitrary metadata and rendered text have no allowlist.

### Failure handling

- Provider failure retries blindly, then disappears into Celery failure state.
- No durable attempt/error category, final-failed timestamp, or operator alert
  exists.
- Queue publication failures from `.delay()` are not captured in a delivery
  record.
- A delivery failure cannot roll back the two marketplace transitions that use
  `on_commit`, but other notification creation is inside domain transactions,
  and there is no consistent separation between event persistence and provider
  delivery.
- Permanent configuration/recipient/provider failures are retried as though
  transient.

## 12. Documentation/code mismatches

- `TGN.md` describes a legacy `Notification` channel list including SMS and a
  placeholder dispatcher, while S1-E06 limits implementation to in-app/email.
- `AGENT.md` and `architecture.md` say only signup codes use Resend and other
  notification email uses Django mail, but application and completion emails
  currently use Resend (`backend/apps/notifications/tasks.py:241-424`).
- `architecture.md` labels application and completion notification triggers as
  planned even though they are implemented.
- `TGN.md` says delegated review prompts target the assigned member, but
  completion currently notifies `assignment.cleaner`, which is the agency
  account for delegated work (`backend/apps/marketplace/services.py:1069`).
- `DEV.md` and `.env.example` describe separate email toggles but no durable
  delivery/provider-idempotency or health contract.
- Stage 1 requires worker health visibility; only process/task logs and a
  liveness-only HTTP endpoint exist.

## Audit recommendation

**Keep:** the owner-scoped notification API, user-visible `Notification`,
request-ID/log sanitization, Sentry allowlist, and persisted recipient language.

**Merge:** all critical in-app/email triggers into one versioned event contract
and one durable per-channel delivery pipeline.

**Cut from S1-E06:** SMS and all messaging-platform/native-push work; automated
Beat scheduling unless separately approved.

**Fix next:** add canonical event/delivery/attempt/operator-alert records,
post-commit queueing, provider idempotency, localized safe templates, recovery
event wiring, operator reminders, and worker/queue health visibility.
