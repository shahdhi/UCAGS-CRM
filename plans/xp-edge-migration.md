# XP System — Supabase Edge Function Migration Plan

## Current State
All XP routes run through the **Vercel Express backend** (`backend/modules/xp/`).
Frontend calls them with raw `fetch('/api/xp/...')`.

---

## Phase 1 — Read-only routes ✅ (complete)
**New edge function: `xp`**

Migrate these first since they only read data — zero risk to XP integrity.

| Route | Handler | Status |
|---|---|---|
| `GET /api/xp/me` | `getMyXP(userId)` | ✅ done |
| `GET /api/xp/leaderboard` | `getLeaderboard()` | ✅ done |
| `GET /api/xp/trend?days=` | `getXPTrend()` | ✅ done |
| `GET /api/xp/global-trend?days=` | `getGlobalXPTrend()` | ✅ done |
| `GET /api/xp/archives` | `getXPArchives()` | ✅ done |

Frontend changes:
- Added `EDGE_BASE_XP` constant in `apiService.js`
- Routes `/xp/*` to edge function via `fetchAPI`
- Added `API.xp` namespace: `getMe()`, `getLeaderboard()`, `getTrend()`, `globalTrend()`, `getArchives()`
- Replaced all raw `fetch('/api/xp/me', ...)` calls in:
  - `public/frontend/pages/dashboard/xpDashboard.js` (3 calls)
  - `public/js/app.js` (2 calls)
  - `public/frontend/pages/leads/leadManagement.js` (1 call)

---

## Phase 2 — Admin write routes (medium risk)

| Route | Notes |
|---|---|
| `GET /api/xp/admin/overrides` | Simple read from `officer_xp_overrides` |
| `PUT /api/xp/admin/overrides` | Upsert override row |
| `DELETE /api/xp/admin/overrides/:id` | Delete override row |
| `POST /api/xp/admin/reset` | Calls `archiveAndResetXPForBatch` — snapshot + insert to `officer_xp_archives` |

Callers to update: admin dashboard / batch setup pages.

---

## Phase 3 — XP award calls from other Vercel routes

XP is awarded server-side from:

| File | Event | XP |
|---|---|---|
| `crmLeadsRoutes.js` | `lead_contacted` | +2 |
| `registrationsRoutes.js` | `registration_received` | +40 |
| `paymentsRoutes.js` | `payment_received` | +100 |
| `demoSessionsRoutes.js` | `demo_attended` | +30 |
| `crm-leads` edge fn | `followup_completed`, `lead_responded_fast` | +1/+2/+2 ✅ already done |

**Options:**

- **Option A (recommended)** — Keep award calls on Vercel for now. Only Phase 1 reads move to edge. Safe and incremental.
- **Option B** — Migrate each parent route (registrations, payments, demos) to its own edge function; XP awarding moves with it naturally.
- **Option C** — Expose a private `POST /award` in the `xp` edge function (service-role only, not user-accessible). Other edge functions call it via internal `fetch` with the service role key. Avoids duplicating `insertXPEvent` logic.

> The `crm-leads` edge function already has the `insertXPEvent` helper duplicated. Once Phase 3 is tackled, consolidate via Option C.

---

## Phase 4 — Cron job (`followup_overdue` −5 XP penalty)

Currently: Node.js cron inside `backend/modules/xp/xpCron.js` running via `node-cron`.

Migration options:
- **Supabase pg_cron** — pure SQL, runs inside the database. No edge function needed.
- **Scheduled edge function** — defined in `supabase/config.toml` with a cron schedule. Can reuse `penaliseOverdueFollowups` logic ported to TypeScript.

Trigger: daily at SL midnight (UTC+5:30 = 18:30 UTC).

---

## Key Notes

- `auth.admin.listUsers()` works in edge functions with `SERVICE_ROLE_KEY` (same as `crm-leads` already uses).
- `officer_xp_summary.total_xp` is a cached running total — never recomputed from scratch, only incremented on each award.
- XP **floors at 0** — `Math.max(0, current + xp)` — never goes negative.
- All awards use `awardXPOnce` pattern: dedup check on `(user_id, event_type, reference_id)` in `officer_xp_events` before inserting.
- SL timezone offset for date grouping: UTC+5:30 = +330 minutes.
