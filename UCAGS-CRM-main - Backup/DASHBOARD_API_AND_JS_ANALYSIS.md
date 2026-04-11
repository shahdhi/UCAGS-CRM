# Dashboard API Endpoints & JavaScript Functions Analysis

## API Endpoints Called by Dashboard

### XP System Endpoints

#### 1. GET `/api/xp/leaderboard`
**Called by:** `renderXPLeaderboard()` (Admin only)
**Response:**
```json
{
  "leaderboard": [
    {
      "name": "Officer Name",
      "totalXp": 1250
    }
  ]
}
```
**Error handling:** Displays red error message with `#ef4444` color

#### 2. GET `/api/xp/me`
**Called by:** `renderPersonalXP()` (Officer only)
**Response:**
```json
{
  "totalXp": 450,
  "rank": 3,
  "totalOfficers": 12,
  "recentEvents": [
    {
      "event_type": "lead_contacted",
      "xp": 10,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### 3. GET `/api/xp/global-trend?days={days}`
**Called by:** `renderXPTrend(days)` (Admin only)
**Parameters:** `days` = 7 or 30
**Response:**
```json
{
  "trend": [
    {
      "date": "2024-01-15",
      "xp": 250
    }
  ]
}
```

#### 4. GET `/api/xp/trend?days={days}`
**Called by:** `renderXPTrend(days)` (Officer only)
**Parameters:** `days` = 7 or 30
**Response:**
```json
{
  "trend": [
    {
      "date": "2024-01-15",
      "xp": 45
    }
  ]
}
```

---

## UI Helper Functions (public/js/ui.js)

### UI Object Methods

#### 1. `UI.showFollowUpCalendarSkeleton()`
- Shows loading skeleton for calendar
- Sets placeholder text: "Loading…"
- Displays shimmer animations

#### 2. `UI.hideFollowUpCalendarSkeleton()`
- Removes loading skeleton overlay
- Adds `hidden` class to overlay element

#### 3. `UI.renderFollowUpCalendar(overdue, upcoming, tasks)`
- **Elements populated:**
  - `#overdueList` - Overdue follow-ups
  - `#upcomingList` - Upcoming follow-ups
  - Sets up collapsible headers
- **Event Structure:**
  ```javascript
  {
    date: "2024-01-15T10:30",
    batchName: "Batch-14",
    sheetName: "Main Leads",
    officerName: "John Doe",
    leadId: "lead-123",
    followUpNo: 1,
    full_name: "Client Name",
    phone: "+1234567890",
    comment: "Follow-up notes",
    __type: "task" | undefined,
    __taskId: "task-123",
    __taskVisibility: "personal" | "shared",
    __taskRepeat: "none" | "daily" | "weekly" | "monthly"
  }
  ```

#### 4. `UI.renderFollowUpMonthGrid()`
- Populates `#calendarGrid` with month calendar
- Updates `#calendarMonthLabel` with month/year
- Shows overdue/upcoming badges per day
- Handles click events to change selected day

#### 5. `UI.renderFollowUpDay(ymd)`
- Populates `#calendarSelectedDayTitle` with date
- Populates `#calendarSelectedDayEvents` with day's tasks
- Groups tasks by date (Today/Tomorrow/other dates)

#### 6. `UI.show(elementId)` & `UI.hide(elementId)`
- Adds/removes `active` class from elements

#### 7. `UI.showToast(message, type)`
- **Types:** 'success', 'error', 'info'
- Creates toast container if needed (ID: `toastContainer`)
- Auto-removes after 4 seconds with fade-out transition

#### 8. `UI.formatDate(dateString)`
- Format: `en-US` (e.g., "Jan 15, 2024")
- Returns "N/A" if no date provided

#### 9. `UI.formatDateTime(dateString)`
- Format: `en-US` with time (e.g., "Jan 15, 2024, 10:30 AM")

#### 10. `UI.getStatusBadge(status)`
- Returns `<span class="status-badge status-{status}">Status</span>`

#### 11. `UI.renderOfficerStats(officerStats)`
- Populates `#officersStats` container
- Shows officer cards with stats grid:
  - Total, New, Contacted, Follow-up, Registered, Closed

#### 12. `UI.renderLeadsTable(leads)`
- Populates `#leadsTableBody` with lead rows
- Shows: ID, Name, Email, Phone, Course, Source, Status, Officer, Date, Actions

---

## Main Application Logic (public/js/app.js)

### Global Variables
```javascript
let currentUser = null          /* Current logged-in user */
let currentEnquiries = []       /* Array of current enquiries */
window.currentUser = null       /* Global reference */
window.adminProgramId = null    /* Admin's selected program */
window.officerProgramId = null  /* Officer's selected program */
window.officerBatchFilter = 'all'
window.officerSheetFilter = ''
window.adminBatchFilter = ''
window.adminSheetFilter = ''
```

### Authentication Functions

#### 1. `initializeApp()`
- Called on DOMContentLoaded
- Waits for Supabase auth module
- Checks current session
- Sets up auth state change listener

#### 2. `getAuthHeadersWithRetry(maxWaitMs = 1500)`
- Polls Supabase for valid session token
- Returns `{ 'Authorization': 'Bearer {token}' }`
- Retries with 100ms backoff
- Falls back to empty headers if timeout

#### 3. `handleLogin(e)`
- Submits email/password to `SupabaseAuth.signIn()`
- Sets `currentUser` object with: id, email, name, role
- Calls `showDashboard()` on success
- Handles errors with display in `#loginError`

#### 4. `handleLogout()`
- Calls `SupabaseAuth.signOut()`
- Clears `currentUser`, `currentEnquiries`
- Stops dashboard auto-refresh
- Clears navigation state
- Calls `showLogin()`

### Dashboard Display Functions

#### 5. `showLogin()`
- Hides `#dashboardPage`, shows `#loginPage`
- Clears `#userDisplay`, `#sidebarUserName`, etc.
- Resets login form
- Calls `setupAuthForms()`

#### 6. `showDashboard()`
- Hides `#loginPage`, shows `#dashboardPage`
- Updates user info:
  - `#userDisplay` - User name
  - `#sidebarUserName` - User name in sidebar
  - `#sidebarUserRole` - Role text
- Adds `admin` class to body if admin role
- Calls setup functions:
  - `setupNavigation()`
  - `setupEventListeners()`
  - `setupUserManagement()`
  - `setupRouting()`
- Loads:
  - `loadBatchesMenu()` - For admin
  - `loadOfficerLeadsBatchesMenu()` - For officer
  - `startDashboardAutoRefresh()`
  - `updateEnquiriesBadge()`
  - NotificationCenter initialization

### Batch Loading Functions

#### 7. `loadBatchesMenu()` (Admin only)
- **API Call:** `GET /api/programs/sidebar`
- **Response:**
  ```json
  {
    "success": true,
    "programs": [{ "id": "prog-1", "name": "Program A" }],
    "batches": [{ "program_id": "prog-1", "batch_name": "Batch-14", "is_current": true }]
  }
  ```
- Populates `#leadsBatchesMenu` with program links
- Each link sets `window.adminProgramId` when clicked
- Groups batches by program ID

#### 8. `loadOfficerLeadsBatchesMenu()` (Officer only)
- **API Call:** `GET /api/programs/sidebar`
- Populates:
  - `#officerLeadsBatchesMenu` - Officer leads links
  - `#officerLeadManagementBatchesMenu` - Officer management links
- Uses default sheet: "Main Leads"
- Sets `window.officerProgramId` when clicked

### Navigation Functions

#### 9. `setupNavigation()`
- Binds click handlers to:
  - `.nav-item` elements
  - `.nav-subitem` elements
  - `.nav-section-header` elements
- Toggles `active` class
- Closes mobile menu on click

#### 10. `navigateToPage(page)`
- Updates URL hash: `window.location.hash = page`
- Removes `active` class from all nav items
- Adds `active` to matching nav item
- Hides all `.content-view`, shows matching view
- Calls page-specific init functions
- Updates `#pageTitle` text

**Page Routing Cases:**
```javascript
switch(page) {
  case 'home':              loadDashboard()
  case 'contacts':          loadContacts()
  case 'calendar':          loadCalendar()
  case 'leads-myLeads':     initLeadsPage('myLeads')
  case 'lead-management':   initLeadManagementPage()
  case 'demo-sessions':     initDemoSessionsPage()
  case 'attendance':        initAttendancePage()
  case 'reports':           loadReports()
  case 'registrations':     initRegistrationsPage()
  case 'registrations-my':  initMyRegistrationsPage()
  case 'payments':          initPaymentsPage()
  case 'students':          initStudentsPage()
  case 'users':             loadUsers()
  case 'programs':          initProgramsPage()
  case 'batch-management':  initBatchManagementPage()
  case 'daily-checklist':   initDailyChecklistPage()
  case 'settings':          loadSettings()
  case 'notifications':     NotificationsPage.init()
}
```

#### 11. `parseLeadsRouteIntoFilters(page)`
- Parses URL-encoded batch/sheet info from page name
- Sets `window.officerBatchFilter`, `window.officerSheetFilter`
- Extracts program ID from slug: `programId__PROG__batchName`

#### 12. `setupRouting()`
- Listens to `hashchange` events
- Calls `navigateToPage()` on hash change
- Initializes with hash or defaults to 'home'

### Event Setup Functions

#### 13. `setupEventListeners()`
- Binds to logout button: `#logoutBtn`
- Sets up click handlers for various features

#### 14. `setupUserManagement()`
- Initializes user profile displays
- May setup edit/profile modals (not in main code shown)

#### 15. `setupAuthForms()`
- Clones login form to remove old event listeners
- Binds `submit` event to `handleLogin()`
- Ensures submit button state is reset

### Dashboard Refresh

#### 16. `startDashboardAutoRefresh()` / `stopDashboardAutoRefresh()`
- Auto-refreshes dashboard every 5 minutes
- Can be stopped on logout

#### 17. `loadDashboard()`
- Main dashboard loader (called when page = 'home')
- Likely calls analytics/KPI loading functions
- May call `window.loadXPDashboard()` after analytics loads

### Sheet Management Functions

#### 18. `updateDeleteSheetButtons(page)`
- Shows/hides sheet delete buttons based on route
- For officer leads/management pages:
  - **API:** `DELETE /api/crm-leads/meta/sheets?batch=...&sheet=...&scope=officer`
- For admin pages:
  - **API:** `DELETE /api/crm-leads/meta/sheets?batch=...&sheet=...&scope=admin`
- Falls back to "Main Leads" sheet after deletion

---

## Window Object Exports

### Functions Exposed Globally
```javascript
window.currentUser              /* Current user object */
window.getAuthHeadersWithRetry  /* Get auth headers */
window.loadXPDashboard          /* Load XP system */
window.navigateToPage           /* Navigate to page */
window.openModal()              /* Open modal dialog */
window.closeModal()             /* Close modal dialog */
window.showToast()              /* Show toast notification */
```

### Module Initialization Functions
```javascript
window.initLeadsPage()              /* Initialize leads view */
window.initLeadManagementPage()     /* Initialize lead management */
window.initDemoSessionsPage()       /* Initialize demo sessions */
window.initStaffLeadManagementPage() /* Initialize staff lead management */
window.initAttendancePage()         /* Initialize attendance */
window.initRegistrationsPage()      /* Initialize registrations */
window.initMyRegistrationsPage()    /* Initialize my registrations */
window.initPaymentsPage()           /* Initialize payments */
window.initStudentsPage()           /* Initialize students */
window.initProgramsPage()           /* Initialize programs */
window.initBatchManagementPage()    /* Initialize batch management */
window.initDailyChecklistPage()     /* Initialize daily checklist */
```

### Notification & Utility Functions
```javascript
window.NotificationCenter           /* Notification system */
window.NotificationCenter.init()    /* Initialize notifications */
window.NotificationCenter.updateBadge() /* Update badge count */
window.Notifications                /* Client-side notifications */
window.Notifications.init()         /* Initialize reminders */
window.WhatsAppPanel                /* WhatsApp integration */
```

---

## Authentication Details

### User Object Structure
```javascript
{
  id: "user-uuid",
  email: "user@example.com",
  name: "User Name",
  role: "admin" | "officer"  /* Determined by email or metadata */
}
```

### Admin Email List
```javascript
[
  'admin@ucags.edu.lk',
  'mohamedunais2018@gmail.com'
]
```

### Role Determination
1. Check `user.user_metadata?.role`
2. If email in admin list → role = 'admin'
3. Otherwise → role = 'user' or 'officer'

---

## Chart.js Integration

### XP Trend Chart Configuration
- **Library:** Chart.js
- **Canvas ID:** `#xpTrendChart`
- **Chart Type:** Line
- **Responsive:** true
- **Plugins:**
  - Legend: hidden
  - Tooltip: shows "X XP" format
- **Scales:**
  - X-axis: max 8 ticks, 11px font
  - Y-axis: begins at 0, 11px font

---

## Error Handling Patterns

### Authentication Errors
```javascript
try {
  const result = await SupabaseAuth.signIn(email, password);
  if (result?.error) {
    errorDiv.textContent = result.error.message;
    return;
  }
} catch (error) {
  errorDiv.textContent = error.message || 'Login failed';
}
```

### API Call Error Handling (XP)
```javascript
try {
  const r = await fetch('/api/xp/leaderboard', { headers });
  const j = await r.json();
  if (!j.leaderboard) return;
  // Process data
} catch (e) {
  el.innerHTML = '<p style="color:#ef4444;">Failed to load...</p>';
}
```

### Navigation Error Fallback
```javascript
if (!viewElement) {
  window.location.hash = 'home';
  return;
}
```

---

## Session Management

### Token Handling
- Tokens obtained from Supabase session
- Passed in `Authorization` header: `Bearer {token}`
- Used for protected API endpoints
- Cached locally during session

### Logout Cleanup
1. Signs out with Supabase
2. Clears `currentUser` and `window.currentUser`
3. Stops auto-refresh timers
4. Clears navigation state
5. Resets form values
6. Returns to login page

---
