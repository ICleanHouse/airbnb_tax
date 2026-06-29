# Host Cleaners Test Coverage Audit

Date: 2026-06-29

Scope: read-only audit of existing Django, React/Vitest, and end-to-end coverage. No source code or tests were modified during the audit.

Primary sources inspected:
- `AGENTS.md` critical invariants and repo rules.
- Targeted `TGN.md` sections for account state, cleaner verification, job/application/offer/review lifecycles, API routes, event side effects, Celery registry, Sofia district rules, and critical rules R1-R20.
- Targeted `DEV.md` sections for backend/frontend commands and testing guidance.
- Targeted `architecture.md` sections for domain ownership, feedback/admin responsibilities, environment/security settings, and CSRF origins.
- Targeted `CURRENT_PROGRESS.md` sections for latest completion/review, direct-offer, connections, Sofia, signup, and verification notes.

Commands proposed in this plan use Windows repo conventions from `AGENTS.md` and `DEV.md`.

## 1. Existing Test Inventory

### Backend: accounts

Domain files inspected:
- `backend/apps/accounts/models.py`: `User`, `CleanerProfile`, `HostProfile`, `AgencyProfile`, `AgencyInvitation`, `AgencyMembership`, `SignupEmailVerification`, `CookieConsent`
- `backend/apps/accounts/serializers.py`: `SignupSerializer`, `SignupEmailCodeRequestSerializer`, `SignupEmailCodeVerifySerializer`, `UserSerializer`, `CleanerProfileSerializer`, `PublicCleanerSerializer`, `PublicCleanerDetailSerializer`, `AgencyInviteSerializer`, `CookieConsentSerializer`
- `backend/apps/accounts/views.py`: `SignupView`, `SignupEmailCodeRequestView`, `SignupEmailCodeVerifyView`, `CsrfTokenView`, `LoginView`, `LogoutView`, `MeView`, `UserViewSet`, `CleanerProfileViewSet`, `PublicCleanerViewSet`, `AgencyProfileViewSet`, `AgencyInvitationViewSet`, `AgencyMembershipViewSet`
- `backend/apps/accounts/permissions.py`: `IsPlatformAdmin`, `IsHost`, `IsCleaner`, `IsVerifiedCleaner`, `IsApprovedAccount`
- `backend/apps/accounts/services.py`: `delete_account_permanently`

Existing test files:
- `backend/apps/accounts/tests/test_auth_agency_consent.py`
- `backend/apps/accounts/tests/test_public_cleaners.py`
- `backend/apps/accounts/tests/test_dashboard_prefs.py`

Behavior currently covered:
- Signup creates users/profiles and session state: `AccountAuthTests.test_signup_creates_approved_user_and_profile_session`
- Host optional company name: `test_host_signup_saves_optional_company_name`
- Public signup cannot choose admin role: `test_signup_does_not_allow_admin_role`
- Signup requires verified email token: `test_signup_requires_verified_email_token`
- Cleaner service areas, bio length, and age guard: `test_cleaner_signup_saves_service_areas`, `test_cleaner_signup_rejects_overlong_bio`, `test_cleaner_signup_rejects_underage_user`
- Email-code request/verify path and latest-code behavior: `test_signup_email_code_flow_returns_token`, `test_email_code_verification_accepts_latest_code`
- Session login/logout: `test_login_and_logout_use_session_authentication`
- Account deletion cascades and counterparty notifications: `test_authenticated_users_can_delete_their_own_account`, `test_host_account_deletion_removes_jobs_connections_and_notifies_cleaners`, `test_cleaner_account_deletion_removes_taken_jobs_connections_and_notifies_host`
- Admin approval API: `test_admin_can_approve_user_through_api`
- Pending host blocked from property/job creation: `test_pending_host_cannot_create_property_or_job`
- Cookie consent creates anonymous visitor records: `test_cookie_consent_records_anonymous_visitor_choices`
- Agency invite, membership, and assignment delegation happy paths: `AgencyWorkflowTests.test_agency_invites_and_cleaner_accepts_membership`, `test_agency_can_assign_accepted_job_to_active_member`
- Public cleaner directory exposes only verified and approved cleaners, hides PII, filters by rating/service area/city, and embeds safe reviews: `PublicCleanerDirectoryTests`
- Dashboard prefs default, `/me/` exposure, self update, and object validation: `DashboardPrefsTests`

Obvious missing coverage:
- Admin rejection and suspension actions in `UserViewSet.reject` and `UserViewSet.suspend`; suspended/rejected users should be denied marketplace actions per `TGN.md` account rules.
- Non-admin attempts to mutate `role`, `account_status`, `is_staff`, and `is_superuser` in `UserViewSet.perform_update`.
- Cleaner verification admin mutation through `CleanerProfileViewSet.perform_update`; only the lower-level field guard is testable because `POST /api/accounts/cleaners/{id}/verify/` is documented as not built.
- Permission classes in `accounts/permissions.py`, especially `IsVerifiedCleaner` and `IsApprovedAccount`.
- Email-code expiry, reused token, wrong email/token, disabled verification, and duplicate email validation around `SignupEmailVerification` and `SignupSerializer`.
- Required cleaner signup fields in `TGN.md` include work preference and at least one preferred time slot, but `SignupSerializer.validate` currently enforces birth date, sex, and native language only. Tests should document the intended contract before any implementation change.
- Agency invitation negative paths: expired invitation, mismatched email/phone, duplicate pending invitation, non-cleaner accept, inactive/revoked member access.
- Profile endpoint object ownership for host, cleaner, and agency profile viewsets.
- CSRF endpoint and session cookie behavior for `CsrfTokenView`, `LoginView`, and `LogoutView`.

Duplicated or obsolete tests:
- No clear duplicated account tests found.
- `CURRENT_PROGRESS.md` mentions a historical unrelated failure where a host signup test expected `pending` while signup code creates `approved`; the current test name expects approved behavior. Keep this area explicit because product docs still emphasize admin approval as the gate.

### Backend: properties and calendars

Domain files inspected:
- `backend/apps/properties/models.py`: `Property`, `PropertyImage`, `ExternalCalendarConnection`, `Reservation`
- `backend/apps/properties/serializers.py`: `PropertySerializer`, `PropertyImageSerializer`, `ExternalCalendarConnectionSerializer`, `ReservationSerializer`
- `backend/apps/properties/views.py`: `_parse_ics_bytes`, `ParseIcsView`, `FetchIcsUrlView`, `PropertyViewSet`, `PropertyImageViewSet`, `ExternalCalendarConnectionViewSet`, `ReservationViewSet`, `HostOwnedQuerysetMixin`
- `backend/apps/calendars/services.py`: `find_property_job_conflicts`
- `backend/apps/calendars/views.py`: `CalendarConflictView`
- `backend/apps/calendars/tasks.py`: `sync_ical_connection`, `sync_google_calendar`

Existing test files:
- `backend/apps/properties/tests/test_property_images.py`
- No `backend/apps/calendars/tests/` files found.

Behavior currently covered:
- `PropertyImageSerializer` returns media-path image URL: `PropertyImageSerializerTests.test_image_url_uses_media_path`

Obvious missing coverage:
- Property CRUD ownership and role gates in `PropertyViewSet.get_queryset` and `perform_create`.
- Pending/suspended/rejected host denial for property/image/calendar/reservation creation.
- `PropertyImageViewSet` multipart upload, delete permissions, and non-owner rejection.
- `PropertySerializer.validate` duration/price/location validation and timezone default `Europe/Sofia`.
- `_parse_ics_bytes` parsing of all-day events, timezone-aware events, missing UID/summary, invalid ICS, blocked/reservation filtering, sorting, and date normalization.
- `ParseIcsView` multipart validation and audit logging success/failure.
- `FetchIcsUrlView` URL validation, timeout/error handling, invalid downloaded ICS, and SSRF-risk boundaries.
- `ExternalCalendarConnectionViewSet` ownership and required provider/direction fields.
- `ReservationViewSet` ownership and unique external reservation constraint from `Reservation.Meta`.
- `CalendarConflictView` required params, invalid datetime params, non-owner property access, overlapping and non-overlapping jobs through `find_property_job_conflicts`.
- Placeholder calendar tasks should have explicit tests documenting current no-op behavior or be excluded as planned placeholders.

Duplicated or obsolete tests:
- No duplicated property/calendar tests found.
- Coverage is obsolete relative to the feature surface: ICS import is documented as complete in `TGN.md`, but no ICS tests exist.

### Backend: marketplace

Domain files inspected:
- `backend/apps/marketplace/models.py`: `CleaningBatch`, `CleaningJob`, `CleanerApplication`, `Assignment`, `FavouriteCleaner`
- `backend/apps/marketplace/serializers.py`: `CleaningJobSerializer`, `CleanerApplicationSerializer`, `AssignmentSerializer`, `MarketplaceCalendarItemSerializer`, `OfferJobSerializer`, `OfferToCleanerSerializer`, `FavouriteCleanerSerializer`
- `backend/apps/marketplace/services.py`: `publish_job`, `submit_application`, `accept_application`, `reject_application`, `withdraw_application`, `complete_job`, `_ensure_no_assigned_job_same_property_day`, `_ensure_no_pending_offer_same_property_day`, `_ensure_cleaner_workable`, `offer_job`, `offer_job_to_cleaner`, `accept_offer`, `decline_offer`, `assign_member_to_assignment`
- `backend/apps/marketplace/views.py`: `MarketplaceQuerysetMixin`, `MarketplaceCalendarView`, `CleaningBatchViewSet`, `CleaningJobViewSet`, `CleanerApplicationViewSet`, `AssignmentViewSet`, `FavouriteCleanerViewSet`, `AreaStatsView`, `OpenJobLocationsView`

Existing test files:
- `backend/apps/marketplace/tests/test_services.py`
- `backend/apps/marketplace/tests/test_offers.py`
- `backend/apps/marketplace/tests/test_open_job_locations.py`
- `backend/apps/marketplace/tests/test_area_stats.py`

Behavior currently covered:
- Verified cleaner can apply and host can accept: `MarketplaceServiceTests.test_verified_cleaner_can_apply_and_host_can_accept`
- Exact duplicate job blocked: `test_host_cannot_create_duplicate_job_for_same_property_and_time`
- Unverified cleaner cannot apply: `test_unverified_cleaner_cannot_apply`
- Application withdrawal service and API: `test_cleaner_can_withdraw_pending_application`, `test_cleaner_can_withdraw_application_through_api`
- Completion unlocks reviews, cannot complete twice, cannot complete before start, cleaner can complete in-progress, admin completion stamps both sides: `test_cleaner_completion_unlocks_reviews`, `test_cleaner_cannot_mark_completion_twice`, `test_future_job_cannot_be_marked_complete_before_start`, `test_cleaner_can_mark_in_progress_job_done`, `test_admin_completion_marks_both_sides_complete`
- Cleaner calendar shows open applications and assignment states: `test_cleaner_calendar_tracks_open_application_and_assignment_states`
- Direct offer creation, unverified cleaner rejection, non-owner host rejection, offer acceptance creates single assignment and rejects siblings, only offered cleaner can accept, decline notifies host, API accept/decline, same-property same-day conflict guards, and calendar visibility: `OfferServiceTests`
- Favourite CRUD, idempotence, cleaner cannot create favourites: `FavouriteCleanerApiTests`
- Public map location endpoint exposes only open pinned jobs, filters by city, and is guest/host/cleaner available: `OpenJobLocationsViewTests`
- Area stats are public aggregate-only and city-filtered: `AreaStatsViewTests`

Obvious missing coverage:
- Concurrent `accept_application` and `accept_offer` attempts. `select_for_update` is present in `marketplace/services.py`, but tests do not simulate competing accepts or assert database-level one-assignment protection under race-like conditions.
- Non-owner host and non-approved host paths for `accept_application`, `reject_application`, `withdraw_application`, `publish_job`, `complete_job`, and `destroy`.
- Suspended/rejected users denied by `MarketplaceQuerysetMixin.filter_for_user`, `CleanerApplicationViewSet.get_queryset`, and `AssignmentViewSet.get_queryset`.
- `CleaningBatchViewSet` ownership and batch CRUD.
- `CleaningJobViewSet.update` draft-only and `destroy` draft/open-only guards via API.
- `CleaningJobSerializer.validate` scheduled end before start and duplicate exclusion on update.
- `CleanerApplicationSerializer` PII exposure: `cleaner_email` is included for application payloads and should be tested against allowed recipients.
- `offer_job_to_cleaner` find-or-create exact slot behavior and scheduled_end <= scheduled_start validation.
- `FavouriteCleanerSerializer.get_profile_image` calls `profile.profile_image.url` although `profile_image` is a `TextField`; `CURRENT_PROGRESS.md` flags this as a follow-up. Add a serializer regression test before any fix.
- `assign_member_to_assignment` negative paths: inactive membership, non-member cleaner, unverified member, unapproved member, non-agency owner.
- `MarketplaceCalendarView` coverage for host/admin/agency perspectives, date bounds, property images, pending offers, and denied pending users.
- Notifications and email task side effects for accept/reject/withdraw are only partially covered.

Duplicated or obsolete tests:
- Completion tests in marketplace and feedback overlap on the cleaner-completion-to-review transition. Keep both layers but ensure one service test owns completion state, while feedback tests own review eligibility.
- `CURRENT_PROGRESS.md` contains older two-step completion notes from 2026-06-02 that conflict with the newer single-step completion rule. Tests should follow `TGN.md` and the 2026-06-20 current-progress section.

### Backend: feedback

Domain files inspected:
- `backend/apps/feedback/models.py`: `Review`
- `backend/apps/feedback/serializers.py`: `ReviewSerializer`
- `backend/apps/feedback/services.py`: `submit_review`, `revealed_received_reviews`, `refresh_cleaner_rating`, `REVIEW_WINDOW_DAYS`
- `backend/apps/feedback/views.py`: `ReviewViewSet`

Existing test files:
- `backend/apps/feedback/tests/test_reviews.py`

Behavior currently covered:
- Cleaner completion completes job: `ReviewFlowTests.test_cleaner_completion_completes_job`
- Host cannot mark job done: `test_host_cannot_mark_job_done`
- Review requires completion: `test_review_requires_completion`
- Review allowed after cleaner completes: `test_review_allowed_after_cleaner_completes`
- Received review hidden until both submit: `test_received_review_hidden_until_both_submit`
- Review window reveals a single review after deadline: `test_review_window_deadline_reveals_single_review`
- Ratings count only revealed reviews: `test_rating_counts_only_revealed_reviews`

Obvious missing coverage:
- Duplicate review rejection from `Review.Meta.unique_review_per_pair_per_job` and `submit_review`.
- Reviewer/reviewee involvement rules, including assigned agency member in `submit_review`.
- Self-review rejection.
- Review-window closed rejection for new submissions after 14 days.
- `is_private_issue=True` should never show publicly in `revealed_received_reviews`.
- `ReviewViewSet.get_queryset` admin visibility and non-involved user denial.
- `ReviewSerializer` rating bounds and private note visibility.
- Notification side effects when the first review prompts counterpart and second review unlocks visibility.

Duplicated or obsolete tests:
- See marketplace overlap above. No obsolete feedback tests found against the latest single-step completion rule.

### Backend: connections

Domain files inspected:
- `backend/apps/connections/models.py`: `Connection`, `Message`
- `backend/apps/connections/serializers.py`: `ConnectionSerializer`, `MessageSerializer`, `ConnectionRequestSerializer`, `SendMessageSerializer`
- `backend/apps/connections/services.py`: `request_connection`, `accept_connection`, `decline_connection`, `remove_connection`, `send_message`, `mark_messages_read`
- `backend/apps/connections/views.py`: `ConnectionViewSet`

Existing test files:
- `backend/apps/connections/tests/test_connections.py`

Behavior currently covered:
- Request then accept: `ConnectionServiceTests.test_request_then_accept`
- Cannot connect with self: `test_cannot_connect_with_self`
- Host-to-host rejected: `test_host_to_host_rejected`
- Duplicate pending blocked: `test_duplicate_pending_blocked`
- Reverse request auto-accepts: `test_reverse_request_auto_accepts`
- Messaging requires accepted connection: `test_messaging_requires_accepted`
- Mark messages read: `test_mark_messages_read`
- API request/accept/message flow: `ConnectionApiTests.test_full_request_accept_message_flow`
- Shared endpoint lists collaborations: `test_shared_endpoint_lists_collaborations`
- Cannot message another user's connection: `test_cannot_message_others_connection`

Obvious missing coverage:
- Cleaner-to-cleaner and agency pairing rules if agencies are intended workers through `_is_worker`.
- Decline and remove API paths in `ConnectionViewSet.decline` and `destroy`.
- Reactivating a removed/declined connection through `request_connection`.
- `ConnectionSerializer` fields: `direction`, `unread_count`, `last_message`, other-user profile image/id.
- Unread count endpoint including pending requests and read messages.
- Empty or whitespace message validation in `send_message`.
- Authorization for `shared`, `read`, and `unread-count` edge cases.

Duplicated or obsolete tests:
- No clear duplicated connection tests found.

### Backend: notifications and Celery tasks

Domain files inspected:
- `backend/apps/notifications/models.py`: `Notification`
- `backend/apps/notifications/serializers.py`: `NotificationSerializer`
- `backend/apps/notifications/services.py`: `create_notification`
- `backend/apps/notifications/views.py`: `NotificationViewSet`
- `backend/apps/notifications/tasks.py`: `_FakeTask`, `dispatch_notification`, `send_admin_new_account_email`, `send_account_confirmation_email`, `_send_resend_email`, `send_application_submitted_email`, `send_job_completed_email`, `send_signup_email_code`

Existing test files:
- `backend/apps/notifications/tests/test_notification_api.py`
- `backend/apps/notifications/tests/test_email_tasks.py`

Behavior currently covered:
- Notification list is scoped to owner: `NotificationApiTests.test_list_returns_only_own_notifications`
- Unread count, mark read, read all, auth requirement: `NotificationApiTests`
- Admin new-account email task sends to one/multiple admins, staff users, includes details, handles no admins/no emails/deleted user/inactive admins/disabled setting: `SendAdminNewAccountEmailTaskTests`
- Signup triggers admin email and does not fail with no admins: `SignupEmailTriggerTests`
- Disabled signup email verification returns token: `test_signup_email_code_request_returns_token_when_verification_disabled`

Obvious missing coverage:
- `send_signup_email_code` Resend success/failure/retry payload and HTML template rendering.
- `send_application_submitted_email` and `send_job_completed_email` Resend success, disabled setting, missing objects, host email absence, and retry behavior.
- `_FakeTask.apply`/`.delay` parity for bound and unbound tasks.
- `dispatch_notification` placeholder behavior.
- `create_notification` metadata defaults and idempotency expectations.
- NotificationBell frontend routing is not covered by component tests despite documented deep-link rules.

Duplicated or obsolete tests:
- No duplicated notification tests found.

### Backend: locations

Domain files inspected:
- `backend/apps/locations/models.py`: `City`, `ServiceZone`, `ServiceZoneGeometry`
- `backend/apps/locations/serializers.py`: `CitySerializer`, `ServiceZoneSerializer`
- `backend/apps/locations/views.py`: `CityListView`, `CityZoneListView`, `CityZoneGeoJSONView`
- `backend/apps/locations/management/commands/validate_zone_geojson.py`

Existing test files:
- `backend/apps/locations/tests/test_locations_api.py`

Behavior currently covered:
- Active city list: `LocationApiTests.test_city_list_returns_active_cities`
- Active zones per city: `test_zone_list_returns_active_zones_for_city`
- Stable unique zone ID per city slug: `test_zone_id_is_stable_and_unique_per_city_slug`
- GeoJSON endpoint returns active feature collection: `test_geojson_endpoint_returns_active_feature_collection`
- Inactive cities are hidden: `test_inactive_city_is_not_exposed`

Obvious missing coverage:
- Sofia 144-feature identity and exact ID/name parity across `districits_sofia/sofia_districts_ready.geojson`, `frontend/lib/sofiaDistricts.ts`, and `frontend/public/maps/sofia/districts.geojson`.
- Empty `legacy_names` rule for Sofia runtime zones.
- `validate_zone_geojson` management command success/failure.
- Inactive service zones and missing geometry behavior.
- Frontend fallback/catalog behavior in `frontend/lib/locations.ts`.

Duplicated or obsolete tests:
- No duplicated location tests found.

### Backend: core and observability

Domain files inspected:
- `backend/apps/core/models.py`: `TimeStampedModel`, `AuditLog`
- `backend/apps/core/middleware.py`: `RequestContextMiddleware`, `normalize_request_id`
- `backend/apps/core/services.py`: `get_client_ip`, `write_audit_log`
- `backend/apps/core/logging.py`: `sanitize_log_value`, `JsonFormatter`, `RequestContextFilter`
- `backend/apps/core/views.py`: `health_check`, `csrf_failure`
- `backend/config/celery.py`: `add_request_id_to_task_headers`

Existing test files:
- `backend/apps/core/tests/test_observability.py`

Behavior currently covered:
- API response includes request ID: `RequestIdMiddlewareTests.test_api_response_includes_request_id_header`
- Login creates audit log: `AuditLogTests.test_login_creates_audit_log`
- Audit log admin is read-only: `test_audit_log_admin_is_read_only`
- Celery headers include request ID: `CeleryRequestIdTests.test_request_id_is_added_to_celery_headers`
- Startup logging limited to server processes: `StartupLoggingTests.test_startup_logging_is_limited_to_server_processes`

Obvious missing coverage:
- `normalize_request_id` invalid/oversized values.
- `get_client_ip` forwarded-for edge cases.
- `sanitize_log_value` nested sensitive fields.
- `csrf_failure` response shape and observability.
- Sentry sanitization in frontend is separate and currently untested.

Duplicated or obsolete tests:
- No duplicated core tests found.

### Frontend: API client and utilities

Domain files inspected:
- `frontend/lib/api.ts`: re-exports `apiFetch` and `roleLabel`
- `frontend/api/client.ts`: `apiFetch`, CSRF header injection, JSON content type for string bodies, `credentials: "include"`, request IDs, failure reporting
- `frontend/lib/locations.ts`: Sofia catalog loading, API/fallback cities and zones, GeoJSON loading, service area name/zone conversion
- `frontend/lib/money.ts`: `money`, `formatMoney`
- `frontend/lib/useAppdashPrefs.ts`: `useAppdashPrefs`
- `frontend/lib/useLiveRefresh.ts`, `frontend/hooks/useLiveRefresh.ts`
- `frontend/lib/useRefocusClickGuard.ts`
- `frontend/lib/sentry-sanitize.ts`

Existing test files:
- None for utilities.

Behavior currently covered:
- None directly.

Obvious missing coverage:
- `apiFetch` should add `X-CSRFToken` for POST/PUT/PATCH/DELETE, set `credentials: "include"`, not set `Content-Type` for `FormData`, set JSON content type for string body, preserve caller headers, and report failures.
- `PropertyLocationPicker.tsx` directly calls browser `fetch` for Nominatim at symbol `PropertyLocationPicker` instead of using `apiFetch`. This may be a justified external service exception, but it needs a documented test/exception because `AGENTS.md` says never call `fetch` directly.
- `frontend/lib/locations.ts` should test Sofia district ID/name validation, fallback behavior, API failure fallback, `serviceAreaNamesToZoneIds`, and `zoneIdsToServiceAreaNames`.
- `useAppdashPrefs` persistence and invalid saved-card filtering.
- `sentry-sanitize.ts` PII/header redaction.

Duplicated or obsolete tests:
- None.

### Frontend: signup, login, app entry, admin

Domain files inspected:
- `frontend/features/signup/SignupPage.tsx`: signup wizard, email-code flow, sessionStorage recovery, role/location/personal/native-language/experience/introduction/profile-photo steps
- `frontend/app/[locale]/login/page.tsx`: login, CSRF prefetch, role redirect
- `frontend/app/[locale]/app/page.tsx`: role-aware workspace redirect/status
- `frontend/app/[locale]/admin/page.tsx`: pending/approved/all filters, approve/reject actions
- Old signup step routes under `frontend/app/[locale]/signup/*/page.tsx`

Existing test files:
- None.

Behavior currently covered:
- None directly.

Obvious missing coverage:
- Full signup wizard state machine: role-specific path, required cleaner fields, email-code send/verify/resend errors, sessionStorage restore/cleanup, old route redirects.
- Login success redirects by role to `/admin`, `/host`, `/cleaner`, `/agency`, or `/app`; errors and CSRF prefetch.
- `/app` pending/approved/suspended dashboard messaging.
- Admin list filtering and approve/reject/suspend UI. Suspend API exists in backend but admin page currently uses approve/reject only.
- Localized user-facing strings in `frontend/messages/en.json` and `frontend/messages/bg.json` should be validated for any new test-visible text.

Duplicated or obsolete tests:
- None.

### Frontend: host dashboard

Domain files inspected:
- `frontend/features/host/HostDashboard.tsx`: property rail, job calendar, property CRUD, image upload/delete, ICS import, job publish/delete, application accept/reject, favourites, direct offers, review modal, profile/preferences, notification bell/connections integration
- `frontend/components/ReviewModal.tsx`
- `frontend/components/JobOfferModal.tsx`
- `frontend/components/CleanerProfileModal.tsx`
- `frontend/components/Connections.tsx`
- `frontend/components/NotificationBell.tsx`

Existing test files:
- `frontend/features/host/HostDashboard.test.tsx`

Behavior currently covered:
- Review modal absent on initial load without `reviewJob`.
- Review modal opens from deep link, has no axe violations in that state, can be dismissed, strips query param, and does not reopen after data refresh.
- Same `reviewJob` does not auto-reopen after focus refresh.
- First modal-trigger click after focus regain is ignored.
- Backdrop and Escape dismissal do not reopen modal.

Obvious missing coverage:
- Property rail filtering, mobile property selector, add/edit/delete property image flows.
- ICS upload and URL fetch states, FormData use, parse errors, and bulk job creation from parsed events.
- Job form date/time validation, default selected-day prefill, publish/delete guards.
- Application accept/reject, pending-offer rows cannot be self-approved, active/completed/open filters.
- Favourites and direct offer modal payload to `offer-to-cleaner`.
- Income/spent card totals from completed assignments.
- NotificationBell routing for application, offer, and review notifications.
- Connections drawer launch and chat interactions from host dashboard.
- Role/status redirect or denial states.

Duplicated or obsolete tests:
- Host and cleaner review-modal tests intentionally mirror the same deep-link dismissal behavior. Keep shared behavior in `ReviewModal` or a helper if test duplication grows.

### Frontend: cleaner dashboard

Domain files inspected:
- `frontend/features/cleaner/CleanerDashboard.tsx`: jobs/calendar, open applications, offers, completion, profile edit, district map selector, review modal, income card, notification bell/connections integration
- `frontend/components/DistrictMapSelector.tsx`, `DistrictChecklist.tsx`, `DistrictSelectedTags.tsx`

Existing test files:
- `frontend/features/cleaner/CleanerDashboard.test.tsx`

Behavior currently covered:
- Dismissed `reviewJob` modal does not reopen after focus refresh and strips query param.

Obvious missing coverage:
- Open jobs apply flow, pending application withdrawal, pending offer accept/decline.
- Completion button visibility after scheduled start and hidden before start.
- Completed assignment review trigger and ReviewModal payload.
- Profile validation for birth date, city, service areas, languages, preferences, image crop.
- District city selector, Sofia zone selection, and service area conversion.
- Calendar item classification and property image rendering.
- Income card totals.
- Connections drawer and NotificationBell behavior.

Duplicated or obsolete tests:
- See host dashboard note. Cleaner has less coverage than host for identical modal behaviors.

### Frontend: public marketplace and shared components

Domain files inspected:
- `frontend/app/[locale]/page.tsx`: public landing with cleaner browser
- `frontend/app/[locale]/cleaners/page.tsx`: public cleaner directory
- `frontend/components/CleanerBrowser.tsx`: public cleaner fetch/filter and authenticated offer support
- `frontend/components/CleanerProfileCard.tsx`, `CleanerProfileModal.tsx`, `RatingStars.tsx`
- `frontend/components/OpenJobMap.tsx`: public job markers, authenticated cleaner apply from map
- `frontend/components/AreaDemandPanel.tsx`
- `frontend/components/ConnectButton.tsx`
- `frontend/components/Connections.tsx`
- `frontend/components/NotificationBell.tsx`
- `frontend/components/CookieConsentBanner.tsx`
- `frontend/components/AccountDeletionPanel.tsx`
- `frontend/components/PropertyLocationPicker.tsx`

Existing test files:
- None outside dashboard tests.

Behavior currently covered:
- None directly.

Obvious missing coverage:
- CleanerBrowser city/district/min-rating filtering, safe field rendering, property-dependent offer modal.
- Cleaner profile modal safe review display.
- OpenJobMap guest vs cleaner actions and host identity privacy.
- ConnectButton states: loading, idle, pending, connected, error.
- Connections drawer requests/messages/shared context.
- NotificationBell polling, mark-read/read-all, and deep-link routing.
- CookieConsentBanner visitor ID and consent payload.
- AccountDeletionPanel typed confirmation and API error handling.
- PropertyLocationPicker geocode debounce, result selection, direct fetch exception, and error states.

Duplicated or obsolete tests:
- None.

### End-to-end and Playwright

Existing test files/config:
- No Playwright, Cypress, or E2E spec files found.
- No `playwright.config.*` found.
- `frontend/package.json` has `test`, `typecheck`, and `lint`, but no E2E script.

Behavior currently covered:
- None at browser-flow level.

Obvious missing coverage:
- Signup to pending/approved dashboard smoke flow.
- Login/logout and role redirects.
- Host creates property, posts job, and sees it on calendar.
- Cleaner applies, host accepts, cleaner completes, both parties review.
- Direct offer accept/decline.
- Connections request/chat.
- Public landing cleaner browsing and open-job map privacy smoke.

Duplicated or obsolete tests:
- Not applicable.

## 2. Risk-Based Coverage Matrix

| Area | Risk | Current coverage | Priority gaps | Paths and symbols |
|---|---:|---|---|---|
| Authentication and CSRF | Critical | Backend login/logout session test exists; no CSRF or `apiFetch` tests | CSRF cookie/header, session persistence, `credentials: include`, API failure handling | `backend/apps/accounts/views.py::CsrfTokenView`, `LoginView`, `LogoutView`; `frontend/api/client.ts::apiFetch` |
| Account approval and suspension | Critical | Approval happy path; pending host denied property/job | Reject/suspend actions, suspended/rejected marketplace denial, non-admin protected fields | `accounts/views.py::UserViewSet.approve/reject/suspend/perform_update`; `marketplace/views.py::MarketplaceQuerysetMixin` |
| Cleaner verification | Critical | Unverified cannot apply; public directory only verified+approved | Admin verification mutation, verified+suspended denial, permission class tests | `accounts/views.py::CleanerProfileViewSet.perform_update`; `accounts/permissions.py::IsVerifiedCleaner`; `marketplace/services.py::_ensure_cleaner_workable` |
| Object ownership and authorization | Critical | Some property/job/application owner paths covered indirectly | Non-owner API matrix across properties, jobs, applications, assignments, reviews, connections, notifications | `properties/views.py::*ViewSet`; `marketplace/views.py::*ViewSet`; `feedback/views.py::ReviewViewSet`; `connections/views.py::ConnectionViewSet` |
| Job lifecycle | Critical | Apply/accept, duplicate job, completion timing covered | Publish/update/delete API guards, batch CRUD, status transition negatives | `marketplace/services.py::publish_job/complete_job`; `marketplace/views.py::CleaningJobViewSet` |
| Applications and direct offers | Critical | Good service/API coverage for common flows | Non-approved/rejected/suspended users, offer-to-cleaner find-or-create, API negative cases | `marketplace/services.py::submit_application`, `offer_job`, `offer_job_to_cleaner`, `accept_offer`, `decline_offer` |
| One-assignment-per-job enforcement | Critical | Sibling rejection and existing-assignment service checks covered | Race-like concurrent acceptance and DB invariant expectations | `marketplace/services.py::accept_application`, `accept_offer`; `marketplace/models.py::Assignment` |
| Concurrent application acceptance | Critical | Not covered | Two pending apps accepted in parallel/serial stale-object simulation | `marketplace/services.py::accept_application` |
| Completion timing | Critical | Cleaner/admin timing covered | Host denial after start/end, suspended user denial, timezone boundary around Europe/Sofia midnight | `marketplace/services.py::complete_job` |
| Two-way reviews | Critical | Good double-blind basics | Duplicate/self/non-involved/private issue/window-closed/new review rejection | `feedback/services.py::submit_review`, `revealed_received_reviews`, `refresh_cleaner_rating`; `feedback/views.py::ReviewViewSet` |
| Connections and messaging | High | Core service/API flow covered | Decline/remove/reactivate, unread counts, serializer fields, agency pairing | `connections/services.py::*`; `connections/views.py::ConnectionViewSet`; `connections/serializers.py::ConnectionSerializer` |
| Notifications and Celery tasks | High | Notification API and admin signup email covered | Resend tasks for signup/application/completion, retry behavior, NotificationBell routing | `notifications/tasks.py::send_signup_email_code`, `send_application_submitted_email`, `send_job_completed_email`; `frontend/components/NotificationBell.tsx` |
| ICS parsing and uploads | High | No ICS coverage | Parser edge cases, multipart upload, URL fetch errors, audit logging, conflict API | `properties/views.py::_parse_ics_bytes`, `ParseIcsView`, `FetchIcsUrlView`; `calendars/views.py::CalendarConflictView` |
| Location and Sofia district consistency | High | Backend location API basics | Canonical 144 Sofia districts parity, frontend fallback/catalog conversion | `locations/views.py::*`; `frontend/lib/locations.ts`; `frontend/lib/sofiaDistricts.ts`; `frontend/public/maps/sofia/districts.geojson` |
| Signup workflow | High | Backend signup tests; no frontend tests | Full wizard, email-code states, storage restore, role-specific required fields | `accounts/serializers.py::SignupSerializer`; `frontend/features/signup/SignupPage.tsx` |
| Host dashboard | High | Review modal only | Property/job/ICS/application/direct-offer/filter flows | `frontend/features/host/HostDashboard.tsx` |
| Cleaner dashboard | High | One review modal test | Apply/withdraw/offer/complete/profile/district flows | `frontend/features/cleaner/CleanerDashboard.tsx` |
| API error handling | High | Backend validation partial; frontend none | Consistent 400/403/404 response tests and user-visible error states | `frontend/api/client.ts::reportApiFailure`; serializers/views across apps |
| Public cleaner browser/open-job map | Medium | Backend public endpoints covered | Frontend filters, privacy, map apply flow | `frontend/components/CleanerBrowser.tsx`; `frontend/components/OpenJobMap.tsx` |
| Admin panel frontend | Medium | Backend approve tested | UI filter, approve/reject error handling, suspend absence documented | `frontend/app/[locale]/admin/page.tsx` |
| Observability/logging | Medium | Request ID, audit login, celery header covered | CSRF failure, sanitizer, client IP edge cases | `backend/apps/core/*`; `frontend/lib/sentry-sanitize.ts` |
| Money and dashboard prefs | Medium | Backend prefs; no frontend hook tests | `useAppdashPrefs`, `money`, income/spent cards | `frontend/lib/useAppdashPrefs.ts`; `frontend/lib/money.ts` |
| Placeholder integrations | Low | Not covered | Explicit no-op tests or documentation only | `calendars/tasks.py`; `notifications/tasks.py::dispatch_notification` |

## 3. Proposed Test Batches

Each batch is intentionally small and independent. Production code risk means the estimated chance that tests expose a needed application fix.

### Batch 1: One-assignment invariant and concurrent acceptance

Objective:
- Prove a job can never end with more than one assignment, including stale-object and near-concurrent acceptance attempts.

Files/modules involved:
- `backend/apps/marketplace/services.py::accept_application`, `accept_offer`
- `backend/apps/marketplace/models.py::Assignment`, `CleanerApplication`
- Existing test base in `backend/apps/marketplace/tests/test_services.py`

Test type:
- Service/integration.

Required fixtures or factories:
- Host user, two verified/approved cleaner users, property, open job, two pending applications.
- Prefer adding local factory helpers or a shared `backend/apps/marketplace/tests/factories.py` later.

Expected test files:
- `backend/apps/marketplace/tests/test_assignment_invariants.py`

Commands to run:
- From `backend/`: `python manage.py test apps.marketplace.tests.test_assignment_invariants`
- Then: `python manage.py test apps.marketplace`

Dependencies:
- None.

Estimated production-code risk:
- Medium. Tests may expose that application-level locks are insufficient without a unique database constraint on `Assignment.job`.

### Batch 2: Account status gates and cleaner verification

Objective:
- Cover pending/rejected/suspended/approved state gates and cleaner verification gates at service and API boundaries.

Files/modules involved:
- `backend/apps/accounts/views.py::UserViewSet.reject`, `suspend`, `perform_update`
- `backend/apps/accounts/views.py::CleanerProfileViewSet.perform_update`
- `backend/apps/accounts/permissions.py::*`
- `backend/apps/marketplace/views.py::MarketplaceQuerysetMixin`
- `backend/apps/marketplace/services.py::_ensure_cleaner_workable`

Test type:
- Unit, API, service.

Required fixtures or factories:
- Users for each role/status; cleaner profiles for pending/verified/rejected/suspended.

Expected test files:
- `backend/apps/accounts/tests/test_account_status_permissions.py`
- `backend/apps/marketplace/tests/test_account_status_gates.py`

Commands to run:
- From `backend/`: `python manage.py test apps.accounts.tests.test_account_status_permissions apps.marketplace.tests.test_account_status_gates`

Dependencies:
- None.

Estimated production-code risk:
- Medium. Product docs emphasize approval gates while signup currently creates approved users; tests may force a product decision.

### Batch 3: Marketplace transition API negatives

Objective:
- Add API tests for publish/update/delete/accept/reject/withdraw/offer negative paths and response shape consistency.

Files/modules involved:
- `backend/apps/marketplace/views.py::CleaningJobViewSet`, `CleanerApplicationViewSet`, `AssignmentViewSet`, `FavouriteCleanerViewSet`
- `backend/apps/marketplace/serializers.py::CleaningJobSerializer`, `OfferToCleanerSerializer`, `FavouriteCleanerSerializer`

Test type:
- API and serializer.

Required fixtures or factories:
- Host, other host, cleaner, agency, property, draft/open/assigned/completed jobs, pending/accepted applications.

Expected test files:
- `backend/apps/marketplace/tests/test_marketplace_api_permissions.py`
- `backend/apps/marketplace/tests/test_marketplace_serializers.py`

Commands to run:
- From `backend/`: `python manage.py test apps.marketplace.tests.test_marketplace_api_permissions apps.marketplace.tests.test_marketplace_serializers`

Dependencies:
- Batch 2 fixtures can be reused but are not logically required.

Estimated production-code risk:
- Medium, especially around `FavouriteCleanerSerializer.get_profile_image`.

### Batch 4: Completion timing and Sofia timezone boundaries

Objective:
- Lock completion timing to `Europe/Sofia`, including just-before and just-after scheduled start.

Files/modules involved:
- `backend/apps/marketplace/services.py::complete_job`
- `backend/apps/marketplace/views.py::user_can_complete_calendar_assignment`
- `frontend/features/cleaner/CleanerDashboard.tsx::isPastDateTime`

Test type:
- Backend service/API plus frontend component/unit for visible control.

Required fixtures or factories:
- Assigned jobs scheduled around midnight in Sofia; assigned cleaner; host; admin.

Expected test files:
- `backend/apps/marketplace/tests/test_completion_timing.py`
- `frontend/features/cleaner/CleanerDashboard.completion.test.tsx` or focused extraction later if component setup is too heavy.

Commands to run:
- From `backend/`: `python manage.py test apps.marketplace.tests.test_completion_timing`
- From `frontend/`: `npm.cmd run test -- CleanerDashboard.completion.test.tsx`

Dependencies:
- None.

Estimated production-code risk:
- Low to medium. Frontend helper functions are currently module-private, so tests may need component-level assertions rather than utility imports unless production code is later extracted.

### Batch 5: Review invariants beyond happy path

Objective:
- Cover duplicate, self, non-involved, private issue, window-closed, admin visibility, and notification side effects.

Files/modules involved:
- `backend/apps/feedback/services.py::submit_review`, `revealed_received_reviews`, `refresh_cleaner_rating`
- `backend/apps/feedback/views.py::ReviewViewSet`
- `backend/apps/feedback/serializers.py::ReviewSerializer`

Test type:
- Service and API.

Required fixtures or factories:
- Completed assigned job, host, cleaner, optional agency assigned member, counterpart reviews.

Expected test files:
- `backend/apps/feedback/tests/test_review_invariants.py`

Commands to run:
- From `backend/`: `python manage.py test apps.feedback.tests.test_review_invariants apps.feedback.tests.test_reviews`

Dependencies:
- None.

Estimated production-code risk:
- Low.

### Batch 6: Properties, ICS, reservations, and calendar conflicts

Objective:
- Cover host-owned CRUD, ICS parsing/upload/fetch, reservation uniqueness, and conflict detection.

Files/modules involved:
- `backend/apps/properties/views.py::_parse_ics_bytes`, `ParseIcsView`, `FetchIcsUrlView`, `PropertyViewSet`, `PropertyImageViewSet`, `ExternalCalendarConnectionViewSet`, `ReservationViewSet`
- `backend/apps/calendars/services.py::find_property_job_conflicts`
- `backend/apps/calendars/views.py::CalendarConflictView`

Test type:
- Unit, API, integration.

Required fixtures or factories:
- Host and other host, property, sample ICS strings/files, existing overlapping jobs/reservations.
- Mock `urllib.request.urlopen` for URL fetch.

Expected test files:
- `backend/apps/properties/tests/test_property_api.py`
- `backend/apps/properties/tests/test_ics_import.py`
- `backend/apps/calendars/tests/test_conflicts.py`

Commands to run:
- From `backend/`: `python manage.py test apps.properties apps.calendars`

Dependencies:
- Batch 2 for status fixtures is useful.

Estimated production-code risk:
- Medium. ICS edge cases and URL-fetch validation may expose parsing or SSRF hardening needs.

### Batch 7: Notification and Celery task reliability

Objective:
- Cover Resend-backed task payloads, disabled settings, missing data, retry behavior, and fake task compatibility.

Files/modules involved:
- `backend/apps/notifications/tasks.py::send_signup_email_code`, `send_application_submitted_email`, `send_job_completed_email`, `_send_resend_email`, `_FakeTask`
- `backend/apps/notifications/services.py::create_notification`

Test type:
- Unit with mocks.

Required fixtures or factories:
- Users/admins, application, completed job, notification, patched `_send_resend_email`, patched task `self.retry`.

Expected test files:
- `backend/apps/notifications/tests/test_resend_tasks.py`
- `backend/apps/notifications/tests/test_task_fallback.py`

Commands to run:
- From `backend/`: `python manage.py test apps.notifications`

Dependencies:
- None.

Estimated production-code risk:
- Low.

### Batch 8: Connections edge cases

Objective:
- Complete connection lifecycle and serializer/API coverage.

Files/modules involved:
- `backend/apps/connections/services.py::*`
- `backend/apps/connections/views.py::ConnectionViewSet`
- `backend/apps/connections/serializers.py::ConnectionSerializer`

Test type:
- Service and API.

Required fixtures or factories:
- Host, cleaner, agency, second host, accepted/pending/declined/removed connections, messages.

Expected test files:
- Extend `backend/apps/connections/tests/test_connections.py` or add `test_connection_edges.py`

Commands to run:
- From `backend/`: `python manage.py test apps.connections`

Dependencies:
- None.

Estimated production-code risk:
- Low.

### Batch 9: Sofia catalog and location frontend utilities

Objective:
- Prove backend and frontend location catalogs stay aligned and fallback behavior is deterministic.

Files/modules involved:
- `backend/apps/locations/views.py::*`
- `backend/apps/locations/management/commands/validate_zone_geojson.py`
- `frontend/lib/locations.ts`
- `frontend/lib/sofiaDistricts.ts`
- `frontend/public/maps/sofia/districts.geojson`

Test type:
- Backend API/command and frontend utility.

Required fixtures or factories:
- City/service zone rows; fixture copies or loaded GeoJSON; mocked `apiFetch` for frontend utility tests.

Expected test files:
- `backend/apps/locations/tests/test_sofia_catalog.py`
- `frontend/lib/locations.test.ts`

Commands to run:
- From `backend/`: `python manage.py test apps.locations`
- From `frontend/`: `npm.cmd run test -- locations.test.ts`

Dependencies:
- None.

Estimated production-code risk:
- Low.

### Batch 10: Frontend API client and shared utilities

Objective:
- Lock frontend networking and utility behavior before testing larger components.

Files/modules involved:
- `frontend/api/client.ts::apiFetch`, `roleLabel`
- `frontend/lib/api.ts`
- `frontend/lib/money.ts`
- `frontend/lib/useAppdashPrefs.ts`
- `frontend/lib/sentry-sanitize.ts`
- `frontend/components/PropertyLocationPicker.tsx` direct fetch exception

Test type:
- Unit and hook/component.

Required fixtures or factories:
- Mock `global.fetch`, document cookies, Sentry spies, hook render wrapper.

Expected test files:
- `frontend/api/client.test.ts`
- `frontend/lib/money.test.ts`
- `frontend/lib/useAppdashPrefs.test.tsx`
- `frontend/lib/sentry-sanitize.test.ts`
- `frontend/components/PropertyLocationPicker.test.tsx`

Commands to run:
- From `frontend/`: `npm.cmd run test -- client.test.ts money.test.ts useAppdashPrefs.test.tsx sentry-sanitize.test.ts PropertyLocationPicker.test.tsx`

Dependencies:
- None.

Estimated production-code risk:
- Low, except the direct fetch exception may require a documented policy choice.

### Batch 11: Frontend signup, login, and admin components

Objective:
- Cover role-specific signup wizard behavior, login redirects, `/app` status handling, and admin approval UI.

Files/modules involved:
- `frontend/features/signup/SignupPage.tsx`
- `frontend/app/[locale]/login/page.tsx`
- `frontend/app/[locale]/app/page.tsx`
- `frontend/app/[locale]/admin/page.tsx`

Test type:
- Component/integration with mocked `apiFetch` and Next navigation.

Required fixtures or factories:
- Mock next-intl translations, router, search params, sessionStorage, API responses.

Expected test files:
- `frontend/features/signup/SignupPage.test.tsx`
- `frontend/app/[locale]/login/page.test.tsx`
- `frontend/app/[locale]/app/page.test.tsx`
- `frontend/app/[locale]/admin/page.test.tsx`

Commands to run:
- From `frontend/`: `npm.cmd run test -- SignupPage.test.tsx login page.test.tsx admin`
- Then: `npm.cmd run typecheck` and `npm.cmd run lint`

Dependencies:
- Batch 10 API mocking helpers.

Estimated production-code risk:
- Medium. Large components may need testability seams or reveal missing labels.

### Batch 12: Host dashboard component behavior

Objective:
- Extend host dashboard tests beyond review-modal deep-link handling.

Files/modules involved:
- `frontend/features/host/HostDashboard.tsx`
- `frontend/components/JobOfferModal.tsx`
- `frontend/components/ReviewModal.tsx`
- `frontend/components/NotificationBell.tsx`
- `frontend/components/Connections.tsx`

Test type:
- Component/integration.

Required fixtures or factories:
- Mock API payloads for me, properties, jobs, applications, assignments, reviews, favourites, notifications, connections.
- `userEvent` interactions and `axe` for interactive modals.

Expected test files:
- Extend `frontend/features/host/HostDashboard.test.tsx`
- Add focused files if needed: `JobOfferModal.test.tsx`, `NotificationBell.test.tsx`, `Connections.test.tsx`

Commands to run:
- From `frontend/`: `npm.cmd run test -- HostDashboard.test.tsx JobOfferModal.test.tsx NotificationBell.test.tsx Connections.test.tsx`

Dependencies:
- Batch 10 API helpers.

Estimated production-code risk:
- Medium because dashboard component is large and may need extraction later. Initial batch should not refactor.

### Batch 13: Cleaner dashboard component behavior

Objective:
- Cover application, offer, completion, profile, district, and income behavior.

Files/modules involved:
- `frontend/features/cleaner/CleanerDashboard.tsx`
- `frontend/components/DistrictMapSelector.tsx`
- `frontend/components/DistrictChecklist.tsx`
- `frontend/components/ReviewModal.tsx`

Test type:
- Component/integration.

Required fixtures or factories:
- Mock API payloads for cleaner profile, jobs, applications, assignments, reviews, calendar, districts.

Expected test files:
- Extend `frontend/features/cleaner/CleanerDashboard.test.tsx`
- Add focused `DistrictMapSelector.test.tsx` if map behavior can be isolated.

Commands to run:
- From `frontend/`: `npm.cmd run test -- CleanerDashboard.test.tsx DistrictMapSelector.test.tsx`

Dependencies:
- Batch 10 and Batch 9 utilities.

Estimated production-code risk:
- Medium.

### Batch 14: Public marketplace components

Objective:
- Cover public cleaner browsing, cleaner profile safe display, open-job map privacy, connect button, cookie consent, and account deletion.

Files/modules involved:
- `frontend/components/CleanerBrowser.tsx`
- `frontend/components/CleanerProfileCard.tsx`
- `frontend/components/CleanerProfileModal.tsx`
- `frontend/components/OpenJobMap.tsx`
- `frontend/components/ConnectButton.tsx`
- `frontend/components/CookieConsentBanner.tsx`
- `frontend/components/AccountDeletionPanel.tsx`

Test type:
- Component/integration.

Required fixtures or factories:
- Mock API responses; for map components, mock Leaflet/MapLibre dynamic dependencies if needed.

Expected test files:
- `frontend/components/CleanerBrowser.test.tsx`
- `frontend/components/CleanerProfileModal.test.tsx`
- `frontend/components/OpenJobMap.test.tsx`
- `frontend/components/ConnectButton.test.tsx`
- `frontend/components/CookieConsentBanner.test.tsx`
- `frontend/components/AccountDeletionPanel.test.tsx`

Commands to run:
- From `frontend/`: `npm.cmd run test -- CleanerBrowser.test.tsx OpenJobMap.test.tsx ConnectButton.test.tsx CookieConsentBanner.test.tsx AccountDeletionPanel.test.tsx`

Dependencies:
- Batch 10 and Batch 9.

Estimated production-code risk:
- Low to medium. Map component tests may need dependency mocking.

### Batch 15: Playwright E2E smoke harness

Objective:
- Add broad browser-level confidence without duplicating all unit/API assertions.

Files/modules involved:
- New `frontend/playwright.config.ts`
- New `frontend/tests/e2e/*.spec.ts`
- Existing backend/frontend local dev commands.

Test type:
- E2E.

Required fixtures or factories:
- Stable seed data, or API-driven setup/teardown endpoints limited to test environment.
- Roles: host, verified cleaner, pending/suspended user, admin.

Expected test files:
- `frontend/tests/e2e/auth.spec.ts`
- `frontend/tests/e2e/signup.spec.ts`
- `frontend/tests/e2e/host-job-flow.spec.ts`
- `frontend/tests/e2e/marketplace-review-flow.spec.ts`
- `frontend/tests/e2e/public-marketplace.spec.ts`

Commands to run:
- From `frontend/`: `npx.cmd playwright test`
- Do not run `npm.cmd run build` while `npm.cmd run dev` is using `frontend/.next`.

Dependencies:
- Backend service tests for invariants should land first.
- Frontend component tests for dashboards should land first where possible.

Estimated production-code risk:
- Low for harness, medium for fixture determinism.

## 4. Recommended Test Pyramid

### Django unit/service tests

Use for rules that must hold regardless of HTTP or UI:
- `marketplace/services.py::accept_application`, `accept_offer`, `complete_job`, `offer_job`, `offer_job_to_cleaner`, `assign_member_to_assignment`
- `feedback/services.py::submit_review`, `revealed_received_reviews`, `refresh_cleaner_rating`
- `connections/services.py::*`
- `accounts/services.py::delete_account_permanently`
- `properties/views.py::_parse_ics_bytes` until parser logic is extracted into a service
- `calendars/services.py::find_property_job_conflicts`
- Celery task functions with mocked email/Resend calls

Do not duplicate every service assertion through API tests. Use API tests only for permissions, serializer validation, status codes, and response payloads.

### Django API tests

Use for:
- Authentication/CSRF/session endpoints.
- Object ownership and queryset scoping.
- Admin approval/reject/suspend and cleaner verification field mutation.
- Property/image/calendar/reservation CRUD.
- Marketplace route gates: publish, complete, accept/reject/withdraw, offer, offer-to-cleaner, favourites.
- Public safe endpoints: cleaner directory, open-job locations, area stats, location city/zones.
- Notification and connection endpoints.

Prefer a compact role/status matrix over one-off copies of the same assertion.

### Frontend component tests

Use React Testing Library/Vitest for:
- `apiFetch` behavior with mocked `fetch`.
- Signup wizard state, validation, and API payloads.
- Login/admin/app entry routing.
- Dashboard controls that call APIs and update visible state.
- Modal behavior: review, job offer, connections, cleaner profile.
- NotificationBell route generation and read actions.
- CleanerBrowser filters and safe display.
- District/location utilities and picker behavior.

Do not use snapshots for the dashboards. Assert roles, labels, visible state, and API calls.

### Integration tests

Use integration tests where several modules cooperate but a browser is unnecessary:
- Signup email-code API plus task dispatch with Celery eager or task `.apply`.
- Host property + ICS parse + job creation API chain.
- Cleaner application + host acceptance + notification record.
- Completion + review requested notifications.
- Connections request + accept + message + unread counts.

### Playwright E2E tests

Use Playwright only for high-value cross-page flows:
- Login/logout and role redirects.
- Signup smoke through the role-specific wizard.
- Host create property/post job, cleaner apply, host accept, cleaner complete, both review.
- Direct offer accept/decline.
- Connections drawer and chat smoke.
- Public landing cleaner browsing/open-job map privacy.

Avoid duplicating every service edge case in E2E. Backend service/API tests should own business invariants.

## 5. Coverage Goals

Coverage goals should be domain-specific rather than a single global percentage.

| Domain | Initial target | Notes |
|---|---:|---|
| Marketplace services | 90%+ service branch coverage | Highest-risk business invariants: assignments, offers, completion, agency delegation |
| Feedback services/API | 90%+ service branch coverage | Double-blind and review-window rules are critical |
| Accounts auth/status/signup | 85%+ serializer/view/service coverage | Include CSRF/session/account-state gates |
| Properties/calendars/ICS | 80%+ for parser/views/services | Current coverage is minimal; focus on ownership and parser behavior |
| Connections | 80%+ service/API coverage | Edge lifecycle and serializer fields |
| Notifications/Celery | 80%+ task/view coverage | Mock outbound email; verify retry/idempotency behavior |
| Locations/Sofia | 85%+ API/utility coverage | Include catalog parity, not just line coverage |
| Core/observability | 70%+ focused coverage | Request ID, audit log, sanitizer, CSRF failure |
| Frontend API/utilities | 90%+ | Small surface, high leverage |
| Signup/login/admin components | 75%+ behavior coverage | Prioritize user flows and error states |
| Host/Cleaner dashboards | 65-75% component behavior coverage | Large components; target critical workflows rather than raw lines |
| Shared public components | 75%+ | Cleaner browser, notifications, connections, cookie consent |
| E2E | 5-7 smoke specs | Critical path coverage, not exhaustive permutations |

Coverage anti-goals:
- Do not chase dashboard line coverage by asserting implementation details.
- Do not test Django/DRF internals.
- Do not repeat the same invariant at service, API, component, and E2E unless each layer adds unique risk coverage.

## 6. Implementation Order

1. Add backend marketplace invariant tests for one assignment per job and concurrent/stale acceptance: `backend/apps/marketplace/services.py::accept_application`, `accept_offer`.
2. Add account status and cleaner verification gate tests across accounts and marketplace: `UserViewSet.reject/suspend`, `CleanerProfileViewSet.perform_update`, `_ensure_cleaner_workable`.
3. Add marketplace API negative-path tests for publish/update/delete/applications/offers/favourites/agency assignment.
4. Add feedback invariant tests for duplicate/self/non-involved/private/window-closed reviews and notification unlock behavior.
5. Add completion timing and Europe/Sofia boundary tests in backend, then frontend visibility tests for cleaner completion controls.
6. Add properties/calendar/ICS tests for parser, upload/fetch, ownership, reservations, and conflicts.
7. Add notification task tests for Resend-backed signup/application/completion emails and retry/fallback behavior.
8. Add connections lifecycle edge tests for decline/remove/reactivation/unread/serializer fields.
9. Add Sofia catalog parity and frontend location utility tests.
10. Add frontend `apiFetch`, Sentry sanitizer, money, and appdash preference tests.
11. Add frontend signup/login/admin component tests with mocked API and navigation.
12. Expand host dashboard component coverage for property, job, ICS, application, direct-offer, favourites, notifications, and connections behavior.
13. Expand cleaner dashboard component coverage for apply/withdraw/offer/complete/profile/district/income behavior.
14. Add public marketplace component tests for cleaner browsing, open-job map privacy, connect, consent, and account deletion.
15. Add Playwright E2E smoke harness and a small set of broad role/workflow specs after backend and component tests stabilize.

## Proposed Verification Commands

Backend:

```powershell
cd backend
python manage.py check
python manage.py test
```

Frontend:

```powershell
cd frontend
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
```

E2E after a Playwright harness exists:

```powershell
cd frontend
npx.cmd playwright test
```

Audit note: these commands were not run as part of this read-only audit.
