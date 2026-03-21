# Supabase Edge Functions Migration Plan
*Generated: 2026-03-21*

## Overview
Migrate all Express/Node.js API routes from Vercel serverless functions → Supabase Edge Functions (Deno).
Vercel will serve ONLY static files (`public/`) after migration — zero CPU cost on free tier.

## Architecture After Migration
```
Browser
  ├── Static (HTML/CSS/JS)  →  Vercel Free (static only, zero CPU)
  └── API calls             →  Supabase Edge Functions (Pro plan)
        ├── Supabase DB (already there)
        ├── Google Sheets REST API (via fetch, Deno-compatible)
        └── Auth (Supabase built-in JWT)
```

## Supabase Functions to Create

| # | Function Name | Maps to Express Route | Backend Module | Status |
|---|---|---|---|---|
| 1 | `_shared` | N/A | Shared utilities (cors, auth, supabase, sheets) | ⬜ |
| 2 | `health` | `/api/health` | health.js | ⬜ |
| 3 | `dashboard` | `/api/dashboard/*` | dashboard/dashboardRoutes.js | ⬜ |
| 4 | `crm-leads` | `/api/crm-leads/*` | crmLeads/crmLeadsRoutes.js + service | ⬜ |
| 5 | `crm-followups` | `/api/crm-followups/*` | crmLeads/followupsRoutes.js + service | ⬜ |
| 6 | `programs` | `/api/programs/*` | programs/programsRoutes.js | ⬜ |
| 7 | `users` | `/api/users/*` | users/usersRoutes.js | ⬜ |
| 8 | `notifications` | `/api/notifications/*` | notifications/ | ⬜ |
| 9 | `attendance` | `/api/attendance/*` | attendance/ | ⬜ |
| 10 | `reports` | `/api/reports/daily*` | reports/ | ⬜ |
| 11 | `batches` | `/api/batches/*`, `/api/batch-leads/*` | batches/ | ⬜ |
| 12 | `batch-sync` | `/api/batch-sync/*` | batches/batchSyncRoutes.js | ⬜ |
| 13 | `registrations` | `/api/registrations/*` | registrations/ | ⬜ |
| 14 | `payments` | `/api/payments/*` | payments/ | ⬜ |
| 15 | `receipts` | `/api/receipts/*` | receipts/ | ⬜ |
| 16 | `students` | `/api/students/*` | students/ | ⬜ |
| 17 | `calendar` | `/api/calendar/*` | calendar/ | ⬜ |
| 18 | `demo-sessions` | `/api/demo-sessions/*` | demoSessions/ | ⬜ |
| 19 | `xp` | `/api/xp/*` | xp/ | ⬜ |
| 20 | `contacts` | `/api/contacts/*` | contacts/ | ⬜ |
| 21 | `batch-setup` | `/api/batch-setup/*` | batchSetup/ | ⬜ |
| 22 | `whatsapp` | `/api/whatsapp/*` | whatsapp/ | ⬜ |
| 23 | `google` | `/api/google/*` | google/ | ⬜ |

## Key Differences: Express (Node.js) → Edge Functions (Deno)

| Concern | Express/Node | Supabase Edge Function |
|---|---|---|
| Runtime | Node.js | Deno |
| Module system | `require()` / CommonJS | ESM `import` |
| HTTP server | `express` | `Deno.serve()` |
| Auth | Custom JWT middleware | Supabase JWT (built-in) |
| Google APIs | `googleapis` npm | Google REST API via `fetch()` |
| env vars | `process.env` | `Deno.env.get()` |
| Supabase client | `@supabase/supabase-js` | Same (ESM from esm.sh) |

## Shared Utilities (`supabase/functions/_shared/`)
- `cors.ts` — CORS headers helper
- `auth.ts` — Auth guard (isAuthenticated, isAdmin, isAdminOrOfficer)
- `supabase.ts` — Supabase admin client factory
- `sheets.ts` — Google Sheets REST API client (Deno fetch-based)
- `router.ts` — Lightweight URL router helper
- `response.ts` — Standard JSON response helpers

## Google Sheets API — Deno Approach
Instead of `googleapis` npm, use Google REST API directly with a service account JWT:
1. Sign a JWT using the service account private key + `crypto.subtle` (Deno built-in)
2. Exchange for a short-lived access token via `https://oauth2.googleapis.com/token`
3. Use `fetch()` with `Authorization: Bearer <token>` for all Sheets API calls

## Environment Variables Needed in Supabase
Set via: `supabase secrets set KEY=value`

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...        (real newlines or \\n escaped)
ATTENDANCE_SHEET_ID=...
LEADS_SHEET_ID=...
USER_LEADS_SHEET_ID=...
USER_LEADS_TEMPLATE_SHEET=...
CALENDAR_TASKS_SHEET_ID=...
SUPABASE_URL=...              (auto-set by Supabase)
SUPABASE_ANON_KEY=...         (auto-set by Supabase)
SUPABASE_SERVICE_ROLE_KEY=... (auto-set by Supabase)
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_APP_SECRET=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
CRON_SECRET=...
```

## Frontend Changes
Update `public/frontend/services/apiService.js`:
- Replace base URL from relative `/api/` to `https://<project>.supabase.co/functions/v1/`
- Add `Authorization: Bearer <supabase_jwt>` header to all requests (already done via Supabase client)

## Deploy Commands
```bash
# Install CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref <your-project-ref>

# Deploy all functions
supabase functions deploy health
supabase functions deploy dashboard
supabase functions deploy crm-leads
# ... etc

# Set secrets
supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="..."
supabase secrets set GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
```

## Migration Checklist
- [ ] Create `supabase/functions/_shared/` utilities
- [ ] Create all 22 function directories with `index.ts`
- [ ] Create `supabase/config.toml`
- [ ] Test each function locally with `supabase functions serve`
- [ ] Deploy all functions to Supabase
- [ ] Set all environment secrets in Supabase
- [ ] Update `public/frontend/services/apiService.js` base URL
- [ ] Update `vercel.json` to static-only
- [ ] Remove `api/` directory from Vercel build
- [ ] Test all endpoints
- [ ] Remove `backend/` Express code (optional, keep as reference)
