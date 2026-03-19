# Dashboard Implementation Analysis

## Overview
This document provides a complete breakdown of the existing dashboard implementation, including all HTML structures, CSS variables, API endpoints, and JavaScript functions.

---

## 1. xpDashboard.js - XP System Implementation

### File Structure & Functions

#### Private Variables (Module Scope)
```
__xpTrendChart      - Chart.js instance for XP trend visualization
__xpTrendDays       - Current trend window (7 or 30 days, default: 30)
__xpLoaded          - Flag to track if trend buttons have been setup
```

### Public Entry Point
- **`window.loadXPDashboard()`** - Async function called after analytics loads
  - Calls in parallel: `renderXPLeaderboard()` or `renderPersonalXP()` (based on role)
  - Calls: `renderXPTrend(__xpTrendDays)`
  - Safe to call multiple times; reloads fresh data each time

### Core Functions

#### 1. `medal(i)` - Helper Function
- Returns medal emoji for rankings (🥇 for 1st, 🥈 for 2nd, 🥉 for 3rd)
- Falls back to `#N` numbering for positions 4+
- Inline styling with color: `#6b7280` (gray) for position text

#### 2. `renderXPLeaderboard()` - Admin Only
**API Call:** `GET /api/xp/leaderboard`
- Fetches response: `{ leaderboard: [...] }`
- Renders to element: `#xpLeaderboardList`
- Each entry displays:
  - Medal icon (flex layout)
  - Officer name (white-space: nowrap, truncated)
  - Total XP with ⚡ icon in purple (`#7c3aed`)
- Row styling: flex, padding 7px 4px, border-bottom 1px solid `#f3f4f6`
- Font weight 600 for top 3, 400 for others
- Error fallback: Red error message with color `#ef4444`

#### 3. `renderPersonalXP()` - Officer Only
**API Call:** `GET /api/xp/me`
- Fetches response: `{ totalXp, rank, totalOfficers, recentEvents: [...] }`
- Renders to element: `#xpPersonalContent`
- Display sections:
  - **XP Total**: Font-size 40px, font-weight 800, color `#7c3aed`
  - **Rank**: `"Ranked #X of Y"` (gray color `#6b7280`)
  - **Recent Activity** (up to 8 events):
    - Shows 8 most recent events with icon, label, date, XP value
    
**Event Labels Mapping:**
```javascript
EVENT_LABELS = {
  lead_contacted:       { label: 'Lead contacted', icon: '📞' },
  followup_completed:   { label: 'Follow-up completed', icon: '✅' },
  registration_received:{ label: 'Registration received', icon: '📝' },
  payment_received:     { label: 'Payment received', icon: '💰' },
  demo_attended:        { label: 'Demo attended', icon: '🎓' },
  attendance_on_time:   { label: 'On-time check-in', icon: '⏰' },
  checklist_completed:  { label: 'Checklist completed', icon: '☑️' },
  report_submitted:     { label: 'Report submitted', icon: '📊' },
  lead_responded_fast:  { label: 'Speed bonus (1h)', icon: '⚡' },
  followup_overdue:     { label: 'Overdue follow-up', icon: '⚠️' },
}
```

- **XP Color Logic**: Green (`#059669`) for positive, Red (`#dc2626`) for negative
- Date format: `en-GB` (day/month format), e.g., "15 Jan"
- Row styling: flex justify-space-between, padding 5px 2px, border-bottom 1px solid `#f3f4f6`

#### 4. `renderXPTrend(days)` - Chart Rendering
**API Calls:**
- Admin: `GET /api/xp/global-trend?days={days}` - Total XP for all officers
- Officer: `GET /api/xp/trend?days={days}` - Personal XP trend

**Response Structure:** `{ trend: [{ date, xp }, ...] }`

**Chart Configuration (Chart.js):**
- **Element:** `#xpTrendChart` (canvas)
- **Type:** Line chart
- **Dataset:**
  - Label: "Total XP (all officers)" (admin) OR "My XP" (officer)
  - Border Color: `#7c3aed` (purple)
  - Background Color: `rgba(124,58,237,0.08)` (light purple fill)
  - Border Width: 2px
  - Point Radius: 4px (if ≤7 days), 2px (if >7 days)
  - Point Background: `#7c3aed`
  - Fill: true (area under line)
  - Tension: 0.3 (smooth curve)

**X-Axis:**
- Format: `en-GB` date format (e.g., "15 Jan")
- Max ticks: 8
- Font size: 11px

**Y-Axis:**
- Begin at zero: true
- Font size: 11px

**Tooltip:** Shows format `"{value} XP"`

**Tooltip Legend:** Hidden (display: false)

#### 5. `setupTrendButtons()` - Period Toggle
- **Elements:**
  - `#xpTrend7Btn` - 7-day button
  - `#xpTrend30Btn` - 30-day button
- **Default State:** 30-day button is active (class `btn-primary`)
- **Button Classes:**
  - Active: `btn btn-primary btn-sm`
  - Inactive: `btn btn-secondary btn-sm`
- On click, updates `__xpTrendDays` and re-renders chart

---

## 2. public/index.html - Home/Dashboard View Structure

### Home View Container
**ID:** `#homeView`
**Class:** `content-view active`
**Location:** Lines 282-607

### Main Sections

#### 2.1 Background Blobs (Decorative)
```html
<div class="nd-bg-blobs" aria-hidden="true">
  <div class="nd-blob nd-blob-1"></div>
  <div class="nd-blob nd-blob-2"></div>
  <div class="nd-blob nd-blob-3"></div>
</div>
```

#### 2.2 Profile Section
**ID/Class:** `class="nd-profile-section"`
**Sub-sections:**
- **Left (Avatar & Info):**
  - `#ndAvatar` - Avatar container
  - `#ndAvatarInitials` - User initials
  - `#ndProfileName` - User full name
  - `#ndProfileRole` - User role (e.g., "Academic Advisor")
  - `#ndProfileMeta` - Additional metadata

- **Center (XP Progress):**
  - `#ndRankBadge` - Trophy icon + rank text (`#ndRankText`)
  - `#ndXpBlock` - XP progress section
    - `#ndXpLabel` - XP label text
    - `#ndXpNumbers` - "X / Y" format
    - `.nd-xp-bar-bg` - Progress bar background
    - `#ndXpBarFill` - Progress bar fill (with shimmer animation)
    - `#ndLevelLabel` - "Level N" text

- **Right (Filters & Date Range):**
  - `#ndOfficerFilterWrap` (admin-only) - Officer selector
  - `#ndOfficerSelect` - Dropdown with all officers
  - `#homeFromDate` - Date input (from)
  - `#homeToDate` - Date input (to)
  - `#homeApplyRangeBtn` - Apply filter button
  - `#homeThisMonthBtn` - Quick "30d" button

#### 2.3 KPI Metrics Grid
**Class:** `nd-metrics-grid` (6-column responsive grid)
**Cards:**

1. **Enrollments** (`#kpiConfirmedPayments`)
   - Icon: `fas fa-user-graduate`
   - Class: `nd-metric-purple`
   - Trend: `#kpiEnrollmentsTrend`

2. **Conversion Rate** (`#kpiConversionRate`)
   - Icon: `fas fa-percent`
   - Class: `nd-metric-green`
   - Trend: `#kpiConversionTrend`

3. **Follow-ups Due** (`#kpiFollowUpsDue`)
   - Icon: `fas fa-calendar-day`
   - Class: `nd-metric-amber`
   - Trend: `#kpiFollowupsTrend`

4. **Active Leads** (`#kpiActiveLeads`)
   - Icon: `fas fa-users`
   - Class: `nd-metric-blue`
   - Trend: `#kpiLeadsTrend`

5. **Registrations** (`#kpiRegistrations`)
   - Icon: `fas fa-clipboard-list`
   - Class: `nd-metric-indigo`
   - Trend: `#kpiRegistrationsTrend`

6. **Total XP** (`#kpiXpTotal`)
   - Icon: `fas fa-star`
   - Class: `nd-metric-rose`
   - Trend: `#kpiXpTrend`

**Card Structure:**
```html
<div class="nd-metric-card nd-metric-[color]">
  <div class="nd-metric-icon-wrap"><i class="fas fa-..."></i></div>
  <div class="nd-metric-body">
    <div class="nd-metric-value" id="kpi...">—</div>
    <div class="nd-metric-label">Label</div>
    <div class="nd-metric-trend" id="kpi...Trend"></div>
  </div>
  <div class="nd-metric-glow"></div>
</div>
```

#### 2.4 Row 1: XP Trend + Achievements
**Class:** `nd-row nd-row-2-1` (2 columns, first wider)

**Card 1: XP Performance Trend**
- **Class:** `nd-card`
- **Header:** `nd-card-header` with title and toggle buttons
  - Title: `<i class="fas fa-chart-bar"></i> XP Performance Trend`
  - Toggle Group (buttons):
    - `#xpTrend7Btn` - "7d" button
    - `#xpTrend30Btn` - "30d" button (default active)
- **Chart:** `#xpTrendChart` (canvas)
- **Stats Footer:** `#ndXpChartStats`
  - `#statCurrentXp` - Current XP value
  - `#statHighestXp` - Highest day XP
  - `#statAvgXp` - Average XP

**Card 2: Achievements**
- **Class:** `nd-card`
- **Header:** `<i class="fas fa-medal"></i> Achievements`
- **Content:** `#ndAchievements` (badges grid)
  - Skeleton loaders: 6x `.nd-skeleton-badge`
- **Summary:** `#ndBadgesSummary`

#### 2.5 Row 2: Lead Pipeline + Quick Actions
**Class:** `nd-row nd-row-2-1`

**Card 1: Lead Pipeline**
- **Header ID:** `nd-card-header`
  - Title: `<i class="fas fa-filter"></i> Lead Pipeline`
  - Summary: `#ndPipelineSummary`
- **Funnel Bars:** `#ndFunnelBars` (skeleton bars for loading)
- **Footer:** `#ndFunnelFooter`

**Card 2: Quick Actions**
- **Header Title:** `<i class="fas fa-bolt"></i> Quick Actions`
- **Buttons:** `nd-quick-actions`
  1. `#qaAddLead` (nd-action-purple)
  2. `#qaFollowup` (nd-action-blue)
  3. `#qaUpdateStatus` (nd-action-green)

**Button Structure:**
```html
<button class="nd-action-btn nd-action-[color]" id="qa...">
  <div class="nd-action-icon-wrap"><i class="fas fa-..."></i></div>
  <div class="nd-action-text">
    <span class="nd-action-title">Title</span>
    <span class="nd-action-desc">Description</span>
  </div>
  <i class="fas fa-chevron-right nd-action-arrow"></i>
</button>
```

#### 2.6 Row 3: Leaderboard + Targets
**Class:** `nd-row nd-row-2-1`

**Card 1: XP Leaderboard**
- **Header:** `<i class="fas fa-trophy"></i> XP Leaderboard`
- **Badge:** `#ndLeaderboardBadge`
- **List:** `#xpLeaderboardList` (skeleton rows for loading)
- **Officer Section:** `#xpPersonalContent` (officer-only, hidden for admin)

**Card 2: Targets**
- **Header:** `<i class="fas fa-bullseye"></i> Targets`
- **Officer Filter:** `#ndTargetsOfficerSelect` (admin-only)
- **List:** `#ndTargets` (skeleton rows)
- **Overall:** `#ndTargetsOverall`

#### 2.7 Row 4: Activity Feed + Tasks
**Class:** `nd-row nd-row-equal` (equal width columns)

**Card 1: Activity Feed**
- **Header:** `<i class="fas fa-stream"></i> Activity Feed`
- **List:** `#ndActivityFeed` (skeleton rows)

**Card 2: My Tasks**
- **Header:** `<i class="fas fa-tasks"></i> My Tasks`
- **Add Button:** `#ndAddTaskBtn` (officer-only)
- **Add Form:** `#ndTaskAddForm` (hidden by default)
  - `#ndTaskTitle` - Task title input
  - `#ndTaskDue` - Due datetime input
  - `#ndTaskPriority` - Priority dropdown
  - `#ndTaskSaveBtn` - Save button
- **Tasks List:** `#ndTasksList` (skeleton rows)

#### 2.8 Admin Action Row
**Class:** `nd-row nd-row-equal admin-only`
**ID:** `#ndAdminActionRow`

**Card 1: Enrollments per Day**
- **Canvas:** `#homeConfirmedLineChart` (160px height)

**Card 2: Action Center**
- **Container:** `#homeActionCenter` (loading state)

#### 2.9 Officer Action Row
**Class:** `nd-row officer-only`
**ID:** `#ndOfficerActionRow`

**Card:** Enrollments per Day
- **Canvas:** `#homeConfirmedLineChartOfficer`

#### 2.10 Legacy Hidden Elements
Backward compatibility elements (hidden):
- `#homeLeaderboard`
- `#homeLeaderboardDivider`
- `#homePerformerOfWeek`
- `#homeOfficerActionCenter`
- `#xpLeaderboardCard`
- `#xpPersonalCard`
- `#xpTrendCard`

---
