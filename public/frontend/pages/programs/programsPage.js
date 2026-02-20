// Admin Programs Page

(function () {
  function qs(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function fetchPrograms() {
    const res = await fetch('/api/programs', {
      headers: await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to load programs');
    return json;
  }

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

  async function deleteProgram(programId) {
    const res = await fetch(`/api/programs/${encodeURIComponent(programId)}`, {
      method: 'DELETE',
      headers: {
        ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
        'Content-Type': 'application/json'
      }
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to delete program');
    return json.program;
  }

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

  async function deleteBatch(programId, batchId) {
    const res = await fetch(`/api/programs/${encodeURIComponent(programId)}/batches/${encodeURIComponent(batchId)}`, {
      method: 'DELETE',
      headers: {
        ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
        'Content-Type': 'application/json'
      }
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to delete batch');
    return json.batch;
  }

  async function setCurrentBatch(programId, batchId) {
    const res = await fetch(`/api/programs/${encodeURIComponent(programId)}/batches/${encodeURIComponent(batchId)}/current`, {
      method: 'PUT',
      headers: {
        ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
        'Content-Type': 'application/json'
      }
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to set current batch');
    return json.batch;
  }

  function render({ programs, batches }) {
    const wrap = qs('programsList');
    if (!wrap) return;

    const byProgram = new Map();
    (batches || []).forEach(b => {
      const arr = byProgram.get(b.program_id) || [];
      arr.push(b);
      byProgram.set(b.program_id, arr);
    });

    wrap.innerHTML = (programs || []).map(p => {
      const bs = (byProgram.get(p.id) || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const current = bs.find(x => x.is_current);

      return `
        <div style="border:1px solid #eaecf0; border-radius:12px; padding:14px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:700; color:#101828;">${escapeHtml(p.name)}</div>
              <div style="font-size:13px; color:#667085;">Current batch: <b>${escapeHtml(current?.batch_name || '-')}</b></div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-secondary" type="button" data-action="add-batch" data-program-id="${escapeHtml(p.id)}">Add Batch</button>
              <button class="btn btn-danger" type="button" data-action="delete-program" data-program-id="${escapeHtml(p.id)}">Delete Program</button>
            </div>
          </div>

          <div style="margin-top:12px; overflow-x:auto;">
            <table class="data-table" style="min-width:520px;">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Current</th>
                  <th>Created</th>
                  <th>Action</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                ${(bs.length ? bs : [{ id: '', batch_name: '', is_current: false, created_at: '' }]).map(b => {
                  if (!b.id) {
                    return `<tr><td colspan="4" class="loading">No batches yet</td></tr>`;
                  }
                  return `
                    <tr>
                      <td>
                        <a href="#" data-action="edit-payment" data-program-id="${escapeHtml(p.id)}" data-batch-id="${escapeHtml(b.id)}" data-batch-name="${escapeHtml(b.batch_name)}" style="color:#175CD3; text-decoration:none; font-weight:600;">${escapeHtml(b.batch_name)}</a>
                      </td>
                      <td>${b.is_current ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Yes</span>' : '-'}</td>
                      <td>${escapeHtml(new Date(b.created_at).toLocaleString())}</td>
                      <td>
                        <button class="btn btn-primary btn-sm" type="button" data-action="set-current" data-program-id="${escapeHtml(p.id)}" data-batch-id="${escapeHtml(b.id)}">Set Current</button>
                      </td>
                      <td>
                        ${b.is_current ? '<span style="color:#98a2b3;">-</span>' : `<button class=\"btn btn-danger btn-sm\" type=\"button\" data-action=\"delete-batch\" data-program-id=\"${escapeHtml(p.id)}\" data-batch-id=\"${escapeHtml(b.id)}\">Delete</button>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    // Bind buttons
    wrap.querySelectorAll('button[data-action="delete-program"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const programId = btn.getAttribute('data-program-id');
        if (!confirm('Delete this program? This will delete Supabase leads for all its batches and unlink their Google Sheet mappings.')) return;
        try {
          await deleteProgram(programId);
          if (window.Cache) window.Cache.invalidatePrefix('programs:');
          if (window.UI && UI.showToast) UI.showToast('Program deleted', 'success');
          await load();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to delete program', 'error');
        }
      });
    });

    wrap.querySelectorAll('button[data-action="add-batch"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const programId = btn.getAttribute('data-program-id');
        // Open modal
        const pid = qs('programBatchProgramId');
        const bn = qs('programBatchName');
        const url = qs('programBatchSheetUrl');
        if (pid) pid.value = programId;
        if (bn) bn.value = '';
        if (url) url.value = '';
        openModal('programBatchAddModal');
      });
    });

    wrap.querySelectorAll('a[data-action="edit-payment"]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const batchName = a.getAttribute('data-batch-name');
        const programId = a.getAttribute('data-program-id');
        const batchId = a.getAttribute('data-batch-id');
        if (window.BatchPaymentSetup && window.BatchPaymentSetup.open) {
          window.BatchPaymentSetup.open(batchName, { programId, batchId }).catch(console.error);
        } else if (window.openBatchPaymentSetup) {
          window.openBatchPaymentSetup(batchName);
        }
      });
    });

    wrap.querySelectorAll('button[data-action="set-current"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const programId = btn.getAttribute('data-program-id');
        const batchId = btn.getAttribute('data-batch-id');
        try {
          await setCurrentBatch(programId, batchId);
          if (window.Cache) window.Cache.invalidatePrefix('programs:');
          if (window.UI && UI.showToast) UI.showToast('Current batch updated', 'success');
          await load();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to set current batch', 'error');
        }
      });
    });

    wrap.querySelectorAll('button[data-action="delete-batch"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const programId = btn.getAttribute('data-program-id');
        const batchId = btn.getAttribute('data-batch-id');
        if (!confirm('Delete this batch? This will delete Supabase leads for this batch and unlink the Google Sheet mapping.')) return;
        try {
          await deleteBatch(programId, batchId);
          if (window.Cache) window.Cache.invalidatePrefix('programs:');
          if (window.UI && UI.showToast) UI.showToast('Batch deleted', 'success');
          await load();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to delete batch', 'error');
        }
      });
    });
  }

  let isLoading = false;

  async function load({ showSkeleton = false } = {}) {
    if (isLoading) return;
    isLoading = true;

    const list = qs('programsList');
    const ttlMs = 10 * 60 * 1000; // 10 minutes
    const cacheKey = 'programs:all';

    // Fast path: render from cache if fresh and skip fetch
    if (list && !showSkeleton && window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached && cached.programs) {
        render(cached);
        isLoading = false;
        return;
      }
    }

    // Only show skeleton on first load to avoid flicker (stable like Lead Management)
    if (list && showSkeleton) list.innerHTML = '<p class="loading">Loading programs...</p>';

    try {
      const data = await fetchPrograms();
      if (window.Cache) window.Cache.setWithTs(cacheKey, data);
      render(data);
    } catch (e) {
      console.error(e);
      if (list && showSkeleton) {
        list.innerHTML = `<p class="loading">${escapeHtml(e.message || 'Failed to load programs')}</p>`;
      }
      throw e;
    } finally {
      isLoading = false;
    }
  }

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

      const res = await fetch('/api/batches/create', {
        method: 'POST',
        headers: {
          ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ batchName, mainSpreadsheetUrl: mainSheetUrl })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to link Google Sheet');

      await addBatch(programId, batchName);
      if (window.Cache) window.Cache.invalidatePrefix('programs:');
      closeModal('programBatchAddModal');
      if (window.UI && UI.showToast) UI.showToast('Batch created, sheet linked, and set as current', 'success');
      await load();

      // Open payment setup for this new batch
      if (window.openBatchPaymentSetup) {
        window.openBatchPaymentSetup(batchName);
      }
    } catch (e) {
      console.error(e);
      if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to add batch', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function initProgramsPage() {
    if (!window.currentUser || window.currentUser.role !== 'admin') return;

    const refreshBtn = qs('programsRefreshBtn');
    const addBtn = qs('programsAddBtn');

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => load().catch(console.error));
    }

    if (addBtn && !addBtn.__bound) {
      addBtn.__bound = true;
      addBtn.addEventListener('click', async () => {
        const input = qs('programAddName');
        if (input) input.value = '';
        openModal('programAddModal');
      });
    }

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

    const batchSaveBtn = qs('programBatchAddSaveBtn');
    if (batchSaveBtn && !batchSaveBtn.__bound) {
      batchSaveBtn.__bound = true;
      batchSaveBtn.addEventListener('click', () => handleCreateBatch());
    }

    await load({ showSkeleton: true });
  }

  window.initProgramsPage = initProgramsPage;
})();
