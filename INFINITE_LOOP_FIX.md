# Officer Leads Page - Infinite Loop & Tab Flickering Fix

## Issues Fixed

### Issue 1: Infinite Loading Loop ⚠️ CRITICAL
**Symptom:** Page loads leads repeatedly, console shows multiple "Loading officer leads..." messages, page becomes slow/unresponsive

**Root Cause:** Line 346-347 had a recursive call to `loadLeads()` without any guard:
```javascript
// re-run load once program context exists
await loadLeads();  // ← This causes infinite recursion!
return;
```

When the program wasn't set, the code would:
1. Try to infer program from batch
2. Call `loadLeads()` again
3. Check program again → not set
4. Try to infer again
5. Call `loadLeads()` AGAIN
6. **Repeat forever** ♾️

**Fix Applied:**
```javascript
// Added guard flag to prevent infinite loop
if (window.adminBatchFilter && !window.__programInferredFromBatch) {
  window.__programInferredFromBatch = true; // ← Prevents re-entry
  // ... infer program logic ...
  // Don't call loadLeads() again - just continue
  console.log('[LEADS] Inferred program from batch:', match.program_id);
}
```

---

### Issue 2: Sheet Tabs Flickering/Disappearing 🔀
**Symptom:** Sheet tabs appear, disappear, reappear - unstable UI

**Root Cause:** Tabs were being rendered **TWICE**:
1. First render with default sheets (Main Leads, Extra Leads)
2. Async fetch from server
3. Second render with fetched sheets (if different)

This caused visible flickering as the tabs were cleared and rebuilt multiple times.

**Fix Applied:**
```javascript
// OLD (caused flickering):
renderTabs(sheets);  // ← First render with defaults
(async () => {
  // fetch from server...
  renderTabs(merged);  // ← Second render after fetch
})();

// NEW (stable):
// Fetch FIRST, then render ONCE
try {
  const res = await fetch(...);
  renderTabs(merged);  // ← Single render with fetched data
} catch (e) {
  renderTabs(sheets);  // ← Fallback only if fetch fails
}
```

---

## Files Modified
- ✅ `public/frontend/pages/leads/leadsPage.js` (v7)
  - Line ~338: Added infinite loop guard
  - Line ~514: Changed from double-render to single-render
- ✅ `public/index.html` (version bump v7)

---

## Testing

### CRITICAL: Clear Browser Cache
1. Press `Ctrl+Shift+Delete`
2. Clear "Cached images and files"
3. Hard refresh: `Ctrl+F5`

### Test 1: No More Infinite Loading
1. Login as officer (e.g., Rizma)
2. Click "Leads" from sidebar
3. ✅ Console shows **ONE** "Loading officer leads" message (not multiple)
4. ✅ Page loads once and stops
5. ✅ Page is responsive (not slow/frozen)

### Test 2: Stable Sheet Tabs
1. On leads page with a batch selected
2. ✅ Sheet tabs appear **once** and stay visible
3. ✅ No flickering or disappearing
4. ✅ Tabs don't rebuild multiple times
5. ✅ Switching tabs works smoothly

### Test 3: Overall Stability
1. Navigate to leads page
2. Switch between batches
3. Switch between sheets
4. ✅ Everything loads smoothly
5. ✅ No multiple reloads
6. ✅ No console spam

---

## Technical Details

**Infinite Loop Prevention:**
- Used a flag `window.__programInferredFromBatch` to track if we've already tried to infer the program
- Once set, the inference logic won't run again
- Prevents the recursive `loadLeads()` call

**Tab Rendering Optimization:**
- Changed from "render immediately + async update" to "fetch then render once"
- Slightly slower initial load (waits for fetch), but much more stable UX
- Fallback to defaults only if fetch fails

---

## Status
✅ **FIXED** - Both issues resolved

## Related Issues
- Double-submit fix (v6)
- Officer leads initialization (v4-v5)
- Cache invalidation on assignment

---

**Date:** 2026-03-04
**Version:** v7
