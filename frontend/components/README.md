# Shared Components

Reusable components that are not owned by one feature live here. Feature-specific UI should stay under `frontend/features/<feature>` until it is reused by another feature.

Current landing-page shared components:

- `AreaDemandPanel.tsx`: cleaner-side public landing panel. Loads aggregate demand via `/api/marketplace/area-stats/`, owns the selected city, and renders the work map plus demand cards. The bottom signup CTA is guest-only.
- `OpenJobMap.tsx`: compatibility-named district-demand component for the `Find cleaning work` tab. Loads canonical aggregate counts from `/api/marketplace/public-demand/` and never consumes job/property IDs, job-derived coordinates, addresses, media, schedule, price, host identity, or free text. Applications live only in the authenticated approved/verified cleaner workflow.
