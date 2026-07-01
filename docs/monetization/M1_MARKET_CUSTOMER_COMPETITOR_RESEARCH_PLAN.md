# M1 Market, Customer, and Competitor Research Plan

Status: Phase M1 research plan.  
Date: 2026-07-02.  
Scope: documentation and research planning only.

This document executes Phase M1 planning. It does not implement application
code, migrations, APIs, frontend changes, dependencies, billing, entitlements,
payment-provider selection, commission, pricing, invoices, wallets, payouts,
sponsored ranking, lead charging, or paywalls.

Owner-approved M0 decisions used as constraints:

- Priority order: marketplace liquidity; trust and retention; learning speed;
  operational simplicity; business-plan readiness; early recurring revenue.
- Keep the documented free-core boundary unchanged through M0-M5.
- Initial market focus: Sofia.
- Primary research segment: hosts managing about 4-20 short-term-rental
  properties.
- Secondary segment: cleaning agencies.
- Interview individual cleaners after initial host and agency research to
  validate supply-side risks.
- Treat `docs/monetization/action_plan.docx` as background planning input, not
  approved fact.
- Use an initial two-week research cycle.
- Do not select a payment provider, commission rate, subscription price, or
  billing design.
- The signup approval-status mismatch does not block interviews, but approval
  funnel metrics must not be treated as reliable until the mismatch is resolved.

## 1. Research objectives

M1 must support these decisions:

- Whether Sofia is a viable first liquidity cluster for Host Cleaners.
- Whether Sofia portfolio hosts have repeated operational problems worth
  investigating in M2 willingness-to-pay validation.
- Whether Sofia cleaning agencies have recurring team-management, workload, or
  reporting problems.
- Which alternatives users currently use for cleaner sourcing, scheduling,
  calendar coordination, backup coverage, communication, and reporting.
- Which direct and adjacent competitors provide useful monetization comparisons.
- Which assumptions should proceed to M2 as precise willingness-to-pay
  hypotheses.

M1 does **not** validate final willingness to pay. It prepares M2 by finding
repeated problems, current workarounds, evidence of cost or effort, and candidate
value propositions that are specific enough to test.

## 2. Research questions

Use behavior-first questions. Ask about the last real cleaning, last missed
cleaning, last schedule conflict, last cleaner search, and current tools before
asking about future preferences.

Market and liquidity:

- How concentrated is Sofia STR host demand by neighborhood, property type, and
  guest turnover cadence?
- How often do hosts need cleaning per property per month?
- Are the same cleaners/agencies repeatedly serving the same hosts?
- Where do hosts find cleaners today, and how long does it take?
- Which Sofia districts are hardest to cover?

Portfolio-host operations:

- How many properties does the host manage directly?
- How many cleanings happened in the last 30 days?
- How are calendar events, guest checkouts, and cleaner schedules coordinated?
- What happens when a cleaner cancels, is late, or produces poor-quality work?
- How many backup cleaners are currently available?
- What software, spreadsheets, WhatsApp groups, PMS tools, calendar tools, or
  agency processes are currently used?
- What is currently paid for: software, cleaners, agencies, virtual assistants,
  property managers, ads, or admin help?
- What would make the host continue using Host Cleaners after first contact with
  a reliable cleaner?
- What would make the host bypass the platform?

Agency operations:

- How many cleaners or teams does the agency schedule?
- How are jobs assigned to members today?
- How are late cancellations, substitutions, and quality issues handled?
- What reporting do hosts ask for?
- What information is missing when agencies accept STR work?
- Which team-management or scheduling tools are used now?
- What would make an agency continue using the platform after first contact with
  a host?
- What platform rules would feel fair or unfair?

Cleaner supply risk:

- How do cleaners find recurring STR work today?
- What makes a host or job trustworthy enough to accept?
- What information is required before accepting or applying?
- What makes cleaners prefer direct relationships outside a platform?
- Which platform fees or paid boundaries would reduce participation?

Trust and paid-boundary sensitivity:

- Which verification signals matter most for hosts, agencies, and cleaners?
- What review, issue-reporting, and dispute signals feel necessary?
- Which workflows must stay free for the marketplace to feel fair?
- Which operational problems might justify a paid tool later?

## 3. Target participant profiles

Sample sizes below are planning recommendations, not statistically
representative samples.

| Segment | Recommended sample | Minimum acceptable | Recruitment criteria | Disqualification criteria | Recruitment channels |
|---|---:|---:|---|---|---|
| Sofia portfolio hosts | 8-12 | 5 | Manage 4-20 Sofia STR properties; recurring turnover cleaning; decision authority or strong influence | No Sofia properties; no STR operations; no role in cleaner sourcing, scheduling, or budget | Existing leads/users, STR Facebook groups, Airbnb/Booking host communities, property-manager referrals, local host meetups |
| Sofia cleaning agencies | 5-8 | 3 | Sofia or Sofia-serving; multiple cleaners; STR/property-management clients; scheduling or reporting responsibility | No team scheduling; no Sofia coverage; only one-off residential cleaning | Existing agency contacts, Google Maps/local search, Facebook business pages, property-manager referrals |
| Individual cleaners | 6-10 | 4 | STR-experienced cleaner serving Sofia; recurring turnover work; direct host or agency experience | No STR cleaning; no recurring work; no Sofia coverage | Existing cleaner users, agency member referrals, cleaner Facebook groups, community referrals |
| Small-host comparison | 3-5 | 2 | Sofia hosts with 1-3 STR properties; recurring or seasonal cleaning need | No active STR properties; no cleaning coordination role | Existing leads, host groups, referrals |

Recruit portfolio hosts and agencies first. Start cleaner interviews after early
host/agency patterns are visible so cleaner questions can test supply-side risks
instead of guessing.

## 4. Interview plan

Interview rules:

- Ask about past behavior before opinions.
- Anchor questions to dates, counts, tools, and recent incidents.
- Do not ask "Would you pay for Host Pro?"
- Do not suggest the desired feature before understanding the workflow.
- Capture exact phrases when participants describe pain, trust, bypass, or
  workflow cost.

### Scoring framework

Score each interview 1-5 on these dimensions:

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| Frequency | Rare or one-off | Monthly or seasonal | Weekly or multiple times per month |
| Severity | Mild inconvenience | Noticeable admin burden | Guest/check-in/revenue risk or repeated failure |
| Workaround cost | Informal and cheap | Time-consuming but tolerable | Paid labor, lost time, cancellations, or quality risk |
| Budget owner clarity | No clear owner | Shared or informal owner | Clear decision maker and budget |
| Trust sensitivity | Low | Some verification/review concern | Verification, reliability, and issue handling are critical |
| Bypass likelihood | Would leave after intro | Mixed | Needs ongoing operational value to stay |
| Ongoing-platform value | Initial matching only | Occasional coordination value | Recurring operational workflow value |

Strong M2 candidate: average score >= 4 across frequency, severity, workaround
cost, budget owner clarity, and ongoing-platform value, with trust risk not
increased by the candidate paid boundary.

Weak M2 candidate: the participant only says a feature "sounds useful" but
cannot describe recent behavior, current workaround, cost, frequency, or owner.

### Portfolio host guide

Screening questions:

- How many short-term-rental properties do you manage in Sofia?
- Are you personally responsible for cleaner sourcing, scheduling, or budget?
- How many cleanings happened across your Sofia properties in the last 30 days?
- Which booking channels or calendar tools do you use?

Core questions:

- Walk me through the last turnover cleaning from guest checkout to cleaner
  completion.
- How did the cleaner know the time, address, access details, and required work?
- What tools did you use for calendar coordination?
- Tell me about the last time a cleaner cancelled, was late, or did poor work.
- What did you do to recover?
- How many backup cleaners can you call today?
- How do you currently find a new cleaner?
- What do you pay for today to manage cleaning operations or property turnover?
- What makes you keep using a tool or platform after you already know the
  cleaner?
- What makes you move the relationship to WhatsApp, phone, or a spreadsheet?
- Which trust signals do you check before using a new cleaner?

Follow-up probes:

- How often did that happen in the last 90 days?
- How many messages or calls did it take?
- Who else was involved?
- What was the consequence for the guest or property?
- Did you pay anyone or use paid software to solve it?
- What did you try before the current workaround?

Evidence to capture:

- Property count, districts, monthly cleanings, current tools, communication
  channels, backup count, incident frequency, current spending categories,
  decision authority, exact retention/bypass reasons.

Weak-answer indicators:

- Cannot name a recent incident.
- Has one trusted cleaner and no recurring coordination pain.
- Uses the platform only for occasional first introductions.
- No budget authority or influence.

Strong-pain indicators:

- Multiple monthly turnover cleanings.
- Recurring backup cleaner problem.
- Frequent calendar/manual message workload.
- Paid or labor-intensive workaround.
- Clear reason to keep coordination on-platform after first contact.

### Agency guide

Screening questions:

- Does your agency serve Sofia STR or property-management clients?
- How many cleaners or teams are scheduled by the agency?
- Who assigns work to members?
- Do hosts ask for reports, confirmations, or proof of completion?

Core questions:

- Walk me through the last Sofia STR job from host request to cleaner assignment.
- How do you choose which cleaner or team gets the job?
- What tools do you use for member scheduling?
- What happens when the assigned cleaner becomes unavailable?
- How do you communicate with hosts before and after work?
- What reports or proof do hosts expect?
- What mistakes or delays happen repeatedly?
- How do you track member workload or reliability?
- What would make your agency continue using a platform after meeting a host?
- What would make you bypass it?

Follow-up probes:

- How often do substitutions happen?
- How do you prevent double-booking?
- Who owns client communication?
- What is hard to see across the team?
- What do you already pay for to manage operations?

Evidence to capture:

- Team size, Sofia coverage, STR client count, scheduling method, reporting
  process, substitution frequency, member workload visibility, current tools,
  buyer/user roles.

Weak-answer indicators:

- Agency does not schedule multiple cleaners.
- No STR-specific workflow.
- Work is mostly one-off residential cleaning.
- No recurring reporting or team-coordination problem.

Strong-pain indicators:

- Repeated member scheduling conflicts.
- Host reporting burden.
- Manual workload tracking.
- High substitution need.
- Clear value in team operational tooling.

### Individual cleaner guide

Screening questions:

- Do you clean short-term-rental properties in Sofia?
- Do you work directly with hosts, agencies, or both?
- How many STR cleanings did you do in the last 30 days?
- How do you receive schedules and job details today?

Core questions:

- Walk me through your last STR cleaning job.
- How did you get the job?
- What information was missing or unclear?
- How do you decide whether to accept a new host or job?
- What makes a host trustworthy?
- What happens when schedules change?
- How do you avoid double-booking?
- How do you prefer to build repeat work?
- What platform rules or fees would make you stop participating?
- What support or tools would help without reducing your earnings?

Follow-up probes:

- How often are job details wrong or late?
- How many hosts/agencies contact you directly?
- Do reviews or verification help you get work?
- How do you handle payment expectations off-platform?

Evidence to capture:

- Work frequency, sourcing channel, trust criteria, schedule-change frequency,
  direct relationship preference, fee sensitivity, supply-side risk signals.

Weak-answer indicators:

- No recurring STR work.
- No Sofia coverage.
- Platform participation would only be for occasional extra jobs.

Strong-pain indicators:

- Repeated schedule confusion.
- Desire for reliable recurring work.
- Clear trust criteria.
- Strong objection to basic-access fees.

### Small-host comparison guide

Screening questions:

- How many Sofia STR properties do you manage?
- How often do cleanings happen in a typical month?
- Who coordinates cleaners?

Core questions:

- Walk me through your last cleaning.
- How did you find your current cleaner?
- What happens if they are unavailable?
- What tools do you use?
- What is harder or easier compared with larger hosts you know?
- Would you keep using a platform after finding a cleaner? Why or why not?

Evidence to capture:

- Frequency, backup risk, current workaround, whether pain differs from
  portfolio hosts.

Weak-answer indicators:

- Very low cleaning frequency.
- Informal trusted cleaner solves the workflow.

Strong-pain indicators:

- Small host still has recurring backup/scheduling pain.

## 5. Competitor research framework

Classify competitors by tier:

- **Direct:** vacation-rental cleaning workflow platforms that connect or manage
  hosts/cleaners around turnover cleaning.
- **Adjacent:** vacation-rental operational SaaS, property-management tools,
  calendar tools, horizontal service marketplaces, and travel marketplaces that
  inform monetization or trust patterns but do not directly match the workflow.
- **Aspirational:** mature platforms with useful packaging, trust, or operations
  patterns that Host Cleaners is not directly competing with today.
- **Substitutes:** WhatsApp, phone calls, Google Calendar, spreadsheets, Facebook
  groups, direct cleaner relationships, property managers, and local agencies.

Research categories:

- Direct vacation-rental cleaning workflow platforms.
- Vacation-rental operational SaaS.
- Bulgarian cleaning marketplaces and agencies.
- Horizontal service marketplaces.
- Property-management and calendar tools.
- Communication and spreadsheet alternatives.

For every competitor or substitute capture:

| Field | Required capture |
|---|---|
| Name | Company/tool/source |
| Tier | Direct, adjacent, aspirational, substitute |
| Category | One of the research categories above |
| Target segment | Host, agency, cleaner/provider, property manager, traveler, general consumer |
| Geography | Bulgaria, Sofia, EU, US, global, unknown |
| Core workflow | What job the product/tool handles |
| Pricing model | Subscription, freemium, commission, lead fee, ads, referral, custom, none, unknown |
| Free tier | What is free, if public |
| Paid boundaries | What becomes paid |
| Trust model | Verification, reviews, insurance, guarantees, moderation, unknown |
| Payment handling | Off-platform, managed payments, invoices, wallet/payout, unknown |
| Cleaner/provider fees | None, subscription, lead fee, commission, unknown |
| Agency/team functionality | Present, absent, partial, unknown |
| Bypass controls | Messaging limits, payment lock-in, value-added workflow, none, unknown |
| Strengths | Evidence-backed strengths |
| Weaknesses | Evidence-backed weaknesses or limitations |
| Relevance to Host Cleaners | What decision it informs |
| Sources | URLs/titles with access date and limitations |

Do not treat Airbnb, Booking.com, or large home-service marketplaces as direct
competitors. They may be adjacent comparisons for trust, review, fee, and host
ecosystem patterns.

Initial competitor/source candidates to research, not final conclusions:

- Direct/near-direct: Turno and other vacation-rental cleaning workflow tools.
- Adjacent vacation-rental SaaS: Smoobu, Lodgify, Guesty, Hostaway, Hospitable.
- Bulgarian cleaning agencies/marketplaces: Sofia-area cleaning agencies,
  local cleaning directories, Google Maps-listed agencies, Facebook pages.
- Horizontal marketplaces: Taskrabbit, Thumbtack, Upwork/local freelancer
  alternatives where relevant.
- Property-management/calendar tools: Google Calendar, Airbnb/Booking iCal,
  PMS/channel managers.
- Substitutes: WhatsApp, Viber, phone calls, spreadsheets, Facebook groups,
  direct referrals.

## 6. Source-quality rules

Every external claim must be captured in a source register with:

- URL or source title.
- Publisher or owner.
- Publication date or access date.
- Geography.
- Primary or secondary source.
- Confidence level: high, medium, low.
- Limitations.
- Claim supported.
- Evidence label: verified fact, estimate, inference, recommendation.

Preferred sources:

- Official pricing pages.
- Official product documentation.
- Bulgarian institutional data.
- Eurostat.
- Recognized industry reports.
- Official company materials.

Rules:

- Do not invent Sofia market size, host count, cleaner count, competitor
  traction, conversion rates, revenue, or pricing.
- Do not use a single secondary source as proof for a major claim.
- Treat unavailable pricing as "not publicly disclosed" rather than guessing.
- Use access date for all webpages.
- Record geography carefully; US or global competitor pricing may not transfer
  to Sofia.
- Record source limitations beside every numeric claim.

## 7. Existing internal data inventory

Useful current repository/database data for M1:

- Users by role and city.
- Account status and approval state, with caveat below.
- Approved and verified cleaners.
- Host, cleaner, and agency profiles by city/service area.
- Properties by city and neighborhood.
- Calendar connections and imported reservations.
- Cleaning jobs by status, city, schedule, and property.
- Applications by job, cleaner, origin, and status.
- Assignments, assigned cleaner or agency member, agreed price, and completion
  timestamps.
- Completed jobs and repeat host activity.
- Agreed-price values as revenue proxies, not actual paid revenue.
- Agency invitations and memberships.
- Favourite cleaners.
- Connections and messages.
- Notifications.
- Review counts, ratings, and private issue frequency.
- Audit events and support-relevant admin actions.

M1 will not write production queries, change analytics code, or add tracking.
Any internal data work should be read-only and treated as directional until
validated with participants.

Signup approval-status caveat:

- The M0 brief records a mismatch between docs that say new users start pending
  and current signup behavior/tests that indicate approved signup users.
- Role, city, property, job, application, assignment, completion, review,
  message, notification, and agreed-price data remain useful with ordinary data
  quality checks.
- Approval-funnel metrics are not reliable for M1 decision-making until the
  mismatch is resolved.

## 8. Research execution tracker

### Participant recruitment

| Participant ID | Segment | Name/company | Contact source | Sofia relevance | Property/team count | Status | Owner | Notes |
|---|---|---|---|---|---:|---|---|---|
| P-001 | Portfolio host |  |  |  |  | Not contacted | Owner |  |

Statuses: not contacted, contacted, screened, scheduled, interviewed,
declined, no response, disqualified.

### Interview scheduling

| Participant ID | Segment | Interviewer | Date/time | Channel | Consent to notes? | Completed? | Follow-up needed |
|---|---|---|---|---|---|---|---|
| P-001 | Portfolio host |  |  |  |  |  |  |

### Interview notes

| Field | Notes |
|---|---|
| Participant ID |  |
| Segment |  |
| Role/decision authority |  |
| Current workflow |  |
| Last relevant incident |  |
| Frequency evidence |  |
| Severity evidence |  |
| Current tools/spending |  |
| Trust expectations |  |
| Bypass reasons |  |
| Ongoing-platform value |  |
| Strong quotes |  |
| Weak-answer indicators |  |
| Scores | Frequency / severity / workaround cost / budget owner / trust / bypass / ongoing value |
| Follow-up |  |

### Assumption evidence

| Assumption ID | Assumption | Evidence found | Evidence type | Supports or weakens? | Confidence | Next action |
|---|---|---|---|---|---|---|
| H-01 | Portfolio hosts have recurring backup-cleaner pain |  | Interview / source / internal data |  |  |  |

### Competitor findings

| Candidate | Tier | Category | Geography | Pricing model | Free tier | Paid boundary | Trust model | Payment handling | Team features | Sources | Relevance |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Turno | Direct/near-direct candidate | Vacation-rental cleaning workflow |  |  |  |  |  |  |  |  |  |

### Source register

| Source ID | URL/title | Publisher | Date/accessed | Geography | Primary/secondary | Claim supported | Confidence | Limitations |
|---|---|---|---|---|---|---|---|---|
| S-001 |  |  | 2026-07-02 |  |  |  |  |  |

### Unresolved questions

| ID | Question | Blocking M1? | Owner/researcher | Next step |
|---|---|---|---|---|
| U-001 | Which host contact list is available? | Yes | Owner | Confirm source |

### Contradiction log

| ID | Claim A | Claim B | Sources | Impact | Resolution path |
|---|---|---|---|---|---|
| C-001 | Signup starts pending | Signup creates approved users | M0 brief sources | Approval-funnel metrics unreliable | Product decision outside M1 |

## 9. Success and stop criteria

M1 succeeds when:

- Sofia portfolio-host and agency segments are evidence-backed or explicitly
  rejected.
- Repeated operational pain is confirmed or rejected.
- Current alternatives and spending categories are understood.
- Competitor monetization boundaries are documented with source-quality fields.
- M2 hypotheses can be stated precisely.
- Cleaner supply-side risks are identified before any paid boundary is tested.
- The M2 recommendation is based on behavior evidence, not polite feature
  interest.

Stop or reconsider M1 when:

- Suitable Sofia participants cannot be recruited.
- Users do not repeat the core workflow often enough.
- Sofia supply and demand appear too fragmented.
- Operational problems are too infrequent.
- Users only value the first introduction and have no reason to keep using the
  platform.
- Available evidence cannot support a target segment.
- Paid-boundary ideas appear to threaten liquidity, trust, verification,
  ratings, reviews, or safety.

## 10. M2 entry gate

M2 willingness-to-pay validation can begin only if M1 produces evidence for:

- Repeated problem frequency: the problem occurs at least monthly for the target
  segment, or with enough severity to justify urgent action.
- Measurable cost or effort: time, money, missed cleanings, guest risk,
  coordination burden, agency admin load, or current software/service spend.
- Identifiable budget owner: the person or business responsible for buying or
  approving a solution is known.
- Ongoing operational value: users have a reason to keep using the platform
  after first contact.
- Clear candidate value propositions: at least one specific operational problem
  maps to a specific candidate value proposition.
- No unacceptable liquidity or trust risk: the candidate paid boundary does not
  restrict the free core or weaken verification, reviews, ratings, safety, or
  cleaner supply.
- Source-backed competitor context: direct and adjacent monetization boundaries
  are documented.

M2 cannot begin merely because users say a feature sounds useful. M2 requires
behavior evidence, current workaround evidence, and a testable value
proposition.

## 11. Immediate two-week execution backlog

### Week 1 - setup, recruiting, and first evidence

Owner tasks:

- Provide Sofia portfolio-host contact list or recruiting channels.
- Provide Sofia agency contact list or recruiting channels.
- Confirm whether participant incentives are allowed.
- Confirm interview consent wording and note-taking expectations.
- Confirm who will conduct interviews.
- Confirm any internal user/lead data available for read-only review.

Codex/research-prep tasks:

- Finalize interview scripts from section 4.
- Prepare tracker copies from section 8.
- Prepare competitor candidate list by tier and category.
- Prepare source register template.
- Prepare internal data inventory checklist.
- Prepare short recruitment messages for each segment.

Recruitment tasks:

- Contact 15-25 portfolio-host candidates to target 8-12 interviews.
- Contact 10-15 agency candidates to target 5-8 interviews.
- Start cleaner candidate list, but schedule cleaner interviews after host/agency
  patterns begin to emerge.
- Identify 5-8 small-host candidates for comparison.

Competitor research tasks:

- Research direct/near-direct vacation-rental cleaning workflow platforms.
- Research adjacent vacation-rental operational SaaS pricing and paid
  boundaries.
- Build initial Bulgarian cleaning agency/marketplace candidate list.
- Record every source in the source register.

Interview tasks:

- Complete at least 3 portfolio-host interviews and 1 agency interview if
  scheduling allows.
- Score each interview within 24 hours.
- Log contradictions and weak evidence immediately.

### Week 2 - interviews, competitor completion, synthesis

Owner tasks:

- Continue outreach where sample targets are short.
- Attend or review interview synthesis.
- Decide whether to extend recruiting if minimum samples are not met.

Codex/research-prep tasks:

- Organize interview notes into evidence themes.
- Maintain assumption evidence table.
- Maintain contradiction log.
- Prepare M2 gate recommendation draft.

Interview tasks:

- Complete remaining portfolio-host and agency interviews.
- Conduct cleaner interviews to validate supply-side risks.
- Conduct small-host comparison interviews if time allows.
- Score all interviews using the 1-5 framework.

Competitor research tasks:

- Complete competitor/source register for selected direct and adjacent
  candidates.
- Label Airbnb, Booking.com, and large home-service marketplaces as adjacent
  comparisons if used.
- Record pricing and paid boundaries only from sources, without guessing.

Synthesis tasks:

- Identify repeated operational pains.
- Identify current alternatives and spending categories.
- Identify trust and bypass risks.
- Identify candidate M2 hypotheses and reject weak ones.
- Prepare final M1 readout: proceed to M2, extend M1, or stop/reconsider.

Final decision meeting:

- Review whether Sofia remains the first target cluster.
- Review whether portfolio hosts remain the primary segment.
- Review whether agencies remain secondary.
- Review whether cleaner supply risks block any paid-boundary hypothesis.
- Decide whether M2 can begin under the gate in section 10.

## 12. Verification checklist

- M0 constraints remain preserved.
- The unchanged free-core boundary remains free through M0-M5.
- No payment provider, commission rate, subscription price, or billing design is
  selected.
- Direct competitors are separated from adjacent comparisons.
- Interview questions ask about real past behavior and current workflows.
- Numeric sample sizes are labelled as planning recommendations, not
  statistically representative.
- Market and competitor claims require sources and limitations.
- M2 cannot begin merely because users say a feature sounds useful.
- No source code, migrations, APIs, frontend files, dependencies, configuration,
  billing files, or monetization functionality should change for M1.

## 13. Information that must come from real participants

Codex cannot determine these from repository files:

- Actual Sofia portfolio-host cleaning frequency.
- Current cleaner sourcing channels and backup reliability.
- Real cancellation, lateness, and quality-issue frequency.
- Calendar and messaging workload.
- Current spending on software, agencies, property managers, cleaners, or admin
  help.
- Agency member scheduling pain and reporting burden.
- Cleaner sensitivity to platform rules or fees.
- Actual reasons users would keep using or bypass Host Cleaners after first
  contact.

These must be learned through owner-led recruiting, interviews, and source-backed
research.
