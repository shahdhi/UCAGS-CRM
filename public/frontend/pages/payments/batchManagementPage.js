// Officer Batch Management (Batch Coordinator)

(function () {
  function qs(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString();
  }

  function computeRowStatus(p) {
    const s = String(p.computed_status || '').toLowerCase();
    if (s) return s;
    return p.is_confirmed ? 'completed' : 'due';
  }

  let state = {
    batches: [],
    selectedBatchName: '',
    selectedProgramId: '',
    selectedStatus: 'all',
    selectedType: '',
    search: '',
    limit: 200,
    lastSummary: []
  };

  async function loadCoordinatorBatches() {
    const j = await window.API.payments.coordinatorBatches();
    state.batches = j.batches || [];
    return state.batches;
  }

  function getProgramsFromBatches(batches) {
    const map = new Map();
    (batches || []).forEach(b => {
      const pid = String(b.program_id || '').trim();
      if (!pid) return;
      if (!map.has(pid)) {
        map.set(pid, {
          id: pid,
          name: b.program_name || pid,
          created_at: b.program_created_at || b.created_at || null
        });
      }
    });
    return Array.from(map.values());
  }

  function pickLatestProgram(programs) {
    const arr = (programs || []).slice();
    arr.sort((a, b) => {
      const ad = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b?.created_at ? new Date(b.created_at).getTime() : 0;
      if (bd !== ad) return bd - ad;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
    return arr[0] || null;
  }

  function getBatchesForSelectedProgram() {
    const pid = String(state.selectedProgramId || '').trim();
    const arr = (state.batches || []).filter(b => String(b.program_id) === pid);
    // latest first
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return arr;
  }

  function pickDefaultProgramAndBatch() {
    const batches = state.batches || [];
    if (!batches.length) return;

    const programs = getProgramsFromBatches(batches);
    if (!state.selectedProgramId) {
      const latest = pickLatestProgram(programs);
      state.selectedProgramId = latest?.id || programs[0]?.id || '';
    }

    const batchesFor = getBatchesForSelectedProgram();
    const current = batchesFor.find(b => b.is_current);
    const chosen = current || batchesFor[0] || batches[0];
    state.selectedBatchName = chosen?.batch_name || '';
  }

  function renderProgramSelect() {
    const sel = qs('batchMgmtProgramSelect');
    if (!sel) return;

    const programs = getProgramsFromBatches(state.batches);
    sel.innerHTML = programs.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`).join('');

    if (!state.selectedProgramId) {
      const latest = pickLatestProgram(programs);
      state.selectedProgramId = latest?.id || programs[0]?.id || '';
    }
    sel.value = state.selectedProgramId;

    sel.onchange = async () => {
      state.selectedProgramId = sel.value;
      pickDefaultProgramAndBatch();
      renderBatchSelect();
      await loadPayments();
    };
  }

  function renderBatchSelect() {
    const sel = qs('batchMgmtBatchSelect');
    if (!sel) return;

    const batchesFor = getBatchesForSelectedProgram();
    sel.innerHTML = batchesFor.map(b => {
      const label = `${b.batch_name}${b.is_current ? ' (Current)' : ''}`;
      return `<option value="${escapeHtml(b.batch_name)}">${escapeHtml(label)}</option>`;
    }).join('');

    sel.value = state.selectedBatchName;

    sel.onchange = async () => {
      state.selectedBatchName = sel.value;
      await loadPayments();
    };
  }

  function renderStatusTabs() {
    const wrap = qs('batchMgmtStatusTabs');
    if (!wrap) return;

    const tabs = [
      { key: 'all', label: 'All' },
      { key: 'overdue', label: 'Overdue' },
      { key: 'due', label: 'Due' },
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'completed', label: 'Completed' }
    ];

    wrap.innerHTML = tabs.map(t => {
      const active = t.key === state.selectedStatus ? 'btn-primary' : 'btn-secondary';
      return `<button type="button" class="btn ${active} btn-sm" data-status="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>`;
    }).join('');

    wrap.querySelectorAll('button[data-status]').forEach(btn => {
      btn.onclick = async () => {
        state.selectedStatus = btn.getAttribute('data-status');
        renderStatusTabs();
        await loadPayments();
      };
    });
  }

  function renderRows(rows) {
    const tbody = qs('batchMgmtTableBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty">No payments found</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(p => {
      const status = computeRowStatus(p);
      const statusBadge = `<span class="badge" style="background:#f2f4f7; border:1px solid #eaecf0; color:#344054;">${escapeHtml(status)}</span>`;
      const receipt = p.receipt_no ? `<span style="font-weight:800;">${escapeHtml(p.receipt_no)}</span>` : '<span style="color:#98a2b3;">-</span>';
      const confirmed = p.is_confirmed ? '<span style="color:#027a48; font-weight:800;">Confirmed</span>' : '<span style="color:#b42318; font-weight:800;">Not confirmed</span>';

      return `
        <tr data-id="${escapeHtml(p.id)}" data-reg-id="${escapeHtml(p.registration_id)}" data-reg-name="${escapeHtml(p.registration_name || '')}">
          <td>
            <a href="#" class="batchMgmtOpenDetails" style="color:#175CD3; text-decoration:none; font-weight:700;">${escapeHtml(p.registration_name || '-')}</a>
            <div style="font-size:12px; color:#667085;">${escapeHtml(p.registration_phone_number || '')}</div>
          </td>
          <td>${statusBadge}</td>
          <td>${escapeHtml(p.installment_no ? `#${p.installment_no}` : '')}</td>
          <td style="text-align:center;"><input type="checkbox" class="pay-email" ${p.email_sent ? 'checked' : ''} /></td>
          <td style="text-align:center;"><input type="checkbox" class="pay-wa" ${p.whatsapp_sent ? 'checked' : ''} /></td>
          <td>
            <select class="pay-method form-control" style="min-width:160px;">
              ${['', 'Online Transfer', 'Bank Deposit'].map(m => `<option value="${escapeHtml(m)}" ${m=== (p.payment_method||'') ? 'selected' : ''}>${escapeHtml(m||'Select')}</option>`).join('')}
            </select>
          </td>
          <td>
            <select class="pay-plan form-control" style="min-width:220px;">
              ${['', 'Installment', 'Installment with early bird', 'Full payment', 'Full payment with early bird', 'registration fee only']
                .map(m => `<option value="${escapeHtml(m)}" ${m=== (p.payment_plan||'') ? 'selected' : ''}>${escapeHtml(m||'Select')}</option>`).join('')}
            </select>
          </td>
          <td><input type="number" class="form-control pay-amount" value="${escapeHtml(p.amount ?? '')}" style="width:120px;" /></td>
          <td><input type="date" class="form-control pay-date" value="${escapeHtml(p.payment_date || '')}" style="width:160px;" /></td>
          <td style="text-align:center;"><input type="checkbox" class="pay-slip" ${p.slip_received ? 'checked' : ''} /></td>
          <td style="text-align:center;">${confirmed}</td>
          <td>${receipt}</td>
        </tr>
      `;
    }).join('');

    // bind patch updates
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.getAttribute('data-id');
      let t = null;
      const patch = async () => {
        const payload = {
          email_sent: tr.querySelector('.pay-email')?.checked,
          whatsapp_sent: tr.querySelector('.pay-wa')?.checked,
          payment_method: tr.querySelector('.pay-method')?.value,
          payment_plan: tr.querySelector('.pay-plan')?.value,
          amount: Number(tr.querySelector('.pay-amount')?.value),
          payment_date: tr.querySelector('.pay-date')?.value || null,
          slip_received: tr.querySelector('.pay-slip')?.checked
        };
        await window.API.payments.coordinatorUpdate(id, payload);
      };
      const debounce = () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => patch().catch(console.error), 600);
      };
      tr.querySelectorAll('input,select').forEach(el => {
        el.addEventListener('change', debounce);
        el.addEventListener('input', debounce);
      });
    });

    // details modal
    tbody.querySelectorAll('.batchMgmtOpenDetails').forEach(a => {
      a.onclick = async (e) => {
        e.preventDefault();
        const tr = a.closest('tr');
        const regId = tr?.getAttribute('data-reg-id');
        const regName = tr?.getAttribute('data-reg-name');
        if (!regId) return;

        // Use same modal but coordinator list endpoint and without confirm button
        const body = qs('paymentDetailsModalBody');
        if (body) body.innerHTML = '<p class="loading">Loading payment history...</p>';
        openModal('paymentDetailsModal');

        const res = await window.API.payments.coordinatorListForRegistration(regId);
        const rows = res.payments || [];
        if (!rows.length) {
          if (body) body.innerHTML = '<p class="empty">No payments found</p>';
          return;
        }

        if (body) {
          body.innerHTML = `
            <div style="margin-bottom:10px; color:#475467;">
              <div style="font-weight:700; color:#101828;">${escapeHtml(regName || '')}</div>
              <div style="font-size:12px; color:#667085; margin-top:6px;">Confirmed payments show receipt number. Only Admin can confirm.</div>
            </div>
            <div style="overflow-x:auto; width:100%;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Slip</th>
                    <th>Email</th>
                    <th>Whatsapp</th>
                    <th>Method</th>
                    <th>Receipt No</th>
                    <th>Confirmed</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(p => {
                    const instLabel = p.installment_no ? `Installment ${Number(p.installment_no)}` : '';
                    return `
                      <tr data-id="${escapeHtml(p.id)}">
                        <td>
                          <select class="pay-plan form-control" style="min-width:220px;">
                            ${['', 'Installment', 'Installment with early bird', 'Full payment', 'Full payment with early bird', 'registration fee only']
                              .map(m => `<option value="${escapeHtml(m)}" ${m=== (p.payment_plan||'') ? 'selected' : ''}>${escapeHtml(m||'Select')}</option>`).join('')}
                          </select>
                          <div style="font-size:12px; color:#667085; margin-top:4px;">${escapeHtml(instLabel)}</div>
                        </td>
                        <td><input type="number" class="form-control pay-amount" value="${escapeHtml(p.amount ?? '')}" style="width:120px;" /></td>
                        <td><input type="date" class="form-control pay-date" value="${escapeHtml(p.payment_date || '')}" style="width:160px;" /></td>
                        <td><input type="checkbox" class="pay-slip" ${p.slip_received ? 'checked' : ''} /></td>
                        <td><input type="checkbox" class="pay-email" ${p.email_sent ? 'checked' : ''} /></td>
                        <td><input type="checkbox" class="pay-wa" ${p.whatsapp_sent ? 'checked' : ''} /></td>
                        <td>
                          <select class="pay-method form-control" style="min-width:160px;">
                            ${['', 'Online Transfer', 'Bank Deposit'].map(m => `<option value="${escapeHtml(m)}" ${m=== (p.payment_method||'') ? 'selected' : ''}>${escapeHtml(m||'Select')}</option>`).join('')}
                          </select>
                        </td>
                        <td>${p.receipt_no ? `<span style=\"font-weight:800;\">${escapeHtml(p.receipt_no)}</span>` : '<span style="color:#98a2b3;">-</span>'}</td>
                        <td>${p.is_confirmed ? '<span style="color:#027a48; font-weight:800;">Confirmed</span>' : '<span style="color:#b42318; font-weight:800;">Not confirmed</span>'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;

          body.querySelectorAll('tr[data-id]').forEach(tr => {
            const pid = tr.getAttribute('data-id');
            let t = null;
            const patch = async () => {
              const payload = {
                email_sent: tr.querySelector('.pay-email')?.checked,
                whatsapp_sent: tr.querySelector('.pay-wa')?.checked,
                payment_method: tr.querySelector('.pay-method')?.value,
                payment_plan: tr.querySelector('.pay-plan')?.value,
                amount: Number(tr.querySelector('.pay-amount')?.value),
                payment_date: tr.querySelector('.pay-date')?.value || null,
                slip_received: tr.querySelector('.pay-slip')?.checked
              };
              await window.API.payments.coordinatorUpdate(pid, payload);
            };
            const debounce = () => {
              if (t) clearTimeout(t);
              t = setTimeout(() => patch().catch(console.error), 600);
            };
            tr.querySelectorAll('input,select').forEach(el => {
              el.addEventListener('change', debounce);
              el.addEventListener('input', debounce);
            });
          });
        }
      };
    });
  }

  function filterRows(rows) {
    const term = String(state.search || '').trim().toLowerCase();
    if (!term) return rows || [];
    return (rows || []).filter(r => {
      const hay = [
        r.name,
        r.email,
        r.phone,
        r.receipt_no,
        r.payment_method,
        r.payment_plan,
        r.installment_type,
        r.installment_label,
        r.notes
      ]
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();
      return hay.includes(term);
    });
  }

  async function loadPayments() {
    const tbody = qs('batchMgmtTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="loading">Loading payments...</td></tr>`;

    if (!state.selectedProgramId || !state.selectedBatchName) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="empty">Select a program and batch</td></tr>`;
      return;
    }

    const res = await window.API.payments.coordinatorSummary(state.limit, {
      programId: state.selectedProgramId,
      batchName: state.selectedBatchName,
      status: state.selectedStatus,
      type: state.selectedType
    });

    const rows = res.payments || [];
    state.lastSummary = rows;
    // store for modal usage if needed
    window.__paymentsLastSummary = rows;

    renderRows(filterRows(rows));
  }

  async function initBatchManagementPage() {
    // Officers only
    if (!window.currentUser || window.currentUser.role === 'admin') return;

    const view = qs('batchManagementView');
    if (!view) return;

    await loadCoordinatorBatches();
    pickDefaultProgramAndBatch();
    renderProgramSelect();
    renderBatchSelect();
    renderStatusTabs();

    const refreshBtn = qs('batchMgmtRefreshBtn');
    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.onclick = () => loadPayments().catch(console.error);
    }

    const limitEl = qs('batchMgmtLimit');
    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.onchange = () => {
        state.limit = parseInt(limitEl.value || '200', 10) || 200;
        loadPayments().catch(console.error);
      };
    }

    const typeSel = qs('batchMgmtInstallmentFilter');
    if (typeSel && !typeSel.__bound) {
      typeSel.__bound = true;
      typeSel.onchange = () => {
        state.selectedType = typeSel.value || '';
        // if filtering by installment, show all statuses
        if (state.selectedType) state.selectedStatus = 'all';
        renderStatusTabs();
        loadPayments().catch(console.error);
      };
    }

    const searchEl = qs('batchMgmtSearchInput');
    if (searchEl && !searchEl.__bound) {
      searchEl.__bound = true;
      searchEl.oninput = () => {
        state.search = searchEl.value || '';
        // Filter client-side using the already loaded rows
        renderRows(filterRows(state.lastSummary));
      };
    }

    await loadPayments();
  }

  window.initBatchManagementPage = initBatchManagementPage;
})();
