---
name: frontend-next-patterns
description: Frontend conventions for the Host-Cleaner marketplace Next.js/React app — the apiFetch-only rule, FormData Content-Type pitfall, globals.css design-token system, component-extraction convention, and dev/build command gotchas. Use when touching frontend/app/*, frontend/lib/*, or frontend/app/globals.css.
metadata:
  origin: adapted-from-ECC
  source: https://github.com/affaan-m/ECC (skills/react-patterns, skills/nextjs-turbopack, skills/react-testing)
---

# Host-Cleaner Frontend Patterns

Stack: Next.js 15.5+ / React 19.2+, TypeScript 5.9+, Motion (`motion/react`) for transitions. No CSS library — plain CSS in `frontend/app/globals.css`.

## When to Activate

- Adding or editing anything under `frontend/app/` or `frontend/lib/`.
- Adding a new API call from the frontend.
- Adding new UI that needs styling.
- Running typecheck/lint/dev/build.

Read `AGENT.md`'s "Frontend Structure Conventions" section before starting — this skill summarizes it as a checklist.

## The Two Hard Rules

1. **Never call `fetch` directly.** Always use `apiFetch` from `frontend/lib/api.ts`. It sets `Content-Type: application/json` only when `body` is a string, reads the `csrftoken` cookie, and adds `X-CSRFToken` on POST/PUT/PATCH/DELETE. Bypassing it breaks CSRF on mutating requests.
2. **Never set `Content-Type: application/json` on a `FormData` body.** The browser must set the multipart boundary itself. This bites every time someone copies a JSON-fetch pattern for a file upload (ICS import, profile photo). `apiFetch` already handles this correctly if you pass a `FormData` instance as `body` — don't override the header yourself.

## Routing You Need to Know Before Adding a Page

| Route | Auth | Notes |
|---|---|---|
| `/` | No | Public landing — `CleanerBrowser` for hosts, `AreaDemandPanel`/`OpenJobMap` for cleaners |
| `/login` | No | Fetches `/me/` on success, routes by role |
| `/signup` | No | Single wizard, Motion transitions — old step routes redirect here |
| `/app` | Yes | Generic workspace, auto-redirects host→`/host`, admin→`/admin` |
| `/admin` `/host` `/cleaner` `/agency` | Yes | Role-gated dashboards (`/agency` not built yet) |
| `/cleaners` | Yes (host/admin) | Cleaner directory, shares `CleanerBrowser` |

`next.config.mjs` has `trailingSlash: true` plus dual rewrite rules — this is required for Django's `APPEND_SLASH` to see the trailing slash through Next's proxy. Don't remove it when touching routing/rewrites.

## Component Extraction

`host/page.tsx` (~2.3k lines) and `cleaner/page.tsx` (~2.6k lines) are already large dashboards. Don't add more inline UI to them — extract into `frontend/app/components/`. Existing shared pieces to check before writing something new: `CleanerBrowser`, `CleanerProfileCard`, `CleanerProfileModal`, `ReviewModal`, `NotificationBell`, `Connections`, `ConnectButton`.

## CSS — globals.css Design Tokens

No CSS library. Everything goes through tokens already defined in `frontend/app/globals.css`:

```css
--brand: #ff385c   /* Airbnb red — CTAs, icons */
--teal: #008489    /* trust/success/cleaner chip */
--gold: #b7791f    /* warnings, ratings, assigned status */
--ink: #111111
--muted: #6a6a6a
--line: #dddddd
--surface: #ffffff
--radius: 8px
```

Reuse existing shared classes (`.primary-link`, `.secondary-link`, `.form-grid`, `.form-error`, the `.host-modal-*` / `.host-appdash-*` families, etc. — see CLAUDE.md's CSS Design System section for the full list) before inventing a new class name for something that's structurally the same pattern (a modal, a stat card, a pill button).

**Grid pitfall:** `display: grid` + `min-height` on the same element defaults to `align-content: stretch` and inflates rows. Put the grid and the min-height/padding on separate elements (grid on the outer, padding on an inner wrapper).

## Commands

```powershell
cd frontend
npm.cmd install
npm.cmd run dev -- --hostname 127.0.0.1
npm.cmd run typecheck && npm.cmd run lint
```

- Use `npm.cmd` / `npx.cmd`, not bare `npm`/`npx` — bare commands hit PowerShell execution-policy errors on this machine.
- **Never run `npm.cmd run build` while `npm.cmd run dev` is running** — both write to `.next` and the build will produce stale-runtime errors. Stop dev or clear `.next` first.
- Always run `typecheck` and `lint` after a frontend change before calling it done.

## Data-Model Gotchas

- City/district filtering is client-side. Cleaner profiles expose `city` plus a flat `string[]` of canonical district names in `service_areas`. Prefer `city` for city filtering over inferring from district.
- Sofia search dropdowns and the cleaner-profile map must use the shared `loadServiceZones` path and the stable `sofia:osm-1..144` IDs from `frontend/lib/sofiaDistricts.ts`. Preserve exact GeoJSON names including `кв.` / `ж.к.` prefixes — don't "clean up" these strings or restore old Sofia aliases.
