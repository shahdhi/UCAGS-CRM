# CRM Database Schema Summary

## Overview
This CRM system uses Supabase/PostgreSQL with a normalized schema covering XP tracking, student/registration management, programs & batches, and payment processing.

---

## 1. XP-Related Tables

### `officer_xp_events`
**Purpose:** Full audit log of every XP transaction for officers/staff

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique event identifier |
| user_id | uuid | NOT NULL | References the officer/staff member |
| event_type | text | NOT NULL | Type of XP event (see below) |
| xp | int | NOT NULL | Positive (award) or negative (deduct) points |
| reference_id | text | NULLABLE | ID of the referenced entity (lead, followup, registration, payment, etc.) |
| reference_type | text | NULLABLE | Type of entity (lead, followup, registration, payment, attendance, report, checklist) |
| note | text | NULLABLE | Additional context for the event |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Event timestamp |

**Indexes:**
- `idx_officer_xp_events_user_id` on (user_id)
- `idx_officer_xp_events_created_at` on (created_at)
- `idx_officer_xp_events_event_type` on (event_type)

**RLS:** Enabled (service role only)

**Supported Event Types:**
| Event Type | Points | Description |
|------------|--------|-------------|
| lead_contacted | +2 | Lead status changed from 'New' |
| followup_completed | +1/+2 | Followup marked complete (+2 if answered=yes, +1 if no/unset) |
| registration_received | +40 | New registration submission |
| payment_received | +100 | Payment confirmed/received |
| demo_attended | +30 | Demo session marked as 'Attended' |
| attendance_on_time | +1 | Check-in recorded before 10:00 AM (SL time) |
| checklist_completed | +2 | Daily checklist snapshot saved |
| report_submitted | +2 | Daily report slot submitted |
| lead_responded_fast | +2 | First followup within 1h of lead assignment |
| followup_overdue | -5 | Followup overdue 1+ day (daily cron deduction) |

---

### `officer_xp_summary`
**Purpose:** Cached/denormalized total XP per officer for fast leaderboard lookups

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| user_id | uuid | PRIMARY KEY | References the officer |
| total_xp | int | NOT NULL, DEFAULT 0 | Cumulative XP (never goes negative) |
| last_updated | timestamptz | NOT NULL, DEFAULT now() | Last sync time |

**RLS:** Enabled (service role only)

**Relationships:**
- Denormalized from `officer_xp_events` (calculated via upsert)
- XP never goes below 0 (floored at zero)

---

## 2. Programs & Batches Tables

### `programs`
**Purpose:** Master list of training programs offered

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique program identifier |
| name | text | NOT NULL, UNIQUE | Program name |
| is_active | boolean | NOT NULL, DEFAULT true | Active/archived status |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Creation timestamp |

---

### `program_batches`
**Purpose:** Program runs/cohorts with batch-specific metadata

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique batch identifier |
| program_id | uuid | NOT NULL | Foreign key to programs (implicit, not enforced) |
| batch_name | text | NOT NULL | Batch/cohort name (e.g., "Batch 2024-Q1") |
| is_current | boolean | NOT NULL, DEFAULT false | Current/active batch flag |
| is_active | boolean | NOT NULL, DEFAULT true | Active/archived status |
| coordinator_user_id | uuid | NULLABLE | Coordinator assigned to this batch |
| demo_sessions_count | int | NOT NULL, DEFAULT 4 | Number of demo sessions planned |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Creation timestamp |

**Constraints:**
- UNIQUE(program_id, batch_name) - one batch name per program
- UNIQUE(program_id) WHERE is_current - only one current batch per program

**Indexes:**
- `program_batches_program_id_idx` on (program_id)
- `program_batches_current_idx` on (program_id, is_current)
- `program_batches_one_current_per_program` on (program_id) WHERE is_current

**Relationships:**
- References `programs(id)` (no FK constraint currently, but logically linked)

---

## 3. Registrations & Students Tables

### `registrations`
**Purpose:** Inbound registrations from public website forms

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique registration ID |
| name | text | NOT NULL | Registrant's full name |
| gender | text | NULLABLE | Gender |
| date_of_birth | text | NULLABLE | DOB (stored as text) |
| address | text | NULLABLE | Postal address |
| country | text | NULLABLE | Country |
| phone_number | text | NOT NULL | Primary contact phone |
| wa_number | text | NULLABLE | WhatsApp number |
| email | text | NULLABLE | Email address |
| working_status | text | NULLABLE | Employment status (e.g., employed, student, unemployed) |
| course_program | text | NULLABLE | Desired program name |
| assigned_to | text | NULLABLE | Officer assigned to follow up |
| source | text | NULLABLE | Registration source (form, referral, etc.) |
| payload | jsonb | NULLABLE | Raw form submission data |
| enrolled | boolean | NOT NULL, DEFAULT false | Whether converted to student |
| enrolled_at | timestamptz | NULLABLE | Enrollment conversion timestamp |
| student_id | text | NULLABLE | UCAGS-format student ID if enrolled |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Registration submission time |

**Indexes:**
- `registrations_created_at_idx` on (created_at DESC)
- `registrations_phone_idx` on (phone_number)
- `registrations_email_idx` on (email)
- `registrations_assigned_to_idx` on (assigned_to)
- `registrations_enrolled_at_idx` on (enrolled_at)
- `registrations_student_id_unique` on (student_id) WHERE student_id IS NOT NULL - UNIQUE constraint

**RLS:** Currently disabled (backend inserts via service role)

**Relationships:**
- One-to-one with `students` via (id) → students(registration_id)

---

### `students`
**Purpose:** Enrolled students with UCAGS ID and progress tracking

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Internal student record ID |
| student_id | text | UNIQUE, NULLABLE | UCAGS-format ID (e.g., UCAGS/1662) auto-generated by trigger |
| registration_id | uuid | UNIQUE, NULLABLE | Foreign key to registrations(id) |
| name | text | NULLABLE | Student's full name |
| phone_number | text | NULLABLE | Contact phone |
| email | text | NULLABLE | Contact email |
| program_id | uuid | NULLABLE | Program enrolled in |
| program_name | text | NULLABLE | Denormalized program name |
| batch_name | text | NULLABLE | Batch/cohort name |
| payload | jsonb | NOT NULL, DEFAULT '{}' | Extended profile data (flexible schema) |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Record creation time |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | Last update time |

**Indexes:**
- `students_program_id_idx` on (program_id)
- `students_batch_name_idx` on (batch_name)
- `students_created_at_idx` on (created_at)

**Foreign Keys:**
- students(registration_id) → registrations(id) ON DELETE SET NULL

**Triggers:**
- `trg_students_generate_id` (BEFORE INSERT): Auto-generates `student_id` as UCAGS/{nextval(student_number_seq)} if null
- `trg_students_updated_at` (BEFORE UPDATE): Auto-sets `updated_at` to now()

**Related Sequences:**
- `student_number_seq` - BIGINT sequence starting at 1662, increment 1, minvalue 1
  - Generates strictly ordered numeric IDs for UCAGS student ID format
  - Backfilled on migration to sync with existing student IDs

**Relationships:**
- One-to-one with `registrations` via (registration_id) → registrations(id)
- Links to `programs` via (program_id) - no FK enforced
- Links to `program_batches` via (batch_name) - denormalized reference

---

## 4. Payment Tables

### `batch_payment_plans`
**Purpose:** Payment plan templates per program batch

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique plan ID |
| program_id | text | NULLABLE | Program identifier (not enforced as FK) |
| batch_name | text | NOT NULL | Associated batch name |
| registration_fee | numeric | NULLABLE | Registration/enrollment fee amount |
| full_payment_amount | numeric | NULLABLE | Total program cost if paid in full |
| currency | text | DEFAULT 'LKR' | Currency code |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Creation time |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | Last update time |

**Constraints:**
- UNIQUE(batch_name) - one payment plan per batch

---

### `batch_payment_installments`
**Purpose:** Installment breakdowns for a payment plan

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique installment ID |
| plan_id | uuid | NOT NULL, FK to batch_payment_plans(id) | Reference to parent payment plan |
| title | text | NOT NULL | Installment name (e.g., "First Payment", "Final Payment") |
| amount | numeric | NOT NULL | Amount due for this installment |
| due_date | date | NULLABLE | Scheduled due date |
| notes | text | NULLABLE | Additional notes |
| sort_order | int | NOT NULL, DEFAULT 0 | Display/sequence order |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Creation time |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | Last update time |

**Indexes:**
- `batch_payment_installments_plan_idx` on (plan_id)

**Foreign Keys:**
- batch_payment_installments(plan_id) → batch_payment_plans(id) ON DELETE CASCADE

**Relationships:**
- Many-to-one with `batch_payment_plans`

---

## 5. Additional Tables (Referenced but not fully shown)

### `crm_lead_followups`
**Purpose:** Follow-up tasks for leads (referenced by XP system)

**Relevant Columns:**
- id - Followup ID
- officer_user_id - Officer assigned to followup
- scheduled_at - Scheduled completion date
- actual_at - Actual completion timestamp (null = incomplete)

**Used by:** XP system for:
- `followup_completed` event
- `followup_overdue` penalty (daily cron via `penaliseOverdueFollowups()`)

---

### `demo_sessions`
**Purpose:** Demo session scheduling and attendance tracking

**Added Column:**
- archived - boolean, NOT NULL DEFAULT false (for soft-deleting past sessions)

**Index:**
- `demo_sessions_archived_idx` on (batch_name, archived)

---

## 6. Relationship Diagram

```
programs (1)
    ↓ (1:N)
program_batches (1) ← coordinator_user_id (officer)
    ↓ (1:N)
batch_payment_plans (1)
    ↓ (1:N)
batch_payment_installments

registrations (1) → enrolled_at, enrolled=true
    ↓ (1:1)
students
    ↓ (N:1)
program_batches (via batch_name, program_id)

officer_xp_events (N:1)
    ↓
officer_xp_summary (1:1 per officer)

crm_lead_followups
    ↓ (references in xp_events)
officer_xp_events (via reference_id, reference_type)
```

---

## 7. Key Design Patterns

### Denormalization
- **officer_xp_summary**: Cached total XP per user (updated on each award/deduct)
- **students.program_name, batch_name**: Denormalized for fast queries

### Soft Deletes
- **program_batches.is_active, is_current**: Boolean flags instead of DELETE
- **demo_sessions.archived**: Boolean flag for historical records

### Flexible Schema
- **registrations.payload**: JSONB for unstructured form data
- **students.payload**: JSONB for extended student profile data

### Audit Trail
- **officer_xp_events**: Complete immutable log of all XP changes
- **created_at, updated_at** timestamps on most tables

### Idempotency in XP
- XP events deduplicated by (user_id, event_type, reference_id)
- Overdue penalty referenceId includes date: `{followup_id}:{YYYY-MM-DD}` for daily re-runs

### Auto-Generated IDs
- **students.student_id**: Trigger-generated UCAGS format (UCAGS/1662)
- **Sequence-based**: Ensures strictly ordered numeric IDs
- **Backfill logic**: On migration, sequence syncs to max existing ID

---

## 8. RLS (Row Level Security) Status

| Table | RLS Enabled | Policies |
|-------|-------------|----------|
| officer_xp_events | Yes | Service role only (no client access) |
| officer_xp_summary | Yes | Service role only |
| registrations | No | Backend inserts via service role |
| students | No | Backend inserts via service role |
| programs | No | Assumed backend-managed |
| program_batches | No | Assumed backend-managed |
| batch_payment_plans | No | Assumed backend-managed |
| batch_payment_installments | No | Assumed backend-managed |
| user_notifications | Yes | Client read/update own, service insert |
| crm_leads | Yes | Service role only (no client policies) |

---

## 9. Data Flow Examples

### Registration to Student Enrollment
1. User submits form → `registrations` row created
2. Officer reviews registration
3. Officer enrolls registrant → `students` row created with:
   - registration_id linked
   - student_id auto-generated (UCAGS/xxxx)
   - program_id, batch_name set
4. registrations.enrolled = true, enrolled_at = now()

### XP Award for Registration
1. New registration received
2. Backend calls `awardXP()` with eventType='registration_received', xp=+40
3. `officer_xp_events` row inserted (audit log)
4. `officer_xp_summary` upserted (total updated)
5. Deduplication check prevents double-awarding same registration

### Payment Plan Setup
1. New batch created in `program_batches`
2. Payment plan template created in `batch_payment_plans`
3. Installments added to `batch_payment_installments` (sorted by due_date)
4. Students enrolled in batch link to plan via batch_name

