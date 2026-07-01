# Host Cleaners Monetization Implementation Roadmap

Access date for external sources: 2026-07-01.

This is a planning roadmap, not an implementation record, pricing approval,
legal opinion, tax opinion, accounting opinion, or payment-provider decision.
It does not implement billing, subscriptions, commissions, invoices, wallets,
payouts, paywalls, sponsored ranking, or payment processing.

Evidence labels used throughout:

- **Verified fact**: confirmed from repository docs/code or cited external
  sources.
- **Internal planning input**: stated in `docs/monetization/action_plan.docx`;
  useful for planning but not automatically authoritative.
- **Estimate**: numeric or qualitative planning estimate that requires
  validation.
- **Assumption**: operating premise used to make the roadmap concrete.
- **Hypothesis**: testable belief that should be validated before build.
- **Recommendation**: current suggested direction based on available evidence.
- **Final business decision**: intentionally empty in this document unless a
  later owner-approved decision is recorded elsewhere.
- **Requires legal/accounting review**: topic that must be reviewed by qualified
  Bulgarian/EU professionals before implementation.

## 1. Executive summary

**Verified fact:** The Host Cleaners marketplace currently has no in-app
payments. It connects Bulgarian short-term-rental hosts with verified cleaners
and agencies, supports properties, cleaning jobs, applications, direct offers,
assignments, completion, reviews, calendars, favourites, connections, messaging,
notifications, agency delegation, and audit logs. Proposed and agreed EUR prices
exist for coordination, not settlement.

**Recommendation as a hypothesis to validate:** keep the core marketplace free
while validating liquidity and trust, then test Host Pro and Agency Pro
operational subscriptions before attempting usage fees, lead fees, sponsored
placement, managed payments, or transaction commission.

The immediate roadmap is:

1. Run business validation first: constraints, segments, willingness to pay,
   market research, competitor research, pricing/package experiments, manual
   pilots, and unit economics.
2. Select or reject the first monetization model through an explicit business
   gate.
3. Only after approval, plan and build a model-agnostic technical foundation for
   entitlements, analytics, auditability, admin controls, feature flags, and
   rollout.
4. Implement one approved model at a time.
5. Treat managed payments and transaction commission as a late optional phase
   requiring strong completed-job volume, dispute policy, accounting review,
   payment-provider review, and a strong reason for users to transact through
   the platform.

The roadmap intentionally protects marketplace liquidity. Basic job posting,
applications, offers, assignments, completion, messaging, reviews, verification,
ratings, trust/safety, and basic calendars should remain free during validation.

## 2. Current product and business constraints

**Verified facts from repository documentation and targeted code inspection:**

- Market: Bulgaria, BG/EN, EUR, `Europe/Sofia`.
- Core product: matching and coordination for hosts, cleaners, and agencies.
- Current product invariant: no in-app payment processing in v1.
- Trust model: approved users, verified cleaners, agency membership, admin
  oversight, two-way post-completion reviews, double-blind review reveal, private
  issue reports, and audit logs.
- Marketplace invariant: a cleaning job can have only one accepted assignment.
- Agency invariant: accepted agency work can be delegated to an active member
  cleaner; normal delegation is immutable after the first member assignment.
- Payment state: `CleaningJob` and `Assignment` store proposed/agreed EUR prices,
  but actual payment happens outside the platform.
- Existing public aggregate stats: the marketplace has an `area-stats` endpoint
  for privacy-safe supply/demand counts.
- Consent model: cookie consent records distinguish essential, analytics, and
  marketing consent.

**Verified external context:**

- Bulgaria joined the euro area on 2026-01-01. The official euro conversion
  rate is EUR 1 = BGN 1.95583, according to the ECB and Bulgaria's official euro
  adoption site.
- Eurostat reports large and growing EU short-stay accommodation activity on
  major online platforms. This supports the broader operating context for
  turnover-cleaning demand, but it is not a direct Bulgarian cleaning-market
  size estimate.
- The European Commission's VAT in the Digital Age package introduces platform
  economy and digital reporting changes over 2025-2035. Cleaning marketplaces
  are not identical to short-term accommodation booking platforms, but managed
  payments, invoicing, and commission would increase VAT/accounting complexity.

**Internal planning input from `action_plan.docx`:**

- Brand and mobile sections are background context only.
- Legal/company/payment sections are internal assumptions requiring
  professional review.
- Phase 1 cost and financial forecast figures are unvalidated planning
  estimates, not approved budgets or forecasts.
- Host Pro, Stripe Connect, commission, and break-even assumptions are
  hypotheses that must pass the roadmap gates before implementation.

## 3. Monetization principles

1. **Business validation before billing implementation.** Do not build billing
   infrastructure until a model is selected through evidence.
2. **Protect marketplace liquidity.** Do not restrict core access before supply
   and demand are proven city by city.
3. **Keep trust independent from payment.** Verification, reviews, ratings,
   safety reporting, dispute visibility, and basic reputation must not become
   paid advantages.
4. **Avoid early cleaner access fees.** Charging cleaners for basic access risks
   supply loss while liquidity is still thin.
5. **Monetize operational value, not empty access.** Hosts and agencies are more
   likely to pay for saved coordination time, calendar automation, team
   management, reliability reporting, and support.
6. **Separate paid placement from trust ranking.** Sponsored content must be
   clearly marked and must not distort safety, verification, or review signals.
7. **Use consent-aware analytics.** Optional analytics and marketing tracking
   must respect the existing consent model.
8. **Keep payment complexity gated.** Managed payments, payouts, refunds,
   chargebacks, invoices, KYC/KYB, and commission require separate legal,
   accounting, support, and provider review.
9. **Prefer reversible launches.** Use feature flags, limited cohorts, manual
   pilots, and clear rollback plans.
10. **Document decisions.** When a model is approved, update `BUSINESS.md`,
    `TGN.md`, `architecture.md`, operating docs, privacy/cookie docs, and an ADR
    if the decision changes architecture.

## 4. Recommended decision sequence

This sequence is a hypothesis, not a final decision:

1. Keep the core marketplace free during validation.
2. Validate Host Pro and Agency Pro subscriptions for operational tools first.
3. Consider paid operational add-ons after repeated usage is demonstrated.
4. Avoid charging cleaners for basic access during early supply growth.
5. Test advertising/referral partnerships only if they are consent-safe and do
   not degrade trust.
6. Consider lead/introduction fees only after a qualified-introduction policy,
   anti-bypass risk analysis, and refund/support process exist.
7. Introduce managed payments and transaction commission only after stable
   completed-job volume, dispute rules, accounting review, payment-provider
   review, and strong reasons for users to transact through the platform.

Phase table:

| Phase | Track | Objective | Deliverable | Prerequisites | Code changes | Decision gate |
|---|---|---|---|---|---|---|
| M0 - Constraints and assumptions | A | Lock monetization principles, non-goals, and evidence labels | Monetization brief | Existing docs + research | No | Owner accepts constraints |
| M1 - Market/customer/competitor research | A | Validate Bulgarian/EU context and comparables | Research pack | M0 | No | Target segments are evidence-backed |
| M2 - WTP and product value validation | A | Identify paid problems by segment | Interview/WTP synthesis | M1 | No | Repeated paid pain exists |
| M3 - Pricing/package experiments | A | Test free/paid boundaries without billing | Experiment plan/results | M2 | Only if separately approved | One model shows credible demand |
| M4 - Paid pilot and unit economics | A | Manually validate payment intent and margin | Pilot and forecast report | M3 | No billing implementation | Pilot economics pass |
| M5 - Model approval | A | Select, reject, or continue research | Decision memo/ADR proposal | M4 | No | First model approved |
| M6 - Technical foundation | B | Plan/build model-agnostic entitlement and analytics foundation | Technical foundation plan | M5 | Conditional | Scope approved |
| M7 - First monetization build | B | Implement approved model | Product release | M6 | Yes | Legal/accounting/support gates pass |
| M8 - Controlled rollout | B | Launch to limited cohort | Rollout report | M7 | Yes | Expand, iterate, or rollback |
| M9 - Optimization | B | Improve packaging, retention, support | Optimization backlog | M8 | Conditional | Unit economics remain healthy |
| M10 - Managed payments/commission | B | Optional late payments path | Separate feasibility/implementation plan | Stable volume + review | Yes, only if approved | Strong reason to transact on-platform |

## 5. Track A - Business planning, market research, and validation

Track A must finish the business decision before Track B builds billing,
subscriptions, entitlements, commissions, ads, or payment workflows.

### Phase M0 - Monetization constraints and assumptions

- **Objective:** lock monetization principles, non-goals, evidence labels, and
  owner priorities.
- **Main questions:** Which objective matters most first: liquidity, trust,
  revenue, operational simplicity, or investor narrative? Which workflows must
  stay free? What legal/accounting review is mandatory before money moves?
- **Inputs required:** `BUSINESS.md`, `TGN.md`, `architecture.md`,
  `CURRENT_PROGRESS.md`, `MONETIZATION_RESEARCH.md`, `action_plan.docx`, current
  traction, city focus, business-owner priorities.
- **Research activities:** reconcile repo invariants with `action_plan.docx`;
  classify facts, estimates, assumptions, hypotheses, recommendations, and legal
  review items.
- **Experiments:** none.
- **Deliverables:** monetization constraints brief, assumption register,
  do-not-build list, decision labels.
- **Success criteria:** owner accepts the evidence standard and confirms that
  core marketplace/trust workflows remain free during validation.
- **Failure or stop criteria:** owner wants billing implementation before
  segment pain, legal/accounting review, or marketplace liquidity is validated.
- **Dependencies:** current docs and business-owner input.
- **Risks:** copying unreviewed legal/payment assumptions from `action_plan.docx`
  as if they were approved decisions.
- **Estimated effort:** 2-3 days.
- **Code changes required:** no.
- **Decision gate:** written acceptance of constraints and non-goals.

### Phase M1 - Market, customer, and competitor research

- **Objective:** validate Bulgarian and EU market context, user segments, and
  comparable monetization models.
- **Main questions:** Which Bulgarian cities have enough STR density and cleaner
  supply to support a marketplace? Which segments already pay for operational
  software or coordination? What do comparable cleaning, home-services,
  vacation-rental SaaS, and marketplace platforms charge for?
- **Inputs required:** target cities, existing user/lead data, competitor list,
  external sources, Bulgarian institutional sources, EU sources, payment-provider
  docs.
- **Research activities:** direct and adjacent competitor research; Bulgarian STR
  and tourism context; EU platform/VAT context; payment-provider capability
  review; pricing-page research; contrarian evidence on low willingness to pay.
- **Experiments:** none yet; research only.
- **Deliverables:** research pack, competitor tiering, comparable-product
  pricing summary, market caveats.
- **Success criteria:** target segments and first-city assumptions are backed by
  evidence and explicitly labelled.
- **Failure or stop criteria:** evidence is too weak to identify a target segment
  or city cluster.
- **Dependencies:** M0, source access, current public data.
- **Risks:** overgeneralizing EU STR activity into Bulgarian cleaning demand.
- **Estimated effort:** 1-2 weeks.
- **Code changes required:** no.
- **Decision gate:** target segments are evidence-backed enough for interviews.

### Phase M2 - Product value and willingness-to-pay validation

- **Objective:** identify which host, cleaner, and agency problems are painful
  enough to justify payment.
- **Main questions:** What repeated operational pain exists today? Who has a
  budget? What would users pay for manually before software exists? Which value
  is strongest: reliability, calendar automation, cleaner backups, team
  reporting, profile credibility, or support?
- **Inputs required:** interview list, active hosts, verified cleaners,
  agencies, support/dispute notes, usage metrics, city-level funnels.
- **Research activities:** interviews, problem ranking, budget mapping, switching
  cost analysis, willingness-to-pay probes, value metric testing.
- **Experiments:** concierge offer scripts; no-code Pro promise tests; manual
  reporting samples; "would you pay" plus "will you pre-commit" tests.
- **Deliverables:** segment WTP report, problem/value matrix, objection log,
  evidence-backed reject list.
- **Success criteria:** at least one segment shows repeated pain and credible
  payment intent for a non-core operational feature.
- **Failure or stop criteria:** users value only liquidity/basic access, or paid
  boundaries reduce supply/demand participation.
- **Dependencies:** M1 and a reachable user sample.
- **Risks:** survey-positive but payment-negative responses; users saying yes to
  hypothetical pricing.
- **Estimated effort:** 2-3 weeks.
- **Code changes required:** no.
- **Decision gate:** repeated paid pain exists.

### Phase M3 - Pricing, packaging, and business-model experiments

- **Objective:** test monetization-model, free-versus-paid boundary, and pricing
  hypotheses without building billing.
- **Main questions:** Which model converts best without damaging trust or
  liquidity? Which feature boundary feels fair? Which pricing range produces
  conversations or commitments?
- **Inputs required:** M2 WTP findings, landing-page copy, interview scripts,
  cohort definitions, metrics plan, consent rules.
- **Research activities:** pricing-page review, packaging tests, offer
  positioning, counterfactual analysis, rejection criteria per model.
- **Experiments:** fake-door pricing-page or landing-page tests only if
  separately approved; waitlists; manual invoices outside the app if legally
  approved; concierge Host Pro and Agency Pro pilots.
- **Deliverables:** experiment designs, results, conversion metrics, model
  comparison update, pricing/package hypotheses.
- **Success criteria:** one or two models produce credible demand signals and do
  not reduce marketplace activity.
- **Failure or stop criteria:** no model produces qualified interest, or paid
  boundaries harm supply, demand, trust, or review behavior.
- **Dependencies:** M2 and consent-aware measurement.
- **Risks:** testing paid messages before the marketplace is useful enough.
- **Estimated effort:** 2-4 weeks.
- **Code changes required:** only if separately approved for experiment pages or
  analytics; no billing implementation.
- **Decision gate:** one model shows credible demand.

### Phase M4 - Paid pilot and unit economics

- **Objective:** validate payment intent and contribution margin manually before
  subscription or billing infrastructure is built.
- **Main questions:** Will users pay repeatedly? What support load does the paid
  promise create? Does revenue cover acquisition, verification, support,
  infrastructure, and operations? Does paid access damage liquidity or trust?
- **Inputs required:** pilot cohort, legal/accounting review for manual charging,
  cost assumptions, support process, tracking spreadsheet, clear refund policy.
- **Research activities:** manual paid pilot, cost tracking, support-time
  tracking, churn/retention review, liquidity impact review.
- **Experiments:** concierge Host Pro, Agency Pro reporting/support package,
  operational add-on package; no managed payments or commission.
- **Deliverables:** paid pilot report, unit economics model, CAC/payback view,
  support burden report, go/no-go recommendation.
- **Success criteria:** repeat payment intent, acceptable support burden,
  positive contribution margin path, no trust/liquidity damage.
- **Failure or stop criteria:** users do not renew, support costs exceed revenue,
  marketplace behavior worsens, or legal/accounting review blocks the model.
- **Dependencies:** M3, business owner approval, legal/accounting input.
- **Risks:** manual pilots are too operator-dependent to productize.
- **Estimated effort:** 4-8 weeks.
- **Code changes required:** no billing implementation.
- **Decision gate:** pilot economics pass.

### Phase M5 - Monetization-model approval

- **Objective:** select the first model, reject weak models, or continue
  validation.
- **Main questions:** Which model should be built first? What remains free? What
  is the validated pricing range? What legal/accounting/provider review is still
  required? What is the rollback plan?
- **Inputs required:** M0-M4 deliverables, source register, pilot data, risk
  register, owner priorities.
- **Research activities:** decision review, model scoring update, contrarian
  review, operator support review, legal/accounting checkpoint.
- **Experiments:** none.
- **Deliverables:** decision memo, recommended ADR, accepted free/paid boundary,
  implementation constraints.
- **Success criteria:** first model is explicitly approved, rejected, or returned
  to research with clear reasons.
- **Failure or stop criteria:** no model passes demand, trust, legal, accounting,
  or support gates.
- **Dependencies:** M4.
- **Risks:** approving a model because it is technically easy instead of because
  it is commercially validated.
- **Estimated effort:** 1 week.
- **Code changes required:** no.
- **Decision gate:** approved first model and technical foundation scope.

## 6. User-segment analysis

### Hosts with 1-3 properties

- **Verified context:** small hosts are a first target segment in `BUSINESS.md`.
- **Problem likely to matter:** reliable cleaner access, turnover timing,
  cleaner backups, reduced manual messaging, calendar coordination.
- **WTP hypothesis:** low until marketplace liquidity is proven; possible EUR
  5-15/month or EUR 3-8/property/month for operational tools after repeated use.
- **Free boundary:** basic browsing, job posting, applications, offers,
  assignments, messages, completion, reviews, and basic calendar coordination.
- **Paid boundary hypothesis:** saved cleaner lists, calendar convenience,
  recurring job templates, reliability insights, priority support.
- **Reject if:** hosts do not repeat post jobs, import calendars, or complete
  cleanings through the platform.

### Hosts with 4-20 properties

- **Problem likely to matter:** multi-property scheduling, backup coverage,
  fewer last-minute failures, team visibility, reporting.
- **WTP hypothesis:** moderate if the app saves time and prevents turnover
  failures; possible EUR 15-60/month tiered by property count.
- **Free boundary:** enough core marketplace access to preserve liquidity.
- **Paid boundary hypothesis:** multi-property automation, recurring jobs,
  cleaner pools, advanced calendar import/export, activity reports, support.
- **Reject if:** hosts still coordinate outside the app after the first
  introduction.

### Individual cleaners

- **Problem likely to matter:** finding reliable work, calendar visibility,
  reputation, lower coordination friction.
- **WTP hypothesis:** low for access in early supply growth; possible optional
  EUR 3-10/month business tools only after demand is visible.
- **Free boundary:** verification, basic profile, applications, assignments,
  messaging, completion, reviews, ratings, safety reports.
- **Paid boundary hypothesis:** optional profile/business tools, availability
  tools, portfolio content, performance reports.
- **Reject if:** paid cleaner tools reduce verified supply or application rates.

### Agencies

- **Problem likely to matter:** member assignment, team calendar, credibility,
  work allocation, host-facing reporting, operational accountability.
- **WTP hypothesis:** stronger than individual cleaners if the agency workflow is
  active; possible EUR 19-99/month by team size or operational volume.
- **Free boundary:** basic agency profile, applications/offers, assignments,
  delegation to active member cleaners.
- **Paid boundary hypothesis:** team reporting, member workload, branded profile,
  advanced agency dashboard, priority support.
- **Reject if:** agency dashboard/member workflows are not used repeatedly.

### Advertisers and referral partners

- **Problem likely to matter:** access to hosts/cleaners with relevant intent.
- **WTP hypothesis:** low until traffic and segmentation are meaningful.
- **Free boundary:** organic marketplace decisions and trust signals.
- **Paid boundary hypothesis:** partner directory, contextual referral modules,
  non-intrusive sponsorship clearly separated from ranking.
- **Reject if:** ads reduce trust, require excessive tracking, or confuse organic
  reputation.

## 7. Competitor and comparable-platform analysis

Competitors should be treated in tiers:

- **Direct workflow comparable:** Turno, because it targets vacation rental
  cleaning operations and publishes host/cleaner pricing information.
- **Adjacent vacation-rental SaaS:** Smoobu, Lodgify, Guesty, and similar tools
  that monetize property/operations software, not cleaning labor liquidity.
- **Horizontal services marketplaces:** Taskrabbit and Thumbtack, useful for fee,
  lead, trust, and bypass-risk patterns.
- **Large travel marketplaces:** Airbnb and Booking.com, useful for fee
  expectations and host ecosystem context, but not direct cleaning marketplace
  comparables.
- **Payment infrastructure providers:** Stripe Connect, Adyen for Platforms, and
  similar providers, relevant only for late managed-payments feasibility.

Comparable lessons:

- **Subscription SaaS is easier to validate manually** than managed payments
  because it can be sold around operational value without touching job money.
- **Lead fees create bypass and refund risk** because users can exchange contact
  details and transact outside the platform after the first introduction.
- **Commission requires payment control or strong reporting incentives**;
  otherwise users can bypass the platform after matching.
- **Sponsored placement threatens trust** if it is not visually separated from
  organic verification, ratings, and reliability signals.
- **Advertising and referral partnerships need traffic scale** and consent-safe
  tracking before they can matter financially.

## 8. Monetization-model comparison matrix

Scores are 1-5 planning hypotheses. For revenue, validation speed, and fit, 5
means higher/better. For complexity, burden, and risk columns, 5 means worse.

| Model | Revenue potential | Validation speed | Technical complexity | Legal complexity | Billing complexity | Support burden | Marketplace growth risk | Trust risk | Bypass risk | Current product fit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Host subscription | 4 | 4 | 2 | 2 | 2 | 2 | 2 | 2 | 3 | 4 |
| Agency subscription | 3 | 3 | 2 | 2 | 2 | 3 | 2 | 2 | 3 | 3 |
| Cleaner premium tools | 2 | 3 | 2 | 2 | 2 | 2 | 4 | 3 | 4 | 2 |
| Paid operational add-ons | 3 | 3 | 3 | 2 | 3 | 3 | 2 | 2 | 2 | 3 |
| Lead/introduction fees | 3 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 5 | 2 |
| Transaction commission | 5 | 1 | 5 | 5 | 5 | 5 | 4 | 4 | 5 | 1 |
| Sponsored placement | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 5 | 3 | 2 |
| Advertising | 2 | 4 | 2 | 3 | 2 | 2 | 2 | 4 | 1 | 2 |
| Referral partnerships | 2 | 4 | 2 | 3 | 2 | 2 | 1 | 3 | 1 | 3 |
| Hybrid model | 5 | 2 | 4 | 4 | 4 | 4 | 3 | 4 | 4 | 3 |

Model-level rejection criteria:

- **Host subscription:** reject if hosts do not repeat usage or cannot name
  operational value beyond access.
- **Agency subscription:** reject if agencies do not use member delegation,
  reporting, or team coordination.
- **Cleaner premium tools:** reject if supply growth is fragile or paid tooling
  reduces cleaner activation.
- **Operational add-ons:** reject if the underlying workflow is not used
  repeatedly.
- **Lead fees:** reject if qualified-introduction definition, refund rules, or
  anti-bypass policy remain unclear.
- **Commission:** reject until managed payments, dispute rules, invoices, KYC/KYB,
  reconciliation, and support are ready.
- **Sponsored placement:** reject if it weakens confidence in verified/rated
  supply.
- **Advertising/referrals:** reject if traffic is too low or consent-safe
  attribution is unavailable.
- **Hybrid:** reject if it mixes unvalidated models and hides why revenue is
  working or failing.

## 9. Pricing and packaging hypothesis framework

No price in this section is validated.

Pricing hypotheses to test:

- **Host Pro, small hosts:** EUR 5-15/month or EUR 3-8/property/month after
  repeated completed jobs.
- **Host Pro, portfolio hosts:** EUR 15-60/month based on property count or
  operational usage.
- **Agency Pro:** EUR 19-99/month based on member count, reporting, and support.
- **Cleaner premium tools:** EUR 3-10/month only for optional business tools, not
  basic access.
- **Operational add-ons:** EUR 1-20/use or bundle add-ons into Pro only after
  repeated workflow usage.
- **Lead fees:** test only after defining qualified introduction; do not start
  with automated charging.
- **Sponsored placement:** test only after ranking governance exists.
- **Managed payments/commission:** no price/percentage should be selected before
  payment feasibility and unit economics are reviewed.

Packaging principles:

- Keep a usable free core.
- Package around job frequency, property count, agency member count, operational
  reporting, support level, or automation.
- Do not package around verification, safety, reviews, ratings, or visibility
  that users assume is earned by trust.
- Prefer manual pilots before billing infrastructure.
- Treat `action_plan.docx` forecast assumptions as scenario inputs, not accepted
  pricing.

## 10. Customer interview and experiment plan

Host interview questions:

- How many STR properties do you manage and in which cities?
- How do you currently find cleaners and backup cleaners?
- What happens when a cleaner cancels close to guest check-in?
- How do you coordinate calendars and checkout times?
- What do you already pay for: cleaner management, PMS, channel manager,
  calendar tools, ads, property management, or support?
- Which problem would justify paying monthly?
- What would make the platform valuable enough after the first introduction?
- What payment, invoice, and dispute expectations do you have?

Cleaner interview questions:

- How do you find recurring jobs today?
- What makes you trust a host or job listing?
- What information do you need before applying?
- Would paid tools help you earn more or manage work better?
- What fees would make you leave or ignore the platform?
- How do you prefer payment and proof of completed work?

Agency interview questions:

- How do you assign jobs to members now?
- What team visibility is missing?
- Which reports would clients value?
- What would justify a monthly agency subscription?
- How do you handle cancellations, replacements, and quality complaints?

Experiment sequence:

1. Problem interviews.
2. Concierge Host Pro/Agency Pro offers.
3. Pricing-page or landing-page tests, only if explicitly approved.
4. Survey with ranked packages and tradeoffs.
5. Manual paid pilot, after legal/accounting review for charging.
6. Decision review.

Experiment success criteria:

- Qualified users opt into a paid pilot, not just a waitlist.
- Users can name the paid problem without prompting.
- Repeat use or renewal intent appears.
- No negative movement in posting, application, assignment, completion, review,
  or supply metrics.

Experiment failure criteria:

- Users only want basic access.
- Price sensitivity is high before liquidity is proven.
- Paid messages create mistrust.
- Manual support effort is too high for the revenue.

## 11. Unit economics and forecasting plan

`action_plan.docx` contains internal planning estimates for setup costs, monthly
burn, advertising spend, Host Pro, commission, and break-even. These figures are
not validated and should be moved into a scenario model only after assumptions
are checked.

Metrics to model before approval:

- Active hosts by city.
- Active verified cleaners by city.
- Agency count and active agency members.
- Properties per active host.
- Jobs posted per host per month.
- Applications per job.
- Assignment rate.
- Completion rate.
- Repeat host rate.
- Review completion rate.
- Average agreed price of completed assignments.
- Support minutes per job and per paid account.
- Acquisition spend by segment.
- Conversion from free to pilot to paid.
- Churn and renewal intent.

Unit economics formulas:

- **Subscription MRR:** paid accounts x monthly price.
- **Property-based MRR:** paid properties x price per property.
- **Add-on revenue:** paid uses x price per use.
- **Commission gross revenue:** completed on-platform payment volume x take rate;
  do not use until managed payments are approved.
- **Contribution margin:** revenue minus payment/provider fees, support cost,
  verification/admin cost, direct infrastructure, refunds/credits, and
  sales/marketing allocation.
- **Payback:** CAC / monthly contribution per customer.

Forecast gates:

- Do not present a break-even month as proven until actual pilot conversion,
  churn, support cost, and acquisition cost are measured.
- Do not include commission revenue in the base case until M10 is approved.
- Keep a downside case where subscriptions convert slowly and commission never
  launches.

## 12. Legal, tax, accounting, GDPR, and billing dependencies

This section is research framing only, not legal advice.

Items requiring Bulgarian legal/accounting review:

- Whether and when a Bulgarian company registration is required for planned
  monetization.
- VAT registration thresholds, VAT treatment, invoicing obligations, and
  cross-border service questions.
- Terms of Service for marketplace role, independent contractor status, payment
  responsibilities, dispute process, cancellation, refunds, reviews, and
  moderation.
- GDPR controller/processor responsibilities, privacy notice, cookie policy,
  analytics consent, marketing consent, retention, deletion, access requests,
  and processor DPAs.
- Advertising/referral disclosures and tracking consent.
- Payment-provider responsibilities for subscriptions, invoices, failed
  payments, chargebacks, KYC/KYB, connected accounts, payouts, and
  reconciliation.

Model-specific legal/accounting implications:

- **Subscriptions:** invoices/receipts, VAT treatment, failed payments,
  cancellation, refunds, consumer/business customer classification.
- **Agency subscriptions:** company account ownership, member access, seat/member
  limits, admin authority.
- **Cleaner premium:** consumer-protection and fairness risk if supply-side
  workers are charged.
- **Add-ons:** refund rules for operational service failures.
- **Lead fees:** qualified lead definition, refund triggers, contact-data use,
  bypass enforcement.
- **Sponsored placement/ads/referrals:** disclosure, consent, ranking fairness,
  ad partner data sharing.
- **Managed payments/commission:** KYC/KYB, PSD/payment-service boundaries,
  chargebacks, payout failures, refunds, disputes, invoices, reconciliation, and
  VAT treatment.

External context:

- The European Commission states that ViDA was adopted in 2025 and rolls out
  progressively through 2035, with platform-economy VAT changes from 2028 for
  short-term accommodation and road passenger transport platforms.
- Stripe Connect documentation shows that marketplace payments involve connected
  accounts, account verification, balances, payouts, and money-movement flows.
  That complexity is why managed payments remain a late optional phase.

## 13. Track B - Technical foundation phases

Track B starts only after Track A approves a model. M6 can be planned before
build, but model-agnostic implementation should still have a business gate.

### Phase M6 - Model-agnostic technical foundation

Foundation topics:

1. Monetization domain boundaries.
2. Feature entitlement architecture.
3. Plan and product catalogue concepts.
4. Pricing versioning.
5. Trial and promotional concepts.
6. Usage analytics.
7. Conversion analytics.
8. Revenue-event tracking.
9. Audit logging.
10. Admin controls.
11. Notification requirements.
12. Security and permission rules.
13. Idempotency.
14. Retry handling.
15. Failure recovery.
16. Data retention and GDPR.
17. Observability.
18. Testing strategy.
19. Feature flags.
20. Controlled rollout.
21. Rollback strategy.

High-level architecture preference:

- Entitlement decisions should be owned near accounts/identity and consulted by
  marketplace services at workflow boundaries.
- Billing/payment should be a separate future domain if approved, not embedded
  directly into marketplace state transitions.
- Existing audit logging should be extended for monetization decisions only
  after a model is approved.
- Analytics must respect cookie consent and avoid sensitive data.

Safe before final model approval:

- Read-only metric extraction.
- Analytics event design.
- Experiment requirements.
- Architecture notes.
- ADR draft.

Wait until model approval:

- Entitlement data model.
- Product/plan catalogue.
- Admin billing/entitlement pages.
- Paid frontend states.
- Subscription or checkout APIs.

Wait until paid pilot succeeds:

- Payment-provider integration.
- Billing migrations.
- Subscription lifecycle automation.
- Invoice/payment records.
- Webhook handling.

Wait until real production payment volume exists:

- Managed payments.
- Payouts.
- Wallets/platform balances.
- Commission settlement.
- Refund/dispute automation.

## 14. Model-specific technical branches

All branches must keep these workflows free during marketplace validation:
basic signup/onboarding, approval/verification, public trust signals, basic
cleaner directory/open jobs, basic job posting, applying, direct offers,
assignment, completion, messaging, reviews, ratings, safety reporting, and basic
calendar coordination.

### Branch A - Host subscriptions

- **Business prerequisites:** M5 approves Host Pro; hosts show repeated
  completed-job usage and paid interest in operational tools.
- **Readiness gate:** validated free/paid boundary, pricing range, cancellation
  policy, invoice/VAT review, support process.
- **Required domain models:** high-level account plan, entitlement, product
  catalogue, subscription state, pricing version; exact schema deferred.
- **Required service-layer workflows:** check entitlements at host workflow
  boundaries for paid operational tools only.
- **Required API endpoints:** plan discovery, entitlement state, subscription
  status, admin overrides; checkout only after billing provider approval.
- **Required frontend pages/states:** Pro offer page, upgrade state, trial state,
  billing settings, locked advanced operational features with non-blocking core.
- **Feature entitlement rules:** basic marketplace remains free; paid features
  may include advanced calendar automation, recurring templates, saved cleaner
  pools, reliability reporting, and priority support.
- **Admin functionality:** grant/revoke trial, support override, view account
  entitlement, audit changes.
- **Background tasks:** renewal reminders, trial expiry notices, failed-payment
  notices after billing exists.
- **External integrations:** payment provider only after M4/M5 and provider
  review.
- **Webhooks:** subscription lifecycle webhooks only after provider selection.
- **Permissions and ownership rules:** host-owned accounts/properties only;
  team access requires a separate team policy.
- **Security risks:** entitlement bypass, leaked billing state, exposing private
  property/host data in analytics.
- **Fraud and bypass risks:** account sharing, trial abuse, using Pro to harvest
  contacts then churn.
- **Legal/accounting dependencies:** invoices, VAT, refunds, cancellation terms.
- **Migration strategy:** additive, feature-flagged, no core workflow lockout.
- **Backfill requirements:** none until billing data exists; optional usage
  summary from existing properties/jobs/completions.
- **Test coverage:** entitlement checks, downgrade behavior, admin override,
  billing webhook idempotency if provider exists.
- **Observability:** conversion, activation, trial expiry, churn, support
  tickets, core marketplace health.
- **Support requirements:** billing help, downgrade/cancel handling, confused
  lock-state handling.
- **Controlled rollout:** invite-only active hosts in one city.
- **Rollback strategy:** disable paid gates and preserve core access.

### Branch B - Agency subscriptions

- **Business prerequisites:** M5 approves Agency Pro; agencies actively use
  member invitations, memberships, assignments, and delegation.
- **Readiness gate:** agency paid value validated around team operations, not
  job access.
- **Required domain models:** agency account plan, member/seat or usage
  entitlement, pricing version, subscription state.
- **Required service-layer workflows:** enforce paid agency tools at team/report
  boundaries, not basic work acceptance.
- **Required API endpoints:** agency plan status, member entitlement summary,
  admin override, billing state after provider approval.
- **Required frontend pages/states:** agency Pro panel, team/reporting upsell,
  billing settings, trial status.
- **Feature entitlement rules:** basic agency participation remains free; paid
  features may include team calendar, workload reports, branded profile,
  priority support, member activity history.
- **Admin functionality:** grant/revoke Agency Pro, inspect member usage, audit
  entitlement changes.
- **Background tasks:** trial expiry, renewal, member-limit warnings after model
  approval.
- **External integrations:** payment provider only after approval.
- **Webhooks:** subscription lifecycle after provider selection.
- **Permissions and ownership rules:** agency owner controls billing; member
  cleaners retain separate user accounts and calendars.
- **Security risks:** agency seeing member data beyond legitimate operational
  scope.
- **Fraud and bypass risks:** agencies sharing one account or moving coordination
  off-platform after introductions.
- **Legal/accounting dependencies:** B2B invoicing, agency authority, VAT review.
- **Migration strategy:** additive, feature-flagged, no delegation invariant
  changes.
- **Backfill requirements:** agency member counts and assignment history.
- **Test coverage:** entitlement by agency owner/member, revoked members,
  downgrade, audit.
- **Observability:** agency activation, member assignments, report usage,
  churn/support.
- **Support requirements:** billing owner changes, member disputes, access
  confusion.
- **Controlled rollout:** invite active agencies with delegated assignments.
- **Rollback strategy:** keep core agency delegation free and disable Pro tools.

### Branch C - Cleaner premium business tools

- **Business prerequisites:** cleaner supply is healthy and cleaners request
  optional business tools.
- **Readiness gate:** paid tools do not reduce cleaner activation or application
  rates.
- **Required domain models:** cleaner plan/entitlement and optional product
  catalogue entries.
- **Required service-layer workflows:** paid checks only for optional tools.
- **Required API endpoints:** cleaner plan state and optional tool entitlement.
- **Required frontend pages/states:** cleaner premium tools page and clear free
  core.
- **Feature entitlement rules:** applying, profile basics, verification,
  ratings, reviews, safety, and assignments remain free.
- **Admin functionality:** grant/revoke cleaner premium and support override.
- **Background tasks:** trial/renewal notices after billing exists.
- **External integrations:** billing provider only after pilot.
- **Webhooks:** subscription lifecycle after provider selection.
- **Permissions and ownership rules:** cleaner owns their own premium tools.
- **Security risks:** paid profile fields leaking sensitive data or distorting
  trust.
- **Fraud and bypass risks:** paid tools used to circumvent marketplace rules.
- **Legal/accounting dependencies:** consumer/business classification, refund
  terms.
- **Migration strategy:** additive and reversible.
- **Backfill requirements:** profile completeness and usage summaries only.
- **Test coverage:** free access preservation, entitlement checks, downgrade.
- **Observability:** supply health, application rate, premium activation, churn.
- **Support requirements:** careful messaging to avoid perceived pay-to-work.
- **Controlled rollout:** only to high-activity verified cleaners after demand.
- **Rollback strategy:** make optional tools free or disable without harming work.

### Branch D - Paid operational add-ons

- **Business prerequisites:** repeated use of a specific workflow proves pain.
- **Readiness gate:** add-on has clear value, unit cost, refund policy, and owner.
- **Required domain models:** add-on product, usage event, entitlement/credit,
  pricing version.
- **Required service-layer workflows:** purchase/use/retry/refund lifecycle after
  approval.
- **Required API endpoints:** add-on catalogue, usage eligibility, purchase/use
  status after billing approval.
- **Required frontend pages/states:** add-on offer, usage confirmation,
  completion/error state.
- **Feature entitlement rules:** add-ons enhance operations but do not block core
  matching.
- **Admin functionality:** credit grant, refund/void, usage audit.
- **Background tasks:** fulfillment, retry, failure notification.
- **External integrations:** provider only if payment or third-party fulfillment
  is needed.
- **Webhooks:** payment/fulfillment webhooks if applicable.
- **Permissions and ownership rules:** only owning host/agency/cleaner can buy or
  use add-on.
- **Security risks:** charging without fulfillment, leaking calendar/property
  data to partners.
- **Fraud and bypass risks:** repeated trial/credit abuse.
- **Legal/accounting dependencies:** refund policy, invoices, partner contracts.
- **Migration strategy:** additive, per-add-on flags.
- **Backfill requirements:** historical usage to target eligible users.
- **Test coverage:** idempotent purchase/use, failure recovery, refund state.
- **Observability:** usage, conversion, fulfillment failures, support tickets.
- **Support requirements:** clear fulfillment ownership.
- **Controlled rollout:** one add-on, one cohort, one city.
- **Rollback strategy:** disable purchase and honor/void existing credits.

### Branch E - Lead or introduction fees

- **Business prerequisites:** strong liquidity and a precise qualified-intro
  definition.
- **Readiness gate:** refund rules, anti-bypass strategy, contact-data policy,
  and support process approved.
- **Required domain models:** lead/introduction event, qualification status,
  dispute/refund state, billing status.
- **Required service-layer workflows:** qualify intro, charge/void/refund, handle
  disputes, prevent duplicate fees.
- **Required API endpoints:** introduction status, billing/fee status, admin
  dispute tools.
- **Required frontend pages/states:** clear disclosure before chargeable action.
- **Feature entitlement rules:** browsing and trust signals remain free.
- **Admin functionality:** manual qualification, refund, dispute resolution.
- **Background tasks:** qualification reminders and invoice/payment sync after
  billing exists.
- **External integrations:** billing provider after approval.
- **Webhooks:** payment and refund webhooks after provider selection.
- **Permissions and ownership rules:** only involved parties and admins see lead
  fee details.
- **Security risks:** exposing contact details or private job data.
- **Fraud and bypass risks:** very high; users can move off-platform after first
  contact.
- **Legal/accounting dependencies:** qualified lead definition, VAT/invoicing,
  refund rights.
- **Migration strategy:** additive and behind flags.
- **Backfill requirements:** none for charging; historical data can estimate
  volume only.
- **Test coverage:** duplicate prevention, refund/dispute, no unauthorized
  details.
- **Observability:** bypass indicators, disputes, refunds, conversion.
- **Support requirements:** high; expect disputes over lead quality.
- **Controlled rollout:** manual-only pilot before automation.
- **Rollback strategy:** disable charging and remove fee prompts.

### Branch F - Sponsored placement

- **Business prerequisites:** enough traffic and ranking governance.
- **Readiness gate:** sponsorship disclosure, fairness policy, trust impact
  review, consent-safe metrics.
- **Required domain models:** campaign, placement, impression/click event,
  budget/status if billing exists.
- **Required service-layer workflows:** serve sponsored slots separately from
  organic ranking.
- **Required API endpoints:** campaign/admin endpoints and public placement feed
  only after approval.
- **Required frontend pages/states:** clearly labelled sponsored units.
- **Feature entitlement rules:** paid placement never changes verification,
  rating, review, or safety status.
- **Admin functionality:** approve, pause, audit campaigns.
- **Background tasks:** campaign start/stop, reporting, billing sync if needed.
- **External integrations:** ad/referral/billing partners only after review.
- **Webhooks:** partner/billing webhooks if applicable.
- **Permissions and ownership rules:** campaign owner sees their reporting only.
- **Security risks:** ad injection, misleading ranking, private targeting data.
- **Fraud and bypass risks:** impression/click fraud, paid visibility gaming.
- **Legal/accounting dependencies:** ad disclosure, invoices, partner terms.
- **Migration strategy:** isolated sponsored slot, no organic ranking rewrite.
- **Backfill requirements:** traffic/impression baselines.
- **Test coverage:** disclosure, separation from organic, permission checks.
- **Observability:** impressions, clicks, complaints, trust metrics.
- **Support requirements:** advertiser approval and complaints.
- **Controlled rollout:** small labelled partner slot outside critical matching.
- **Rollback strategy:** disable sponsored slots globally.

### Branch G - Advertising and referral partnerships

- **Business prerequisites:** meaningful traffic and relevant partner offers.
- **Readiness gate:** consent, privacy, partner due diligence, disclosure, and
  trust review.
- **Required domain models:** partner, offer, referral event, consent-aware
  attribution, payout/invoice state if needed.
- **Required service-layer workflows:** referral capture and attribution without
  affecting core matching.
- **Required API endpoints:** partner offer feed/admin reporting after approval.
- **Required frontend pages/states:** partner offers separated from marketplace
  decisions.
- **Feature entitlement rules:** no paid partner can alter trust or ranking.
- **Admin functionality:** approve/pause partners, view referral metrics.
- **Background tasks:** partner reporting and reconciliation if applicable.
- **External integrations:** affiliate/referral networks or direct partner links.
- **Webhooks:** partner conversion webhooks if used.
- **Permissions and ownership rules:** users control consent; partners receive
  minimum necessary data.
- **Security risks:** third-party scripts, tracking leakage, weak partner data
  handling.
- **Fraud and bypass risks:** low to medium; referral attribution gaming.
- **Legal/accounting dependencies:** GDPR/ePrivacy, marketing consent, partner
  contracts, invoice treatment.
- **Migration strategy:** no third-party pixels before consent and review.
- **Backfill requirements:** traffic and segment metrics only.
- **Test coverage:** consent gating, disclosure, no private data leakage.
- **Observability:** impressions, opt-in rates, conversions, complaints.
- **Support requirements:** partner quality and user complaints.
- **Controlled rollout:** static partner directory before dynamic ads.
- **Rollback strategy:** remove offers and revoke partner integrations.

### Branch H - Managed payments and transaction commission

- **Business prerequisites:** stable completed-job volume, low dispute rate, user
  demand for on-platform payment, accounting review, payment-provider review,
  support readiness.
- **Readiness gate:** explicit M10 approval; clear reason users prefer
  on-platform payment over off-platform payment.
- **Required domain models:** payment intent/order, platform fee, payout
  recipient, provider account, transaction, refund, dispute, invoice/export,
  reconciliation state; exact schema deferred to a separate payment design.
- **Required service-layer workflows:** authorize/capture/settle/refund/dispute,
  payout status, commission calculation, idempotent webhook processing.
- **Required API endpoints:** payment setup, checkout/payment status, refund or
  dispute requests, admin reconciliation; exact design deferred.
- **Required frontend pages/states:** checkout, payment status, payout onboarding,
  refund/dispute state, invoice/receipt access.
- **Feature entitlement rules:** payment may enhance transaction assurance but
  must not replace trust/review safety.
- **Admin functionality:** payment support, dispute review, reconciliation,
  provider account status, audit.
- **Background tasks:** payment retries, payout sync, invoice export, dispute
  deadlines, reconciliation.
- **External integrations:** Stripe Connect, Adyen for Platforms, Mangopay, or
  another provider only after procurement/security/accounting review.
- **Webhooks:** payment, refund, chargeback, payout, account verification,
  dispute, balance events.
- **Permissions and ownership rules:** strict role-based access; never expose
  another party's sensitive financial data.
- **Security risks:** payment fraud, account takeover, webhook spoofing, PII/KYC
  leakage, idempotency failures.
- **Fraud and bypass risks:** high; users may transact off-platform to avoid
  fees unless the platform adds meaningful payment value.
- **Legal/accounting dependencies:** VAT, invoices, PSD/payment-service
  boundaries, KYC/KYB, chargebacks, refunds, provider terms, records retention.
- **Migration strategy:** separate payment domain, feature flags, sandbox first,
  no retroactive charging.
- **Backfill requirements:** historical agreed-price volume for estimates only,
  not payment records.
- **Test coverage:** webhook idempotency, reconciliation, permissions, refunds,
  disputes, provider failure, rollback.
- **Observability:** payment success, failure, chargeback, dispute, payout delay,
  reconciliation mismatch.
- **Support requirements:** high; payment support playbooks required before
  launch.
- **Controlled rollout:** sandbox, internal test, small invite-only cohort, low
  transaction limits.
- **Rollback strategy:** disable new on-platform payments, complete/refund
  in-flight transactions according to provider/legal rules, keep core marketplace
  usable off-platform.

## 15. Dependencies between business and technical phases

Work that can safely begin before monetization model finalization:

- Research.
- Interviews.
- Competitor analysis.
- Read-only metric queries.
- Analytics event design.
- Manual pricing/package scripts.
- Legal/accounting question list.
- ADR draft.

Work that should wait until the business model is selected:

- Entitlement architecture implementation.
- Plan/product catalogue implementation.
- Paid UI states.
- Admin monetization controls.
- Subscription/add-on/lead/sponsored-specific models.

Work that should wait until a paid pilot succeeds:

- Billing provider integration.
- Billing migrations.
- Subscription lifecycle automation.
- Invoice/payment records.
- Webhook processing.
- Paid support workflows.

Work that should wait until real production payment volume exists:

- Managed payments.
- Payouts.
- Wallets.
- Platform balances.
- Commission settlement.
- Automated refunds/disputes.
- Payment reconciliation automation.

## 16. Monetization readiness gates

- **M0 gate:** constraints, non-goals, and labels accepted.
- **M1 gate:** target segments and cities are evidence-backed.
- **M2 gate:** repeated pain and credible willingness to pay are found.
- **M3 gate:** one or two model/package hypotheses show demand without harming
  liquidity or trust.
- **M4 gate:** manual paid pilot shows repeatable value and viable support/unit
  economics.
- **M5 gate:** first model selected, rejected, or sent back to validation.
- **M6 gate:** technical foundation scope approved and does not assume future
  commission.
- **M7 gate:** legal/accounting/support/security/readiness gates pass for the
  first model.
- **M8 gate:** controlled rollout metrics justify expansion.
- **M9 gate:** retention, margin, support load, and trust metrics remain healthy.
- **M10 gate:** managed payments have explicit approval, stable completed-job
  volume, dispute rules, provider review, accounting review, and payment support.

## 17. Required analytics and metrics

Liquidity metrics:

- Hosts by status, city, and activity.
- Verified cleaners by city and service area.
- Agencies and active agency members.
- Properties by city.
- Open jobs, applications, offers, assignments, completions.
- Job response time and assignment time.
- Repeat hosts and repeat cleaners.

Trust metrics:

- Review completion rate.
- Average rating and rating count.
- Private issue count.
- Cancellations, disputes, support contacts.
- Verification throughput.

Operational metrics:

- Calendar connections.
- ICS imports.
- Reservations imported.
- Favourite creation.
- Connections and messages.
- Notifications sent/read.
- Agency delegation usage.

Monetization experiment metrics:

- Pricing-page impressions and clicks.
- Waitlist or pilot signups.
- Interview-to-pilot conversion.
- Trial activation.
- Feature usage by free/paid cohorts.
- Free-to-paid conversion.
- Churn/renewal intent.
- Support tickets per paid account.

Revenue proxies calculable now:

- Agreed price on completed assignments.
- Completed jobs per active host.
- Completed jobs per cleaner/agency.
- Property count per active host.
- Repeat job volume by city.

Missing metrics/events:

- Consent-aware product analytics.
- Search/profile impressions and clicks.
- Pricing-page events.
- Entitlement events.
- Billing customer and invoice state.
- Payment method demand.
- Support/dispute/refund outcomes.
- Sponsored/referral attribution.

## 18. Repository capability and data-gap analysis

Existing monetization-relevant data:

- `User`: role, account status, approval timestamps, language, dashboard
  preferences.
- `HostProfile`, `CleanerProfile`, `AgencyProfile`: city, service areas,
  verification, rating, completed job count, agency membership context.
- `CookieConsent`: essential, analytics, marketing consent.
- `Property`: host, city, coordinates, default duration, default EUR price.
- `ExternalCalendarConnection` and `Reservation`: calendar/import context.
- `CleaningJob`: status, schedule, proposed/agreed EUR prices, property, host.
- `CleanerApplication`: origin, status, proposed price.
- `Assignment`: assigned cleaner or agency member, agreed price, completion
  timestamps.
- `Review`: public/private issue separation and ratings.
- `Notification`: notification type, metadata, read/sent state.
- `FavouriteCleaner`, `Connection`, `Message`: engagement and relationship
  signals.
- `AuditLog`: actor, action, entity, metadata, request context.

Usage metrics already calculable:

- Marketplace funnel: posted -> open -> applied/offered -> assigned ->
  completed -> reviewed.
- Supply/demand by city.
- Repeat host, cleaner, and agency usage.
- Calendar/import usage.
- Notifications and engagement.
- Completed-job agreed-price proxy.

Data gaps before monetization implementation:

- Entitlements and plan state.
- Product/price catalogue.
- Pricing version records.
- Billing customer identifiers.
- Invoice/payment records.
- Consent-aware analytics events.
- Feature-level Pro usage events.
- Profile/search impressions and clicks.
- Support/dispute/refund outcomes.
- Sponsored/referral campaign attribution.

Technical ownership recommendation:

- Accounts/identity should own role-level plan and entitlement state if approved.
- Marketplace services should consult entitlements only at paid workflow
  boundaries.
- Billing/payment should become a separate domain only after model approval.
- Audit logging should record monetization decisions and admin overrides.
- Analytics must avoid sensitive personal data and respect consent.

## 19. Risk register

| Risk | Impact | Mitigation | Gate |
|---|---|---|---|
| Charging before liquidity | Hosts/cleaners churn before network value exists | Keep core marketplace free through validation | M0-M3 |
| Charging cleaners too early | Supply loss | Avoid basic cleaner access fees | M0-M5 |
| Trust signals become pay-to-win | Lower marketplace confidence | Keep verification/ratings/reviews independent | All |
| Commission bypass | Revenue model fails | Defer commission until payment value is strong | M10 |
| Legal/accounting uncertainty | Rework or compliance exposure | Review before billing or payments | M4-M7 |
| VAT/invoicing complexity | Operational burden | Start with manual legal/accounting review | M4-M7 |
| Weak analytics | Bad model decision | Define metrics before experiments | M1-M3 |
| Sponsored placement confusion | Trust damage | Label sponsorship and separate from organic ranking | M5+ |
| Support burden underestimated | Negative margin | Track support minutes in pilot | M4 |
| Payment fraud/chargebacks | Financial and support risk | Keep managed payments late and provider-reviewed | M10 |
| Private data leakage | GDPR/security risk | Consent-aware analytics and data minimization | M6+ |
| Building before validation | Wasted engineering | Enforce business gates | All |

## 20. Proposed documentation changes

No existing documentation should be changed by this roadmap implementation except
creating this file.

After a model is approved, update:

- `BUSINESS.md`: selected model, target segment, value proposition, pricing
  hypothesis, free/paid boundary.
- `TGN.md`: new domain entities, routes, events, and invariants.
- `architecture.md`: monetization, entitlement, billing, and payment domain
  boundaries.
- `DEV.md`: local setup and verification for any provider integration.
- `DEPLOY.md`: provider secrets, webhook deployment, operational runbooks.
- Privacy/cookie policy docs: analytics, marketing, ads/referrals, payment data.
- ADR: selected monetization model and rejected alternatives.

`docs/monetization/action_plan.docx` should remain an internal input, not the
authoritative technical or legal plan.

## 21. Recommended immediate next phase

Recommended immediate phase: M0, then M1.

M0 deliverables:

- Evidence-labelled monetization constraint brief.
- Owner priority order.
- Do-not-build list.
- Legal/accounting question list.
- Validation metrics list.

M0 success criteria:

- Owner accepts that business validation comes first.
- Core marketplace/trust workflows remain free.
- No price or model is treated as final.
- Legal/accounting review boundaries are explicit.

M0 stop criteria:

- Owner requires billing/commission before validation.
- Owner requires charging for trust/safety/basic access.
- Legal/accounting review blocks the proposed first experiment.

M1 deliverables:

- Bulgarian/EU market context research.
- Competitor/comparable-platform analysis.
- Segment hypotheses.
- Contrarian evidence and risks.

## 22. Skills required for that phase

Recommended skills for M0-M1:

- `context-budget`: keep retrieval scoped.
- `iterative-retrieval`: gather only the next needed evidence.
- `market-research`: source-backed market and competitor analysis.
- `deep-research`: multi-source synthesis where public evidence matters.
- `competitive-platform-analysis`: tier direct, adjacent, and aspirational
  competitors.
- `benchmark-methodology`: score models and competitors transparently.
- `competitive-report-structure`: produce a decision-grade research report.
- `product-lens`: test why users would pay before building.
- `product-capability`: turn approved model into capability constraints.
- `research-ops`: separate facts, assumptions, inferences, and recommendations.
- `finance-billing-ops`: pressure-test revenue, pricing, billing, and support
  implications.
- `repo-scan`: inspect only relevant product/domain areas.
- `documentation-lookup`: use official provider/framework docs when needed.
- `verification-loop`: verify document scope and no code/billing changes.

Use technical architecture skills only after business phases define an approved
model and a high-level feasibility question.

## 23. Inputs required from the business owner

- Priority order: liquidity growth, trust, revenue, operational simplicity,
  investor narrative.
- Target first city or region.
- Current counts: hosts, cleaners, agencies, properties, jobs, assignments,
  completions.
- Interview targets and permission to contact them.
- Whether manual paid pilots are acceptable before billing implementation.
- Budget for research, legal/accounting review, and pilots.
- Bulgarian lawyer/accountant contact or review plan.
- Whether the brand/action-plan assumptions are active decisions or background
  notes.
- Whether mobile roadmap work should remain separate from monetization.
- Minimum proof needed before approving subscriptions.
- Minimum proof needed before even researching managed payments.

## 24. Explicit "do not build yet" list

Do not build yet:

- Stripe, Adyen, Mangopay, or other payment-provider integration.
- Payment-provider SDKs.
- Subscription models.
- Billing migrations.
- Billing customer records.
- Invoices.
- Wallets.
- Payouts.
- Platform balance.
- Commission fields.
- Checkout.
- Stored payment methods.
- Paywalls.
- Sponsored ranking.
- Automated lead charging.
- Refund/dispute/payment workflows.
- Tax calculation or VAT filing automation.
- Advertising pixels before consent and partner governance.
- Cleaner application/access fees.
- Paid verification, ratings, reviews, safety, or trust controls.
- Any restriction of core marketplace access before liquidity is validated.

## 25. Open decisions

- Which first city or region should validation prioritize?
- Which side is currently most constrained: host demand, cleaner supply, or
  agency participation?
- Which segment should be interviewed first: small hosts, portfolio hosts,
  individual cleaners, or agencies?
- What counts as enough repeated completed-job volume before monetization?
- What exact Host Pro promise should be tested manually?
- What exact Agency Pro promise should be tested manually?
- Should individual cleaners ever pay for optional tools, or should supply-side
  monetization stay off the roadmap?
- What counts as a qualified introduction if lead fees are considered?
- Would sponsored visibility ever be acceptable if separated from organic
  ranking?
- What proof would justify managed payments?
- Who owns refunds and quality disputes if payments are brought on-platform?
- What accounting documents do hosts, cleaners, and agencies need in Bulgaria?
- Which `action_plan.docx` assumptions are accepted by the business owner, and
  which are just background?
- Should mobile monetization be considered separately from web monetization?

## Appendix A - Sources

Internal sources:

- `BUSINESS.md`
- `TGN.md`
- `architecture.md`
- `CURRENT_PROGRESS.md`
- `docs/monetization/MONETIZATION_RESEARCH.md`
- `docs/monetization/action_plan.docx`
- Targeted model/service inspection in `backend/apps/accounts`,
  `backend/apps/properties`, `backend/apps/marketplace`,
  `backend/apps/feedback`, `backend/apps/notifications`,
  `backend/apps/connections`, and `backend/apps/core`

External sources:

- European Central Bank, "Bulgaria joins the euro area",
  https://www.ecb.europa.eu/euro/changeover/bulgaria/html/index.en.html
- Official website for adoption of the Euro in the Republic of Bulgaria,
  https://evroto.bg/en
- European Commission, "VAT in the Digital Age (ViDA)",
  https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en
- Eurostat, "Short-stay accommodation offered via online collaborative economy
  platforms - monthly data",
  https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Short-stay_accommodation_offered_via_online_collaborative_economy_platforms_-_monthly_data
- Stripe Docs, "Connect",
  https://docs.stripe.com/connect
- Stripe, "Pricing & fees",
  https://stripe.com/pricing
- Turno, "Affordable Pricing for Hosts and Cleaners",
  https://turno.com/pricing/
- Smoobu, "Vacation rental software pricing plans",
  https://www.smoobu.com/en/pricing/
- Lodgify, "Vacation Rental Software Pricing & Plans",
  https://www.lodgify.com/pricing/
- Taskrabbit Support, "What's the Taskrabbit Trust & Support Fee?",
  https://support.taskrabbit.com/hc/en-us/articles/46260504648731-What-s-the-Taskrabbit-Trust-Support-Fee
- Booking.com Partner Hub, Preferred Partner Programme,
  https://partner.booking.com/
