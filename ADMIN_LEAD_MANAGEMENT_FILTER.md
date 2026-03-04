# Admin Lead Management - Program Filter Added

## Feature Added
Added **Program Filter** to the Lead Management page for Admin users, matching the functionality on the Leads page.

---

## What Changed

### 1. **HTML Updates** (public/index.html)
- ✅ Removed `officer-only` class from `lead-managementView` → Now accessible to admin
- ✅ Added `managementProgramSelect` dropdown (admin-only)
- ✅ Positioned before batch selector for logical flow

```html
<!-- Before: Officer-only -->
<div id="lead-managementView" class="content-view officer-only">

<!-- After: Admin + Officers -->
<div id="lead-managementView" class="content-view">

<!-- Added program filter -->
<select id="managementProgramSelect" class="form-control admin-only" 
        style="min-width: 200px; display:none;"></select>
<select id="managementProgramBatchSelect" class="form-control" 
        style="display:none; min-width: 160px;"></select>
```

---

### 2. **JavaScript Logic** (leadManagement.js v5)

#### **A. Admin Detection**
```javascript
const isAdmin = window.currentUser && window.currentUser.role === 'admin';
```

#### **B. Program Selector (Admin Only)**
- Loads all programs from `/api/programs/sidebar`
- Sorts by creation date (newest first)
- Auto-selects latest program
- On change: resets batch filter and reloads

```javascript
const programSelect = document.getElementById('managementProgramSelect');
if (programSelect && !programSelect.__bound) {
  programSelect.__bound = true;

  if (!isAdmin) {
    programSelect.style.display = 'none';
  } else {
    programSelect.style.display = '';
    // Load programs and populate dropdown
    programSelect.addEventListener('change', () => {
      window.adminProgramId = programSelect.value;
      window.adminBatchFilter = '';
      window.adminSheetFilter = 'Main Leads';
      initLeadManagementPage();
    });
  }
}
```

#### **C. Batch Selector Updates**
Now uses admin or officer program ID:

```javascript
// Before:
const programId = window.officerProgramId;

// After:
const programId = isAdmin ? window.adminProgramId : window.officerProgramId;
```

And updates the correct filter on change:

```javascript
sel.addEventListener('change', () => {
  const v = sel.value;
  if (v) {
    if (isAdmin) {
      window.adminBatchFilter = v;
      window.adminSheetFilter = 'Main Leads';
    } else {
      window.officerBatchFilter = v;
      window.officerSheetFilter = 'Main Leads';
    }
    initLeadManagementPage();
  }
});
```

#### **D. Data Loading**
Uses admin filters and endpoint for admin:

```javascript
// Filters:
const batchFilter = isAdmin ? window.adminBatchFilter : window.officerBatchFilter;
const sheet = isAdmin ? window.adminSheetFilter : window.officerSheetFilter;

// Endpoint:
const endpoint = isAdmin ? '/api/crm-leads' : '/api/crm-leads/my';
const res = await fetch(`${endpoint}?${params.toString()}`, { headers: authHeaders });
```

**Key Difference:**
- **Officers**: `/api/crm-leads/my` (only their assigned leads)
- **Admins**: `/api/crm-leads` (all leads in batch/sheet)

---

## UI Flow

### **For Officers (Unchanged)**
1. See only batch selector (no program selector)
2. Batch selector shows batches for their program
3. Loads only leads assigned to them

### **For Admins (NEW)**
1. **Program selector** appears → Select program
2. **Batch selector** updates → Shows batches for selected program
3. **Sheet tabs** appear → Select sheet
4. **Leads load** → All leads in that batch/sheet (not just assigned to admin)

---

## Filter Hierarchy

```
Admin Flow:
┌─────────────────┐
│ Select Program  │ (e.g., "Advanced Diploma 2024")
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Select Batch    │ (e.g., "Batch-14")
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Select Sheet    │ (e.g., "Main Leads")
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ View All Leads  │ (All leads in batch/sheet)
└─────────────────┘

Officer Flow:
┌─────────────────┐
│ Select Batch    │ (Auto-filtered to officer's program)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Select Sheet    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ View My Leads   │ (Only assigned to officer)
└─────────────────┘
```

---

## Files Modified
- ✅ `public/index.html`
  - Removed `officer-only` from lead-managementView
  - Added `managementProgramSelect` dropdown
- ✅ `public/frontend/pages/leads/leadManagement.js` (v5)
  - Added admin detection
  - Added program selector logic
  - Updated batch selector to use admin/officer program
  - Updated data loading to use admin/officer endpoint

---

## Testing Instructions

### CRITICAL: Clear Browser Cache
1. Press `Ctrl+Shift+Delete`
2. Clear "Cached images and files"
3. Hard refresh: `Ctrl+F5`

### Test 1: Admin Access
1. **Login as admin**
2. **Click "Lead Management"** from sidebar
3. ✅ Program selector appears (first dropdown)
4. ✅ Batch selector appears (second dropdown)
5. **Select a program**
6. ✅ Batch selector updates with that program's batches
7. **Select a batch**
8. ✅ Sheet tabs appear
9. **Select a sheet**
10. ✅ All leads in that batch/sheet load (not just admin's)

### Test 2: Officer Access (Should Work as Before)
1. **Login as officer** (Rizma)
2. **Click "Lead Management"** from sidebar
3. ✅ Program selector does NOT appear (hidden for officers)
4. ✅ Batch selector appears (shows officer's program batches)
5. **Select a batch and sheet**
6. ✅ Only leads assigned to officer load

### Test 3: Program Switching
1. **As admin**, select "Program A"
2. ✅ See batches for Program A
3. **Select "Program B"**
4. ✅ Batch selector updates to Program B's batches
5. ✅ Sheet tabs and leads update

---

## Benefits

### For Admins:
- ✅ Can view lead management across all programs
- ✅ Can see all leads in a batch/sheet (not just assigned)
- ✅ Better oversight and monitoring
- ✅ Consistent with Leads page UX

### For Officers:
- ✅ No changes to their experience
- ✅ Still see only their assigned leads
- ✅ Simpler UI (no program selector clutter)

---

## API Endpoints Used

| Role | Endpoint | Returns |
|------|----------|---------|
| **Officer** | `/api/crm-leads/my` | Leads assigned to officer |
| **Admin** | `/api/crm-leads` | All leads (with filters) |

Both endpoints support:
- `?batch=Batch-14` - Filter by batch
- `?sheet=Main Leads` - Filter by sheet

---

## Status
✅ **COMPLETE** - Admin can now filter Lead Management by Program

---

**Date:** 2026-03-04  
**Version:** leadManagement.js v5, index.html updated  
**Feature:** Admin program filter for Lead Management page
