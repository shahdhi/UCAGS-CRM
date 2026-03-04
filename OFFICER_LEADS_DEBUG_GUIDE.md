# Officer Leads Debugging Guide

## Problem
Officers were unable to load leads and sheets on the "My Leads" page.

## Root Cause Analysis

Based on testing, the system has:
- ✅ Valid officer accounts in Supabase (Shaziya, Rizma, Ishma)
- ✅ Working authentication middleware
- ✅ Properly configured `crm_leads` table
- ✅ Working API endpoints (`/api/crm-leads/my`)

**Key Finding**: Only officer "Rizma" has leads assigned (2 leads in Batch-14/Main Leads). Other officers (Shaziya, Ishma) have NO leads assigned, which is why their pages appear empty.

## Changes Made

### 1. Backend Debug Logging (`backend/modules/crmLeads/crmLeadsRoutes.js`)

Added comprehensive logging to the `/api/crm-leads/my` endpoint:

```javascript
// Debug logging to track requests
console.log('📋 GET /api/crm-leads/my - Request details:', {
  officerName,
  userId: req.user?.id,
  userEmail: req.user?.email,
  userRole: req.user?.role,
  batchName,
  sheetName,
  search,
  status
});

// Early validation with helpful error message
if (!officerName) {
  console.warn('⚠️  Officer name is missing from req.user');
  return res.status(400).json({ 
    success: false, 
    error: 'Officer name not found in user profile. Please contact administrator.',
    debug: {
      userId: req.user?.id,
      email: req.user?.email,
      userObject: req.user
    }
  });
}
```

### 2. Frontend Debug Logging (`public/frontend/pages/leads/leadsPage.js`)

Added logging before API calls and enhanced error display:

```javascript
console.log('🔍 Loading officer leads with filters:', filters);
console.log('Current user:', window.currentUser);

// Enhanced error handling
if (error.debug) {
  console.error('Debug info:', error.debug);
  errorMsg += '\n\nDebug info: ' + JSON.stringify(error.debug, null, 2);
}
```

## How to Test

### For an officer with leads (e.g., Rizma):

1. Login as `rizma@ucags.edu.lk`
2. Navigate to "My Leads"
3. Check browser console for:
   ```
   🔍 Loading officer leads with filters: { batch: 'Batch-14', sheet: 'Main Leads' }
   Current user: { id: '...', email: 'rizma@ucags.edu.lk', name: 'Rizma', role: 'officer' }
   ✓ Loaded 2 leads
   ```
4. Check server logs for:
   ```
   📋 GET /api/crm-leads/my - Request details: { officerName: 'Rizma', ... }
   ✓ Returned 2 leads for Rizma
   ```

### For an officer without leads (e.g., Shaziya):

1. Login as `shaziya@ucags.edu.lk`
2. Navigate to "My Leads"
3. Should see: "No leads found" (this is correct - no leads assigned yet)
4. Console should show:
   ```
   ✓ Loaded 0 leads
   ```

### If authentication fails:

You'll now see a clear error message:
```
Officer name not found in user profile. Please contact administrator.
```

With debug info showing exactly what's in the user object.

## Common Issues & Solutions

### Issue 1: "Officer name not found in user profile"

**Cause**: The user's `user_metadata.name` is not set in Supabase.

**Solution**: 
1. Go to Supabase Dashboard → Authentication → Users
2. Find the officer's account
3. Edit User Metadata and add: `{ "name": "OfficerName", "role": "officer" }`

### Issue 2: Officer sees "No leads found"

**Cause**: No leads are assigned to this officer in the `crm_leads` table.

**Solution**:
1. Admin needs to assign leads to the officer
2. Or sync leads from Google Sheets if using that integration

### Issue 3: Sheets not appearing

**Cause**: No officer custom sheets created yet.

**Solution**:
1. Officers can only create leads in custom sheets (not "Main Leads" or "Extra Leads")
2. Click "Add sheet" button to create a custom sheet first
3. Then the "New Lead" button will appear

## Database State (as of testing)

```
Officers in system:
- Shaziya (shaziya@ucags.edu.lk) - 0 leads
- Rizma (rizma@ucags.edu.lk) - 2 leads in Batch-14/Main Leads  
- Ishma (ishma@ucags.edu.lk) - 0 leads

Total leads in crm_leads: 12
Officer custom sheets: 0
```

## Next Steps

1. **Test with an actual officer account** - Login and check console logs
2. **Assign leads to officers** - If officers should have leads but don't
3. **Review the logs** - Server and browser console will show exactly what's happening
4. **Remove debug logging** - Once issue is confirmed fixed, we can remove verbose console.log statements

## Files Modified

- `backend/modules/crmLeads/crmLeadsRoutes.js` - Added debug logging and validation
- `public/frontend/pages/leads/leadsPage.js` - Added frontend logging and better error display

## Test Files Created (for cleanup)

- `tmp_rovodev_test_officer_leads.js`
- `tmp_rovodev_test_api.js`
- `tmp_rovodev_check_users.js`
- `tmp_rovodev_check_assignments.js`

These can be deleted after testing is complete.
