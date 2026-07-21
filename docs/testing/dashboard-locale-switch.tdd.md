# Dashboard Locale Switch — TDD Evidence

Source plan: User-reported bug diagnosis; no external plan was used.

## User journeys

- As a host, I can select Bulgarian or English in my account menu and immediately see the dashboard in that locale.
- As a cleaner, I can select Bulgarian or English in my account menu and immediately see the dashboard in that locale.

## Evidence

| # | What is guaranteed | Test | Result | Evidence |
|---|---|---|---|---|
| 1 | A successful host preference update navigates using the requested locale. | `features/host/HostDashboard.test.tsx` | PASS | `npm.cmd test -- features/host/HostDashboard.test.tsx features/cleaner/CleanerDashboard.test.tsx` |
| 2 | A successful cleaner preference update navigates using the requested locale. | `features/cleaner/CleanerDashboard.test.tsx` | PASS | `npm.cmd test -- features/host/HostDashboard.test.tsx features/cleaner/CleanerDashboard.test.tsx` |
| 3 | Bulgarian has an explicit locale prefix, so the route selected by the dashboard switch is canonical. | `i18n/navigation.test.ts` | PASS | `npm.cmd test -- i18n/navigation.test.ts features/host/HostDashboard.test.tsx features/cleaner/CleanerDashboard.test.tsx` |

RED: the two added tests failed because neither dashboard called the locale-aware router after saving `preferred_language`.

GREEN: both tests passed after the dashboards switched through `i18n/navigation`, preserving the current query string.

Follow-up: with `localePrefix: "as-needed"` and Next.js trailing-slash routing, `/bg/cleaner/` redirected to `/cleaner/`, which internally rewrote back to `/bg/cleaner/`. The RSC request consequently failed. Locale routing now uses explicit `/bg/…` and `/en/…` paths; direct RSC requests to `/bg/cleaner/` return `200` with `Content-Type: text/x-component`.

## Verification and coverage

- `npm.cmd test` — 13 files, 56 tests passed.
- `npm.cmd run typecheck` — passed.
- `npm.cmd run lint` — passed with four pre-existing React hook dependency warnings.
- `npm.cmd test -- --coverage` could not run because `@vitest/coverage-v8` is not installed. No dependency was added for this focused fix.
