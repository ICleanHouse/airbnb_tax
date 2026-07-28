# S1-E07 conversion and routing maturity audit

**Date:** 2026-07-28  
**Scope:** read-only baseline for S1-E07. S1-E02 phone, SMS, ownership, badge,
and birth-date work is explicitly excluded.

## Method

The audit used focused CodeGraph exploration first, then inspected the exact
referenced sources. Query categories were authentication and role entry points;
guest protected actions; redirect/query callers; notification event routing;
agency routing; account-status gates; and related test discovery. CodeGraph
identified `dashboardPath`, `NotificationBell`, `notificationDestination`,
`ConnectButton`, the agency dashboard, their callers, and the existing
notification and account-status tests. Source inspection remains the basis for
the findings below.

## Findings

### Authentication, conversion, and return targets

| Surface | Current behavior | Evidence | S1-E07 gap |
| --- | --- | --- | --- |
| Login | Authenticates, fetches `me`, then calls a private `dashboardPath`; it ignores URL targets. | `frontend/app/[locale]/login/page.tsx:9-45` | No validated return mechanism or test coverage. |
| Signup | Landing uses `?role=` and signup finishes at `/app`. | `frontend/app/[locale]/page.tsx:213-215`; `frontend/features/signup/SignupPage.tsx:477-492` | Role is useful but the eventual destination is not retained. |
| Generic workspace | Routes admin, host, cleaner, and agency after loading `me`; otherwise it renders a status panel. | `frontend/app/[locale]/app/page.tsx:16-63` | Duplicates role routing and does not centralize safe targets. |
| Public header | Logged-out login and signup links have no return target. The dashboard selection omits agency and falls back to `/app`. | `frontend/app/[locale]/page.tsx:123-133, 203-215` | Conversion and agency path are inconsistent. |
| Logout | Each dashboard logs out and returns to `/`; the landing also clears its non-sensitive display hint. | `frontend/app/[locale]/app/page.tsx:60-63`; `frontend/features/{host,cleaner,agency}/*Dashboard.tsx`; `frontend/app/[locale]/page.tsx:100-105` | No security issue found; behavior needs a common locale-safe landing destination. |

No `next`, `returnTo`, callback, or remembered-destination utility exists.
The only query controls found are feature controls such as `?as=`, `?role=`,
dashboard section/review parameters, and notification metadata. The signup
browser recovery allowlist remains intentionally independent of routing state.

### Guest-triggered protected actions

| Action | Current behavior | Evidence | S1-E07 gap |
| --- | --- | --- |
| Connect | The component probes `/api/connections/`; an anonymous request falls through to an enabled Connect button. POST failure resets to idle without explanation. | `frontend/components/ConnectButton.tsx:25-77`; backend route contract in `TGN.md` | Silent protected-action failure; must offer localized login/signup continuation. |
| Direct offer | Only enabled by the authenticated host directory page; its backend call exposes a generic API error message. | `frontend/components/CleanerBrowser.tsx:82-92, 194-225`; `frontend/components/JobOfferModal.tsx:71-111` | No guest CTA in the normal landing flow; improve stable expected errors if encountered. |
| Apply, save/favourite, message | Available only inside authenticated role workspaces; the backend remains protected. | `TGN.md` API map; `backend/apps/marketplace/tests/test_account_status_gates.py:122-410` | No anonymous button was found, but role/status failure presentation requires audit during implementation. |
| Work discovery | Public aggregate demand offers a clear signup cleaner CTA. | `frontend/components/AreaDemandPanel.tsx:109-116` | Already a usable conversion path. |

### Role and status routing

| User state | Expected workspace | Current frontend baseline |
| --- | --- | --- |
| Anonymous | Public landing, login, or signup | `/app` shows login/signup; individual protected pages vary. |
| Approved host | `/host` | Login and `/app` route correctly. |
| Approved cleaner | `/cleaner` | Login and `/app` route correctly. |
| Approved agency | `/agency` | Login and `/app` route correctly; landing header falls back to `/app`. |
| Platform admin | `/admin` | Login and `/app` use `is_platform_admin`. |
| Pending | Role workspace/status, with locked explanation | `/app` has localized pending copy; backend blocks writes. |
| Rejected or suspended | Locked status surface; no protected marketplace action | `/app` has localized status copy; backend object hiding/gates remain authoritative. |
| Inactive or malformed role | Safe generic workspace/login outcome | No explicit frontend matrix or test was found. |

Agency S1-D05 routing is present: `frontend/app/[locale]/agency/page.tsx` loads
`AgencyDashboard`, which redirects non-agency users to `/app`
(`frontend/features/agency/AgencyDashboard.tsx:86-96`). This audit does not
propose redesigning the agency workspace.

### Notifications

`NotificationBell` marks a notification read and then calls
`notificationDestination` (`frontend/components/NotificationBell.tsx:94-116`).
The resolver accepts only a short canonical path/query allowlist and provides
legacy compatibility (`frontend/components/notificationRouting.ts:3-120`).
Existing unit coverage verifies canonical destination acceptance, external/
fragment/query rejection, role fallback, and connection metadata
(`frontend/components/notificationRouting.test.ts:20-60`).

Remaining gaps are locale preservation, recipient-role validation before a
deep link is used, an explicit unavailable-target fallback surface, and
coverage for agency event destinations. The notification data contract and
durable event/delivery flow are implemented elsewhere; the full event matrix
is maintained in `docs/S1_E06_NOTIFICATION_MATRIX.md` and must not be
retroactively rewritten.

### Dead or misleading controls

Google/Apple signup controls are not rendered: the code records that they are
hidden until real OAuth exists (`frontend/features/signup/SignupPage.tsx:996-997`).
No OAuth implementation or placeholder destination was found. This satisfies
the "remove or clearly label" part of S1-E07; no OAuth work is in scope.

### Backend authorization and test baseline

The backend already enforces account state independently of UI redirects.
`backend/apps/marketplace/tests/test_account_status_gates.py:122-410` covers
blocked host writes, session retention after rejection/suspension, blocked
cleaner applications, and agency member eligibility. Existing notification
routing unit coverage is in `frontend/components/notificationRouting.test.ts`.
No dedicated frontend safe-redirect, login-return, guest-connect, full role
matrix, or browser E2E coverage was found in CodeGraph’s discovered callers.

## Exact S1-E07 gaps to implement

1. Create one typed, tested safe internal redirect utility that rejects external,
   protocol-relative, encoded-external, malformed, unsupported, and role-bound
   destinations while preserving `/bg` and `/en` prefixes.
2. Replace duplicated login and generic-workspace role routing with that utility.
3. Give guest Connect a localized login/signup continuation and preserve only a
   safe destination; do not auto-submit the connection after login.
4. Make status/blocked outcomes accessible and useful without exposing staff
   notes or changing backend permissions.
5. Centralize notification destination validation/fallback, preserve locale,
   validate numeric references, and provide an authorized role-safe fallback.
6. Add focused unit/component tests and browser coverage where the existing
   test infrastructure can execute it.

## CodeGraph impact record

Focused analysis categories: authentication entry points and callers;
notification event-to-component routing; guest protected actions; account
status permission tests; agency workspace routing; and test discovery.
CodeGraph identified the direct dependants to re-check after each batch:
`dashboardPath` (login only), `NotificationBell` (five dashboard/landing
callers), `notificationDestination` (unit tests), `ConnectButton`
(`CleanerProfileModal`), and the agency dashboard. Exact source was inspected
before this document was written.
