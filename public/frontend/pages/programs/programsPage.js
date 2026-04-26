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

  // --------------------------
  // Batch Setup Modal (combined)
  // --------------------------

  async function apiGet(url) {
    const res = await fetch(url, { headers: await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {}) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json;
  }

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

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: 'POST',
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

  function buildBatchSetupModalHtml() {
    return `
      <div class="modal" id="batchSetupModal">
        <div class="modal-content" style="max-width:1100px;">
          <div class="modal-header">
            <h2 id="batchSetupModalTitle">Batch Setup</h2>
            <button class="modal-close" onclick="window.closeModal && window.closeModal('batchSetupModal')">&times;</button>
          </div>

          <div class="modal-body">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
              <div style="color:#667085; font-size:12px;" id="batchSetupModalMeta"></div>
              <div style="color:#b42318; font-size:12px;" id="batchSetupModalDirty"></div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:14px;">
              <div>
                <label style="font-size:12px; color:#667085; font-weight:800;">Current Batch</label>
                <div style="margin-top:6px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <button class="btn btn-primary btn-sm" type="button" id="batchSetupCurrentBtn"><i class="fas fa-star"></i> Set as current</button>
                </div>
              </div>
              <div>
                <label style="font-size:12px; color:#667085; font-weight:800;">Batch Coordinator</label>
                <select id="batchSetupCoordinator" class="form-control" style="margin-top:6px;"></select>
              </div>
            </div>

            <div style="border-top:1px solid #eaecf0; padding-top:12px;">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
                <h3 style="margin:0;">Payment Setup</h3>
              </div>
              <div style="margin-top:10px;">
                <div style="font-weight:900; margin-bottom:6px;">Methods</div>
                <div id="batchSetupMethodsWrap"></div>
                <div style="margin-top:8px;">
                  <button class="btn btn-secondary btn-sm" type="button" id="batchSetupAddMethodBtn"><i class="fas fa-plus"></i> Add method</button>
                </div>
              </div>
              <div style="margin-top:14px; padding:12px; border:1px solid #eaecf0; border-radius:12px; background:#f9fafb;">
                <div style="font-weight:900; margin-bottom:10px;">Registration Fee</div>
                <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
                  <div>
                    <div style="font-size:12px; font-weight:700; margin-bottom:4px;">Registration fee (LKR)</div>
                    <input id="batchSetupRegFeeAmount" type="number" min="0" class="form-control" style="width:180px;" placeholder="e.g. 5000" />
                  </div>
                  <div>
                    <div style="font-size:12px; font-weight:700; margin-bottom:4px;">Due date</div>
                    <input id="batchSetupRegFeeDate" type="date" class="form-control" style="width:180px;" />
                  </div>
                </div>
              </div>
              <div style="margin-top:12px;">
                <div style="font-weight:900; margin-bottom:6px;">Plans</div>
                <div id="batchSetupPlansWrap"></div>
                <div style="margin-top:8px;">
                  <button class="btn btn-secondary btn-sm" type="button" id="batchSetupAddPlanBtn"><i class="fas fa-plus"></i> Add plan</button>
                </div>
              </div>
            </div>

            <div style="border-top:1px solid #eaecf0; padding-top:12px; margin-top:14px;">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
                <h3 style="margin:0;">Demo Sessions</h3>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <div style="display:flex; gap:8px; align-items:center;">
                    <span style="font-size:12px; color:#667085; font-weight:800;">Number of Demo Sessions</span>
                    <input id="batchSetupDemoCountInput" class="form-control" type="number" min="1" value="1" style="width:90px;" />
                  </div>
                  <button class="btn btn-secondary btn-sm" type="button" id="batchSetupAddDemoBtn"><i class="fas fa-plus"></i> Add demo</button>
                </div>
              </div>
              <div id="batchSetupDemoSessions"></div>
            </div>

            <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; margin-top:16px;">
              <button class="btn btn-danger" type="button" id="batchSetupDeleteBtn"><i class="fas fa-trash"></i> Delete Batch</button>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" type="button" onclick="window.closeModal && window.closeModal('batchSetupModal')">Cancel</button>
                <button class="btn btn-primary" type="button" id="batchSetupSaveBtn"><i class="fas fa-save"></i> Save</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function ensureBatchSetupModal() {
    if (qs('batchSetupModal')) return;
    document.body.insertAdjacentHTML('beforeend', buildBatchSetupModalHtml());
  }

  function markBatchSetupDirty() {
    const el = qs('batchSetupModalDirty');
    if (el) el.textContent = 'Unsaved changes';
  }

  function clearBatchSetupDirty() {
    const el = qs('batchSetupModalDirty');
    if (el) el.textContent = '';
  }

  function renderPaymentEditor(state) {
    const mWrap = qs('batchSetupMethodsWrap');
    const pWrap = qs('batchSetupPlansWrap');
    if (!mWrap || !pWrap) return;

    const methods = state.payment.methods || [];
    const plans = state.payment.plans || [];

    mWrap.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
        ${methods.map((m, idx) => `
          <span style="display:inline-flex; gap:8px; align-items:center; padding:6px 10px; border:1px solid #eaecf0; border-radius:999px; background:#fff;">
            <input class="form-control" data-m="1" data-i="${idx}" value="${escapeHtml(m.method_name)}" style="width:160px; height:30px;" />
            <button class="btn btn-danger btn-sm" data-del-m="${idx}" type="button">×</button>
          </span>
        `).join('')}
      </div>
    `;

    pWrap.innerHTML = plans.length ? plans.map((p, idx) => {
      const count = Math.max(parseInt(p.installment_count || '1', 10) || 1, 1);
      const due = Array.isArray(p.due_dates) ? p.due_dates : [];

      const dueInputs = count > 1
        ? Array.from({ length: count }, (_, k) => {
            const v = due[k] || '';
            return `<input class="form-control" data-due="1" data-pi="${idx}" data-di="${k}" type="date" value="${escapeHtml(v)}" style="width:160px;" />`;
          }).join('')
        : '<span style="color:#98a2b3; font-size:12px;">No due dates for single-payment plans</span>';

      return `
        <div data-plan-card="${idx}" style="padding:12px; border:1px solid ${p.earlyBird ? '#bbf7d0' : '#eaecf0'}; border-radius:14px; background:#fff; margin-top:10px;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
              <input class="form-control" data-plan="name" data-pi="${idx}" value="${escapeHtml(p.plan_name)}" placeholder="Plan name" style="width:200px;" />
              <input class="form-control" data-plan="count" data-pi="${idx}" type="number" min="1" value="${escapeHtml(count)}" style="width:100px;" />
              <span style="color:#667085; font-size:12px; font-weight:800;">Installments</span>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none; margin:0;">
                <span style="font-size:12px; font-weight:700; color:#344054;">Early Bird</span>
                <div style="position:relative; width:40px; height:22px;">
                  <input type="checkbox" class="prog-plan-eb" data-pi="${idx}" style="opacity:0; width:0; height:0; position:absolute;" ${p.earlyBird ? 'checked' : ''} />
                  <div class="prog-plan-eb-track" data-pi="${idx}" style="position:absolute; inset:0; border-radius:22px; background:${p.earlyBird ? '#592c88' : '#d0d5dd'}; transition:background 0.2s; pointer-events:none;"></div>
                  <div class="prog-plan-eb-thumb" data-pi="${idx}" style="position:absolute; top:2px; left:${p.earlyBird ? '20px' : '2px'}; width:18px; height:18px; border-radius:50%; background:#fff; transition:left 0.2s; box-shadow:0 1px 3px rgba(0,0,0,.2); pointer-events:none;"></div>
                </div>
                <span class="prog-plan-eb-label" data-pi="${idx}" style="font-size:12px; font-weight:700; color:${p.earlyBird ? '#592c88' : '#667085'};">${p.earlyBird ? 'ON' : 'OFF'}</span>
              </label>
            </div>
            <button class="btn btn-danger btn-sm" data-del-p="${idx}" type="button">Remove</button>
          </div>
          <div style="margin-top:10px;">
            <div style="font-size:12px; color:#667085; font-weight:800; margin-bottom:6px;">Due dates</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${dueInputs}
            </div>
          </div>
          <div class="prog-reg-fee-row" data-pi="${idx}" style="margin-top:10px; display:${p.earlyBird ? 'none' : ''}; padding:10px 12px; background:#fffaeb; border:1px solid #fedf89; border-radius:10px;">
            <div style="font-size:12px; color:#b54708; font-weight:700; margin-bottom:6px;"><i class="fas fa-file-invoice"></i> Registration fee — required before plan payments</div>
            <div class="form-group" style="margin:0;">
              <label style="font-size:12px; color:#344054; font-weight:600;">Amount (LKR)</label>
              <input class="form-control prog-plan-reg-fee" data-pi="${idx}" type="number" min="0" value="${escapeHtml(String(p.registration_fee || ''))}" placeholder="e.g. 5000" style="width:200px;" />
            </div>
          </div>
        </div>
      `;
    }).join('') : '<div style="color:#98a2b3;">No plans set</div>';

    // bind methods
    mWrap.querySelectorAll('input[data-m]').forEach(inp => {
      inp.oninput = () => {
        const i = Number(inp.getAttribute('data-i'));
        state.payment.methods[i].method_name = inp.value;
        markBatchSetupDirty();
      };
    });
    mWrap.querySelectorAll('button[data-del-m]').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute('data-del-m'));
        state.payment.methods.splice(i, 1);
        renderPaymentEditor(state);
        markBatchSetupDirty();
      };
    });

    // bind plans
    pWrap.querySelectorAll('input[data-plan]').forEach(inp => {
      inp.oninput = () => {
        const pi = Number(inp.getAttribute('data-pi'));
        const k = inp.getAttribute('data-plan');
        if (k === 'count') {
          const n = Math.max(parseInt(inp.value || '1', 10) || 1, 1);
          state.payment.plans[pi].installment_count = n;
          state.payment.plans[pi].due_dates = state.payment.plans[pi].due_dates || [];
          state.payment.plans[pi].due_dates.length = n;
          renderPaymentEditor(state);
        } else {
          state.payment.plans[pi].plan_name = inp.value;
        }
        markBatchSetupDirty();
      };
    });
    pWrap.querySelectorAll('input[data-due]').forEach(inp => {
      inp.oninput = () => {
        const pi = Number(inp.getAttribute('data-pi'));
        const di = Number(inp.getAttribute('data-di'));
        state.payment.plans[pi].due_dates = state.payment.plans[pi].due_dates || [];
        state.payment.plans[pi].due_dates[di] = inp.value;
        markBatchSetupDirty();
      };
    });
    pWrap.querySelectorAll('button[data-del-p]').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute('data-del-p'));
        state.payment.plans.splice(i, 1);
        renderPaymentEditor(state);
        markBatchSetupDirty();
      };
    });

    pWrap.querySelectorAll('.prog-plan-reg-fee').forEach(inp => {
      inp.oninput = () => {
        const pi = Number(inp.getAttribute('data-pi'));
        state.payment.plans[pi].registration_fee = inp.value;
        markBatchSetupDirty();
      };
    });

    pWrap.querySelectorAll('.prog-plan-eb').forEach(inp => {
      inp.onchange = () => {
        const pi = Number(inp.getAttribute('data-pi'));
        state.payment.plans[pi].earlyBird = inp.checked;
        const track = pWrap.querySelector(`.prog-plan-eb-track[data-pi="${pi}"]`);
        const thumb = pWrap.querySelector(`.prog-plan-eb-thumb[data-pi="${pi}"]`);
        const label = pWrap.querySelector(`.prog-plan-eb-label[data-pi="${pi}"]`);
        const card = pWrap.querySelector(`[data-plan-card="${pi}"]`);
        if (track) track.style.background = inp.checked ? '#592c88' : '#d0d5dd';
        if (thumb) thumb.style.left = inp.checked ? '20px' : '2px';
        if (label) { label.textContent = inp.checked ? 'ON' : 'OFF'; label.style.color = inp.checked ? '#592c88' : '#667085'; }
        if (card) card.style.borderColor = inp.checked ? '#bbf7d0' : '#eaecf0';
        const regFeeCard = pWrap.querySelector(`.prog-reg-fee-row[data-pi="${pi}"]`);
        if (regFeeCard) regFeeCard.style.display = inp.checked ? 'none' : '';
        markBatchSetupDirty();
      };
    });
  }

  function renderDemoEditor(state) {
    const wrap = qs('batchSetupDemoSessions');
    if (!wrap) return;

    const sessions = state.demo.sessionsList || [];
    if (!sessions.length) {
      wrap.innerHTML = '<div style="color:#98a2b3;">No demo sessions added</div>';
      return;
    }

    wrap.innerHTML = sessions.map((s, idx) => {
      const dt = s.scheduled_at ? new Date(s.scheduled_at) : null;
      const local = dt ? new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      return `
        <div style="padding:12px; border:1px solid #eaecf0; border-radius:14px; background:#fff; margin-top:10px;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="font-weight:900; color:#101828;">Demo ${escapeHtml(s.demo_number)}</div>
            <button class="btn btn-danger btn-sm" type="button" data-demo-del="${idx}">Remove</button>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 220px 1fr; gap:10px; margin-top:10px; align-items:end;">
            <div>
              <div style="font-size:12px; color:#667085; font-weight:800; margin-bottom:6px;">Title</div>
              <input class="form-control" data-demo-k="title" data-demo-i="${idx}" value="${escapeHtml(s.title || '')}" />
            </div>
            <div>
              <div style="font-size:12px; color:#667085; font-weight:800; margin-bottom:6px;">Date/time</div>
              <input class="form-control" data-demo-k="scheduled_at" data-demo-i="${idx}" type="datetime-local" value="${escapeHtml(local)}" />
            </div>
            <div>
              <div style="font-size:12px; color:#667085; font-weight:800; margin-bottom:6px;">Notes</div>
              <input class="form-control" data-demo-k="notes" data-demo-i="${idx}" value="${escapeHtml(s.notes || '')}" />
            </div>
          </div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('input[data-demo-k]').forEach(inp => {
      inp.oninput = () => {
        const i = Number(inp.getAttribute('data-demo-i'));
        const k = inp.getAttribute('data-demo-k');
        const s = state.demo.sessionsList[i];
        if (!s) return;
        if (k === 'scheduled_at') {
          s.scheduled_at = inp.value ? new Date(inp.value).toISOString() : null;
        } else {
          s[k] = inp.value;
        }
        markBatchSetupDirty();
      };
    });

    wrap.querySelectorAll('button[data-demo-del]').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute('data-demo-del'));
        state.demo.sessionsList.splice(i, 1);
        // re-number sequentially
        state.demo.sessionsList.forEach((x, j) => { x.demo_number = j + 1; if (!x.title) x.title = `Demo ${j + 1}`; });
        const cnt = qs('batchSetupDemoCountInput');
        if (cnt) cnt.value = String(state.demo.sessionsList.length || 1);
        renderDemoEditor(state);
        markBatchSetupDirty();
      };
    });
  }

  async function openBatchSetupModal({ programId, batchId, batchName }) {
    console.log('openBatchSetupModal called', { programId, batchId, batchName });
    ensureBatchSetupModal();
    clearBatchSetupDirty();

    qs('batchSetupModalTitle').textContent = `Batch Setup — ${batchName}`;
    qs('batchSetupModalMeta').textContent = `Program: ${programId}`;

    // Open immediately with loading placeholders
    qs('batchSetupMethodsWrap').innerHTML = '<div style="color:#667085;">Loading…</div>';
    qs('batchSetupPlansWrap').innerHTML = '';
    qs('batchSetupDemoSessions').innerHTML = '';
    if (window.openModal) window.openModal('batchSetupModal');
    else {
      const m = qs('batchSetupModal');
      if (m) m.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    const state = {
      meta: { programId, batchId, batchName },
      general: { isCurrent: false, coordinatorUserId: '', demoSessionsCount: 1 },
      payment: { methods: [], plans: [], reg_fee_amount: '', reg_fee_date: '' },
      demo: { sessionsList: [] }
    };

    // Load batch setup (general + demo)
    try {
      const data = await apiGet(`/api/batch-setup?programId=${encodeURIComponent(programId)}&batchId=${encodeURIComponent(batchId)}&batchName=${encodeURIComponent(batchName)}`);
      const pb = data.programBatch || {};
      state.general.isCurrent = !!pb.is_current;
      state.general.coordinatorUserId = pb.coordinator_user_id || '';
      state.general.demoSessionsCount = Number(pb.demo_sessions_count || 1);

      // Build demo sessions list (card-style)
      state.demo.sessionsList = (data.demoSessions || [])
        .slice()
        .sort((a, b) => Number(a.demo_number) - Number(b.demo_number))
        .map(s => ({
          demo_number: Number(s.demo_number),
          title: s.title || `Demo ${s.demo_number}`,
          scheduled_at: s.scheduled_at || null,
          notes: s.notes || ''
        }));

      // Keep count in sync
      state.general.demoSessionsCount = state.demo.sessionsList.length || 1;
    } catch (e) {
      // If columns don't exist yet, still allow payment setup, but inform
      console.warn('Batch setup load failed:', e);
    }

    // Load payment setup (best effort)
    try {
      const pay = await apiGet(`/api/payment-setup/batches/${encodeURIComponent(batchName)}`);
      state.payment.methods = (pay.methods || []).map(m => ({ method_name: m.method_name }));
      state.payment.reg_fee_amount = pay.reg_fee_amount || '';
      state.payment.reg_fee_date = pay.reg_fee_date || '';
      const inst = pay.installments || [];
      state.payment.plans = (pay.plans || []).map(p => ({
        plan_name: p.plan_name,
        installment_count: p.installment_count,
        due_dates: inst.filter(x => x.plan_id === p.id).sort((a,b)=>Number(a.installment_no)-Number(b.installment_no)).map(x => x.due_date),
        plan_type: p.plan_type || '',
        registration_fee: p.registration_fee || '',
        course_fee: p.course_fee || '',
        earlyBird: !!(p.early_bird)
      }));
    } catch (e) {
      console.warn('Payment setup load failed:', e);
      if (window.UI?.showToast) UI.showToast('Failed to load payment setup', 'error');
      state.payment.methods = [];
      state.payment.plans = [];
    }

    // Officers list (best effort)
    let officers = [];
    try {
      const officersRes = await apiGet('/api/batches/officers');
      officers = officersRes.officers || [];
    } catch (e) {
      console.warn('Officers load failed:', e);
    }
    const coordSel = qs('batchSetupCoordinator');
    coordSel.innerHTML = `<option value="">(Not set)</option>` + officers.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('');

    // Bind general
    const curBtn = qs('batchSetupCurrentBtn');
    const renderCurBtn = () => {
      if (!curBtn) return;
      if (state.general.isCurrent) {
        curBtn.disabled = true;
        curBtn.classList.remove('btn-primary');
        curBtn.classList.add('btn-secondary');
        curBtn.innerHTML = '<i class="fas fa-check"></i> Current';
      } else {
        curBtn.disabled = false;
        curBtn.classList.remove('btn-secondary');
        curBtn.classList.add('btn-primary');
        curBtn.innerHTML = '<i class="fas fa-star"></i> Set as current';
      }
    };
    renderCurBtn();
    if (curBtn) {
      curBtn.onclick = async () => {
        if (state.general.isCurrent) return;
        const ok = confirm('Set this batch as CURRENT? This will unset current status for other batches in this program.');
        if (!ok) return;
        state.general.isCurrent = true;
        markBatchSetupDirty();
        renderCurBtn();
      };
    }

    coordSel.value = state.general.coordinatorUserId || '';
    coordSel.onchange = () => { state.general.coordinatorUserId = coordSel.value; markBatchSetupDirty(); };

    const demoCount = qs('batchSetupDemoCountInput');
    const addDemoBtn = qs('batchSetupAddDemoBtn');

    // Ensure at least 1 demo exists in UI
    if (!state.demo.sessionsList || !state.demo.sessionsList.length) {
      state.demo.sessionsList = [{ demo_number: 1, title: 'Demo 1', scheduled_at: null, notes: '' }];
    }

    if (demoCount) {
      demoCount.value = String(state.demo.sessionsList.length || 1);
      demoCount.oninput = () => {
        const target = Math.max(parseInt(demoCount.value || '1', 10) || 1, 1);
        // Grow list
        while (state.demo.sessionsList.length < target) {
          const n = state.demo.sessionsList.length + 1;
          state.demo.sessionsList.push({ demo_number: n, title: `Demo ${n}`, scheduled_at: null, notes: '' });
        }
        // Shrink list
        while (state.demo.sessionsList.length > target) {
          state.demo.sessionsList.pop();
        }
        // Re-number
        state.demo.sessionsList.forEach((x, i) => { x.demo_number = i + 1; if (!x.title) x.title = `Demo ${i + 1}`; });
        renderDemoEditor(state);
        markBatchSetupDirty();
      };
    }

    if (addDemoBtn) {
      addDemoBtn.onclick = () => {
        const n = (state.demo.sessionsList.length || 0) + 1;
        state.demo.sessionsList.push({ demo_number: n, title: `Demo ${n}`, scheduled_at: null, notes: '' });
        if (demoCount) demoCount.value = String(state.demo.sessionsList.length);
        renderDemoEditor(state);
        markBatchSetupDirty();
      };
    }

    // bind payment add
    qs('batchSetupAddMethodBtn').onclick = () => {
      state.payment.methods.push({ method_name: '' });
      renderPaymentEditor(state);
      markBatchSetupDirty();
    };
    qs('batchSetupAddPlanBtn').onclick = () => {
      state.payment.plans.push({ plan_name: '', installment_count: 1, due_dates: [], plan_type: '', registration_fee: '', course_fee: '' });
      renderPaymentEditor(state);
      markBatchSetupDirty();
    };

    // Delete
    qs('batchSetupDeleteBtn').onclick = async () => {
      if (!confirm('Delete this batch? This will delete Supabase leads for this batch and unlink the Google Sheet mapping.')) return;
      try {
        await deleteBatch(programId, batchId);
        if (window.Cache) window.Cache.invalidatePrefix('programs:');
        closeModal('batchSetupModal');
        if (window.UI?.showToast) UI.showToast('Batch deleted', 'success');
        await load();
      } catch (e) {
        if (window.UI?.showToast) UI.showToast(e.message, 'error');
      }
    };

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
              due_dates: Array.isArray(p.due_dates) ? p.due_dates.map(x => String(x || '').trim()).filter(Boolean) : [],
              plan_type: p.plan_type || '',
              registration_fee: Number.isFinite(Number(p.registration_fee)) ? Number(p.registration_fee) : 0,
              course_fee: Number.isFinite(Number(p.course_fee)) ? Number(p.course_fee) : 0,
              earlyBird: !!p.earlyBird
            }))
            .filter(p => p.plan_name),
          reg_fee_amount: Number.isFinite(Number(state.payment.reg_fee_amount)) ? Number(state.payment.reg_fee_amount) : 0,
          reg_fee_date: state.payment.reg_fee_date || null
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
          // clear any in-memory batch dropdown caches
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

    renderPaymentEditor(state);
    renderDemoEditor(state);

    // Bind reg fee inputs
    const regFeeAmt = qs('batchSetupRegFeeAmount');
    const regFeeDate = qs('batchSetupRegFeeDate');
    if (regFeeAmt) { regFeeAmt.value = state.payment.reg_fee_amount || ''; regFeeAmt.oninput = () => { state.payment.reg_fee_amount = regFeeAmt.value; markBatchSetupDirty(); }; }
    if (regFeeDate) { regFeeDate.value = state.payment.reg_fee_date || ''; regFeeDate.onchange = () => { state.payment.reg_fee_date = regFeeDate.value; markBatchSetupDirty(); }; }

    // Modal already open
  }

  window.openBatchSetupModal = openBatchSetupModal;

  function render({ programs, batches, _officers }) {
    const wrap = qs('programsList');
    if (!wrap) return;

    const officerNameById = new Map((_officers || []).map(o => [String(o.id), String(o.name)]));

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
            <table class="data-table" style="min-width:620px;">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Current</th>
                  <th>Created</th>
                  <th>Batch Coordinator</th>
                </tr>
              </thead>
              <tbody>
                ${(bs.length ? bs : [{ id: '', batch_name: '', is_current: false, created_at: '' }]).map(b => {
                  if (!b.id) {
                    return `<tr><td colspan="4" class="loading">No batches yet</td></tr>`;
                  }

                  const coordId = b.coordinator_user_id || b.coordinatorUserId || '';
                  const coordName = coordId ? (officerNameById.get(String(coordId)) || '') : '';

                  return `
                    <tr>
                      <td>
                        <a href="#" data-action="edit-batch-setup" data-program-id="${escapeHtml(p.id)}" data-batch-id="${escapeHtml(b.id)}" data-batch-name="${escapeHtml(b.batch_name)}" style="color:#175CD3; text-decoration:none; font-weight:600;">${escapeHtml(b.batch_name)}</a>
                      </td>
                      <td>${b.is_current ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Yes</span>' : '-'}</td>
                      <td>${escapeHtml(new Date(b.created_at).toLocaleString())}</td>
                      <td>${coordName ? escapeHtml(coordName) : '<span style="color:#98a2b3;">-</span>'}</td>
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

    // Batch setup open (event delegation; robust across re-renders)
    if (!wrap.__batchSetupDelegationBound) {
      wrap.__batchSetupDelegationBound = true;
      wrap.addEventListener('click', async (e) => {
        // Very defensive closest() replacement
        let el = e.target;
        let a = null;
        while (el && el !== wrap) {
          if (el.matches && el.matches('a[data-action="edit-batch-setup"]')) { a = el; break; }
          el = el.parentElement;
        }
        if (!a) return;
        e.preventDefault();

        const batchName = a.getAttribute('data-batch-name');
        const programId = a.getAttribute('data-program-id');
        const batchId = a.getAttribute('data-batch-id');

        if (!window.openBatchSetupModal) {
          console.warn('openBatchSetupModal not available');
          return;
        }

        await window.openBatchSetupModal({ programId, batchId, batchName });
      });
    }

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
    if (list && showSkeleton) {
      list.innerHTML = `
        <div class="programs-skel">
          ${Array.from({ length: 6 }).map(() => `<div class="table-skel-line" style="height:14px; width:${40 + Math.floor(Math.random()*40)}%; margin:10px 0;"></div>`).join('')}
        </div>
      `;
    }

    try {
      const data = await fetchPrograms();

      // Load officers list (for Batch Coordinator display). Best-effort.
      try {
        const officersRes = await apiGet('/api/batches/officers');
        data._officers = officersRes.officers || [];
      } catch (e) {
        data._officers = [];
      }

      if (window.Cache) window.Cache.setWithTs(cacheKey, data);
      render(data);
    } catch (e) {
      console.error(e);
      if (list && showSkeleton) {
        list.innerHTML = `<p class="empty">${escapeHtml(e.message || 'Failed to load programs')}</p>`;
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

      // 1) Create program batch first (so UI can proceed even if sheet linking fails)
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
          // Defer to next tick so the create modal is fully closed
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

  // Debug helper
  window.testBatchSetupModal = async () => {
    console.log('testBatchSetupModal called');
    if (!window.openBatchSetupModal) {
      console.warn('openBatchSetupModal missing');
      return;
    }
    // dummy values; will likely error but should open modal
    await window.openBatchSetupModal({ programId: 'TEST', batchId: 'TEST', batchName: 'TEST' });
  };

  console.log('[programsPage] loaded');
})();
