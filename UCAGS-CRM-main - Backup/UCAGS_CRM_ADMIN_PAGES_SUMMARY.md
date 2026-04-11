# UCAGS CRM Admin-Side Pages Summary
## Supervisor/Admin Tab Overview

---

## 1. Lead Management Page
**File:** `public/frontend/pages/leads/leadManagement.js`

### Structure & Purpose
Allows officers/admins to track and manage leads with detailed follow-up information. Shows leads in a table with filtering, status tracking, and multi-level follow-up management.

### Key Columns Displayed
| Column | Purpose |
|--------|---------|
| Name | Lead contact name |
| Phone | Clickable phone number (tel: link) |
| Status | Badge-colored (New, Contacted, Interested, Registered, Enrolled, Not Interested, Unreachable, No Answer, Awaiting Decision, No Response, Next Batch) |
| Priority | Badge-colored (High/red, Medium/yellow, Low/green) |
| Last Follow-up Comment | Most recent non-empty followUpNComment field |
| Next Follow-up Schedule | Scheduled date of latest unfulfilled follow-up |
| Actions | Edit button to open "Manage Lead" modal |

### Filters (Client-side only)
- **Search Input:** Searches name, email, phone (no API call)
- **Status Filter:** Dropdown filter by normalized lead status
- **Priority Filter:** Dropdown filter by High/Medium/Low
- **Program Selector** (Admin only): Dropdown to switch between programs
- **Batch Dropdown:** Filter by batch within program
- **Sheet Tabs:** Dynamic tabs for "Main Leads", "Extra Leads", etc.

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/crm-leads/admin` | GET | Admin: fetch all leads for program/batch/sheet |
| `/api/crm-leads/my` | GET | Officer: fetch their assigned leads |
| `/api/crm-leads/meta/sheets?batch={batch}` | GET | Get available sheet names for a batch |
| `/api/crm-followups/my/{batch}/{sheet}/{leadId}` | GET | Fetch follow-up details (scheduled, actual, answered, comment) |
| `/api/crm-leads/manage` | POST | Save lead management data (status, priority, follow-ups, contact flags) |
| `/api/programs/sidebar` | GET | Get programs and batches |
| `/api/demo-sessions/invite` | POST | Invite lead to demo session |
| `/api/demo-sessions/invites/{inviteId}` | DELETE | Remove lead from demo session |

### Key Function Names
- `initLeadManagementPage()` - Initialize page, setup listeners
- `loadLeadManagement()` - Fetch leads from API, cache results (2min TTL)
- `filterManagementLeads(skipRender)` - Client-side filter by search/status/priority
- `renderManagementTable()` - Render filtered leads to tbody
- `openManageLeadModal(leadId)` - Open modal with lead details
- `closeManageLeadModal(event)` - Close modal
- `saveLeadManagement(event, leadId)` - Save all form data
- `normalizeLeadStatus(status)` - Standardize status values
- `getLastFollowUpComment(lead)` - Extract highest-numbered comment
- `getNextFollowUpSchedule(lead)` - Extract scheduled date of last unfulfilled follow-up

### Data Structures
```javascript
// Lead object (from API)
{
  id, supabaseId, batch, sheet, sheetLeadId,
  name, email, phone,
  status, priority,
  pdfSent, waSent, emailSent,  // outreach flags
  callFeedback,
  followUp1Schedule, followUp1Date, followUp1Answered, followUp1Comment,
  followUp2Schedule, followUp2Date, followUp2Answered, followUp2Comment,
  // ... supports unlimited follow-ups (followUpN*)
  lastFollowUpComment  // derived
}

// Management data (saved to API)
{
  pdfSent, waSent, emailSent,
  status, priority,
  nextFollowUp,
  callFeedback,
  followUp1Schedule, followUp1Date, followUp1Answered, followUp1Comment,
  followUp2Schedule, ... (unlimited)
}
```

### Modal Features
- **Initial Outreach Section:** Checkboxes for PDF/WhatsApp/Email sent
- **Status & Priority:** Dropdowns for status + priority + next follow-up (read-only)
- **Feedback After Call:** Textarea for general notes
- **Follow-ups Section:** Dynamic rows for follow-ups (1..N), each with:
  - Scheduled Date/Time (datetime-local)
  - Actual Date/Time (datetime-local)
  - Answered? (Yes/No dropdown)
  - Comment (textarea)
- **Demo Session Integration:** Section to invite to Demo 1-4, shows read-only tracking
- **Contact Info:** Read-only phone/email reference

### Caching
- Uses `window.Cache` with 2-minute TTL
- Cache key: `leads:management:{officer}:{program}:{batch}:{sheet}`
- Invalidated on: batch change, sheet creation

---

## 2. Registrations Page
**File:** `public/frontend/pages/registrations/registrationsPage.js`

### Structure & Purpose
Admin-only page displaying website registration submissions from Supabase. Shows registrations with payment tracking and enrollment management.

### Key Columns Displayed
| Column | Purpose |
|--------|---------|
| Name | Submitter name |
| Phone | Phone number from registration form |
| Email | Email address |
| Payment | Badge: "Received" (green) or "-" (not received) |
| Enrolled | Badge: "Enrolled" (green) or "Enroll" button |
| Assigned To | Officer name (admin can reassign) |
| Submitted At | Formatted date/time of submission |

### Filters
- **Program Tabs:** Horizontal tabs to select program
- **Batch Dropdown:** Filter by batch within program
- **Limit Selector:** Show 1-500 registrations (default 100)

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/programs/sidebar` | GET | Get programs and batches |
| `/api/registrations/adminList` | GET | Fetch registrations (with limit, programId, batchName) |
| `/api/registrations/adminAssign` | POST | Assign registration to officer |
| `/api/registrations/adminDelete` | POST | Delete registration |
| `/api/registrations/adminEnroll` | POST | Enroll registration (create student) |
| `/api/registrations/addPayment` | POST | Record payment details |
| `/api/registrations/deletePayments` | POST | Cancel/remove recorded payment |
| `/api/registrations/listPayments` | GET | Fetch saved payments for registration |
| `/api/payment-setup/batches/{batchName}` | GET | Get payment methods & plans for batch |
| `/api/registrations/admin/export-sheet` | POST | Export registrations to Google Sheet |
| `/api/users/officers` | GET | Get list of officers for assignment |

### Key Function Names
- `initRegistrationsPage()` - Initialize page, setup listeners
- `loadRegistrations({showSkeleton, force})` - Fetch registrations from API
- `renderProgramTabs()` - Render program tabs and batch selector
- `openDetailsModal(reg)` - Open registration details modal
- `renderRows(rows)` - Render table rows

### Data Structures
```javascript
// Registration object (from API)
{
  id, created_at,
  name, phone_number, email,
  program_name, batch_name,
  assigned_to,
  payment_received,
  enrolled (or is_enrolled, enrolled_at),
  payload: {
    // Extra fields from form submission
    gender, date_of_birth, address, country,
    wa_number, working_status, course_program, source,
    assigned_to, // fallback
    ...
  }
}

// Payment object
{
  id, installment_no,
  payment_method, payment_plan,
  payment_date, amount,
  slip_received, receipt_received
}
```

### Modal Features
- **Registration Details:** Grid showing all form fields (read-only)
- **Assignment Dropdown:** Assign to officer (hydrated async with officers list)
- **Payment Toggle Button:** Open/close payment details section
  - When open: shows method, plan, date, amount, receipt checkbox
  - Prefills from latest saved payment (installment #1 preferred)
- **Payment Methods & Plans:** Loaded dynamically from `/api/payment-setup/batches/{batchName}`
- **Delete Button:** (Admin only) Delete registration permanently
- **Enroll Button:** On table row - enroll registration and create student

### Caching
- Uses `window.Cache` with 2-minute TTL
- Cache key: `registrations:adminList:limit={limit}:program={programId}:batch={batchName}`
- Invalidated on: payment changes, enrollment, deletion

---

## 3. Daily Checklist Page
**File:** `public/frontend/pages/reports/dailyChecklistPage.js`

### Structure & Purpose
Admin-only page showing daily submission reports from officers. Tracks slot reports, leads status, and call recordings per day. Includes "Leader of the Week" calculation.

### Checklist Sections (by Day)
For each day (ISO format), displays a card with:

| Column | Purpose |
|--------|---------|
| Officer | Officer name |
| Slot 1 Report | Badge: "Submitted" (green) or "Not submitted" (red) |
| Slot 2 Report | Badge: "Submitted" or "Not submitted" |
| Slot 3 Report | Badge: "Submitted" or "Not submitted" |
| Leads | Shows count of "to be contacted" (live value) or "All leads contacted" (with ❄️ frozen indicator if snapshot exists) |
| Call Recordings | Dropdown: "—" / "Received" / "Not received" |

### Record Button
**What it does:** 
- Located in the day header, creates a snapshot of current state for that date
- Freezes the "Leads to be contacted" count at time of recording
- Calls `/api/reports/daily-checklist/snapshot` with dateISO
- Reloads checklist to show frozen values
- Disabled for past days (Sri Lanka timezone)

### Leader of the Week Section
**What it shows:**
- Officer name (top performer)
- **Reports submitted:** Count of slot reports submitted (out of total 3 × days count)
- **Not contacted on time:** Total leads still pending contact across period
- **Recordings received:** Count of call recordings marked "Received"

**Calculation (priority order):**
1. Highest number of slot reports submitted
2. If tied: Highest recordings received
3. If tied: Lowest "leads to be contacted" count

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/reports/daily-checklist` | GET | Fetch checklist data for date range |
| `/api/reports/daily-checklist/snapshot` | POST | Record snapshot for a specific date |
| `/api/reports/daily-checklist/call-recording` | PUT | Save recording status (received/not_received) |

### Key Function Names
- `initDailyChecklistPage()` - Initialize page
- `loadChecklist()` - Fetch checklist data and render
- `renderDaySection(dateISO, officers, matrix)` - Render single day card
- `recordSnapshotForDate(dateISO)` - POST snapshot to API
- `computeLeader(data)` - Calculate "Leader of the Week"
- `saveRecordingStatus({dateISO, officerUserId, status})` - Save recording dropdown

### Data Structures
```javascript
// Checklist response from API
{
  success: true,
  startISO, endISO,
  officers: [{ id, name }, ...],
  days: ['2024-01-01', '2024-01-02', ...],
  byDate: {
    '2024-01-01': {
      '{officerId}': {
        slot1, slot2, slot3,      // boolean (submitted)
        leadsToBeContacted,         // number
        hasSnapshot,                // boolean (frozen)
        callRecording               // 'na' | 'received' | 'not_received'
      }
    }
  }
}

// Leader object
{
  officer: { id, name },
  agg: {
    reports,      // total slot reports
    recordings,   // count of 'received'
    toContact     // total leads pending
  },
  totals: {
    reportsTotal,     // days × 3
    recordingsTotal,  // days count
    daysCount
  }
}
```

### Controls
- **Date Picker:** Start date (ISO format)
- **Days Input:** Number of days to show (default 7)
- **Previous/Next Buttons:** Navigate week by week (-7/+7 days)
- **This Week Button:** Jump to last 7 days ending today
- **Load Button:** Fetch checklist data
- **Recording Dropdowns:** Change status per officer/day (disabled for past days)

### Timezone
- Uses Sri Lanka timezone offset (+330 minutes = UTC+5:30)
- Days are disabled for editing once they pass in Sri Lanka

---

## 4. Demo Sessions Page
**File:** `public/frontend/pages/demoSessions/demoSessionsPage.js`

### Structure & Purpose
Admin page to manage demo session invitations for a batch. Shows 4 demo sessions (Demo 1-4) and allows adding/tracking participants with their response and attendance status.

### Page Layout
- **Program Selector:** Dropdown to choose program
- **Batch Selector:** Dropdown to choose batch within program (defaults to current batch)
- **Officer Filter** (Admin only): Dropdown to filter invites by officer
- **Demo Session Cards:** 4 cards (Demo 1-4) showing title and scheduled time
- **Invites Table:** Shows all invites for selected demo session with columns:
  - Name
  - Contact Number
  - Invite Status (Invited/Confirmed/Cancelled/Not reachable)
  - Reminders (badges R1, R2, ... with add button)
  - Attendance (Unknown/Attended/Not attended) — color-coded
  - Response (Pending/Positive/Negative/Neutral)
  - Comments After Inauguration

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/programs/sidebar` | GET | Get programs and batches |
| `/api/demo-sessions/sessions` | GET | Fetch demo sessions for batch |
| `/api/demo-sessions/sessions` | POST | Create demo session if missing |
| `/api/demo-sessions/invites` | GET | Fetch invites for session (optionally filtered by officer) |
| `/api/demo-sessions/invites/{inviteId}` | PATCH | Update invite (invite_status, attendance, response, commentsAfterInauguration) |
| `/api/demo-sessions/invites/{inviteId}/reminders` | GET | Fetch reminders for invite |
| `/api/demo-sessions/invites/{inviteId}/reminders` | POST | Create reminder for invite |
| `/api/users/officers` | GET | Get officers list (admin only) |

### Key Function Names
- `initDemoSessionsPage()` - Initialize page
- `loadProgramAndBatchSelects()` - Setup program/batch dropdowns
- `loadSessions()` - Fetch and ensure 4 demo sessions exist
- `loadInvites()` - Fetch invites for selected session
- `loadRemindersForInvite(inviteId)` - Fetch reminders for one invite
- `loadOfficersIntoSelect()` - Load officers list (admin only)
- `renderSessions()` - Render demo session cards
- `renderInvites()` - Render invites table
- `saveReminderFromModal()` - Save reminder from modal form

### Data Structures
```javascript
// Demo session object
{
  id, batch_name, demo_number,
  title,
  scheduled_at
}

// Invite object
{
  id,
  name, contact_number,
  invite_status,        // 'Invited' | 'Confirmed' | 'Cancelled' | 'Not reachable'
  attendance,           // '' | 'Attended' | 'Not attended'
  response,             // 'Pending' | 'Positive' | 'Negative' | 'Neutral'
  comments_after_inauguration
}

// Reminder object
{
  id, invite_id,
  reminder_number,
  sent_at,
  note
}
```

### Reminder Modal
- **When field:** datetime-local (defaults to +1 hour from now)
- **Note field:** Textarea for reminder note
- Opens via "Add reminder" button (R1, R2... badges)
- Saves reminder with POST to `/api/demo-sessions/invites/{inviteId}/reminders`

### Attendance Color-coding
- **Attended:** Green background, "Attended" text
- **Not attended:** Red background, "Not attended" text
- **Unknown:** Default styling

---

## Summary Table: API Endpoints by Page

| Page | Endpoint | Method | Purpose |
|------|----------|--------|---------|
| **Lead Mgmt** | `/api/crm-leads/admin` | GET | Fetch leads (admin) |
| **Lead Mgmt** | `/api/crm-leads/my` | GET | Fetch leads (officer) |
| **Lead Mgmt** | `/api/crm-leads/meta/sheets` | GET | Get sheet names |
| **Lead Mgmt** | `/api/crm-followups/my/{batch}/{sheet}/{leadId}` | GET | Get follow-ups |
| **Lead Mgmt** | `/api/crm-leads/manage` | POST | Save lead data |
| **Lead Mgmt** | `/api/demo-sessions/invite` | POST | Invite to demo |
| **Lead Mgmt** | `/api/demo-sessions/invites/{inviteId}` | DELETE | Remove from demo |
| **Registrations** | `/api/registrations/adminList` | GET | List registrations |
| **Registrations** | `/api/registrations/adminAssign` | POST | Assign to officer |
| **Registrations** | `/api/registrations/adminDelete` | POST | Delete registration |
| **Registrations** | `/api/registrations/adminEnroll` | POST | Enroll (create student) |
| **Registrations** | `/api/registrations/addPayment` | POST | Record payment |
| **Registrations** | `/api/registrations/deletePayments` | POST | Cancel payment |
| **Registrations** | `/api/registrations/listPayments` | GET | List payments |
| **Registrations** | `/api/payment-setup/batches/{batchName}` | GET | Payment methods/plans |
| **Registrations** | `/api/registrations/admin/export-sheet` | POST | Export to Google Sheet |
| **Daily Checklist** | `/api/reports/daily-checklist` | GET | Get checklist data |
| **Daily Checklist** | `/api/reports/daily-checklist/snapshot` | POST | Record snapshot |
| **Daily Checklist** | `/api/reports/daily-checklist/call-recording` | PUT | Save recording status |
| **Demo Sessions** | `/api/demo-sessions/sessions` | GET | List sessions |
| **Demo Sessions** | `/api/demo-sessions/sessions` | POST | Create session |
| **Demo Sessions** | `/api/demo-sessions/invites` | GET | List invites |
| **Demo Sessions** | `/api/demo-sessions/invites/{inviteId}` | PATCH | Update invite |
| **Demo Sessions** | `/api/demo-sessions/invites/{inviteId}/reminders` | GET | List reminders |
| **Demo Sessions** | `/api/demo-sessions/invites/{inviteId}/reminders` | POST | Create reminder |
| **All** | `/api/programs/sidebar` | GET | Programs & batches |
| **All** | `/api/users/officers` | GET | Officers list |

---

## Key Observations for Supervisor Interface

1. **Lead Management** is the core page for officer/supervisor activity:
   - Handles lead status transitions
   - Tracks follow-up activities (unlimited follow-ups per lead)
   - Integration with demo sessions for invitations
   - Caches data for performance

2. **Registrations** is admin-only for handling new signups:
   - Payment tracking per registration
   - Officer assignment workflow
   - Enrollment to create student records
   - Export capability for reporting

3. **Daily Checklist** is admin-only reporting:
   - Measures officer compliance (slot reports, recordings)
   - Freezes snapshots at specific moments
   - Calculates "Leader of the Week" dynamically
   - Sri Lanka timezone-aware

4. **Demo Sessions** enables batch-level demo management:
   - Organizes invitations to demo sessions
   - Tracks attendance and response
   - Reminder system for follow-up
   - Bidirectional sync with Lead Management (invites shown in lead modal)

