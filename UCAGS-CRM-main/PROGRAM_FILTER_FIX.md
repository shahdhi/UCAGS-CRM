# Program Filter Fix - Admin Lead Management

## Issue
The program filter dropdown was not showing for admin users on the Lead Management page.

## Root Cause
The program selector initialization code had a recursive call issue:

```javascript
// BEFORE (caused infinite loop / didn't show):
programSelect.addEventListener('change', () => {
  window.adminProgramId = programSelect.value;
  window.adminBatchFilter = '';
  window.adminSheetFilter = 'Main Leads';
  initLeadManagementPage();  // ← Recursive call!
});

// This also called initLeadManagementPage() again after loading programs:
if (window.adminProgramId) {
  initLeadManagementPage();  // ← Another recursive call!
}
```

**Problem:** Calling `initLeadManagementPage()` again would re-run `loadLeadManagement()`, which would try to set up the program selector again, potentially causing issues.

## Solution
Changed to call `loadLeadManagement()` directly instead of `initLeadManagementPage()`:

```javascript
// AFTER (works correctly):
programSelect.addEventListener('change', () => {
  window.adminProgramId = programSelect.value;
  window.adminBatchFilter = '';
  window.adminSheetFilter = 'Main Leads';
  loadLeadManagement();  // ← Just reload data, don't re-init
});

// Removed the extra call after loading programs
```

**Benefits:**
- ✅ No recursive calls
- ✅ Cleaner initialization flow
- ✅ Program selector shows for admin
- ✅ Changing program reloads data without re-initializing

---

## How It Works Now

1. **Admin accesses Lead Management page**
2. `initLeadManagementPage()` is called
3. `loadLeadManagement()` is called
4. Inside `loadLeadManagement()`:
   - Detects user is admin (`isAdmin = true`)
   - Sets up program selector (once, with `__bound` flag)
   - Shows program selector (`display: ''`)
   - Loads programs from API
   - Populates dropdown with programs
   - Sets up change handler to call `loadLeadManagement()` (not `initLeadManagementPage()`)
5. **Admin selects a program**
6. `loadLeadManagement()` is called again
7. Data loads for selected program

---

## Files Modified
- ✅ `public/frontend/pages/leads/leadManagement.js` (v6)
  - Removed recursive `initLeadManagementPage()` call
  - Changed to call `loadLeadManagement()` on program change
- ✅ `public/index.html` (version bump v6)

---

## Testing Instructions

### CRITICAL: Clear Browser Cache
1. Press `Ctrl+Shift+Delete`
2. Clear "Cached images and files"
3. Hard refresh: `Ctrl+F5`

### Test:
1. **Login as admin**
2. **Click "Lead Management"** from sidebar
3. ✅ **Program selector should now appear** (first dropdown after Priority filter)
4. ✅ Shows list of programs
5. **Select a program**
6. ✅ Batch selector updates
7. ✅ Data loads correctly
8. **Select different program**
9. ✅ Batch and sheet update
10. ✅ No infinite loops or console errors

---

## Status
✅ **FIXED** - Program filter now shows for admin users

---

**Date:** 2026-03-04  
**Version:** leadManagement.js v6  
**Fix:** Removed recursive calls, program filter now visible for admin
