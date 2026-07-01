# M0 Monetization Constraints Brief

Status: Phase M0 business-owner decision brief.  
Date: 2026-07-01.  
Scope: documentation only.

This brief prepares monetization decisions. It does not approve or implement
billing, subscriptions, payments, entitlements, commissions, invoices, wallets,
payouts, sponsored ranking, lead charging, or paywalls.

## 1. Purpose and scope

M0 exists to lock the marketplace constraints, evidence labels, owner decision
points, and do-not-build boundaries before market research and monetization
experiments begin.

No final monetization model is approved by this brief. No product feature is
approved for implementation. M0-M5 remain business planning, validation, and
manual pilot phases.

Evidence labels:

- **Verified fact:** confirmed in repository docs or code.
- **Internal planning input:** stated in `docs/monetization/action_plan.docx`;
  useful, but not authoritative.
- **Estimate:** numeric planning input that must be validated.
- **Assumption:** operating premise used for planning.
- **Hypothesis:** testable belief.
- **Recommendation:** current suggested default.
- **Requires review:** legal, accounting, privacy, payment, or support topic
  requiring qualified review.
- **Final decision:** owner-approved decision. No final monetization decisions
  are recorded in M0.

## 2. Current product and marketplace facts

### Verified facts

- The product is a Bulgarian-market marketplace connecting short-term-rental
  hosts with verified cleaners and cleaning agencies (`BUSINESS.md:9`).
- The product helps both sides find each other, agree on work, coordinate
  schedules, and build trust; v1 is not a payment platform
  (`BUSINESS.md:13`).
- The initial market is Bulgaria, with Bulgarian/English support and EUR pricing
  (`BUSINESS.md:19`). The repo guide also fixes BG/EN, EUR, and `Europe/Sofia`
  as the locale/market assumptions (`AGENTS.md:12`).
- Marketplace liquidity should be built city by city or region by region rather
  than assuming equal national coverage from day one (`BUSINESS.md:21`).
- Cleaners must be verified and users approved before full marketplace actions
  (`AGENTS.md:37`). Cleaners must be verified and approved before applying for a
  job (`TGN.md:153`).
- A cleaning job can have only one accepted assignment (`AGENTS.md:38`).
- Agency member delegation is normally immutable after first member assignment
  (`AGENTS.md:39`).
- Reviews are two-way, post-completion only, and double-blind until both parties
  submit or the review window closes (`AGENTS.md:41`).
- Payments happen outside the platform in v1; payment processing, payouts,
  wallets, invoices, and platform fees must not be added unless explicitly
  requested (`AGENTS.md:42`).
- The main trust promise is verified and reviewed supply (`BUSINESS.md:138`),
  supported by manual account/cleaner/agency approval, two-way reviews, and
  admin-visible application/assignment history (`BUSINESS.md:142-145`).
- Cookie consent records distinguish essential, analytics, and marketing choices
  (`architecture.md:99`, `architecture.md:282`).
- The app calendar is the source of truth (`architecture.md:13`).

### Existing workflows and data assets

The repository already contains the operational data needed for M0-M1 analysis:

- Accounts, user roles, host profiles, cleaner profiles, agency profiles,
  invitations, memberships, cookie consent, and role permissions
  (`architecture.md:35`; `backend/apps/accounts/models.py:34`,
  `backend/apps/accounts/models.py:139`, `backend/apps/accounts/models.py:153`,
  `backend/apps/accounts/models.py:234`, `backend/apps/accounts/models.py:384`).
- Properties, external calendar connections, reservations, and iCal parsing
  (`architecture.md:36`; `backend/apps/properties/models.py:7`,
  `backend/apps/properties/models.py:54`, `backend/apps/properties/models.py:87`).
- Cleaning jobs, applications, assignments, favourite cleaners, and marketplace
  services (`architecture.md:37`; `backend/apps/marketplace/models.py:37`,
  `backend/apps/marketplace/models.py:86`,
  `backend/apps/marketplace/models.py:124`,
  `backend/apps/marketplace/models.py:160`).
- Two-way reviews and cleaner reputation updates (`architecture.md:39`;
  `backend/apps/feedback/models.py:8`).
- Notification records (`architecture.md:40`;
  `backend/apps/notifications/models.py:7`).
- Connections and messages (`backend/apps/connections/models.py:7`,
  `backend/apps/connections/models.py:52`).
- Append-only audit logs for key business actions (`architecture.md:42`,
  `architecture.md:292`; `backend/apps/core/models.py:13`).
- Proposed/agreed EUR prices on cleaning jobs and assignments exist as
  coordination/revenue-proxy data, while actual payment remains off-platform
  (`docs/monetization/MONETIZATION_IMPLEMENTATION_ROADMAP.md:66-74`).

## 3. Documentation and implementation mismatches

### Signup approval status mismatch

Repository documentation says new signups start as pending and wait for admin
approval (`BUSINESS.md:126`, `BUSINESS.md:291`, `TGN.md:134`,
`architecture.md:106`). The model default also defines `account_status` as
pending (`backend/apps/accounts/models.py:52-55`).

Current signup implementation and tests indicate the signup path creates
approved users: the serializer sets `account_status=User.AccountStatus.APPROVED`
(`backend/apps/accounts/serializers.py:200`), and the account tests include
`test_signup_creates_approved_user_and_profile_session`
(`backend/apps/accounts/tests/test_auth_agency_consent.py:48`). The current
progress note also records an existing mismatch: a host signup test expected
`pending`, while current signup code creates `approved`
(`CURRENT_PROGRESS.md:295`).

M0 impact: this does not block the monetization constraints brief, but it does
affect approval-funnel metrics, trust language, and any future monetization gate
that relies on "approved" status. Product owner resolution is required before
M1 research treats approval status as a clean metric.

No other documentation/implementation conflict was found that blocks M0.

## 4. Primary monetization objective

The owner should prioritize these objectives before M1:

1. Marketplace liquidity.
2. Trust and retention.
3. Learning speed.
4. Operational simplicity.
5. Investor or business-plan readiness.
6. Early recurring revenue.

**Recommendation, not decision:** prioritize liquidity first, trust/retention
second, learning speed third, operational simplicity fourth, business-plan
readiness fifth, and early recurring revenue sixth.

Reasoning: the product is still validating city-level supply and demand.
`BUSINESS.md` warns that national availability should not imply equal cleaner
coverage everywhere (`BUSINESS.md:21`) and asks whether enough verified cleaners
and agencies can exist where hosts post jobs (`BUSINESS.md:248`). Early revenue
should not reduce the supply/demand density needed for marketplace trust.

**OWNER DECISION REQUIRED:** confirm, reorder, or reject this priority order
before M1 starts.

## 5. Free-core boundary for M0-M5

These workflows should remain free during monetization validation:

- Account creation and onboarding.
- Cleaner verification and trust signals.
- Property creation.
- Basic job posting.
- Job discovery.
- Applications.
- Direct offers.
- Assignments.
- Basic messaging.
- Completion.
- Reviews and ratings.
- Safety and issue reporting.
- Basic calendar coordination.

This matches the roadmap boundary that all branches must keep basic
signup/onboarding, approval/verification, public trust signals, cleaner
directory/open jobs, basic job posting, applications, direct offers,
assignment, completion, messaging, reviews, ratings, safety reporting, and
basic calendar coordination free during validation
(`docs/monetization/MONETIZATION_IMPLEMENTATION_ROADMAP.md:710-713`).

No trust/safety feature should become paid during M0-M5. Paid verification,
ratings, reviews, safety, or trust controls are explicitly on the do-not-build
list (`docs/monetization/MONETIZATION_IMPLEMENTATION_ROADMAP.md:1319`).

Uncertainty: the signup approval mismatch in section 3 must be resolved before
approval status can be used as a clean monetization funnel metric.

## 6. Candidate paid-value boundary

The following are hypotheses only. None are approved for build:

- Advanced calendar automation.
- Recurring job templates.
- Multi-property coordination.
- Cleaner backup workflows.
- Reliability and activity reporting.
- Agency team management.
- Member workload visibility.
- Advanced operational reports.
- Priority support.

These hypotheses should be validated against real host/agency pain before any
entitlement, billing, subscription, or paid UI work begins.

## 7. Assumption register

| ID | Evidence type | Assumption or hypothesis | Segment | Current evidence | Confidence | Validation method | Failure signal | Consequence if false | Owner/reviewer |
|---|---|---|---|---|---|---|---|---|---|
| VF-01 | Verified fact | V1 is not a payment platform; payments happen outside the platform. | All | `BUSINESS.md:13`, `AGENTS.md:42`, roadmap `66-74` | High | Keep as invariant unless owner changes v1 scope. | Owner requests payments in M0-M5. | Roadmap must be re-scoped with legal/accounting/payment review. | Owner |
| VF-02 | Verified fact | Trust depends on approved users, verified cleaners, two-way reviews, and admin oversight. | All | `AGENTS.md:37-42`, `BUSINESS.md:138-145`, `TGN.md:153` | High | Preserve in all monetization research. | Any paid boundary weakens trust signals. | Monetization harms core marketplace value. | Owner/product |
| VF-03 | Verified fact | Existing data can support funnel and revenue-proxy analysis before billing. | Owner/operator | Models and architecture cited in section 2 | High | Read-only metric extraction in M1. | Data cannot distinguish city/role/workflow usage. | Add analytics planning before experiments. | Product/data |
| IP-01 | Internal planning input | `action_plan.docx` suggests legal/company/payment and Stripe Connect assumptions. | Owner | `action_plan.docx` sections "3. Legal Matters" and "3.4 Payment Processing" | Low-medium | Legal/accounting/provider review. | Reviewer rejects or modifies assumptions. | Do not use as implementation basis. | Legal/accounting |
| IP-02 | Internal planning input | `action_plan.docx` includes Phase 1 costs, Host Pro, commission, and break-even scenarios. | Owner | `action_plan.docx` sections "4. Phase 1 Costs & Financial Forecast" and "4.6 Financial Forecast" | Low | Validate with real costs, pilots, and current provider pricing. | Actual costs/conversion differ. | Forecast cannot drive build approval. | Owner/finance |
| EST-01 | Estimate | Agreed prices on completed assignments can proxy gross transaction value, not actual paid revenue. | Owner/operator | Roadmap `1116-1118`; marketplace has agreed-price fields | Medium | Query completed assignments and compare to user interviews. | Users do not actually pay agreed amounts. | Revenue proxy overstates economic activity. | Product/data |
| A-01 | Assumption | Core marketplace access must remain free until city liquidity is proven. | Hosts/cleaners/agencies | `BUSINESS.md:21`, roadmap `710-713` | High | Track supply/demand and repeat usage by city. | Free users do not repeat or complete jobs. | Revisit value proposition before paid tests. | Owner |
| A-02 | Assumption | Cleaner basic access fees would risk early supply growth. | Cleaners | Roadmap do-not-build list and research direction | Medium | Cleaner interviews and supply activation metrics. | Cleaners accept paid tools without supply drop. | Optional cleaner tools can be retested later. | Owner/product |
| H-01 | Hypothesis | Host Pro value is operational: calendar automation, templates, backup workflows, reporting, support. | Hosts | Roadmap section 9 and branch A | Medium | Interviews, concierge pilot, fake-door only if approved. | Hosts only value marketplace access. | Do not build Host Pro. | Owner/product |
| H-02 | Hypothesis | Agency Pro value is team/member management and workload visibility. | Agencies | Roadmap branch B; agency delegation exists | Medium | Agency interviews and manual reports. | Agencies do not use delegation/team workflows. | Do not build Agency Pro. | Owner/product |
| H-03 | Hypothesis | Paid add-ons should wait for repeated workflow usage. | Heavy users | Roadmap phase M3-M4 | Medium | Usage analysis and pilot offer tests. | Add-on demand is sporadic. | Keep add-ons out of first model. | Owner/product |
| REC-01 | Recommendation | M1 should prioritize liquidity, trust/retention, and learning before revenue. | Owner | Section 4 reasoning | Medium-high | Owner review. | Owner prioritizes revenue first. | Research plan and stop criteria change. | Owner |
| REV-01 | Requires review | VAT, invoicing, refunds, consumer/business treatment, KYC/KYB, GDPR, ads/referrals, retention, and disputes need qualified review. | All | Roadmap section 12 | High | Legal/accounting/privacy review before implementation. | Review finds blocking obligations. | Delay or reject model. | Legal/accounting/privacy |
| FD-01 | Final decision | No final monetization model, price, or provider is approved in M0. | All | This brief | High | Owner sign-off. | Owner treats hypothesis as final. | Risk of premature build. | Owner |

## 8. Do-not-build list for M0-M5

Do not implement during M0-M5:

- Payment processing.
- Stripe Connect, Adyen, Mangopay, or another marketplace-payment provider.
- Payouts.
- Wallets.
- Platform-held balances.
- Transaction commission.
- Automated invoices.
- Automated subscriptions.
- Billing schemas.
- Entitlement enforcement.
- Cleaner access fees.
- Paid trust or verification.
- Sponsored trust ranking.
- Automated lead charging.

Additional premature technical work identified during review:

- Payment-provider selection or procurement.
- Webhook design for payment, subscription, payout, refund, chargeback, or
  account-verification events.
- Checkout UI.
- Paid feature locks or paywalls.
- Subscription lifecycle tasks.
- Sponsored ranking changes.
- Billing customer records.
- Stored payment methods.
- Tax/VAT automation.
- Advertising pixels before consent and partner governance.

This aligns with the roadmap do-not-build list
(`docs/monetization/MONETIZATION_IMPLEMENTATION_ROADMAP.md:1296-1320`) and
research do-not-build list (`docs/monetization/MONETIZATION_RESEARCH.md:772-780`).

## 9. Legal, accounting, privacy, and operational checkpoints

These are review topics only, not conclusions:

- Bulgarian and EU VAT treatment.
- Invoicing responsibilities.
- Subscription cancellation and refund rules.
- Consumer versus business customer treatment.
- Payment-provider obligations.
- KYC/KYB implications.
- GDPR and consent-aware analytics.
- Advertising and referral disclosures.
- Sponsored-placement disclosure.
- Retention and audit requirements.
- Support and dispute responsibilities.
- Terms of Service boundaries for marketplace role, independent contractor
  status, payment responsibility, moderation, cancellations, refunds, and
  review policy.

No legal or accounting conclusion should be made from `action_plan.docx`. Its
legal/company/payment statements remain internal planning input pending qualified
review.

## 10. M1 entry criteria

M1 should begin only when each criterion is met:

| Criterion | Required evidence |
|---|---|
| Free-core boundary accepted | Owner signs off that section 5 stays free through validation. |
| Monetization priority selected | Owner ranks liquidity, trust/retention, revenue, simplicity, learning, and business-plan readiness. |
| Target cities or clusters approved | Owner names initial city/region focus, or explicitly approves a national research pass. |
| Initial customer segments selected | Owner selects host, agency, cleaner, or mixed interview priority. |
| User or lead data identified | Owner identifies current user/lead lists, export source, or confirms no usable list exists. |
| Competitor categories agreed | Owner accepts direct, adjacent SaaS, home-services marketplace, travel marketplace, and payment-provider categories. |
| Research budget/timebox documented | Owner states budget, timeline, and whether paid incentives are allowed. |
| Evidence-labelling standard accepted | Owner accepts verified fact/internal input/estimate/assumption/hypothesis/recommendation/review/final decision labels. |
| Approval-status mismatch acknowledged | Owner accepts that signup approval mismatch must be resolved before approval-funnel metrics drive monetization decisions. |

Current readiness: **not ready for M1** until owner priorities, target cities,
segments, data availability, research budget/timebox, and approval-status
mismatch handling are confirmed.

## 11. Owner decision checklist

- **OWNER DECISION REQUIRED:** Accept or revise the recommended monetization
  priority order. Recommended default: liquidity, trust/retention, learning
  speed, operational simplicity, business-plan readiness, early recurring
  revenue.
- **OWNER DECISION REQUIRED:** Confirm the free-core boundary in section 5.
  Recommended default: accept it unchanged through M0-M5.
- **OWNER DECISION REQUIRED:** Choose M1 target city or city cluster.
  Recommended default: start with one high-potential cluster rather than
  national research.
- **OWNER DECISION REQUIRED:** Choose initial interview segments. Recommended
  default: portfolio hosts and agencies first, then individual cleaners for
  supply-side risk.
- **OWNER DECISION REQUIRED:** Confirm whether `action_plan.docx` is background
  only or contains owner-preferred assumptions. Recommended default: background
  only until reviewed.
- **OWNER DECISION REQUIRED:** Decide how to handle the signup approval mismatch
  before M1 metrics. Recommended default: document it as a blocker for
  approval-funnel monetization metrics, but not for interviews.
- **OWNER DECISION REQUIRED:** Confirm legal/accounting/privacy reviewers or
  defer paid experiments until reviewers are identified.
- **OWNER DECISION REQUIRED:** Confirm no payment provider, commission, or final
  price should be selected during M0-M5. Recommended default: accept.

## 12. Documentation impact

Do not edit existing product docs during M0 unless the owner explicitly approves
it.

After M0 approval, these docs should eventually be updated:

- `BUSINESS.md`: confirmed monetization priorities, M1 target segment/city, and
  explicit M0 free-core boundary.
- `TGN.md`: any owner-approved monetization invariants or clarified signup
  approval invariant.
- `architecture.md`: future monetization domain boundaries only after a model is
  approved.
- `CURRENT_PROGRESS.md`: M0 completion, owner decisions, and unresolved approval
  mismatch.
- `docs/monetization/MONETIZATION_IMPLEMENTATION_ROADMAP.md`: any owner-approved
  changes to priority order or M1 entry criteria.
- Privacy/cookie documentation: only after analytics, ads, referrals, or
  payment processing are approved.
- ADR: only after a monetization model or significant architecture boundary is
  approved.

## 13. M0 verification checklist

- Marketplace trust invariants are preserved.
- Core marketplace access is not paywalled.
- No assumption is presented as a verified fact.
- No payment implementation is proposed for M0-M5.
- Every M1 entry criterion is measurable or owner-approved.
- No source code, migrations, APIs, frontend files, dependencies, or
  configuration should change for this brief.

## 14. Unresolved questions

- Which city or region should M1 research prioritize?
- Which segment should be interviewed first?
- Does the owner accept the recommended priority order?
- Does the owner accept the free-core boundary unchanged?
- Which `action_plan.docx` assumptions are active owner preferences versus
  background notes?
- Who will provide qualified legal/accounting/privacy review?
- Should the signup approval mismatch be resolved before or after M1 interviews?

## 15. M1 readiness recommendation

Recommendation: **do not begin M1 yet**. The project is ready to prepare M1, but
M1 should start only after the owner confirms the priority order, target cities,
initial customer segments, available user/lead data, research timebox, and
evidence-labelling standard.
