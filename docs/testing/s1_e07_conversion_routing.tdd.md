# S1-E07 conversion and role routing — TDD evidence

**Status:** Done — all required automated evidence below passed on 2026-07-28.

## Original gaps

The read-only maturity audit found an ignored login return target, duplicated
role routing, an agency omission in the landing dashboard link, guest Connect
silently returning to idle after a protected API failure, and notification
routing that did not preserve the locale. See
[the maturity audit](s1_e07_conversion_routing_maturity_audit.md).

## Implemented slice

- `frontend/lib/redirects.ts` is the typed single allowlist for internal
  application destinations and post-auth role routing.
- It accepts only known local routes and permitted short query values; rejects
  absolute/protocol-relative/encoded-external/malformed/hash/unsupported and
  sensitive query values; preserves `bg`/`en` prefixes; and constrains a signed
  in user to their role boundary.
- Login, signup completion, and `/app` use `postAuthDestination`.
- A guest Connect redirects to localized login with only the cleaner-profile
  return destination. The connection is never replayed automatically.
- `CleanerBrowser` restores that profile modal from the validated numeric
  return query.
- Notification routing now delegates destination validation to the same
  utility and preserves the active locale for canonical, legacy, and fallback
  paths.
- Landing routing recognizes the existing agency workspace. OAuth controls were
  already hidden, not exposed as dead controls.

## Security decisions

- Redirect state is URL-only, relative, allowlisted, bounded, and has no
  passwords, tokens, codes, profile data, or staff/internal information.
- Backend authentication and object-hiding authorization were not weakened or
  changed.
- Rejected, suspended, and unsupported roles are sent to the locked `/app`
  surface after authentication; approved and pending users retain the current
  role-workspace contract.
- Notification object existence remains a backend responsibility. Frontend
  fallbacks are role-local and do not branch on unauthorized object details.

## Role/status matrix

| State | Destination |
| --- | --- |
| Anonymous | localized public landing/login/signup |
| Approved or pending host | `/host` |
| Approved or pending cleaner | `/cleaner` |
| Approved or pending agency | `/agency` |
| Platform admin | `/admin` |
| Rejected, suspended, malformed, unsupported | locked `/app` |

## Notification route matrix

| Input | Destination behavior |
| --- | --- |
| Contract destination | validated local role route with active locale |
| Review legacy metadata | host/cleaner review surface with numeric ID only |
| Connection/message metadata | validated numeric connection target; drawer flow remains local |
| Unknown, deleted, hidden, or invalid metadata | current role-local fallback; no object detail revealed |

## CodeGraph evidence

Focused CodeGraph categories: authentication and authorization entry points;
login/signup/logout/role routing; redirect/return utilities; protected guest
actions; notification event-to-UI routing; agency S1-D05 routing; account
status tests; and affected-test analysis.

Post-change caller checks found:

- `postAuthDestination`: login `submitLogin`, signup `createAccount`, and
  `/app` `loadUser`, plus its unit test.
- `notificationDestination`: `NotificationBell` and its unit test.
- `ConnectButton`: `CleanerProfileModal`; its destination is returned through
  `CleanerBrowser`.

The initial and final index checks were current. `codegraph affected` also
identified account-status, connections, notification, dashboard, signup, and
new redirect tests as the related verification surface.

## Files changed

Application: `frontend/lib/redirects.ts`, its test, login, signup, generic
workspace, landing, cleaner browser/profile/connect, notification routing and
tests. Documentation: `AGENTS.md`, `AGENT.md`, `README.md`, `DEV.md`,
`architecture.md`, `TGN.md`, `CURRENT_PROGRESS.md`, the Stage 1 plan, this
record, the maturity audit, and the CodeGraph documentation audit.

## Tests and commands

| Command | Result |
| --- | --- |
| `npm.cmd test -- --run lib/redirects.test.ts components/notificationRouting.test.ts` | Passed: 8 tests. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd run lint` | Passed with 4 pre-existing hook-dependency warnings. |
| `npm.cmd test` | Superseded by the final 19 files / 79 tests result below. |
| `python manage.py check` | Passed. |
| `python manage.py makemigrations --check --dry-run` | Passed; no changes. |
| `python manage.py test` | Superseded by the completed 472-test result below. |
| `python manage.py test apps.marketplace.tests.test_account_status_gates apps.connections.tests.test_connections apps.notifications.tests.test_notification_api` | Passed: 27 tests. |
| `npm.cmd run test:e2e` | Superseded by the final seeded 10-test result below. |
| `codegraph status .`, `codegraph sync .` | Passed; index current. |
| `codegraph callers postAuthDestination`, `codegraph callers notificationDestination`, `codegraph affected ...` | Passed; callers and affected tests verified. |

## Documentation review

The exhaustive Markdown inventory, classifications, changed/unchanged rationale,
canonical location, cross-agent findings, and validation commands are in
[codegraph_documentation_audit.md](codegraph_documentation_audit.md).

## Remaining blockers

S1-E07 cannot truthfully be Done yet: the specified full browser role/status,
external-next, guest-connect, notification target/deletion, and locale journeys
need a running seeded frontend/backend environment; account-status surfaces
still need explicit component/browser coverage for every blocked state; and the
full backend suite needs a completion result rather than a timed-out run.
No S1-E02 work was added.

## Follow-up verification and UI-hardening slice (2026-07-28)

### Additional gap found and fixed

Direct navigation to a role dashboard was not consistently routed away from a
terminal account state. Host, cleaner, and agency dashboards now route rejected
and suspended users to the existing localized `/app` locked surface. Pending
users deliberately retain the existing role-workspace contract and backend
authorization remains authoritative.

`/app` now provides a focused, localized status heading for a locked/unknown
account response and a focused, retryable generic error surface when account
state cannot be loaded. It never displays a raw API error or staff detail.

### Deterministic E2E fixtures

`seed_s1_e07_e2e` is a new Django management command for local/test browser
work. It is refused unless `DEBUG` is enabled and `APP_ENV` is `local`, `test`,
or `testing`; it requires a runtime `--password` and has no tracked credential.
It creates or refreshes disposable `s1e07-e2e-` users for approved host,
cleaner, agency and admin; pending host/cleaner/agency; rejected, suspended,
and inactive accounts; a public cleaner; agency membership; a pending agency
application; and valid/fallback in-app notifications. `--reset` touches only
connections and in-app notifications owned by those test users.

The documented startup sequence is in
[the E2E README](../../frontend/tests/e2e/README.md): apply existing migrations,
set one disposable `E2E_PASSWORD` only in the invoking shell, seed, start the
backend/frontend, then run Playwright. The command reports a concise migration
preflight error when the local schema is stale.

### Browser and component coverage added

- `s1-e07-routing.spec.ts`: approved and pending role destinations; terminal
  status/direct-dashboard containment; inactive-login behavior; EN/BG safe-next
  cases; guest Connect login/return/modal/no-replay/final submit journey; and
  host, cleaner, agency, and unavailable-notification routing.
- `agency-parity.spec.ts`: no longer skips for absent accounts/services and
  consumes deterministic agency data for readiness, member selection, and
  anonymous access.
- Redirect utility tests cover external, protocol-relative, encoded and
  double-encoded external, backslash, malformed-percent, fragment, sensitive,
  nested, JavaScript/data, oversized, unsupported and role-inappropriate input.
- Notification tests cover canonical role routes, locale preservation, legacy
  numeric review metadata, malformed/missing IDs, unknown events, unavailable
  paths and connection metadata fallback.
- `/app` component tests cover rejected, suspended, unsupported-role,
  unauthenticated and account-load-error states, including heading focus and no
  raw internal/API error text.

### CodeGraph follow-up evidence

After the edits, `codegraph sync .` completed with the index current.

- `codegraph callers postAuthDestination` found only login `submitLogin`,
  signup `createAccount`, `/app`, and its test.
- `codegraph callers safeInternalDestination` found only the redirect utility,
  login, signup, notification canonicalization, and tests.
- `codegraph callers notificationDestination` found `NotificationBell` and its
  unit test.
- `codegraph affected` identified the new seed test, account-status,
  connection, notification, host/cleaner/agency dashboard, signup, redirect
  and notification test surfaces. Source was inspected before each change.

### Additional commands and outcomes

| Command | Result |
| --- | --- |
| `python manage.py test apps.accounts.tests.test_s1_e07_e2e_seed` | Passed: 2 tests. |
| `npm.cmd test -- app/[locale]/app/page.test.tsx components/notificationRouting.test.ts lib/redirects.test.ts` | Passed: 16 tests. |
| `npm.cmd test -- features/host/HostDashboard.test.tsx features/cleaner/CleanerDashboard.test.tsx lib/redirects.test.ts components/notificationRouting.test.ts app/[locale]/app/page.test.tsx` | Passed: 31 tests. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd test` | Passed: 19 files, 79 tests. |
| `npm.cmd run lint` | Exit 0 with four pre-existing hook-dependency warnings and no errors. |
| `python manage.py check` | Passed. |
| `python manage.py makemigrations --check --dry-run` | Passed; no changes. |
| `python manage.py migrate` | Passed; no migrations to apply. |
| `python manage.py seed_s1_e07_e2e --password $env:E2E_PASSWORD --reset` | Passed; refreshed only the guarded local/test disposable S1-E07 data. |
| `python manage.py test` | Passed: 472 tests in 539.191s; 9 skipped; exit 0. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd run lint` | Exit 0 with the same four pre-existing hook-dependency warnings and no errors. |
| `npm.cmd test` | Passed: 19 files, 79 tests. |
| `npm.cmd run test:e2e` | Passed: 10 Chromium tests, 0 failed, 0 skipped (51.1s). Covers the agency fixtures, role/status matrix, malicious safe-next matrix, guest Connect return/no replay, and valid/unavailable host, cleaner, and agency notification routes. |
| `codegraph sync .` | Passed; already up to date. |
| `codegraph callers postAuthDestination`, `codegraph callers safeInternalDestination`, `codegraph callers notificationDestination`, `codegraph status .` | Passed; index current (330 files, 4,490 nodes, 11,508 edges) and no obsolete redirect caller found. |

### Current assessment

**Done.** The final local schema was current, the complete Django suite passed,
and the deterministic Playwright suite passed with no skips. Browser coverage
now includes role/status routing, malicious destination rejection, the guest
Connect return/no-replay journey, locale preservation, the existing agency
workspace paths, and role-safe valid/unavailable notification destinations.
No S1-E02 implementation was added.
