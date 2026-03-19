# Dashboard & Backend API Routes Summary

## Overview
This document summarizes all route endpoints from the dashboard-related backend modules, including role-based access control and supported query/body parameters.

---

## 1. Dashboard Module (`backend/modules/dashboard/dashboardRoutes.js`)

### GET /api/dashboard/stats
- **Auth**: `isAuthenticated`
- **Returns**: Dashboard statistics (total enquiries, new, contacted, follow-up, registered, closed) + officer-specific stats if admin
- **Role-based Logic**:
  - **Admin**: Receives all enquiries + aggregated `officerStats` (breakdown per officer)
  - **Officer/User**: Only sees their assigned enquiries if `user.sheetId` is configured
  - **Fail-soft**: Returns zeros if Sheets is unavailable
- **Filters/Params**: None (role determined by user object)
- **Data Source**: Google Sheets via `sheetsService`

### GET /api/dashboard/analytics
- **Auth**: `isAuthenticated`
- **Returns**: Comprehensive analytics including KPIs, funnel, time series, leaderboard, action center
- **Query Params**:
  - `from` (YYYY-MM-DD): Start date for date range filtering
  - `to` (YYYY-MM-DD): End date for date range filtering
- **Role-based Logic**:
  - **Admin**: Sees all registrations, all leads, all payments; gets action center data (overdue followups, payments to confirm, to-be-enrolled, missing assignments)
  - **Officer**: Sees only their own assigned leads, registrations, payments, and followups; no action center
- **Default Behavior**: If no date range provided, defaults to current batch start date or last 30 days
- **Cache**: 45-second TTL in-memory cache per-role per-date-range
- **Returns**:
  - `range`: Effective date range
  - `currentBatches`: Current active batches
  - `kpis`: Follow-ups due, registrations received, confirmed payments, conversion rate
  - `funnel`: New, Contacted, Follow-up, Registered, Confirmed Payments
  - `series`: Daily confirmed payments breakdown
  - `leaderboard.enrollmentsCurrentBatch`: Per-officer enrollment counts + conversion rates
  - `actionCenter` (admin only): Overdue followups, payments to confirm, to-be-enrolled, missing assignments

### GET /api/dashboard/enrollment-rankings
- **Auth**: `isAdmin`
- **Returns**: Officer rankings by number of enrollments (confirmed payments) for current batch(es)
- **Query Params**: None
- **Role-based Logic**: Admin-only endpoint
- **Filters**: 
  - Restricted to current batches only (prevents all-time counting)
  - Uses `is_confirmed=true` payments as enrollment marker (with backward compatibility for `receipt_received`)
- **Returns**: `{ batchNames, rankings: [{officer, count}, ...] }`

### GET /api/dashboard/recent
- **Auth**: `isAuthenticated`
- **Returns**: Recent enquiries (legacy, from Google Sheets)
- **Query Params**:
  - `limit` (default 10): Number of recent items to return
- **Role-based Logic**:
  - **Admin**: All enquiries
  - **Officer/User**: Only assigned enquiries (via `user.sheetId`)
- **Data Source**: Google Sheets via `sheetsService`

### GET /api/dashboard/follow-ups
- **Auth**: `isAuthenticated`
- **Returns**: Overdue and upcoming follow-ups (legacy, from Google Sheets)
- **Query Params**: None
- **Role-based Logic**:
  - **Admin**: All follow-ups
  - **Officer/User**: Only assigned follow-ups
- **Returned Data**: Split into `overdue` and `upcoming` arrays

---

## 2. XP Module (`backend/modules/xp/xpRoutes.js` + `backend/modules/xp/xpService.js`)

### GET /api/xp/leaderboard
- **Auth**: `isAdminOrOfficer`
- **Returns**: All officers ranked by total XP (descending), with rank position
- **Query Params**: None
- **Returned Fields**: `userId`, `name`, `email`, `role`, `totalXp`, `rank`, `lastUpdated`

### GET /api/xp/me
- **Auth**: `isAuthenticated`
- **Returns**: Personal XP summary + recent events + current rank
- **Query Params**: None
- **Returned Data**:
  - `totalXp`: User's total XP
  - `rank`: Current rank among all officers
  - `totalOfficers`: Total number of officers
  - `recentEvents`: Last 20 XP events with timestamps and amounts

### GET /api/xp/trend
- **Auth**: `isAuthenticated`
- **Returns**: Daily XP totals for the authenticated user over N days
- **Query Params**:
  - `days` (default 30, max 90): Number of days to look back
- **Timezone**: Uses Sri Lanka timezone offset (+330 minutes)
- **Returns**: Array of `{ date, xp }` objects with zero-filled days

### GET /api/xp/global-trend
- **Auth**: `isAdmin`
- **Returns**: Global XP trend (all officers combined) over N days
- **Query Params**:
  - `days` (default 30, max 90): Number of days to look back
- **Timezone**: Uses Sri Lanka timezone offset
- **Returns**: Array of `{ date, xp }` for each day

### POST /api/xp/cron/overdue
- **Auth**: `isAdmin`
- **Returns**: Count of penalized and skipped overdue followups
- **Query Params**: None
- **Body Params**: None
- **Function**: Triggers daily cron job that:
  - Finds open followups past scheduled_at by 1+ day
  - Deducts -2 XP per overdue followup per day (idempotent via referenceId)
  - Returns `{ penalised, skipped }`

### XP Event Types & Values
(From xpService.js documentation):
- `lead_contacted`: +2 (status changed from 'New')
- `followup_completed`: +3 (marked with actual_at)
- `registration_received`: +10 (new registration)
- `payment_received`: +20 (payment confirmed)
- `demo_attended`: +3 (demo marked 'Attended')
- `attendance_on_time`: +1 (check-in before 10:00 AM SL time)
- `checklist_completed`: +2 (daily checklist snapshot)
- `report_submitted`: +3 (daily report per slot)
- `lead_responded_fast`: +2 (first followup within 1h of assignment)
- `followup_overdue`: -2 (daily penalty for overdue followups)

---

## 3. Calendar Tasks Module (`backend/modules/calendar/calendarTasksRoutes.js`)

### GET /api/calendar/tasks
- **Auth**: `isAuthenticated`
- **Returns**: Filtered list of calendar tasks
- **Query Params**:
  - `mode` (default 'me'): Filter mode - 'me' (own tasks), 'officer' (specific officer), 'everyone' (all)
  - `officer`: Officer name (used when mode='officer', admin only)
  - `from` (YYYY-MM-DD): Start date filter
  - `to` (YYYY-MM-DD): End date filter
- **Role-based Logic**:
  - **Admin**: Can filter by mode (me/officer/everyone) and specify which officer
  - **Non-admin**: Always sees only their own tasks (mode='me' forced)
- **Task Visibility**: `includeGlobal=true` for all roles (includes global/shared tasks)

### POST /api/calendar/tasks
- **Auth**: `isAuthenticated`
- **Returns**: Created task object
- **Body Params**:
  - `title` (required): Task title
  - `dueAt` (required): Due date/datetime
  - `notes`: Optional notes
  - `repeat`: 'none'|'daily'|'weekly'|'monthly' (default 'none')
  - `visibility`: Task visibility (validated by role)
  - `ownerName`: For admin creating task for another officer
- **Role-based Logic**:
  - **Admin**: Can create for another officer via `ownerName`; can set `visibility='global'`
  - **Non-admin**: Always creates personal task for self; visibility forced to 'personal'
- **Defaults**: `repeat` defaults to 'none', `visibility` defaults to 'personal'

### DELETE /api/calendar/tasks/:id
- **Auth**: `isAuthenticated`
- **Returns**: Success confirmation
- **Role-based Logic**: Service validates task ownership (requester can only delete own/global tasks or admin can delete any)

---

## 4. Notifications Module (`backend/modules/notifications/notificationsRoutes.js`)

### GET /api/notifications
- **Auth**: `isAuthenticated`
- **Returns**: User's notifications
- **Query Params**:
  - `limit`: Max number of notifications to return
- **Data**: Returns array of notifications for the authenticated user

### POST /api/notifications
- **Auth**: `isAuthenticated`
- **Returns**: Created notification
- **Body Params**:
  - `title`: Notification title
  - `message`: Notification message
  - `type`: Notification type (e.g., 'info', 'warning')
- **Note**: Internal use primarily; authenticated user creates for self

### POST /api/notifications/mark-all-read
- **Auth**: `isAuthenticated`
- **Returns**: Result of marking all as read (count updated)
- **Body Params**: None

### GET /api/notifications/settings
- **Auth**: `isAuthenticated`
- **Returns**: User's notification settings or null
- **Query Params**: None

### PUT /api/notifications/settings
- **Auth**: `isAuthenticated`
- **Returns**: Updated notification settings
- **Body Params**: Settings object (patch) - can contain flags like `admin_registrations`, `admin_leave_requests`, `admin_daily_reports`

### POST /api/notifications/purge
- **Auth**: Cron secret (`x-cron-secret` header)
- **Returns**: Purge result with count
- **Body Params**:
  - `olderThanDays` (default 7): Delete notifications older than N days
- **Security**: Requires `CRON_SECRET` environment variable in header

---

## 5. Payments Module (`backend/modules/payments/paymentsRoutes.js`)

### GET /api/payments/admin/summary
- **Auth**: `isAdmin`
- **Returns**: Payment summary (one row per registration) with computed status
- **Query Params**:
  - `programId`: Filter by program
  - `batchName`: Filter by batch
  - `status`: 'due'|'overdue'|'upcoming'|'completed'|'all' (default 'all')
  - `limit` (default 200, max 1000): Number of results
  - `type`: 'installment_1'|'installment_2'|...|'full_payment' (specific installment filter)
- **Status Computation**:
  - `completed`: is_confirmed=true
  - `upcoming`: before start_date
  - `due`: between start_date and end_date
  - `overdue`: after end_date
- **Sort Order**: Overdue > Due > Upcoming > Completed, then by end_date
- **Enrichment**: Includes registration details (name, email, phone, student_id)

### GET /api/payments/coordinator/summary
- **Auth**: `isAdminOrOfficer`
- **Returns**: Same as admin/summary but restricted to coordinator's assigned batch
- **Query Params**: Same as admin/summary
- **Batch Access**: Requires user to be coordinator for the specified batch

### GET /api/payments/coordinator/registration/:registrationId
- **Auth**: `isAdminOrOfficer`
- **Returns**: All payments for a registration (must belong to coordinator's batch)
- **Params**: `registrationId`
- **Sort**: By created_at descending

### PUT /api/payments/coordinator/:id
- **Auth**: `isAdminOrOfficer`
- **Returns**: Updated payment record
- **Body Params** (all optional):
  - `email_sent`: boolean
  - `whatsapp_sent`: boolean
  - `payment_method`: string
  - `payment_plan`: string
  - `payment_date`: YYYY-MM-DD
  - `amount`: number
  - `slip_received`: boolean
- **Restrictions**: Coordinators cannot set `receipt_no` or confirm payments

### GET /api/payments/admin/registration/:registrationId
- **Auth**: `isAdmin`
- **Returns**: All payment records for a registration

### GET /api/payments/admin
- **Auth**: `isAdmin`
- **Returns**: All payments (paginated)
- **Query Params**:
  - `programId`: Filter by program
  - `batchName`: Filter by batch
  - `limit` (default 200, max 1000): Number of results
- **Enrichment**: Adds `student_id` from registrations table

### PUT /api/payments/admin/:id
- **Auth**: `isAdmin`
- **Returns**: Updated payment record
- **Body Params** (all optional):
  - `email_sent`, `whatsapp_sent`, `payment_method`, `payment_plan`, `payment_date`, `amount`, `slip_received`, `receipt_no`

### POST /api/payments/admin/:id/confirm
- **Auth**: `isAdmin`
- **Returns**: Updated payment + receipt_no
- **Function**: 
  - Marks payment as `is_confirmed=true`
  - Auto-generates sequential `receipt_no` (UC0001, UC0002, etc.)
  - **Awards XP**: +20 to the assigned officer (payment_received event)
  - Idempotent: running multiple times returns same receipt_no
- **Side Effects**: Creates receipt row (if receipts table exists)

### POST /api/payments/admin/:id/unconfirm
- **Auth**: `isAdmin`
- **Returns**: Updated payment + `registrationUpdated` flag
- **Function**:
  - Reverts `is_confirmed` to false
  - Clears receipt_no
  - If no other confirmed payments exist, reverts registration `enrolled` flag
  - Syncs lead status back to 'Registered' in CRM

---

## 6. Registrations Module (`backend/modules/registrations/registrationsRoutes.js`)

### POST /api/registrations/intake
- **Auth**: Public (no auth required)
- **Returns**: Created registration record
- **Body Params**:
  - `program_id` (required): Program UUID
  - `name` (required): Student name
  - `phone_number` (required): Phone number (normalized to SL format)
  - `email`: Email address
  - `wa_number`: WhatsApp number (normalized to SL format)
  - `gender`: Gender
  - `date_of_birth`: DOB
  - `address`: Address
  - `country`: Country
  - `working_status`: Working status
  - `assigned_to`: Optional assignment override
- **Features**:
  - Phone normalization to Sri Lanka format
  - Auto-detection of assignee from existing leads (within same batch)
  - Full payload stored as JSON for extensibility
  - **Awards XP**: +10 to assigned officer (registration_received event)
- **Side Effects**:
  - Sends notification to assigned officer (if found)
  - Sends notification to all admins (with settings check)
  - Syncs lead status to 'Registered' in CRM

### GET /api/registrations/my
- **Auth**: `isAdminOrOfficer`
- **Returns**: Registrations assigned to logged-in officer
- **Query Params**:
  - `programId`: Filter by program
  - `batchName`: Filter by batch
  - `limit` (default 100, max 500): Number of results
  - `all` (value '1'): If set, shows all batches instead of just current
- **Default**: Shows only current batches unless `all=1`
- **Enrichment**: Adds `payment_received` flag per registration

### GET /api/registrations/admin
- **Auth**: `isAdmin`
- **Returns**: All registrations (with optional filters)
- **Query Params**:
  - `programId`: Filter by program
  - `batchName`: Filter by batch
  - `limit` (default 100, max 500): Number of results
  - `all` (value '1'): If set, shows all batches instead of just current
- **Default**: Shows only current batches unless `all=1`
- **Enrichment**: Adds `payment_received` flag per registration

### PUT /api/registrations/admin/:id/assign
- **Auth**: `isAdmin`
- **Returns**: Updated registration record
- **Body Params**:
  - `assigned_to`: Officer name to assign to

### POST /api/registrations/:id/payments
- **Auth**: `isAdminOrOfficer`
- **Returns**: Created/updated payment record(s)
- **Body Params**:
  - `payment_method`: Payment method
  - `payment_plan` (required): Payment plan name (e.g., 'Installment Plan', 'Full Payment')
  - `payment_date`: YYYY-MM-DD
  - `amount` (required): Amount > 0
  - `slip_received`: boolean
  - `receipt_received`: boolean
- **Features**:
  - Records FIRST payment only (idempotent)
  - Creates placeholder rows for subsequent installments (2..N) if installment plan exists
  - Loads plan config from `batch_payment_plans` and `batch_payment_installments`
- **Side Effects**: Syncs lead status to 'Enrolled' in CRM

### DELETE /api/registrations/:id/payments
- **Auth**: `isAdminOrOfficer`
- **Returns**: Success confirmation
- **Function**: Deletes all payments for a registration

### GET /api/registrations/:id/payments
- **Auth**: `isAdminOrOfficer`
- **Returns**: All payment records for a registration
- **Sort**: By created_at descending

### POST /api/registrations/admin/:id/enroll
- **Auth**: `isAdmin`
- **Returns**: Updated registration + created student record
- **Function**:
  - Creates student record from registration
  - Auto-generates `student_id` (UC0001, UC0002, etc.) via DB trigger
  - Marks registration as `enrolled=true` with timestamp
  - Syncs `assigned_to` to student record
  - Idempotent: returns existing student if already enrolled
- **Side Effects**: Handles schema variations (tries dedicated columns, falls back to payload)

### DELETE /api/registrations/admin/:id
- **Auth**: `isAdmin`
- **Returns**: Success confirmation
- **Function**:
  - Cascading delete: removes related payments first
  - Then deletes the registration record
  - Prevents orphaned payment rows

### POST /api/registrations/admin/export-sheet
- **Auth**: `isAdmin`
- **Returns**: Export summary `{ batchName, spreadsheetId, sheetName, appended, total }`
- **Body Params**:
  - `batchName` (required): Batch name
- **Features**:
  - Ensures "registrations" sheet exists in batch admin spreadsheet
  - Merges headers dynamically from registrations data + payload keys
  - Deduplicates by `registration_id` (append-only)
  - Exports all fields (DB columns + flattened payload.* columns)

---

## 7. Attendance Module (`backend/modules/attendance/attendanceRoutes.js`)

### POST /api/attendance/me/ensure-sheet
- **Auth**: `isAuthenticated`
- **Returns**: Sheet creation result
- **Function**: Creates/ensures officer's attendance sheet exists

### GET /api/attendance/me/today
- **Auth**: `isAuthenticated`
- **Returns**: Today's check-in/out status for authenticated officer
- **Query Params**: None

### POST /api/attendance/me/checkin
- **Auth**: `isAuthenticated`
- **Returns**: Check-in record
- **Function**: Records check-in timestamp
- **XP Award**: +1 if checked in before 10:00 AM SL time (attendance_on_time event, idempotent per day)

### POST /api/attendance/me/confirm-location
- **Auth**: `isAuthenticated`
- **Returns**: Updated record with location
- **Body Params**:
  - `lat`: Latitude
  - `lng`: Longitude
  - `accuracy`: Location accuracy

### POST /api/attendance/me/checkout
- **Auth**: `isAuthenticated`
- **Returns**: Check-out record
- **Function**: Records check-out timestamp

### POST /api/attendance/me/leave-requests
- **Auth**: `isAuthenticated`
- **Returns**: Created leave request record
- **Body Params**:
  - `date` (required): Leave date (YYYY-MM-DD)
  - `reason`: Reason for leave
  - `leaveType`: Type of leave
- **Side Effects**: Notifies all admins with settings check

### GET /api/attendance/me/leave-requests
- **Auth**: `isAuthenticated`
- **Returns**: Officer's own leave requests
- **Query Params**:
  - `status`: Filter by status (e.g., 'pending', 'approved', 'rejected')
  - `from`: Start date (YYYY-MM-DD)
  - `to`: End date (YYYY-MM-DD)

### GET /api/attendance/leave-requests
- **Auth**: `isAdmin`
- **Returns**: All leave requests (admin view)
- **Query Params**:
  - `officer`: Filter by officer name
  - `status`: Filter by status
  - `from`: Start date
  - `to`: End date

### POST /api/attendance/leave-requests/:id/approve
- **Auth**: `isAdmin`
- **Returns**: Updated leave request record
- **Body Params**:
  - `comment`: Optional admin comment

### POST /api/attendance/leave-requests/:id/reject
- **Auth**: `isAdmin`
- **Returns**: Updated leave request record
- **Body Params**:
  - `comment`: Optional admin comment

### GET /api/attendance/me/calendar
- **Auth**: `isAuthenticated`
- **Returns**: Officer's monthly calendar summary
- **Query Params**:
  - `month`: YYYY-MM format (defaults to current month in Asia/Colombo timezone)

### GET /api/attendance/summary
- **Auth**: `isAdmin`
- **Returns**: Monthly attendance summary per officer
- **Query Params**:
  - `month` (required): YYYY-MM format

### GET /api/attendance/records
- **Auth**: `isAdmin`
- **Returns**: All staff attendance records
- **Query Params**:
  - `date`: Single date filter (YYYY-MM-DD)
  - `from`: Start date range
  - `to`: End date range
- **Sort**: By date descending, then staff name ascending

### GET /api/attendance/admin/officers
- **Auth**: `isAdmin`
- **Returns**: List of all officer sheet names
- **Query Params**: None

### GET /api/attendance/admin/calendar
- **Auth**: `isAdmin`
- **Returns**: Specific officer's monthly calendar (admin view)
- **Query Params**:
  - `officerName` (required): Officer name
  - `month` (required): YYYY-MM format

### PUT /api/attendance/admin/calendar
- **Auth**: `isAdmin`
- **Returns**: Override result
- **Body Params**:
  - `officerName`: Officer name
  - `date`: Date (YYYY-MM-DD)
  - `status`: Status override (e.g., 'present', 'absent', 'leave', etc.)
- **Function**: Sets day status override for an officer (stored in AttendanceOverrides sheet)

---

## 8. Reports Module (`backend/modules/reports/reportsRoutes.js`)

### GET /api/reports/daily/schedule
- **Auth**: `isAuthenticated`
- **Returns**: Daily report schedule configuration
- **Query Params**: None
- **Returns**: `{ timezone, graceMinutes, slots: [{slotKey, startTime, endTime}, ...] }`

### POST /api/reports/daily/submit
- **Auth**: `isAdminOrOfficer`
- **Returns**: Saved report record
- **Body Params**:
  - `slotKey`: Report slot identifier
  - `payload`: Report content (flexible structure)
  - `clientNowISO`: ISO timestamp of submission time
- **XP Award**: +3 per report submitted (report_submitted event, once per slot)
- **Side Effects**: Notifies all admins

### GET /api/reports/daily/overview
- **Auth**: `isAdminOrOfficer`
- **Returns**: Daily reports for a date + list of non-admin officers
- **Query Params**:
  - `date`: Report date (YYYY-MM-DD)
- **Officer List**: Filters out admin accounts (by email and role metadata)

### GET /api/reports/daily
- **Auth**: `isAdmin`
- **Returns**: All daily reports for a date
- **Query Params**:
  - `date`: Report date (YYYY-MM-DD)

### PUT /api/reports/daily/schedule
- **Auth**: `isAdmin`
- **Returns**: Updated schedule configuration
- **Body Params**:
  - `timezone`: Timezone string (e.g., 'Asia/Colombo')
  - `graceMinutes`: Grace period in minutes
  - `slots`: Array of slot definitions

### GET /api/reports/daily-checklist
- **Auth**: `isAdmin`
- **Returns**: Daily checklist status for officers over date range
- **Query Params**:
  - `start`: Start date (YYYY-MM-DD)
  - `days` (default 7): Number of days to include
- **Returns**: Checklist data with officer list

### POST /api/reports/daily-checklist/snapshot
- **Auth**: `isAdmin`
- **Returns**: Captured lead counts snapshot for specified date(s)
- **Body Params** (one of):
  - `dateISO`: Single date (YYYY-MM-DD)
  - `startISO` + `days`: Date range
- **Function**: Captures current "New" lead counts per officer for the specified date(s)

### PUT /api/reports/daily-checklist/call-recording
- **Auth**: `isAdmin`
- **Returns**: Updated call recording status record
- **Body Params**:
  - `dateISO`: Date (YYYY-MM-DD)
  - `officerUserId`: Officer's user ID
  - `status`: Call recording status

### POST /api/reports/daily/remind
- **Auth**: `isAuthenticated` OR Cron (via `x-cron-secret` header)
- **Returns**: Reminder result summary
- **Body Params**:
  - `nowISO` (optional): ISO timestamp for current time
- **Function**: Sends in-app reminder notifications to officers who haven't submitted for current slot
- **Access**: Can be called from cron job or by authenticated users

### PUT /api/reports/daily/:id
- **Auth**: `isAdmin`
- **Returns**: Updated report record
- **Body Params**: Any report fields to patch

---

## Summary: Role-Based Access Levels

### Public (No Auth Required)
- `POST /api/registrations/intake` — Public registration form

### Authenticated Users (`isAuthenticated`)
- Dashboard stats, analytics, recent, follow-ups (view own data)
- XP leaderboard, my XP, XP trends
- Calendar tasks (view/create/delete own)
- Notifications (CRUD own)
- Attendance check-in/out, leave requests, calendar
- Daily report submission
- Daily report schedule
- Daily report reminders

### Officers & Admins (`isAdminOrOfficer`)
- Registrations: view/create/update (my assignments for officers, all for admins)
- Payments: list/update coordinator endpoints
- Attendance leave request management
- Daily report submissions
- Daily report overview
- Registration payment operations

### Admin Only (`isAdmin`)
- Dashboard enrollment rankings
- Enrollment-specific analytics filtering
- XP global trends
- XP cron overdue penalties
- Payment admin summary, confirmation, unconfirm
- Registration assignment updates, enrollment, deletion
- Attendance staff records, leave request decisions, overrides
- Daily report full access, schedule management, checklist operations
- Notifications purge (via cron secret)
- All admin-only analytics and operations

### Cron Jobs (Cron Secret Header)
- `POST /api/notifications/purge` — Notification cleanup
- `POST /api/reports/daily/remind` — Report reminders

---

## Key XP Integration Points

The following operations automatically award XP:

1. **Lead contacted**: +2 (via CRM module)
2. **Follow-up completed**: +3 (via CRM module)
3. **Registration received**: +10 (on intake submission)
4. **Payment confirmed**: +20 (on admin confirm)
5. **Check-in on time**: +1 (before 10:00 AM SL time)
6. **Daily report submitted**: +3 (per slot, once)
7. **Overdue followup penalty**: -2 (daily, cron-triggered)

All XP awards are idempotent (no double-counting).

---

## Key Filtering & Params Patterns

### Date Filters
- **Format**: YYYY-MM-DD (ISO 8601 date only, no time)
- **Used in**: Analytics, calendar tasks, leave requests, attendance, reports
- **Default**: Current date or last 30 days depending on endpoint

### Batch/Program Filters
- **Query Params**: `programId`, `batchName`
- **Used in**: Payments, registrations, analytics
- **Default**: Current batches (if configured) unless `all=1`

### Status Filters
- **Query Params**: `status`
- **Values**: Endpoint-specific ('due', 'overdue', 'upcoming', 'completed', 'all', etc.)

### Pagination
- **Query Params**: `limit` (default varies by endpoint, typically 100-200, max 1000)
- **Pattern**: Most endpoints support limit; few support offset/cursor

### Mode/View Filters
- **Query Params**: `mode` (calendar tasks: 'me'/'officer'/'everyone')
- **Used in**: Endpoints requiring perspective switching

---

## Error Handling Patterns

All endpoints follow consistent patterns:
- **Auth failures**: HTTP 401
- **Forbidden**: HTTP 403
- **Not found**: HTTP 404
- **Bad request**: HTTP 400 (validation errors)
- **Server errors**: HTTP 500
- **Response format**: `{ success: boolean, error?: string, data?: object }`
- **Fail-soft**: Some endpoints (dashboard stats, analytics) return defaults instead of errors if dependencies fail

---

## Timezone Considerations

- **Default timezone**: Asia/Colombo (UTC+5:30)
- **XP calculations**: All use SL_OFFSET = 330 minutes for consistent daily boundaries
- **Attendance**: On-time check-in threshold is 10:00 AM SL time
- **Reports**: Schedule and submissions respect configured timezone
