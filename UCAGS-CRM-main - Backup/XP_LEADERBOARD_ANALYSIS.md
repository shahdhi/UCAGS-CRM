# XP Routes & Service Analysis

## Overview
The XP leaderboard endpoint and related functionality is implemented in the Express backend (`backend/modules/xp/`) with no dedicated Supabase edge function. The daily report submission in the edge function does award XP to the `xp_events` table.

---

## 1. Leaderboard Endpoint

### Route Definition
**File:** `backend/modules/xp/xpRoutes.js` (lines 19-27)

```javascript
router.get('/leaderboard', isAdminOrOfficer, async (req, res) => {
  try {
    const leaderboard = await xpSvc.getLeaderboard();
    res.json({ success: true, leaderboard });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});
```

- **Endpoint:** `GET /api/xp/leaderboard`
- **Auth:** Requires `isAdminOrOfficer` middleware (both admins and officers can access)
- **Response:** JSON with `success: true` and `leaderboard` array

---

## 2. Leaderboard Data Tables & Queries

### Tables Queried
The leaderboard queries **THREE different tables**:

1. **`program_batches`** — to get current active batches
2. **`officer_xp_events`** — to aggregate XP for officers in current batches
3. **`auth.users`** (Supabase Auth) — to get officer metadata (name, email, role)

### NOTE on XP Tables
- **`officer_xp_events`** — Used by the backend leaderboard (stores event records with `user_id, xp, program_id, batch_name`)
- **`officer_xp_summary`** — Maintains a denormalized total for each user (stores `user_id, total_xp, last_updated`)
- **`xp_events`** — Used by edge functions (Supabase functions) for simple XP recording without program/batch context
- The leaderboard uses `officer_xp_events`, NOT `xp_events` or `officer_xp_summary`

---

## 3. SQL/Query Logic

### Service Function: `getLeaderboard()`
**File:** `backend/modules/xp/xpService.js` (lines 194-224)

#### Step 1: Get Current Batches
```javascript
async function getCurrentBatches(sb) {
  const { data, error } = await sb
    .from('program_batches')
    .select('program_id, batch_name')
    .eq('is_current', true);
  if (error) throw error;
  return data || [];
}
```
**Query Type:** Supabase JS SDK  
**Table:** `program_batches`  
**Filter:** `is_current = true`  
**Returns:** Array of `{ program_id, batch_name }` objects

#### Step 2: Aggregate XP from Events for Current Batches
```javascript
async function getCurrentBatchXPMap(sb) {
  const currentBatches = await getCurrentBatches(sb);
  if (!currentBatches.length) return new Map();

  const xpMap = new Map();

  for (const { program_id, batch_name } of currentBatches) {
    const { data: events, error } = await sb
      .from('officer_xp_events')
      .select('user_id, xp')
      .eq('program_id', program_id)
      .eq('batch_name', batch_name);

    if (error) throw error;

    for (const ev of (events || [])) {
      if (!ev.user_id) continue;
      xpMap.set(ev.user_id, (xpMap.get(ev.user_id) || 0) + Number(ev.xp || 0));
    }
  }

  return xpMap;
}
```
**Query Type:** Supabase JS SDK (no native OR support, loops per batch)  
**Table:** `officer_xp_events`  
**Filters:** `program_id = <val>` AND `batch_name = <val>` (per batch)  
**Aggregation:** Sums XP per `user_id` across all batches in JavaScript  
**Returns:** `Map<userId, totalXp>`

#### Step 3: Fetch Officer Metadata & Build Ranked List
```javascript
async function getLeaderboard() {
  const sb = requireSupabase();

  // Get XP for current active batches only
  const xpMap = await getCurrentBatchXPMap(sb);

  // Fetch user metadata to get names
  const { data: { users }, error: uErr } = await sb.auth.admin.listUsers();
  if (uErr) throw uErr;

  // Only include officers (not admins) with XP > 0, or all officers
  const officers = (users || []).filter(u =>
    u.user_metadata?.role === 'officer' || u.user_metadata?.role === 'admin'
  );

  // Build ranked list — include all officers, defaulting to 0 XP if none this batch
  const list = officers.map(u => ({
    userId: u.id,
    name: u.user_metadata?.name || u.email?.split('@')[0] || 'Unknown',
    email: u.email || '',
    role: u.user_metadata?.role || '',
    totalXp: xpMap.get(u.id) || 0,
    lastUpdated: null
  }));

  // Sort by XP descending
  list.sort((a, b) => b.totalXp - a.totalXp);

  let rank = 1;
  return list.map(entry => ({ ...entry, rank: rank++ }));
}
```
**Query Type:** Supabase Admin Auth API  
**Auth Endpoint:** `sb.auth.admin.listUsers()`  
**Filters (in JS):** Only users with `role === 'officer'` or `role === 'admin'`  
**Data Structure:** Returns array of objects:
```javascript
{
  userId: string,
  name: string,
  email: string,
  role: string,
  totalXp: number,
  rank: number,
  lastUpdated: null
}
```

---

## 4. Supabase Edge Functions — XP Related

### Location
**File:** `supabase/functions/crm-reports/index.ts`

#### Daily Report Submission Awards XP
When a daily report is submitted (`POST /daily/submit`), lines 313-323 award 2 XP:

```typescript
// Award 2 XP (best-effort, non-fatal)
try {
  await sb.from('xp_events').insert({
    user_id: officerUserId,
    event_type: 'report_submitted',
    xp: 2,
    reference_id: `${officerUserId}:${dateISO}:${slotKey}`,
    reference_type: 'report',
    note: `Daily report submitted — ${slotKey} (${dateISO})`,
    created_at: new Date().toISOString(),
  });
} catch (_) { /* non-fatal */ }
```

**Important:** This uses the `xp_events` table, NOT `officer_xp_events`. The edge function writes to a simpler XP table without program/batch context.

### Additional XP Edge Function: crm-registrations
**File:** `supabase/functions/crm-registrations/index.ts` (lines 242-290)

The registration edge function has an `awardXPOnce()` helper that writes to **both**:
1. `officer_xp_events` — with program_id and batch_name
2. `officer_xp_summary` — maintains denormalized total_xp counter

```typescript
async function awardXPOnce(sb: any, { userId, eventType, xp, referenceId, referenceType, note, programId, batchName }: any) {
  // ... deduplication logic ...
  
  // Insert into officer_xp_events
  await sb.from('officer_xp_events').insert({
    user_id: userId,
    event_type: eventType,
    xp: xp ?? 0,
    reference_id: referenceId || null,
    reference_type: referenceType || null,
    note: note || null,
    program_id: programId || null,
    batch_name: batchName || null,
    created_at: new Date().toISOString(),
  });

  // Upsert XP summary (total_xp counter)
  const existing = await sb.from('officer_xp_summary').select('total_xp').eq('user_id', userId).maybeSingle();
  const currentXP = Number(existing?.total_xp ?? 0);
  const newXP = Math.max(0, currentXP + (xp ?? 0));
  
  await sb.from('officer_xp_summary').upsert({
    user_id: userId,
    total_xp: newXP,
  });
}
```

This is called when processing registrations (e.g., `xp: 40, referenceId: data.id, referenceType: 'registration'`).

---

## 5. Summary Table

| Aspect | Details |
|--------|---------|
| **Leaderboard Endpoint** | `GET /api/xp/leaderboard` (admin + officer) |
| **Primary Table** | `officer_xp_events` |
| **Secondary Tables** | `program_batches`, Supabase Auth (`auth.users`) |
| **XP Scope** | Only current batch (where `program_batches.is_current = true`) |
| **Aggregation** | Sum of XP per user_id from `officer_xp_events` |
| **Data Flow** | Fetches current batches → sums XP per user → fetches officer metadata → ranks by XP descending |
| **Edge Function for Leaderboard** | None (leaderboard is Express backend only) |
| **Edge Function XP Entry Points** | `crm-reports` (report submission → `xp_events`), `crm-registrations` (registrations → `officer_xp_events` + `officer_xp_summary`) |
| **XP Tables Used** | `officer_xp_events` (backend leaderboard), `xp_events` (edge reports), `officer_xp_summary` (denormalized total) |

---

## 6. Key Observations

1. **Leaderboard is Backend-Only** — No Supabase edge function serves the leaderboard; it's a pure Express endpoint
2. **Current Batch Filter** — Leaderboard only includes XP from active batches (not all-time XP)
3. **Dual Table Strategy** — Backend uses `officer_xp_events` (with batch context), while edge functions also write to `xp_events` (without batch context)
4. **Denormalization** — `officer_xp_summary` is maintained as a fast-access total, but the leaderboard recalculates from `officer_xp_events` 
5. **No Native OR** — Supabase JS SDK doesn't support OR, so the service loops through batches and aggregates in JavaScript
6. **Officers + Admins** — Leaderboard includes both officer and admin roles
7. **XP Floor** — XP never goes negative (use `Math.max(0, ...)` to prevent negative totals)
