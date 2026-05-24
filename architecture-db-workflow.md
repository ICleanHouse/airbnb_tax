# Database Schema and Application Workflow

## Restart Handoff

Deployment work is paused for a required Windows restart so Docker Desktop can run. See `CURRENT_PROGRESS.md` for resume steps.

## Database Schema (ER Diagram)

```mermaid
erDiagram
    USER {
      int id PK
      string email
      string password
      string role
      string account_status
      string first_name
      string last_name
      string phone
      string preferred_language
      datetime approved_at
      datetime email_verified_at
      datetime phone_verified_at
    }
    HOST_PROFILE {
      int id PK
      int user_id FK
      string company_name
      string city
      string notes
    }
    CLEANER_PROFILE {
      int id PK
      int user_id FK
      string type
      string verification_status
      json service_areas
      string bio
      string sex
      string profile_image
      decimal average_rating
      int completed_jobs_count
    }
    AGENCY_PROFILE {
      int id PK
      int user_id FK
      string company_name
      string city
      json service_areas
      string description
    }
    AGENCY_INVITATION {
      int id PK
      int agency_id FK
      int invited_by_id FK
      int cleaner_id FK
      string email
      string phone
      string status
      string token
      datetime expires_at
      datetime accepted_at
    }
    AGENCY_MEMBERSHIP {
      int id PK
      int agency_id FK
      int cleaner_id FK
      int invitation_id FK
      string status
      datetime joined_at
      datetime revoked_at
    }
    PROPERTY {
      int id PK
      int host_id FK
      string title
      string address
      string city
      int bedrooms
      string notes
    }
    CLEANING_JOB {
      int id PK
      int property_id FK
      int host_id FK
      date date
      string status
      decimal proposed_price
      decimal agreed_price
      string calendar_event_id
    }
    APPLICATION {
      int id PK
      int job_id FK
      int applicant_user_id FK
      string note
      decimal proposed_price
      string status
    }
    ASSIGNMENT {
      int id PK
      int job_id FK
      int applicant_user_id FK
      int assigned_member_id FK
      decimal agreed_price
      datetime assigned_at
      datetime completed_at
    }
    FEEDBACK {
      int id PK
      int job_id FK
      int from_user_id FK
      int to_user_id FK
      int rating
      string comment
    }
    COOKIE_CONSENT {
      int id PK
      int user_id FK
      string visitor_id
      string consent_version
      string policy_version
      bool essential
      bool analytics
      bool marketing
      datetime created_at
    }

    USER ||--o| HOST_PROFILE : owns
    USER ||--o| CLEANER_PROFILE : owns
    USER ||--o| AGENCY_PROFILE : owns
    AGENCY_PROFILE ||--o{ AGENCY_INVITATION : sends
    AGENCY_PROFILE ||--o{ AGENCY_MEMBERSHIP : has
    USER ||--o{ AGENCY_MEMBERSHIP : cleaner_member
    USER ||--o{ PROPERTY : owns
    PROPERTY ||--o{ CLEANING_JOB : schedules
    CLEANING_JOB ||--o{ APPLICATION : receives
    USER ||--o{ APPLICATION : submits
    CLEANING_JOB ||--o| ASSIGNMENT : has
    USER ||--o{ ASSIGNMENT : accepted_applicant
    USER ||--o{ ASSIGNMENT : assigned_member
    CLEANING_JOB ||--o{ FEEDBACK : gets
    USER ||--o{ FEEDBACK : gives
    USER ||--o{ COOKIE_CONSENT : records
```

## Application Workflow

1. **User Registration & Approval**
   - Users sign up as Property Owner (`host`), Cleaner, Agency, or Admin.
   - New public signups start as `pending`.
   - Signup sends a confirmation email to the new user's inbox.
   - The confirmation link sets `email_verified_at`.
   - Pending users can log in and complete onboarding, but cannot post jobs, apply, accept assignments, or assign agency work.
   - Admins approve, reject, or suspend users.
2. **Email/SMS Verification**
   - Email confirmation is implemented through a signed link sent at signup.
   - Phone/SMS verification remains planned for a later provider integration.
3. **Property Management (Property Owner)**
   - Approved property owners add/manage properties.
4. **Job Posting**
   - Approved property owners post single or batch cleaning jobs for their properties.
5. **Cleaner and Agency Applications**
   - Approved, verified cleaners can apply directly.
   - Approved agencies can apply as an agency account.
6. **Assignment**
   - Hosts review applications and assign one cleaner or agency.
   - If an agency is assigned, it chooses an active member cleaner for the job calendar.
7. **Agency Membership**
   - Agencies invite cleaners by email or phone.
   - Cleaners accept invitations from their own user account.
   - Agency work can be assigned only to active member cleaners with approved and verified accounts.
8. **Job Execution**
   - Job status updates as scheduled, assigned, completed, cancelled, or disputed.
9. **Calendar Sync**
   - Internal calendar is the source of truth; Google/iCal sync remains available through the calendar domain.
10. **Notifications**
    - Email, in-app, and SMS notifications remain the intended channels for key events.
11. **Feedback**
    - After job completion, involved parties leave two-way reviews.
12. **Cookie Consent**
    - Essential login/security cookies are always enabled.
    - Analytics and marketing cookies are recorded only after explicit consent.
    - Consent stores visitor/user identity, choices, consent version, policy version, and timestamp.
13. **Admin Moderation**
    - Admins approve accounts, verify cleaners/agencies, moderate reviews, inspect agency memberships, and resolve disputes.
