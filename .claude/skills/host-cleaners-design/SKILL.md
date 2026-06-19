---
name: host-cleaners-design
description: Use this skill to generate well-branded interfaces and assets for Host Cleaners (a Bulgarian short-term-rental host ↔ cleaner marketplace), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## What's here
- `README.md` — product context, content voice, visual foundations, iconography. **Start here.**
- `colors_and_type.css` — design tokens (color, type, radii, shadow, motion) + semantic type classes. Link this and use the variables.
- `preview/` — small specimen cards for every foundation and component.
- `ui_kits/web/` — a click-through React recreation of the marketplace (landing, cleaner profile modal, login, host dashboard). Read its README; lift components from it.
- `frontend/` — reference source files imported from the product repo.

## Quick rules of thumb
- One brand color: coral `#ff385c`. Accents (teal/gold/green/orange) are status-only.
- Warm ecru canvas (`--canvas`) + white cards. Sentence case everywhere. No emoji.
- Type is Geist (fallback Inter); headings heavy and tight, body 16/1.5.
- Icons are Lucide, 2px stroke. Pills for buttons/tabs/badges; 14px card radius.
