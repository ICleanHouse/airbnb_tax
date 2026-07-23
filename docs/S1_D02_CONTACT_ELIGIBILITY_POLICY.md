# S1-D02 Contact Eligibility and Account Safety Policy

**Status:** approved
**Last reviewed:** 2026-07-23
**Architecture dependency:** [ADR-0002](adr/0002-contact-based-verification.md) — accepted
**Accountable owner:** Repository owner
**Approval reference:** Explicit owner approval in the Codex conversation on 2026-07-23

This file is the approved Stage 1 policy for host, cleaner, agency, and agency
member eligibility. It completes S1-D02 as a product decision. It does not mark
S1-E02 complete: EEA phone OTP, all-role age handling, contact-change recovery,
exceptional restoration, pending-account expiry, and the scoped badge still
require implementation and release evidence.

## Eligibility standard

Stage 1 uses **contact eligibility**, not identity or service-quality vetting.

- Every human account holder must be at least 18. This includes hosts,
  individual cleaners, the human representative operating an agency account,
  and every delegated agency member.
- Signup collects the account holder's self-declared birth date and rejects an
  under-18 submission before an account or role profile is created.
- Live marketplace access requires confirmed email and confirmed phone.
- Phone verification accepts normalized E.164 mobile numbers from EEA
  countries.
- Cleaners do not complete an identity-document review, interview, reference
  check, trial job, or manual quality review.
- Agencies do not complete a company-registry, representative-authority,
  insurance, reference, or manual capability review.
- Every delegated member must qualify through their own separate cleaner
  account. Agency eligibility never substitutes for member eligibility.
- No ID image, document number, reference contact, interview note, trial-job
  evidence, or separate verification registry is collected.

The no-copy rule follows data minimization and the Bulgarian rule that an
identity document may be copied only when legislation provides a legal basis:
[Bulgarian Personal Data Protection Act, Article 25d](https://cpdp.bg/en/legislation/personal-data-protection-act/)
and [GDPR Article 5](https://eur-lex.europa.eu/eli/reg/2016/679/2016-05-04/eng).

## Badge and public claim

- The visible English badge is **“Verified”**. The Bulgarian badge is
  **“Потвърден”**.
- The badge appears only when both `email_verified_at` and
  `phone_verified_at` exist. Public directory eligibility still additionally
  requires the existing active, approved, and stored cleaner-eligibility
  states.
- The badge's policy, help/tooltip, and accessible description define its
  scope: email and phone are confirmed; identity, references, interview,
  trial-job performance, and service quality were not checked.
- The badge must never be labelled or described as identity verification,
  background checking, quality certification, or a guarantee of performance.
- Email-only interim accounts continue to use “Email-confirmed marketplace
  profile” or “Marketplace access active” and do not receive the badge.

Approved explanatory copy:

- EN: **“Email and phone confirmed. Identity and service quality have not been
  checked.”**
- BG: **“Имейлът и телефонът са потвърдени. Самоличността и качеството на
  услугата не са проверени.”**

## State and authority contract

1. Signup persists the safest base state: account `pending` and, for a cleaner,
   legacy cleaner status `pending`.
2. Reconciliation automatically advances a qualifying account to `approved`
   after the stored email and phone timestamps exist. There is no manual
   approval or vetting step.
3. The same reconciliation moves a cleaner to the stored legacy `verified`
   status. That internal value means contact-based marketplace eligibility
   only.
4. Account state is the single enforcement state for every role. Cleaner
   rejection, suspension, and restoration do not require a second
   cleaner-profile decision.
5. The repository owner, acting as platform admin, may:
   - reject a pending account for a confirmed eligibility, integrity, safety,
     or policy issue;
   - suspend a pending or approved account immediately for safety, abuse,
     contact-security, or policy reasons; and
   - restore a suspended account after a documented review resolves the issue.
6. A restored account returns to `approved` only when its current email, phone,
   and age prerequisites remain satisfied. Otherwise it returns to `pending`.
7. Rejected accounts remain terminal. Reconciliation never silently restores a
   rejected or suspended account.

Structured neutral reason categories are:

- `age_requirement`
- `account_integrity`
- `marketplace_safety`
- `terms_or_policy_breach`
- `contact_security`
- `operator_support`

The category is required. A bounded internal note is optional, restricted to
the owner-admin, and never copied into public or ordinary user responses.

## Contact re-verification and uniqueness

- There is no calendar-based periodic re-review in Stage 1.
- Changing email or phone clears the corresponding confirmation timestamp and
  locks live marketplace actions until the changed contact is confirmed.
- A phone change requires an authenticated password re-entry, reconfirmed
  email, and OTP on the new number. The old number remains reserved until the
  new number succeeds or the change is cancelled.
- One normalized verified phone number may belong to only one retained
  non-admin account across `pending`, `approved`, `rejected`, and `suspended`
  states.
- A number is released only through a documented owner-admin transfer or
  account deletion. This prevents a sanctioned account from immediately
  re-registering while allowing support to handle recycled or reassigned
  numbers.

## OTP and abandoned-account policy

The provider decision belongs to S1-E02. Any selected implementation must meet
this minimum contract:

- six numeric digits;
- single use and valid for 10 minutes;
- maximum five attempts per issued code;
- minimum 60-second resend cooldown;
- bounded per-number, per-account, and per-IP daily sends, with exact limits
  approved alongside the provider;
- hash-only code storage and generic anti-enumeration responses; and
- deletion of used or expired challenge data within 24 hours.

An email-confirmed account that has not completed phone verification expires
after seven days:

- send one localized warning at day six;
- delete the account at day seven only when it remains phone-incomplete and has
  no protected marketplace, support, or audit dependency; and
- route any exceptional protected record to owner-admin support instead of
  cascading or corrupting history.

## Access, retention, and deletion

- Persist only the existing account contact fields, the self-declared birth
  date, confirmation timestamps, and structured transition audit.
- Birth date is private. It is never exposed publicly or to marketplace
  counterparts. The account holder may view and correct their own value; the
  owner-admin may access it only for support or enforcement.
- Contact details and birth date remain while the account exists and follow the
  approved account-deletion/de-identification workflow.
- Used and expired OTP challenge data is removed within 24 hours.
- Minimal structured transition history follows the approved five-year
  lifecycle-history rule and any documented legal hold.
- Access to restricted notes and transition history is owner-admin only.

A future birthday-congratulation email is explicitly deferred. This decision
preserves the private birth date but does not authorize that message, marketing
processing, or scheduling. A later decision must define consent or other lawful
basis, opt-out behavior, localization, and notification delivery.

## Implementation and evidence boundary

- Normal production-like Stage 1 configuration requires account approval,
  cleaner eligibility, and phone verification requirements to remain enabled.
- Any guarded requirement bypass remains excluded from genuine Stage 1
  evidence under ADR-0002.
- S1-D02 is complete when this signed policy is linked from the Stage 1 tracker.
- S1-E02 remains in progress until the policy is implemented end to end,
  provider/privacy approval exists, and backend, frontend, PostgreSQL
  concurrency, localization, accessibility, and authenticated-browser evidence
  pass.
