# Shared Components

Reusable components that are not owned by one feature live here. Feature-specific UI should stay under `frontend/features/<feature>` until it is reused by another feature.

`frontend/app/components` contains temporary compatibility re-exports for old imports.

Current landing-page shared components:

- `AreaDemandPanel.tsx`: cleaner-side public landing panel. Loads aggregate demand via `/api/marketplace/area-stats/`, owns the selected city, and renders the work map plus demand cards. The bottom signup CTA is guest-only.
- `OpenJobMap.tsx`: Leaflet/OpenStreetMap work map for the `Find cleaning work` tab. Loads safe open-job markers from `/api/marketplace/open-job-locations/`, shows property photo popups, exposes `Offer cleaning` only to authenticated cleaners, opens an `Apply for job` overlay with editable price/message, and auto-updates the selected city from user-driven map movement without pulling the viewport back after pan/zoom.
