# Host Cleaners Monetization Research

Access date for external sources: 2026-07-01.

This is a research and planning document, not a decision record and not legal,
tax, accounting, or payment compliance advice. No payment functionality is
implemented by this document.

## 1. Executive Summary

The starting monetization hypothesis is directionally sound: keep the core
marketplace free while validating liquidity, then test paid host and agency
operational tools before attempting transaction commissions or managed
payments.

Verified facts:

- The current product invariant is no in-app payments in v1. The app helps
  hosts and cleaners find each other, coordinate jobs, complete work, and review
  each other.
- Bulgaria adopted the euro on 2026-01-01, with fixed conversion rate EUR 1 =
  BGN 1.95583, so EUR pricing is now operationally natural for the product.
- EU short-term rental platform demand is large and still growing: Eurostat
  reported 398.1 million EU guest nights in Q3 2025 via Airbnb, Booking, and
  Expedia, up 8.7% year over year.
- EU rules are increasing platform transparency and VAT complexity. ViDA adds
  deemed-supplier measures for short-term accommodation and road passenger
  transport platforms from 2028, with possible national delay to 2030. This
  product is a cleaning marketplace, not an accommodation booking platform, but
  managed payments or invoicing would still create tax, accounting, KYC, refund,
  and support obligations.

Recommendation as an assumption to validate:

1. Keep job posting, applications, offers, assignments, messaging, reviews,
   favourites, and basic calendar coordination free until repeated completed
   job volume is proven by city.
2. Test "Host Pro" first for operational value: more property automation,
   calendar/import convenience, team visibility, saved cleaner workflows,
   cleaner reliability insights, and support priority.
3. Test "Agency Pro" next for member management, work allocation, team calendar,
   activity history, and profile credibility.
4. Consider paid operational add-ons only after usage proves specific workflow
   pain.
5. Defer managed payments, wallet/payouts, invoices, platform commission, and
   refund/dispute handling until completed-job volume, dispute rules, accounting
   review, and user demand justify the complexity.

## 2. Current Business and Product Constraints

Verified from repository docs and code:

- Market: Bulgaria, BG/EN, EUR, Europe/Sofia.
- Trust premise: approved accounts, verified cleaners, agency membership,
  two-way post-completion reviews, private issue reports, admin oversight.
- Core marketplace flow: property -> job/batch/import -> applications or direct
  offer -> one assignment -> completion -> double-blind reviews.
- Payments happen outside the platform in v1. Proposed and agreed EUR prices
  exist for coordination, not settlement.
- Agency delegation exists: accepted agency jobs can be assigned to active
  member cleaners; normal delegation is immutable after first member assignment.
- Public `/` is marketing/lead generation, not a dashboard.
- Cookie consent is consent-first. Optional analytics and marketing cookies
  require explicit opt-in.

Input limitation:

- `action_plan.docx` was requested but is not present in the workspace. `rg
  --files -g "*action*" -g "*.docx"` found no `.docx` files. This analysis uses
  `TGN.md`, `AGENT.md`, `BUSINESS.md`, `architecture.md`, `CURRENT_PROGRESS.md`,
  and targeted repo inspection.

## 3. User-Segment Willingness-To-Pay Analysis

Hosts, 1-3 properties:

- Likely willingness to pay: low until the product produces reliable cleaners
  in their city. They will pay for reliability or saved coordination time, not
  for access to an empty marketplace.
- Better paid boundary: convenience tools after several completed cleanings,
  not basic job posting.
- Pricing hypothesis: EUR 5-15/month per host, or EUR 3-8/property/month, only
  after repeated use.
- Reject if: hosts do not post repeat jobs or do not import/maintain calendars.

Hosts, 4-20 properties:

- Likely willingness to pay: moderate if the product protects turnovers,
  reduces manual messages, and gives backup cleaner coverage.
- Better paid boundary: multi-property calendar, saved cleaner pools, recurring
  job templates, cleaner reliability insights, priority support.
- Pricing hypothesis: EUR 15-60/month, possibly tiered by property count.
- Reject if: job completion remains sporadic or hosts still coordinate outside
  the app after the first introduction.

Individual cleaners:

- Likely willingness to pay: low for access, especially early. Charging cleaners
  before demand is visible risks supply loss.
- Better paid boundary: optional business tools, not applications.
- Pricing hypothesis: EUR 3-10/month for premium profile/tools, or free until a
  minimum completed-job threshold.
- Reject if: verified cleaner supply is thin or application response rates fall.

Agencies:

- Likely willingness to pay: higher than individuals if the product manages
  team assignment, calendars, accountability, and host-facing credibility.
- Better paid boundary: team operational tools and agency profile depth, not the
  right to receive jobs.
- Pricing hypothesis: EUR 19-99/month by member/property volume.
- Reject if: agency dashboard/member workflows are not actively used.

Advertisers/referral partners:

- Likely willingness to pay: low until traffic is meaningful and segmented.
- Better boundary: partner directory or contextual referrals, not intrusive ads
  inside assignment decisions.
- Reject if: ads reduce trust, cause cleaner ranking confusion, or require
  tracking beyond consent.

## 4. Competitor and Comparable-Product Analysis

Verified facts and examples:

- Turno positions itself directly around vacation-rental cleaning: hosts can
  automate scheduling and payments, and cleaners can bid for jobs and get paid
  automatically. Its pricing page states that finding, scheduling, and paying
  cleaners on the marketplace does not require a subscription. This supports
  keeping early marketplace access free.
- Taskrabbit charges clients service/trust fees on invoices, calculated as a
  percentage of hourly task price. This is a managed-transaction model, with
  support and trust obligations tied to money movement.
- Thumbtack charges pros for leads; its help content says prices vary by job
  value, pro availability, and market. This model monetizes supply-side demand
  access but can create dissatisfaction when paid leads do not convert.
- Booking.com Preferred Partner is a sponsored/boosted visibility analogue.
  Booking says eligible partners receive improved visibility; third-party and
  regulatory coverage show the trust risk when paid placement looks like quality
  ranking.
- Smoobu, Lodgify, Guesty, Hostaway, and Breezeway show that short-term rental
  operators do pay for software when it saves time across calendars, messaging,
  tasks, teams, and reporting. Public pricing references range from low
  single-digit per-listing entry products to higher monthly packages.
- Stripe Connect, Adyen, and Mangopay demonstrate that marketplace payments are
  mature but non-trivial: connected-account verification, funds routing,
  refunds, chargebacks, reporting, and payout operations become product surface.

Implication:

- The closest low-risk path is SaaS-like operational value for hosts/agencies.
  Lead fees, sponsored placement, and commissions are viable later but carry
  bigger liquidity, trust, and compliance risk.

## 5. Bulgarian and EU Market Considerations

Verified facts:

- Bulgaria joined the euro area on 2026-01-01. EUR pricing is appropriate, but
  price-change sensitivity remains relevant because dual-display and consumer
  protection monitoring were part of the transition period.
- Bulgaria's standard VAT rate is 20% according to the Bulgarian Ministry of
  Finance page summary. VAT registration thresholds and special cases should be
  checked by a Bulgarian accountant before launch of paid products.
- EU short-term rental transparency rules require registration numbers and data
  sharing where national systems require registration. This affects hosts'
  operating context even if Host Cleaners does not sell accommodation.
- ViDA changes increase platform VAT scrutiny. Although the deemed-supplier rule
  cited by the European Commission targets short-term accommodation rental and
  road passenger transport platforms, managed payments for cleaning services
  still require careful VAT, invoicing, KYC, AML, payment institution, and
  accounting review.
- GDPR/ePrivacy expectations make advertising and referral tracking consent
  sensitive. The current product already has cookie consent fields, which is
  useful for future analytics experiments.

Assumptions:

- Bulgarian short-term-rental operators will be cost-sensitive, especially small
  hosts.
- Reliability and verified supply are more valuable than "cheap cleaning" as a
  positioning angle.
- City-level liquidity matters more than national signup counts.

## 6. Monetization Model Comparison Matrix

Score definitions: 1 = low, 5 = high. For revenue potential and current product
fit, higher is better. For complexity, burden, growth risk, and trust risk,
higher means more difficult/risky.

| Model | Revenue potential | Validation speed | Technical complexity | Legal complexity | Support burden | Marketplace growth risk | Trust risk | Current product fit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Host subscription | 4 | 4 | 2 | 2 | 2 | 2 | 2 | 4 |
| Agency subscription | 3 | 3 | 2 | 2 | 3 | 2 | 2 | 3 |
| Cleaner premium tools | 2 | 3 | 2 | 2 | 2 | 4 | 3 | 2 |
| Usage-based operational add-ons | 3 | 3 | 3 | 2 | 3 | 2 | 2 | 3 |
| Lead/introduction fees | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 2 |
| Transaction commission | 5 | 1 | 5 | 5 | 5 | 4 | 4 | 1 |
| Sponsored placement | 3 | 3 | 3 | 3 | 3 | 3 | 5 | 2 |
| Advertising/referral partnerships | 2 | 4 | 2 | 3 | 2 | 2 | 4 | 2 |
| Hybrid model | 5 | 2 | 4 | 4 | 4 | 3 | 4 | 3 |

## 7. Model-by-Model Evaluation

### Host Subscription

- Paying customer: host or property manager.
- Chargeable value: saved coordination time, backup cleaner access, multi-property
  calendar operations, recurring job tools, priority support, reliability
  insights.
- Free boundary: signup, property creation, basic job posting, cleaner browsing,
  applications/offers, basic assignments, completion, reviews.
- Paid boundary: recurring/batch automation beyond a free limit, saved cleaner
  pools, advanced calendar automation, reliability dashboards, multi-property
  exports, priority support.
- Bulgaria/EU suitability: good if priced modestly; EUR billing and 20% VAT must
  be handled correctly.
- Comparable examples: Smoobu/Lodgify/Guesty charge for short-term-rental
  operational software; Turno keeps marketplace access free.
- Expected WTP: low for 1-property hosts; moderate for 4-20 property operators.
- Revenue potential: medium-high once repeat host usage exists.
- Liquidity impact: low if core actions stay free.
- Trust impact: positive if paid tools do not affect cleaner ranking.
- User-bypass risk: moderate; value must be workflow, not merely contact access.
- Technical complexity: low-medium; entitlements and billing are needed later.
- Legal/payment implications: SaaS billing, VAT invoices, subscription terms,
  cancellation/refund policy, GDPR for usage analytics.
- Fraud/refund/support risks: lower than commissions; disputes around feature
  value and billing cancellation.
- Required scale: several repeat hosts per launch city, with enough verified
  cleaners to make the subscription credible.
- Metrics before launch: repeat job posts, completed jobs per host/month,
  calendar imports, saved favourites, direct offers, failed-fill rate,
  host-retention cohort.
- Experiments: concierge "Host Pro" package manually sold to 5-10 active hosts;
  fake-door upgrade prompt after third job; interview price ladder.
- Reject if: hosts do not repeat jobs, do not use calendars, or ask only for
  more cleaners rather than tools.

### Agency Subscription

- Paying customer: agency account.
- Chargeable value: member management, delegation, team calendar, host-facing
  credibility, reporting, priority lead routing if transparent.
- Free boundary: agency signup, applying, receiving direct offers, first member
  management basics.
- Paid boundary: more members, team calendar views, assignment analytics, branded
  profile, SLA/response reporting, priority support.
- Bulgaria/EU suitability: good for professional agencies; weaker for informal
  teams.
- Comparable examples: team/operations tiers in property-management SaaS.
- Expected WTP: moderate if agencies receive real demand.
- Revenue potential: medium; fewer customers but higher ARPA than individual
  cleaners.
- Liquidity impact: low if applying remains free.
- Trust impact: positive if it improves accountability; negative if paid agency
  profiles outrank better individual cleaners.
- Bypass risk: high after agency-host introduction unless work allocation tools
  matter.
- Complexity: low-medium; agency dashboard is not built yet.
- Legal/payment: SaaS billing and invoices; no payout risk if no managed
  payments.
- Fraud/support: member identity and responsibility disputes.
- Required scale: agencies with active members and jobs in same cities.
- Metrics: agency applications, acceptance rate, member assignment rate,
  completed delegated jobs, revocation/issue rate.
- Experiments: sell manual agency operations reporting as a service before
  building entitlements.
- Reject if: agency assignment workflow stays rare or agencies prefer existing
  internal tools.

### Cleaner Premium Business Tools

- Paying customer: individual cleaner.
- Chargeable value: profile polish, business dashboard, response templates,
  calendar productivity, proof-of-work checklists, earnings summary.
- Free boundary: applying, receiving offers, calendar, reviews, profile basics.
- Paid boundary: advanced profile media, personal website/share page, saved
  templates, analytics, optional priority support.
- Bulgaria/EU suitability: risky early because cleaner supply is the scarce side
  in many local markets.
- Comparable examples: supply-side premium profiles on service marketplaces,
  but lead-fee backlash is common.
- Expected WTP: low until cleaners have measurable job volume from the platform.
- Revenue potential: low-medium.
- Liquidity impact: high risk if paywalls reduce applications.
- Trust impact: mixed; paid badges can confuse verification/reputation.
- Bypass risk: high once a cleaner has direct hosts.
- Complexity: low-medium.
- Legal/payment: SaaS billing, VAT invoices, consumer/business subscription
  terms.
- Fraud/support: ranking fairness and paid-profile complaints.
- Required scale: repeated cleaner earnings through the app.
- Metrics: cleaner activation, application win rate, repeat assignments,
  platform-attributed income, profile views to offers.
- Experiments: optional paid profile audit/service, not automatic paywall.
- Reject if: cleaner acquisition slows or paid status correlates poorly with job
  quality.

### Usage-Based Operational Add-Ons

- Paying customer: host, agency, sometimes cleaner.
- Chargeable value: extra SMS/email volume, ICS/feed monitoring, checklists,
  photo proof, bulk imports, reports, premium support.
- Free boundary: one-off job coordination and ordinary notifications.
- Paid boundary: high-volume automations or usage above free quotas.
- Bulgaria/EU suitability: good if tied to obvious costs or workload.
- Comparable examples: SaaS add-ons for messaging, automation, dynamic pricing,
  and guest/task operations.
- Expected WTP: medium for operators with repeated use.
- Revenue potential: medium.
- Liquidity impact: low if add-ons are optional.
- Trust impact: positive when add-ons improve reliability.
- Bypass risk: lower for workflow utilities than for access fees.
- Complexity: medium; metering and quotas required.
- Legal/payment: SaaS billing, VAT, clear fair-use terms; SMS costs require
  vendor terms.
- Fraud/support: bill shock, quota confusion, delivery failures.
- Required scale: usage distribution showing heavy users.
- Metrics: notification volume, calendar imports, jobs per property, support
  requests, checklist/photo-proof demand.
- Experiments: manual invoice for "monthly operations pack" for heavy users.
- Reject if: usage is low or costs are too small to justify charging.

### Lead or Introduction Fees

- Paying customer: usually cleaner/agency, possibly host for direct intros.
- Chargeable value: access to a qualified host/job lead or accepted
  introduction.
- Free boundary: browsing and applying could stay free; fee charged only after
  accepted intro is safer than pay-per-lead.
- Bulgaria/EU suitability: risky in a trust-constrained early marketplace.
- Comparable examples: Thumbtack lead fees; service marketplaces that charge for
  introductions.
- Expected WTP: low-medium, higher for agencies.
- Revenue potential: medium.
- Liquidity impact: negative if supply must pay before close.
- Trust impact: risky; users dislike paying for non-converting leads.
- Bypass risk: very high because the value is contact.
- Complexity: medium; attribution and anti-circumvention rules needed.
- Legal/payment: invoices for leads, refund policy for bad/fake leads, GDPR for
  contact-sharing and attribution.
- Fraud/support: fake leads, duplicate leads, low-quality hosts, refund claims.
- Required scale: enough lead flow to make pricing predictable.
- Metrics: lead-to-application, application-to-assignment, assignment-to-complete,
  repeat host-cleaner pairs.
- Experiments: charge only agencies for manually qualified host introductions.
- Reject if: conversion variance is high or refund/support burden dominates.

### Transaction Commission

- Paying customer: host, cleaner, agency, or split.
- Chargeable value: payment convenience, escrow-like confidence, records,
  refunds/disputes, invoicing, tax documents.
- Free boundary: none if commission requires managed payments; core marketplace
  should remain free until this is justified.
- Bulgaria/EU suitability: possible later, but not MVP-friendly.
- Comparable examples: Airbnb/Taskrabbit service fees; Stripe Connect for money
  movement between parties.
- Expected WTP: medium only if payments solve real pain.
- Revenue potential: high at scale.
- Liquidity impact: high risk; users can bypass if they already pay offline.
- Trust impact: can improve trust if dispute/payment protections are real; can
  damage trust if perceived as rent extraction.
- Complexity: very high.
- Legal/payment: VAT, invoices, platform fee tax treatment, KYC, AML, connected
  account verification, chargebacks, refunds, payment-service terms, accounting.
- Fraud/support: highest; disputes, no-shows, partial service, card fraud,
  payout failures.
- Required scale: stable completed-job volume and support process.
- Metrics: completed jobs, agreed price accuracy, dispute/private issue rate,
  cancellation/no-show rate, repeat pairs, payment-method demand.
- Experiments: interview-only; do not fake managed payment if not ready.
- Reject if: users prefer cash/bank transfer, disputes are frequent, or platform
  cannot add protection worth the fee.

### Sponsored Placement

- Paying customer: cleaners/agencies, maybe host-facing partners.
- Chargeable value: increased visibility.
- Free boundary: organic ranking by relevance, verification, availability,
  reviews, response reliability.
- Paid boundary: clearly labelled sponsored slots separated from organic quality
  ranking.
- Bulgaria/EU suitability: risky because trust and verification are central.
- Comparable examples: Booking Preferred visibility; marketplace sponsored
  listings.
- Expected WTP: medium for agencies once host traffic exists.
- Revenue potential: medium.
- Liquidity impact: mixed; may help supply monetize but can harm host selection.
- Trust impact: high risk if paid placement looks like quality.
- Bypass risk: medium.
- Complexity: medium; ranking, disclosure, impression/click metrics.
- Legal/payment: advertising disclosure, consumer protection, GDPR/consent for
  tracking.
- Fraud/support: click fraud, ranking complaints, unfairness claims.
- Required scale: enough searches/profile views to sell impressions.
- Metrics: profile impressions, clicks, conversion, organic vs sponsored quality,
  complaints.
- Experiments: labelled "featured agency" in newsletter or static directory,
  not core cleaner ranking.
- Reject if: sponsored profiles have worse completion/review outcomes.

### Advertising and Referral Partnerships

- Paying customer: third-party vendors: supplies, insurance, accounting,
  property maintenance, PMS/channel managers.
- Chargeable value: qualified host/cleaner audience and contextual referrals.
- Free boundary: core workflows stay ad-free.
- Paid boundary: partner resources page, optional offers, contextual but
  non-blocking referrals.
- Bulgaria/EU suitability: suitable later with consent-aware tracking.
- Comparable examples: Google Ads CPC model; SaaS affiliate/referral programs.
- Expected WTP: low until traffic is meaningful.
- Revenue potential: low-medium.
- Liquidity impact: low if non-intrusive.
- Trust impact: medium-high risk if ads crowd operational decisions.
- Bypass risk: not relevant to marketplace matching.
- Complexity: low-medium.
- Legal/payment: ad disclosures, affiliate terms, VAT invoices, cookie consent,
  GDPR for tracking.
- Fraud/support: partner quality complaints, attribution disputes.
- Required scale: meaningful traffic, segmented audience, consented analytics.
- Metrics: page views, consent opt-in, partner clicks, conversions, complaints.
- Experiments: manually curated partner page, no tracking pixels initially.
- Reject if: ad revenue is trivial or users report reduced trust.

### Hybrid Models

- Paying customer: hosts/agencies first; later add-ons and commission.
- Chargeable value: operational tools now, transaction convenience later.
- Free boundary: matching, applying, assignment, completion, reviews.
- Paid boundary: Pro tools, add-ons, and eventually optional managed payments.
- Bulgaria/EU suitability: strongest if phased and transparent.
- Comparable examples: SaaS subscription plus optional transaction/booking fees.
- Expected WTP: highest across mature segments, but only after proof.
- Revenue potential: high at scale.
- Liquidity impact: manageable if phased.
- Trust impact: depends on ranking and fee transparency.
- Complexity: high if too much is built at once.
- Legal/payment: grows from SaaS billing to payment-platform compliance.
- Fraud/support: grows with managed payments.
- Required scale: city-level liquidity and repeat usage.
- Metrics: all marketplace funnel and paid-feature activation metrics.
- Experiments: start with manual Pro packages and fake-door add-ons.
- Reject if: hybrid complexity distracts from liquidity.

## 8. Free Versus Paid Feature Boundary Options

Keep free during validation:

- Signup, email confirmation, approval queue, cleaner verification workflow.
- Public cleaner directory and open-job discovery.
- Property creation for at least a small free tier.
- Basic job posting, applications, offers, assignment, completion, reviews.
- Basic favourites, connections, messaging, and notifications.
- Agency applying and first member delegation.

Candidate paid boundaries:

- Host Pro: more properties above free tier, recurring templates, saved cleaner
  pools, advanced calendar automation, reliability reports, bulk operations,
  priority support.
- Agency Pro: more active members, team calendar, work allocation views,
  branded agency profile, response/completion analytics, priority support.
- Cleaner Pro: profile/share page, templates, proof-of-work exports, personal
  business analytics. Avoid paid application priority.
- Add-ons: SMS packs, advanced reports, photo-proof/checklist storage, high
  volume ICS/feed monitoring.

Avoid paid boundaries for now:

- Charging to apply.
- Charging to receive basic offers.
- Paywalling reviews or trust information.
- Paid ranking that is not clearly labelled.
- Any managed payment/commission layer before readiness gates pass.

## 9. Suggested Pricing Hypotheses

These are not validated prices.

- Host Pro Solo: EUR 5-15/month for low-volume hosts after they complete
  repeated jobs.
- Host Pro Portfolio: EUR 15-60/month, possibly including 5-20 properties or
  priced by property count.
- Agency Pro Small: EUR 19-49/month for small teams.
- Agency Pro Growth: EUR 49-99/month for more members/reporting/support.
- Cleaner Pro: EUR 3-10/month, only after cleaners earn repeat work through the
  platform.
- Usage add-ons: EUR 3-20/month packs, or low per-use charges tied to visible
  vendor costs.
- Lead/introduction: EUR 5-30 only for qualified/accepted introductions, not
  raw leads, and only as an experiment.
- Sponsored placement: EUR 20-100/month for clearly labelled placements only
  after meaningful host traffic.
- Transaction commission: no percentage hypothesis until payment/dispute/accounting
  review is complete.

## 10. Customer Interview Questions

Hosts:

- How many turnovers do you coordinate per month by city/property?
- What happens today when your usual cleaner is unavailable?
- Which part is most painful: finding cleaners, confirming availability,
  communicating details, quality proof, calendar sync, or payment?
- What would make you trust a new cleaner enough to assign a same-day turnover?
- Would you pay monthly for operational tools if cleaner access remains free?
- Which price feels cheap, acceptable, expensive, and impossible?
- What would make you avoid paying and go back to WhatsApp/direct calls?

Cleaners:

- How do you currently find recurring host work?
- What information do you need before applying?
- Would you pay for tools only after earning through the platform?
- What would feel unfair in rankings or fees?
- How do you prefer to handle payment, invoices, cancellations, and disputes?

Agencies:

- How many cleaners and jobs do you coordinate weekly?
- How do you assign work today?
- What reports do hosts ask for?
- Would member calendars, accountability, or proof-of-work justify a monthly
  subscription?
- What must stay under your control outside the platform?

Partners:

- Which audience do you want: hosts, cleaners, or agencies?
- What conversion action matters: click, lead, trial, purchase?
- What compliance or brand-safety constraints do you require?

## 11. Validation Experiments

Low-build experiments:

- Interview 15 hosts, 10 cleaners, and 5 agencies with price-ladder questions.
- Concierge Host Pro: manually provide monthly cleaning coordination report to
  active hosts and test payment intent.
- Concierge Agency Pro: manually provide agency member/job report.
- Fake-door Pro CTA after repeat usage, with clear "not available yet" and
  interview invite.
- Partner resource page without tracking pixels; measure consented clicks only.
- Manual lead-introduction experiment with agencies only; charge only if both
  parties confirm a qualified intro.

Do not run yet:

- Fake managed payments.
- Commission tests that imply escrow, refunds, or payout protection.
- Sponsored ranking in core cleaner search.

## 12. Required Analytics and Marketplace Metrics

Already calculable from current data:

- Users by role/account status.
- Approved hosts, verified cleaners, agencies, active agency members.
- Properties by city/host.
- Calendar connections and reservations.
- Jobs by status/city/property/source/created date.
- Proposed and agreed prices.
- Applications by status/origin; applications per job.
- Assignment rate and one-assignment completion status.
- Completed jobs and completed_at timestamps.
- Repeat host usage and repeat host-cleaner pairs.
- Reviews, review completion rate, average ratings, private issue count.
- Notifications by type/read state.
- Favourites, connections, and messages.
- Audit events for signup, application, assignment, completion, review, ICS
  import.

Missing for monetization experiments:

- Page/session analytics tied to consent choices.
- Acquisition source and campaign attribution.
- Search impression, profile impression, click, and contact-intent events.
- Pro-feature fake-door impressions and conversion.
- Host portfolio segmentation fields beyond property count.
- Entitlement/billing account concept.
- Paid plan status, trial status, cancellation reason.
- Support tickets and dispute outcomes.
- Payment method demand and off-platform payment confirmation.
- Sponsored placement impressions/clicks/conversions.
- Lead quality confirmation and refund reason.

## 13. Monetization Readiness Gates

Host Pro gate:

- At least one city with repeat host job posting and reliable cleaner supply.
- Evidence that hosts use calendar/import/favourites/offers repeatedly.
- Interviewed hosts can name a paid workflow problem.

Agency Pro gate:

- Agency dashboard/member workflows exist and are used.
- Agencies have repeated delegated completed jobs.
- Agencies ask for reporting or member coordination.

Cleaner Pro gate:

- Cleaners receive repeated paid work from the platform.
- Cleaner supply is not the bottleneck.

Add-on gate:

- Heavy users exceed clear operational thresholds.
- Add-on maps to measurable vendor cost or time saved.

Lead fee gate:

- Lead-to-completed-job conversion is stable.
- Refund criteria are simple and fair.

Sponsored placement gate:

- There is enough search/profile traffic.
- Paid visibility can be separated from verified quality ranking.

Managed payments/commission gate:

- Stable completed-job volume.
- Agreed prices match actual settlement well enough.
- Dispute/cancellation/refund rules are documented.
- Accounting and VAT review is complete.
- Payment provider KYC, payout, chargeback, and support responsibilities are
  accepted.
- Users have a strong reason to pay in-platform.

## 14. Legal, Tax, Payment and Operational Risks

Research framing:

- Treat all legal/tax points as topics for professional review, not conclusions.

SaaS subscriptions:

- VAT treatment and invoicing for Bulgarian/EU customers.
- B2B vs B2C terms, cancellation, refunds, consumer rights.
- Card processor fees, failed payment handling, chargebacks.
- Data minimization for usage analytics and entitlements.

Lead fees:

- Refund rules for invalid, duplicate, or non-responsive leads.
- GDPR basis for sharing contact/lead data.
- Consumer protection risk if lead quality is overstated.

Sponsored placement/ads:

- Clear advertising disclosure.
- Consent for tracking and retargeting.
- Ranking transparency to avoid confusing paid placement with quality.

Managed payments/commission:

- KYC/KYB for cleaners/agencies.
- Chargebacks, refunds, partial service disputes, no-shows.
- VAT and invoicing role: platform service fee, cleaner service, possible
  principal/agent questions.
- Payment institution/marketplace processor obligations depending on provider
  model.
- Audit, reconciliation, payout failures, accounting exports.

GDPR:

- Use consented analytics for optional tracking.
- Avoid sensitive personal data in monetization events.
- Keep public profiles, reviews, and sponsored displays privacy-safe.

## 15. Repository Capability and Data-Gap Analysis

Existing monetization-relevant data:

- `User`: role, account status, approved/email/phone timestamps, language,
  dashboard preferences.
- `HostProfile`, `CleanerProfile`, `AgencyProfile`: city, service areas,
  cleaner verification, ratings, completed job counts, agency membership.
- `Property`: host, city, coordinates, default duration, default EUR price,
  property metadata.
- `ExternalCalendarConnection`, `Reservation`: calendar/import readiness.
- `CleaningJob`: status, schedule, proposed/agreed EUR prices, property, host.
- `CleanerApplication`: origin, status, proposed price, message.
- `Assignment`: cleaner, assigned agency member, agreed price, completion
  timestamps.
- `Review`: ratings, public/private issue separation.
- `Notification`: notification type, metadata, read state.
- `FavouriteCleaner`, `Connection`, `Message`: relationship and engagement.
- `CookieConsent`: essential/analytics/marketing consent.
- `AuditLog`: business events and metadata.

Metrics calculable now:

- Marketplace funnel: posted -> open -> application/offer -> assigned ->
  completed -> reviewed.
- Supply/demand by city.
- Repeat usage by host, cleaner, agency.
- Operational usage: calendar connections, ICS imports, notifications,
  favourites, connections.
- Revenue proxy: agreed price on completed assignments, but not actual paid
  amount.

Missing events/fields for experiments:

- Entitlements and plan state.
- Billing customer identifiers and invoice records.
- Consent-aware analytics events.
- Feature usage events for Pro tools.
- Profile/search impressions and clicks.
- Contact reveal/intro confirmation.
- Sponsored placement impression/click attribution.
- Support/dispute/refund outcomes.

Where future entitlements would logically belong:

- High-level architecture option: identity/accounts should own account-level
  plan state and role-specific entitlement checks; marketplace/views/services
  should consult those checks only at workflow boundaries. Billing should remain
  a separate future domain or module rather than being embedded into marketplace
  state transitions.

Domains affected by managed payments/commissions:

- Marketplace: jobs, applications, assignments, completion, cancellation,
  dispute states.
- Accounts: KYC/KYB, legal names, addresses, tax identifiers, payout recipient
  identity.
- Notifications: payment, refund, dispute, invoice events.
- Feedback: review timing may need payment/dispute coupling.
- Admin/core: audit, moderation, support, accounting exports.
- Properties/calendar: no direct payment ownership but scheduling drives
  payment timing.

Workflows that must remain free during validation:

- Browse verified cleaners and open jobs.
- Post basic jobs and apply.
- Direct offers and assignment.
- Basic completion and reviews.
- Basic favourites/connections/messages.

Docs to update after a business decision:

- `BUSINESS.md`: monetization decision, target segments, pricing hypothesis.
- `TGN.md`: new billing entities/events/invariants.
- `architecture.md`: billing/entitlement/payment boundaries.
- `DEV.md`: env/provider setup and verification commands.
- `DEPLOY.md`: payment provider secrets/webhook deployment if implemented.
- Privacy/cookie policy docs: analytics, ads, referral tracking.

## 16. Recommended Monetization Sequence

This is a starting hypothesis, not proven.

1. Validation phase: keep the marketplace free. Measure liquidity and repeated
   operational usage by city.
2. Manual Pro phase: sell concierge Host Pro and Agency Pro to active users
   without building billing.
3. Productized Pro phase: build subscriptions only for the features users
   repeatedly requested and manually paid for.
4. Add-on phase: add usage-based operational add-ons after heavy usage appears.
5. Partner phase: add consent-safe referral partnerships only outside critical
   matching decisions.
6. Payments research phase: interview users and accountants about managed
   payments, invoice expectations, disputes, and platform responsibilities.
7. Managed payments/commission phase: only after readiness gates pass.

## 17. Explicit Do Not Build Yet List

- Stripe/Adyen/Mangopay integration.
- Subscriptions, invoices, wallets, payouts, platform balance, stored cards.
- Transaction commission or payment escrow.
- Cleaner application paywalls.
- Sponsored ranking inside organic cleaner search.
- Automated lead charging.
- Refund/dispute/payment workflows.
- Tax calculation or VAT filing automation.
- Advertising tracking pixels before consent and partner governance.
- Any model/migration/API changes until a business decision is made.

## 18. Open Business Decisions

- Which side is most supply-constrained city by city?
- What is the first paid segment: host portfolio, agency, or heavy operational
  add-on users?
- What exact Host Pro promise can be proven manually?
- Should Agency Pro include member limits, reporting, branded profile, or
  priority support?
- Should individual cleaners ever pay, or should monetization avoid the supply
  side?
- What counts as a qualified introduction?
- Would sponsored visibility be acceptable if separated from organic ranking?
- What proof would justify managed payments?
- Who is responsible for refunds if a cleaner completes poor-quality work?
- What accounting documents do hosts, cleaners, and agencies need in Bulgaria?

## 19. Sources

- European Commission, "Bulgaria and the euro",
  https://economy-finance.ec.europa.eu/euro/eu-countries-and-euro/bulgaria-and-euro_en.
- Bulgarian Ministry of Finance, "Value Added Tax",
  https://www.minfin.bg/en/790. The page was accessible in search results but
  returned 403 to direct fetch during this research pass.
- European Commission, "VAT in the Digital Age (ViDA)",
  https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en.
- Eurostat, "Short-stay accommodation offered via online collaborative economy
  platforms",
  https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Short-stay_accommodation_offered_via_online_collaborative_economy_platforms.
- Eurostat, "Tourism bookings via platforms grew in summer of 2025",
  https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260108-1.
- European Parliament, "Short-term rentals: EU rules for more transparency",
  https://www.europarl.europa.eu/topics/en/article/20231127STO15403/short-term-rentals-eu-rules-for-more-transparency.
- European Commission, "Cookies policy",
  https://commission.europa.eu/cookies-policy_en.
- Turno, "Pricing",
  https://turno.com/pricing/.
- Turno, cleaner marketplace page,
  https://turno.com/for-cleaner/.
- Taskrabbit Support, "What's the Taskrabbit Service Fee?",
  https://support.taskrabbit.com/hc/en-us/articles/46260411872155-What-s-the-Taskrabbit-Service-Fee.
- Taskrabbit Support, "What's the Taskrabbit Trust & Support Fee?",
  https://support.taskrabbit.com/hc/en-us/articles/46260504648731-What-s-the-Taskrabbit-Trust-Support-Fee.
- Thumbtack Help, "How much do I pay for leads and opportunities?",
  https://help.thumbtack.com/article/pay-for-leads.
- Booking.com Partner Hub, "Preferred Partner Program",
  https://partner.booking.com/en-us/help/growing-your-business/increase-revenue/all-you-need-know-about-preferred-partner-program.
- Booking.com Partner Hub, "Preferred Partner Program" solution page,
  https://partner.booking.com/en-us/solutions/preferred-partner-program.
- Lodgify pricing,
  https://www.lodgify.com/pricing/.
- Smoobu pricing,
  https://www.smoobu.com/en/pricing/.
- Guesty pricing,
  https://www.guesty.com/pricing/.
- Hostaway, "How Much is Property Management Software?",
  https://www.hostaway.com/blog/property-management-software-cost/.
- Breezeway product page,
  https://www.breezeway.io/.
- Stripe pricing,
  https://stripe.com/pricing.
- Stripe Connect pricing,
  https://stripe.com/connect/pricing.
- Stripe Docs, "Platforms and marketplaces with Stripe Connect",
  https://docs.stripe.com/connect.
- Stripe Docs, "Required verification information",
  https://docs.stripe.com/connect/required-verification-information.
- Google Ads Help, "Average cost-per-click (Avg. CPC): Definition",
  https://support.google.com/google-ads/answer/14074.
