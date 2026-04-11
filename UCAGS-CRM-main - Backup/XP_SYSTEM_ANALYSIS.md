# XP System Analysis

## Overview
The XP system is a gamification feature that tracks officer achievements and performance. It includes:
- **XP Events**: Various actions award or deduct XP
- **Leaderboard**: Officers ranked by total XP
- **Trends**: Daily/historical XP tracking
- **Penalties**: Automatic deduction for overdue followups

---

## Frontend: xpDashboard.js

**Location**: `public/frontend/pages/dashboard/xpDashboard.js` (1643 lines)

### Key Components:

#### 1. **Level System** (Lines 21-28)
- **Levels 1-10**: Fixed thresholds (0, 500, 1000, 1600, 2500, 3200, 4000, 5000, 6400, 8000)
- **Levels 11-15**: +2000 XP per level (10000, 12000, 14000, 16000, 18000)
- **Levels 16-20**: +3000 XP per level (21000, 24000, 27000, 30000, 33000)
- **Levels 21+**: +4000 XP per level (37000, 41000, ...)

#### 2. **XP Event Labels** (Lines 31-42)
```javascript
- lead_contacted:        +2 XP (with phone icon)
- followup_completed:    +1/+2 XP (with check-circle icon)
- registration_received: +40 XP (with file icon)
- payment_received:      +100 XP (with money icon)
- demo_attended:         +30 XP (with graduation icon)
- attendance_on_time:    +1 XP (with clock icon)
- checklist_completed:   +2 XP (with check-square icon)
- report_submitted:      +2 XP (with chart icon)
- lead_responded_fast:   +2 XP (with bolt icon)
- followup_overdue:      -5 XP (with exclamation icon)
```

#### 3. **Badge Definitions** (Lines 45-52)
6 badges are earned when specific event types occur:
| Badge ID | Label | XP | Event Type | Description |
|----------|-------|----|----|-------------|
| first_lead | First Contact | 10 | lead_contacted | Contact your first lead |
| first_followup | Follower | 15 | followup_completed | Complete a follow-up |
| first_reg | Registrar | 50 | registration_received | Receive a registration |
| speed_bonus | Speed Demon | 20 | lead_responded_fast | Respond within 1 hour |
| first_payment | Closer | 100 | payment_received | Receive a payment |
| first_checklist | Diligent | 10 | checklist_completed | Complete daily checklist |

#### 4. **Core Dashboard Sections**

**Phase 2a: Profile Section** (Lines 179-269)
- Displays user profile (name, role, avatar)
- For officers: shows level number in avatar ring with animated progress
- For admins: shows shield icon instead of level
- Syncs XP display to header

**Phase 2b: KPI Metrics** (Lines 272-311)
- Confirmed payments (enrollments)
- Conversion rate
- Follow-ups due/overdue
- Active leads
- Total XP with rank

**Phase 2c: XP Trend Chart** (Lines 314-407)
- Chart.js line graph showing XP over 7 or 30 days
- Stats strip: current XP, highest day, average XP/day
- Responsive, animated on load

**Phase 3a: Lead Pipeline Funnel** (Lines 504-559)
- 5-stage funnel: New → Contacted → Follow-up → Registered → Enrolled
- Shows currentBatches in summary
- Conversion rate footer (New → Enrolled)

**Phase 3b: Leaderboard** (Lines 562-615)
- Officers ranked by totalXp (descending)
- Medals for top 3, badge showing current user's rank
- Individual XP display per officer

**Phase 3c: Targets vs Achievements** (Lines 618-746)
- 3 targets: Enrollments (≥10), Follow-ups Due (≤20), Conversion Rate (≥30%)
- Progress bars with color coding (green=met, amber=partial, red=failed)
- Officer selector for admin view

**Phase 4a: Activity Feed** (Lines 749-815)
- 12 most recent XP events (officer or admin view)
- Shows event type, XP value, timestamp, officer name (admin only)

**Phase 4b: Tasks List** (Lines 818-873)
- Personal/everyone tasks with priority badges
- Overdue indicators, due dates
- Complete task via DELETE /api/calendar/tasks/{taskId}

**Phase 4c: Enrollment Leaderboard** (Lines 897-956)
- Officers ranked by confirmed payments in current batch
- Conversion rate per officer
- Batch filter available

**Phase 4d: Add Task Form** (Lines 999-1060)
- Create new task with title, due date, priority

#### 5. **API Endpoints Called**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/xp/me` | GET | Fetch personal XP summary + recent events |
| `/api/xp/leaderboard` | GET | Fetch all officers ranked by XP |
| `/api/xp/trend?days=N` | GET | Fetch personal XP trend (officer) |
| `/api/xp/global-trend?days=N` | GET | Fetch team XP trend (admin) |
| `/api/dashboard/analytics` | GET | Fetch KPI metrics and funnel data |
| `/api/calendar/tasks` | GET/POST | Fetch/create tasks |
| `/api/calendar/tasks/{taskId}` | DELETE | Complete task |
| `/api/batches` | GET | Fetch batch list for filters |

---

## Backend: XP Service

**Location**: `backend/modules/xp/xpService.js` (352 lines)

### Database Tables

1. **officer_xp_summary** (per user)
   - `user_id` (PK)
   - `total_xp` (integer, default 0)
   - `last_updated` (timestamp)

2. **officer_xp_events** (audit log)
   - `id` (PK)
   - `user_id` (FK)
   - `event_type` (string)
   - `xp` (integer, signed)
   - `reference_id` (string, optional)
   - `reference_type` (string, optional)
   - `note` (string, optional)
   - `created_at` (timestamp)

### Core Functions

#### **awardXP(opts)** (Lines 43-86)
Awards or deducts XP for a user.
```javascript
awardXP({
  userId: string,
  eventType: string,
  xp: number,           // positive or negative
  referenceId?: string,
  referenceType?: string,
  note?: string
})
```
- Inserts event into `officer_xp_events`
- Upserts summary in `officer_xp_summary` (floor at 0, never negative)
- Returns saved event row

#### **awardXPSafe(opts)** (Lines 91-98)
Safe wrapper—logs errors but never throws (so XP failures don't break main flows).

#### **awardXPOnce(opts)** (Lines 125-138)
Deduped award—only awards if `(user_id, eventType, referenceId)` combo hasn't been awarded yet.
Prevents double-counting the same action.

#### **alreadyAwarded(opts)** (Lines 106-120)
Checks if an XP event with same `eventType + referenceId` already exists for user.

#### **getLeaderboard()** (Lines 146-175)
Returns all officers ranked by `total_xp` descending.
- Fetches from `officer_xp_summary`
- Enriches with user metadata (name, email, role)
- Assigns rank incrementally

#### **getMyXP(userId)** (Lines 182-203)
Returns user's XP summary + recent 20 events.
```javascript
{
  userId: string,
  totalXp: number,
  rank: number | null,
  totalOfficers: number,
  recentEvents: Array<{...event}>
}
```

#### **getXPTrend(userId, days)** (Lines 210-245)
Daily XP totals for a user over last N days (default 30).
- Groups events by Sri Lanka date (UTC+5:30)
- Fills in zero days
- Returns: `[{date: YYYY-MM-DD, xp: number}, ...]`

#### **getGlobalXPTrend(days)** (Lines 250-282)
Same as above but for all officers combined (admin only).

#### **penaliseOverdueFollowups()** (Lines 294-339)
Daily cron job (run at midnight SL time).
- Finds followups where `scheduled_at` ≤ 1 day ago AND `actual_at` is NULL
- Deducts **-5 XP** per overdue followup per day
- Uses referenceId format: `{followup_id}:{YYYY-MM-DD}` for idempotency
- Returns: `{penalised: number, skipped: number}`

### XP Event Types & Values

| Event Type | XP | Source |
|------------|----|----|
| lead_contacted | +2 | Lead status changes from 'New' |
| followup_completed | +2 (yes) / +1 (no) | Followup `actual_at` newly set |
| registration_received | +40 | New registration submission |
| payment_received | +100 | Payment confirmed/received |
| demo_attended | +30 | Demo session marked 'Attended' |
| attendance_on_time | +1 | Check-in before 10:00 AM (SL) |
| checklist_completed | +2 | Daily checklist saved |
| report_submitted | +2 | Daily report slot submitted |
| lead_responded_fast | +2 | First followup within 1h of assignment |
| followup_overdue | -5 | Cron penalty per day |

---

## Backend: XP Cron

**Location**: `backend/modules/xp/xpCron.js` (54 lines)

### startXPCron()
- Schedules first penalty run at next midnight (Sri Lanka time ≈ 18:30 UTC)
- Then repeats every 24 hours
- Calls `penaliseOverdueFollowups()` each run
- Logs results to console

### Time Zone
Sri Lanka: **UTC+5:30** (represented as `330` minutes offset)

---

## Backend: XP Routes

**Location**: `backend/modules/xp/xpRoutes.js` (72 lines)

### Endpoints

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/xp/leaderboard` | GET | admin\|officer | Get all officers ranked by XP |
| `/api/xp/me` | GET | authenticated | Get personal XP summary + events |
| `/api/xp/trend` | GET | authenticated | Get personal XP trend (N days) |
| `/api/xp/global-trend` | GET | admin | Get team XP trend (N days) |
| `/api/xp/cron/overdue` | POST | admin | Manually trigger overdue penalty |

---

## Dashboard Routes (Analytics)

**Location**: `backend/modules/dashboard/dashboardRoutes.js`

### Key Concepts

#### **getCurrentBatchNames(sb)** (Lines 36-46)
Fetches batch names from `program_batches` where `is_current = true`.

#### **Current Batch Filtering**
Analytics data is scoped to **current batches** (marked as `is_current: true`).
- Leaderboard for enrollments: counts only current batch
- Conversion rate: confirmed payments / total leads in current batch
- Conversion window: from earliest current batch start → today

#### **Leaderboard Data** (Lines 450-560)
Returns officers ranked by:
1. **enrollmentsCurrentBatch**: confirmed payments in current batch
2. **leadsAssigned**: total leads assigned in current batch
3. **conversionRate**: payments / leads (for current batch)

---

## Key Design Patterns

### 1. **Batch Scoping**
- All dashboard metrics are scoped to "current batches" (marked in `program_batches`)
- This allows resetting metrics when moving to a new batch
- No explicit "reset" field—uses `is_current` flag instead

### 2. **XP Immutability**
- XP events are immutable (inserted, never deleted)
- Summary table stores cumulative `total_xp` (never negative, floors at 0)
- Deductions (like penalties) are negative events

### 3. **Deduplication**
- `awardXPOnce()` uses `(user_id, eventType, referenceId)` as unique key
- Prevents double-awarding for same action
- Idempotent cron via `{followup_id}:{YYYY-MM-DD}` reference format

### 4. **Sri Lanka Time Zone**
- All XP trend grouping uses Sri Lanka time (UTC+5:30)
- Cron runs at midnight SL time (≈ 18:30 UTC)
- Used consistently across trend calculations

### 5. **Two-Table XP Storage**
- **Events table**: full audit trail (immutable)
- **Summary table**: denormalized cumulative total (atomic updates)
- Summary allows fast leaderboard queries without aggregating all events

---

## No "Reset" Field Found

**Important Finding**: There is **no explicit `xp_reset` or `current_batch` field** in the XP system.

Instead, batch scoping is handled via:
1. **program_batches.is_current** flag—marks which batches are "active"
2. **Leaderboard filters**—only count current batch metrics
3. **Window filtering**—analytics use current batch start date as default window

To implement XP reset on batch change, would need to:
- Monitor `program_batches.is_current` flag changes
- Or add an explicit reset trigger in the batch setup flow
- Not currently implemented in visible codebase

---

## Summary

The XP system is a comprehensive gamification framework with:
- ✅ Event-based XP awarding (+/- various amounts)
- ✅ Leaderboard with ranking
- ✅ Daily XP trends with visual charts
- ✅ Badge achievements (6 types)
- ✅ Automatic penalties for overdue followups
- ✅ Batch-aware analytics (current batch scoping)
- ⚠️ **No explicit XP reset mechanism** (would need custom implementation)
