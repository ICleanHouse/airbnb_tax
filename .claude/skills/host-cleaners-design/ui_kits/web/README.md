# Web UI Kit — Host Cleaners marketplace

High-fidelity, click-through recreation of the Host Cleaners web product
(Next.js / React responsive web + PWA). Cosmetic-only: no real API, auth, or
data — it reproduces the look, layout, and interaction patterns so screens can
be assembled quickly for mocks and prototypes.

## Run it
Open `index.html`. It loads React 18 + Babel + Lucide from CDN, then the
component files below. Styling comes from `kit.css` + `../../colors_and_type.css`.

## Click-through flow
`Landing` → click any cleaner card → `Cleaner profile modal` → "Offer a job"
routes to → `Login` → sign in → `Host dashboard` (job board with status lanes).

## Components
| File | Exports | What it is |
|---|---|---|
| `data.jsx` | `window.KIT` | Sample cleaners, cities, host jobs + `initials()` helper |
| `Primitives.jsx` | `Icon`, `RatingStars`, `Avatar`, `BrandMark`, `Badge` | Shared atoms |
| `Landing.jsx` | `SiteHeader`, `Hero`, `CleanerCard`, `CleanerBrowser` | Public directory |
| `CleanerProfileModal.jsx` | `CleanerProfileModal` | Full profile + reviews dialog |
| `LoginPanel.jsx` | `LoginPanel` | Session login screen |
| `HostDashboard.jsx` | `HostDashboard` | Job lifecycle board (open / assigned / completed) |

## Conventions
- Icons are **Lucide** via `<i data-lucide="…">`; `lucide.createIcons()` runs
  after every React render (see the `useEffect` in `index.html`).
- Each component file ends with `Object.assign(window, {…})` so sibling Babel
  scripts share scope. Style objects, if any, are component-scoped — never a
  bare `const styles`.
- Status colors map exactly to the product: open = teal, assigned = gold,
  completed = green, with a matching 3px left-border accent on job cards.

## Faithful to the source, with one evolution
Layout, component structure, and status vocabulary are lifted from
`frontend/app/globals.css` and the React components in the source repo. The one
intentional deviation is the **type family (Geist instead of Inter)** and the
**warm ecru canvas**, both per the current brand direction — see the root
`README.md`.

## Not built here
The source product also has: a multi-step signup wizard, cleaner dashboard,
admin approval dashboard, agency tools, property calendar with Airbnb iCal
import, and a district map selector. These were out of scope for the kit's
first pass — ask if you'd like any of them recreated.
