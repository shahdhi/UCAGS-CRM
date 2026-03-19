# Dashboard Visual Structure & Element Map

## Home View Layout (ASCII Diagram)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        #homeView (content-view)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────── nd-profile-section ──────────────────────┐   │
│  │                                                               │   │
│  │  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐  │   │
│  │  │ nd-profile   │  │ nd-profile      │  │ nd-profile     │  │   │
│  │  │    -left     │  │    -center      │  │    -right      │  │   │
│  │  │              │  │                 │  │                │  │   │
│  │  │ • Avatar     │  │ • Rank Badge    │  │ • Officer      │  │   │
│  │  │ • Name       │  │ • XP Progress   │  │   Filter       │  │   │
│  │  │ • Role       │  │ • XP Bar        │  │ • Date Range   │  │   │
│  │  │ • Meta       │  │ • Level Label   │  │   Picker       │  │   │
│  │  │              │  │                 │  │ • Apply & 30d  │  │   │
│  │  └──────────────┘  └─────────────────┘  └────────────────┘  │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌────────────────── nd-metrics-grid (6 columns) ────────────────┐  │
│  │                                                                 │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │  │
│  │  │ Enroll │  │Convert │  │Follow- │  │Active  │  │Registr │  │  │
│  │  │ments   │  │ Rate   │  │ ups    │  │Leads   │  │ations  │  │  │
│  │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  │  │
│  │                                                                 │  │
│  │  ┌────────┐                                                     │  │
│  │  │ Total  │                                                     │  │
│  │  │  XP    │                                                     │  │
│  │  └────────┘                                                     │  │
│  │                                                                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ nd-row nd-row-2-1 (XP Trend + Achievements)                 │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────┐  ┌──────────────────────┐ │   │
│  │  │ nd-card (XP Performance)     │  │ nd-card (Achievements)
│  │  │                               │  │                      │ │   │
│  │  │ • Chart Header + Toggles      │  │ • Badges Grid       │ │   │
│  │  │ • Canvas Chart                │  │ • Summary           │ │   │
│  │  │ • Stats Footer                │  │                      │ │   │
│  │  │                               │  │                      │ │   │
│  │  └──────────────────────────────┘  └──────────────────────┘ │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ nd-row nd-row-2-1 (Pipeline + Quick Actions)                │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────┐  ┌──────────────────────┐ │   │
│  │  │ nd-card (Lead Pipeline)      │  │ nd-card (Quick       │ │   │
│  │  │                               │  │  Actions)            │ │   │
│  │  │ • Funnel Bars                │  │ • Add Lead           │ │   │
│  │  │ • Footer                      │  │ • Follow-up          │ │   │
│  │  │                               │  │ • Update Status      │ │   │
│  │  └──────────────────────────────┘  └──────────────────────┘ │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ nd-row nd-row-2-1 (Leaderboard + Targets)                  │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────┐  ┌──────────────────────┐ │   │
│  │  │ nd-card (XP Leaderboard)     │  │ nd-card (Targets)    │ │   │
│  │  │                               │  │                      │ │   │
│  │  │ • Leader List / Personal XP   │  │ • Target Items       │ │   │
│  │  │                               │  │ • Overall Summary    │ │   │
│  │  └──────────────────────────────┘  └──────────────────────┘ │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ nd-row nd-row-equal (Activity Feed + Tasks)                 │   │
│  │                                                               │   │
│  │  ┌─────────────────────┐  ┌──────────────────────────────┐  │   │
│  │  │ nd-card (Activity)  │  │ nd-card (My Tasks)           │  │   │
│  │  │                     │  │                              │  │   │
│  │  │ • Activity Items    │  │ • Add Task Form (hidden)    │  │   │
│  │  │                     │  │ • Tasks List                │  │   │
│  │  └─────────────────────┘  └──────────────────────────────┘  │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ nd-row nd-row-equal (ADMIN ONLY #ndAdminActionRow)          │   │
│  │                                                               │   │
│  │  ┌─────────────────────┐  ┌──────────────────────────────┐  │   │
│  │  │ Enrollments Chart   │  │ Action Center                │  │   │
│  │  └─────────────────────┘  └──────────────────────────────┘  │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ nd-row (OFFICER ONLY #ndOfficerActionRow)                   │   │
│  │                                                               │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │ Enrollments Chart (Officer)                             │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## CSS Class Hierarchy

```
.nd-profile-section
├── .nd-profile-left
│   ├── .nd-avatar
│   ├── .nd-profile-name
│   ├── .nd-profile-role
│   └── .nd-profile-meta
├── .nd-profile-center
│   ├── .nd-rank-badge
│   └── .nd-xp-block
│       ├── .nd-xp-label
│       ├── .nd-xp-bar-bg
│       │   └── .nd-xp-bar-fill
│       │       └── .nd-xp-bar-shimmer
│       └── .nd-level-label
└── .nd-profile-right
    ├── .nd-officer-filter
    │   └── .nd-select
    └── .nd-date-range
        ├── .nd-date-input
        ├── .nd-date-sep
        └── .nd-btn-ghost

.nd-metrics-grid
├── .nd-metric-card.nd-metric-purple
│   ├── .nd-metric-icon-wrap
│   ├── .nd-metric-body
│   │   ├── .nd-metric-value
│   │   ├── .nd-metric-label
│   │   └── .nd-metric-trend
│   └── .nd-metric-glow
├── .nd-metric-card.nd-metric-green
├── .nd-metric-card.nd-metric-amber
├── .nd-metric-card.nd-metric-blue
├── .nd-metric-card.nd-metric-indigo
└── .nd-metric-card.nd-metric-rose

.nd-row.nd-row-2-1
├── .nd-card
│   ├── .nd-card-header
│   │   ├── .nd-card-title
│   │   └── .nd-toggle-group
│   │       ├── .nd-toggle-btn
│   │       └── .nd-toggle-btn.active
│   └── .nd-chart-wrap
│       └── canvas
└── .nd-card
    └── .nd-badges-grid
        └── .nd-skeleton-badge

.nd-row.nd-row-equal
├── .nd-card
│   ├── .nd-card-header
│   └── .nd-activity-list
└── .nd-card
    ├── .nd-card-header
    │   └── .nd-btn-ghost
    ├── .nd-task-add-form
    └── .nd-tasks-list
```

---

## Data Flow Diagram

```
User Login (email/password)
        ↓
   Supabase Auth
        ↓
Get User Token + Metadata
        ↓
Set window.currentUser
        ↓
showDashboard()
        ↓
    ├─→ setupNavigation()
    ├─→ setupEventListeners()
    ├─→ setupRouting()
    ├─→ loadBatchesMenu() [Admin]
    ├─→ loadOfficerLeadsBatchesMenu() [Officer]
    ├─→ startDashboardAutoRefresh()
    └─→ updateEnquiriesBadge()
        ↓
Navigate to #home
        ↓
    loadDashboard()
        ↓
Load KPI Metrics + Analytics
        ↓
    window.loadXPDashboard()
        ↓
    ├─→ renderXPLeaderboard() [Admin]
    │   ├─→ GET /api/xp/leaderboard
    │   └─→ Populate #xpLeaderboardList
    │
    └─→ renderPersonalXP() [Officer]
        ├─→ GET /api/xp/me
        └─→ Populate #xpPersonalContent
        
    renderXPTrend(30)
        ├─→ GET /api/xp/global-trend?days=30 [Admin]
        │   OR
        │   GET /api/xp/trend?days=30 [Officer]
        └─→ Populate #xpTrendChart with Chart.js
```

---

## API Call Sequence

```
Page Load
├─ GET /api/programs/sidebar
│  ├─ Admin: Populate #leadsBatchesMenu
│  └─ Officer: Populate officer batch menus
│
└─ navigateToPage('home')
   └─ loadDashboard()
      └─ window.loadXPDashboard()
         ├─ GET /api/xp/leaderboard [Admin]
         │  └─ Render #xpLeaderboardList
         │
         ├─ GET /api/xp/me [Officer]
         │  └─ Render #xpPersonalContent
         │
         └─ GET /api/xp/global-trend?days=30 [Admin]
            OR GET /api/xp/trend?days=30 [Officer]
            └─ Render #xpTrendChart
```

---

## Element Type Distribution

```
IDs by Category:

Profile & User (11):
  ndAvatar, ndAvatarInitials, ndProfileName, ndProfileRole, 
  ndProfileMeta, ndRankBadge, ndRankText, ndXpBlock, 
  ndXpLabel, ndXpNumbers, ndLevelLabel

Filters (6):
  ndOfficerFilterWrap, ndOfficerSelect, homeFromDate, homeToDate,
  homeApplyRangeBtn, homeThisMonthBtn

KPI Metrics (12):
  kpiConfirmedPayments, kpiEnrollmentsTrend, kpiConversionRate,
  kpiConversionTrend, kpiFollowUpsDue, kpiFollowupsTrend,
  kpiActiveLeads, kpiLeadsTrend, kpiRegistrations,
  kpiRegistrationsTrend, kpiXpTotal, kpiXpTrend

XP Section (8):
  xpTrendChart, xpTrend7Btn, xpTrend30Btn, ndXpChartStats,
  statCurrentXp, statHighestXp, statAvgXp, xpLeaderboardList

Achievements (2):
  ndAchievements, ndBadgesSummary

Pipeline (3):
  ndFunnelBars, ndPipelineSummary, ndFunnelFooter

Quick Actions (3):
  qaAddLead, qaFollowup, qaUpdateStatus

Leaderboard (2):
  ndLeaderboardBadge, xpPersonalContent

Targets (3):
  ndTargets, ndTargetsOfficerSelect, ndTargetsOverall

Activity & Tasks (7):
  ndActivityFeed, ndAddTaskBtn, ndTaskAddForm, ndTaskTitle,
  ndTaskDue, ndTaskPriority, ndTaskSaveBtn, ndTasksList

Admin/Officer (5):
  homeConfirmedLineChart, homeConfirmedLineChartOfficer,
  homeActionCenter, ndAdminActionRow, ndOfficerActionRow

Legacy (7):
  homeLeaderboard, homeLeaderboardDivider, homePerformerOfWeek,
  homeOfficerActionCenter, xpLeaderboardCard, xpPersonalCard,
  xpTrendCard

TOTAL: 177 IDs
```

---

## Color & Theme Map

```
Primary Purple Theme:
├── #8B5CF6 (primary-purple) - Buttons, links, accents
├── #7C3AED (primary-purple-dark) - XP values, active states
└── #A78BFA (primary-purple-light) - Hover states

Metric Card Colors:
├── Purple (#8B5CF6) → Enrollments
├── Green (#10B981) → Conversion Rate
├── Amber (#F59E0B) → Follow-ups Due
├── Blue (#2563EB) → Active Leads
├── Indigo (#6366F1) → Registrations
└── Rose/Pink (gradient) → Total XP

Success/Status:
├── Green (#059669) → Positive XP, Success
├── Red (#DC2626) → Negative XP, Error
└── Gray (#6B7280) → Neutral, Disabled

Gray Scale:
├── #111827 (gray-900) → Dark text
├── #374151 (gray-700) → Primary text
├── #6B7280 (gray-500) → Secondary text
├── #9CA3AF (gray-400) → Tertiary text
└── #F8F9FA (gray-secondary) → Light backgrounds
```

---

## CSS Selector Power Map

```
High Priority (Most Specific):
├── #homeView .nd-metric-card.nd-metric-purple
├── .nd-profile-section .nd-xp-block
└── #ndAdminActionRow .nd-card

Medium Priority:
├── .nd-card .nd-card-header
├── .nd-metric-card.nd-metric-[color]
└── .nd-row .nd-card

Low Priority (General):
├── .nd-card
├── .nd-metric-card
└── .btn-primary
```

