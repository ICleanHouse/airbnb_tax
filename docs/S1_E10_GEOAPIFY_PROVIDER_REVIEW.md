# S1-E10 Geoapify Provider Review

**Status:** Evidence prepared — owner/privacy approval pending  
**Reviewed:** 2026-07-22  
**Provider:** Geoapify / KEPTAGO LTD (Cyprus, as named in its DPA)  
**Purpose:** approved-host private address search and reverse geocoding for
property create/edit.

This is an engineering evidence record, not legal advice or an acceptance of a
provider agreement. The owner or designated privacy lead must make the final
approval decision before production use.

## Data flow reviewed

```text
Approved host browser
  -> private, authenticated Host Cleaner API
  -> api-eu.geoapify.com geocoding endpoint
  -> minimized candidate response
  -> private browser form
```

The browser sends no provider key and makes no direct geocoding or map-tile
request. The backend sends the requested search text or exact coordinate,
locale, API key, and its normal technical request metadata. This can include a
property address or precise location, so it must be treated as personal data
when it identifies or can be linked to a host/property.

## Official-provider evidence

| Topic | Evidence | Engineering treatment |
|---|---|---|
| Processor and DPA | Geoapify publishes an Article 28 GDPR [DPA](https://www.geoapify.com/data-processing-agreement/) (revision 2024-08-15), naming KEPTAGO LTD as supplier/processor. | Privacy lead must decide whether the published DPA is sufficient or a signed/custom DPA is needed. |
| Location | The DPA says API processing is strictly EU-bound when using `api-eu.geoapify.com`. | The backend is pinned to that host and regression-tested. |
| Request retention | The [privacy policy](https://www.geoapify.com/privacy-policy/) says API-request body, headers, IP address, and timestamp are retained for access control/usage and normally no longer than 24 hours for successful requests. The DPA’s appendix describes exceptional suspicious/fraud cases retaining detailed information for up to two months. | Do not send guest/access data, free text beyond the address lookup, or provider keys in browser requests. Describe this recipient, purpose, and retention in the platform privacy notice. |
| Subprocessors/infrastructure | The privacy policy identifies Cloudflare, Bunny CDN for `.eu` API calls, and Hetzner hosting for API-request delivery/infrastructure. | Record the final approved recipient/subprocessor assessment in the privacy register. |
| Attribution | The [terms](https://www.geoapify.com/terms-and-conditions/) require OpenStreetMap attribution and Geoapify attribution on the Free plan. | The private picker displays both links; canonical GeoJSON retains OpenStreetMap attribution. |
| Availability | Geoapify’s terms state paid plans have a default 99.5% monthly SLA; no equivalent Free-plan SLA is stated there. | Manual address/district entry remains the fallback; do not make geocoding a hard dependency for a property form. |

## Implemented safeguards

- Server-only `GEOAPIFY_API_KEY`; never a `NEXT_PUBLIC_*` value.
- Approved host/platform-admin permission, input bounds, private/no-store
  responses, user and shared-provider throttles.
- `api-eu.geoapify.com` endpoint pinned by backend regression test.
- No raw address, coordinate, upstream URL, or body in application audit
  metadata or application logs.
- Browser uses owned `apiFetch` endpoints; it has no remote geocoding or tile
  request and keeps a localized manual-entry fallback.
- Visible OpenStreetMap and Geoapify attribution in the private picker.

## Required owner decision before production

- [ ] Accept Geoapify as a processor/recipient for precise property address and
      coordinate queries, based on the DPA and privacy policy.
- [ ] Confirm the correct subscription, budget alert, and rate ceiling for the
      expected pilot volume.
- [ ] Decide whether a signed/custom DPA is required; Geoapify directs such
      requests to its support contact.
- [ ] Update the customer-facing privacy notice with provider, purpose, data
      categories, EU API endpoint, recipient/subprocessor information, and
      stated retention characteristics.
- [ ] Retain the approved terms/DPA version, review date, accountable owner,
      and renewal/re-review date in the privacy register.

## Browser trace status

The code and automated tests establish the owned boundary. The final manual
trace must be run with a real approved-host session and should confirm that
property create/edit requests go only to the local owned API and that anonymous
public demand requests have no exact property data or provider request.
