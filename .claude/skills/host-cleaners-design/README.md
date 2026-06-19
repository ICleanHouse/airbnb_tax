# Host Cleaners — Design System

A design system for **Host Cleaners**, a marketplace that connects Bulgarian
short-term-rental hosts with verified turnover cleaners and cleaning agencies.
Hosts post single cleanings or whole-month batches; verified cleaners and
agencies apply; hosts assign one; both sides coordinate around a shared calendar
and leave two-way reviews after the job. Payments are intentionally out of scope
for v1 — the product's job is trust and coordination, not transactions.

- **Market:** Bulgaria (Sofia, Plovdiv, Varna, Burgas, Bansko + seasonal areas)
- **Languages:** Bulgarian + English · **Currency:** EUR
- **Audiences:** Hosts (1–20 properties), individual cleaners, cleaning
  agencies, and internal admins who approve supply.
- **Tech (source product):** Django + DRF backend; Next.js 15 / React 19
  responsive web + PWA, TypeScript, Motion for animation.

## Sources used to build this system
This system was reverse-engineered from the company's own codebase. The reader
may not have access, but these are the references (explore them to build more
faithfully):

- **GitHub:** https://github.com/ICleanHouse/airbnb_tax (a mirror exists at
  https://github.com/DjimitarYo/airbnb_tax) — "Host Cleaner Marketplace."
  - Design tokens & all component CSS: `frontend/app/globals.css`
  - Landing & directory: `frontend/app/page.tsx`,
    `frontend/app/components/CleanerBrowser.tsx`
  - Components: `frontend/components/*` (`CleanerProfileCard`, `RatingStars`,
    `CleanerProfileModal`, `JobOfferModal`, `NotificationBell`)
  - Product strategy & copy voice: `BUSINESS.md`, `README.md`
> Repo note: the repository is named `airbnb_tax` for historical reasons; the
> actual product is the Host Cleaner Marketplace, not a tax tool.

---

## CONTENT FUNDAMENTALS — how Host Cleaners writes

The voice is **plain, direct, and reassuring** — a calm service that removes
coordination stress, never a hype-y growth app.

- **Person:** Speaks **to the user as "you"**, refers to the product as "we"
  sparingly. Headlines are user-goal statements: *"Find a verified cleaner near
  you"*, *"Your cleaning jobs"*.
- **Casing:** **Sentence case everywhere** — headings, buttons, labels. No
  Title Case CTAs. Buttons are short verb phrases: *"Post a job"*, *"Send
  offer"*, *"Review applicants"*, *"Offer a job"*, *"Create an account"*.
- **Field labels** are 1–2 words, sentence case: *Email, Password, City,
  District, Offered price (EUR)*.
- **Tone of microcopy:** helpful and literal. Empty states explain what to do
  (*"No cleaners match these filters yet."*, *"No reviews yet."*). Errors are
  gentle and actionable (*"Check your email and password and try again."*).
- **Trust language** is core vocabulary: *verified, trusted, reviewed,
  approved, ratings, reviews*. Reputation ("4.9 · 32 jobs", "New") sits on
  every cleaner.
- **Domain nouns:** host, cleaner, agency, turnover, job, batch, applicant,
  assignment, district, service area, reservation.
- **No emoji.** No exclamation-heavy marketing. Numbers stay concrete (EUR
  prices, job counts, ratings) — no vanity stats or filler.
- **Eyebrows / kickers** are uppercase and short (*"SHORT-TERM RENTAL TURNOVER
  CLEANING"*) — the only place uppercase is used.

---

## VISUAL FOUNDATIONS

**Overall vibe:** clean, white-space-generous marketplace clarity in the spirit
of Airbnb, softened toward a warm, premium calm. One decisive hero color
(coral), neutral everything-else, accents reserved strictly for status.

### Color
- **Coral `#ff385c`** is the single brand/action color (`#e21d48` pressed). Used
  for primary buttons, the logo mark, the eyebrow kicker, and focus rings — never
  as a full-bleed wash or gradient field.
- **Supporting accents are status-only:** teal `#008489` (open / links in
  context / avatars), gold `#b7791f` (ratings ★, "assigned", the Agency tag),
  green `#15803d` (completed), orange `#c2410c` (disputed). They never decorate.
- **Neutrals:** the source product is pure white. The current brand direction
  softens the page canvas to a **warm ecru `#f7f4ee`** (`--canvas`) with crisp
  white `#ffffff` cards/surfaces on top — calmer and more premium while keeping
  contrast crisp. Ink `#111`, body `#222`, muted `#6a6a6a`, hairline `#ddd`.

### Type
- **Geist** (modern minimal grotesque) is the family, falling back to the
  product's original **Inter**, then the system stack. *(Substitution flagged
  below.)*
- Weights are **refined, not heavy** — headings and UI labels sit at **600**
  (semibold), body at 400. This is the premium-marketplace evolution of the
  source product, which used 800 throughout.
- Headings track tight (−0.015 to −0.025em, line-height 1.0–1.3); body is
  comfortable **16px / 1.5**. Display headline is `clamp(40–78px)`.

### Form fields
- Inputs are **full pills** with an almost-transparent fill (3.5% ink), no
  border at rest, 52px tall. Hover deepens the wash; focus lifts to white with
  a coral border + `0 0 0 4px rgba(255,56,92,.12)` ring.

### Buttons
- **One filled coral pill per view** for the single decisive action (Post a
  job, Send offer, Sign in). Everything secondary is **standalone text** — no
  box — with a 2px underline that grows in on hover. Mirrors the product's own
  nav.

### Search / filters
- The directory filter is a single **white pill bar** with segmented fields
  divided by hairlines (City · District), each segment highlighting on hover —
  an Airbnb-style search capsule rather than a row of boxed selects.

### Backgrounds & imagery
- The **hero** is a full-bleed warm interior photo with a left-to-right black
  protection gradient (`rgba(0,0,0,.72) → .18`) so white headline text stays
  legible; photo is scaled 1.02 to avoid edge gaps. Imagery is **warm, bright,
  lived-in interiors** — never cold or grainy.
- Everywhere else is flat ecru/white. **No gradients** as decoration, no
  textures, no patterns.

### Shape, border, elevation
- **Radii:** inputs/buttons are **full pills (999px)**; listing-cover photos
  14px; cards & list rows 16px; modals/large panels 20px. Chips, tabs, badges
  are pills too.
- **Borders:** 1px hairline `#ddd`. Cards rely on the border at rest and trade
  it for a soft shadow on hover — **no colored left-border accents** (status is
  carried by the badge, not the card edge).
- **Shadows** are soft, diffuse, and restrained: `xs` resting controls, a
  `0 6px 20px` lift on hover, `0 12px 40px` on floating panels, `0 24px 64px`
  on modals — all neutral ink, never colored or hard.

### Cards & imagery
- The cleaner directory uses **photo-forward vertical listing cards** in the
  Airbnb idiom: a square cover photo (14px radius) that zooms `1.04` on hover,
  a translucent "Agency" pill overlaid top-left, then name + inline **★ rating**
  on one row, with location and job-count/experience as muted sub-lines. No
  card chrome — the photo is the card.
- Imagery is **warm, bright, lived-in interiors and real cleaners at work** —
  never cold, grainy, or stocky-corporate.

### Motion & states
- **Transitions are quick and subtle:** `0.12s` for hover lifts/color, ~`0.2s`
  elsewhere, `cubic-bezier(.4,0,.2,1)`. Signup uses Motion for wizard step
  transitions; reduced-motion users get instant swaps.
- **Hover:** cards lift `translateY(-2px)` + gain shadow + a teal border tint;
  ghost/secondary buttons fill with `#e6e6e6`; primary darkens to `#e21d48`.
- **Press:** primary buttons scale to `0.98`.
- **Focus:** coral border + `0 0 0 3px rgba(255,56,92,.14)` glow ring on inputs.
- **No bounces, no infinite/looping decorative animation.**

### Layout
- Sticky translucent headers (`rgba(255,255,255,.96)` + blur), ~64–80px tall.
- Content max-width ~1100–1180px, page gutters `clamp(16–40px)`.
- Directory is a responsive auto-fill grid, `minmax(260–280px, 1fr)`, 16px gap.
- Dashboards use centered pill tabs with inline count chips (active = ink fill).
- Modals center on a `rgba(0,0,0,.48)` backdrop, capped at `100vh − 40px`,
  scroll internally.

---

## ICONOGRAPHY
- **Single icon family: [Lucide](https://lucide.dev)** (`lucide-react` in the
  product; CDN `lucide` UMD in this system's HTML). 2px stroke, `currentColor`,
  ~14–18px inline.
- Recurring glyphs: `home` (brand mark), `map-pin` (location), `calendar`
  (jobs/dates), `user-plus` (applicants/signup), `shield-check` (admin/verify),
  `send` (offers), `bell` (notifications), `car` (transport), `message-square`
  (reviews), `log-in`, `x`, `star`.
- The **logo** is an original mark: a **house containing a sparkle** ("a
  sparkling-clean home") set in a coral rounded-square tile — deliberately
  distinct from Airbnb's "Bélo." Files in `assets/`: `mark.svg` (solid coral
  tile — primary mark **and** favicon), `favicon.svg` (same), `glyph.svg`
  (coral house, transparent bg, sparkle knocked out — for inline use on light
  surfaces), `glyph-mono.svg` (ink, single-color), `logo.svg` (horizontal
  lockup: mark + "Host Cleaners" in Geist 650). Wire the favicon with
  `<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">`.
- **No emoji. No mixed icon sets. No Unicode-glyph icons** (the one exception is
  the `★` star character used for ratings, colored gold/`#ddd`).
- **No raster logo or app-icon** is needed — the brand mark and favicon ship as
  crisp SVG (`assets/mark.svg` / `favicon.svg`). No illustration assets exist in
  the source repo; if real brand art is produced later, drop it in `assets/`.

---

## File index (manifest)
| Path | What |
|---|---|
| `README.md` | This file — product context, content + visual foundations, iconography |
| `styles.css` | Design-system entry point — link this; it `@import`s the tokens |
| `colors_and_type.css` | All design tokens (color, type, radii, shadow, motion) + semantic type classes |
| `SKILL.md` | Agent Skill entry point (works in Claude Code) |
| `preview/` | 18 Design-System preview cards (Type, Colors, Spacing, Components, Brand) |
| `preview/_card.css` | Shared frame styles for preview cards |
| `ui_kits/web/` | Click-through web marketplace UI kit (see its README) |

> The original product source is **not** vendored here — read it directly from
> the GitHub repo linked at the top of this file (`frontend/app/globals.css` for
> tokens, `frontend/components/*` for component code).

### UI kits
- **`ui_kits/web/`** — the marketplace web product: landing/cleaner directory,
  cleaner profile modal, login, host job-board dashboard.

## How to use
1. Link `styles.css` (it pulls in `colors_and_type.css`) and use the CSS
   variables + semantic classes.
2. Pull components/patterns from `ui_kits/web/` and the `preview/` cards.
3. Keep the voice and rules above. When in doubt, match the source repo.

---

### Caveats / substitutions
- **Font substitution:** the source product ships **Inter**; this system uses
  **Geist** (loaded from Google Fonts) per the "modern, minimal" brand direction,
  with Inter retained as the fallback. If you have licensed brand font files,
  drop them in `fonts/` and update `--font-sans`.
- **Warm ecru canvas** is an intentional evolution of the product's pure-white
  background — both tokens (`--canvas`, `--paper`) are available.
- No raster brand assets exist yet (see Iconography).
