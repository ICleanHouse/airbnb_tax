# Temporal Graph Network — Host Cleaner Marketplace

## Restart Handoff

Read `CURRENT_PROGRESS.md` before continuing deployment or signup-flow work.

This document is a machine-readable knowledge graph of the entire project.
It maps every domain entity, relationship, state machine, module dependency,
frontend data flow, and event trigger — including what is implemented vs planned.
Read this file at the start of any new development session to reconstruct full context instantly.

**Last updated:** 2026-06-08
**Stage:** v1 MVP — Active Development

---

## 1. Entity Graph

Nodes are domain objects. Edges are named relationships with cardinality.

```
User ──[has_one]──────────────► HostProfile
User ──[has_one]──────────────► CleanerProfile
User ──[has_one]──────────────► AgencyProfile
User ──[has_many]─────────────► Notification
User ──[has_one]──────────────► CookieConsent

HostProfile ──[has_many]──────► Property
HostProfile ──[has_many]──────► CleaningJob     (via Property)

Property ──[has_many]─────────► ExternalCalendarConnection
Property ──[has_many]─────────► Reservation
Property ──[has_many]─────────► CleaningJob

CleaningBatch ──[belongs_to]──► HostProfile
CleaningBatch ──[has_many]────► CleaningJob

CleaningJob ──[belongs_to]────► Property
CleaningJob ──[has_many]──────► CleanerApplication
CleaningJob ──[has_one]───────► Assignment
CleaningJob ──[has_many]──────► Review

CleanerApplication ──[belongs_to]──► CleaningJob
CleanerApplication ──[belongs_to]──► CleanerProfile   (individual)
CleanerApplication ──[belongs_to]──► AgencyProfile    (agency; mutually exclusive with CleanerProfile)

Assignment ──[belongs_to]──────► CleaningJob
Assignment ──[belongs_to]──────► CleanerApplication   (the accepted one)
Assignment ──[belongs_to]──────► CleanerProfile        (resolved cleaner — may be agency member)

AgencyProfile ──[has_many]────► AgencyInvitation
AgencyProfile ──[has_many]────► AgencyMembership
AgencyInvitation ──[targets]──► CleanerProfile
AgencyMembership ──[links]────► AgencyProfile ↔ CleanerProfile

Review ──[belongs_to]──────────► CleaningJob
Review ──[has_one author]──────► User
Review ──[has_one subject]─────► User

FavouriteCleaner ──[belongs_to]► User[host]      (saved cleaner; one-way)
FavouriteCleaner ──[targets]───► User[cleaner]

Connection ──[belongs_to]──────► User (requester)   (host↔cleaner relationship — LinkedIn-style)
Connection ──[belongs_to]──────► User (addressee)
Connection ──[has_many]────────► Message
Message ──[belongs_to]─────────► Connection
Message ──[has_one sender]─────► User

AuditLog ──[references]────────► (any entity — polymorphic)
```

> **Connections layer (apps.connections):** a `Connection` is a mutual host↔cleaner/agency
> relationship: one side requests, the other accepts (`pending → accepted`; also
> `declined`/`removed`). Only `accepted` connections may exchange `Message`s (polled
> in-app chat). Unique on `(requester, addressee)`. The `/shared/` endpoint derives the
> properties + cleanings the two have collaborated on from existing `Assignment`s — it
> stores no extra link. No payments.

### Entity ownership summary

| Entity | Owner | Created when |
|---|---|---|
| `User` | self | Signup |
| `HostProfile` | User[host] | Auto on host signup |
| `CleanerProfile` | User[cleaner] | Auto on cleaner signup |
| `AgencyProfile` | User[agency] | Auto on agency signup |
| `Property` | HostProfile | Host creates via dashboard |
| `ExternalCalendarConnection` | Property | Host adds calendar feed |
| `Reservation` | Property | iCal parse or manual |
| `CleaningJob` | Property | Host posts; or bulk from ICS import |
| `CleaningBatch` | HostProfile | Host creates monthly batch |
| `CleanerApplication` | CleanerProfile / AgencyProfile | Cleaner/agency applies |
| `Assignment` | System | Created when host accepts application |
| `Review` | User (both directions) | After job completion only |
| `Notification` | System | Triggered by domain events |
| `CookieConsent` | User / visitor | Consent banner interaction |
| `FavouriteCleaner` | User[host] | Host saves a cleaner (one-way) |
| `Connection` | User (requester) | Host/cleaner sends a connect request |
| `Message` | User (sender) | Sent within an accepted connection |
| `AgencyInvitation` | AgencyProfile | Agency invites cleaner |
| `AgencyMembership` | System | Cleaner accepts invitation |
| `AuditLog` | System | On key marketplace decisions |

---

## 2. State Machines

### 2a. User Account Status

```
                    ┌─────────┐
            signup  │         │
           ────────►│ pending │
                    │         │
                    └────┬────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ approved │ │ rejected │ │suspended │
       └──────────┘ └──────────┘ └──────────┘
            │                         ▲
            └─────────────────────────┘
                    (admin action)
```

**Rules:**
- `pending` users can log in and view dashboards but cannot post jobs, apply, or accept assignments.
- `approved` → `suspended` by admin action.
- `rejected` is terminal for marketplace access.
- A 6-digit email confirmation code is sent before account creation; final signup requires the verified token.
- Admin email is sent to all `role=admin` or `is_staff=True` users on every `pending` creation.
- Email confirmation sets `email_verified_at`; admin approval still controls marketplace rights.
- Public signup is a single React wizard at `/signup`; old signup step URLs redirect back to it.
- Cleaner signup payloads must include birth date, sex, native language, experience level, work preference, and at least one preferred time slot.
- Any changed signup field for Cleaner, Host, or Agency must be reflected in database fields, migrations, serializers, frontend payloads, and tests.

### 2b. Cleaner Verification Status

```
┌────────────┐   admin verifies   ┌──────────┐
│unverified  │──────────────────►│ verified  │
└────────────┘                    └──────────┘
```

**Rules:**
- Cleaners must be `verified` AND `approved` before applying for any job.
- Verification UI in admin panel: **not yet built**.

### 2c. Cleaning Job Lifecycle

```
                   ┌───────┐
      host creates │       │
     ─────────────►│ draft │
                   │       │
                   └───┬───┘
                       │ publish
                       ▼
                   ┌───────┐
                   │       │◄── cleaners apply
                   │ open  │
                   │       │
                   └───┬───┘
            ┌──────────┤
            │ cancelled│ assigned (host accepts application)
            ▼          ▼
       ┌──────────┐  ┌──────────┐
       │cancelled │  │ assigned │
       └──────────┘  └────┬─────┘
                          │
               ┌──────────┼───────────┐
               │ completed│ disputed  │
               ▼          ▼           │
          ┌──────────┐ ┌──────────┐   │
          │completed │ │ disputed │◄──┘
          └──────────┘ └──────────┘
               │
               └──► reviews unlocked (both directions)
```

**Rules:**
- Only one `Assignment` per job (enforced at service layer).
- Only one job per property can exist for the exact same `scheduled_start` and `scheduled_end` (serializer validation plus database constraint).
- Competing applications are rejected when one is accepted.
- Completion is time-gated: cleaners can mark done once `scheduled_start` is in the past; hosts/admins can complete once `scheduled_end` is in the past. Final job completion requires both host and cleaner acknowledgements, except admin completion can acknowledge both sides.
- Reviews only allowed after `completed`.
- `disputed` requires admin inspection (not yet built).

### 2d. Cleaner Application Lifecycle

```
              ┌─────────┐
  cleaner     │         │
  applies ───►│ pending │
              │         │
              └────┬────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ accepted │ │ rejected │ │withdrawn │
  └──────────┘ └──────────┘ └──────────┘
       │
       └──► Assignment created
            Other applications → rejected
```

### 2e. Agency Invitation & Membership

```
Agency Invitation:
  pending ──► accepted ──► [AgencyMembership: pending → active]
           └► expired / declined

Agency Membership:
  active ──► revoked   (admin or agency action)
```

**Rules:**
- Agency can assign work only to `active` members.
- Member cleaner must also be `approved` + `verified` to receive agency work.

---

## 3. Module Dependency Graph

Backend apps in `backend/apps/`. Arrows = "imports models/services from".

```
notifications ◄─────────── accounts
      ▲
      │
   accounts ◄───────────── properties
      ▲                         ▲
      │                         │
   marketplace ◄────────────────┘
      ▲
      │
   calendars ◄──────────── properties
                ◄──────────── marketplace

   feedback ◄────────────── accounts
            ◄────────────── marketplace
```

**Hard rules:**
- No app imports from an app to its right in the dependency chain.
- `accounts` has zero imports from other domain apps.
- `notifications` may import `accounts` (to look up admin emails) but nothing else.
- Cross-domain workflows use explicit service functions — never reach into another app's ORM directly from a view.

### Config layer (`backend/config/`)

```
settings.py ──► loaded by all apps at startup
celery.py   ──► wires Celery to Django settings
settings.py ──► calls load_dotenv() during settings import
manage.py   ──► calls load_dotenv() before Django setup
wsgi.py     ──► calls load_dotenv() before Django setup
asgi.py     ──► calls load_dotenv() before Django setup
```

---

## 4. Frontend Route Graph

Each route node lists: auth requirement, role gate, data sources (API calls), and write actions.

```
/ (landing)
  auth: optional
  reads: GET /api/accounts/me/   (to set header link)
         GET /api/accounts/public-cleaners/   (verified cleaner directory)
  writes: none
  behavior: compact hero + CleanerBrowser city/district filters
  next: /login, /signup, /host, /admin, /cleaner, /agency, /app

/login
  auth: no
  reads: none
  writes: POST /api/accounts/login/
  next: / (on success)

/signup
  auth: no
  reads: sessionStorage signup_wizard_state for refresh recovery
  writes: POST /api/accounts/signup/email-code/
          POST /api/accounts/signup/verify-email-code/
          POST /api/accounts/signup/
  behavior: single React wizard with Motion transitions; Continue/Back mutate local state
  progress starts: role step
  cleaner path: account → confirm email → role → personal info → location → native language → experience → introduction → profile photo → /app
  host/agency path: account → confirm email → role → location → /app
  old step URLs: /signup/confirm-email, /signup/role, /signup/location,
                 /signup/personal-info, /signup/native-language, /signup/experience
                 redirect to /signup

/app
  auth: required
  reads: GET /api/accounts/me/
  redirects: host → /host, admin → /admin
  shows: account status for cleaner/agency

/admin                            [role: admin only]
  auth: required
  reads: GET /api/accounts/users/
  reads param: ?filter=pending   (pre-selects tab; used in email approval links)
  writes: POST /api/accounts/users/{id}/approve/
          POST /api/accounts/users/{id}/reject/
  NOT YET: cleaner verification action

/host                             [role: host only]
  auth: required
  reads: GET /api/accounts/me/
         GET /api/properties/properties/
         GET /api/marketplace/jobs/
         GET /api/marketplace/applications/
         GET /api/marketplace/assignments/
         GET /api/feedback/reviews/
  writes: POST   /api/properties/properties/                  (add property)
          PATCH  /api/properties/properties/{id}/             (edit property)
          POST   /api/properties/images/                      (upload photos)
          DELETE /api/properties/images/{id}/                 (remove photo)
          POST   /api/properties/parse-ics/                   (ICS upload → parsed events)
          POST   /api/marketplace/jobs/                       (post job / ICS bulk create)
          POST   /api/marketplace/jobs/{id}/publish/          (draft → open)
          DELETE /api/marketplace/jobs/{id}/                  (delete; draft/open only)
          POST   /api/marketplace/jobs/{id}/complete/         (mark done)
          POST   /api/marketplace/applications/{id}/accept/   (accept → creates assignment)
          POST   /api/marketplace/applications/{id}/reject/   (decline application)
          POST   /api/feedback/reviews/                       (rate cleaner; body: job_id, reviewee_id)
  notes:
    - Job form uses separate date + start/end time fields (not datetime-local)
    - Summary cards are <button> elements driving appFilter state (pending/active/completed/open)
    - hostRatingAvg = avg of reviews where reviewee === me.id (cleaner-written reviews of the host)

/cleaner                         [role: cleaner only]
  reads: GET /api/accounts/me/
         GET /api/accounts/cleaners/
         GET /api/marketplace/jobs/
         GET /api/marketplace/applications/
         GET /api/marketplace/assignments/
         GET /api/marketplace/calendar/
  writes: PATCH /api/accounts/users/{id}/
          PATCH /api/accounts/cleaners/{id}/
          POST /api/marketplace/applications/
          POST /api/marketplace/jobs/{id}/complete/

/agency   [NOT BUILT]             [role: agency only]
  planned reads: GET /api/accounts/me/
                 GET /api/accounts/agency-memberships/
                 GET /api/marketplace/assignments/
  planned writes: POST /api/marketplace/assignments/{id}/assign-member/
                  POST /api/accounts/agencies/{id}/invite-cleaner/
```

---

## 5. API Surface Map

Full API surface with implementation state.

### Accounts

| Method | Route | Auth | Status |
|---|---|---|---|
| POST | `/api/accounts/signup/email-code/` | None | ✅ |
| POST | `/api/accounts/signup/verify-email-code/` | None | ✅ |
| POST | `/api/accounts/signup/` | None | ✅ |
| GET | `/api/accounts/confirm-email/{uidb64}/{token}/` | None | Legacy |
| POST | `/api/accounts/login/` | None | ✅ |
| POST | `/api/accounts/logout/` | Required | ✅ |
| GET | `/api/accounts/me/` | Required | ✅ |
| GET/POST | `/api/accounts/cookie-consent/` | Optional | ✅ |
| GET | `/api/accounts/users/` | Admin | ✅ |
| POST | `/api/accounts/users/{id}/approve/` | Admin | ✅ |
| POST | `/api/accounts/users/{id}/reject/` | Admin | ✅ |
| POST | `/api/accounts/users/{id}/suspend/` | Admin | ✅ |
| GET/POST | `/api/accounts/hosts/` | Required | ✅ |
| GET/POST | `/api/accounts/cleaners/` | Required | ✅ |
| GET | `/api/accounts/public-cleaners/` | None | ✅ |
| GET | `/api/accounts/public-cleaners/{id}/` | None | ✅ |
| GET/POST | `/api/accounts/agencies/` | Required | ✅ |
| POST | `/api/accounts/agencies/{id}/invite-cleaner/` | Agency | ✅ |
| GET | `/api/accounts/agency-invitations/` | Required | ✅ |
| POST | `/api/accounts/agency-invitations/{id}/accept/` | Cleaner | ✅ |
| GET | `/api/accounts/agency-memberships/` | Required | ✅ |
| POST | `/api/accounts/cleaners/{id}/verify/` | Admin | ⬜ Not built |

### Properties

| Method | Route | Auth | Status |
|---|---|---|---|
| GET/POST | `/api/properties/properties/` | Host | ✅ |
| GET/POST | `/api/properties/calendar-connections/` | Host | ✅ |
| GET/POST | `/api/properties/reservations/` | Host | ✅ |
| POST | `/api/properties/parse-ics/` | Host | ✅ |

### Marketplace

| Method | Route | Auth | Status |
|---|---|---|---|
| GET/POST | `/api/marketplace/batches/` | Host | ✅ |
| GET/POST | `/api/marketplace/jobs/` | Host/Cleaner | ✅ |
| POST | `/api/marketplace/jobs/{id}/publish/` | Host | ✅ |
| DELETE | `/api/marketplace/jobs/{id}/` | Host | ✅ — draft/open only |
| POST | `/api/marketplace/jobs/{id}/complete/` | Host/Cleaner/Admin | ✅ |
| GET | `/api/marketplace/calendar/` | Required | ✅ |
| GET/POST | `/api/marketplace/applications/` | Host/Cleaner/Agency | ✅ |
| POST | `/api/marketplace/applications/{id}/accept/` | Host | ✅ |
| POST | `/api/marketplace/applications/{id}/reject/` | Host | ✅ |
| POST | `/api/marketplace/applications/{id}/withdraw/` | Cleaner/Agency | ✅ |
| GET/READ | `/api/marketplace/assignments/` | Required | ✅ |
| POST | `/api/marketplace/assignments/{id}/assign-member/` | Agency | ✅ |

### Connections (apps.connections — LinkedIn-style relationship + polled in-app chat)

| Method | Route | Auth | Status |
|---|---|---|---|
| GET | `/api/connections/` | Required | ✅ — my accepted + incoming/outgoing pending |
| POST | `/api/connections/` (body: `user_id`) | Host/Cleaner | ✅ — send request (host↔cleaner only) |
| POST | `/api/connections/{id}/accept/` | Addressee | ✅ |
| POST | `/api/connections/{id}/decline/` | Addressee | ✅ |
| DELETE | `/api/connections/{id}/` | Participant | ✅ — remove |
| GET/POST | `/api/connections/{id}/messages/` | Participant | ✅ — GET marks read; POST sends (accepted only) |
| POST | `/api/connections/{id}/read/` | Participant | ✅ |
| GET | `/api/connections/unread-count/` | Required | ✅ — `{ unread, pending_requests }` |
| GET | `/api/connections/{id}/shared/` | Participant | ✅ — shared properties + cleanings |

### Other

| Method | Route | Auth | Status |
|---|---|---|---|
| GET/POST | `/api/feedback/reviews/` | Required | ✅ |
| GET | `/api/notifications/notifications/` | Required | ✅ |
| GET | `/api/calendars/conflicts/` | Required | ✅ |
| GET | `/api/health/` | None | ✅ |
| — | `/admin/` | Staff | ✅ Django admin |

---

## 6. Event & Task Graph

Domain events and the Celery tasks or side effects they trigger.

```
EVENT: signup.email_code_requested
  └──► TASK: send_signup_email_code                ✅ implemented
              │  sends: 6-digit code through Resend only
              │  stores: hashed code only
              └──► SIDE EFFECT: verify endpoint returns email_verification_token

EVENT: account.created (signup)
  └──► TASK: send_admin_new_account_email          ✅ implemented
              │  reads: User.objects.filter(role=admin OR is_staff=True)
              │  sends: email with name, role, approve_link
              │  approve_link = FRONTEND_URL/admin?filter=pending
              │  retries: 3× with 60s delay on mail-backend failure
              └──► SIDE EFFECT: admin redirected to /admin?filter=pending (via email link)

EVENT: account.approved                            ⬜ planned
  └──► TASK: notify cleaner/host of approval

EVENT: application.submitted                       ✅ implemented
  ├──► TASK: send_application_submitted_email      sends via Resend to job host
  └──► SIDE EFFECT: in-app Notification created for host

EVENT: application.accepted                        ✅ partial
  ├──► SIDE EFFECT: Assignment created
  ├──► SIDE EFFECT: competing applications → rejected
  ├──► SIDE EFFECT: in-app Notification created for cleaner
  └──► ⬜ planned: acceptance email to cleaner

EVENT: application.rejected                        ✅ partial
  ├──► SIDE EFFECT: in-app Notification created for cleaner
  └──► ⬜ planned: rejection email to cleaner

EVENT: assignment.created                          ⬜ planned
  └──► TASK: notify cleaner + calendar entry

EVENT: assignment.cancelled                        ⬜ planned
  ├──► TASK: notify both parties
  └──► SIDE EFFECT: AuditLog entry

EVENT: job.completed                               ✅ partial
  ├──► TASK: send_job_completed_email              sends via Resend to host
  ├──► SIDE EFFECT: assignment.host_completed_at / cleaner_completed_at recorded
  ├──► SIDE EFFECT: assignment reaches full completion after both sides acknowledge
  ├──► SIDE EFFECT: in-app Notifications to host + cleaner
  └──► ⬜ planned: review-prompt task (scheduled delay)

EVENT: review.submitted                            ⬜ planned
  └──► SIDE EFFECT: CleanerProfile.rating recalculated

EVENT: connection.request / connection.accepted    ✅ implemented (apps.connections)
  └──► SIDE EFFECT: create_notification to the other user; Connections badge polls unread-count

EVENT: connection.message_sent                     ✅ implemented
  └──► SIDE EFFECT: create_notification (message.received) to the recipient; bumps Connection.updated_at

EVENT: calendar.sync_failed                        ⬜ planned
  └──► TASK: notify affected user + admins

SCHEDULED: ical.feed_poll (per ExternalCalendarConnection)  ⬜ placeholder
  └──► SIDE EFFECT: new Reservation records, conflict check

SCHEDULED: google.calendar.sync                    ⬜ placeholder (OAuth not started)
```

### Celery task registry

| Task | Module | Status | Retry |
|---|---|---|---|
| `send_admin_new_account_email` | `apps.notifications.tasks` | ✅ | 3× / 60s |
| `send_signup_email_code` | `apps.notifications.tasks` | ✅ | 3× / 60s |
| `send_account_confirmation_email` | `apps.notifications.tasks` | Legacy | 3× / 60s |
| `send_application_submitted_email` | `apps.notifications.tasks` | ✅ | 3× / 60s |
| `send_job_completed_email` | `apps.notifications.tasks` | ✅ | 3× / 60s |
| `dispatch_notification` | `apps.notifications.tasks` | ⬜ placeholder | — |
| `poll_ical_feed` | `apps.calendars.tasks` | ⬜ placeholder | — |
| `sync_google_calendar` | `apps.calendars.tasks` | ⬜ placeholder | — |
| `check_calendar_conflicts` | `apps.calendars.tasks` | ⬜ placeholder | — |
| `send_sms` | `apps.notifications.tasks` | ⬜ placeholder | — |
| `schedule_review_prompt` | `apps.notifications.tasks` | ⬜ placeholder | — |
| `retry_failed_integrations` | `apps.notifications.tasks` | ⬜ placeholder | — |

**Local fallback:** When `celery` is not installed, `_FakeTask` in `apps/notifications/tasks.py` wraps every task and executes it synchronously. `.delay()` and `.apply()` are both supported. `bind=True` tasks receive a `_FakeTaskSelf` stub with `.retry()`.

---

## 7. Data Model Summary

Key fields only. Full schema lives in migrations.

### User
```
id, email, phone_number, first_name, last_name,
role: [host | cleaner | agency | admin],
account_status: [pending | approved | rejected | suspended],
is_active, is_staff,
approved_at, approved_by, email_verified_at,
language_preference: [bg | en]
```

### CleanerProfile
```
user (1:1), kind, display_name, bio, city, service_areas[],
verification_status: [pending | verified | rejected | suspended],
sex: [male | female | prefer_not_to_say],
birth_date, age (calculated), native_language, experience_level,
education, has_driving_license, driving_license_categories[],
has_own_car, smoker,
profile_image, average_rating, completed_jobs_count
```

Cleaner signup rules:
- Birth date is required and must prove age 18+.
- Sex, native language, and experience level are required.
- The frontend shows birth date as a compact dropdown calendar.

Signup database rule:
- Final Cleaner, Host, and Agency signup questions must have matching database columns/JSON fields, migrations, serializer validation, profile serializer exposure, frontend payload handling, and tests.

### AgencyProfile
```
user (1:1), company_name, service_areas[],
member_count (computed), bio
```

### Property
```
host (FK→HostProfile), name, address, city, country,
timezone (default: Europe/Sofia),
default_cleaning_duration_minutes, default_price_eur,
cleaning_instructions, access_notes
```

### CleaningJob
```
property (FK), title, description,
scheduled_start (datetime UTC), scheduled_end (datetime UTC),
status: [draft | open | assigned | completed | cancelled | disputed],
price_eur, published_at,
batch (FK→CleaningBatch, nullable),
source: [manual | ics_import | batch]
```

Uniqueness rule:
- `(property, scheduled_start, scheduled_end)` must be unique.

### CleanerApplication
```
job (FK), cleaner (FK→CleanerProfile, nullable),
agency (FK→AgencyProfile, nullable),
proposed_price_eur, message,
status: [pending | accepted | rejected | withdrawn],
submitted_at
```

### Assignment
```
job (1:1), application (FK), cleaner (FK→User),
assigned_member (FK→User, nullable),
assigned_at, host_completed_at, cleaner_completed_at,
completed_at, cancelled_at
```

### Review
```
job (FK), author (FK→User), subject (FK→User),
rating (1–5), comment,
is_private, created_at
```

### Notification
```
user (FK), channel: [in_app | email | sms],
type, title, body,
read_at, sent_at, created_at
```

### AuditLog
```
actor (FK→User), action, entity_type, entity_id,
metadata (JSON), created_at
```

---

## 8. Infrastructure Dependency Graph

```
[Next.js frontend :3000]
        │  HTTP (rewrites /api/* → backend)
        ▼
[Django backend :8000]
        │              │              │
        ▼              ▼              ▼
[PostgreSQL :5432] [Redis :6379] [Resend API]
                        │
                        ▼
               [Celery worker]
                        │
                        └──► [Resend API]     (signup email confirmation)
                        └──► [iCal feeds]     (planned)
                        └──► [Google OAuth]   (planned)
                        └──► [SMS provider]   (planned)
```

### Environment resolution order

```
Shell environment variables    (highest priority)
        │  override=False
        ▼
.env file (python-dotenv)
        │
        ▼
Django settings.py defaults    (lowest priority)
```

`DATABASE_URL` must be **absent or commented out** in local `.env`.
Docker passes it via `env_file:` with the `db` hostname valid inside the container network.

---

## 9. Implementation State Heatmap

Quick reference: what is fully done, what is partial, what is missing.

### Backend
| Area | State |
|---|---|
| Auth (signup/login/logout/me) | ✅ Complete |
| Account approval states + admin actions | ✅ Complete |
| Signup email-code confirmation (Celery + Resend) | ✅ Complete |
| Admin email on signup (Celery + mail backend) | ✅ Complete |
| Host/Cleaner/Agency profiles | ✅ Complete |
| Agency invitations + memberships | ✅ Complete |
| Cookie consent | ✅ Complete |
| Property CRUD | ✅ Complete |
| ICS file parsing (`parse-ics/`) | ✅ Complete |
| Cleaning job CRUD + publish | ✅ Complete |
| Monthly batch CRUD | ✅ Complete |
| Cleaner applications | ✅ Complete |
| Application acceptance + assignment | ✅ Complete |
| Agency member delegation | ✅ Complete |
| Job completion | ✅ Complete |
| Job deletion guard (draft/open only) | ✅ Complete |
| Two-way reviews + rating update | ✅ Complete |
| In-app notification records | ✅ Complete |
| Calendar conflict API | ✅ Complete |
| Application-submitted email (Resend) | ✅ Complete |
| Job-completed email (Resend) | ✅ Complete |
| Cleaner verification admin action | ⬜ Not built |
| Notification triggers (acceptance, rejection, assignment emails) | ⬜ Placeholder |
| iCal feed polling | ⬜ Placeholder |
| Google Calendar sync | ⬜ Placeholder |
| iCal export | ⬜ Planned |
| SMS dispatch | ⬜ Placeholder |
| Object storage | ⬜ Planned |
| Dispute workflow | ⬜ Planned |

### Frontend
| Route / Feature | State |
|---|---|
| Public landing page `/` | ✅ Complete |
| Login `/login` | ✅ Complete |
| Signup `/signup` React wizard through cleaner profile photo | 🟨 In progress |
| Generic workspace `/app` | ✅ Complete |
| Admin approval panel `/admin` + URL filter | ✅ Complete |
| Host dashboard `/host` — properties section | ✅ Complete |
| Host dashboard `/host` — jobs + calendar | ✅ Complete |
| Host dashboard `/host` — ICS import modal | ✅ Complete |
| Host dashboard — job form (date + start/end time fields) | ✅ Complete |
| Host dashboard — delete job (two-step confirm; draft/open only) | ✅ Complete |
| Host/Cleaner dashboards — time-gated job completion controls | ✅ Complete |
| Host dashboard — job completion email to host via Resend | ✅ Complete |
| Host dashboard — application submitted email to host via Resend | ✅ Complete |
| Host dashboard — applications panel (summary cards, filter, pending/active/completed/open) | ✅ Complete |
| Host dashboard — host rating display (avg from cleaner-written reviews) | ✅ Complete |
| Host dashboard — star rating + review form (post-completion) | ✅ Complete |
| Host dashboard — job activity context in calendar list | ✅ Complete |
| Cookie consent banner | ✅ Complete |
| `apiFetch` — CSRF, Content-Type, FormData-safe | ✅ Complete |
| Cleaner dashboard `/cleaner` | ✅ Complete |
| Agency dashboard `/agency` | ⬜ Not built |
| Landing cleaner browser with city/district filtering | ✅ Complete |
| Cleaner verification in admin panel | ⬜ Not built |

---

## 10. Critical Rules Index

Rules that must never be broken regardless of task scope.

| # | Rule | Where enforced |
|---|---|---|
| R1 | A job has at most one accepted `Assignment` | Service layer — `marketplace/services.py` |
| R2 | Reviews only after job `completed` | Service layer + serializer permission |
| R3 | Cleaners must be `verified` + `approved` before applying | Permission class in marketplace views |
| R4 | Agencies assign only to `active` members | Service layer — agency delegation |
| R5 | No payment processing in v1 | Architecture constraint |
| R6 | Internal calendar is source of truth | Calendar module owns conflict detection |
| R7 | Never set `Content-Type` for FormData | `frontend/lib/api.ts` — typeof body check |
| R8 | Never call `fetch` directly — use `apiFetch` | Frontend convention |
| R9 | Never commit `.env` | `.gitignore` |
| R10 | `trailingSlash: true` + dual API rewrite — do not simplify | `frontend/next.config.mjs` |
| R11 | `.env` is loaded for local manual runs; shell env wins where `override=False` is used | `settings.py`, `manage.py`, `wsgi.py`, `asgi.py` |
| R12 | `DATABASE_URL` commented out in local `.env` | `.env` (Docker hostname `db` is invalid locally) |
| R13 | All Celery tasks must be idempotent and retryable | `apps/notifications/tasks.py` convention |
| R14 | Public `/` is marketing only — never a dashboard | Frontend routing |
| R15 | Timezone `Europe/Sofia`; store UTC, display local | All datetime handling |
| R16 | Signup field changes must update database models, migrations, serializers, frontend payloads, and tests together | Accounts signup/profile workflow |
| R17 | A property cannot have two jobs for the exact same start/end time | `CleaningJob` unique constraint + serializer validation |
| R18 | Cleaner completion is allowed after start time; host/admin completion is allowed after end time | `marketplace/services.py` + dashboard guards |
