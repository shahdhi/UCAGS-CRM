# Frontend Save/Submit Handlers - Batch & Program Management

This document summarizes all save/submit handlers for editing batch and program details across the frontend pages, showing the full API calls they make.

---

## 1. **programsPage.js** - Batch Setup Modal (Combined Modal)

**Location:** Lines 565-623 in `public/frontend/pages/programs/programsPage.js`

### Handler: `batchSetupSaveBtn.onclick`

**Trigger:** Click on "Save" button in the Batch Setup Modal

**Makes TWO sequential API calls:**

#### Call 1: Save Payment Setup
```javascript
await apiPut(`/api/payment-setup/batches/${encodeURIComponent(batchName)}`, {
  methods: (state.payment.methods || []).map(m => String(m.method_name || '').trim()).filter(Boolean),
  plans: (state.payment.plans || [])
    .map(p => ({
      plan_name: String(p.plan_name || '').trim(),
      installment_count: Math.max(parseInt(p.installment_count || '1', 10) || 1, 1),
      due_dates: Array.isArray(p.due_dates) ? p.due_dates.map(x => String(x || '').trim()).filter(Boolean) : []
    }))
    .filter(p => p.plan_name)
});
```
- **Method:** PUT
- **Endpoint:** `/api/payment-setup/batches/{batchName}`
- **Body:** 
  - `methods`: Array of payment method names
  - `plans`: Array of plan objects with plan_name, installment_count, and due_dates

#### Call 2: Save General Batch Setup & Demo Sessions
```javascript
await apiPut('/api/batch-setup', {
  programId,
  batchId,
  batchName,
  general: {
    isCurrent: !!state.general.isCurrent,
    coordinatorUserId: state.general.coordinatorUserId || null,
    demoSessionsCount: state.general.demoSessionsCount
  },
  demo: {
    demoSessionsCount: (state.demo.sessionsList || []).length,
    sessions: (state.demo.sessionsList || []).reduce((acc, s) => {
      acc[String(s.demo_number)] = { title: s.title, scheduled_at: s.scheduled_at, notes: s.notes };
      return acc;
    }, {})
  },
  payments: {}
});
```
- **Method:** PUT
- **Endpoint:** `/api/batch-setup`
- **Body:**
  - `programId`: Program ID
  - `batchId`: Batch ID
  - `batchName`: Batch name
  - `general`: Object with isCurrent flag, coordinatorUserId, demoSessionsCount
  - `demo`: Object with demoSessionsCount and sessions map (keyed by demo_number)
  - `payments`: Empty object (reserved for future use)

**Full Context:**
```javascript
// Save
qs('batchSetupSaveBtn').onclick = async () => {
  try {
    qs('batchSetupSaveBtn').disabled = true;

    // 1) Save payment setup
    await apiPut(`/api/payment-setup/batches/${encodeURIComponent(batchName)}`, {
      methods: (state.payment.methods || []).map(m => String(m.method_name || '').trim()).filter(Boolean),
      plans: (state.payment.plans || [])
        .map(p => ({
          plan_name: String(p.plan_name || '').trim(),
          installment_count: Math.max(parseInt(p.installment_count || '1', 10) || 1, 1),
          due_dates: Array.isArray(p.due_dates) ? p.due_dates.map(x => String(x || '').trim()).filter(Boolean) : []
        }))
        .filter(p => p.plan_name)
    });

    // 2) Save general + demo
    await apiPut('/api/batch-setup', {
      programId,
      batchId,
      batchName,
      general: {
        isCurrent: !!state.general.isCurrent,
        coordinatorUserId: state.general.coordinatorUserId || null,
        demoSessionsCount: state.general.demoSessionsCount
      },
      demo: {
        demoSessionsCount: (state.demo.sessionsList || []).length,
        sessions: (state.demo.sessionsList || []).reduce((acc, s) => {
          acc[String(s.demo_number)] = { title: s.title, scheduled_at: s.scheduled_at, notes: s.notes };
          return acc;
        }, {})
      },
      payments: {}
    });

    clearBatchSetupDirty();
    if (window.Cache) window.Cache.invalidatePrefix('programs:');

    // Notify other pages that current batch may have changed
    try {
      window.dispatchEvent(new CustomEvent('currentBatchChanged', {
        detail: { programId, batchName }
      }));
      window.__programBatchesCache = null;
      window.__programBatchesMeta = null;
    } catch (_) {}

    if (window.UI?.showToast) UI.showToast('Batch setup saved', 'success');
    closeModal('batchSetupModal');
    await load();
  } catch (e) {
    console.error(e);
    if (window.UI?.showToast) UI.showToast(e.message, 'error');
  } finally {
    qs('batchSetupSaveBtn').disabled = false;
  }
};
```

---

## 2. **batchPaymentSetup.js** - Batch Payment Setup Modal (Standalone)

**Location:** Lines 254-271 in `public/frontend/pages/payments/batchPaymentSetup.js`

### Handler: `saveBtn.addEventListener('click')`

**Trigger:** Click on "Save" button in the Batch Payment Setup Modal

**Makes ONE API call:**

```javascript
const res = await fetch(`/api/payment-setup/batches/${encodeURIComponent(batchName)}`, {
  method: 'PUT',
  headers: authHeaders,
  body: JSON.stringify({ methods, plans })
});
```

**Details:**
- **Method:** PUT
- **Endpoint:** `/api/payment-setup/batches/{batchName}`
- **Body:**
  - `methods`: Array of validated payment method names (trimmed, non-empty)
  - `plans`: Array of plan objects with:
    - `plan_name`: Validated, trimmed plan name
    - `installment_count`: Integer >= 1
    - `due_dates`: Array of date strings (validated: all required if installment_count > 1)

**Full Context:**
```javascript
// The save function (lines 153-177)
async function save(batchName) {
  const methods = state.methods.map(m => validateName('Payment method', m));
  const plans = state.plans.map(p => {
    const name = validateName('Payment plan', p.plan_name);
    const count = Math.max(parseInt(p.installment_count || '1', 10) || 1, 1);
    const due_dates = Array.isArray(p.due_dates) ? p.due_dates.slice(0, count) : [];
    if (count > 1 && due_dates.some(d => !d)) {
      throw new Error(`All due dates are required for plan "${name}"`);
    }
    return { plan_name: name, installment_count: count, due_dates };
  });

  const authHeaders = {
    ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
    'Content-Type': 'application/json'
  };

  const res = await fetch(`/api/payment-setup/batches/${encodeURIComponent(batchName)}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ methods, plans })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to save setup');
}

// The event handler (lines 254-271)
if (saveBtn && !saveBtn.__bound) {
  saveBtn.__bound = true;
  saveBtn.addEventListener('click', async () => {
    const batchName = qs('paymentSetupBatchName')?.value;
    if (!batchName) return;
    try {
      saveBtn.disabled = true;
      await save(batchName);
      if (window.UI && UI.showToast) UI.showToast('Payment setup saved', 'success');
      closeModal('batchPaymentSetupModal');
    } catch (e) {
      console.error(e);
      if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to save payment setup', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });
}
```

---

## 3. **programsPage.js** - Create Program Handler

**Location:** Lines 921-939 in `public/frontend/pages/programs/programsPage.js`

### Handler: `programSaveBtn.addEventListener('click')`

**Trigger:** Click on "Save" button in the "Create Program" modal

**Makes ONE API call:**

```javascript
const res = await fetch('/api/programs', {
  method: 'POST',
  headers: {
    ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name })
});
```

**Details:**
- **Method:** POST
- **Endpoint:** `/api/programs`
- **Body:**
  - `name`: Program name (trimmed, required)

**Full Context:**
```javascript
const programSaveBtn = qs('programAddSaveBtn');
if (programSaveBtn && !programSaveBtn.__bound) {
  programSaveBtn.__bound = true;
  programSaveBtn.addEventListener('click', async () => {
    const name = qs('programAddName')?.value?.trim();
    if (!name) {
      if (window.UI && UI.showToast) UI.showToast('Program name is required', 'error');
      return;
    }
    try {
      programSaveBtn.disabled = true;
      await createProgram(name);
      if (window.Cache) window.Cache.invalidatePrefix('programs:');
      closeModal('programAddModal');
      if (window.UI && UI.showToast) UI.showToast('Program created', 'success');
      await load();
    } catch (e) {
      console.error(e);
      if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to create program', 'error');
    } finally {
      programSaveBtn.disabled = false;
    }
  });
}
```

---

## 4. **programsPage.js** - Create Batch Handler

**Location:** Lines 829-895 in `public/frontend/pages/programs/programsPage.js`

### Handler: `handleCreateBatch()` - Called from `batchSaveBtn.addEventListener('click')`

**Trigger:** Click on "Save" button in the "Create Batch" modal

**Makes TWO sequential API calls:**

#### Call 1: Create Program Batch
```javascript
const newBatch = await addBatch(programId, batchName);
// Which calls:
const res = await fetch(`/api/programs/${encodeURIComponent(programId)}/batches`, {
  method: 'POST',
  headers: {
    ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ batch_name: batchName })
});
```
- **Method:** POST
- **Endpoint:** `/api/programs/{programId}/batches`
- **Body:**
  - `batch_name`: Name of the batch

#### Call 2: Link Google Sheet Mapping (Best Effort)
```javascript
const res = await fetch('/api/batches/create', {
  method: 'POST',
  headers: {
    ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ batchName, mainSpreadsheetUrl: mainSheetUrl })
});
```
- **Method:** POST
- **Endpoint:** `/api/batches/create`
- **Body:**
  - `batchName`: Batch name
  - `mainSpreadsheetUrl`: Google Sheet URL

**Full Context:**
```javascript
async function handleCreateBatch() {
  const saveBtn = qs('programBatchAddSaveBtn');
  const programId = qs('programBatchProgramId')?.value;
  const batchName = qs('programBatchName')?.value?.trim();
  const mainSheetUrl = qs('programBatchSheetUrl')?.value?.trim();

  if (!programId) return;
  if (!batchName) {
    if (window.UI && UI.showToast) UI.showToast('Batch name is required', 'error');
    return;
  }
  if (!mainSheetUrl) {
    if (window.UI && UI.showToast) UI.showToast('Main Google Sheet URL is required', 'error');
    return;
  }

  try {
    if (saveBtn) saveBtn.disabled = true;

    // 1) Create program batch first
    const newBatch = await addBatch(programId, batchName);

    // 2) Link Google Sheet mapping (best effort)
    try {
      const res = await fetch('/api/batches/create', {
        method: 'POST',
        headers: {
          ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ batchName, mainSpreadsheetUrl: mainSheetUrl })
      });
      const json = await res.json();
      if (!json.success) {
        console.warn('Sheet linking failed:', json.error);
        if (window.UI && UI.showToast) UI.showToast(`Batch created but sheet linking failed: ${json.error}`, 'warning');
      }
    } catch (e) {
      console.warn('Sheet linking failed:', e);
      if (window.UI && UI.showToast) UI.showToast('Batch created but sheet linking failed', 'warning');
    }
    if (window.Cache) window.Cache.invalidatePrefix('programs:');
    closeModal('programBatchAddModal');
    if (window.UI && UI.showToast) UI.showToast('Batch created, sheet linked, and set as current', 'success');
    await load();

    // Open combined Batch Setup modal
    try {
      if (window.openBatchSetupModal) {
        setTimeout(() => {
          window.openBatchSetupModal({ programId, batchId: newBatch?.id, batchName })
            .catch(err => console.warn('Failed to open batch setup modal:', err));
        }, 0);
      } else {
        console.warn('openBatchSetupModal not available');
      }
    } catch (e) {
      console.warn('Failed to open batch setup modal:', e);
    }
  } catch (e) {
    console.error(e);
    if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to add batch', 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}
```

---

## Summary Table

| Handler | Page | Endpoint(s) | Method | What It Saves |
|---------|------|-----------|--------|---------------|
| Batch Setup Save | programsPage.js | `/api/payment-setup/batches/{batchName}` + `/api/batch-setup` | PUT + PUT | Payment methods, plans, batch general info, demo sessions |
| Payment Setup Save | batchPaymentSetup.js | `/api/payment-setup/batches/{batchName}` | PUT | Payment methods and plans only |
| Create Program | programsPage.js | `/api/programs` | POST | Program name |
| Create Batch | programsPage.js | `/api/programs/{programId}/batches` + `/api/batches/create` | POST + POST | Batch name and Google Sheet mapping |

---

## Helper Functions Used

### `apiPut(url, body)` - Lines 101-113
```javascript
async function apiPut(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json;
}
```

### `createProgram(name)` - Lines 23-35
```javascript
async function createProgram(name) {
  const res = await fetch('/api/programs', {
    method: 'POST',
    headers: {
      ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to create program');
  return json.program;
}
```

### `addBatch(programId, batchName)` - Lines 50-62
```javascript
async function addBatch(programId, batchName) { 
  const res = await fetch(`/api/programs/${encodeURIComponent(programId)}/batches`, {
    method: 'POST',
    headers: {
      ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ batch_name: batchName })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to add batch');
  return json.batch;
}
```
