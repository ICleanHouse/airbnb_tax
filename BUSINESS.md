# Business Strategy

## Restart Handoff

Machine hosting work is paused for a required Windows restart so Docker Desktop can run. See `CURRENT_PROGRESS.md` for the deployment resume point.

## Business Concept

The product is a Bulgarian-market marketplace that connects short-term rental hosts with verified cleaners and cleaning agencies.

The core idea is simple: hosts need reliable turnover cleaning around guest reservations, and cleaners need a clear way to find available work, manage their calendar, and build reputation. The app should reduce coordination through shared calendars, job posting, cleaner applications, assignment tracking, and two-way feedback.

The first version is not a payment platform. It helps both sides find each other, agree on the work, coordinate the schedule, and build trust.

The public website should first explain the service and collect early host/cleaner interest. The logged-in marketplace tools should come after the landing page and authentication flow.

## Target Market

The initial market is Bulgaria, with support for Bulgarian and English and pricing displayed in EUR.

The app should be available across Bulgaria, but marketplace liquidity should be built city by city or region by region through verified local cleaner and agency clusters. National availability should not imply equal cleaner coverage everywhere from day one.

Important market contexts:

- Short-term rental hosts often manage tight turnover windows.
- Many cleaning arrangements are informal and depend on manual calendar sharing.
- Trust, punctuality, and communication are more important than only finding the lowest price.
- Seasonal demand can be high in resort areas and uneven in smaller cities.

## User Segments

Primary host segment:

- Small and mid-sized hosts managing roughly 1-20 properties.
- Hosts who currently coordinate cleanings manually through phone calls, messages, spreadsheets, or shared calendars.
- Hosts who need backup cleaner options when their usual cleaner is unavailable.

Cleaner segments:

- Individual cleaners who want recurring short-term rental cleaning jobs.
- Cleaning agencies that can cover several properties, cities, or higher-volume host accounts.
- Existing trusted cleaners who can join the platform as verified supply.

Agency segment:

- Agencies have their own user account and agency profile.
- Cleaners who work for an agency still have separate cleaner user accounts and their own calendars.
- Agencies invite cleaners into their group, and cleaners accept the invitation from their own account.
- After an agency wins or receives a job, the agency can assign that work to an active member cleaner calendar.

Admin segment:

- Internal operators who approve cleaners, inspect marketplace activity, handle disputes, moderate reviews, and support users.
- Internal operators also approve or reject new user accounts before full marketplace rights are enabled.

## Core Problems

Hosts need:

- A reliable way to post single cleaning jobs or an entire month of cleanings.
- Visibility into cleaner availability.
- Backup options when their regular cleaner is unavailable.
- Clear records of who applied, who was assigned, and what happened.
- Shared calendar coordination around check-in and check-out times.
- Confidence that cleaners are verified and reviewed.

Cleaners and agencies need:

- A clear pipeline of available work.
- Calendar visibility before accepting jobs.
- A way to build reputation through completed work and feedback.
- Protection from unclear host expectations or poorly managed properties.
- Simple communication and job details in one place.

The platform needs:

- Enough host demand and cleaner supply in the same areas.
- Trust and quality controls before scaling too broadly.
- Simple workflows that do not add more admin work than they remove.
- Clear account approval, suspension, and support states so marketplace access can be controlled manually during the MVP.

## Value Proposition

For hosts:

- Post one cleaning or a monthly cleaning batch.
- Let verified cleaners and agencies apply.
- Share calendar context without manually duplicating every event.
- Track assignments and completed work.
- Build a trusted network through reviews and repeat usage.

For cleaners and agencies:

- Find relevant cleaning jobs in one place.
- Apply only when available.
- Build visible reputation.
- Manage recurring opportunities with hosts.
- Reduce scheduling confusion through shared calendars.

For the marketplace:

- Create trust through verification, reviews, admin oversight, and transparent job history.
- Start simple, then add deeper operational tools only after the main coordination problem is proven.

For public website visitors:

- Quickly understand that the service is for Airbnb/short-term rental turnover cleaning in Bulgaria.
- Choose whether they are a host or cleaner.
- Indicate city, timing, and rough demand/capacity.
- Move toward early access without seeing an internal operations dashboard first.

## Marketplace Model

The MVP marketplace flow should remain:

1. Host creates a property.
2. Host connects or imports calendar data where relevant.
3. Host posts a single cleaning job or a monthly batch.
4. Approved and verified cleaners, or approved agencies, apply.
5. Host accepts one cleaner or agency for the job.
6. If an agency is accepted, the agency assigns the work to an active member cleaner.
7. Both sides coordinate and complete the cleaning.
8. Both sides leave feedback after completion.

Business rules to preserve:

- New signups start as pending accounts and can log in only for onboarding until admin approval.
- Approved property owners can post jobs and batches.
- Cleaners must be verified before applying.
- Agencies must be approved before applying or assigning work.
- Hosts choose who to assign.
- A job can have only one accepted cleaner assignment.
- Price may be proposed or agreed in the app, but payment happens outside the platform in v1.
- Reviews are two-way and only available after completed jobs.
- Admins need access to marketplace history for moderation and support.

## Trust and Quality

The main trust promise is verified and reviewed supply.

Trust should come from:

- Manual account, cleaner, and agency approval before marketplace access.
- Agency membership invitations that the cleaner accepts from their own account.
- Two-way reviews after completed jobs.
- Admin-visible application and assignment history.
- Private issue reporting.
- Dispute visibility for internal operators.
- Clear cleaner profiles, service areas, and availability.

Signup and verification direction:

- V1 uses email confirmation and admin approval after signup. Pending users can log in, complete onboarding, and wait for approval.
- Email confirmation is implemented through a confirmation link sent during signup. SMS code verification remains a future step.
- V1 web authentication uses secure Django session cookies with CSRF protection. JWT or OAuth can be revisited if native mobile apps, third-party API clients, or social sign-in become near-term requirements.
- Google and Apple signup buttons may appear in the UI as placeholders, but OAuth is not connected yet.

Cookie and customer insight policy:

- Essential cookies are required for login, CSRF protection, and account security.
- Analytics and marketing cookies require explicit consent before use.
- Consent records should store consent version, policy version, choices, timestamp, and either the user or anonymous visitor identifier.
- Cookie data should be used to understand product usage and customer behavior without weakening trust or GDPR-conscious data minimization.

Avoid positioning the product mainly as the cheapest cleaning option. For this market, reliability and coordination quality are stronger differentiators.

## Launch Strategy

The product should support all Bulgaria from the beginning, but growth should focus on areas where there is enough host demand and verified cleaner supply.

Suggested launch approach:

- Start with known hosts and cleaners from existing real operations.
- Add verified cleaners and agencies in cities or regions where host demand exists.
- Encourage hosts to import calendars and post real monthly cleaning demand.
- Use manual admin review early to understand quality issues before automating too much.
- Track where jobs are posted but not filled, then recruit supply in those areas.

Current public-site direction:

- The first page is a landing page inspired by modern marketplace design patterns.
- It should feel trustworthy, clean, and service-focused, with a white/coral visual direction rather than an internal admin dashboard.
- The dashboard and operational tools should be introduced after login, not as the first public impression.

Potential early regions:

- Sofia.
- Plovdiv.
- Varna and Burgas.
- Bansko and other seasonal rental areas.
- Other cities where existing host demand appears.

## Monetization Hypotheses

Monetization is not finalized.

The current early hypothesis is to keep the marketplace useful first and consider non-intrusive advertisements later if there is enough traffic. Ads should not interfere with trust, scheduling, cleaner selection, or the core workflow.

Possible future monetization options:

- Non-intrusive ads relevant to hosts, cleaners, property maintenance, supplies, and short-term rentals.
- Host subscription for advanced scheduling, calendar automation, and marketplace access.
- Cleaner or agency subscription for enhanced profile visibility or business tools.
- Lead or referral fees for successful introductions.
- Commission per completed cleaning in a future version, only if payment processing and invoicing become part of the product.

Do not treat any monetization model as final until validated with users and marketplace behavior.

## Success Metrics

Primary MVP success signal:

- Registered users, separated by hosts, cleaners, agencies, and admins.
- Account approval funnel: pending, approved, rejected, and suspended users by role.

Secondary signals:

- Landing page visits and visitor-to-lead conversion.
- Host versus cleaner audience selection.
- Cities selected in the lead/search form.
- Month/timeframe selected in the lead/search form.
- Number of verified cleaners and agencies.
- Number of agency invitations sent, accepted, declined, or expired.
- Number of active agency-cleaner memberships.
- Cookie consent choices and analytics opt-in rate.
- Number of properties added.
- Number of connected or imported calendars.
- Number of posted cleaning jobs.
- Number of monthly batches created.
- Application rate per open job.
- Assignment rate per posted job.
- Completed cleanings.
- Repeat host usage.
- Review completion rate.
- Average ratings and private issue frequency.
- Jobs posted in areas with no available supply.

The business should be careful not to overvalue registrations if users do not post jobs, apply, or complete cleanings.

## Risks and Open Questions

Marketplace liquidity:

- Can enough verified cleaners and agencies be available in the same areas where hosts post jobs?
- Should the business prioritize cities with real demand instead of broad national marketing?

Trust and quality:

- What should cleaner verification include: identity, references, interview, trial job, agency documents, or manual approval only?
- How should poor reviews, repeated cancellations, or disputes affect visibility?

Host adoption:

- Will hosts import calendars and post monthly demand, or will they only use the app when they have a problem?
- What onboarding is needed for hosts already using Google Calendar manually?

Cleaner adoption:

- Do cleaners prefer SMS, email, in-app notifications, or messaging apps?
- What makes cleaners apply reliably instead of staying with informal arrangements?

Monetization:

- Will ads create enough revenue without damaging trust?
- Would hosts pay for subscription features once the calendar and marketplace are valuable?
- Should agencies pay for access, better placement, or operational tools?

Operations:

- How much admin work is required to verify supply and handle disputes?
- What support process is needed when a cleaner cancels close to check-in time?
- How much admin work is required to approve all signup categories after email confirmation is complete?
- What verification details should agencies provide before they can invite cleaners and accept jobs?

## Business Decisions Locked So Far

- Filename is `BUSINESS.md`.
- Initial market is Bulgaria.
- Currency is EUR.
- UI should support Bulgarian and English.
- Public first page should be a landing page for the service, not a logged-in dashboard.
- Visual direction should be marketplace-friendly and inspired by Airbnb-style clarity, without copying Airbnb branding.
- The first target host segment is small and mid-sized hosts with roughly 1-20 properties.
- Cleaner supply should include verified individual cleaners and agency partnerships.
- Agencies have their own user accounts; cleaners who work for agencies remain separate cleaner users with their own calendars.
- New users start pending and need admin approval before posting jobs, applying, or assigning agency work.
- V1 authentication uses Django session cookies with CSRF protection.
- New users receive an email confirmation link during signup.
- Cookie consent is consent-first: only essential cookies are enabled before opt-in.
- The marketplace should be available across Bulgaria while building practical local supply clusters.
- The main trust promise is verified and reviewed cleaners/agencies.
- The primary MVP business success signal is registered users.
- Secondary metrics should still track job posting, assignment, completion, repeat usage, and reviews.
- Monetization is undecided.
- Ads are a possible non-intrusive later experiment, not a required v1 feature.
- Subscription or other monetization models may be explored later.
- No in-app payments are included in v1.
