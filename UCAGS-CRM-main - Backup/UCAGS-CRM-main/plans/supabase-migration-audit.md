# Supabase Migration Audit Report

## Executive Summary

This document audits all features in the UCAGS CRM system to identify which are still using Google Sheets and need to be migrated to Supabase for better performance.

**Goal:**
- **Main Google Sheet per batch** = Intake only (users manually add/edit leads here)
- **Supabase** = System of record for ALL operational data (assignments, follow-ups, status, management, etc.)
- **Sync flow:** Main Sheet → Supabase (one-way for intake), Supabase → Main Sheet (assignment column only)
- **NO officer spreadsheets** - everything operational happens in Supabase

---

## Current Status

### ✅ Already Migrated to Supabase

1. **Lead Management (Officer View)** - `backend/modules/crmLeads/`
   - ✅ Officers load their leads from Supabase (`GET /api/crm-leads/my`)
   - ✅ Officers save follow-ups/management to Supabase (`PUT /api/crm-leads/my/:batch/:sheet/:id`)
   - ✅ Frontend: [`public/frontend/pages/leads/leadManagement.js`](public/frontend/pages/leads/leadManagement.js) uses Supabase endpoints
   - ✅ **No officer spreadsheets used**

2. **Batch Sync** - `backend/modules/batches/batchSyncService.js`
   - ✅ Sync implemented (`POST /api/batches/:batchName/sync`)
   - ✅ **Main Sheet → Supabase** (pulls new/updated leads from main intake sheet)
   - ✅ **Supabase → Main Sheet** (pushes assignment column back to main sheet)
   - ✅ **One-way for intake data** (name, phone, email, etc. - only synced from sheet to Supabase, never overwritten)
   - ✅ **Assignment sync back** (assigned_to column updated in main sheet from Supabase)

3. **Authentication & User Management**
   - ✅ Already using Supabase Auth
   - ✅ User profiles stored in Supabase

---

## ❌ Still Using Google Sheets (Needs Migration)

### 1. **Admin Leads Page** - HIGH PRIORITY
**Location:** [`public/frontend/pages/leads/leadsPage.js`](public/frontend/pages/leads/leadsPage.js)

**Current Behavior:**
- Admin loads leads via `/batch-leads/:batch/leads` (Google Sheets)
- Uses [`backend/modules/batches/batchLeadsService.js`](backend/modules/batches/batchLeadsService.js)
- Reads from officer spreadsheets per batch

**What Needs to Change:**
- [ ] Create new admin endpoint: `GET /api/crm-leads/admin?batch=...&sheet=...`
- [ ] Update [`public/frontend/services/apiService.js`](public/frontend/services/apiService.js) `API.leads.getAll()` to use new endpoint
- [ ] Update [`public/frontend/pages/leads/leadsPage.js`](public/frontend/pages/leads/leadsPage.js) to load from Supabase
- [ ] Admin lead updates should go to Supabase (assignment, status, etc.)

**Impact:** This is the main performance bottleneck for admins viewing leads.

---

### 2. **Legacy Leads Module** - DEPRECATE
**Location:** [`backend/modules/leads/`](backend/modules/leads/)

**Files:**
- [`leadsService.js`](backend/modules/leads/leadsService.js) - reads/writes Google Sheets
- [`userLeadsService.js`](backend/modules/leads/userLeadsService.js) - reads user sheets
- [`leadsRoutes.js`](backend/modules/leads/leadsRoutes.js) - exposes old endpoints

**Current Behavior:**
- Old system for managing leads (pre-batch system)
- Uses a single "LEADS_SHEET_ID" from environment
- Officers have individual sheets

**What Needs to Change:**
- [ ] **REMOVE THIS MODULE** - replaced by batch system + Supabase
- [ ] Verify no frontend code references `/api/leads/...` endpoints
- [ ] Delete entire `backend/modules/leads/` directory

**Impact:** Clean up legacy code. Should not be in use anymore.

---

### 3. **Follow-up Calendar** - MEDIUM PRIORITY
**Location:** [`backend/modules/calendar/followupCalendarService.js`](backend/modules/calendar/followupCalendarService.js)

**Current Behavior:**
- Reads follow-up schedules from officer spreadsheets
- Builds calendar events from Google Sheets data
- Used for calendar view of scheduled follow-ups

**What Needs to Change:**
- [ ] Update to read follow-ups from `crm_leads.management_json` (or `crm_lead_followups` if normalized)
- [ ] Query Supabase for `followUpNSchedule` fields
- [ ] Remove dependency on officer spreadsheets

**Impact:** Calendar view will be faster and more accurate.

---

### 4. **WhatsApp Logger** - LOW PRIORITY
**Location:** [`backend/modules/whatsapp/whatsappLogger.js`](backend/modules/whatsapp/whatsappLogger.js)

**Current Behavior:**
- Logs WhatsApp messages to Google Sheets
- Searches leads by phone in Google Sheets
- Appends message logs to sheets

**What Needs to Change:**
- [ ] Create `whatsapp_messages` table in Supabase
- [ ] Store message logs in Supabase instead of Sheets
- [ ] Query leads from `crm_leads` by phone for matching

**Impact:** Better message history tracking and search performance.

---

### 5. **Batch Lead Routes (Old System)** - HIGH PRIORITY
**Location:** [`backend/modules/batches/batchLeadsRoutes.js`](backend/modules/batches/batchLeadsRoutes.js)

**Current Behavior:**
- Endpoints like `/batch-leads/:batch/my-leads` read from officer sheets ❌ (officer sheets should not exist)
- `/batch-leads/:batch/leads` reads from admin sheets ❌ (should read from Supabase)
- Updates write back to Google Sheets ❌ (should write to Supabase only)

**What Needs to Change:**
- [ ] **DEPRECATE `/batch-leads/` endpoints entirely**
- [ ] Replace with Supabase-backed endpoints (already created in `crmLeadsRoutes.js`)
- [ ] Update frontend to use new endpoints
- [ ] Remove officer spreadsheet logic

**Impact:** This is the main bottleneck. Already partially replaced by `crmLeadsRoutes.js`.

---

## ✅ Should REMAIN in Google Sheets

### 1. **Attendance System**
**Location:** [`backend/modules/attendance/`](backend/modules/attendance/)

**Reason:** Separate system for staff attendance tracking. Not related to lead management.

**Keep as-is:** ✅

---

### 2. **Leave Requests**
**Location:** [`backend/modules/attendance/leaveRequestsService.js`](backend/modules/attendance/leaveRequestsService.js)

**Reason:** Part of attendance system, separate from CRM.

**Keep as-is:** ✅

---

### 3. **Calendar Tasks**
**Location:** [`backend/modules/calendar/calendarTasksService.js`](backend/modules/calendar/calendarTasksService.js)

**Reason:** General task management, not lead-specific.

**Keep as-is:** ✅ (or migrate later as separate project)

---

### 4. **Batch Provisioning (Sheet Creation)**
**Location:** [`backend/modules/batches/batchSheetsService.js`](backend/modules/batches/batchSheetsService.js), [`officerSheetsService.js`](backend/modules/batches/officerSheetsService.js)

**Current Behavior:**
- Creates admin spreadsheet per batch (main intake sheet) ✅
- Creates officer spreadsheets per batch (operational sheets) ❌ **NOT NEEDED**

**What Needs to Change:**
- [ ] **REMOVE officer sheet creation entirely** (`officerSheetsService.js`)
- [ ] Update batch creation to ONLY ask for main sheet URL (user provides existing sheet)
- [ ] Remove all references to `batch_officer_sheets` table
- [ ] Batch creation should:
  1. Ask user for main sheet URL
  2. Store in `batches.admin_spreadsheet_id`
  3. Run initial sync to pull leads into Supabase
  4. Done! (no officer sheets created)

**Impact:** Massively simplifies batch setup. No more spreadsheet provisioning overhead.

---

## Migration Priority & Roadmap

### Phase 1: Admin Leads Page to Supabase (CRITICAL) ⚠️
**Goal:** Admin loads all leads from Supabase, not Google Sheets

**Steps:**
1. [ ] Create admin leads endpoint (`GET /api/crm-leads/admin?batch=...&sheet=...&status=...&search=...`)
   - Query `crm_leads` table
   - Support filtering by batch, sheet, status, search
   - Return leads with all operational fields
2. [ ] Update [`apiService.js`](public/frontend/services/apiService.js):
   - Change `API.leads.getAll()` to call `/api/crm-leads/admin`
   - Remove calls to `/batch-leads/...`
3. [ ] Update [`leadsPage.js`](public/frontend/pages/leads/leadsPage.js):
   - Load from new endpoint
   - Assignment updates go to Supabase
4. [ ] Test:
   - Admin can view all leads
   - Filtering works (batch, sheet, status, search)
   - Assignment updates work
   - Performance is fast

**Impact:** 5-10x faster admin lead viewing. No more Google Sheets API rate limits.

---

### Phase 2: Remove Officer Spreadsheets Entirely
**Goal:** No more officer spreadsheet creation or usage

**Steps:**
1. [ ] Update batch creation endpoint (`POST /api/batches`):
   - Remove officer spreadsheet creation logic
   - Only store main sheet URL
   - Run initial sync after batch creation
2. [ ] Update batch creation UI:
   - Only ask for main sheet URL (user provides)
   - Remove officer selection for sheet creation
3. [ ] Remove `officerSheetsService.js` (or mark as deprecated)
4. [ ] Remove `batch_officer_sheets` table references
5. [ ] Update documentation

**Impact:** Massively simplifies batch setup. No more Drive/Sheets provisioning overhead.

---

### Phase 3: Follow-up Calendar Migration
**Goal:** Calendar loads from Supabase

1. [ ] Update `followupCalendarService.js` to query `crm_leads`
2. [ ] Parse `management_json` for follow-up schedules
3. [ ] Test calendar view

**Estimated Complexity:** Low (1 hour)

---

### Phase 4: WhatsApp Logger Migration (Optional)
**Goal:** Message logs in Supabase

1. [ ] Create `whatsapp_messages` table
2. [ ] Update logger to write to Supabase
3. [ ] Update search to query Supabase

**Estimated Complexity:** Medium (2 hours)

---

### Phase 5: Legacy Cleanup
**Goal:** Remove deprecated code

1. [ ] Audit if `backend/modules/leads/` is still used
2. [ ] Remove if deprecated
3. [ ] Remove old `/batch-leads/` routes
4. [ ] Clean up unused Google Sheets client calls

**Estimated Complexity:** Low (1 hour)

---

## Supabase Schema Additions Needed

### For Admin Leads Endpoint
No new tables needed. Use existing `crm_leads` table.

### For WhatsApp Logger (Phase 4)
```sql
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete set null,
  phone text not null,
  message_type text, -- 'incoming' / 'outgoing'
  message_body text,
  timestamp timestamptz not null default now(),
  container_name text,
  created_at timestamptz not null default now()
);

create index whatsapp_messages_lead_idx on public.whatsapp_messages (lead_id);
create index whatsapp_messages_phone_idx on public.whatsapp_messages (phone);
create index whatsapp_messages_timestamp_idx on public.whatsapp_messages (timestamp desc);
```

---

## Testing Checklist

After each phase, verify:

- [ ] Admin can view all leads from all batches
- [ ] Admin can filter by batch, sheet, status
- [ ] Admin can assign leads to officers
- [ ] Officers can view their assigned leads
- [ ] Officers can add follow-ups and save management data
- [ ] Sync button updates assignments back to Google Sheets
- [ ] Calendar shows correct follow-up schedules
- [ ] No performance degradation (should be faster)

---

## Rollback Plan

If issues arise:

1. **Keep old endpoints active** during migration
2. **Feature flag** to switch between old/new system
3. **Backup Google Sheets** before major changes
4. **Supabase backups** enabled (automatic in Supabase)

---

## Summary

**Current State:**
- Officer lead management: ✅ Migrated to Supabase
- Admin lead viewing: ❌ Still using Google Sheets (BOTTLENECK)
- Batch sync: ✅ Implemented (Main Sheet ↔ Supabase)

**Architecture (Target):**
```
┌─────────────────────────────────────────────────────────────┐
│                    Main Google Sheet                         │
│  (Per Batch - User manually adds/edits leads here)          │
│  Columns: ID, Name, Phone, Email, Platform, Assigned To...  │
└─────────────────────────────────────────────────────────────┘
                            ↓ Sync (intake data)
                            ↓ ← Sync (assigned_to only)
┌─────────────────────────────────────────────────────────────┐
│                      Supabase (crm_leads)                    │
│  - All operational data (status, priority, follow-ups)       │
│  - Assignment tracking                                       │
│  - Management fields (call feedback, notes, etc.)            │
│  - Follow-up schedules and comments                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Admin & Officers)               │
│  - Admin: Views all leads from Supabase                      │
│  - Officers: View assigned leads from Supabase               │
│  - All updates go to Supabase only                           │
│  - NO officer spreadsheets                                   │
└─────────────────────────────────────────────────────────────┘
```

**Next Critical Step:**
Phase 1 - Migrate admin leads page to Supabase (`leadsPage.js` + new admin endpoint).

**Expected Performance Gain:**
- Admin lead loading: 5-10x faster
- No more Google Sheets API rate limits
- Better concurrency (multiple admins/officers)
- Real-time updates possible
- Simplified batch setup (no officer sheets)

---

## Key Clarifications

1. **Main Sheet = Intake Only**
   - Users manually add/edit leads in main Google Sheet
   - Sync pulls this data into Supabase
   - Only `assigned_to` column is written back to main sheet

2. **Supabase = System of Record**
   - All operational data lives in Supabase
   - Officers never touch Google Sheets
   - Admin never touches Google Sheets (except for initial lead entry)

3. **No Officer Spreadsheets**
   - Completely removed from architecture
   - Officers work entirely in Supabase via web UI

---

**Generated:** 2026-02-13  
**Status:** Ready for Phase 1 implementation
