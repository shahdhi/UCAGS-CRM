# UCAGS CRM Navigation Structure - Complete Analysis

## 1. NAV-ITEM ELEMENTS (public/index.html, lines 68-228)

### Root Level Navigation Items

#### Always Visible (Both Admin & Officer):
1. **Home** `data-page="home"` (line 68)
   - ID: none
   - Icon: `fas fa-home`
   - Classes: `nav-item active`

2. **Calendar** `data-page="calendar"` (line 73)
   - Icon: `fas fa-calendar-alt`
   - Classes: `nav-item`

3. **Contacts** `data-page="contacts"` (line 78)
   - Icon: `fas fa-address-book`
   - Classes: `nav-item`

4. **Demo Sessions** `data-page="demo-sessions"` (line 129)
   - Icon: `fas fa-chalkboard-teacher`
   - Classes: `nav-item`

5. **WhatsApp** `data-page="whatsapp"` (line 162)
   - Icon: `fab fa-whatsapp`
   - Classes: `nav-item`

6. **Gmail** `data-page="gmail"` (line 167)
   - Icon: `fas fa-envelope`
   - Classes: `nav-item nav-disabled`
   - Badge: "Soon"
   - Status: Coming soon (disabled)

7. **Call Center** `data-page="call"` (line 173)
   - Icon: `fas fa-phone`
   - Classes: `nav-item nav-disabled`
   - Badge: "Soon"
   - Status: Coming soon (disabled)

8. **Reports** `data-page="reports"` (line 192)
   - Icon: `fas fa-chart-line`
   - Classes: `nav-item`

9. **Notifications** `data-page="notifications"` (line 220)
   - Icon: `fas fa-bell`
   - Classes: `nav-item`

10. **Settings** `data-page="settings"` (line 225)
    - Icon: `fas fa-cog`
    - Classes: `nav-item`

---

### OFFICER-ONLY Items (non-admin users)

#### Leads Section (Collapsible) `id="officerLeadsSection"` (line 84)
- Classes: `nav-section officer-only`
- Header: "Leads" icon `fas fa-users`
- Submenu ID: `officerLeadsBatchesMenu`
- Contains:
  - "All" subitem `data-page="leads-myLeads"`
  - Dynamic batch subitems injected by JavaScript

#### Lead Management Section (Collapsible) `id="officerLeadManagementSection"` (line 109)
- Classes: `nav-section officer-only`
- Header: "Lead Management" icon `fas fa-tasks`
- Submenu ID: `officerLeadManagementBatchesMenu`
- Contains:
  - "All" subitem `data-page="lead-management"`
  - Dynamic batch subitems injected by JavaScript

#### Registrations (Officer) `data-page="registrations-my"` (line 139)
- Classes: `nav-item officer-only`
- Icon: `fas fa-clipboard-list`
- Label: "Registrations"

#### Batch Management `data-page="batch-management"` (line 149)
- Classes: `nav-item officer-only`
- Icon: `fas fa-money-check-dollar`
- Label: "Batch management"

#### Staff Attendance (Officer) `data-page="attendance"` (line 182)
- Classes: `nav-item officer-only`
- Icon: `fas fa-clipboard-check`
- Label: "Staff Attendance"

---

### ADMIN-ONLY Items (admin=true users only)

#### Leads Section (Collapsible) - Admin (line 99)
- Classes: `nav-section admin-only`
- Header: "Leads" icon `fas fa-users`
- Submenu ID: `leadsBatchesMenu`
- Contains: Dynamic program/batch subitems injected by JavaScript

#### Lead Management (Admin) `data-page="staff-lead-management"` (line 124)
- Classes: `nav-item admin-only`
- Icon: `fas fa-tasks`
- Label: "Lead Management"

#### Registrations (Admin) `data-page="registrations"` (line 134)
- Classes: `nav-item admin-only`
- Icon: `fas fa-clipboard-list`
- Label: "Registrations"

#### Payments `data-page="payments"` (line 144)
- Classes: `nav-item admin-only`
- Icon: `fas fa-money-check-dollar`
- Label: "Payments"

#### Students `data-page="students"` (line 154)
- Classes: `nav-item admin-only`
- Icon: `fas fa-user-graduate`
- Label: "Students"

#### Staff Attendance (Admin) `data-page="attendance"` (line 187)
- Classes: `nav-item admin-only`
- Icon: `fas fa-clipboard-check`
- Label: "Staff Attendance"

#### Daily Checklist `data-page="daily-checklist"` (line 197)
- Classes: `nav-item admin-only`
- Icon: `fas fa-clipboard-check`
- Label: "Daily Checklist"

#### Staff Management `data-page="users"` (line 205)
- Classes: `nav-item admin-only`
- Icon: `fas fa-users-cog`
- Label: "Staff Management"

#### Programs `data-page="programs"` (line 210)
- Classes: `nav-item admin-only`
- Icon: `fas fa-layer-group`
- Label: "Programs"

#### Receipts `data-page="receipts"` (line 215)
- Classes: `nav-item admin-only`
- Icon: `fas fa-receipt`
- Label: "Receipts"

---

### Nav Dividers (Role-specific separators)
- Line 159: `nav-divider admin-only`
- Line 160: `nav-divider officer-only`
- Line 179: `nav-divider admin-only`
- Line 180: `nav-divider officer-only`
- Line 202: `nav-divider admin-only`
- Line 203: `nav-divider officer-only`

---

## 2. CSS VISIBILITY RULES (public/css/sidebar.css)

### Body-Level Role Classes
The application sets `document.body.classList` to control which elements display:

```css
/* Hide/show nav items based on body class */
body.admin .officer-only {
    display: none !important;
}

body:not(.admin) .admin-only {
    display: none !important;
}
```

**Actual CSS rules in sidebar.css:**
- Lines 179-249: `.nav-item` styles (default visible)
- Lines 286-340: `.nav-section` styles (default visible for both roles)
- Lines 342-372: `.nav-subitem` styles (default visible)

**The visibility filtering happens through:**
1. **`body.admin` class** - Added when `currentUser.role === 'admin'` (app.js line 175)
2. **`body:not(.admin)` selector** - Implicit for officer users

**Key CSS Classes for visibility:**
- `.admin-only` - Elements with this class are hidden when `body` does NOT have `.admin` class
- `.officer-only` - Elements with this class are hidden when `body` DOES have `.admin` class

**Specific HTML Elements Hidden/Shown:**

Admin sees:
```css
.admin-only { display: block; }  /* visible */
.officer-only { display: none; } /* hidden */
```

Officer sees:
```css
.admin-only { display: none; }   /* hidden */
.officer-only { display: block; } /* visible */
```

### Additional Styling Rules

#### Nav Item States (lines 179-249)
```css
.nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    color: rgba(255, 255, 255, 0.8);
    text-decoration: none;
    transition: all 0.2s ease;
    cursor: pointer;
}

.nav-item:hover {
    background: rgba(139, 92, 246, 0.3);
    color: white;
}

.nav-item.active {
    background: rgba(139, 92, 246, 0.4);
    color: white;
    font-weight: 600;
    border: 1px solid rgba(139, 92, 246, 0.5);
}

.nav-item.nav-disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
}
```

#### Nav Section States (lines 286-340)
```css
.nav-section {
    margin-bottom: 4px;
    display: block;
}

.nav-section.active .toggle-icon {
    transform: rotate(180deg);
}

.nav-section.active .nav-submenu {
    max-height: 500px;
}

.nav-submenu {
    max-height: 0;
    overflow: hidden;
    transition: max-height var(--transition-base);
    padding-left: 32px;
}
```

#### Nav Divider (line 375-379)
```css
.nav-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    margin: 12px 12px;
}
```

---

## 3. JAVASCRIPT NAVIGATION LOGIC (public/js/app.js)

### Role Detection & Body Class Setting (lines 152-181)

```javascript
async function showDashboard() {
    // ... UI setup ...
    
    // Show/hide admin features by setting body class
    if (currentUser.role === 'admin') {
        document.body.classList.add('admin');
        console.log('✓ Admin user detected - showing admin features');
    } else {
        document.body.classList.remove('admin');
        console.log('✓ Officer user detected - hiding admin features');
    }
    
    // Initialize navigation
    if (!window.__navInitialized) {
        setupNavigation();
        setupEventListeners();
        setupUserManagement();
        setupRouting();
        window.__navInitialized = true;
    }
}
```

**Key Points:**
- Line 175: `document.body.classList.add('admin')` - Admin role
- Line 178: `document.body.classList.remove('admin')` - Officer role
- This single body class controls ALL admin/officer visibility throughout the app

### setupNavigation() Function (lines 549-655)

```javascript
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item, .nav-subitem');
    const navSections = document.querySelectorAll('.nav-section');
    
    // Handle main nav items and subitems
    navItems.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            
            if (!page) return;
            
            // Update URL hash
            window.location.hash = page;
            
            // Navigate to page
            navigateToPage(page);
            
            // Close mobile menu if open
            closeMobileMenu();
        });
    });
    
    // Handle collapsible sections
    navSections.forEach(section => {
        const header = section.querySelector('.nav-section-header');
        header.addEventListener('click', (e) => {
            e.preventDefault();
            section.classList.toggle('active');
        });
    });
}
```

**Click Flow:**
1. User clicks `.nav-item` or `.nav-subitem`
2. Extract `data-page` attribute
3. Set `window.location.hash = page`
4. Call `navigateToPage(page)` function
5. Close mobile menu if open

### setupRouting() Function (lines 670-682)

```javascript
function setupRouting() {
    // Handle browser back/forward buttons
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1);
        const page = hash || 'home';
        navigateToPage(page);
    });
    
    // Load initial page based on URL hash
    const hash = window.location.hash.slice(1);
    const initialPage = hash || 'home';
    navigateToPage(initialPage);
}
```

**Routing Mechanism:**
- URL hash-based navigation (`#home`, `#leads-myLeads`, etc.)
- Supports browser back/forward buttons
- Defaults to `#home` if no hash present

### navigateToPage() Function (lines 884-1027+)

```javascript
async function navigateToPage(page) {
    // Prevent duplicate navigation
    const now = Date.now();
    if (window.__navLastPage === page && window.__navLastAt && (now - window.__navLastAt) < 250) {
        return;
    }
    window.__navLastPage = page;
    window.__navLastAt = now;

    // Special handling for WhatsApp (opens external)
    if (page === 'whatsapp') {
        if (window.openWhatsAppSidePanel) {
            window.openWhatsAppSidePanel();
        }
        return;
    }

    // Update active nav links
    const navItems = document.querySelectorAll('.nav-item, .nav-subitem');
    navItems.forEach(link => {
        if (link.dataset.page === page) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Hide all views, then show the matching one
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });

    // Route to correct view and initialize
    if (page.startsWith('leads-')) {
        const viewElement = document.getElementById('leadsView');
        if (viewElement) {
            viewElement.classList.add('active');
            // Initialize leads page with appropriate filters
            if (window.initLeadsPage) {
                window.initLeadsPage(/* parameters */);
            }
        }
    } else if (page === 'lead-management' || page.startsWith('lead-management-batch-')) {
        const viewElement = document.getElementById('lead-managementView');
        if (viewElement) {
            viewElement.classList.add('active');
            if (window.initLeadManagementPage) {
                window.initLeadManagementPage();
            }
        }
    } else {
        // Standard view mapping: page="home" → viewElement="homeView"
        const viewElement = document.getElementById(`${page}View`);
        if (viewElement) {
            viewElement.classList.add('active');
        }
    }

    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    const activeLink = document.querySelector(
        `.nav-item[data-page="${page}"], .nav-subitem[data-page="${page}"]`
    );
    if (pageTitle && activeLink) {
        pageTitle.textContent = activeLink.querySelector('span')?.textContent || page;
    }
}
```

**Navigation Steps:**
1. Prevent duplicate navigation within 250ms
2. Handle WhatsApp as external link
3. Set active class on matching nav items
4. Hide all `.content-view` elements
5. Show matching `#{page}View` element
6. Initialize page-specific JavaScript (if applicable)
7. Update page title in top bar

---

## 4. BATCH MENU LOADING (Dynamic Sidebar Content)

### For Admin Users (lines 336-411)

```javascript
async function loadBatchesMenu() {
    // Only load batches for admins
    if (!currentUser || currentUser.role !== 'admin') {
        return;
    }

    // Fetch programs + current batches from API
    const res = await fetch('/api/programs/sidebar', { headers: authHeaders });
    const json = await res.json();
    
    const programs = json.programs || [];
    const batches = json.batches || [];

    // Group batches by program
    const byProgram = new Map();
    batches.forEach(b => {
        const arr = byProgram.get(b.program_id) || [];
        arr.push(b);
        byProgram.set(b.program_id, arr);
    });

    // Populate #leadsBatchesMenu with program links
    const menu = document.getElementById('leadsBatchesMenu');
    for (const p of programs) {
        const bs = byProgram.get(p.id) || [];
        const current = bs.find(x => x.is_current);
        if (!current || !current.batch_name) continue;

        const batchSlug = `${encodeURIComponent(p.id)}__PROG__${encodeURIComponent(current.batch_name)}`;
        const leadsPage = `leads-batch-${batchSlug}__sheet__${encodeURIComponent('Main Leads')}`;
        
        // Create nav-subitem for each program
        const link = createLink(leadsPage, p.name);
        menu.appendChild(link);
    }
}
```

**Admin Menu Structure:**
- Fetches from `/api/programs/sidebar`
- Shows programs with current batches
- Sidebar menu ID: `#leadsBatchesMenu`
- Page format: `leads-batch-{programId}__PROG__{batchName}__sheet__Main Leads`

### For Officer Users (lines 252-333)

```javascript
async function loadOfficerLeadsBatchesMenu() {
    if (!currentUser || currentUser.role === 'admin') {
        return;
    }

    // Fetch programs + batches (same as admin)
    const res = await fetch('/api/programs/sidebar', { headers: authHeaders });
    const json = await res.json();
    
    const programs = json.programs || [];
    const batches = json.batches || [];
    
    // Populate both #officerLeadsBatchesMenu and #officerLeadManagementBatchesMenu
    const leadsMenu = document.getElementById('officerLeadsBatchesMenu');
    const mgmtMenu = document.getElementById('officerLeadManagementBatchesMenu');

    for (const p of programs) {
        const bs = byProgram.get(p.id) || [];
        const current = bs.find(x => x.is_current);
        if (!current?.batch_name) continue;

        const batchSlug = `${encodeURIComponent(p.id)}__PROG__${encodeURIComponent(current.batch_name)}`;
        
        const leadsPage = `leads-myLeads-batch-${batchSlug}__sheet__Main Leads`;
        const mgmtPage = `lead-management-batch-${batchSlug}__sheet__Main Leads`;
        
        leadsMenu.appendChild(createLink(leadsPage, p.name));
        mgmtMenu.appendChild(createLink(mgmtPage, p.name));
    }
}
```

**Officer Menu Structure:**
- Fetches from same `/api/programs/sidebar` endpoint
- Two separate menus:
  - `#officerLeadsBatchesMenu` (Leads section)
  - `#officerLeadManagementBatchesMenu` (Lead Management section)
- Page format: `leads-myLeads-batch-{programId}__PROG__{batchName}__sheet__Main Leads`

---

## 5. SWITCH ROLE FEATURE (Officer Only)

### Role Detection (lines 4046-4103)

```javascript
async function initSwitchRoleBtn() {
    const btn = document.getElementById('switchRoleBtn');
    const popup = document.getElementById('switchRolePopup');
    const list = document.getElementById('switchRoleList');
    if (!btn || !popup || !list) return;

    // Admin users never see this button
    if (!window.currentUser || window.currentUser.role === 'admin') {
        btn.style.display = 'none';
        return;
    }

    // Load staff_roles from Supabase user_metadata
    const roles = window.currentUser.staff_roles || [];

    // Only show button if officer has more than one role
    if (roles.length === 0) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = 'flex';
    
    // Track active role (default = first role)
    if (!window.currentUser.active_role) {
        window.currentUser.active_role = roles[0];
    }

    renderSwitchRoleList();

    // Toggle popup on button click
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = popup.classList.contains('hidden');
        popup.classList.toggle('hidden', !isHidden);
    });
}
```

**Switch Role Metadata (line 4035-4040):**
```javascript
const SWITCH_ROLE_META = {
    academic_advisor:  { label: 'Academic Advisor',  icon: 'fa-user-tie' },
    supervisor:        { label: 'Supervisor',         icon: 'fa-user-shield' },
    batch_coordinator: { label: 'Batch Coordinator',  icon: 'fa-layer-group' },
    finance_manager:   { label: 'Finance Manager',    icon: 'fa-coins' },
};
```

**Available Roles:**
1. Academic Advisor (`academic_advisor`)
2. Supervisor (`supervisor`)
3. Batch Coordinator (`batch_coordinator`)
4. Finance Manager (`finance_manager`)

**Button Location:** Top bar, right side (next to notifications)

---

## 6. SUMMARY TABLE: Complete Navigation Map

| Page ID | Label | Icon | Admin | Officer | Data-Page | View ID | Route |
|---------|-------|------|-------|---------|-----------|---------|-------|
| home | Home | home | ✓ | ✓ | home | homeView | #home |
| calendar | Calendar | calendar-alt | ✓ | ✓ | calendar | calendarView | #calendar |
| contacts | Contacts | address-book | ✓ | ✓ | contacts | contactsView | #contacts |
| leads | Leads (section) | users | (collapsible) | (collapsible) | — | leadsView | #leads-* |
| leads-admin | Lead Mgmt (admin) | tasks | ✓ | ✗ | staff-lead-management | lead-managementView | #staff-lead-management |
| lead-mgmt | Lead Mgmt (officer) | tasks | ✗ | ✓ | lead-management | lead-managementView | #lead-management |
| demo | Demo Sessions | chalkboard-teacher | ✓ | ✓ | demo-sessions | demoSessionsView | #demo-sessions |
| registrations-admin | Registrations | clipboard-list | ✓ | ✗ | registrations | registrationsView | #registrations |
| registrations-officer | Registrations | clipboard-list | ✗ | ✓ | registrations-my | registrationsView | #registrations-my |
| payments | Payments | money-check-dollar | ✓ | ✗ | payments | paymentsView | #payments |
| batch-mgmt | Batch Management | money-check-dollar | ✗ | ✓ | batch-management | batchManagementView | #batch-management |
| students | Students | user-graduate | ✓ | ✗ | students | studentsView | #students |
| attendance | Staff Attendance | clipboard-check | ✓ | ✓ | attendance | attendanceView | #attendance |
| whatsapp | WhatsApp | fab whatsapp | ✓ | ✓ | whatsapp | (external) | (web.whatsapp.com) |
| gmail | Gmail | envelope | ✓ | ✓ | gmail | (disabled) | — |
| call | Call Center | phone | ✓ | ✓ | call | (disabled) | — |
| reports | Reports | chart-line | ✓ | ✓ | reports | reportsView | #reports |
| checklist | Daily Checklist | clipboard-check | ✓ | ✗ | daily-checklist | — | #daily-checklist |
| users | Staff Management | users-cog | ✓ | ✗ | users | usersView | #users |
| programs | Programs | layer-group | ✓ | ✗ | programs | programsView | #programs |
| receipts | Receipts | receipt | ✓ | ✗ | receipts | receiptsView | #receipts |
| notifications | Notifications | bell | ✓ | ✓ | notifications | notificationsView | #notifications |
| settings | Settings | cog | ✓ | ✓ | settings | settingsView | #settings |

---

## 7. KEY TECHNICAL INSIGHTS

### Body Class Control Flow
```
Login → showDashboard() → if (role === 'admin') classList.add('admin')
                                                  else classList.remove('admin')
                     → CSS selectors hide/show admin-only / officer-only
                     → setupNavigation() attaches click listeners
                     → setupRouting() listens for hash changes
```

### Navigation Sequence
```
User clicks nav item
    ↓
data-page extracted
    ↓
window.location.hash = page
    ↓
hashchange event fires (or direct call to navigateToPage)
    ↓
.nav-item/.nav-subitem active state updated
    ↓
All .content-view hidden
    ↓
Matching #{page}View shown
    ↓
Page-specific initializer called (if applicable)
    ↓
Page title updated in top bar
```

### Batch Pages Dynamic Format
**Admin:** `leads-batch-{progId}__PROG__{batchName}__sheet__{sheetName}`
- Example: `leads-batch-5d3f7a9c__PROG__Batch-14__sheet__Main%20Leads`

**Officer:** `leads-myLeads-batch-{progId}__PROG__{batchName}__sheet__{sheetName}`
- Example: `leads-myLeads-batch-5d3f7a9c__PROG__Batch-14__sheet__Main%20Leads`

**Lead Management:** Similar format with `lead-management-batch-` prefix instead

### Role Determination
1. Check `user.user_metadata?.role`
2. If not set, check admin email whitelist:
   - `admin@ucags.edu.lk`
   - `mohamedunais2018@gmail.com`
3. Default: `user` role (treated as officer)

**Admin emails are hardcoded in app.js (lines 24-27, 60-63).**

---

## 8. CSS SELECTORS FOR VISIBILITY CONTROL

**Hide admin-only when NOT admin:**
```css
body:not(.admin) .admin-only {
    display: none !important;
}
```

**Hide officer-only when admin:**
```css
body.admin .officer-only {
    display: none !important;
}
```

These implicit rules mean:
- When `body.admin` present: `.officer-only { display: none }`
- When `body.admin` absent: `.admin-only { display: none }`

---

## 9. NAVIGATION EVENT FLOW DIAGRAM

```
┌─────────────────────────────────────┐
│   User Login (initializeApp)        │
├─────────────────────────────────────┤
│ 1. Check Supabase auth              │
│ 2. Determine role (admin vs officer)│
│ 3. Set currentUser global           │
│ 4. Call showDashboard()             │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   showDashboard()                   │
├─────────────────────────────────────┤
│ 1. Hide login, show dashboard       │
│ 2. Set body.admin class if needed   │
│    (triggers CSS to show/hide items)│
│ 3. Call setupNavigation()           │
│ 4. Call setupRouting()              │
│ 5. Load batch menus async           │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   setupNavigation()                 │
├─────────────────────────────────────┤
│ 1. Attach click to .nav-item        │
│ 2. Attach click to .nav-section     │
│    (toggle collapse)                │
│ 3. Setup mobile menu handlers       │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   setupRouting()                    │
├─────────────────────────────────────┤
│ 1. Listen for hashchange events     │
│ 2. Load initial page from hash      │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   User Clicks Nav Item              │
├─────────────────────────────────────┤
│ Event: click                        │
│ Extract: data-page attribute        │
│ Set: window.location.hash = page    │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   hashchange Event                  │
├─────────────────────────────────────┤
│ Call: navigateToPage(page)          │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│   navigateToPage(page)              │
├─────────────────────────────────────┤
│ 1. Check for duplicate nav          │
│ 2. Update .nav-item.active states   │
│ 3. Hide all .content-view           │
│ 4. Show #{page}View                 │
│ 5. Call page initializer            │
│ 6. Update page title                │
└─────────────────────────────────────┘
```

---

## 10. HTML STRUCTURE FOR ROLE VISIBILITY

### Admin sees these sidebar sections:
```
Home
Calendar
Contacts
[Leads] ← admin section with dynamic batches
[Lead Management] ← admin item
Demo Sessions
Registrations ← admin
Payments ← admin
Students ← admin
---
WhatsApp
Gmail (disabled)
Call Center (disabled)
---
Staff Attendance ← admin
Reports
Daily Checklist ← admin
---
Staff Management ← admin
Programs ← admin
Receipts ← admin
Notifications
Settings
```

### Officer sees these sidebar sections:
```
Home
Calendar
Contacts
[Leads] ← officer section with dynamic batches
[Lead Management] ← officer section with dynamic batches
Demo Sessions
Registrations ← officer
Batch management ← officer
---
WhatsApp
Gmail (disabled)
Call Center (disabled)
---
Staff Attendance ← officer
Reports
---
(NO Staff Management, Programs, Receipts, Daily Checklist, Payments, Students)
Notifications
Settings
```

