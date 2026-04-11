# Dashboard Redesign — Implementation TODO

## Overview
Complete rewrite of the Home/Dashboard view to match the new design from `DASHBOARD NEW/`.
Using vanilla JS + Chart.js + Font Awesome (no framework change).
CRM purple theme preserved with glass/liquid/glow effects.

---

## Files to Modify
| File | Action |
|------|--------|
| `public/css/styles.css` | Add all `nd-` CSS classes (glass cards, grid, glow, badges, etc.) |
| `public/frontend/pages/dashboard/xpDashboard.js` | Full rewrite — all dashboard sections |
| `public/js/app.js` | Update `loadDashboard()` to call new functions + officer list |

## Files Already Correct (No Change Needed)
| File | Reason |
|------|--------|
| `public/index.html` | HTML structure already updated with all `nd-` IDs and layout |
| `backend/modules/dashboard/dashboardRoutes.js` | APIs working |
| `backend/modules/xp/xpRoutes.js` | APIs working |
| `backend/modules/calendar/calendarTasksRoutes.js` | Tasks API working |

---

## Layout Structure (from index.html)
```
homeView
├── nd-bg-blobs (animated background)
├── nd-profile-section
│   ├── left: avatar + name + role + meta
│   ├── center: rank badge + XP progress bar
│   └── right: admin officer selector + date range filter
├── nd-metrics-grid (6 KPI cards)
│   ├── purple: Enrollments
│   ├── green: Conversion Rate
│   ├── amber: Follow-ups Due
│   ├── blue: Active Leads
│   ├── indigo: Registrations
│   └── rose: Total XP
├── Row 1 [2:1] — XP Trend Chart + Achievements/Badges
├── Row 2 [2:1] — Lead Pipeline Funnel + Quick Actions
├── Row 3 [2:1] — XP Leaderboard + Targets vs Achievements
├── Row 4 [equal] — Activity Feed + Tasks List
└── Row 5 [equal, admin-only] — Enrollments Line Chart + Action Center
```

---

## Phase 1: CSS (`styles.css`) ✅
Add all `nd-` prefixed classes:
- [ ] Background blobs (animated floating blobs)
- [ ] Profile section layout + avatar + XP bar
- [ ] Metrics grid + metric cards (6 colors) + glow effect
- [ ] Generic nd-card + nd-card-header + nd-card-title
- [ ] nd-row layouts (2-1 and equal)
- [ ] Toggle buttons (7d/30d)
- [ ] XP chart stats strip
- [ ] Badges grid + badge items + badge summary
- [ ] Funnel bars layout
- [ ] Leaderboard list items + rank badges
- [ ] Targets list + progress bars
- [ ] Activity feed items
- [ ] Tasks list items + priority badges
- [ ] Quick action buttons
- [ ] Admin action center list
- [ ] Skeleton loading states
- [ ] Selects, inputs, ghost buttons
- [ ] Responsive (mobile)

## Phase 2: xpDashboard.js — Core Sections ✅
- [ ] `renderProfileSection()` — name, role, avatar initials, XP bar, rank
- [ ] `renderKPIMetrics(data)` — 6 cards from analytics API
- [ ] `renderXPTrendChart(days)` — enhanced with stats strip
- [ ] `renderAchievements(xpData)` — 6 badges with earned/locked states

## Phase 3: Pipeline, Leaderboard, Targets ✅
- [ ] `renderLeadPipeline(funnel)` — horizontal bars from analytics funnel
- [ ] `renderLeaderboard(leaderboard)` — styled with medals, current user highlight
- [ ] `renderTargets(data)` — enrollments + follow-ups + conversions progress bars

## Phase 4: Activity Feed, Tasks, Quick Actions ✅
- [ ] `renderActivityFeed(xpEvents)` — from /api/xp/me recent events
- [ ] `renderTasksList()` — from /api/calendar/tasks
- [ ] `setupQuickActions()` — wire 3 buttons to nav/modals
- [ ] `setupAddTask()` — inline task add form

## Phase 5: Admin Role Features ✅
- [ ] `populateOfficerSelectors()` — fill ndOfficerSelect + ndTargetsOfficerSelect
- [ ] Officer selector change → reload metrics for selected officer
- [ ] Admin Action Center — payments to confirm, to enroll, overdue followups, etc.
- [ ] Officer action row (enrollments line chart for officer)

## Phase 6: Wire app.js loadDashboard ✅
- [ ] Update `loadDashboard()` to call `window.loadNewDashboard()`
- [ ] Pass date range from homeFromDate/homeToDate inputs
- [ ] Auto-refresh integration

## Phase 7: Polish ✅
- [ ] Date range filter (homeApplyRangeBtn, homeThisMonthBtn) wired
- [ ] Responsive breakpoints for mobile
- [ ] Skeleton → real content transitions
- [ ] Admin officer filter for targets

---

## API Endpoints Used
| Section | Endpoint | Role |
|---------|----------|------|
| Profile + Rank | `GET /api/xp/me` | Officer |
| Profile + Admin | `GET /api/xp/leaderboard` | Admin |
| KPI Metrics | `GET /api/dashboard/analytics?from=&to=&officerId=` | Both |
| XP Trend | `GET /api/xp/trend?days=30` | Officer |
| Global XP Trend | `GET /api/xp/global-trend?days=30` | Admin |
| Achievements | `GET /api/xp/me` (recentEvents types) | Officer |
| Lead Funnel | `GET /api/dashboard/analytics` (funnel field) | Both |
| Leaderboard | `GET /api/xp/leaderboard` | Both |
| Targets | `GET /api/dashboard/analytics` (kpis + leaderboard) | Both |
| Activity Feed | `GET /api/xp/me` (recentEvents) | Officer |
| Tasks | `GET /api/calendar/tasks` | Both |
| Admin Action Center | `GET /api/dashboard/analytics` (actionCenter) | Admin |

---

## Role-Based Behaviour
| Section | Officer | Admin |
|---------|---------|-------|
| Profile | Own profile + rank | Own admin profile |
| Metrics | Own data | Default: all officers; selectable per officer |
| XP Chart | Personal trend | Global team trend |
| Achievements | Own XP events | Hidden (admin has no XP) |
| Leaderboard | Full list, self highlighted | Full list |
| Targets | Own targets (enrollments, followups, conversions) | Per-officer selectable |
| Activity Feed | Own XP events | Team-wide (from leaderboard data) |
| Tasks | Own tasks (officer-only add button) | All tasks visible |
| Action Center | Officer enrollments chart | Payments/registrations/checklist tasks |

---

## Design Tokens (preserve CRM theme)
- Primary: `#8B5CF6` (purple), Dark: `#7C3AED`, Light: `#A78BFA`
- Glass: `rgba(255,255,255,0.7)` + `backdrop-filter: blur(20px)`
- Glow: `box-shadow: 0 0 30px rgba(139,92,246,0.15)`
- Liquid blob: animated radial-gradient orbs in background
- Card: `border: 1px solid rgba(139,92,246,0.12)`, `border-radius: 16px`
- Metric colors: purple, green (#10B981), amber (#F59E0B), blue (#3B82F6), indigo (#6366F1), rose (#F43F5E)
