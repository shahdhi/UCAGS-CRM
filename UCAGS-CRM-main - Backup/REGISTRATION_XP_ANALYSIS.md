# Registration Module & XP Integration Analysis

## Summary

This document examines the registrations backend module to understand:
1. What happens when a new registration is created
2. Whether XP is awarded inline in the route
3. Any calls to XP service or XP-related logic

---

## 1. What Happens When a New Registration is Created

### Flow (POST /api/registrations/intake)

When a public registration submission arrives via the `/intake` endpoint:

**A. Input Validation & Normalization**
- Phone number normalized to Sri Lanka canonical format (94XXXXXXXXX)
- Program ID required and validated against `programs` table
- Current batch lookup (either marked `is_current=true` or most recently created)
- Name and phone number are mandatory fields

**B. Assignment Determination**
- Uses `findAssigneeByPhoneAcrossAllSheets()` to search existing leads in Supabase `crm_leads` table
- Searches within the same batch for efficiency
- Caches results for 5 minutes (TTL_MS = 5 * 60 * 1000)
- Returns assigned officer name if found

**C. Record Creation**
- Inserts into `registrations` table with full payload stored as JSON
- Extracts fields: name, gender, DOB, address, country, phone, email, program_id, batch_name, assigned_to, source, etc.
- Includes fallback logic for missing schema columns (graceful degradation)

**D. Previous Registration Handling**
- Checks if phone + batch combination already exists
- If previous registration is found and is **replaceable** (not enrolled & no payment):
  - Deletes old registration and related payments
  - Logs the replacement
- Otherwise keeps both records (re-submission)

**E. Side Effects (Post-Insert)**
- **Notifications**: Sends notifications to assigned officer and admins (if configured)
- **Lead Status Sync**: Updates `crm_leads` table status to "Registered" 
- **XP Award**: Awards +40 XP to the assigned officer (see section 2 below)

---

## 2. XP Award Inline in Route - YES

### Key Finding: XP IS Awarded Inline

**Location**: Lines 264-297 in `registrationsRoutes.js`

```javascript
// XP: +40 for the assigned officer when a registration is received
// Skip XP if this phone number already had a previous registration in the same batch
// (i.e. it's a re-submission, not a genuinely new registration)
try {
  const isResubmission = !!previousRegistration;
  if (!isResubmission) {
    const { awardXPOnce } = require('../xp/xpService');
    const assignedOfficerName = cleanString(data?.assigned_to || row.assigned_to);
    if (assignedOfficerName && data?.id) {
      const sb2 = getSupabaseAdmin();
      const { data: { users } } = await sb2.auth.admin.listUsers();
      const officerUser = (users || []).find(u => {
        const nm = String(u.user_metadata?.name || '').trim().toLowerCase();
        return nm === assignedOfficerName.toLowerCase();
      });
      if (officerUser?.id) {
        await awardXPOnce({
          userId: officerUser.id,
          eventType: 'registration_received',
          xp: 40,
          referenceId: data.id,
          referenceType: 'registration',
          programId: programRow.id || null,
          batchName: registrationBatchName,
          note: `Registration received: ${data.name || 'student'}`
        });
      }
    }
  } else {
    console.log(`[XP] Skipping registration_received XP for ${row.phone_number}...`);
  }
} catch (xpErr) {
  console.warn('[XP] registration_received hook error:', xpErr.message);
}
```

### XP Award Details:
- **Timing**: Happens synchronously after registration insert (NOT queued/deferred)
- **Amount**: +40 XP per registration
- **Condition**: Only awarded if NOT a re-submission
  - A re-submission is defined as: phone + batch already existed in registrations table
  - Prevents double-awarding XP for duplicate submissions
- **Recipient**: The assigned officer (matched by name from auth users)
- **Event Type**: `registration_received`
- **Reference**: Links XP event to registration ID

---

## 3. XP Service Calls & XP-Related Logic

### Direct Calls to XP Service

**In registrationsRoutes.js:**

1. **Line 270**: `const { awardXPOnce } = require('../xp/xpService');`
   - Destructures `awardXPOnce` function from xpService
   - Only imported inside the try block when needed (lazy load)

2. **Lines 280-289**: Calls `awardXPOnce()` with:
   ```javascript
   await awardXPOnce({
     userId: officerUser.id,
     eventType: 'registration_received',
     xp: 40,
     referenceId: data.id,
     referenceType: 'registration',
     programId: programRow.id || null,
     batchName: registrationBatchName,
     note: `Registration received: ${data.name || 'student'}`
   });
   ```

### XP Service Function: `awardXPOnce()`

From `xpService.js` (visible from imports but full definition not shown in provided excerpt), this function:
- Takes a user ID and event details
- Creates an officer XP event record
- Ensures idempotency (won't re-award for same referenceId)
- Records the event in `officer_xp_events` table

### XP Service Related Queries (from xpService.js)

The xpService.js file contains utilities for:
- **getCurrentBatchXPMap()**: Aggregates XP per user for current batches only
- **getLeaderboard()**: Returns officers ranked by current-batch XP
- **getMyXP()**: Returns user's current-batch XP + recent events
- XP is scoped to current batches (`is_current = true`)

---

## 4. Registration Assignment Service

**File**: `registrationAssignmentService.js`

This module handles assignment inference, NOT XP-related:
- Normalizes phone to Sri Lanka format
- Searches Supabase `crm_leads` table (source of truth)
- Returns assigned officer name if phone exists in leads
- Uses 5-minute TTL cache to avoid repeated queries
- Functions: `findAssigneeByPhoneAcrossAllSheets()`, `clearAssignmentCache()`

**No XP logic here** — purely for finding who should be assigned to a registration.

---

## 5. Summary Table

| Aspect | Details |
|--------|---------|
| **XP Awarded Inline?** | YES — synchronously during POST /intake |
| **XP Amount** | +40 per new registration |
| **XP Event Type** | `registration_received` |
| **XP Recipient** | Assigned officer (matched by name) |
| **XP Service Used** | `awardXPOnce()` from xpService.js |
| **Re-submission Handling** | XP skipped if phone+batch already exists |
| **Scope** | Current batch only (controlled by xpService) |
| **Error Handling** | XP errors logged but don't fail registration |

---

## 6. Key Code Locations

| Function | File | Lines | Purpose |
|----------|------|-------|---------|
| POST /intake | registrationsRoutes.js | 17-303 | Main registration endpoint |
| XP Award Logic | registrationsRoutes.js | 264-297 | Awards +40 XP to officer |
| awardXPOnce | xpService.js | (imported) | Creates XP event record |
| findAssigneeByPhoneAcrossAllSheets | registrationAssignmentService.js | 56-76 | Finds assigned officer |
| getCurrentBatchXPMap | xpService.js | 161-186 | Aggregates XP per user |

---

## Notes

- **No deferred/queued XP**: XP is awarded immediately, not via job queue
- **Graceful degradation**: If XP service fails, registration still succeeds (try/catch)
- **Source of truth**: `crm_leads` table in Supabase is the source for assignee lookup
- **Idempotency**: `awardXPOnce()` prevents duplicate XP for same registration
- **Batch scoping**: XP counts only events from current batches, others are ignored

