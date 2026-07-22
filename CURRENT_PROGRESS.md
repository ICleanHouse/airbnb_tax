# Current Progress Handoff

Updated: 2026-07-21, S1-E02 interim contact policy implementation.

## Latest Work — S1-E02 Contact-Based Verification (In progress, 2026-07-21)

- ADR-0002 records the owner-approved interim policy: a confirmed email
  satisfies contact verification while phone is not required, and normal
  reconciliation automatically approves the account and activates cleaner
  marketplace access. This does not claim identity, reference, interview, or
  trial-job review; full verification requires both contact timestamps.
- Signup now creates safe pending base state and calls one atomic, row-locked,
  idempotent reconciliation service. Requirement shortcuts are guarded in
  production-like environments and create a permanent restricted evidence
  exclusion. Generic status PATCH writes and the old `/approve/` action are gone.
- Admin reconciliation/reject/suspend/history and user-facing BG/EN status
  surfaces distinguish email, phone, configured contact, account, cleaner
  marketplace, and full-contact states without making an identity claim.
- Additive migrations are `accounts/0019_pilotevidenceexclusion.py` and
  `notifications/0002_notification_deduplication_key.py`. Focused and full
  verification evidence is recorded in
  `docs/testing/s1_e02_account_verification.tdd.md`.
- Verification passed: Django check and migration drift; accounts 85,
  marketplace 181, connections 13, notifications 17, core 11; full backend
  444 with eight expected PostgreSQL skips; PostgreSQL 16 S1-E02 concurrency
  5/5; frontend 53; typecheck; and lint with zero errors/four existing warnings.
- S1-E02 remains **In progress**. Phone OTP,
  manual cleaner evidence, negative cleaner outcomes/restoration, re-review,
  retention, and agency verification remain S1-D02 blockers.

## Latest Work — S1-E05 Lifecycle Foundation (Batch 2, 2026-07-20)

- ADR-0001 and S1-D03 are owner-approved. `TurnoverLineage` now represents one
  turnover need; every `CleaningJob` is a protected immutable attempt with at
  most one protected `Assignment`. `JobLifecycleEvent` is append-only domain
  chronology, separate from `AuditLog`.
- Migrations `0006`–`0008` add nullable lifecycle data, deterministically
  backfill one lineage per legacy job (`lineage_id = job_id`), normalize legacy
  `disputed` states from assignment facts, validate the result, and install
  partial uniqueness for one actionable exact slot and one actionable job per
  lineage. Required backfill values do not depend on audit records.
- Job creation, publication, application/offer acceptance, agency delegation,
  completion, and cancellation use the common lineage-first locking order.
  Cancellation is structured, atomic, idempotent for identical retries,
  releases the active assignment interval, rejects pending applications, and
  records one event, one audit row, and non-sensitive in-app notifications.
- Added explicit `cancel`, `available-actions`, and disclosure-tiered lineage
  chronology endpoints. Physical job deletion now returns stable 409
  `job_deletion_replaced_by_cancellation`. Agency/member recovery writes return
  `agency_recovery_not_supported` before mutation.
- Host and approved direct-cleaner dashboards use server-derived actions and an
  accessible BG/EN cancellation dialog. Account deletion blocks active
  obligations and routes protected history to configured support before logout;
  accounts with no protected marketplace history retain the existing hard-delete
  path. Property/admin cascade deletion of lifecycle history is disabled.
- Verification passed: Django check and migration drift, 31 focused lifecycle /
  migration / deletion tests, all 406 backend tests (three expected skips), all
  47 frontend tests, TypeScript, EN/BG 904-key parity, and ESLint with zero
  errors and five pre-existing warnings. The PostgreSQL-only partial-index suite
  is present but still requires execution against an available PostgreSQL
  service; SQLite is not counted as locking evidence. Evidence:
  `docs/testing/s1_e05_lifecycle_foundation.tdd.md`.
- S1-E05 is **Partially complete**. Reschedule proposals/incidents,
  replacements, disputes/optional messaging, privacy de-identification, and
  agency recovery parity remain separate batches. Agency parity deferral means
  this epic cannot be marked Done.

## Latest Work — S1-E09 Calendar and Upload Security (2026-07-20)

- The Sofia pilot has no calendar URL-import API or UI. The former
  `/api/properties/fetch-ics-url/` route, `FetchIcsUrlView`, `urllib` fetcher,
  host paste-link mode, dead state/styles/translations, and telemetry allowlist
  entries were removed. `ExternalCalendarConnection` data may remain, but both
  calendar sync tasks are network-inert placeholders.
- `POST /api/properties/parse-ics/` remains file-only and preserves its event
  list response. It is restricted to active approved hosts and platform admins,
  limited to 1 MiB/1,000 VEVENTs/255-character UIDs/500-character summaries,
  throttled at 30 attempts per authenticated user per hour, audited with
  metadata-only reason codes/counts, and returned with private/no-store headers.
- Property image writes and cleaner signup/profile image changes share a Pillow
  decode/orient/render/re-encode service. Only decoded JPEG/PNG/WebP single-frame
  inputs are accepted; size, side, pixel, animation, truncation, and
  decompression-bomb limits are enforced. New output is metadata-free RGB JPEG
  with generated filenames. Property images fit within 2048 square; cleaner
  images use the existing 720-square center crop.
- The object-authorized property `content_url`, raw `/media/*` denial, and
  approved public cleaner-image projection are unchanged. Identical legacy
  cleaner URLs survive unchanged, new external URLs are rejected, and image
  removal remains supported. Existing media was not bulk rewritten. No
  verification, incident, dispute, support, or evidence upload was added.
- Verification passed: Django check and migration drift; 145 focused app tests;
  373 full backend tests (one skip); 43 frontend tests; TypeScript; ESLint with
  zero errors and five existing warnings; focused Ruff; and dead-path/security
  searches. No migration was added. Evidence:
  `docs/testing/s1_e09_upload_security.tdd.md`.

## Latest Work — S1-E04 Cleaner Schedule Protection (2026-07-15)

- Application acceptance and direct-offer acceptance now lock the current
  concrete cleaner and reject any non-cancelled direct or delegated assignment
  whose job overlaps the candidate half-open interval. Agency application
  acceptance still creates the job's single agency assignment without treating
  the agency account as a cleaner schedule; the check begins at member
  delegation.
- Agency delegation preserves immutable/idempotent behavior, reloads and locks
  the proposed member, cleaner profile, and active membership, then checks both
  `Assignment.cleaner` and `Assignment.assigned_member` occupancy before saving.
- `cancelled_at` releases an interval. `completed_at` and completed job status do
  not broadly remove a scheduled interval from overlap evaluation. Back-to-back
  work remains valid through `existing_start < candidate_end` and
  `existing_end > candidate_start`.
- All three APIs return HTTP 409 with only
  `{"code":"cleaner_schedule_conflict","detail":"The cleaner is unavailable for this time range."}`
  for this typed conflict. Existing marketplace errors retain their prior 400
  shape.
- No migration was added. Existing worker foreign-key indexes are retained;
  additional worker/range indexes require PostgreSQL query-plan evidence.
- Verification: focused schedule suite 14/14 on SQLite with the one locking test
  skipped; full marketplace suite 151/151 with the same skip; accounts 37/37;
  PostgreSQL 16 concurrency test 1/1; Django check and migration-drift checks
  pass. Changed marketplace files pass Ruff. Whole-app marketplace Ruff still
  reports two pre-existing unused locals in `seed_demo_data.py`.
- Assigned-job rescheduling and emergency-replacement acceptance are not
  implemented. Their future services must acquire the same concrete-worker lock
  and invoke the overlap check inside their mutation transaction. Availability
  fields and the higher-priority availability-documentation mismatch were left
  unchanged as a separate owner decision.

## Latest Work — Public Demand, Property Media, and Signup Secrets (2026-07-14)

- Anonymous discovery now uses canonical
  `GET /api/marketplace/public-demand/?city=sofia`, returning only canonical
  city/Sofia-zone names and aggregate counts. The old
  `/open-job-locations/` route is an identical safe compatibility alias with
  deprecation headers and a 15 October 2026 sunset. The historical per-job map
  sections below are superseded and must not be restored.
- S1-D04 evaluator disclosure is an explicit server allowlist for approved
  cleaners in the stored marketplace-eligible state and eligible approved
  agencies. Only a current active
  assignment receives the approved operational extension. Completed or other
  retained worker records use the `history` tier, which removes property name,
  address, image, and instructions while retaining evaluator, non-contact host display,
  agreed-price, and workflow history. Exact coordinates remain private in every
  worker tier.
- Sofia properties use stored canonical `sofia:osm-1..144` service-zone IDs.
  Operational `PropertyImage` content is object-authorized and streamed through
  `/api/properties/images/{id}/content/`; every raw `/media/*` path is denied.
  Approved public cleaner profile media remains the public `profile_image`
  API/data value and is not `PropertyImage` raw storage.
- Accepted connections expose shared work only when the requesting participant
  is active/approved and, when the requester is the worker, is a
  marketplace-eligible evaluator. The current non-cancelled-assignment response is no-store
  and contains only property name/city/count and cleaning job ID, property name,
  schedule, status, agreed price, and currency; no address, image, instructions,
  host identity, coordinates, or free text is included.
- Signup refresh recovery persists only `version`, `savedAt`, `role`,
  `citySlug`, `selectedZoneIds`, and `experienceLevel` for 24 hours. Passwords,
  confirmation, codes, tokens, identity/profile data, errors, and responses are
  memory-only and empty after refresh. Legacy sensitive records are immediately
  removed/sanitized.
- API requests/responses use no-store controls; the release sends
  `Clear-Site-Data: "cache"` on affected responses. Frontend/backend telemetry
  is rebuilt from controlled allowlists and omits bodies, queries, raw errors,
  addresses, credentials, tokens, and private IDs. Remove the cache-purge header
  no later than 2026-10-15 (the compatibility-alias sunset); never extend it to
  storage or cookies. Request IDs are accepted only as `req_` plus 32 lowercase
  hexadecimal characters, with invalid inbound values replaced.
- `Security Audit Plan.txt` is absent from the checked-out repository. The
  supplied audit-plan requirements and Sofia pilot plan were used as external
  planning inputs.

Final full-suite verification for this change is recorded in the release
handoff rather than the historical command results below.

Updated: 2026-06-25, after the full frontend i18n localisation with next-intl v4.

## Latest Work — Full Frontend i18n Localisation (2026-06-25)

Completed the full Bulgarian/English localisation of the Next.js frontend using **next-intl v4.13.0**. Bulgarian is the default locale (no URL prefix); English is `/en/…`.

### Infrastructure (C0–C1)

- Installed `next-intl` v4 and wired `createNextIntlPlugin` in `frontend/next.config.mjs`.
- Created `frontend/i18n/request.ts` (server config), `frontend/i18n/routing.ts` (locale list + `defaultLocale: "bg"`, `localePrefix: "as-needed"`), and `frontend/middleware.ts` (locale-detection middleware).
- Moved all routes under `frontend/app/[locale]/` (mirroring the existing structure without path changes for the default Bulgarian locale).
- Bootstrapped `frontend/messages/en.json` (English, source of truth) and `frontend/messages/bg.json` (Bulgarian).
- Fixed a post-migration stale-cache issue in `frontend/i18n/request.ts` — next-intl v4 uses `import()` directly, not a `getRequestConfig` wrapper.

### Pages and components localised (C2–C12)

| Chunk | Scope |
|---|---|
| C2 | Shared nav + landing page (`nav.*`, `landing.*`), `AudienceToggle.tsx` |
| C3 | Login + full signup wizard (`login.*`, `signup.*`) — all 7 steps, validation, errors |
| C4–C5 | Host dashboard — topbar, rail, calendar, job form, property form, ICS import, all modals (`host.*`) |
| C6–C7 | Cleaner dashboard — topbar, tabs, profile form, all options and validation (`cleaner.*`) |
| C8 | Admin panel (`admin.*`) |
| C9 | `CleanerBrowser`, `CleanerProfileCard`, `CleanerProfileModal`, `RatingStars`, `AppdashGrid` |
| C10 | `ReviewModal`, `NotificationBell`, `Connections`, `ConnectButton`, `JobOfferModal` |
| C11 | `AccountDeletionPanel`, `AreaDemandPanel`, `OpenJobMap`, `DistrictMapSelector`, `PropertyLocationPicker`, `DistrictChecklist`, `DistrictSelectedTags` |
| C12 | `/cleaners` directory page, `/app` workspace page |

### Key patterns established

- ICU message syntax: `{count, plural, one {# item} other {# items}}` for all plurals.
- Module-level functions with hardcoded strings moved inside components as closures over `t` (examples: `timeAgo` in `NotificationBell`, `fmtDateSeparator` in `Connections`, `statusCopy` in `/app/page.tsx`).
- Arrays via `t.raw("key") as string[]` (months, weekdays, calDays).
- Dynamic key lookup via `t(\`subkey.${variable}\` as Parameters<typeof t>[0])`.
- `useTranslations` hook is stable — safe to include in `useEffect`/`useMemo` deps.
- Also fixed a latent bug: `en.json` and `bg.json` had duplicate top-level `"components"` keys (cookie banner was stranded in an earlier block from C1). Both files are now merged.

### Verification

`npm.cmd run typecheck` → 0 errors. `npm.cmd run lint` → 0 errors, 5 pre-existing warnings (unchanged from before i18n work).

### Documentation updated

`CLAUDE.md` — new Localisation section (namespace map, usage patterns, domain glossary).
`DEV.md` — new Localisation section (infrastructure files, adding new strings, namespace map, glossary).
`TGN.md` — updated "last updated" date; added R19 and R20 to the Critical Rules Index.

---

Updated: 2026-06-20, after the two-way double-blind review window + cleaner-only completion change, and the map property-pin "all open jobs + connect host" addition.

## Latest Work — Cleaner-Only Completion + Two-Way Double-Blind Reviews (2026-06-20)

The job-completion + review flow was reworked end to end:

- **Cleaner-only completion (host confirm step removed)**: `complete_job` (`apps/marketplace/services.py`) now treats the assigned cleaner (or an admin) marking a job done as the single completion event — the job goes straight to `completed`; there is no separate host acknowledgement. The host's "mark done / confirm" button was removed from the host dashboard. Cleaner completion is still gated to after `scheduled_start`.
- **Both parties prompted to review**: on completion, `complete_job` sends a `review.requested` in-app notification to **both** the host (review your cleaner) and the cleaner (review the host), each carrying `{job_id, reviewee_id}`. `send_job_completed_email` still fires.
- **Two-way double-blind reviews** (`apps/feedback/services.py`): `submit_review` enforces a `REVIEW_WINDOW_DAYS = 14` window. A review *about* a user is revealed only once the counterpart review for that job exists (both sides reviewed) **or** the 14-day window has closed (`revealed_received_reviews`). `ReviewViewSet.get_queryset` returns your own reviews always, received reviews only when revealed. When the second review lands, both parties get a `review.submitted` "Reviews are now visible" notification; otherwise the counterpart gets a `review.requested` prompt.
- **Revealed-only ratings**: `refresh_cleaner_rating` averages only revealed reviews, so a cleaner's public rating/count never leaks an unrevealed score.
- **Shared review window UI** (`frontend/components/ReviewModal.tsx`): one modal shows "Your review of X" (form or submitted state) + "X's review of you" (shown when revealed, otherwise a locked placeholder). Mounted in **both** `HostDashboard.tsx` and `CleanerDashboard.tsx`; opened from the completed-job "Leave a review" trigger and via the `?reviewJob=<id>` deep link.
- **Notification routing** (`frontend/components/NotificationBell.tsx`): `review.requested` now routes to the correct dashboard based on the current path — `/host?section=applications&appFilter=completed&reviewJob=…` for hosts, `/cleaner?section=assignments&reviewJob=…` for cleaners (previously hard-coded to `/cleaner`).
- **Verification**: `apps.feedback` + `apps.marketplace` backend suites pass (36 tests); frontend `npm.cmd run typecheck` + `npm.cmd run lint` clean.

## Historical — Map Property Pin → All Open Jobs + Connect Host (superseded 2026-07-14)

- This historical per-property marker/host-connect design was removed in full on
  2026-07-14. Neither public response now contains a property/job/host ID, and
  the public component cannot fetch job detail or start an application.

## Historical — Landing Work Map + Cleaner Work Discovery (superseded 2026-07-14)

- **Landing audience toggle**: `/` now supports the public host path (`Find a cleaner`) and cleaner path (`Find cleaning work`). The hero content is centered with tighter 40px vertical padding.
- **Removed for privacy**: the historical per-job Leaflet map, property pins,
  photo/address/price/schedule popups, and map application overlay were removed
  on 2026-07-14. Public UI now renders canonical district aggregates only.
- **Compatibility route redefined**: `/api/marketplace/open-job-locations/`
  now returns the identical safe `/public-demand/` aggregate body and carries
  deprecation/sunset headers. It must never regain the historical marker shape.
- **Applications moved behind evaluator authorization**: approved verified
  cleaners and eligible approved agencies evaluate/apply from authenticated
  dashboard projections only.
- **Canonical city filtering**: the city dropdown sends only canonical slugs;
  public job-derived coordinates are not used for viewport or city inference.
- **Authenticated CTA cleanup**: the bottom cleaner signup CTA in the work panel is guest-only; authenticated users no longer see it.
- **Historical verification superseded**: current privacy regressions assert the
  aggregate schema and recursive absence of private fields.

## Latest Work — Sofia Districts · Cleaner UX · Shared Account Menus (2026-06-15/16)

- **Canonical Sofia districts**: `districits_sofia/sofia_districts_ready.geojson`, `frontend/lib/sofiaDistricts.ts`, and `frontend/public/maps/sofia/districts.geojson` now match exactly: 144 unique features with stable IDs `sofia:osm-1` through `sofia:osm-144`. Exact canonical names are preserved, including `кв.` and `ж.к.` prefixes.
- **Removed old Sofia mappings**: deleted the obsolete `backend/apps/locations/fixtures/sofia_service_zones.geojson`; Sofia runtime zones have empty `legacy_names`; migration `locations.0002_remove_legacy_sofia_service_zones` removes old Sofia rows while retaining current `osm-1..144` rows and clearing their aliases.
- **Search/profile-map alignment**: both public cleaner-search dropdowns and the cleaner-profile district map load Sofia through `loadServiceZones`. Search dropdowns sort by canonical Bulgarian name, display exact prefixed names, and keep stable zone IDs as option values.
- **Seed script aligned**: `a1_populate_tables_test.py` validates the 144-feature GeoJSON, synchronizes Sofia `ServiceZone`/geometry rows, removes obsolete zones/aliases, and seeds cleaner service areas and property neighborhoods from canonical names.
- **Cleaner profile cleanup**: removed cleaner Availability and cleaner-profile summary UI/data usage.
- **Jobs & Calendar count**: warning count excludes completed jobs.
- **Connections chat separators**: messages are separated by date; Today is labeled `Today`, current-year separators include day/month plus start time, and older-year separators include day/month/year.
- **Authenticated header controls**: homepage no longer exposes the user-name pill or top-level Log out action. Homepage, host dashboard, and cleaner dashboard use notification bell + profile icon; Profile, persistent BG/EN segmented language slider, and Log out live inside the profile menu. Host profile-form duplicate language selector was removed.
- **Verification**: Sofia source/catalog/public-map identity audit passed; frontend typecheck and targeted lint passed; backend locations/account tests passed. A final Next build can fail when the generated `.next` cache is concurrently used or corrupted; stop dev, remove `.next`, then rebuild.

## Latest Work — Property Rail · Income/Expenditure · Connections + Chat (2026-06-08)

ClickUp: "Property rail · Income/Expenditure · Connections & in-app chat (3 phases)" (`869dky9yp`, complete). Verified: Django `check` clean; `apps.connections` + `apps.marketplace` = 34 tests OK; frontend `typecheck` + `lint` clean.

- **Cleaner dashboard rebuilt to mirror host (earlier in session)**: tabs are now **Jobs & Calendar · Applications · Offers** (Profile in the account menu). Calendar reuses the host design with property thumbnails only for current operational assignments; Applications is a host-style 5/6-card `host-appdash-grid` (Pending/Active/Completed/Open/Rating + Income). `features/cleaner/CleanerDashboard.tsx`.
- **Calendar privacy projection (supersedes the old raw-media contract)**: a current `assigned` item may expose a first-photo `property_image` only as `/api/properties/images/{id}/content/`. A completed/non-operational worker item is `history` and omits property name, address, image, and instructions. `AssignmentSerializer.cleaner_profile_image` is the separately approved cleaner-profile API/data value, not a raw `PropertyImage` path. No payment fields.
- **Phase 1 — Property navigation rail (host)**: replaced the Properties topbar tab + card grid with a slim left **rail** (`.host-rail`): All → property thumbnails → footer pencil(edit)+plus(add). Selecting a property filters Jobs & Calendar + Applications **in place** via `selectedPropertyId` (state renamed to `all*` with derived scoped `jobs/applications/assignments` memos). "Post a job" pre-scopes to the selection. Mobile ≤860px → dropdown selector. Topbar tabs now Jobs & Calendar + Applications. `features/host/HostDashboard.tsx`, `globals.css` (`.host-rail*`, `.host-workspace*`). NOTE: the earlier `/host/properties/[id]` route was **removed**.
- **Phase 2 — Income/Expenditure card**: 6th appdash card next to "My rating" — host **Spent** / cleaner **Income** = Σ `agreed_price` of completed assignments (+ "from N cleanings"). Shared `frontend/lib/money.ts` (`money`, `formatMoney`); `.host-appdash-card--money/--static`.
- **Phase 3 — Connections + in-app chat (LinkedIn-style)**: new `backend/apps/connections/` app — `Connection` (requester/addressee, status pending/accepted/declined/removed, unique pair) + `Message` (body, read_at). Services (host↔cleaner-only pairing, no self-connect, reverse-request auto-accepts, messaging only on accepted) + audit + notifications. Endpoints `/api/connections/`: list · create(request) · `accept`/`decline` · DELETE(remove) · `messages` (GET marks read / POST send) · `read` · `unread-count` · `shared` (collaborated properties+cleanings). Migration `0001_initial`; registered in settings + root urls. Frontend: **"Connections" button next to Applications** in both navs (`components/Connections.tsx`, polled badge) → right drawer (Requests / Connected / Pending) → polled chat thread + Shared panel; reusable `components/ConnectButton.tsx` wired into the cleaner profile modal. Chat is **polled** (no websockets). Types `frontend/types/connection.ts`; CSS `.connections-*`/`.chat-bubble*`/`.connect-btn*`.

## Latest Work — Host Calendar Thumbnails & UX Follow-ups (2026-06-03)

ClickUp task: "Host calendar redesign — compact thumbnail-driven day grid" (`869djg405`).

- **Calendar day thumbnails** (`frontend/features/host/HostDashboard.tsx` + `frontend/app/globals.css`): the Jobs & Calendar day grid now renders up to **3** compact job thumbnails per day (then a `+N` chip) instead of flat status dots. Draft/open jobs show the **property** photo (or a `Building2` icon fallback); **assigned** jobs add a small **cleaner-avatar badge** (avatar image, or the cleaner's initial). Job status is preserved as an inline `box-shadow` color ring using the existing `STATUS_COLOR` tokens; the legend still uses `.host-cal-dot`. New classes `.host-cal-thumbs` / `.host-cal-thumb` / `.host-cal-thumb--icon` / `.host-cal-thumb-avatar` / `.host-cal-thumb-more` + `≤620px` responsive shrink. Tokens/typography unchanged.
- **Backend avatar field** (`backend/apps/marketplace/serializers.py`): `AssignmentSerializer` exposes a read-only `cleaner_profile_image` (safe `SerializerMethodField`; returns the cleaner's `profile_image` string or `null`, handles agency cleaners with no `cleaner_profile`). Flows into the nested `CleaningJobSerializer.assignment` too. No migration. `profile_image` is a `TextField` data-URL/URL string used directly as `<img src>`.
- **"Post a job" date prefill** (`HostDashboard.tsx → openJobForm`): creating a job without an explicit day now defaults the date to the **selected calendar day** if one is selected, else **today**. Covers the right-side "Post a job" button, property-card "Post a job", and side-panel "Post one" (date no longer blank); clicking a specific empty day still uses that day.
- **Notification bell → Applications** (`frontend/components/NotificationBell.tsx → notificationHref`): on the host, application/offer notifications deep-link into the Applications section — `application.submitted` / `application.withdrawn` → `?section=applications&appFilter=pending`; `offer.accepted` → `appFilter=active`; `offer.declined` → `section=applications`. Review notifications keep their existing routing.
- **Pending-application dot on the calendar** (`HostDashboard.tsx` + `globals.css`): a small brand-pink dot (top-right of the thumbnail, white-ringed, like the notification badge) appears on any calendar job that has pending cleaner applications, sourced from `jobActivityMap.pendingApps`. New `.host-cal-thumb-pending` class + responsive shrink; hover shows "N pending application(s)".
- **Verification**: `python manage.py check` clean (serializer-only); `npm.cmd run typecheck` + `npm.cmd run lint` clean.
- **Follow-up (out of scope)**: `FavouriteCleanerSerializer.get_profile_image` calls `.url` on the `profile_image` TextField — would `AttributeError` if a favourited cleaner ever has a non-empty image; worth fixing later.

## Latest Work — Direct-Offer Conflicts & Host Applications UI (2026-06-03)

- **Robust direct-offer endpoint**: `POST /api/marketplace/jobs/offer-to-cleaner/` (action `offer_to_cleaner` on `CleaningJobViewSet`, `OfferToCleanerSerializer`). The `offer_job_to_cleaner` service reuses an actionable draft for the exact `(property, scheduled_start, scheduled_end)` slot or creates a new lineage/job through the lifecycle service, then delegates to `offer_job`. This avoids collisions with the actionable exact-slot partial constraint. `frontend/components/JobOfferModal.tsx` makes a single POST to this endpoint.
- **Same property + same-day conflict guards** (`apps/marketplace/services.py`), applied to **both** `offer_job` (host offers) and `submit_application` (cleaner applications), day computed in Europe/Sofia:
  - `_ensure_no_assigned_job_same_property_day` — blocks when the cleaner already holds an active (non-cancelled) `Assignment` for that property on that day.
  - `_ensure_no_pending_offer_same_property_day` — blocks when the cleaner already has a **pending** offer/application for that property on that day (any time slot), preventing two pending offers from both being accepted (double-booking).
  - The existing exact-slot duplicate ("...for this job.") and declined-offer reactivation in `offer_job` are unchanged.
- **Host Applications — sent offers can't be self-approved** (`frontend/features/host/HostDashboard.tsx`): pending rows with `origin=host_offered` no longer show an **Accept** button (only the cleaner accepts those). They show a gold "Offer sent · awaiting cleaner" badge (`.host-app-badge--offer` in `globals.css`) and a relabeled **Withdraw** button. Added `origin` to the `CleanerApplication` TS interface.
- **Tests**: `apps/marketplace/tests/test_offers.py` adds `test_offer_blocked_when_cleaner_assigned_same_property_same_day` and `test_offer_blocked_when_cleaner_has_pending_offer_same_property_same_day` (fixed 09:00/13:00 same-day window to avoid midnight straddle). Full `test_offers` suite (13 tests) passes; `manage.py check` clean; frontend `npm.cmd run typecheck` + `lint` clean.

## Latest Work — Marketplace Correctness Fixes (2026-06-03)

- **Cleaner city filtering**: cleaner profiles now persist and expose `city`. The public `CleanerBrowser` filters by saved city first and keeps service-area district inference only as a fallback for older blank-city cleaner profiles.
- **Seed data guarantees**: `a1_populate_tables_test.py` now asserts unique host/cleaner names and emails, creates one or more properties per host at different addresses, and gives every cleaner at least one service district.
- **Seeded property photos**: property seed photos are generated as visible JPEGs and old `property_*.*` seed media is cleaned before re-seeding. Property serializers now expose only object-authorized `/api/properties/images/{id}/content/` values; raw `/media/*` URLs are denied and are not proxied by Next.js or Caddy.
- **Completion timing**: after acceptance, nobody can mark a job done before its scheduled start. Cleaners can mark done once start time is in the past, even if the end time is still ahead; hosts/admins can confirm completion only after the scheduled end time.
- **Duplicate jobs**: a host cannot create the same job twice for the same property and exact start/end time; this is enforced by serializer validation and a database unique constraint.

## Latest Work — Cleaner Dashboard/Profile Polish (2026-06-02)

- **Cleaner completion + feedback flow**:
  - Job completion tracks both cleaner and host confirmation before feedback is unlocked.
  - Cleaner can mark done after scheduled start time; host/admin completion is blocked until scheduled end time.
  - Cleaner can leave host feedback only after both sides mark the assignment completed.
  - Cleaner notifications route directly into the matching feedback form / received review location.
  - Cleaner calendar shows completed assignments as `Completed` instead of `Assigned`.
- **Cleaner calendar/application UI fixes**:
  - Merged the duplicate `Applications` bar into `Calendar`.
  - Rejected application chips and calendar markers now use a warning-orange state instead of the generic brand/neutral styling.
- **Live refresh behavior tuned**:
  - Removed timed auto-refresh polling that was wiping in-progress form input.
  - Focus/visibility/online refresh behavior remains.
- **Cleaner profile validation + UX**:
  - Profile field errors now render inline on the actual offending field instead of only at the top of the form.
  - Birth date on the cleaner profile now uses the same compact picker pattern as signup.
  - Cleaner profile birth date enforces the 18+ rule during editing/saving.
  - Fixed cleaner profile birthdate picker layout issues inside the profile form (double-field look, narrow-screen overflow, flex sizing bugs).
  - Fixed cutoff-year birthdate picker behavior so month/year navigation no longer gets stuck in confusing states.
- **Cleaner account menu/header**:
  - Cleaner topbar account control now uses an icon trigger with the cleaner name shown inside the opened dropdown above `Profile`.

## Latest Work — Landing Redesign, Cleaner Browser & UI Refinements (2026-06-02)

- **Minimal landing page** (`frontend/app/page.tsx`): removed the old marketing sections (hero search panel, how-it-works, trust band, join, market strip). Now a **compact photo hero + public cleaner browser**. Logged-out users see Log in/Sign up + standalone language selector; authenticated users see role-aware Dashboard/Admin, notification bell, and profile-icon menu. Removed the dead hamburger menu and set `.site-header` grid to `1fr auto` so actions pin right.
- **Shared `CleanerBrowser.tsx`**: fetches all verified+approved cleaners once and filters **client-side by City + dependent District**. Sofia districts come from the same stable `loadServiceZones` catalog used by the cleaner-profile map; dropdown values are stable zone IDs and labels retain canonical prefixes. City filtering uses each cleaner's saved `city` first and falls back to district inference from `service_areas` for older blank-city profiles. Powers both `/` and `/cleaners`.
- **Login redirect** (`frontend/app/login/page.tsx`): on success fetches `/me/` and forwards to the role dashboard (admin→`/admin`, host→`/host`, cleaner→`/cleaner`, agency→`/agency`, else `/app`).
- **Property card "Post a job"** (`frontend/app/host/page.tsx`): Properties-tab cards now have Edit (left, outline) + Post a job (right, brand-filled) pill buttons; `openJobForm` takes an optional `presetPropId` to pre-scope the job modal to that property. Card restyled (18px radius, hover lift, rounded stat chips).
- **Sentry sanitizer fix** (carried from prior session): recreated missing `frontend/lib/sentry-sanitize.ts`; Sentry env vars in gitignored `frontend/.env.local`.
- Verified: `npm.cmd run typecheck` passes; lint clean for all new/changed files.

## Latest Work — Review-Based Marketplace Stickiness Layer

Roadmap Phases 1–3 implemented (browsable cleaner profiles + reviews → notification center → direct offers + favourites). Agency dashboard, in-app chat, payments, and iCal two-way sync remain deferred.

- **Phase 1 — Public cleaner profiles & reviews**:
  - `GET /api/accounts/cleaners/` directory (verified + approved only; `?city=&min_rating=&service_area=` filters) and `GET /api/accounts/cleaners/<id>/` detail + received reviews. Safe fields only — no email/phone/birth_date.
  - Shared components `RatingStars.tsx`, `CleanerProfileCard.tsx`, `CleanerProfileModal.tsx`; new `/cleaners` directory route; landing-page featured cleaners wired to the live endpoint. `PublicCleaner` / `CleanerReview` types in `lib/api.ts`.
- **Phase 2 — Direct offers + favourites (side by side with the open pool)**:
  - Reuses `CleanerApplication` via new `origin` field (`cleaner_applied` / `host_offered`). Migration `apps/marketplace/migrations/0003_cleanerapplication_origin_favouritecleaner.py`.
  - Services `offer_job` / `accept_offer` / `decline_offer` (guards + one-assignment invariant + sibling auto-reject). `offer` action on `CleaningJobViewSet`; `accept-offer` / `decline-offer` on `CleanerApplicationViewSet`. `FavouriteCleaner` model + `GET/POST/DELETE /api/marketplace/favourites/`.
  - Pending offers surface on the shared calendar as a gold `offer` item type (both roles).
  - Host: ♥ favourite toggle + "My cleaners" list + "Offer a job" → `JobOfferModal.tsx`. Cleaner: **Offers** tab with Accept / Decline + gold badge.
  - Tests: `apps/marketplace/tests/test_offers.py` (8 offer-service/API tests + favourite CRUD tests) — all pass.
- **Phase 3 — Notification center**:
  - `GET /api/notifications/`, `POST /api/notifications/<id>/read/`, `POST /api/notifications/read-all/`. Shared `NotificationBell.tsx` (polled) in host + cleaner topbars.
- **Sentry sanitizer fix**: recreated missing `frontend/lib/sentry-sanitize.ts` (`beforeSend` PII scrubber imported by the three Sentry config files). Sentry env vars now in gitignored `frontend/.env.local`. `npm.cmd run typecheck` passes clean.

## User Goal

Current work is focused on completing the cleaner signup flow. The production-hosting work remains available in the repo, but local development is currently using `.env`, manual Django/Next/Celery commands, Redis, and SQLite unless `DATABASE_URL` is explicitly enabled.

## Implemented In Repo

- Added production Compose stack: `docker-compose.prod.yml`.
- Added Caddy reverse proxy config: `deploy/Caddyfile`.
- Added production Dockerfiles:
  - `backend/Dockerfile.prod`
  - `frontend/Dockerfile.prod`
- Added deployment environment file: `.env.production`.
- Added helper scripts:
  - `deploy/start-production.ps1`
  - `deploy/open-firewall.ps1`
- Added deployment guide: `DEPLOY.md`.
- Added WhiteNoise static serving for Django with `DJANGO_DEBUG=false`.
- Added missing frontend API helper: `frontend/lib/api.ts`.
- Wrapped the admin page `useSearchParams` usage in `Suspense` so Next production builds do not fail on that route.
- Updated `.gitignore` to ignore `.env.production` and `.env.production.local` for future secret handling.
- Added user email-code confirmation before signup:
  - `SignupEmailVerification` stores hashed 6-digit codes and verification tokens.
  - `POST /api/accounts/signup/email-code/` sends a code.
  - `POST /api/accounts/signup/verify-email-code/` verifies the code and returns `email_verification_token`.
  - `send_signup_email_code` Celery task sends codes through Resend only.
  - Signup email HTML is rendered from `backend/apps/notifications/templates/notifications/signup_code_email.html`.
  - `.env.example` now includes `EMAIL_RESEND_APIKEY` and `EMAIL_RESEND_FROM_EMAIL`.
- Added `.env` loading from `settings.py` so manual Django and Celery runs read local environment values.
- Converted signup into a single React wizard at `/signup`:
  - Old step routes redirect to `/signup`.
  - Continue and Back update React state instead of navigating with full page loads.
  - Motion (`motion/react`) animates form panels between steps.
  - Progress tracking starts at `Choose account type`.
  - Historical behavior persisted broad draft signup state in `sessionStorage`;
    this was replaced on 2026-07-14 by the explicit non-sensitive allowlist.
- Current signup flow:
  - Credentials and password validation.
  - 6-digit email code confirmation.
  - Choose account type.
  - Cleaner: personal information → location/service areas → native language → experience → introduction → profile photo → create account.
  - Host/agency: location/service areas → create account.
- Updated cleaner signup fields:
  - Birth date uses a compact dropdown-style calendar.
  - Sex uses selectable button options.
  - Native language uses selectable options, with an inline dropdown above the `Other` button.
  - Experience uses single-select button fields.
- Added cleaner dashboard/profile updates:
  - Profile categories are split into separate forms with one shared `Save changes` action at the bottom.
  - `Profile saved.` success state is shown near the shared save button and auto-hides after 5 seconds.
  - Profile image upload now opens a crop overlay (reposition + zoom slider + reset + confirm).
  - Location uses city-first district selection, with service areas managed through an `Add districts` overlay (city-scoped lists, drag-and-drop, and transfer controls).
  - Service areas and other languages are displayed as selected tag lists in profile forms.
  - Other languages uses a dedicated dual-list overlay with search and right-aligned `Done`.
  - Experience form includes driving-license and conditional own-car dropdowns.
  - Added a new cleaner profile section: `Extra services offered` with toggle switches.
- Added backend cleaner profile fields and migrations:
  - `other_languages` JSON field (migration: `backend/apps/accounts/migrations/0013_cleanerprofile_other_languages.py`).
  - `personal_preferences` JSON field for extra services (migration: `backend/apps/accounts/migrations/0014_cleanerprofile_personal_preferences.py`).
- Added logging/observability:
  - JSON backend/Celery logs with request IDs and automatic startup/request/task logging.
  - Read-only `AuditLog` admin for key business actions.
  - Sentry wiring for Django, Celery, and Next.js when DSNs are configured.

## Current Local Development Notes

- Ignore `.env.production` unless production Docker hosting is resumed.
- Use `.env` for local/manual PowerShell runs.
- `.env.example` is only a committed template; it is not used at runtime.
- For local SQLite, remove or comment out `DATABASE_URL`.
- For local Redis, use:

```dotenv
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
```

- S1-E10 map/geocoding foundation: keep `GEOAPIFY_API_KEY` server-only in
  `.env`; `/api/locations/geocode/search/` and `/api/locations/geocode/reverse/`
  are approved-host/platform-admin-only, private/no-store, rate-limited, and
  audited without raw query/coordinate values. `PropertyLocationPicker` calls
  those owned endpoints through `apiFetch` and has no remote tile layer; its
  backend client uses Geoapify's EU-only endpoint and shows OSM/Geoapify
  attribution.
  `DistrictMapSelector` uses canonical GeoJSON only. The provider
  review evidence is in `docs/S1_E10_GEOAPIFY_PROVIDER_REVIEW.md`; owner
  approval, privacy-notice update, and authenticated browser network trace
  remain release work.

- Celery must be running for signup emails when Celery is installed:

```powershell
cd C:\Users\35987\Desktop\airbnb_tax\backend
python -m celery -A config worker --loglevel=info --pool=solo
```

- Restart both Django and Celery after changes to notification tasks, templates, or `.env`.
- For debugging, search technical logs by the normalized `request_id` (`req_`
  plus 32 lowercase hexadecimal characters) and sanitized endpoint template;
  view actor/business history separately at `/admin/core/auditlog/`.

## Verified

- Frontend signup wizard checks:

```powershell
cd C:\Users\35987\Desktop\airbnb_tax\frontend
npm run typecheck
npm run lint
npm run build
```

  - Typecheck passed.
  - Build passed.
  - Lint passed with two existing warnings in `frontend/app/admin/page.tsx` and `frontend/app/host/page.tsx`.

- Backend signup checks:

```powershell
python backend/manage.py check
python backend/manage.py makemigrations --check --dry-run
python backend/manage.py test apps.accounts.tests.test_auth_agency_consent apps.accounts.tests.test_public_cleaners
```

  - Django system check passed.
  - Migration check passed.
  - Targeted cleaner signup tests passed.

- The former signup-state test mismatch is superseded by S1-E02 truth-table and
  pending-first initialization coverage.

- Latest observability checks:
  - `python manage.py check` passed.
  - `python manage.py test apps.core.tests.test_observability` passed.
  - `npm run typecheck` passed.
  - `npm run lint` / `npm run build` currently stop on pre-existing frontend lint issues.

- Docker CLI exists at `C:\Program Files\Docker\Docker\resources\bin\docker.exe`.
- Docker Desktop daemon is running on the `desktop-linux` context.
- Docker Compose exists and reports version `v5.1.4`.
- Production Compose config validates with:

```powershell
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' compose --env-file .env.production -f docker-compose.prod.yml config
```

- PowerShell helper scripts parse successfully.
- Production stack was started with:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\start-production.ps1
```

- Docker containers are running:
  - `airbnb_tax-db-1`
  - `airbnb_tax-redis-1`
  - `airbnb_tax-backend-1`
  - `airbnb_tax-worker-1`
  - `airbnb_tax-frontend-1`
  - `airbnb_tax-proxy-1`
- Caddy exposes host ports `80` and `443`.
- Local backend health check works:

```powershell
Invoke-WebRequest http://localhost/api/health/
```

- LAN backend health check works from this machine:

```powershell
Invoke-WebRequest http://192.168.1.14/api/health/
```

- Frontend root works locally:

```powershell
Invoke-WebRequest http://localhost/
```

- Recent logs show Caddy, Next.js, Gunicorn, and Celery running.

## Remaining Blockers

- Signup flow is more complete, but final production readiness still requires deciding the exact final Host, Cleaner, and Agency onboarding fields.
- Any final signup-field changes must update database models, migrations, serializer validation, profile serializers/admin visibility, frontend payloads, and signup tests together.
- Windows Firewall rule creation requires an Administrator PowerShell session and was not applied from this non-admin shell.
- Router forwarding was not configured yet.
- Public IP was not added to `.env.production` yet.

## Next Steps

1. Open Administrator PowerShell in this repo:

```powershell
cd C:\Users\misho\OneDrive\Desktop\airbnb_tax
```

2. Open firewall ports:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\open-firewall.ps1
```

3. Configure router forwarding on `192.168.1.1`:
   - External TCP `80` -> `192.168.1.14:80`
   - External TCP `443` -> `192.168.1.14:443`

4. When the public IP is known, update `.env.production`:
   - add `<public-ip>` to `DJANGO_ALLOWED_HOSTS`
   - add `http://<public-ip>` to `FRONTEND_TRUSTED_ORIGINS`
   - set `FRONTEND_URL=http://<public-ip>`
   - set `BACKEND_URL=http://<public-ip>`

5. Restart the production stack after `.env.production` changes:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

6. Verify public access from a phone disconnected from Wi-Fi:

```powershell
http://<public-ip>/
```

## Useful Commands

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

## Important Notes

- This is raw-IP HTTP for now. Keep `SESSION_COOKIE_SECURE=false` and `CSRF_COOKIE_SECURE=false` until a domain with HTTPS is configured.
- Do not expose ports `8000`, `5432`, or `6379`; only Caddy should publish host ports.
- `.env.production` currently contains a placeholder production secret and local LAN defaults. Replace the secret before real public use.
