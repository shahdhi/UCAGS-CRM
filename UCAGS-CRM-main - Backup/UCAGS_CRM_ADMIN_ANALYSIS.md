# UCAGS CRM Admin-Side Pages & Officer Assignment Analysis

## Executive Summary
This document provides a comprehensive analysis of the UCAGS CRM application's admin-side pages, focusing on API endpoints, data structures, and officer/staff assignment functionality.

---

## 1. Lead Management Page (`public/frontend/pages/leads/leadManagement.js`)

### Key Functions
- `initLeadManagementPage()` - Initialize page, load leads, setup listeners
- `loadLeadManagement()` - Load leads from API with batch/sheet filtering
- `filterManagementLeads(skipRender)` - Client-side filtering (search, status, priority)
- `openManageLeadModal(leadId)` - Open detailed lead management modal
- `saveLeadManagement(event, leadId)` - Save lead data (status, priority, followups)

### API Endpoints Called

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/crm-leads/meta/sheets?batch=X` | GET | Get available sheets for a batch (Main Leads, Extra Leads, custom) |
| `/api/programs/sidebar` | GET | Get all programs and batches for dropdowns |
| `/api/crm-leads/admin` | GET | Load all leads (admin view) with batch/sheet filtering |
| `/api/crm-leads/my` | GET | Load officer's own leads |
| `/api/crm-followups/my/{batch}/{sheet}/{leadId}` | GET | Load followup records for a specific lead |
| `/api/demo-sessions/invites/{inviteId}` | GET/DELETE | Fetch/remove demo session invites for a lead |
| `/api/demo-sessions/invite` | POST | Invite a lead to a demo session |
| `/api/demo-sessions/leads/{crmLeadId}` | GET | Get demo session tracking for a lead |

### Key Filters/Columns Displayed (Lines 1-150)

**Display Columns:**
- Name
- Phone (clickable tel: link)
- Status (badge: New, Contacted, Interested, Registered, Enrolled, Not Interested, Unreachable, No Answer, Awaiting Decision, No Response, Next Batch)
- Priority (High/Medium/Low badges)
- Last Follow-up Comment
- Next Follow-up Scheduled Date
- Manage button

**Client-Side Filters:**
- **Search:** Name, email, phone (real-time debounced)
- **Status Filter:** Dropdown with all canonical statuses
- **Priority Filter:** High, Medium, Low

### Key Data Structures

**Lead Object:**
```javascript
{
  id, name, phone, email,
  status, priority,
  batch, sheet, sheetLeadId,
  pdfSent, waSent, emailSent,
  callFeedback,
  followUp1Schedule, followUp1Date, followUp1Answered, followUp1Comment,
  followUp2Schedule, followUp2Date, followUp2Answered, followUp2Comment,
  // ... supports unlimited followups (followUpNSchedule, followUpNDate, etc.)
  supabaseId, program_id
}
```

**Lead Status Constants:**
```javascript
['New', 'Contacted', 'Interested', 'Registered', 'Enrolled', 'Not Interested', 
 'Unreachable', 'No Answer', 'Awaiting Decision', 'No Response', 'Next Batch']
```

### Modal Features
- **Initial Outreach:** PDF Sent, WhatsApp Sent, Email Sent (checkboxes)
- **Lead Status & Priority:** Dropdown selectors
- **Feedback After Call:** Textarea for notes
- **Follow-ups:** Unlimited follow-up tracking with scheduled date, actual date, answered (Yes/No), and comments
- **Demo Session Invites:** Invite to Demo 1-4, track attendance, remove invites
- **Contact Information:** Phone, email (read-only)

---

## 2. Registrations Page (`public/frontend/pages/registrations/registrationsPage.js`)

### Key Functions
- `ensureOfficersLoaded()` - Cache officers list via `/api/users/officers`
- `openDetailsModal(reg)` - Open registration details with assignment dropdown
- Main API used: `window.API.registrations.*`

### API Endpoints Called (Lines 1-100)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/users/officers` | GET | Get officer list for assignment dropdown |
| `/api/registrations/admin/list` | GET | List all registrations (admin) |
| `/api/registrations/admin/assign` | POST | Assign registration to officer |
| `/api/registrations/admin/delete` | DELETE | Delete registration |
| `/api/registrations/admin/enroll` | POST | Enroll registration |
| `/api/registrations/payments/add` | POST | Add payment to registration |
| `/api/registrations/payments/delete` | DELETE | Remove payment |
| `/api/registrations/payments/list` | GET | List payments for registration |
| `/api/payment-setup/batches/{batchName}` | GET | Get payment setup info |
| `/api/programs/sidebar` | GET | Get programs and batches |
| `/api/registrations/admin/export-sheet` | POST | Export registrations to sheet |

### Key Structure (Lines 1-100)

**Registration Object:**
```javascript
{
  id, created_at,
  program_name, batch_name,
  name, phone_number, email,
  gender, date_of_birth, address,
  country, wa_number, working_status,
  course_program, source,
  assigned_to, // Officer assignment
  payload: {
    // Legacy fields: program_name, batch_name, assigned_to, etc.
  }
}
```

**Modal Features:**
- Display: Name, Phone, Email, Gender, DOB, Address, Country, WhatsApp, Working Status, Course/Program, Source
- **Assigned Dropdown:** Officer selection (loaded from `/api/users/officers`)
- **Save Button:** Update assignment
- **Payment Toggle:** Mark payment received
- **Enroll Button:** Enroll in program
- **Delete Button:** Remove registration
- **Export Button:** Export to Google Sheets

### Officer Assignment
- Fetches officers via `window.API.users.officers()` which calls `/api/users/officers`
- Dropdown populated with officer names
- Save triggers `window.API.registrations.adminAssign(registrationId, assignedTo)`

---

## 3. Daily Checklist Page (`public/frontend/pages/reports/dailyChecklistPage.js`)

### Key Functions
- `recordSnapshotForDate(dateISO)` - Record daily snapshot
- `saveRecordingStatus({dateISO, officerUserId, status})` - Save call recording status
- `computeLeader(data)` - Calculate Leader of the Week
- `renderDaySection(dateISO, officers, matrix)` - Render daily checklist

### The "Record" Button (Lines 113-114)
**Purpose:** Records a snapshot of leads-to-be-contacted count for the day, "freezing" it at that moment.
- **Data Saved:** Captures `leadsToBeContacted` count and marks `hasSnapshot: true`
- **Endpoint:** `POST /api/reports/daily-checklist/snapshot`
- **Disabled After:** Day passes (based on Sri Lanka timezone offset: 330 minutes)
- **Behavior:** Clicking "Record" freezes the leads count as "❄️ frozen" in the UI

### Leader of the Week Section (Lines 139-190)
**Calculation Priority:**
1. **Highest reports submitted** (slot1 + slot2 + slot3 submissions)
2. **Highest recordings received** (call_recording = 'received' count)
3. **Lowest leads-to-be-contacted** (fewest uncontacted leads)

**Returned Structure:**
```javascript
{
  officer: { id, name },
  agg: {
    reports: <total slot submissions>,
    recordings: <received count>,
    toContact: <sum of uncontacted leads>
  },
  totals: {
    reportsTotal: (days.length * 3),
    recordingsTotal: days.length,
    daysCount: days.length
  }
}
```

### API Endpoints (Lines 1-150)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/reports/daily-checklist?start=DATE&days=N` | GET | Load checklist for date range |
| `/api/reports/daily-checklist/snapshot` | POST | Record daily snapshot (freezes lead count) |
| `/api/reports/daily-checklist/call-recording` | PUT | Update recording status (received/not_received/na) |

### Key Data Structure

**Checklist Matrix:**
```javascript
{
  officers: [{ id, name }, ...],
  days: ["2024-01-01", ...],
  byDate: {
    "2024-01-01": {
      "officer-id": {
        slot1: boolean,       // Slot 1 report submitted
        slot2: boolean,       // Slot 2 report submitted
        slot3: boolean,       // Slot 3 report submitted
        leadsToBeContacted: number,
        hasSnapshot: boolean, // True if frozen
        callRecording: "received" | "not_received" | "na"
      }
    }
  }
}
```

**Daily Checklist Display:**
- Officer Name
- Slot 1/2/3 Report Status (badges: Submitted/Not submitted)
- Leads Count (live or frozen ❄️)
- Call Recordings Dropdown (Received/Not received/—)

---

## 4. Demo Sessions Page (`public/frontend/pages/demoSessions/demoSessionsPage.js`)

### Key Functions
- `loadSessions()` - Load demo sessions for batch
- `loadInvites()` - Load invites for selected session
- `loadRemindersForInvite(inviteId)` - Load reminders for invite
- `saveReminderFromModal()` - Add reminder to invite
- `renderSessions()` - Render session cards
- `renderInvites()` - Render invite table with editable fields

### API Endpoints (Lines 1-100)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/demo-sessions/sessions?batch=X` | GET | List all demo sessions for a batch |
| `/api/demo-sessions/sessions` | POST | Create demo session |
| `/api/demo-sessions/invites?sessionId=X&officerId=Y` | GET | List invites for session (optionally filtered by officer) |
| `/api/demo-sessions/invites/{inviteId}` | GET/PATCH/DELETE | Get/update/remove invite |
| `/api/demo-sessions/invites/{inviteId}/reminders` | GET | List reminders for invite |
| `/api/demo-sessions/invites/{inviteId}/reminders` | POST | Add reminder to invite |
| `/api/users/officers` | GET | Load officers for filter dropdown |
| `/api/programs/sidebar` | GET | Load programs and batches |

### Key Data Structures

**Session Object:**
```javascript
{
  id,
  batch_name,
  demo_number: 1, 2, 3, or 4,
  title: "Demo 1", // or custom
  scheduled_at: ISO string,
  // ... other fields
}
```

**Invite Object:**
```javascript
{
  id,
  session_id,
  name,           // Lead/participant name
  contact_number, // Phone
  invite_status: "Invited" | "Confirmed" | "Cancelled" | "Not reachable",
  attendance: "Unknown" | "Attended" | "Not attended",
  response: "Pending" | "Positive" | "Negative" | "Neutral",
  comments_after_inauguration: string,
  // ... created_at, sent_at, etc.
}
```

**Reminder Object:**
```javascript
{
  id,
  invite_id,
  reminder_number,
  sent_at: ISO string,
  note: string,
  remindAt: ISO string (when reminder was scheduled)
}
```

### Table Columns (Editable)
1. Name (read-only)
2. Contact Number (read-only)
3. Invite Status (dropdown: Invited, Confirmed, Cancelled, Not reachable)
4. Reminders (badges: R1, R2, etc. + "Add" button)
5. Attendance (dropdown: Unknown, Attended, Not attended) - color-coded
6. Response (dropdown: Pending, Positive, Negative, Neutral)
7. Comments (text input, debounced on blur)

### Reminder Modal
- **When:** Date/time input (defaults to +1 hour)
- **Note:** Optional text
- **API Call:** `POST /api/demo-sessions/invites/{inviteId}/reminders`

---

## 5. Backend Users Routes (`backend/modules/users/usersRoutes.js`)

### ALL Routes Defined

#### Officer/Staff Retrieval Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `GET /api/users/officers` | GET | isAdmin | Get only officers (role='officer' or 'admission_officer') |
| `GET /api/users` | GET | None | Get all users (admins, officers, with metadata) |

#### User Management Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `POST /api/users` | POST | None | Create new user (officer/admin) |
| `DELETE /api/users/:id` | DELETE | None | Delete user (prevents deleting last admin) |
| `PUT /api/users/:id` | PUT | None | Update user name/role |

#### Email & Password Management

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `POST /api/users/:id/confirm-email` | POST | None | Manually confirm user email |
| `PUT /api/users/:id/password` | PUT | None | Change user password |

#### Staff Roles & Supervisor Assignment

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `PUT /api/users/:id/roles` | PUT | None | Update staff_roles and supervisees |

### Key Data Structures

#### Officer Response (`GET /api/users/officers`)
```javascript
{
  success: true,
  officers: [
    {
      id: "user-uuid",
      name: "Officer Name",
      email: "officer@ucags.edu.lk"
    }
  ],
  source: "supabase" | "mock"
}
```

#### Full User Response (`GET /api/users`)
```javascript
{
  success: true,
  users: [
    {
      id: "user-uuid",
      email: "user@ucags.edu.lk",
      name: "User Name",
      role: "admin" | "officer",
      staff_roles: ["academic_advisor", "supervisor", "batch_coordinator", "finance_manager"],
      supervisees: ["officer-id-1", "officer-id-2"], // Only if role includes supervisor
      last_set_password: "password",
      created_at: ISO string,
      last_sign_in_at: ISO string,
      email_confirmed: boolean
    }
  ],
  source: "supabase" | "mock"
}
```

### Staff Roles & Supervisor Management

**Request Body for `PUT /api/users/:id/roles`:**
```javascript
{
  staff_roles: ["academic_advisor", "supervisor", "batch_coordinator", "finance_manager"],
  supervisees: ["officer-uuid-1", "officer-uuid-2"] // Only relevant if "supervisor" included
}
```

**Valid staff_roles:**
- `academic_advisor`
- `supervisor`
- `batch_coordinator`
- `finance_manager`

**Logic:**
- `supervisees` array is **only saved** if `staff_roles` includes `"supervisor"`
- If supervisor role is removed, supervisees array is cleared
- All roles are filtered against `validRoles` whitelist

### User Creation Details (`POST /api/users`)
```javascript
{
  email: "required",
  name: "required",
  role: "officer" | "admin", // defaults to 'officer'
  password: "optional" // defaults to 'ucags123'
}
```

**Response includes:**
- User object
- `sheetCreated`: Whether personal leads sheet was created
- `attendanceSheetCreated`: Whether attendance sheet was created
- `emailConfirmed`: Whether email is confirmed

### Authentication & Filtering
- **Admin Detection:** Email-based (hardcoded: `admin@ucags.edu.lk`, `mohamedunais2018@gmail.com`)
- **Officer Filtering:** `role === 'officer' || role === 'admission_officer'` (excludes admins)
- **Supabase Fallback:** Uses mock data if Supabase unavailable

---

## Summary: Officer Assignment Flow

### Complete Officer Assignment Workflow

1. **Load Officers List:**
   - Frontend calls: `GET /api/users/officers`
   - Response contains array of officers with `id`, `name`, `email`

2. **Display Officer Dropdowns:**
   - Registrations page: Assign registration to officer
   - Demo Sessions page: Filter invites by officer
   - Lead Management: (Officer selector for admin bulk actions - not shown in first 150 lines)

3. **Update Officer Assignment:**
   - Registrations: `POST /api/registrations/admin/assign` with officer ID
   - Leads/Demo Sessions: Various endpoints with `assigned_to` or `officerId` parameter

4. **Manage Officer Roles & Supervisors:**
   - `PUT /api/users/:id/roles` with:
     - `staff_roles`: Array of role strings
     - `supervisees`: Array of officer IDs (only for supervisors)

### Staff Role Hierarchy
- **Admin:** System admin, full access
- **Academic Advisor:** Can manage leads, registrations
- **Supervisor:** Can manage supervisees (other officers)
- **Batch Coordinator:** Can coordinate batch-level activities
- **Finance Manager:** Can manage payments

---

## Key Observations

1. **No Explicit Officer-to-Lead Assignment in Lines 1-150:**
   - Lead Management focuses on officer viewing their own leads
   - Admin view shows all leads (`/api/crm-leads/admin`)
   - Assignment happens through programs/batches context

2. **Dual Data Storage:**
   - Leads data in Supabase CRM tables
   - Follow-ups normalized in Supabase (`/api/crm-followups/my/...`)
   - Google Sheets as fallback/export target

3. **Time Zone Handling:**
   - Daily Checklist uses Sri Lanka offset (330 minutes)
   - Snapshot recording disabled after day passes

4. **Dynamic Follow-ups:**
   - Supports unlimited follow-ups (followUp1, followUp2, ... followUpN)
   - Each with scheduled date, actual date, answered flag, comments

5. **Demo Session Integration:**
   - Leads can be invited to 4 separate demo sessions
   - Invites tracked with attendance and responses
   - Reminders system for follow-up
