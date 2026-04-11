# Supabase Edge Functions Architecture Summary

## Overview
The application uses **21 Supabase Edge Functions** (TypeScript/Deno) as the primary backend API layer, mapped to `/api/*` routes. Each function handles a specific domain and uses a shared router pattern with authentication middleware.

---

## Edge Functions by Domain

### **Core Admin & User Management**
1. **users** - User CRUD (list, create, update, delete), officer filtering, email confirmation
2. **programs** - Program & batch CRUD, sidebar navigation with current batches
3. **batch-setup** - Batch configuration (payment plans, demo settings, installments)
4. **batch-sync** - Sync leads from Google Sheets → Supabase, sync assignments back to sheets
5. **batches** - Batch listing, officer assignment, spreadsheet creation/linking

### **Lead & CRM Management**
6. **crm-leads** - Lead CRUD, search/filter, bulk operations, custom sheet management per officer
7. **crm-followups** - Followup scheduling, creation, retrieval (admin & officer views)
8. **contacts** - Personal contacts CRUD (officer-scoped or admin-wide)

### **Student Lifecycle**
9. **registrations** - Public intake form submissions, registration CRUD, enrollment status, batch assignment
10. **students** - Student list (admin), deletion with enrollment reversion
11. **demo-sessions** - Demo session scheduling, invites, attendance tracking, reminders

### **Finance & Payments**
12. **payments** - Payment records CRUD, payment plans listing
13. **receipts** - Receipt generation, CRUD for payment receipts, installment tracking

### **Reporting & Analytics**
14. **dashboard** - Stats (leads, registrations, students), officer-specific stats, leaderboards, time-series analytics
15. **reports** - Daily reports submission, daily checklists, scheduled tasks/followups
16. **attendance** - Attendance records, check-in/check-out, leave requests, admin overrides

### **Engagement & Tracking**
17. **xp** - Experience points leaderboard, individual trends, global trends, cron job for overdue penalties
18. **calendar** - Calendar tasks (personal/global), followup calendar events, task management

### **External Integrations**
19. **whatsapp** - Webhook verification, incoming message logging, message sending, status check
20. **google** - Spreadsheet metadata, range reading, Google integration storage
21. **health** - Simple health check (no auth required)

---

## Architecture Details

### Shared Utilities (`supabase/functions/_shared/`)
- **auth.ts** - `isAuthenticated()`, `isAdmin()`, `isAdminOrOfficer()` guards; JWT extraction
- **cors.ts** - CORS header handling
- **response.ts** - Standard response formatting (success, error, JSON)
- **router.ts** - Simple HTTP router with GET/POST/PUT/PATCH/DELETE support
- **sheets.ts** - Google Sheets API helpers (read, write, metadata)
- **supabase.ts** - Supabase admin client initialization

### Configuration (`supabase/config.toml`)
- **JWT Verification**: Most functions require valid JWT (verify_jwt = true)
- **Exceptions**: 
  - `health` - No JWT required (public)
  - `registrations` - No JWT required (public intake form)
  - `whatsapp` - No JWT required (webhook endpoint)
- **Edge Runtime**: Deno, oneshot policy, inspector on port 8083

### Authentication Pattern
- Extract JWT from `Authorization: Bearer <token>` header
- Validate with Supabase Auth
- Inject user object (`id`, `name`, `email`, `role`) into request context
- Role-based access control: `admin`, `officer`, `admission_officer`

### Data Flow
1. **Sheets → Supabase**: `batch-sync` pulls from Google Sheets and upserts to `crm_leads` table
2. **Supabase → Sheets**: `batch-sync` pushes `assigned_to` updates back to sheets
3. **Public Registration**: `registrations` accepts form submissions without auth, creates records
4. **Officer Operations**: Most CRUD operations filtered by `user_id` or `officer_name`
5. **Admin Dashboard**: Aggregates across all officers/batches

### Deployment
- Functions deployed via `supabase functions deploy <function-name>`
- All functions use Deno runtime with TypeScript
- Environment variables managed via `.env` (Google credentials, WhatsApp tokens, CRON_SECRET)

---

## Backend Code Structure (Node.js - Legacy)

The `/backend/` directory contains an alternative Express.js implementation (currently not deployed) with parallel routing:

- **backend/index.js** - Express server entry point
- **backend/modules/** - Module-based routes (admissions, batches, leads, payments, etc.)
- **backend/core/** - Utilities (Sheets, Drive, Supabase, Config)
- **backend/routes/** - Legacy route definitions

This appears to be legacy code; the Supabase Edge Functions are the active API layer.

---

## Vercel Deployment (`vercel.json`)

Routes traffic:
- `/api/health` → `api/health.js`
- `/api/*` → `api/[...path].js` (catch-all)
- `/Register`, `/homepage`, etc. → Static HTML
- `/*` → `public/index.html` (SPA fallback)

---

## Key Integration Points

| Component | API Endpoint | Auth | Purpose |
|-----------|--------------|------|---------|
| Google Sheets | `/api/google/spreadsheet/:id` | Authenticated | Fetch metadata, read ranges |
| Batch Sync | `/api/batch-sync/:batchName/sync` | Admin | Bidirectional sync with sheets |
| WhatsApp | `/api/whatsapp/webhook` | None | Inbound message logging |
| Dashboard | `/api/dashboard/*` | Authenticated | KPIs, rankings, analytics |
| XP System | `/api/xp/leaderboard` | Admin/Officer | Gamification tracking |

---

## Summary

The architecture is **microservice-like** with Supabase as the database and Edge Functions as lightweight, scalable API endpoints. Each function is independently deployable, stateless, and handles one logical domain. Authentication is centralized via Supabase Auth, and data flows between Google Sheets and Supabase bidirectionally for lead management.
