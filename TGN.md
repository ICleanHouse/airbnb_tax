# Temporal Graph Network — Host Cleaner Marketplace

## Restart Handoff

Read `CURRENT_PROGRESS.md` before continuing deployment or signup-flow work.

This document is a machine-readable knowledge graph of the entire project.
It maps every domain entity, relationship, state machine, module dependency,
frontend data flow, and event trigger — including what is implemented vs planned.
Read this file at the start of any new development session to reconstruct full context instantly.

**Last updated:** 2026-07-20
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
Property ──[has_many]─────────► TurnoverLineage

CleaningBatch ──[belongs_to]──► HostProfile
CleaningBatch ──[has_many]────► CleaningJob

CleaningJob ──[belongs_to]────► Property
CleaningJob ──[belongs_to]────► TurnoverLineage
CleaningJob ──[optionally replaces]► CleaningJob
CleaningJob ──[has_many]──────► CleanerApplication
CleaningJob ──[has_one]───────► Assignment
CleaningJob ──[has_many]──────► Review
CleaningJob ──[has_many]──────► JobLifecycleEvent

TurnoverLineage ──[has_many]──► CleaningJob (immutable attempts)
TurnoverLineage ──[has_many]──► JobLifecycleEvent

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

City ──[has_many]──────────────► ServiceZone
ServiceZone ──[has_one]────────► ServiceZoneGeometry

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
| `FavouriteCleaner` | User[host] | Host saves a public marketplace-eligible cleaner (one-way) |
| `Connection` | User (requester) | Host/cleaner sends a connect request |
| `Message` | User (sender) | Sent within an accepted connection |
| `City` | System/admin | Location catalog creation/import |
| `ServiceZone` | City | Canonical city district/service-zone catalog |
| `ServiceZoneGeometry` | ServiceZone | GeoJSON geometry import/synchronization |
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
                         │ contact reconciliation or admin decision
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ approved │ │ rejected │ │suspended │
       └──────────┘ └──────────┘ └──────────┘
            │                         ▲
            └─────────────────────────┘
                    (admin suspension)
```

**Rules:**
- `pending` users can log in and view dashboards but cannot post jobs, apply, or accept assignments.
- Signup persists `pending` first. With normal requirements enabled and
  `PHONE_VERIFICATION_REQUIRED=False`, stored email confirmation satisfies the
  interim contact policy and reconciliation advances the account to `approved`.
- If phone is required, normal reconciliation waits for both contact
  timestamps. An explicit disabled account requirement is a guarded
  test/rehearsal shortcut and marks the user as excluded from genuine evidence.
- `approved` → `suspended` by admin action. `pending` may also be suspended.
- `rejected` is terminal for marketplace access.
- A 6-digit email confirmation code is sent before account creation; final signup requires the verified token.
- Admin email is sent to all `role=admin` or `is_staff=True` users on account creation.
- `email_verified`, `phone_verified`, `contact_verified`,
  `marketplace_eligible`, and `fully_verified` are distinct. The last always
  requires both timestamps; email-only access is not identity verification.
- Public signup is a single React wizard at `/signup`; old signup step URLs redirect back to it.
- Cleaner signup payloads must include birth date, sex, native language, experience level, work preference, and at least one preferred time slot.
- Any changed signup field for Cleaner, Host, or Agency must be reflected in database fields, migrations, serializers, frontend payloads, and tests.

### 2b. Cleaner Verification Status

```
┌────────────┐ contact reconcile  ┌──────────┐
│unverified  │──────────────────►│ eligible │
└────────────┘                    └──────────┘
```

**Rules:**
- Cleaners must be active, stored `approved`, and in the stored legacy
  `verified` cleaner state before applying for any job. Under ADR-0002 that
  state means marketplace eligibility through the interim contact policy, not
  identity/reference/interview/trial-job review.
- Only pending-to-eligible reconciliation is defined here. Cleaner rejection,
  suspension, restoration, evidence review, re-review, and retention remain
  blocked by S1-D02.

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
                    ┌─────┴─────┐
                    ▼           ▼
               ┌──────────┐ ┌──────────┐
               │completed │ │cancelled │
               └──────────┘ └──────────┘
                    │
                    └──► reviews unlocked (both directions; double-blind reveal)
```

**Rules:**
- Every job belongs to exactly one `TurnoverLineage`; a job is an immutable
  attempt, and cancelled/completed attempts are never reopened.
- Only one `Assignment` belongs to a job (database one-to-one plus service
  rules). The assignment and delegated agency member remain attached to that
  attempt.
- Actionable statuses are `draft`, `open`, and `assigned`. Partial uniqueness
  permits one actionable job per exact property/start/end slot and one
  actionable job per lineage. Historical `completed`/`cancelled` attempts may
  share a slot.
- Recovery creates a new linked job in the same lineage. Replacement is a later
  S1-E05 batch; agency recovery remains explicitly unsupported.
- Competing applications are rejected when one is accepted.
- **Completion is a single step by the assigned cleaner (or an admin)** — there is no separate host confirmation. Marking done sets `completed_at` and flips the job to `completed` immediately; `cleaner_completed_at`/`host_completed_at` are both stamped at that moment. Cleaner completion is time-gated to after `scheduled_start`.
- Reviews only allowed after `completed` with `assignment.completed_at` set, and are **double-blind**: a review about a user is revealed only once both sides have reviewed that job, or after a 14-day window (`feedback.services.REVIEW_WINDOW_DAYS`). On completion both host and cleaner receive a `review.requested` prompt. For delegated agency assignments, the review parties are the host and the actual assigned cleaner member; the agency account is not a review participant after delegation.
- Disputes are orthogonal case records, not job statuses. The dispute workflow
  is a later S1-E05 batch and cannot change completion, reviews, or ratings.

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
- Once an accepted agency assignment is delegated to a member cleaner, the normal agency API treats that delegation as immutable. Repeating the same member assignment is idempotent; assigning a different member is rejected. Any future reassignment requires a separate admin/support workflow.
- Cleaner application acceptance, direct-offer acceptance, and concrete agency
  member delegation lock the worker and reject any non-cancelled assignment
  satisfying `existing_start < candidate_end` and
  `existing_end > candidate_start`. Direct assignments use
  `Assignment.cleaner`; delegated agency work uses
  `Assignment.assigned_member`. Completed assignments still participate by
  their scheduled interval, while `Assignment.cancelled_at` releases it.
- Agency application acceptance creates the one assignment for the job without
  treating the agency account as an occupied cleaner. The schedule check begins
  only when a concrete member is delegated.
- Future assigned-job reschedule and emergency-replacement acceptance services
  must acquire the same concrete-worker lock and invoke the same overlap check
  inside their mutation transaction.

### 2f. Favourite Cleaners

**Rules:**
- Hosts can create favourites only for public marketplace-eligible cleaners: role `cleaner`, active user, approved account, existing cleaner profile, and `verification_status="verified"`.
- Favourite creation rejects pending, rejected, suspended, inactive, unverified, missing-profile, host, agency, and admin targets.
- Duplicate favourite creation is idempotent and keeps one row per `(host, cleaner)`.
- Historical favourites are not deleted when a cleaner later becomes unavailable. The authenticated host's favourite list keeps showing the historical row through the existing safe favourite serializer fields; new favourites for that unavailable cleaner are rejected.

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
         GET /api/accounts/public-cleaners/   (marketplace-eligible cleaner directory)
         GET /api/marketplace/public-demand/?city=sofia
         GET /api/marketplace/area-stats/?city=sofia
  writes: PATCH /api/accounts/users/{id}/   (authenticated preferred-language slider)
  behavior: compact hero + CleanerBrowser city/district filters;
            authenticated header uses notification bell + profile-icon menu
  next: /login, /signup, /host, /admin, /cleaner, /agency, /app

/login
  auth: no
  reads: none
  writes: POST /api/accounts/login/
  next: / (on success)

/signup
  auth: no
  reads: sessionStorage signup_wizard_state for non-sensitive refresh recovery
  writes: POST /api/accounts/signup/email-code/
          POST /api/accounts/signup/verify-email-code/
          POST /api/accounts/signup/
  behavior: single React wizard with Motion transitions; Continue/Back mutate local state;
            recovery persists only version, savedAt, role, citySlug,
            selectedZoneIds, and experienceLevel for 24 hours
  secrets: passwords, confirmation, email/code/token, identity/profile fields,
           errors, and responses remain in React memory only and are empty after refresh
  progress starts: account step
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
         GET /api/accounts/users/{id}/review-history/
  reads param: ?filter=pending   (pre-selects tab; used in email approval links)
  writes: POST /api/accounts/users/{id}/reconcile-verification/
          POST /api/accounts/users/{id}/reject/
          POST /api/accounts/users/{id}/suspend/
  shows: separate email, phone, contact, account, cleaner-marketplace,
         full-contact, decision-history, and evidence-exclusion state
  NOT YET: manual cleaner evidence verification (S1-D02)

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
          POST   /api/properties/images/                      (upload + normalize photos)
          DELETE /api/properties/images/{id}/                 (remove photo)
          POST   /api/properties/parse-ics/                   (bounded file-only ICS upload → parsed events)
          POST   /api/marketplace/jobs/                       (post job / ICS bulk create)
          POST   /api/marketplace/jobs/{id}/publish/          (draft → open)
          POST   /api/marketplace/jobs/{id}/cancel/           (structured cancellation)
          GET    /api/marketplace/jobs/{id}/available-actions/
          GET    /api/marketplace/lineages/{id}/chronology/
          DELETE /api/marketplace/jobs/{id}/                  (409; use cancellation)
          POST   /api/marketplace/applications/{id}/accept/   (accept → creates assignment)
          POST   /api/marketplace/applications/{id}/reject/   (decline application)
          POST   /api/feedback/reviews/                       (review cleaner via ReviewModal; body: job_id, reviewee_id)
  notes:
    - Host no longer marks/confirms completion — the cleaner does. Host's role post-completion is to review.
    - A review.requested notification deep-links here via ?reviewJob=<id>, opening ReviewModal (double-blind two-way window)
    - Job form uses separate date + start/end time fields (not datetime-local)
    - Summary cards are <button> elements driving appFilter state (pending/active/completed/open)
    - hostRatingAvg = avg of reviews where reviewee === me.id (cleaner-written reviews of the host; revealed only)

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
          POST /api/marketplace/jobs/{id}/complete/           (mark done — single-step completion)
          POST /api/feedback/reviews/                         (review host via ReviewModal; body: job_id, reviewee_id)
  notes:
    - Cleaner marking done completes the job outright (no host confirm); a review.requested
      notification deep-links via ?reviewJob=<id> into the ReviewModal double-blind window

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
| POST | `/api/accounts/users/{id}/reconcile-verification/` | Admin | ✅ — stored-state reconciliation; 409 when prerequisites are incomplete |
| POST | `/api/accounts/users/{id}/reject/` | Admin | ✅ — pending only; expected state + neutral reason required |
| POST | `/api/accounts/users/{id}/suspend/` | Admin | ✅ — pending/approved; expected state + neutral reason required |
| GET | `/api/accounts/users/{id}/review-history/` | Admin | ✅ — restricted transition history |
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
| GET/HEAD | `/api/properties/images/{id}/content/` | Object-authorized owner/admin/assigned participant | ✅ — private, no-store |
| GET/POST | `/api/properties/calendar-connections/` | Host | ✅ |
| GET/POST | `/api/properties/reservations/` | Host | ✅ |
| POST | `/api/properties/parse-ics/` | Active approved host / platform admin | ✅ — file-only, throttled, no-store |

### Marketplace

| Method | Route | Auth | Status |
|---|---|---|---|
| GET/POST | `/api/marketplace/batches/` | Host | ✅ |
| GET/POST | `/api/marketplace/jobs/` | Host/Cleaner | ✅ |
| GET | `/api/marketplace/public-demand/` | None | ✅ — canonical city/zone aggregate only |
| GET | `/api/marketplace/open-job-locations/` | None | Deprecated alias — identical aggregate body; sunset 2026-10-15 |
| POST | `/api/marketplace/jobs/{id}/publish/` | Host | ✅ |
| POST | `/api/marketplace/jobs/{id}/cancel/` | Authorized host/direct cleaner/admin | ✅ — agency recovery writes explicitly unsupported |
| GET | `/api/marketplace/jobs/{id}/available-actions/` | Authorized participant/admin | ✅ — server-derived |
| GET | `/api/marketplace/lineages/{id}/chronology/` | Authorized participant/admin | ✅ — disclosure-tiered |
| DELETE | `/api/marketplace/jobs/{id}/` | Authorized participant | ✅ — stable 409; use cancellation |
| POST | `/api/marketplace/jobs/{id}/complete/` | Cleaner/Admin | ✅ — single-step completion; host no longer confirms |
| GET | `/api/marketplace/calendar/` | Required | ✅ |
| GET/POST | `/api/marketplace/applications/` | Host/Cleaner/Agency | ✅ |
| POST | `/api/marketplace/applications/{id}/accept/` | Host | ✅ — overlapping cleaner returns private structured 409 |
| POST | `/api/marketplace/applications/{id}/reject/` | Host | ✅ |
| POST | `/api/marketplace/applications/{id}/withdraw/` | Cleaner/Agency | ✅ |
| POST | `/api/marketplace/applications/{id}/accept-offer/` | Offered Cleaner/Agency | ✅ — overlapping cleaner returns private structured 409 |
| POST | `/api/marketplace/applications/{id}/decline-offer/` | Offered Cleaner/Agency | ✅ |
| GET/READ | `/api/marketplace/assignments/` | Required | ✅ |
| POST | `/api/marketplace/assignments/{id}/assign-member/` | Agency | ✅ — immutable after first member delegation; overlapping member returns private structured 409 |
| GET/POST/DELETE | `/api/marketplace/favourites/` | Host | ✅ — create targets public-eligible cleaners only; historical rows remain visible to owner |

Marketplace disclosure tiers are server-enforced. Anonymous demand contains
only canonical city/zone IDs and names plus aggregate counts. Marketplace-
eligible cleaners and eligible approved agencies receive only the S1-D04 evaluator
allowlist (job ID, canonical location, exact schedule, proposed price/currency,
bedrooms, square metres, status, and `can_apply`). Active assigned participants
add only the minimum operational property/address/instructions/agreed-price,
workflow/display fields, and protected primary image. Completed or otherwise
retained worker records use the `history` tier: evaluator fields plus host
display, agreed price, and assignment history, but no property name/address,
image, or instructions. Coordinates remain private in every worker tier.

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
| GET | `/api/connections/{id}/shared/` | Accepted connection; active/approved requester; worker requester also evaluator-eligible | ✅ — no-store current-assignment allowlist only |

The shared-work response contains property `name`, `city`, and `cleanings`
count plus cleaning `job_id`, `property_name`, `scheduled_start`, `status`,
`agreed_price`, and `currency`. It excludes address, image, instructions,
coordinates, host identity, and free text, and never includes cancelled or
completed assignments.

### Other

| Method | Route | Auth | Status |
|---|---|---|---|
| GET/POST | `/api/feedback/reviews/` | Required | ✅ — two-way, double-blind. POST body: `job_id`, `reviewee_id`, `rating`, `comment`. GET returns own reviews + received reviews only once revealed (both submitted, or 14-day window closed) |
| GET | `/api/notifications/notifications/` | Required | ✅ |
| GET | `/api/calendars/conflicts/` | Required | ✅ |
| GET | `/api/locations/cities/` | None | ✅ |
| GET | `/api/locations/cities/{city_slug}/zones/` | None | ✅ |
| GET | `/api/locations/cities/{city_slug}/zones.geojson/` | None | ✅ |
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

EVENT: account.approved                            ✅ implemented
  ├──► SIDE EFFECT: deterministic AuditLog transition row
  └──► ON COMMIT: deduplicated in-app notification dispatch

EVENT: cleaner.eligible                           ✅ implemented
  ├──► SIDE EFFECT: deterministic AuditLog transition row
  └──► ON COMMIT: deduplicated in-app notification dispatch

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

EVENT: job.completed                               ✅ implemented
  │     trigger: assigned cleaner (or admin) marks done — single step, no host confirm
  ├──► TASK: send_job_completed_email              sends via Resend to host
  ├──► SIDE EFFECT: assignment.completed_at set; cleaner_completed_at + host_completed_at stamped; job → completed
  └──► SIDE EFFECT: review.requested in-app Notification to BOTH host and cleaner
                   (metadata {job_id, reviewee_id}; deep-links to the review window)

EVENT: review.requested                            ✅ implemented
  └──► SIDE EFFECT: NotificationBell deep-links to the review window
                   (/host?...&reviewJob=ID for hosts, /cleaner?...&reviewJob=ID for cleaners)

EVENT: review.submitted                            ✅ implemented
  ├──► SIDE EFFECT: CleanerProfile.rating recalculated from REVEALED reviews only
  ├──► IF counterpart review exists → both reviews revealed; review.submitted ("Reviews are now visible") to both
  └──► ELSE → review.requested prompt sent to the counterpart so they unlock each other's
      NOTE: private issue reports are admin/internal only; they do not create public-review prompts,
            reveal counterpart reviews, or contribute to public ratings.

EVENT: connection.request / connection.accepted    ✅ implemented (apps.connections)
  └──► SIDE EFFECT: create_notification to the other user; Connections badge polls unread-count

EVENT: connection.message_sent                     ✅ implemented
  └──► SIDE EFFECT: create_notification (message.received) to the recipient; bumps Connection.updated_at;
                   frontend thread groups messages with date separators

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

### City / ServiceZone / ServiceZoneGeometry
```
City:
slug, name_bg, name_en, country_code, is_active

ServiceZone:
city (FK), slug, name_bg, name_en, legacy_names[], is_active

ServiceZoneGeometry:
service_zone (1:1), geometry (GeoJSON), source, updated_at
```

Sofia location rules:
- The canonical catalog contains 144 exact ID/name pairs from `districits_sofia/sofia_districts_ready.geojson`.
- Sofia zone slugs are stable `osm-N` values, producing IDs such as `sofia:osm-1`.
- Canonical names preserve prefixes such as `кв.` and `ж.к.`; Sofia `legacy_names` remain empty.
- `frontend/lib/sofiaDistricts.ts` and `frontend/public/maps/sofia/districts.geojson` must stay identical to the canonical source.

### AgencyProfile
```
user (1:1), company_name, service_areas[],
member_count (computed), bio
```

### Property
```
host (FK→HostProfile), name, address, city, country,
service_zone (nullable FK→ServiceZone; required for new/relocated Sofia properties),
timezone (default: Europe/Sofia),
default_cleaning_duration_minutes, default_price_eur,
cleaning_instructions, access_notes
```

Operational `PropertyImage` files are private. API serializers expose a protected
`/api/properties/images/{id}/content/` URL, never a raw storage path. Owners and
admins may read owned images; active approved/verified assigned participants may
read only the primary image for a current non-cancelled assignment. Every raw
`/media/*` route returns 404. Approved public cleaner profile media remains the
public `profile_image` API/data value and is not `PropertyImage` raw storage.
Every new property image and every changed cleaner signup/profile image is
decoded as a single-frame JPEG/PNG/WebP, bounded, EXIF-oriented, rendered into a
fresh RGB buffer, resized, and re-encoded as metadata-free JPEG. Generated
property filenames never reuse the client filename. Unchanged legacy cleaner
URLs may remain, but a new or different external URL is rejected.

`POST /api/properties/parse-ics/` is the only Stage 1 calendar-import route. It
accepts a bounded multipart `.ics` file and never persists its bytes. Calendar
URL import is disabled: there is no URL endpoint or server-side calendar
network fetcher. Existing external-calendar records are inert, and placeholder
calendar sync tasks perform no network access.

### TurnoverLineage
```
property (protected FK), host (protected FK), created_at, updated_at
```

One lineage represents one genuine turnover need. Its property and host are
immutable, and its attempts/history are protected from physical deletion.

### CleaningJob
```
lineage (protected FK), replaces_job (protected nullable 1:1),
property (protected FK), host (protected FK), title, description,
scheduled_start (datetime UTC), scheduled_end (datetime UTC),
status: [draft | open | assigned | completed | cancelled],
price_eur, published_at, cancelled_at, cancelled_by,
cancellation_reason_code, cancellation_note, cancellation_notice_band,
batch (FK→CleaningBatch, nullable),
source: [manual | ics_import | batch]
```

Uniqueness rule:
- status-conditional uniqueness permits only one actionable
  `(property, scheduled_start, scheduled_end)` row;
- status-conditional uniqueness permits only one actionable job per lineage;
- completed/cancelled historical attempts are excluded from both conditions.

### JobLifecycleEvent
```
lineage (protected FK), job (protected FK), actor (nullable FK),
actor_role_snapshot, event_type, from_status, to_status, reason_code,
audience, occurred_at, request_id, idempotency_key, metadata
```

Events are append-only lifecycle truth. `AuditLog` remains separate security
evidence and is not used as the lifecycle store or required migration source.

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
job (FK), reviewer (FK→User), reviewee (FK→User),
rating (1–5), comment,
private_note, is_private_issue, created_at
```
Visibility (double-blind):
- A review about a user is revealed only when the counterpart public review for the same job exists, OR `assignment.completed_at` is older than `REVIEW_WINDOW_DAYS` (14). The submission window is inclusive at the exact 14-day deadline and closes immediately after it.
- `is_private_issue=True` reports are admin/internal only: they are hidden from normal review lists and public cleaner profiles, normal serializers do not expose `private_note` or `is_private_issue`, and they do not create public-review prompt/unlock notifications.
- `CleanerProfile.average_rating` / `completed_jobs_count` are recomputed from revealed reviews only.

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
| Hardened file-only ICS parsing (`parse-ics/`); URL import absent | ✅ Complete |
| Cleaning job CRUD + publish | ✅ Complete |
| Monthly batch CRUD | ✅ Complete |
| Cleaner applications | ✅ Complete |
| Application acceptance + assignment | ✅ Complete |
| Agency member delegation | ✅ Complete |
| Authoritative cleaner assignment-overlap protection | ✅ Complete — application/direct-offer acceptance and member delegation |
| Job completion (single-step, cleaner/admin; no host confirm) | ✅ Complete |
| Lineage foundation + append-only lifecycle chronology | ✅ Complete (S1-E05 Batch 2) |
| Structured cancellation + assignment interval release | ✅ Complete (S1-E05 Batch 2) |
| Physical job deletion replacement (stable 409) | ✅ Complete (S1-E05 Batch 2) |
| Account-deletion active blocker/history support route | ✅ Complete (S1-E05 Batch 2) |
| Two-way double-blind reviews + revealed-only rating update | ✅ Complete |
| In-app notification records | ✅ Complete |
| Calendar conflict API | ✅ Complete |
| Application-submitted email (Resend) | ✅ Complete |
| Job-completed email (Resend) | ✅ Complete |
| Contact reconciliation + restricted account decision history | ✅ Complete (S1-E02 interim policy) |
| Manual cleaner evidence verification | ⬜ Blocked by S1-D02 |
| Notification triggers (acceptance, rejection, assignment emails) | ⬜ Placeholder |
| iCal feed polling | ⬜ Network-inert placeholder |
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
| Admin contact-reconciliation/reject/suspend panel `/admin` + URL filter | ✅ Complete |
| Host dashboard `/host` — properties section | ✅ Complete |
| Host dashboard `/host` — jobs + calendar | ✅ Complete |
| Host dashboard `/host` — ICS import modal | ✅ Complete |
| Host dashboard — job form (date + start/end time fields) | ✅ Complete |
| Host/direct-cleaner dashboard — policy-authorized cancellation dialog | ✅ Complete |
| Cleaner dashboard — mark-done completion control (host confirm step removed) | ✅ Complete |
| Host dashboard — job completion email to host via Resend | ✅ Complete |
| Host dashboard — application submitted email to host via Resend | ✅ Complete |
| Host dashboard — applications panel (summary cards, filter, pending/active/completed/open) | ✅ Complete |
| Host dashboard — host rating display (avg from cleaner-written revealed reviews) | ✅ Complete |
| Host + Cleaner — two-way double-blind review window (`ReviewModal`, deep-linked via `?reviewJob=`) | ✅ Complete |
| Host dashboard — job activity context in calendar list | ✅ Complete |
| Cookie consent banner | ✅ Complete |
| `apiFetch` — CSRF, Content-Type, FormData-safe | ✅ Complete |
| Cleaner dashboard `/cleaner` | ✅ Complete |
| Agency dashboard `/agency` | ⬜ Not built |
| Landing cleaner browser with city/district filtering | ✅ Complete |
| Separate interim verification states and restricted review history in admin panel | ✅ Complete |
| Manual cleaner evidence verification in admin panel | ⬜ Blocked by S1-D02 |

---

## 10. Critical Rules Index

Rules that must never be broken regardless of task scope.

| # | Rule | Where enforced |
|---|---|---|
| R1 | A job has at most one accepted `Assignment` | Service layer — `marketplace/services.py` |
| R2 | Reviews only after job `completed`; two-way and double-blind (received reviews revealed only when both submit or the 14-day window closes; ratings count revealed reviews only) | `feedback/services.py` + `ReviewViewSet.get_queryset` |
| R3 | Cleaners must be active, stored `approved`, and in the stored marketplace-eligible cleaner state before applying; the legacy `verified` value is not a public identity claim | Service and permission boundaries |
| R4 | Agencies assign only to `active` members, and normal agency delegation is immutable after the first member assignment | Service layer — agency delegation |
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
| R17 | A property/start/end slot and a turnover lineage may each have at most one actionable (`draft/open/assigned`) job; terminal history may share the slot | `CleaningJob` PostgreSQL partial unique constraints + services |
| R18 | Job completion is a single step by the assigned cleaner (or admin) after `scheduled_start` — there is no host confirmation step | `marketplace/services.py` + dashboard guards |
| R19 | Favourites can be created only for public marketplace-eligible cleaners; historical unavailable favourites remain visible to the owning host through safe serializer fields | `accounts.models` eligibility helper + `marketplace/services.py` |
| R20 | All new user-facing strings must ship with both `en.json` and `bg.json` values; keys are English camelCase; values only differ between files | `frontend/messages/` — next-intl v4 |
| R21 | Never use hardcoded UI strings in components — always use `useTranslations` from next-intl | Frontend convention; module-level functions with strings must move inside the component |
| R22 | One concrete cleaner cannot hold overlapping non-cancelled assignments; intervals are half-open and completed work remains interval-authoritative | `marketplace/services.py` worker row lock + assignment overlap query |
