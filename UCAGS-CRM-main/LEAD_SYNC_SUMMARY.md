# Lead Syncing & Assignment - Complete Architecture Summary

## Quick Answer to Your Questions

### 1. What is the 'main google sheet' vs officer sheets?

**Main Google Sheet (Admin Spreadsheet)**
- One per batch, identified by `admin_spreadsheet_id`
- Master record for all leads
- Contains tabs: "Main Leads", "Extra Leads", custom tabs
- Header columns: platform, full_name, phone, email, ID, status, **assigned_to**, created_date, notes
- Source of truth for intake data
- All leads start here regardless of assignment

**Officer Spreadsheets**
- One per officer per batch
- Contains **only leads assigned to that officer**
- Same tabs as admin spreadsheet (synced)
- Extended headers: All admin fields PLUS priority, follow_up, call_feedback, pdf_sent, wa_sent, email_sent, lastFollowUpComment, followup1-3 fields
- Operational workspace for officers to manage their leads
- When a lead is assigned → copied to officer sheet
- When a lead is unassigned → removed from officer sheet

---

### 2. What columns are written when syncing leads?

**Google Sheets → Supabase (Pull - Intake Sync)**
Reads ALL columns from sheets, writes to `crm_leads` table:
- `sheet_lead_id` (from "ID" column, auto-generated if missing)
- `name` (from "full_name" or "name")
- `phone`, `email`, `platform`, `source`
- `status`, `created_date`, `notes`
- `course` (if present)
- `intake_json` (JSON object containing ALL columns from sheet)

**IMPORTANT**: For existing leads, update only preserves these fields - does NOT overwrite:
- `assigned_to` (operational)
- `status` (operational)
- `priority` (operational)  
- `management_json` (operational tracking)

**Supabase → Google Sheets (Push - Assignment Sync)**
Writes ONLY:
- **`assigned_to` column** - syncs assignment from Supabase back to sheets
- Clears cell if Supabase value is blank
- Batches 500 rows per API request

---

### 3. Is there an 'assigned to' field anywhere?

**YES - Multiple Places**

1. **Google Sheets**: Column `assigned_to` in both admin and officer spreadsheets
2. **Supabase**: Column `assigned_to` in `crm_leads` table
3. **Officer Name**: Assigned officer's name (string)
4. **Special Value**: `"Duplicate"` - when phone is duplicated, lead cannot be assigned to anyone

**Business Rules**:
- One lead can only be assigned to one officer
- Duplicate phone prevention: If phone matches existing lead in batch, lead marked as `assigned_to: "Duplicate"`
- Duplicates cannot be assigned, stay in admin sheet only
- When assigned: Lead copied to officer's spreadsheet
- When unassigned: Lead removed from officer's spreadsheet
- When reassigned: Removed from old officer, copied to new officer

---

## Architecture Overview

```
┌──────────────────────────────────────────┐
│    GOOGLE SHEETS (Admin Spreadsheet)     │
│   Multiple tabs (Main Leads, Extra, etc) │
│   Columns: ID, name, email, assigned_to  │
└────────────────┬─────────────────────────┘
                 │
                 │ syncBatchToSupabase()
                 │ (Read intake fields)
                 ↓
┌──────────────────────────────────────────┐
│      SUPABASE (crm_leads table)          │
│     Fast operational data layer          │
│   assigned_to, status, priority, etc     │
└────────────────┬─────────────────────────┘
                 │
                 │ syncAssignmentsToSheets()
                 │ (Write assigned_to only)
                 ↓
┌──────────────────────────────────────────┐
│    GOOGLE SHEETS (Admin Spreadsheet)     │
│   Updates assigned_to column             │
└──────────────────────────────────────────┘

WHEN LEAD ASSIGNED:
  updateAdminLead(assignedTo: "Officer Name")
  └─ Supabase: set assigned_to
  └─ copyLeadToOfficerBatchSheet()
     └─ Append lead row to officer's spreadsheet
  └─ notifyLeadAssignment() 
     └─ Send notification to officer

┌──────────────────────────────────────┐
│ GOOGLE SHEETS (Officer Spreadsheet)  │
│ Contains copy of lead row            │
│ Officer can edit: priority, follow-ups
└──────────────────────────────────────┘
```

---

## Key Files & Functions

| File | Main Functions | Purpose |
|------|----------------|---------|
| `batchSyncService.js` | `syncBatchToSupabase()`, `parseLeadRow()` | Pull intake from sheets to Supabase |
| `batchAssignmentSyncService.js` | `syncAssignmentsToSheets()` | Push `assigned_to` from Supabase to sheets |
| `batchLeadsService.js` | `updateBatchLead()`, `copyLeadToOfficerBatchSheet()`, `removeLeadFromOfficerBatchSheet()` | Manage leads in admin/officer sheets |
| `batchSheetsService.js` | `createSheetForBatch()`, `ADMIN_HEADERS`, `OFFICER_HEADERS` | Manage sheet tabs |
| `crmLeadsService.js` | `updateAdminLead()`, `bulkAssignAdmin()`, `bulkDistributeAdmin()` | Supabase lead operations & assignments |
| `batchSyncRoutes.js` | `POST /sync`, `POST /sync-assignments` | API endpoints for syncing |

---

## API Endpoints

### POST `/api/batches/:batchName/sync`
**Two-way sync**: 
1. Pulls intake from Google Sheets → Supabase
2. Pushes `assigned_to` from Supabase → Google Sheets

**Body** (optional):
```json
{ "sheetNames": ["Main Leads", "Extra Leads"] }
```

### POST `/api/batches/:batchName/sync-assignments`
**One-way sync**: Push only `assigned_to` values from Supabase to Google Sheets

---

## Column Mapping

### Admin Sheet Headers (ADMIN_HEADERS)
```
platform | are_you_planning_to_start_immediately? | why_are_you_interested_in_this_diploma?
| full_name | phone | email | ID | status | assigned_to | created_date | notes
```

### Officer Sheet Headers (OFFICER_HEADERS)
```
[All ADMIN_HEADERS above] + priority | next_follow_up | call_feedback | pdf_sent
| wa_sent | email_sent | last_follow_up_comment
| followup1_schedule | followup1_date | followup1_answered | followup1_comment
| followup2_schedule | followup2_date | followup2_answered | followup2_comment
| followup3_schedule | followup3_date | followup3_answered | followup3_comment
```

---

## Important Implementation Details

1. **ID Generation**: If "ID" column missing, auto-generate from phone or row number
   ```javascript
   lead_${phone.replace(/\D/g, '')}  // or lead_${name}_${row}  // or lead_${row}
   ```

2. **Duplicate Phone Detection**: 
   - Normalizes phones to canonical form (e.g., 94777533241)
   - Finds duplicates across entire batch
   - Marks newer occurrences as "Duplicate"
   - Prevents assignment of duplicates

3. **Safe Upserts**: 
   - Updates preserve operational fields
   - Only overwrites intake data
   - `assigned_to`, `status`, `priority` never overwritten by sync

4. **Batch Operations**:
   - Assignment sync batches 500 rows per Google API request
   - Prevents hitting API request size limits
   - Round-robin distribution for multiple officers

5. **Officer Sheet Management**:
   - Leads copied/removed on assignment changes
   - Headers upgraded separately from sync
   - Custom sheets can be created by officers (stored in Supabase only, not synced)

6. **Notification System**:
   - Officers notified when leads assigned
   - Uses `notifyLeadAssignment()` helper
   - Best-effort (non-blocking)

---

## Data Flow Examples

### Scenario 1: New Lead Created in Google Sheets
```
1. Admin adds row to "Main Leads" sheet
2. Admin clicks "Sync" button (POST /api/batches/batch-name/sync)
3. syncBatchToSupabase() reads row:
   - Extracts: name, email, phone, status, etc.
   - Auto-generates ID if missing
   - Captures entire row in intake_json
4. Inserts into crm_leads table (no assigned_to yet)
5. syncAssignmentsToSheets() runs:
   - Tries to write assigned_to column (finds blank)
   - Sheets remain unchanged
6. Lead visible in admin view, no assignment yet
```

### Scenario 2: Lead Assigned to Officer
```
1. Admin clicks "Assign to Officer A" in admin UI
2. API calls updateAdminLead({ assignedTo: "Officer A" })
3. Supabase: crm_leads.assigned_to = "Officer A"
4. copyLeadToOfficerBatchSheet():
   - Appends lead row to Officer A's "Main Leads" sheet
   - Sets assigned_to cell to "Officer A"
5. notifyLeadAssignment():
   - Finds Officer A's user ID
   - Creates notification in database
6. Officer A sees notification + lead appears in their sheet
```

### Scenario 3: Officer Updates Lead Priority & Follow-up
```
1. Officer A views lead in their spreadsheet
2. Updates: priority="High", next_follow_up="Tomorrow"
3. Officer updates via API (crmLeads routes)
4. Supabase: crm_leads updated with management_json:
   { priority: "High", nextFollowUp: "Tomorrow", ... }
5. Sheets NOT updated (unless manual sync-back)
6. Changes persist in Supabase for reporting/UI
```

### Scenario 4: Lead Reassigned to Officer B
```
1. Admin clicks "Reassign to Officer B"
2. updateAdminLead({ assignedTo: "Officer B" })
3. removeLeadFromOfficerBatchSheet(Officer A, lead):
   - Finds lead in Officer A's sheet
   - Clears entire row to empty values
4. copyLeadToOfficerBatchSheet(Officer B, lead):
   - Appends lead to Officer B's sheet
5. Supabase: assigned_to changed from "Officer A" → "Officer B"
6. Lead removed from A's view, appears in B's view
```

---

## File Locations

**Core Sync Services**:
- `backend/modules/batches/batchSyncService.js` - Google Sheets → Supabase
- `backend/modules/batches/batchAssignmentSyncService.js` - Supabase → Google Sheets
- `backend/modules/batches/batchLeadsService.js` - Admin/officer sheet management
- `backend/modules/batches/batchSheetsService.js` - Sheet tab creation/deletion

**API & Business Logic**:
- `backend/modules/batches/batchSyncRoutes.js` - Sync endpoints
- `backend/modules/batches/batchLeadsRoutes.js` - Lead CRUD endpoints
- `backend/modules/crmLeads/crmLeadsService.js` - Supabase lead operations
- `backend/modules/batches/duplicatePhoneResolver.js` - Duplicate detection
- `backend/modules/batches/officerSheetsService.js` - Officer-only sheets (custom)

---

## Key Code Snippets

### Safe Update Pattern (preserves operational fields)
```javascript
// Update payload: ONLY intake fields + synced_at
// Do NOT overwrite assigned_to/status/priority/call feedback
const updatePayload = parsed.map(l => ({
  batch_name: batchName,
  sheet_name: sheetName,
  sheet_lead_id: l.sheet_lead_id,
  name: l.name,
  phone: l.phone,
  email: l.email,
  intake_json: l.intake_json,
  synced_at: nowIso
  // ↓ These fields are NOT included, so they won't be overwritten
  // assigned_to: NOT INCLUDED
  // status: NOT INCLUDED
  // priority: NOT INCLUDED
}));

await sb.from('crm_leads').upsert(updatePayload, { 
  onConflict: 'batch_name,sheet_name,sheet_lead_id' 
});
```

### Assignment with Duplicate Check
```javascript
if (updates.assignedTo !== undefined) {
  const next = cleanString(updates.assignedTo);
  
  if (next) {
    const isDup = await isDuplicateLeadInBatch(sb, batchName, sheetLeadId);
    if (isDup) {
      throw new Error('Cannot assign this lead because the phone number is duplicated');
    }
  }
  
  patch.assigned_to = next;
}
```

### Assignment Triggering Sheet Copy
```javascript
if (updates.assignedTo !== undefined && updates.assignedTo !== oldAssignedTo) {
  if (oldAssignedTo) {
    await removeLeadFromOfficerBatchSheet(batchName, sheetName, oldAssignedTo, existing);
  }
  if (updates.assignedTo) {
    await copyLeadToOfficerBatchSheet(batchName, sheetName, updates.assignedTo, updated);
  }
}
```

---

## Related Tables in Supabase

- `crm_leads` - All leads with batch, sheet, assignment, status, management data
- `batches` - Batch metadata including `admin_spreadsheet_id`
- `batch_officer_sheets` - Maps officer name to their spreadsheet ID per batch
- `officer_custom_sheets` - Officer-created custom sheet names (Supabase-only, not synced to Sheets)
- `crm_lead_followups` - Normalized follow-up records (optional, for future expansion)

