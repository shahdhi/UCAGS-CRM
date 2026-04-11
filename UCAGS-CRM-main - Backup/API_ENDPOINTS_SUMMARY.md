# Backend API Endpoints Summary

## Overview
Complete documentation of all available API endpoints across the backend modules, including paths, HTTP methods, authentication requirements, query parameters, and response data.

---

## 1. Dashboard Module (`/api/dashboard`)

### GET /api/dashboard/stats
- **Auth**: Authenticated users
- **Description**: Legacy-compatible dashboard stats (total, new, contacted, followUp, registered, closed leads)
- **Query Parameters**: None
- **Response Data**:
  - `stats`: Object with counts (total, new, contacted, followUp, registered, closed)
  - `officerStats`: (Admin only) Object mapping officer names to their stats
  - `warning`: Error message if sheets unavailable

### GET /api/dashboard/analytics
- **Auth**: Authenticated users (role-based filtering)
- **Description**: Admin analytics for Home page with KPIs, funnel, time series, leaderboard, and action center
- **Query Parameters**:
  - `from` (YYYY-MM-DD): Start date for analytics range
  - `to` (YYYY-MM-DD): End date for analytics range
- **Response Data**:
  - `range`: { from, to } date strings
  - `currentBatches`: Array of current batch names
  - `kpis`: { followUpsDue, registrationsReceived, confirmedPayments, conversionRate }
  - `funnel`: { new, contacted, followUp, registered, confirmedPayments }
  - `series`: { confirmedPaymentsPerDay: Array of { day, count } }
  - `leaderboard`: { enrollmentsCurrentBatch: Array of officer rankings }
  - `actionCenter`: (Admin only) { overdueFollowUps, paymentsToBeConfirmed, toBeEnrolled, registrationsMissingAssignedTo }

### GET /api/dashboard/enrollment-rankings
- **Auth**: Admin only
- **Description**: Rank officers by number of enrollments (confirmed payments) for current batch(es)
- **Query Parameters**: None
- **Response Data**:
  - `batchNames`: Array of current batch names
  - `rankings`: Array of { officer, count }

### GET /api/dashboard/recent
- **Auth**: Authenticated users
- **Description**: Legacy-compatible recent enquiries
- **Query Parameters**:
  - `limit`: Number of records (default: 10)
- **Response Data**:
  - `enquiries`: Array of recent enquiry objects

### GET /api/dashboard/follow-ups
- **Auth**: Authenticated users
- **Description**: Legacy-compatible follow-ups (overdue and upcoming)
- **Query Parameters**: None
- **Response Data**:
  - `overdue`: Array of overdue follow-up objects
  - `upcoming`: Array of upcoming follow-up objects

---

## 2. XP Module (`/api/xp`)

### GET /api/xp/leaderboard
- **Auth**: Admin or Officer
- **Description**: All officers ranked by total XP (descending)
- **Query Parameters**: None
- **Response Data**:
  - `leaderboard`: Array of { userId, name, email, role, totalXp, rank, lastUpdated }

**XP Event Types & Values**:
- `lead_contacted`: +2 (Lead status changed from 'New')
- `followup_completed`: +3 (Followup marked with actual_at date)
- `registration_received`: +10 (New registration submission)
- `payment_received`: +20 (Payment confirmed/received)
- `demo_attended`: +3 (Demo session marked as 'Attended')
- `attendance_on_time`: +1 (Check-in before 10:00 AM SL time)
- `checklist_completed`: +2 (Daily checklist snapshot saved)
- `report_submitted`: +3 (Daily report slot submitted)
- `lead_responded_fast`: +2 (First followup within 1h of assignment)
- `followup_overdue`: -2 (Followup open 1+ day past scheduled date, daily cron)

### GET /api/xp/me
- **Auth**: Authenticated users
- **Description**: Personal XP summary + recent events
- **Query Parameters**: None
- **Response Data**:
  - `userId`: Current user ID
  - `totalXp`: Total XP accumulated
  - `rank`: User's rank on leaderboard
  - `totalOfficers`: Total number of officers
  - `recentEvents`: Array of last 20 XP events with { userId, eventType, xp, referenceId, referenceType, note, created_at }

### GET /api/xp/trend
- **Auth**: Authenticated users
- **Description**: Personal XP trend over last N days
- **Query Parameters**:
  - `days`: Number of days to retrieve (max: 90, default: 30)
- **Response Data**:
  - `trend`: Array of { date (YYYY-MM-DD), xp (daily total) }

### GET /api/xp/global-trend
- **Auth**: Admin only
- **Description**: Global XP trend (all officers combined)
- **Query Parameters**:
  - `days`: Number of days to retrieve (max: 90, default: 30)
- **Response Data**:
  - `trend`: Array of { date (YYYY-MM-DD), xp (daily total) }

### POST /api/xp/cron/overdue
- **Auth**: Admin only
- **Description**: Trigger overdue followup penalty (called by cron job)
- **Query Parameters**: None
- **Request Body**: None
- **Response Data**:
  - `penalised`: Number of officers penalised
  - `skipped`: Number of skipped penalties

---

## 3. Calendar Tasks Module (`/api/tasks`)

### GET /api/tasks
- **Auth**: Authenticated users
- **Description**: List tasks with role-based filtering
- **Query Parameters**:
  - `mode`: 'me' (default) | 'officer' | 'everyone' (admin only)
  - `officer`: Officer name (admin only, when mode='officer')
  - `from`: Start date (YYYY-MM-DD)
  - `to`: End date (YYYY-MM-DD)
- **Response Data**:
  - `tasks`: Array of task objects { id, title, dueAt, notes, repeat, visibility, owner, created_at }

### POST /api/tasks
- **Auth**: Authenticated users
- **Description**: Create a new task
- **Request Body**:
  - `title`: (required) Task title
  - `dueAt`: (required) Due date/time
  - `notes`: Task notes (optional)
  - `repeat`: 'none' | 'daily' | 'weekly' | 'monthly' (default: 'none')
  - `visibility`: 'personal' | 'global' (admin only for global)
  - `ownerName`: Owner name (admin only to create for others)
- **Response Data**:
  - `task`: Created task object

### DELETE /api/tasks/:id
- **Auth**: Authenticated users
- **Description**: Delete a task (owner or admin only)
- **Path Parameters**:
  - `id`: Task ID
- **Response Data**:
  - `success`: Boolean

---

## 4. Notifications Module (`/api/notifications`)

### GET /api/notifications
- **Auth**: Authenticated users
- **Description**: Get user's notifications
- **Query Parameters**:
  - `limit`: Number of notifications to return (default: 50)
- **Response Data**:
  - `notifications`: Array of notification objects { id, userId, title, message, type, read, category, created_at }

### POST /api/notifications
- **Auth**: Authenticated users
- **Description**: Create a notification for self
- **Request Body**:
  - `title`: (required) Notification title
  - `message`: (required) Notification message
  - `type`: Type of notification (e.g., 'info', 'warning', 'error')
- **Response Data**:
  - `notification`: Created notification object

### POST /api/notifications/mark-all-read
- **Auth**: Authenticated users
- **Description**: Mark all notifications as read
- **Request Body**: None
- **Response Data**:
  - `markedCount`: Number of notifications marked as read

### GET /api/notifications/settings
- **Auth**: Authenticated users
- **Description**: Get user's notification settings
- **Query Parameters**: None
- **Response Data**:
  - `settings`: Object with notification preferences (e.g., admin_leave_requests, admin_registrations) or null

### PUT /api/notifications/settings
- **Auth**: Authenticated users
- **Description**: Update user's notification settings
- **Request Body**: Patch object with settings to update
- **Response Data**:
  - `settings`: Updated notification settings object

### POST /api/notifications/purge
- **Auth**: Cron secret header required (`x-cron-secret`)
- **Description**: Purge notifications older than N days
- **Request Body**:
  - `olderThanDays`: Number of days (default: 7)
- **Response Data**:
  - `purgedCount`: Number of notifications deleted

---

## 5. Leads Module (`/api/leads`)

### GET /api/leads
- **Auth**: Admin only
- **Description**: Get all leads with optional filters
- **Query Parameters**:
  - `status`: Filter by lead status
  - `search`: Search term
  - `batch`: Filter by batch name
- **Response Data**:
  - `count`: Number of leads
  - `leads`: Array of lead objects

### GET /api/leads/batches
- **Auth**: Admin only
- **Description**: Get all available batch sheets
- **Query Parameters**: None
- **Response Data**:
  - `batches`: Array of batch names (filtered for names starting with 'Batch')

### GET /api/leads/batches-all
- **Auth**: Authenticated users (admin + officers)
- **Description**: Get all available batch sheets (read-only)
- **Query Parameters**: None
- **Response Data**:
  - `batches`: Array of batch names (sorted)

### GET /api/leads/stats
- **Auth**: Admin only
- **Description**: Get leads statistics
- **Query Parameters**: None
- **Response Data**:
  - `stats`: Statistics object with counts by status

### GET /api/leads/:id
- **Auth**: Admin only
- **Description**: Get a specific lead by ID
- **Path Parameters**:
  - `id`: Lead ID
- **Response Data**:
  - `lead`: Lead object

### POST /api/leads
- **Auth**: Admin only
- **Description**: Create a new lead
- **Request Body**: Lead data object
- **Response Data**:
  - `lead`: Created lead object
  - `message`: Success message

### PUT /api/leads/:id
- **Auth**: Admin only
- **Description**: Update a specific lead
- **Path Parameters**:
  - `id`: Lead ID
- **Query Parameters**:
  - `batch`: Batch context (optional)
- **Request Body**: Lead updates object
- **Response Data**:
  - `lead`: Updated lead object
  - `message`: Success message

### DELETE /api/leads/:id
- **Auth**: Admin only
- **Description**: Delete a specific lead
- **Path Parameters**:
  - `id`: Lead ID
- **Response Data**:
  - `message`: Success message

---

## 6. Attendance Module (`/api/attendance`)

### POST /api/attendance/me/ensure-sheet
- **Auth**: Authenticated users
- **Description**: Ensure officer's attendance sheet exists
- **Request Body**: None
- **Response Data**: Sheet creation info

### GET /api/attendance/me/today
- **Auth**: Authenticated users
- **Description**: Get today's check-in/out status for officer
- **Query Parameters**: None
- **Response Data**:
  - `checkedIn`: Boolean
  - `checkInIso`: ISO timestamp of check-in
  - `checkIn`: Formatted check-in time
  - `checkedOut`: Boolean
  - `checkOut`: Formatted check-out time

### POST /api/attendance/me/checkin
- **Auth**: Authenticated users
- **Description**: Officer check-in (awards +1 XP if before 10:00 AM SL time)
- **Request Body**: None
- **Response Data**:
  - `record`: Check-in record { date, checkIn, checkInIso }

### POST /api/attendance/me/confirm-location
- **Auth**: Authenticated users
- **Description**: Confirm location for today's check-in
- **Request Body**:
  - `lat`: Latitude (optional)
  - `lng`: Longitude (optional)
  - `accuracy`: GPS accuracy (optional)
- **Response Data**:
  - `record`: Location confirmation record

### POST /api/attendance/me/checkout
- **Auth**: Authenticated users
- **Description**: Officer check-out
- **Request Body**: None
- **Response Data**:
  - `record`: Check-out record { date, checkOut }

### POST /api/attendance/me/leave-requests
- **Auth**: Authenticated users
- **Description**: Submit a leave request for a single day
- **Request Body**:
  - `date`: (required) Leave date (YYYY-MM-DD)
  - `reason`: Reason for leave (optional)
  - `leaveType`: Type of leave (optional)
- **Response Data**:
  - `request`: Created leave request object

### GET /api/attendance/me/leave-requests
- **Auth**: Authenticated users
- **Description**: List own leave requests
- **Query Parameters**:
  - `status`: Filter by status (e.g., 'pending', 'approved', 'rejected')
  - `from`: Start date (YYYY-MM-DD)
  - `to`: End date (YYYY-MM-DD)
- **Response Data**:
  - `count`: Number of requests
  - `requests`: Array of leave request objects

### GET /api/attendance/me/calendar
- **Auth**: Authenticated users
- **Description**: Officer's monthly attendance calendar summary
- **Query Parameters**:
  - `month`: Month in YYYY-MM format (default: current month in Asia/Colombo timezone)
- **Response Data**:
  - Calendar summary with attendance data

### GET /api/attendance/leave-requests
- **Auth**: Admin only
- **Description**: List all leave requests (with optional officer filter)
- **Query Parameters**:
  - `officer`: Filter by officer name
  - `status`: Filter by status
  - `from`: Start date (YYYY-MM-DD)
  - `to`: End date (YYYY-MM-DD)
- **Response Data**:
  - `count`: Number of requests
  - `requests`: Array of leave request objects

### POST /api/attendance/leave-requests/:id/approve
- **Auth**: Admin only
- **Description**: Approve a leave request
- **Path Parameters**:
  - `id`: Leave request ID
- **Request Body**:
  - `comment`: Admin comment (optional)
- **Response Data**:
  - `request`: Updated leave request object

### POST /api/attendance/leave-requests/:id/reject
- **Auth**: Admin only
- **Description**: Reject a leave request
- **Path Parameters**:
  - `id`: Leave request ID
- **Request Body**:
  - `comment`: Admin comment (optional)
- **Response Data**:
  - `request`: Updated leave request object

### GET /api/attendance/records
- **Auth**: Admin only
- **Description**: Get attendance records for all staff
- **Query Parameters**:
  - `date`: Specific date (YYYY-MM-DD) - returns records for that day
  - `from`: Start date (YYYY-MM-DD)
  - `to`: End date (YYYY-MM-DD)
- **Response Data**:
  - `count`: Number of records
  - `records`: Array of { staffName, date, checkIn, checkOut }

### GET /api/attendance/admin/officers
- **Auth**: Admin only
- **Description**: List all officers (sheet names)
- **Query Parameters**: None
- **Response Data**:
  - `officers`: Array of officer names

### GET /api/attendance/admin/calendar
- **Auth**: Admin only
- **Description**: Get calendar for a specific officer + month
- **Query Parameters**:
  - `officerName`: (required) Officer name
  - `month`: (required) Month in YYYY-MM format
- **Response Data**:
  - Calendar summary for the officer

### PUT /api/attendance/admin/calendar
- **Auth**: Admin only
- **Description**: Set a day status override for an officer
- **Request Body**:
  - `officerName`: (required) Officer name
  - `date`: (required) Date (YYYY-MM-DD)
  - `status`: (required) Status override (e.g., 'present', 'absent', 'leave')
- **Response Data**:
  - Status override confirmation

### GET /api/attendance/summary
- **Auth**: Admin only
- **Description**: Monthly attendance summary per officer
- **Query Parameters**:
  - `month`: (required) Month in YYYY-MM format
- **Response Data**:
  - Monthly summary with per-officer attendance data

---

## 7. Registrations Module (`/api/registrations`)

### POST /api/registrations/intake
- **Auth**: Public (no authentication)
- **Description**: Public intake endpoint for /Register page - create new registration
- **Request Body**:
  - `program_id`: (required) Program ID
  - `name`: (required) Student name
  - `phone_number`: (required) Phone number (normalized to SL format)
  - `wa_number`: WhatsApp number (optional, defaults to phone_number)
  - `email`: Email address (optional)
  - `gender`: Gender (optional)
  - `date_of_birth`: Date of birth (optional)
  - `address`: Address (optional)
  - `country`: Country (optional)
  - `working_status`: Employment status (optional)
  - `assigned_to`: Assigned officer (optional, inferred from existing leads)
- **Response Data**:
  - `registration`: Created registration object with all fields + payment_received flag

### GET /api/registrations/my
- **Auth**: Admin or Officer
- **Description**: List registrations assigned to logged-in officer (or all for admin)
- **Query Parameters**:
  - `limit`: Number of registrations (max: 500, default: 100)
  - `programId`: Filter by program ID
  - `batchName`: Filter by batch name
  - `all`: Set to '1' to show all batches (default: current batches only)
- **Response Data**:
  - `registrations`: Array of registration objects with payment_received flag

### GET /api/registrations/admin
- **Auth**: Admin only
- **Description**: List all registrations (admin view)
- **Query Parameters**:
  - `limit`: Number of registrations (max: 500, default: 100)
  - `programId`: Filter by program ID
  - `batchName`: Filter by batch name
  - `all`: Set to '1' to show all batches (default: current batches only)
- **Response Data**:
  - `registrations`: Array of registration objects with payment_received flag

### PUT /api/registrations/admin/:id/assign
- **Auth**: Admin only
- **Description**: Update registration assignment
- **Path Parameters**:
  - `id`: Registration ID
- **Request Body**:
  - `assigned_to`: Officer name to assign to
- **Response Data**:
  - `registration`: Updated registration object

### POST /api/registrations/:id/payments
- **Auth**: Admin or Officer
- **Description**: Add/update payment for a registration
- **Path Parameters**:
  - `id`: Registration ID
- **Request Body**:
  - `payment_method`: Payment method (optional)
  - `payment_plan`: (required) Payment plan name
  - `payment_date`: Payment date (optional)
  - `amount`: (required) Payment amount (must be > 0)
  - `slip_received`: Boolean indicating payment slip received
  - `receipt_received`: Boolean indicating receipt received
- **Response Data**:
  - `payments`: Array of payment objects

### GET /api/registrations/:id/payments
- **Auth**: Admin or Officer
- **Description**: Get all payments for a registration
- **Path Parameters**:
  - `id`: Registration ID
- **Response Data**:
  - `payments`: Array of payment objects with all fields (installment_no, amount, payment_date, etc.)

### DELETE /api/registrations/:id/payments
- **Auth**: Admin or Officer
- **Description**: Delete all payments for a registration
- **Path Parameters**:
  - `id`: Registration ID
- **Response Data**:
  - `success`: Boolean

### POST /api/registrations/admin/:id/enroll
- **Auth**: Admin only
- **Description**: Enroll a registration (create student record + generate student_id)
- **Path Parameters**:
  - `id`: Registration ID
- **Request Body**: None
- **Response Data**:
  - `registration`: Updated registration object with enrolled flag
  - `student`: Created or found student object with student_id

### DELETE /api/registrations/admin/:id
- **Auth**: Admin only
- **Description**: Delete a registration (also deletes related payments)
- **Path Parameters**:
  - `id`: Registration ID
- **Response Data**:
  - `success`: Boolean

### POST /api/registrations/admin/export-sheet
- **Auth**: Admin only
- **Description**: Export registrations to Google Sheet tab (push-only, append new records)
- **Request Body**:
  - `batchName`: (required) Batch name
- **Response Data**:
  - `batchName`: Batch name
  - `spreadsheetId`: Google Sheet ID
  - `sheetName`: Sheet tab name ('registrations')
  - `appended`: Number of new records added
  - `total`: Total registrations in batch

---

## 8. Payments Module (`/api/payments`)

### GET /api/payments/admin/summary
- **Auth**: Admin only
- **Description**: Admin payments summary (one row per registration, current unpaid installment or filtered)
- **Query Parameters**:
  - `programId`: Filter by program ID
  - `batchName`: Filter by batch name
  - `status`: Filter by computed status ('due' | 'overdue' | 'upcoming' | 'completed' | 'all')
  - `limit`: Max results (max: 1000, default: 200)
  - `type`: Force specific installment ('installment_1', 'installment_2', etc. or 'full_payment')
- **Response Data**:
  - `today`: Current date (YYYY-MM-DD)
  - `payments`: Array of payment summary objects with:
    - All payment fields (id, registration_id, installment_no, amount, payment_date, is_confirmed, receipt_no, etc.)
    - `window_start_date`: Payment window start
    - `window_end_date`: Payment window end
    - `computed_status`: Computed status (due/overdue/upcoming/completed)
    - Registration details (registration_name, registration_email, registration_phone_number, student_id, assigned_to)

### GET /api/payments/coordinator/summary
- **Auth**: Admin or Officer (batch coordinator only)
- **Description**: Batch coordinator payments summary (restricted to coordinator's batch)
- **Query Parameters**:
  - `programId`: (required) Program ID
  - `batchName`: (required) Batch name
  - `status`: Filter by computed status
  - `limit`: Max results (max: 1000, default: 200)
  - `type`: Force specific installment type
- **Response Data**: Same as admin summary

### GET /api/payments/coordinator/registration/:registrationId
- **Auth**: Admin or Officer (coordinator only)
- **Description**: List all payments for a registration (coordinator must own batch)
- **Path Parameters**:
  - `registrationId`: Registration ID
- **Response Data**:
  - `payments`: Array of all payment objects for the registration

### PUT /api/payments/coordinator/:id
- **Auth**: Admin or Officer (coordinator only)
- **Description**: Update payment fields (no confirm authority)
- **Path Parameters**:
  - `id`: Payment ID
- **Request Body** (partial updates):
  - `email_sent`: Boolean
  - `whatsapp_sent`: Boolean
  - `payment_method`: String
  - `payment_plan`: String
  - `payment_date`: Date string
  - `amount`: Number
  - `slip_received`: Boolean
- **Response Data**:
  - `payment`: Updated payment object

### GET /api/payments/admin/registration/:registrationId
- **Auth**: Admin only
- **Description**: List all payments for a registration (admin view)
- **Path Parameters**:
  - `registrationId`: Registration ID
- **Response Data**:
  - `payments`: Array of all payment objects

### GET /api/payments/admin
- **Auth**: Admin only
- **Description**: List all payments with optional filters
- **Query Parameters**:
  - `programId`: Filter by program ID
  - `batchName`: Filter by batch name
  - `limit`: Max results (max: 1000, default: 200)
- **Response Data**:
  - `payments`: Array of payment objects enriched with student_id from registrations

### PUT /api/payments/admin/:id
- **Auth**: Admin only
- **Description**: Update payment fields (admin has full update authority)
- **Path Parameters**:
  - `id`: Payment ID
- **Request Body** (partial updates):
  - `email_sent`: Boolean
  - `whatsapp_sent`: Boolean
  - `payment_method`: String
  - `payment_plan`: String
  - `payment_date`: Date string
  - `amount`: Number
  - `slip_received`: Boolean
  - `receipt_no`: String (admin only)
- **Response Data**:
  - `payment`: Updated payment object

### POST /api/payments/admin/:id/confirm
- **Auth**: Admin only
- **Description**: Confirm a payment (sets is_confirmed=true, generates receipt_no via trigger, awards +20 XP)
- **Path Parameters**:
  - `id`: Payment ID
- **Request Body**: None
- **Response Data**:
  - `payment`: Updated payment object with is_confirmed=true and confirmed_at timestamp
  - `receipt_no`: Generated receipt number (UC0001 format)

### POST /api/payments/admin/:id/unconfirm
- **Auth**: Admin only
- **Description**: Undo payment confirmation (reverts is_confirmed to false, deletes receipt row, reverts registration enrolled flag if no other confirmed payments)
- **Path Parameters**:
  - `id`: Payment ID
- **Request Body**: None
- **Response Data**:
  - `payment`: Updated payment object
  - `registrationUpdated`: Boolean indicating if registration enrolled flag was reverted

---

## Common Response Pattern

All endpoints follow this pattern:
```json
{
  "success": true|false,
  "error": "error message (if success=false)",
  "data": { ... specific endpoint data ... }
}
```

---

## Authentication Levels

1. **Public**: No authentication required (e.g., registration intake)
2. **Authenticated**: Any logged-in user
3. **Admin**: User with role='admin'
4. **Officer**: User with role='officer' or 'admission_officer'
5. **AdminOrOfficer**: User with role='admin' or 'officer'
6. **Cron Secret**: Requires `x-cron-secret` header matching environment variable

---

## Database Tables Accessed

Key Supabase tables used across modules:
- `officer_xp_events`: XP transactions
- `officer_xp_summary`: Officer XP totals
- `registrations`: Student registrations
- `payments`: Payment records
- `students`: Enrolled students
- `crm_leads`: Lead management
- `crm_lead_followups`: Followup tracking
- `program_batches`: Program batch info
- `batch_payment_plans`: Payment plan configurations
- `batch_payment_installments`: Installment due dates
- `receipts`: Payment receipts
- Various Sheets API tables for attendance, leave requests, etc.

---

## Key Features

1. **XP System**: Gamified points for engagement (leads, followups, payments, attendance, etc.)
2. **Role-Based Access**: Admin, Officer, and public-facing endpoints
3. **Batch Management**: Support for program cohorts/batches with current batch filtering
4. **Payment Tracking**: Multi-installment payment plans with status computation
5. **Attendance**: Check-in/check-out with location confirmation and leave requests
6. **Notifications**: User preferences with category-based filtering
7. **Calendar Tasks**: Recurring tasks with visibility control
8. **Sheets Integration**: Push-only export to Google Sheets for registrations

