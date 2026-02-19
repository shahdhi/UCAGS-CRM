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
                </tr>
              </thead>
              <tbody>
                ${(bs.length ? bs : [{ id: '', batch_name: '', is_current: false, created_at: '' }]).map(b => {
                  if (!b.id) {
                    return `<tr><td colspan="4" class="loading">No batches yet</td></tr>`;
                  }
                  return `
                    <tr>
                      <td>${escapeHtml(b.batch_name)}</td>
                      <td>${b.is_current ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Yes</span>' : '-'}</td>
                      <td>${escapeHtml(new Date(b.created_at).toLocaleString())}</td>
                      <td>
                        <button class="btn btn-primary btn-sm" type="button" data-action="set-current" data-program-id="${escapeHtml(p.id)}" data-batch-id="${escapeHtml(b.id)}">Set Current</button>
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
    wrap.querySelectorAll('button[data-action="add-batch"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const programId = btn.getAttribute('data-program-id');
        const batchName = prompt('New batch name (example: Batch-14):');
        if (!batchName) return;
        const mainSheetUrl = prompt('Main Google Sheet URL for this batch (required):');
        if (!mainSheetUrl) return;

        try {
          // 1) Link/provision the batch Google Sheet + sync leads
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

          // 2) Register the batch under this program (and set as current)
          await addBatch(programId, batchName);

          if (window.UI && UI.showToast) UI.showToast('Batch created, sheet linked, and set as current', 'success');
          await load();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to add batch', 'error');
        }
      });
    });

    wrap.querySelectorAll('button[data-action="set-current"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const programId = btn.getAttribute('data-program-id');
        const batchId = btn.getAttribute('data-batch-id');
        try {
          await setCurrentBatch(programId, batchId);
          if (window.UI && UI.showToast) UI.showToast('Current batch updated', 'success');
          await load();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to set current batch', 'error');
        }
      });
    });
  }

  async function load() {
    const list = qs('programsList');
    if (list) list.innerHTML = '<p class="loading">Loading programs...</p>';
    const data = await fetchPrograms();
    render(data);
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
        const name = prompt('Program name:');
        if (!name) return;
        try {
          await createProgram(name);
          if (window.UI && UI.showToast) UI.showToast('Program created', 'success');
          await load();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to create program', 'error');
        }
      });
    }

    await load();
  }

  window.initProgramsPage = initProgramsPage;
})();
