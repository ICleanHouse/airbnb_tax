# Database Schema and Application Workflow

## Database Schema (ER Diagram)

```mermaid
erDiagram
    USER {
      int id PK
      string email
      string password
      string role
      string name
      string phone
      bool is_verified
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
    CLEANER_PROFILE {
      int id PK
      int user_id FK
      string type
      string area
      bool is_approved
      string description
    }
    CLEANING_JOB {
      int id PK
      int property_id FK
      date date
      string status
      decimal agreed_price
      int assigned_cleaner_id FK
      string calendar_event_id
    }
    APPLICATION {
      int id PK
      int job_id FK
      int cleaner_id FK
      string note
      decimal proposed_price
      string status
    }
    FEEDBACK {
      int id PK
      int job_id FK
      int from_user_id FK
      int to_user_id FK
      int rating
      string comment
    }

    USER ||--o{ PROPERTY : owns
    USER ||--o{ CLEANER_PROFILE : has
    PROPERTY ||--o{ CLEANING_JOB : schedules
    CLEANER_PROFILE ||--o{ APPLICATION : applies
    CLEANING_JOB ||--o{ APPLICATION : receives
    CLEANING_JOB ||--o{ FEEDBACK : gets
    USER ||--o{ FEEDBACK : gives
    CLEANER_PROFILE ||--o{ CLEANING_JOB : assigned
```

## Application Workflow

1. **User Registration & Roles**
   - Users sign up as Host, Cleaner, or Admin.
   - Cleaners must be verified by Admin before applying for jobs.
2. **Property Management (Host)**
   - Hosts add/manage properties.
3. **Job Posting (Host)**
   - Hosts post single or batch cleaning jobs for their properties.
4. **Cleaner Applications**
   - Verified cleaners see available jobs and apply with notes and price.
5. **Assignment**
   - Hosts review applications and assign a cleaner.
6. **Job Execution**
   - Job status updates as scheduled, in progress, completed.
7. **Calendar Sync**
   - Internal calendar is the source of truth; Google/iCal sync available.
8. **Notifications**
   - Email, in-app, and SMS notifications for key events.
9. **Feedback**
   - After job completion, both host and cleaner leave reviews.
10. **Admin Moderation**
    - Admins approve cleaners, moderate reviews, and resolve disputes.
