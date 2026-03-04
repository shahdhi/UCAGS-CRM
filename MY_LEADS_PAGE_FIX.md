# My Leads Page Fix

## Problem
When officers clicked "My Leads" from the sidebar, the page showed "Loading leads..." indefinitely with no console output and no leads displayed.

## Root Cause
When clicking "My Leads" from sidebar, the app.js router sets:
```javascript
window.officerBatchFilter = 'all';
```

The `loadLeads()` function was passing `batch: 'all'` to the API, but the code logic treated `'all'` as an invalid value that prevented the API call from being made properly.

## Solution
Modified the API call to **NOT send** the batch filter when it's set to `'all'`:

**File**: `public/frontend/pages/leads/leadsPage.js`

**Before**:
```javascript
if (window.officerBatchFilter) filters.batch = window.officerBatchFilter;
```

**After**:
```javascript
// NOTE: Don't send 'all' as batch filter - let backend return all batches when no batch filter
if (window.officerBatchFilter && window.officerBatchFilter !== 'all') {
  filters.batch = window.officerBatchFilter;
}
```

## Result
✅ "My Leads" page now loads all leads for the officer across all batches
✅ Console shows proper debug output
✅ Leads display correctly in the table

## Testing
1. Login as an officer (e.g., Rizma)
2. Click "My Leads" from sidebar
3. **Expected**: See all 3 leads (from Batch-14)
4. **Console should show**:
   ```
   🔍 Loading officer leads with filters: { sheet: null }
   Current user: { id: '...', email: 'rizma@ucags.edu.lk', name: 'Rizma', role: 'officer' }
   ✓ Loaded 3 leads
   ```

## Related Files
- `public/frontend/pages/leads/leadsPage.js` - Fixed batch filter logic
- `public/js/app.js` - Sets `officerBatchFilter = 'all'` on "My Leads" route

## Notes
- When officer clicks a specific batch from sidebar (e.g., "Batch-14"), the `officerBatchFilter` is set to that batch name and WILL be sent to the API to filter results
- The `'all'` value is only used when viewing "My Leads" without a specific batch selected
