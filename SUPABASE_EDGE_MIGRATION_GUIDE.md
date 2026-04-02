# Supabase Edge Functions Migration Guide
## UCAGS CRM — Vercel → Supabase Edge

**Last updated:** 2026-03-31  
**Status:** `crm-leads` ✅ Migrated | All others ⏳ Pending

---

## Overview

The current architecture routes all API calls through a **Vercel serverless Express backend** (`api/[...path].js → backend/modules/*`). The goal is to move all routes into **Supabase Edge Functions** (Deno runtime), removing the Vercel dependency entirely.

### Architecture Comparison

```
CURRENT (Vercel Express)
Frontend → /api/* → Vercel → Express → Supabase DB / Google APIs

TARGET (Supabase Edge)
Frontend → SUPABASE_URL/functions/v1/* → Deno Edge Function → Supabase DB / Google APIs
```

---

## What Was Already Migrated

### ✅ `crm-leads` — COMPLETE

- **Edge function:** `supabase/functions/crm-leads/index.ts`
- **Frontend routing:** `public/frontend/services/apiService.js` — `/crm-leads/*` → `EDGE_BASE`
- **Config:** `supabase/config.toml` → `verify_jwt = false` (function handles auth internally)
- **Deploy command:** `supabase functions deploy crm-leads --project-ref xddaxiwyszynjyrizkmc --no-verify-jwt`

**All 19 endpoints migrated:**
| Method | Path | Auth |
|--------|------|------|
| GET | `/crm-leads/admin` | Admin or Staff |
| GET | `/crm-leads/my` | Any authenticated |
| PUT | `/crm-leads/admin/:batch/:sheet/:id` | Admin |
| PUT | `/crm-leads/my/:batch/:sheet/:id` | Any authenticated |
| POST | `/crm-leads/admin/create` | Admin |
| POST | `/crm-leads/my/create` | Any authenticated |
| POST | `/crm-leads/admin/copy` | Admin |
| POST | `/crm-leads/admin/copy-bulk` | Admin |
| POST | `/crm-leads/my/copy` | Any authenticated |
| POST | `/crm-leads/my/copy-bulk` | Any authenticated |
| POST | `/crm-leads/admin/distribute-unassigned` | Admin |
| POST | `/crm-leads/admin/bulk-assign` | Admin |
| POST | `/crm-leads/admin/bulk-distribute` | Admin |
| POST | `/crm-leads/admin/bulk-delete` | Admin |
| POST | `/crm-leads/my/bulk-delete` | Any authenticated |
| GET | `/crm-leads/admin/export.csv` | Admin |
| POST | `/crm-leads/admin/import` | Admin |
| GET/POST/DELETE | `/crm-leads/meta/sheets` | Admin or Staff |
| GET | `/crm-leads/admin/meta/batches` | Admin or Staff |
| GET | `/crm-leads/admin/meta/sheets` | Admin or Staff |

---

## Shared Infrastructure

### `supabase/functions/_shared/cors.ts`
Already in place. Import in every new function:
```ts
import { corsHeaders, handleCors } from '../_shared/cors.ts';
```

### Auth Pattern (copy this into every new function)
```ts
// At top of file
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

function adminSb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: { user }, error } = await adminSb().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

function isAdmin(user: any): boolean {
  if ((user?.user_metadata?.role ?? '') === 'admin') return true;
  return ADMIN_EMAILS.includes((user?.email ?? '').toLowerCase());
}

function isAdminOrOfficer(user: any): boolean {
  if (isAdmin(user)) return true;
  const staffRoles = user?.user_metadata?.staff_roles;
  return Array.isArray(staffRoles) && staffRoles.length > 0;
}

function userName(user: any): string {
  return (user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? '').trim();
}
```

### Frontend Routing Pattern (apiService.js)
For each new edge function, add a routing block in `fetchAPI()`:
```js
// At top of apiService.js — add constant per function:
const EDGE_BASE_<NAME> = 'https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/<function-name>';

// In fetchAPI(), before the existing routing block:
} else if (endpoint.startsWith('/<route-prefix>/') || endpoint === '/<route-prefix>') {
  const suffix = endpoint.replace(/^\/<route-prefix>\/?/, '');
  fullUrl = suffix ? `${EDGE_BASE_<NAME>}/${suffix}` : EDGE_BASE_<NAME>;
  extraHeaders['apikey'] = EDGE_ANON_KEY;
```

### config.toml — Always use `verify_jwt = false`
Add a section for each new function:
```toml
[functions.<function-name>]
verify_jwt = false
```
> **Why false?** The Supabase gateway validates JWTs against the project secret when `verify_jwt = true` and can reject valid tokens. Our functions verify the JWT themselves using `adminSb().auth.getUser(token)`, which is safer and gives us access to `user_metadata`.

### Deploy Command
```bash
supabase functions deploy <function-name> --project-ref xddaxiwyszynjyrizkmc --no-verify-jwt
```

---

## Remaining Routes — Migration Roadmap

Routes are grouped by **priority** (business impact) and **complexity** (migration effort).

---

### 🟢 PRIORITY 1 — Simple (Supabase-only, migrate first)

These touch only Supabase tables with simple CRUD. Fastest to migrate (~1-2 hours each).

---

#### `notifications` → Edge function: `crm-notifications`
**File:** `backend/modules/notifications/notificationsRoutes.js`  
**Complexity:** Simple  
**Tables:** `notifications`, `notification_settings`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | List user notifications |
| PUT | `/notifications/:id/read` | Mark one as read |
| PUT | `/notifications/read-all` | Mark all as read |
| DELETE | `/notifications/:id` | Delete notification |
| GET | `/notifications/settings` | Get notification preferences |
| PUT | `/notifications/settings` | Update notification preferences |

**How to implement:**
1. Create `supabase/functions/crm-notifications/index.ts`
2. All routes query `notifications` table filtered by `user_id` from JWT
3. Use the shared auth pattern above
4. Update `apiService.js`: route `/notifications/*` → edge function
5. Add `[functions.crm-notifications] verify_jwt = false` to `config.toml`

---

#### `programs` → Edge function: `crm-programs`
**File:** `backend/modules/programs/programsRoutes.js`  
**Complexity:** Simple  
**Tables:** `programs`, `program_batches`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/programs` | List all programs |
| GET | `/programs/:id` | Get single program |
| POST | `/programs` | Create program (admin) |
| PUT | `/programs/:id` | Update program (admin) |
| DELETE | `/programs/:id` | Delete program (admin) |
| GET | `/programs/:id/batches` | List batches for program |

**How to implement:**
1. Create `supabase/functions/crm-programs/index.ts`
2. Pure Supabase CRUD — simple select/insert/update/delete
3. Admin-only for write ops, read is open to all authenticated users

---

#### `xp` → Edge function: `crm-xp`
**File:** `backend/modules/xp/xpRoutes.js`  
**Complexity:** Simple–Medium  
**Tables:** `xp_events`, `xp_leaderboard` (or computed)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/xp/leaderboard` | Get XP leaderboard |
| GET | `/xp/my` | Get current user XP |
| GET | `/xp/events` | List XP events |
| POST | `/xp/award` | Award XP (admin) |

**How to implement:**
1. Create `supabase/functions/crm-xp/index.ts`
2. Read `xpService.js` to port the aggregation logic
3. The cron job (`xpCron.js`) should become a **Supabase scheduled function** or Postgres cron

---

#### `students` → Edge function: `crm-students`
**File:** `backend/modules/students/studentsRoutes.js`  
**Complexity:** Simple  
**Tables:** `students`, `registrations`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/students` | List students |
| GET | `/students/:id` | Get student details |
| PUT | `/students/:id` | Update student |
| GET | `/students/:id/registrations` | Student's registrations |

---

#### `contacts` → Edge function: `crm-contacts`
**File:** `backend/modules/contacts/contactsRoutes.js`  
**Complexity:** Simple (read/write Supabase) + Complex (Google People API sync)  
**Tables:** `contacts`  
**External:** Google People API (for sync only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contacts` | List contacts |
| POST | `/contacts` | Create contact |
| PUT | `/contacts/:id` | Update contact |
| DELETE | `/contacts/:id` | Delete contact |
| POST | `/contacts/sync-google` | Sync from Google People API ⚠️ Complex |

**How to implement:**
- CRUD endpoints: Simple, port directly
- Google sync: Requires Google OAuth token — store token in Supabase `google_integrations` table, fetch it in the edge function, call People API via `fetch()`

---

### 🟡 PRIORITY 2 — Medium (some logic, migrate second)

---

#### `dashboard` → Edge function: `crm-dashboard`
**File:** `backend/modules/dashboard/dashboardRoutes.js`  
**Complexity:** Medium  
**Tables:** Multiple — `crm_leads`, `registrations`, `payments`, `xp_events`, `daily_reports`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/stats` | Aggregate stats for dashboard |
| GET | `/dashboard/officer-stats` | Per-officer breakdown |
| GET | `/dashboard/recent-activity` | Recent events |

**How to implement:**
1. Port the aggregation queries directly — they're SQL-friendly
2. Consider using **Supabase RPC** (Postgres functions) for heavy aggregations instead of JS loops
3. Add caching via in-memory Map with TTL (same pattern as `dupPhoneCache` in `crm-leads`)

---

#### `calendar` → Edge function: `crm-calendar`
**Files:** `calendarTasksRoutes.js`, `followupCalendarRoutes.js`  
**Complexity:** Medium  
**Tables:** `calendar_tasks`, `followups`, `crm_leads`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/calendar/tasks` | List calendar tasks |
| POST | `/calendar/tasks` | Create task |
| PUT | `/calendar/tasks/:id` | Update task |
| DELETE | `/calendar/tasks/:id` | Delete task |
| GET | `/calendar/followups` | Followup calendar view |

---

#### `demo-sessions` → Edge function: `crm-demo-sessions`
**File:** `backend/modules/demoSessions/demoSessionsRoutes.js`  
**Complexity:** Medium  
**Tables:** `demo_sessions`, `xp_events`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/demo-sessions` | List sessions |
| POST | `/demo-sessions` | Create session + award XP |
| PUT | `/demo-sessions/:id` | Update session |
| DELETE | `/demo-sessions/:id` | Delete session |

---

#### `payments` → Edge function: `crm-payments`
**File:** `backend/modules/payments/paymentsRoutes.js`  
**Complexity:** Medium  
**Tables:** `payments`, `batch_payment_setup`, `registrations`, `xp_events`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/payments` | List payments |
| POST | `/payments` | Record payment + trigger XP |
| PUT | `/payments/:id` | Update payment |
| GET | `/payments/setup` | Get payment configuration |

---

#### `registrations` → Edge function: `crm-registrations`
**File:** `backend/modules/registrations/registrationsRoutes.js`  
**Complexity:** Medium–Complex  
**Tables:** `registrations`, `students`, `crm_leads`, `notifications`, `xp_events`  
**External:** Google Sheets (export only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/registrations` | List registrations |
| POST | `/registrations` | Create registration (multi-step) |
| PUT | `/registrations/:id` | Update registration |
| DELETE | `/registrations/:id` | Delete registration |
| POST | `/registrations/export-sheets` | Export to Google Sheets ⚠️ Complex |

**How to implement:**
- CRUD: straightforward Supabase ops
- Export to Sheets: Use Google Sheets API v4 via `fetch()` with service account credentials stored as Supabase secrets

---

#### `reports` → Edge function: `crm-reports`
**Files:** `reportsRoutes.js`, `dailyChecklistService.js`, `dailyReportsService.js`  
**Complexity:** Medium  
**Tables:** `daily_reports`, `daily_checklist`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/daily` | Get daily reports |
| POST | `/reports/daily` | Submit daily report |
| GET | `/reports/checklist` | Get checklist items |
| POST | `/reports/checklist` | Submit checklist |
| GET | `/reports/summary` | Aggregated summary |

---

#### `admissions` → Edge function: `crm-admissions`
**File:** `backend/modules/admissions/admissionsRoutes.js`  
**Complexity:** Medium  
**Tables:** `registrations`, `programs`, `crm_leads`

---

### 🔴 PRIORITY 3 — Complex (external APIs, migrate last)

These require Google API credentials or maintain long-lived state (WhatsApp). They are the hardest to migrate and may be left on Vercel longer or handled differently.

---

#### `attendance` → Edge function: `crm-attendance`
**File:** `backend/modules/attendance/attendanceRoutes.js`  
**Complexity:** Complex  
**Tables:** `attendance`, `attendance_overrides`  
**External:** Google Sheets (reads/writes attendance sheet)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/attendance` | Get attendance records |
| POST | `/attendance` | Mark attendance |
| PUT | `/attendance/:id` | Override attendance (admin) |
| GET | `/attendance/calendar` | Calendar view |
| GET | `/attendance/summary` | Summary stats |
| POST | `/attendance/leave-request` | Submit leave request |

**How to implement:**
1. Store Google service account JSON as a Supabase secret: `supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='...'`
2. In the edge function use `Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')` and call Sheets API v4 via `fetch()`
3. Use the `googleapis` pattern but via direct REST calls (no npm in Deno — use `fetch()`)

**Google Sheets REST call pattern for Deno:**
```ts
async function getSheetsAccessToken(): Promise<string> {
  const sa = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!);
  // Create JWT and exchange for access token using Deno's built-in crypto
  // Use: https://esm.sh/google-auth-library@9 or manual JWT
  const { GoogleAuth } = await import('https://esm.sh/google-auth-library@9');
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token!;
}

async function readSheet(spreadsheetId: string, range: string) {
  const token = await getSheetsAccessToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}
```

---

#### `batches` → Edge function: `crm-batches`
**Files:** `batchesRoutes.js`, `batchLeadsRoutes.js`, `batchSyncRoutes.js`, `batchSetupRoutes.js`  
**Complexity:** Complex  
**Tables:** `batches`, `batch_assignment`, `crm_leads`  
**External:** Google Sheets (batch sheets sync)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/batches` | List batches |
| POST | `/batches` | Create batch |
| GET | `/batches/:id/leads` | Leads in batch |
| POST | `/batches/sync` | Sync batch ↔ Sheets ⚠️ Very Complex |
| POST | `/batches/setup` | Setup batch sheets |

**Note:** The sync routes are the most complex in the whole system — bidirectional Google Sheets ↔ Supabase sync. Consider keeping this on Vercel and only migrating the simple CRUD parts.

---

#### `users` → Edge function: `crm-users`
**File:** `backend/modules/users/usersRoutes.js`  
**Complexity:** Complex  
**External:** Supabase Auth Admin API, Google Sheets (personal sheets setup)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users` | List all users (admin) |
| POST | `/users` | Create user + setup sheets |
| PUT | `/users/:id` | Update user metadata |
| DELETE | `/users/:id` | Delete user |
| POST | `/users/:id/confirm` | Confirm email |

**How to implement:**
- Use `adminSb().auth.admin.*` methods — these work natively in edge functions with the service role key
- Sheet setup on user creation: call Google Sheets API (see pattern above)

---

#### `receipts` → Edge function: `crm-receipts`
**File:** `backend/modules/receipts/receiptsRoutes.js`  
**Complexity:** Medium–Complex  
**Tables:** `receipts`, `payments`  
**External:** PDF generation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/receipts` | List receipts |
| POST | `/receipts` | Generate receipt |
| GET | `/receipts/:id/pdf` | Download PDF ⚠️ Complex |

**Note:** PDF generation in Deno requires a different approach — use `https://esm.sh/jspdf` or generate HTML and use a headless service. Alternatively keep PDF generation on Vercel and only move the data endpoints.

---

#### `whatsapp` — ⚠️ DO NOT MIGRATE TO EDGE FUNCTIONS

**Files:** `whatsappRoutes.js`, `whatsappContainersRoutes.js`, `uploadRoutes.js`  
**Reason:** WhatsApp (via whatsapp-web.js or Baileys) requires a **persistent Node.js process** with an active browser session/WebSocket. Supabase edge functions are stateless and short-lived (max 150s) — completely incompatible.

**Recommendation:** Keep WhatsApp on a dedicated always-on server (VPS, Railway, Render) or use the **WhatsApp Cloud API** (Meta's official API) which is stateless and REST-based.

---

#### `google` → Keep on Vercel or migrate carefully
**File:** `backend/modules/google/googleRoutes.js`  
**Complexity:** Complex  
**External:** Google OAuth 2.0, Google People API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/google/auth-url` | Generate OAuth URL |
| GET | `/google/callback` | Handle OAuth callback |
| POST | `/google/sync-contacts` | Sync contacts |

**Note:** OAuth callbacks require a public redirect URI. The Supabase edge function URL can be used as a redirect URI — just register it in Google Cloud Console.

---

#### `analytics` → Consider Supabase RPC instead
**File:** `backend/modules/analytics/analyticsRoutes.js`  
**Complexity:** Medium–Complex  
**Tables:** Multiple

**Recommendation:** Port heavy analytics queries to **Postgres functions** (Supabase RPC) and call them via `supabase.rpc()` from the frontend directly — no edge function needed.

---

## Step-by-Step: How to Migrate Any Route

### 1. Create the edge function file
```bash
mkdir -p supabase/functions/<function-name>
# Create index.ts with the template below
```

### 2. Standard edge function template
```ts
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

function adminSb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: { user }, error } = await adminSb().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

function isAdmin(user: any): boolean {
  if ((user?.user_metadata?.role ?? '') === 'admin') return true;
  return ADMIN_EMAILS.includes((user?.email ?? '').toLowerCase());
}

function isAdminOrOfficer(user: any): boolean {
  if (isAdmin(user)) return true;
  const staffRoles = user?.user_metadata?.staff_roles;
  return Array.isArray(staffRoles) && staffRoles.length > 0;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errResp(e: any): Response {
  const status = e?.status >= 100 && e?.status < 600 ? e.status : 500;
  return jsonResp({ success: false, error: e?.message ?? String(e) }, status);
}

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url = new URL(req.url);
  const fnName = '<function-name>'; // e.g. 'crm-notifications'
  const crmIdx = url.pathname.indexOf(fnName);
  const afterFn = crmIdx !== -1
    ? url.pathname.slice(crmIdx + fnName.length).replace(/^\//, '')
    : url.pathname.replace(/^\/+/, '');
  const method = req.method.toUpperCase();
  const sb = adminSb();
  const user = await getUser(req);

  try {
    // ---- YOUR ROUTES HERE ----

    // Example:
    if (method === 'GET' && afterFn === 'list') {
      if (!user) return jsonResp({ error: 'Unauthorized' }, 401);
      const { data, error } = await sb.from('your_table').select('*');
      if (error) throw error;
      return jsonResp({ success: true, data });
    }

    return jsonResp({ error: `Unknown route: ${method} /${afterFn}` }, 404);
  } catch (e: any) {
    console.error('[<function-name>] error:', e?.message);
    return errResp(e);
  }
});
```

### 3. Update config.toml
```toml
[functions.<function-name>]
verify_jwt = false
```

### 4. Update apiService.js
Add constant at top:
```js
const EDGE_BASE_MYMODULE = 'https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/<function-name>';
```

Add routing in `fetchAPI()` routing block:
```js
} else if (endpoint.startsWith('/your-route-prefix/') || endpoint === '/your-route-prefix') {
  const suffix = endpoint.replace(/^\/your-route-prefix\/?/, '');
  fullUrl = suffix ? `${EDGE_BASE_MYMODULE}/${suffix}` : EDGE_BASE_MYMODULE;
  extraHeaders['apikey'] = EDGE_ANON_KEY;
```

### 5. Deploy
```bash
supabase functions deploy <function-name> --project-ref xddaxiwyszynjyrizkmc --no-verify-jwt
```

### 6. Test
```js
// In browser console:
const { data: { session } } = await window.supabaseClient.auth.getSession();
const res = await fetch('https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/<function-name>/your-route', {
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkZGF4aXd5c3p5bmp5cml6a21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDA3OTUsImV4cCI6MjA4NTE3Njc5NX0.imH4CCqt1fBwGek3ku1LTsq99YCfW4ZJQDwhw-0BD_Q',
    'Content-Type': 'application/json'
  }
});
console.log(res.status, await res.json());
```

---

## Common Pitfalls & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| `401 Invalid JWT` | Gateway validates JWT with `verify_jwt = true` | Set `verify_jwt = false` in config.toml, deploy with `--no-verify-jwt` |
| `401 Unauthorized` from function | `getUser()` fails — missing `apikey` header | Add `apikey: EDGE_ANON_KEY` header in frontend fetch |
| `403 Forbidden` | Role check fails — `user_metadata.role` not set | Use `staff_roles[]` array check + admin email list |
| `404 Unknown route` | Path parsing gives double slash | Use `indexOf(fnName)` pattern for path extraction |
| `SyntaxError: already declared` | Duplicate `const` in global scope | Rename constants to function-specific names (e.g. `EDGE_ANON_KEY`) |
| `npm: not found` in Deno | Tried to use npm package | Use `https://esm.sh/package-name` for imports |
| Timeout on heavy operations | Edge functions max 150s | Move heavy work to Postgres functions (`supabase.rpc()`) |
| WhatsApp not working | Needs persistent process | Keep on Node.js server, never migrate to edge functions |

---

## Migration Priority Order

```
Week 1 (Simple, high impact):
  ✅ crm-leads         — DONE
  ⏳ crm-notifications — Small, high frequency
  ⏳ crm-programs      — Small, read-heavy
  ⏳ crm-xp            — Small, leaderboard

Week 2 (Medium complexity):
  ⏳ crm-dashboard     — High visibility
  ⏳ crm-reports       — Daily use
  ⏳ crm-calendar      — Daily use
  ⏳ crm-demo-sessions — Frequent

Week 3 (Complex, external APIs):
  ⏳ crm-attendance    — Google Sheets dependency
  ⏳ crm-registrations — Multi-step, critical
  ⏳ crm-payments      — Financial, needs careful testing
  ⏳ crm-users         — Auth Admin API

Never migrate:
  🚫 whatsapp          — Needs persistent Node.js process
```

---

## Files That Can Be Cleaned Up After Full Migration

Once all routes are migrated, these can be deleted:

```
backend/modules/leads/leadsRoutes.js          # superseded by crm-leads edge fn
backend/modules/leads/leadsService.js         # superseded
backend/modules/leads/userLeadsRoutes.js      # superseded
backend/modules/leads/userLeadsService.js     # superseded
backend/modules/receipts/receiptsRoutes_v3.js  # old versions
backend/modules/receipts/receiptsRoutes_v4.js
backend/modules/receipts/receiptsRoutes_v5.js
backend/modules/receipts/receiptsRoutes_v6.js
backend/modules/receipts/receiptsRoutes_v7.js
backend/modules/receipts/receiptsRoutes_v8.js
backend/modules/receipts/receiptsRoutes_v9.js
backend/modules/receipts/receiptsRoutes_v10.js
backend/modules/receipts/receiptsRoutes_v11.js
UCAGS-CRM-main/                               # entire duplicate folder
Various *.md analysis files at root level
```
