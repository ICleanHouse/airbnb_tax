# ADR-0002: Interim contact-based marketplace verification

**Date:** 2026-07-21
**Status:** accepted
**Deciders:** Repository owner
**Extended by:** [S1-D02 contact-eligibility policy](../S1_D02_CONTACT_ELIGIBILITY_POLICY.md), approved 2026-07-23

## Context

Stage 1 already stores email and phone confirmation timestamps, account states,
and a cleaner verification state. Signup nevertheless hard-codes approved and
verified states. Older documentation described a manual-only approval model,
while the owner has now approved an interim contact-based policy so the Sofia
pilot can exercise the real workflow without claiming that manual identity or
quality checks exist.

At acceptance time, the broader cleaner and agency standard remained unresolved
in S1-D02. The owner resolved it on 2026-07-23 by selecting automatic
contact-only eligibility for every role. The linked S1-D02 policy is normative
for the EEA phone, private 18+ birth-date, contact-change/recovery,
phone-reservation, owner-admin restoration, pending-expiry, badge, and retention
target. This ADR remains the source for the implemented email-only interim
capability and guarded bypass behavior.

## Decision

Signup always writes the safest base state first: account `pending` and cleaner
verification `pending`. One atomic reconciliation service then derives allowed
forward transitions from stored timestamps and the active configuration.

- A verified email satisfies the interim contact policy when phone verification
  is not required.
- With both normal requirement flags enabled and phone not required,
  reconciliation automatically approves an account and moves a cleaner to the
  stored marketplace-eligible cleaner state.
- Email confirmation does not mean that identity, references, an interview, or
  a trial job were checked.
- `verified` remains the internal legacy cleaner-state value used by existing
  authorization. Under this interim policy it means only that the configured
  contact requirement was met and cleaner marketplace access was activated. It
  is not approved public trust wording.
- `email_verified` means `email_verified_at` exists.
- `phone_verified` means `phone_verified_at` exists.
- `contact_verified` means email exists and every currently configured contact
  timestamp exists. With `PHONE_VERIFICATION_REQUIRED=False`, that is email;
  with it enabled, that is email plus phone.
- `marketplace_eligible` is derived only from persisted active/account/profile
  states. For cleaners it requires an active account, stored `approved` account
  state, and stored `verified` cleaner state. Environment flags never authorize
  marketplace endpoints.
- `fully_verified` is deliberately configuration-independent: both email and
  phone timestamps must exist.
- Normal users reconciled under enabled account and cleaner requirements count
  as genuine Stage 1 evidence. Any signup using either disabled requirement is
  permanently marked in the restricted pilot-exclusion ledger and excluded
  from genuine Stage 1 evidence.
- Phone verification is the approved Stage 1 additional contact requirement.
  This ADR does not implement or select an OTP provider.
- S1-D02 adds no manual cleaner or agency identity/quality evidence check.
  Account state owns exceptional rejection, suspension, and restoration for
  every role. The target details remain unimplemented S1-E02 work.

### Public and user-facing terminology

Approved English wording is **“Email-confirmed marketplace profile”** or
**“Marketplace access active.”** Approved Bulgarian wording must convey the
same limited claim. Public surfaces must not say “identity-verified cleaner” or
imply identity, reference, interview, or trial-job review. Internal database
and code identifiers may retain `verified` for compatibility only when the UI
explains the narrower meaning.

The S1-D02 target additionally permits a visible English **“Verified”** badge
(Bulgarian **“Потвърден”**) only after both contact timestamps exist. Its help,
policy, and accessible description must say that email and phone are confirmed
and identity and service quality were not checked. Email-only accounts never
receive this badge.

### Configuration contract

Safe defaults are:

```dotenv
ACCOUNT_APPROVAL_REQUIRED=True
CLEANER_VERIFICATION_REQUIRED=True
ALLOW_PILOT_VERIFICATION_BYPASS=False
PHONE_VERIFICATION_REQUIRED=False
```

`ACCOUNT_APPROVAL_REQUIRED=True` means approval must be earned through contact
reconciliation; it does not mean an additional manual review. `False` is an
explicit testing/rehearsal shortcut. `CLEANER_VERIFICATION_REQUIRED=True`
means the configured contact policy must be satisfied before the stored cleaner
state advances; `False` is an explicit shortcut.

Production-like environments (`staging`, `pilot`, `prod`, `production`) may
use a shortcut only when `ALLOW_PILOT_VERIFICATION_BYPASS=True`, owner and reason
metadata are non-empty, the timezone-aware start/end window is valid and
active, and `PILOT_GENUINE_JOB_INTAKE_PAUSED=True`. Startup and signup both
validate the guard. Operator warnings contain no personal data and never log
the full reason. Enabling the bypass guard when neither requirement is disabled
is invalid.

### Signup truth table

This table assumes the signup email is confirmed and no phone timestamp exists.
`ALLOW=False` is valid for shortcut rows only in local/test. A production-like
shortcut row requires the valid guarded bypass described above. `ALLOW=True`
is invalid for the first two rows because it would be unused.

| Account requirement | Cleaner requirement | Phone requirement | Initial account result | Initial cleaner result | Marketplace eligible | Stage 1 evidence |
|---:|---:|---:|---|---|---:|---|
| True | True | False | approved | eligible state | Yes | Genuine |
| True | True | True | pending | pending | No | Genuine |
| True | False | False | approved | eligible shortcut | Yes | Excluded |
| True | False | True | pending | eligible shortcut | No | Excluded |
| False | True | False | approved shortcut | eligible state | Yes | Excluded |
| False | True | True | approved shortcut | pending | No | Excluded |
| False | False | False | approved shortcut | eligible shortcut | Yes | Excluded |
| False | False | True | approved shortcut | eligible shortcut | Yes | Excluded |

`fully_verified` is false in every row until a phone timestamp also exists.
Changing configuration never rewrites or unlocks existing records by itself.

## Account transition semantics

- Reconciliation advances only `pending` records and is idempotent. It never
  restores rejected or suspended users.
- Human rejection is valid only for `pending -> rejected`.
- An approved account is suspended, not rejected.
- Suspension may move `pending` or `approved` to `suspended` and preserves
  marketplace history.
- Restoration is blocked until a separate owner-approved policy exists.
- Human transitions carry an expected state, neutral reason category, bounded
  internal note, actor, timestamp, previous/next state, and outcome. Internal
  notes are restricted to authorized admin review surfaces.

## Rollback

1. Enable `ACCOUNT_APPROVAL_REQUIRED` to stop new account shortcuts.
2. Enable `CLEANER_VERIFICATION_REQUIRED` to stop new cleaner shortcuts.
3. Enable `PHONE_VERIFICATION_REQUIRED` to stop new email-only normal
   advancement; this does not downgrade existing users.
4. Handle existing interim users through explicit operator suspension or a
   separately approved reconciliation command—never by silently rewriting
   state.
5. Suspension blocks new activity while retaining jobs, assignments, messages,
   audit history, and evidence exclusions.
6. Stage 1 queries exclude the permanent pilot-ledger marker.
7. Notify affected users through the transition workflow when access changes.

## Alternatives considered

### Retain manual-only approval

- **Pros:** Delays access until a human can review each signup.
- **Cons:** Contradicts the selected automatic contact policy and suggests
  identity or quality evidence that S1-D02 explicitly excludes.
- **Why not:** The owner explicitly selected contact-based automatic
  reconciliation for this stage.

### Treat email as full verification

- **Pros:** A single simple status.
- **Cons:** Misrepresents the trust evidence and cannot express the future phone
  requirement.
- **Why not:** `fully_verified` must require both contact timestamps, and public
  language must remain honest.

## Consequences

### Positive

- Normal pilot signup exercises real persisted transitions without a manual
  process whose criteria do not yet exist.
- Stored authorization remains independent of environment flags.
- Bypass-created evidence is identifiable without polluting the user model.

### Negative

- The legacy internal cleaner state name `verified` is broader than its interim
  meaning and requires careful UI wording.
- Existing interim users are not automatically downgraded when policy changes.
- EEA phone delivery, private age expansion, contact recovery, number transfer,
  restoration, pending expiry, and badge behavior add implementation and
  provider dependencies before live Stage 1 access.

### Risks

- Operators may overstate the trust claim unless BG/EN copy preserves the
  limited contact-confirmation wording.
- Enabling the approved phone requirement needs the S1-D02 OTP minimum,
  provider/privacy approval, and account-recovery design before users can
  satisfy it.
