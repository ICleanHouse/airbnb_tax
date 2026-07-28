# S1-E07 conversion and role routing — TDD evidence

**Status:** In progress — do **not** mark S1-E07 Done.

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
| `npm.cmd test` | Passed: 18 files, 71 tests. |
| `python manage.py check` | Passed. |
| `python manage.py makemigrations --check --dry-run` | Passed; no changes. |
| `python manage.py test` | Timed out at the command ceiling after beginning the suite; no final result. |
| `python manage.py test apps.marketplace.tests.test_account_status_gates apps.connections.tests.test_connections apps.notifications.tests.test_notification_api` | Passed: 27 tests. |
| `npm.cmd run test:e2e` | Command passed; three pre-existing agency tests skipped because required seeded E2E services/accounts were absent. |
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
