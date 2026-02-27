// Batch Setup Page (opened from Programs -> Edit batch)
(function () {
  'use strict';

  const qs = (id) => document.getElementById(id);
  const escapeHtml = (s) => {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  };

  async function authHeaders() {
    return await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
  }

  async function apiGet(url) {
    const r = await fetch(url, { headers: await authHeaders() });
    const j = await r.json();
    if (!j?.success) throw new Error(j?.error || 'Request failed');
    return j;
  }

  async function apiPut(url, body) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const j = await r.json();
    if (!j?.success) throw new Error(j?.error || 'Request failed');
    return j;
  }

  async function loadOfficers() {
    const r = await fetch('/api/batches/officers', { headers: await authHeaders() });
    const j = await r.json();
    if (!j?.success) throw new Error(j?.error || 'Failed to load officers');
    return (j.officers || []).map(o => ({ id: o.id, name: o.name }));
  }

  function parseRoute(page) {
    // batch-setup-program-{programId}-batch-{batchId}-name-{batchName}
    const m = page.match(/^batch-setup-program-(.+?)-batch-(.+?)-name-(.+)$/);
    if (!m) return null;
    return {
      programId: decodeURIComponent(m[1]),
      batchId: decodeURIComponent(m[2]),
      batchName: decodeURIComponent(m[3])
    };
  }

  function setTitle(meta) {
    const h = qs('batchSetupTitle');
    const sub = qs('batchSetupSubtitle');
    if (h) h.innerHTML = `<i class=\"fas fa-sliders-h\"></i> Batch Setup — ${escapeHtml(meta.batchName)}`;
    if (sub) sub.textContent = `Program: ${meta.programId}`;
  }

  function renderInstallments(items) {
    const wrap = qs('batchSetupInstallments');
    if (!wrap) return;

    const rows = (items || []).map((it, idx) => {
      return `
        <tr>
          <td><input class="form-control" data-k="title" data-i="${idx}" value="${escapeHtml(it.title || '')}" placeholder="Installment title"/></td>
          <td><input class="form-control" data-k="amount" data-i="${idx}" value="${escapeHtml(it.amount ?? '')}" type="number" step="0.01"/></td>
          <td><input class="form-control" data-k="due_date" data-i="${idx}" value="${escapeHtml(it.due_date || '')}" type="date"/></td>
          <td><input class="form-control" data-k="notes" data-i="${idx}" value="${escapeHtml(it.notes || '')}" placeholder="Notes"/></td>
          <td><button class="btn btn-danger btn-sm" data-act="del" data-i="${idx}">Remove</button></td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <div style="overflow:auto; border:1px solid #eaecf0; border-radius:12px; background:#fff;">
        <table class="data-table" style="min-width:900px;">
          <thead>
            <tr>
              <th>Title</th>
              <th>Amount</th>
              <th>Due date</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="5" style="padding:12px; color:#667085;">No installments</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    // bind
    wrap.querySelectorAll('input[data-k]').forEach(inp => {
      inp.oninput = () => {
        const i = Number(inp.getAttribute('data-i'));
        const k = inp.getAttribute('data-k');
        state.payments.installments[i][k] = inp.value;
        markDirty();
      };
    });
    wrap.querySelectorAll('button[data-act="del"]').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.getAttribute('data-i'));
        state.payments.installments.splice(i, 1);
        renderInstallments(state.payments.installments);
        markDirty();
      };
    });
  }

  function renderDemoSessions(items, count) {
    const wrap = qs('batchSetupDemoSessions');
    if (!wrap) return;

    const rows = [];
    for (let i = 1; i <= count; i++) {
      const s = (items || []).find(x => Number(x.demo_number) === i) || { demo_number: i, title: `Demo ${i}`, scheduled_at: null, notes: '' };
      const dt = s.scheduled_at ? new Date(s.scheduled_at) : null;
      const local = dt ? new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      rows.push(`
        <tr>
          <td style="font-weight:900;">Demo ${i}</td>
          <td><input class="form-control" data-dk="title" data-dn="${i}" value="${escapeHtml(s.title || '')}"/></td>
          <td><input class="form-control" data-dk="scheduled_at" data-dn="${i}" type="datetime-local" value="${escapeHtml(local)}"/></td>
          <td><input class="form-control" data-dk="notes" data-dn="${i}" value="${escapeHtml(s.notes || '')}"/></td>
        </tr>
      `);
    }

    wrap.innerHTML = `
      <div style="overflow:auto; border:1px solid #eaecf0; border-radius:12px; background:#fff;">
        <table class="data-table" style="min-width:900px;">
          <thead>
            <tr>
              <th>Demo</th>
              <th>Title</th>
              <th>Date/time</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:8px; color:#667085; font-size:12px;">Decreasing count will archive extra demo sessions and hide them everywhere.</div>
    `;

    wrap.querySelectorAll('input[data-dk]').forEach(inp => {
      inp.oninput = () => {
        const dn = Number(inp.getAttribute('data-dn'));
        const dk = inp.getAttribute('data-dk');
        state.demo.sessions[dn] = state.demo.sessions[dn] || {};
        if (dk === 'scheduled_at') {
          state.demo.sessions[dn].scheduled_at = inp.value ? new Date(inp.value).toISOString() : null;
        } else {
          state.demo.sessions[dn][dk] = inp.value;
        }
        markDirty();
      };
    });
  }

  let state = {
    meta: null,
    general: { is_current: false, coordinatorUserId: null, demoSessionsCount: 4 },
    payments: { registrationFee: '', fullPaymentAmount: '', currency: 'LKR', installments: [] },
    demo: { demoSessionsCount: 4, sessions: {} },
    dirty: false
  };

  function markDirty() {
    state.dirty = true;
    const el = qs('batchSetupDirty');
    if (el) el.textContent = 'Unsaved changes';
  }

  function clearDirty() {
    state.dirty = false;
    const el = qs('batchSetupDirty');
    if (el) el.textContent = '';
  }

  async function load(meta) {
    state.meta = meta;
    setTitle(meta);

    const data = await apiGet(`/api/batch-setup?programId=${encodeURIComponent(meta.programId)}&batchId=${encodeURIComponent(meta.batchId)}&batchName=${encodeURIComponent(meta.batchName)}`);

    const pb = data.programBatch || {};
    state.general.is_current = !!pb.is_current;
    state.general.coordinatorUserId = pb.coordinator_user_id || '';
    state.general.demoSessionsCount = Number(pb.demo_sessions_count || 4);

    const plan = data.paymentPlan || {};
    state.payments.registrationFee = plan.registration_fee ?? '';
    state.payments.fullPaymentAmount = plan.full_payment_amount ?? '';
    state.payments.currency = plan.currency || 'LKR';
    state.payments.installments = (data.installments || []).map(x => ({
      title: x.title,
      amount: x.amount,
      due_date: x.due_date,
      notes: x.notes,
      sort_order: x.sort_order
    }));

    state.demo.demoSessionsCount = state.general.demoSessionsCount;
    state.demo.sessions = {};
    (data.demoSessions || []).forEach(s => {
      state.demo.sessions[Number(s.demo_number)] = { title: s.title, scheduled_at: s.scheduled_at, notes: s.notes };
    });

    // bind general fields
    const tog = qs('batchSetupIsCurrent');
    if (tog) {
      tog.checked = state.general.is_current;
      tog.onchange = () => { state.general.is_current = tog.checked; markDirty(); };
    }

    const cnt = qs('batchSetupDemoCount');
    if (cnt) {
      cnt.value = String(state.general.demoSessionsCount);
      cnt.onchange = () => {
        const v = Number(cnt.value || 4);
        state.general.demoSessionsCount = v;
        state.demo.demoSessionsCount = v;
        renderDemoSessions(Object.keys(state.demo.sessions).map(k => ({ demo_number: Number(k), ...state.demo.sessions[k] })), v);
        markDirty();
      };
    }

    const regFee = qs('batchSetupRegFee');
    if (regFee) {
      regFee.value = state.payments.registrationFee;
      regFee.oninput = () => { state.payments.registrationFee = regFee.value; markDirty(); };
    }

    const fullAmt = qs('batchSetupFullAmt');
    if (fullAmt) {
      fullAmt.value = state.payments.fullPaymentAmount;
      fullAmt.oninput = () => { state.payments.fullPaymentAmount = fullAmt.value; markDirty(); };
    }

    const cur = qs('batchSetupCurrency');
    if (cur) {
      cur.value = state.payments.currency;
      cur.onchange = () => { state.payments.currency = cur.value; markDirty(); };
    }

    // officers
    const officers = await loadOfficers();
    const sel = qs('batchSetupCoordinator');
    if (sel) {
      sel.innerHTML = `<option value="">(Not set)</option>` + officers.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('');
      sel.value = state.general.coordinatorUserId || '';
      sel.onchange = () => { state.general.coordinatorUserId = sel.value; markDirty(); };
    }

    // render tables
    renderInstallments(state.payments.installments);
    renderDemoSessions(Object.keys(state.demo.sessions).map(k => ({ demo_number: Number(k), ...state.demo.sessions[k] })), state.general.demoSessionsCount);

    clearDirty();
  }

  async function save() {
    const meta = state.meta;
    if (!meta) return;

    const body = {
      programId: meta.programId,
      batchId: meta.batchId,
      batchName: meta.batchName,
      general: {
        isCurrent: state.general.is_current,
        coordinatorUserId: state.general.coordinatorUserId,
        demoSessionsCount: state.general.demoSessionsCount
      },
      payments: {
        registrationFee: state.payments.registrationFee === '' ? null : Number(state.payments.registrationFee),
        fullPaymentAmount: state.payments.fullPaymentAmount === '' ? null : Number(state.payments.fullPaymentAmount),
        currency: state.payments.currency,
        installments: state.payments.installments.map((it, idx) => ({
          title: it.title,
          amount: Number(it.amount || 0),
          dueDate: it.due_date || null,
          notes: it.notes,
          sortOrder: idx
        }))
      },
      demo: {
        demoSessionsCount: state.general.demoSessionsCount,
        sessions: state.demo.sessions
      }
    };

    await apiPut('/api/batch-setup', body);
    clearDirty();
    if (window.UI?.showToast) UI.showToast('Batch setup saved', 'success');
  }

  async function initBatchSetupPage(page) {
    const meta = parseRoute(page || window.location.hash.slice(1));
    if (!meta) return;

    const view = qs('batchSetupView');
    if (!view) return;

    // bind buttons
    const backBtn = qs('batchSetupBackBtn');
    if (backBtn && !backBtn.__bound) {
      backBtn.__bound = true;
      backBtn.onclick = () => {
        window.location.hash = 'programs';
        if (window.navigateToPage) window.navigateToPage('programs');
      };
    }

    const saveBtn = qs('batchSetupSaveBtn');
    if (saveBtn && !saveBtn.__bound) {
      saveBtn.__bound = true;
      saveBtn.onclick = async () => {
        try {
          saveBtn.disabled = true;
          await save();
        } catch (e) {
          if (window.UI?.showToast) UI.showToast(e.message, 'error');
        } finally {
          saveBtn.disabled = false;
        }
      };
    }

    const addIns = qs('batchSetupAddInstallmentBtn');
    if (addIns && !addIns.__bound) {
      addIns.__bound = true;
      addIns.onclick = () => {
        state.payments.installments.push({ title: '', amount: '', due_date: '', notes: '' });
        renderInstallments(state.payments.installments);
        markDirty();
      };
    }

    await load(meta);
  }

  window.initBatchSetupPage = initBatchSetupPage;
})();
