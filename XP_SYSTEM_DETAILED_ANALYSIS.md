# XP System Analysis - UCAGS CRM

## Overview
The XP (Experience Points) system is a gamification mechanism that rewards officers (academic advisors) for various CRM activities. It includes leaderboards, level progression, achievements/badges, and automated penalties for overdue followups.

---

## 1. DATABASE SCHEMA (supabase_xp.sql)

### Table: `officer_xp_events` (Audit Log)
**Purpose:** Complete immutable history of every XP change.

```sql
CREATE TABLE officer_xp_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  event_type      text NOT NULL,  -- 'lead_contacted', 'followup_completed', etc.
  xp              int  NOT NULL,  -- positive (award) or negative (penalty)
  reference_id    text,           -- lead id, followup id, registration id, payment id, etc.
  reference_type  text,           -- 'lead', 'followup', 'registration', 'payment', 'attendance', 'report', 'checklist'
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_officer_xp_events_user_id` — Fast lookup by officer
- `idx_officer_xp_events_created_at` — Fast lookup by date (for trends)
- `idx_officer_xp_events_event_type` — Fast lookup by event type

**Row-Level Security:** Enabled, with service_role full access

---

### Table: `officer_xp_summary` (Cached Total)
**Purpose:** Fast lookup of total XP per officer (denormalized for performance).

```sql
CREATE TABLE officer_xp_summary (
  user_id      uuid PRIMARY KEY,
  total_xp     int NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now()
);
```

**Row-Level Security:** Enabled, with service_role full access

---

## 2. XP CALCULATION & AWARD SYSTEM

### XP Event Types & Values
All events defined in `xpService.js` (lines 5-16):

| Event Type | XP | Trigger | Notes |
|---|---|---|---|
| `lead_contacted` | +2 | Lead status changed from 'New' | Basic outreach |
| `followup_completed` | +1 or +2 | Followup `actual_at` newly set | +2 if answered=yes, +1 if no/unset |
| `registration_received` | +40 | New registration submitted | Major milestone |
| `payment_received` | +100 | Payment confirmed/received | Highest single reward |
| `demo_attended` | +30 | Demo session marked 'Attended' | Medium milestone |
| `attendance_on_time` | +1 | Check-in before 10:00 AM (SL time) | Daily bonus |
| `checklist_completed` | +2 | Daily checklist saved | Daily task |
| `report_submitted` | +2 | Daily report submitted (1 per slot) | Daily task |
| `lead_responded_fast` | +2 | Followup created within 1h of lead assignment | Bonus for speed |
| `followup_overdue` | -5 | Followup open 1+ day past scheduled_at | Daily penalty (cron) |

### Award Functions

#### `awardXP(opts)` — Core function
**Location:** `xpService.js` lines 43-86

**Behavior:**
1. Validates input (userId, eventType, xp ≠ 0)
2. Inserts row into `officer_xp_events` table
3. Fetches current total from `officer_xp_summary`
4. **Floors XP at 0** — `newXP = Math.max(0, currentXP + xp)`
5. Upserts into `officer_xp_summary` with new total
6. Returns the inserted event row

**Key Logic:**
```javascript
const currentXP = Number(existing?.total_xp || 0);
const newXP = Math.max(0, currentXP + xp); // Never goes negative
```

#### `awardXPSafe(opts)` — Wrapped for safety
**Location:** `xpService.js` lines 91-98

- Calls `awardXP()` but catches errors
- Logs warnings instead of throwing
- Returns `null` on failure
- **Purpose:** XP failures never break main application flows

#### `awardXPOnce(opts)` — Deduplication wrapper
**Location:** `xpService.js` lines 125-138

**Behavior:**
1. Checks if `(user_id, event_type, reference_id)` combo already exists via `alreadyAwarded()`
2. If already exists → returns `null` (prevents double-award)
3. If new → calls `awardXP()` and returns result

**Deduplication Helper** `alreadyAwarded()` (lines 106-120):
```javascript
async function alreadyAwarded({ userId, eventType, referenceId }) {
  const { data } = await sb
    .from('officer_xp_events')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .eq('reference_id', String(referenceId))
    .limit(1)
    .maybeSingle();
  return !!data;
}
```

**Use Case:** Prevents awarding XP twice if the same event is processed multiple times (e.g., webhook retries, manual triggers).

---

## 3. CRON JOB: Overdue Followup Penalties

### Cron Implementation (xpCron.js)

#### Scheduling
**Location:** `xpCron.js` lines 32-52

**Trigger:** Daily at **Sri Lanka midnight (UTC+05:30)** ≈ 18:30 UTC

**Setup:**
```javascript
function startXPCron() {
  const delay = msUntilSLMidnight(); // Calculate ms until next SL midnight
  setTimeout(() => {
    runPenalty(); // First run
    setInterval(runPenalty, 24 * 60 * 60 * 1000); // Then every 24h
  }, delay);
}
```

**Time Calculation:**
- SL Offset: `UTC+05:30` = `330 * 60 * 1000` ms
- Converts UTC now → SL time → finds next midnight → converts back to UTC
- Ensures idempotency by using Sri Lanka date (not UTC)

#### Penalty Logic
**Location:** `xpService.js` lines 294-339 (`penaliseOverdueFollowups()`)

**Query:**
```javascript
const { data: overdue } = await sb
  .from('crm_lead_followups')
  .select('id, officer_user_id, scheduled_at')
  .is('actual_at', null)           // Followup not completed
  .not('scheduled_at', 'is', null) // Followup has scheduled date
  .lte('scheduled_at', oneDayAgo.toISOString()); // Scheduled >1 day ago
```

**Processing per Followup:**
1. Reference ID: `{followup_id}:{YYYY-MM-DD}` (SL date)
2. Calls `awardXPOnce()` with `-5 XP`
3. **Idempotency:** Same `{followup_id}:{date}` combo prevents re-penalizing

**Return Value:**
```javascript
{ penalised: <count>, skipped: <count> }
```
- `penalised`: New penalties applied
- `skipped`: Followups without assigned officer or already penalized today

---

## 4. XP RESET & ARCHIVAL MECHANISM

### Current State: **NO RESET/ARCHIVE MECHANISM**

**Findings:**
1. **No reset function** in `xpService.js`
2. **No reset endpoint** in `xpRoutes.js`
3. **No cron job** to zero XP at intervals
4. **No archival table** for historical snapshots
5. **XP accumulates indefinitely** across all time

### Implications
- Officers never lose XP (except `-5` for overdue followups)
- Leaderboards are cumulative lifetime rankings
- No seasonal/monthly reset cycles
- Historical data never deleted (immutable event log)

### If Reset Were Needed (Design Considerations)
Would require:
1. **New table:** `officer_xp_summary_archive` (snapshot history)
2. **New function:** `archiveAndResetXP(resetDate)` that:
   - Copies current `officer_xp_summary` to archive with `reset_period` meta
   - Resets all `total_xp` to 0
   - Optionally truncates/archives `officer_xp_events`
3. **New endpoint:** `POST /api/xp/admin/reset` (admin-only)
4. **New cron option:** Monthly/seasonal reset

---

## 5. BATCH-RELATED LOGIC IN XP

### Findings: **NO BATCH-SPECIFIC XP LOGIC**

**Current Behavior:**
- XP is **user-centric only** (indexed by `user_id`)
- **No batch filtering** in any XP query
- **No batch-aware awards** (all events counted equally)
- **No batch-segregated leaderboards**

### XP Functions Don't Access Batch Tables
- `xpService.js` never queries `batches`, `batch_members`, etc.
- `penaliseOverdueFollowups()` queries `crm_lead_followups` but doesn't filter by batch
- Leaderboard (`getLeaderboard()`) ranks all officers globally

### Frontend: No Batch Filter for XP
**`xpDashboard.js` observations:**
- XP displays are global/personal (no batch parameter)
- Leaderboard is global (not batch-scoped)
- Trend charts are global/personal (not batch-filtered)
- Badge system is global (not batch-aware)

### Example: `getLeaderboard()` Query
**Location:** `xpService.js` lines 146-175
```javascript
async function getLeaderboard() {
  const { data: summaries } = await sb
    .from('officer_xp_summary')
    .select('user_id, total_xp, last_updated')
    .order('total_xp', { ascending: false }); // ALL officers, no batch filter
  // ...
}
```

### If Batch-Scoped XP Were Needed
Would require:
1. **Schema change:** Add `batch_id` column to both XP tables
2. **Index change:** Add index on `(user_id, batch_id, created_at)`
3. **Query changes:** All XP functions need batch parameter
4. **Frontend changes:** Leaderboard/trend need batch selector
5. **Award logic:** Determine batch from context (lead, followup, registration)

---

## 6. ROUTES & API ENDPOINTS

### GET `/api/xp/leaderboard` (xpRoutes.js:17-24)
- **Auth:** `isAdminOrOfficer`
- **Returns:** All officers ranked by total XP descending
- **Response:** `{ success, leaderboard: [{userId, name, email, role, totalXp, rank, lastUpdated}, ...] }`

### GET `/api/xp/me` (xpRoutes.js:27-36)
- **Auth:** `isAuthenticated`
- **Returns:** Personal XP summary + recent 20 events
- **Response:** `{ success, totalXp, rank, totalOfficers, recentEvents }`

### GET `/api/xp/trend?days=30` (xpRoutes.js:39-49)
- **Auth:** `isAuthenticated`
- **Query Param:** `days` (min 30, max 90; default 30)
- **Returns:** Daily XP totals for user over N days
- **Response:** `{ success, trend: [{date, xp}, ...] }`
- **Date Grouping:** Sri Lanka timezone (UTC+05:30)

### GET `/api/xp/global-trend?days=30` (xpRoutes.js:52-60)
- **Auth:** `isAdmin` only
- **Returns:** Daily XP totals for **all officers combined** over N days
- **Response:** `{ success, trend: [{date, xp}, ...] }`
- **Use Case:** Admin dashboard to see team XP velocity

### POST `/api/xp/cron/overdue` (xpRoutes.js:63-70)
- **Auth:** `isAdmin` only
- **Manual Trigger:** Can be called by admin or the cron job (`xpCron.js`)
- **Returns:** `{ success, penalised, skipped }`
- **Side Effect:** Penalizes overdue followups immediately (no delay)

---

## 7. FRONTEND DISPLAY & INTERACTION

### `xpDashboard.js` Major Features

#### Level System (lines 21-28)
**Thresholds (cumulative XP):**
- Levels 1-10: Fixed increments (0, 500, 1000, 1600, 2500, 3200, 4000, 5000, 6400, 8000)
- Levels 11-15: +2000 per level (10000, 12000, 14000, 16000, 18000)
- Levels 16-20: +3000 per level (21000, 24000, 27000, 30000, 33000)
- Levels 21+: +4000 per level (up to level 50+)

**Helper Functions:**
- `levelFor(xp)` — Calculates current level
- `nextLevelXp(xp)` — XP required for next level
- `xpProgress(xp)` — % progress to next level (0-100)

#### Profile Section (lines 179-269)
- Shows officer name, role, level
- Level ring animation (officers only; admins see shield)
- XP bar with progress animation
- Rank badge: `#N of M` officers
- Admin users show "Administrator" instead of level

#### KPI Metrics (lines 272-311)
- Confirmed payments (enrollments)
- Conversion rate
- Follow-ups due/overdue
- Active leads count
- Registrations
- **Total XP widget** with rank indicator

#### XP Trend Chart (lines 314-407)
- Line chart using Chart.js
- Toggles: 7 days or 30 days view
- Stats strip: Current XP, Highest Day, Avg XP/day
- **Admin view:** "Team XP" (global-trend)
- **Officer view:** "My XP" (personal trend)

#### Achievements/Badges (lines 410-456)
**6 Possible Badges:**
1. **First Contact** — `lead_contacted` event detected
2. **Follower** — `followup_completed` event detected
3. **Registrar** — `registration_received` event detected
4. **Speed Demon** — `lead_responded_fast` event detected
5. **Closer** — `payment_received` event detected
6. **Diligent** — `checklist_completed` event detected

**Display:**
- Locked/unlocked based on presence in `recentEvents`
- Shows icon, label, XP value, earned dot (if unlocked)
- Summary: "N / 6 badges earned" with trophy if all earned

#### Leaderboard (lines 562-615)
- Top officers ranked by total XP
- Medal icons for top 3 (gold/silver/bronze)
- Rank #N for 4+
- Highlights current user with background + purple border
- Shows "(you)" label for current user

---

## 8. KEY IMPLEMENTATION DETAILS

### Time Zone Handling
**All XP calculations use Sri Lanka time (UTC+05:30)**

**Implementation in both backend and frontend:**
```javascript
const SL_OFFSET = 330; // minutes
const slNow = new Date(now + SL_OFFSET * 60 * 1000); // convert UTC to SL
const dateKey = slNow.toISOString().slice(0, 10); // YYYY-MM-DD in SL time
```

### Deduplication Strategy
**Idempotency via `awardXPOnce()`:**
- Uses `(user_id, event_type, reference_id)` as composite key
- Prevents double-award from webhook retries
- Example: `reference_id = followup_id:2024-01-15` for overdue penalty

### Atomic XP Updates
**No explicit RPC transaction, but safe upsert pattern:**
1. Read current total from `officer_xp_summary`
2. Calculate new total (capped at 0 minimum)
3. Upsert with `onConflict: 'user_id'`
4. Event inserted first (immutable log)
5. Summary updated after (best-effort)

**Note:** If summary update fails, event still logged. Periodic reconciliation could be added.

### Error Handling
- **awardXPSafe()** suppresses errors (logs warning, returns null)
- Allows main flows to continue even if XP fails
- Cron job catches errors and logs them
- No XP failures cause API 500 responses

---

## 9. SUMMARY TABLE

| Aspect | Details |
|---|---|
| **Storage** | Two tables: `officer_xp_events` (immutable log) + `officer_xp_summary` (cached total) |
| **Award Types** | 10 event types ranging from +1 to +100 XP |
| **Deduplication** | `awardXPOnce()` via `(user_id, event_type, reference_id)` composite |
| **Cron Penalty** | Daily at SL midnight; -5 XP per overdue followup; idempotent via `{id}:{date}` |
| **Reset/Archive** | **None currently implemented** |
| **Batch Scope** | **None; XP is global per officer** |
| **Time Zone** | **Sri Lanka (UTC+05:30)** for all date calculations |
| **Leaderboard** | Global ranking by `total_xp` descending |
| **Levels** | 50+ levels with variable XP thresholds |
| **API Routes** | 5 endpoints: leaderboard, me, trend, global-trend, cron/overdue |
| **Frontend Display** | Profile, KPIs, trend chart, achievements, leaderboard |
| **Floor Value** | XP never goes below 0 (penalties capped) |

---

## 10. POTENTIAL ISSUES & IMPROVEMENTS

### Current Limitations
1. **No reset mechanism** — XP accumulates forever; consider seasonal reset
2. **No batch scope** — Can't compare officers within a batch
3. **No transaction guarantee** — Event logged but summary update could fail silently
4. **No RPC function** — Could use Supabase RPC for atomic increment
5. **Cron timezone** — Hard-coded SL timezone; could be configurable
6. **No export/analytics** — No bulk XP data export or historical analysis

### Suggested Enhancements
1. Add `archiveAndResetXP()` function + endpoint for seasonal resets
2. Add `batch_id` to XP tables for batch-scoped leaderboards
3. Create Supabase RPC function `increment_xp()` for atomic updates
4. Add `officer_xp_summary_archive` table for historical snapshots
5. Add admin export endpoint for XP analytics
6. Add configuration table for XP values (event_type → xp mapping)
7. Add validation: Prevent awarding XP for deleted/invalid references

