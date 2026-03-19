# Dashboard Implementation - Quick Reference Guide

## File Structure Overview

| File | Lines | Purpose |
|------|-------|---------|
| `public/frontend/pages/dashboard/xpDashboard.js` | 224 | XP leaderboard, personal XP, and trend chart |
| `public/index.html` (homeView) | 282-607 | Complete dashboard HTML structure |
| `public/css/styles.css` | 2986 | All styling including new dashboard (ND) classes |
| `public/js/ui.js` | 860 | UI helper functions for rendering and formatting |
| `public/js/app.js` | 3506 | Main application logic, routing, auth |

---

## API Endpoints Summary

### XP System (xpDashboard.js)
| Endpoint | Method | Caller | Use |
|----------|--------|--------|-----|
| `/api/xp/leaderboard` | GET | `renderXPLeaderboard()` | Admin: Top officers by XP |
| `/api/xp/me` | GET | `renderPersonalXP()` | Officer: Personal XP + events |
| `/api/xp/global-trend?days=N` | GET | `renderXPTrend()` | Admin: All officers XP trend |
| `/api/xp/trend?days=N` | GET | `renderXPTrend()` | Officer: Personal XP trend |

### Program & Batch System (app.js)
| Endpoint | Method | Caller | Use |
|----------|--------|--------|-----|
| `/api/programs/sidebar` | GET | `loadBatchesMenu()` | Load programs + current batches |
| `/api/crm-leads/meta/sheets` | DELETE | `updateDeleteSheetButtons()` | Delete custom sheet |

---

## HTML Element IDs - Home View (#homeView)

### Profile Section
| ID | Element | Purpose |
|---|---------|---------|
| `ndAvatar` | div | User avatar circle |
| `ndAvatarInitials` | span | Avatar initials text |
| `ndProfileName` | div | User full name |
| `ndProfileRole` | div | User role ("Academic Advisor", etc.) |
| `ndProfileMeta` | div | Additional metadata |
| `ndRankBadge` | div | Trophy icon + rank |
| `ndRankText` | span | Rank number/text |
| `ndXpBlock` | div | XP progress section |
| `ndXpLabel` | div | "⚡ XP Progress" label |
| `ndXpNumbers` | span | "X / Y" format |
| `ndXpBarFill` | div | Progress bar fill (width: %) |
| `ndLevelLabel` | div | "Level N" text |

### Officer Filter & Date Range
| ID | Element | Purpose |
|---|---------|---------|
| `ndOfficerFilterWrap` | div | Officer selector (admin-only) |
| `ndOfficerSelect` | select | Officer dropdown |
| `homeFromDate` | input[date] | Date range start |
| `homeToDate` | input[date] | Date range end |
| `homeApplyRangeBtn` | button | Apply date filter |
| `homeThisMonthBtn` | button | Quick "30d" filter |

### KPI Metrics Cards
| ID | Element | Purpose |
|---|---------|---------|
| `kpiConfirmedPayments` | div | Enrollments number |
| `kpiEnrollmentsTrend` | div | Enrollments trend |
| `kpiConversionRate` | div | Conversion rate % |
| `kpiConversionTrend` | div | Conversion trend |
| `kpiFollowUpsDue` | div | Follow-ups due count |
| `kpiFollowupsTrend` | div | Follow-ups trend |
| `kpiActiveLeads` | div | Active leads count |
| `kpiLeadsTrend` | div | Leads trend |
| `kpiRegistrations` | div | Registrations count |
| `kpiRegistrationsTrend` | div | Registrations trend |
| `kpiXpTotal` | div | Total XP value |
| `kpiXpTrend` | div | XP trend |

### XP Section
| ID | Element | Purpose |
|---|---------|---------|
| `xpTrendChart` | canvas | XP trend line chart |
| `xpTrend7Btn` | button | Toggle 7-day view |
| `xpTrend30Btn` | button | Toggle 30-day view |
| `ndXpChartStats` | div | Stats footer below chart |
| `statCurrentXp` | span | Current XP value |
| `statHighestXp` | span | Highest day XP |
| `statAvgXp` | span | Average XP |

### Achievements Section
| ID | Element | Purpose |
|---|---------|---------|
| `ndAchievements` | div | Badges grid container |
| `ndBadgesSummary` | div | Summary below badges |

### Lead Pipeline Section
| ID | Element | Purpose |
|---|---------|---------|
| `ndFunnelBars` | div | Funnel bars container |
| `ndPipelineSummary` | div | Pipeline stats |
| `ndFunnelFooter` | div | Footer text |

### Quick Actions Section
| ID | Element | Purpose |
|---|---------|---------|
| `qaAddLead` | button | Add new lead button |
| `qaFollowup` | button | Schedule follow-up button |
| `qaUpdateStatus` | button | Update status button |

### Leaderboard Section
| ID | Element | Purpose |
|---|---------|---------|
| `xpLeaderboardList` | div | Leaderboard items |
| `ndLeaderboardBadge` | div | Badge in header |
| `xpPersonalContent` | div | Officer personal XP (officer-only) |

### Targets Section
| ID | Element | Purpose |
|---|---------|---------|
| `ndTargets` | div | Targets list |
| `ndTargetsOfficerSelect` | select | Officer filter (admin-only) |
| `ndTargetsOverall` | div | Overall summary |

### Activity & Tasks
| ID | Element | Purpose |
|---|---------|---------|
| `ndActivityFeed` | div | Activity feed items |
| `ndAddTaskBtn` | button | Add task button (officer-only) |
| `ndTaskAddForm` | div | Task add form (hidden) |
| `ndTaskTitle` | input | Task title |
| `ndTaskDue` | input[datetime-local] | Task due date/time |
| `ndTaskPriority` | select | Task priority (low/medium/high) |
| `ndTaskSaveBtn` | button | Save task button |
| `ndTasksList` | div | Tasks list items |

### Admin Section
| ID | Element | Purpose |
|---|---------|---------|
| `homeConfirmedLineChart` | canvas | Admin enrollments chart |
| `homeActionCenter` | div | Admin action center items |
| `ndAdminActionRow` | div | Admin-only row container |

### Officer Section
| ID | Element | Purpose |
|---|---------|---------|
| `homeConfirmedLineChartOfficer` | canvas | Officer enrollments chart |
| `ndOfficerActionRow` | div | Officer-only row container |

---

## CSS Class Names - New Dashboard (ND)

### Layout Classes
```
.nd-profile-section       .nd-profile-left       .nd-profile-center
.nd-profile-right         .nd-metrics-grid       .nd-row
.nd-row-2-1               .nd-row-equal          .nd-card
.nd-card-header           .nd-card-title
```

### Component Classes
```
.nd-avatar                .nd-xp-block           .nd-xp-bar-bg
.nd-xp-bar-fill           .nd-xp-bar-shimmer     .nd-rank-badge
.nd-level-label           .nd-metric-card        .nd-metric-value
.nd-metric-label          .nd-metric-glow
```

### Color Variant Classes
```
.nd-metric-purple         .nd-metric-green       .nd-metric-amber
.nd-metric-blue           .nd-metric-indigo      .nd-metric-rose
```

### Interactive Classes
```
.nd-toggle-btn            .nd-toggle-btn.active  .nd-toggle-group
.nd-btn-ghost             .nd-action-btn         .nd-action-purple
.nd-action-blue           .nd-action-green
```

### Loading Classes
```
.nd-skeleton-badge        .nd-skeleton-bar       .nd-skeleton-row
.nd-loading               (with shimmer animations)
```

### Decorative Classes
```
.nd-bg-blobs              .nd-blob               .nd-blob-1
.nd-blob-2                .nd-blob-3
```

---

## Color Values Reference

| Color | Hex Code | Usage |
|-------|----------|-------|
| Primary Purple | `#8B5CF6` | Buttons, primary actions |
| Dark Purple | `#7C3AED` | XP text, active states |
| Light Purple | `#A78BFA` | Hover states |
| Purple-50 | `#FAF5FF` | Very light backgrounds |
| Purple-100 | `#F3E8FF` | Light backgrounds |
| Green | `#10B981` / `#059669` | Success, positive XP |
| Red | `#EF4444` / `#DC2626` | Error, negative XP |
| Blue | `#2563EB` / `#3B82F6` | Info, highlights |
| Gray-900 | `#111827` | Dark text |
| Gray-700 | `#374151` | Primary text |
| Gray-500 | `#6B7280` | Secondary text |
| Gray-400 | `#9CA3AF` | Tertiary text |
| White | `#FFFFFF` | Backgrounds |
| Light Gray | `#F8F9FA` | Secondary backgrounds |

---

## XP Event Types & Icons

| Event Type | Icon | Label |
|------------|------|-------|
| `lead_contacted` | 📞 | Lead contacted |
| `followup_completed` | ✅ | Follow-up completed |
| `registration_received` | 📝 | Registration received |
| `payment_received` | 💰 | Payment received |
| `demo_attended` | 🎓 | Demo attended |
| `attendance_on_time` | ⏰ | On-time check-in |
| `checklist_completed` | ☑️ | Checklist completed |
| `report_submitted` | 📊 | Report submitted |
| `lead_responded_fast` | ⚡ | Speed bonus (1h) |
| `followup_overdue` | ⚠️ | Overdue follow-up |

---

## Global Window Objects

### User & Auth
```javascript
window.currentUser              /* { id, email, name, role } */
window.getAuthHeadersWithRetry  /* Async function for auth */
```

### Navigation & Pages
```javascript
window.navigateToPage(page)     /* Navigate to view */
window.openModal(id)            /* Open modal */
window.closeModal(id)           /* Close modal */
```

### Dashboard & XP
```javascript
window.loadXPDashboard()        /* Load XP system */
window.loadDashboard()          /* Load main dashboard */
```

### Program/Batch Context
```javascript
window.adminProgramId           /* Admin's selected program */
window.officerProgramId         /* Officer's selected program */
window.adminBatchFilter         /* Admin's batch filter */
window.officerBatchFilter       /* Officer's batch filter */
window.adminSheetFilter         /* Admin's sheet filter */
window.officerSheetFilter       /* Officer's sheet filter */
```

### Notifications
```javascript
window.NotificationCenter       /* Notification system object */
window.Notifications            /* Client-side notifications */
window.showToast(msg, type)     /* Show toast notification */
```

---

## Component Visibility Control

### Role-Based Classes
```css
.admin-only                     /* Visible when body.admin class present */
.officer-only                   /* Visible when body.admin NOT present */
```

### View Visibility
```css
.content-view                   /* Base class for all views */
.content-view.active            /* Only active view visible */
#homeView                       /* Home/Dashboard view */
```

### Admin Body Class
Set when user role is 'admin':
```javascript
if (currentUser.role === 'admin') {
  document.body.classList.add('admin');
}
```

---

## Key Styling Features

### Disabled Animations on Dashboard
```css
/* Dashboard cards do NOT move/animate on hover */
#homeView .dashboard-card:hover {
  transform: none !important;
  animation: none !important;
  box-shadow: var(--shadow-sm) !important;
}
```

### Chart Styling
```css
#homeView #homeConfirmedLineChart,
#homeView #homeConfirmedLineChartOfficer {
  width: 100%;
  min-height: 160px;
}

#xpTrendChart {
  width: 100%;
  height: auto;
}
```

### Responsive Grid
```css
.nd-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
}
```

---

## Loading States

### Skeleton Components
Used before data loads:
- `.nd-skeleton-badge` - Badge placeholder
- `.nd-skeleton-bar` - Bar placeholder
- `.nd-skeleton-row` - Row placeholder
- Shimmer animation included

### Loading Text
```javascript
UI.showToast("Loading...", "info")
"Loading..." text in various containers
Spinner icons on buttons
```

---

## Key Features of Dashboard

### 1. Multi-Role Support
- **Admin View**: Leaderboard, global trends, officer filters
- **Officer View**: Personal XP, personal trends, my tasks, my registrations

### 2. Real-Time Updates
- Auto-refresh every 5 minutes
- Manual refresh buttons available
- Toast notifications for feedback

### 3. Date Range Filtering
- `homeFromDate` to `homeToDate` range picker
- Quick "30d" shortcut button
- Applies to all KPI metrics

### 4. XP Gamification
- Two-week (7d) and monthly (30d) trend views
- Personal rank display with medal emoji
- Recent event history with icons

### 5. KPI Dashboard
- 6 key metrics with color coding
- Trend indicators
- Responsive grid layout

### 6. Lead Management
- Pipeline funnel visualization
- Quick action buttons
- Target tracking

---

## Testing Checklist

When implementing changes:

- [ ] Check `#homeView` loads correctly
- [ ] Verify XP leaderboard/personal XP renders
- [ ] Test date range filtering
- [ ] Verify admin vs officer views
- [ ] Check KPI metrics populate
- [ ] Test XP trend chart (7d & 30d)
- [ ] Verify responsive design on mobile
- [ ] Check all element IDs are present
- [ ] Verify API calls complete
- [ ] Test loading skeleton states

---
