---
description: "Use when working on XP points, leaderboard, officer rankings, batch resets, XP rewards, penalties, archives, or anything related to the experience points system in UCAGS-CRM. Covers how XP is awarded, stored, calculated, and archived on batch change."
---

# XP System — Workflow & Architecture

> **IMPORTANT**: The Supabase edge function for XP (`supabase/functions/crm-reports/index.ts`) is **non-functional and unused**. All active XP logic runs through:
> - **Backend**: `backend/modules/xp/` (Node.js, express routes)
> - **Frontend**: `public/frontend/pages/dashboard/xpDashboard.js`, `public/js/app.js`
> - **API**: Vercel serverless functions in `api/`

---

## 1. How XP Is Rewarded

All event types and base values are defined in `backend/modules/xp/xpService.js` (lines 6–16):

| Event Type | XP | Trigger Source |
|---|---|---|
| `lead_contacted` | +2 | Lead status changed from 'New' → `crmLeadsRoutes.js` |
| `followup_completed` | +1 (+2 if answered=yes) | Followup `actual_at` newly set → `followupsRoutes.js` |
| `lead_responded_fast` | +2 | First followup within 1h of lead assignment → `followupsRoutes.js` |
| `registration_received` | +40 | New unique registration submitted → `registrationsRoutes.js` |
| `payment_received` | +100 | Payment confirmed → `paymentsRoutes.js` |
| `demo_attended` | +30 | Demo session marked 'Attended' → `demoSessionsRoutes.js` |
| `checklist_completed` | +2 | *(not yet implemented)* |
| `report_submitted` | +2 | *(non-functional — Supabase edge function is broken)* |
| `attendance_on_time` | +1 | *(not yet implemented)* |
| `followup_overdue` | **-5** | Daily cron at SL midnight → `xpCron.js` |

### Award Functions (all in `xpService.js`)

- **`awardXP(opts)`** — Core. Inserts event + upserts summary. Never use directly in routes.
- **`awardXPSafe(opts)`** — Preferred. Wraps `awardXP`, catches errors silently so XP never breaks the calling workflow.
- **`awardXPOnce(opts)`** — Deduplication wrapper. Checks `(user_id, eventType, referenceId)` uniqueness before awarding. Use this to prevent double-awards from webhook retries.

### Deduplication
`alreadyAwarded(opts)` checks `officer_xp_events` for an existing row with the same `event_type + reference_id`. Always pass a meaningful `referenceId` (e.g. followup ID, payment ID) to enable this.

---

## 2. How XP Is Stored

Four Supabase tables:

### `officer_xp_events` — Immutable audit log
- `id`, `user_id`, `event_type`, `xp` (can be negative), `reference_id`, `reference_type`, `program_id`, `batch_name`, `note`, `created_at`
- Never update or delete rows — this is append-only
- Indexed on `user_id`, `created_at`, `event_type`

### `officer_xp_summary` — Denormalized cache
- `user_id` (PK), `total_xp`, `last_updated`
- **Lifetime cumulative total** — never reset, even on batch change
- Updated via upsert in `awardXP()` every time XP is awarded

### `officer_xp_archives` — Historical batch snapshots
- `id`, `user_id`, `program_id`, `batch_name`, `total_xp`, `archived_at`
- Read-only. Written during batch transitions. Not subtracted from live totals.

### `officer_xp_overrides` — Manual admin adjustments
- `(user_id, batch_name)` unique. Admin can set a custom XP value for a specific officer in a specific batch.
- Managed via `/api/xp/admin/overrides`

---

## 3. How the Total Is Calculated

### Live total (per officer)
1. Event inserted → `officer_xp_events`
2. Current `total_xp` fetched from `officer_xp_summary`
3. New total = `Math.max(0, currentXP + xp)` — **floors at 0, never goes negative**
4. Upsert into `officer_xp_summary`

### Current batch XP (`getCurrentBatchXPMap()` in `xpService.js`)
- Looks up `program_batches` where `is_current = true`
- Filters `officer_xp_events` by `program_id + batch_name`
- Sums `xp` per `user_id` in JavaScript
- Used by leaderboard to show only current-batch performance

### Leaderboard (`getLeaderboard()` in `xpService.js`)
- Reads `officer_xp_summary` → sorts descending by `total_xp`
- Enriches with user metadata from Supabase Auth
- Assigns sequential rank (1, 2, 3, …)

### Trend calculation
- `getXPTrend(userId, days)` — personal daily XP chart, converts UTC → SL time (UTC+5:30), fills zero days
- `getGlobalXPTrend(days)` — all officers combined, admin view

### Level thresholds (frontend, `xpDashboard.js`)
```
Levels 1–10:  [0, 500, 1000, 1600, 2500, 3200, 4000, 5000, 6400, 8000]
Levels 11–15: +2000/level  → 10000, 12000, 14000, 16000, 18000
Levels 16–20: +3000/level  → 21000, 24000, 27000, 30000, 33000
Levels 21+:   +4000/level
```

---

## 4. How XP Is Reset / Archived on Batch Change

### Trigger
`batchSetupService.js` calls `archiveAndResetXPForBatch()` (from `xpArchiveService.js`) **before** flipping `is_current` to the new batch. Only fires when the batch is actually changing (not re-saving same batch).

### Archive process (`archiveAndResetXPForBatch()` in `xpArchiveService.js`)
1. Query all `officer_xp_events` for this `program_id + batch_name`
2. Sum XP per officer
3. Insert per-officer snapshot into `officer_xp_archives`
4. **No subtraction from `officer_xp_summary`** — lifetime total stays intact

### Key design decision
- `officer_xp_summary.total_xp` = **lifetime cumulative** (never reset)
- **Per-batch XP** is always computed on-demand by filtering `officer_xp_events` on `program_id + batch_name`
- Leaderboard shows current-batch XP, not lifetime total
- Historical data is browsable via `/api/xp/archives?programId=&batchName=`

### Daily penalty cron (`xpCron.js`)
- Schedule: Sri Lanka midnight (≈ 18:30 UTC)
- Logic: finds followups where `scheduled_at ≤ 1 day ago` AND `actual_at IS NULL`
- Deducts -5 XP per overdue followup
- Idempotent: reference ID = `{followup_id}:{YYYY-MM-DD}` (SL date), won't double-penalize

---

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/xp/leaderboard` | GET | Admin/Officer | Officers ranked by XP |
| `/api/xp/me` | GET | Auth | Personal XP + 20 recent events |
| `/api/xp/trend?days=N` | GET | Auth | Personal daily XP trend |
| `/api/xp/global-trend?days=N` | GET | Admin | Team XP trend |
| `/api/xp/cron/overdue` | POST | Admin | Manually trigger overdue penalty |
| `/api/xp/archives` | GET | Admin | Browse archived batch snapshots |
| `/api/xp/admin/reset` | POST | Admin | Archive + trigger batch reset |
| `/api/xp/admin/overrides` | GET/PUT/DELETE | Admin | Manual XP adjustments |

---

## Key Files

| File | Role |
|---|---|
| `backend/modules/xp/xpService.js` | Core award logic, leaderboard, trends, penalties |
| `backend/modules/xp/xpArchiveService.js` | Batch archive logic |
| `backend/modules/xp/xpCron.js` | Daily overdue penalty scheduler |
| `backend/modules/batchSetup/batchSetupService.js` | Triggers archive on batch change |
| `public/frontend/pages/dashboard/xpDashboard.js` | Frontend XP dashboard rendering |
| `public/js/app.js` | Header XP widget |

## Do Not

- **Do not** call `awardXP()` directly from routes — always use `awardXPSafe()` or `awardXPOnce()`
- **Do not** subtract from `officer_xp_summary` manually — totals are floor-capped at 0 internally
- **Do not** add XP logic to Supabase edge functions — the `crm-reports` edge function is broken and not in use
- **Do not** assume `officer_xp_summary.total_xp` resets on batch change — it is lifetime accumulated
