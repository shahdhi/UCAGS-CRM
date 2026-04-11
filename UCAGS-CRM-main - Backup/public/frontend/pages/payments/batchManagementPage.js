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

  function fmtLkr(amount) {
    if (amount === undefined || amount === null || amount === '') return '';
    const n = Number(amount);
    if (!Number.isFinite(n)) return String(amount);
    try {
      const formatted = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 }).format(n);
      return `LKR ${formatted}`;
    } catch (_) {
      return `LKR ${Math.round(n)}`;
    }
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
    selectedInstallmentFilter: '',
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

  function bindStatusDropdown() {
    const sel = qs('batchMgmtStatusSelect');
    if (!sel || sel.__bound) return;
    sel.__bound = true;

    sel.value = state.selectedStatus || 'all';
    sel.addEventListener('change', async () => {
      state.selectedStatus = sel.value || 'all';
      await loadPayments();
    });
  }

  function renderInstallmentTabs() {
    const wrap = qs('batchMgmtInstallmentTabs');
    if (!wrap) return;

    const tabs = [
      { key: '', label: 'All' },
      { key: 'installment_1', label: '1st Installment' },
      { key: 'installment_2', label: '2nd Installment' },
      { key: 'installment_3', label: '3rd Installment' },
      { key: 'installment_4', label: '4th Installment' },
      { key: 'full_payment', label: 'Full payment' }
    ];

    wrap.innerHTML = '';
    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '999px';
      const active = String(t.key) === String(state.selectedInstallmentFilter || '');
      btn.style.border = active ? '1px solid #592c88' : '1px solid #eaecf0';
      btn.style.background = active ? '#f4ebff' : '#fff';
      btn.style.color = active ? '#592c88' : '#344054';
      btn.textContent = t.label;
      btn.onclick = async () => {
        state.selectedInstallmentFilter = t.key;
        renderInstallmentTabs();
        if (state.selectedInstallmentFilter) {
          state.selectedStatus = 'all';
          const statusSel = qs('batchMgmtStatusSelect');
          if (statusSel) statusSel.value = 'all';
        }
        await loadPayments();
      };
      wrap.appendChild(btn);
    });
  }

  function renderRows(rows) {
    const tbody = qs('batchMgmtTableBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No payments found</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(p => {
      const status = computeRowStatus(p);
      const statusBadge = (() => {
        if (status === 'overdue') return '<span class="badge" style="background:#fef3f2; color:#b42318; border:1px solid #fecdca;">Overdue</span>';
        if (status === 'due') return '<span class="badge" style="background:#fffaeb; color:#b54708; border:1px solid #fedf89;">Due</span>';
        if (status === 'upcoming') return '<span class="badge" style="background:#eff8ff; color:#175cd3; border:1px solid #b2ddff;">Upcoming</span>';
        if (status === 'completed') return '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Completed</span>';
        return '<span style="color:#98a2b3;">-</span>';
      })();

      const installmentText = (() => {
        const n = Number(p.installment_no || 0);
        if (!n) return '';
        const ord = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
        const label = status ? (status.charAt(0).toUpperCase() + status.slice(1)) : '';
        return label ? `${ord} installment (${label})` : `${ord} installment`;
      })();

      const confirmed = p.is_confirmed
        ? '<span style="color:#027a48; font-weight:800;">Confirmed</span>'
        : '<span style="color:#b42318; font-weight:800;">Not confirmed</span>';

      const receipt = p.receipt_no
        ? `<a href="#" class="pay-receipt-link" data-payment-id="${escapeHtml(p.id)}" style="color:#175CD3; text-decoration:none; font-weight:700;">${escapeHtml(p.receipt_no)}</a>`
        : '<span style="color:#98a2b3;">-</span>';

      return `
        <tr class="pay-row" data-id="${escapeHtml(p.id)}" data-registration-id="${escapeHtml(p.registration_id || '')}" style="cursor:pointer;">
          <td style="font-weight:600; color:#101828;">${escapeHtml(p.registration_name || '-')}
            <div style="font-size:12px; color:#667085; font-weight:600;">${escapeHtml(p.registration_phone_number || '')}</div>
          </td>
          <td style="color:#475467; font-weight:600;">${escapeHtml(installmentText || '-')}</td>
          <td style="color:#101828; font-weight:600;">${escapeHtml(fmtLkr(p.amount ?? ''))}</td>
          <td style="color:#475467;">${escapeHtml(p.payment_date || '')}</td>
          <td>${statusBadge}</td>
          <td style="text-align:center;">${confirmed}</td>
          <td>${receipt}</td>
        </tr>
      `;
    }).join('');

    // delegate click handling once
    if (!tbody.__delegated) {
      tbody.__delegated = true;

      tbody.addEventListener('click', (e) => {
        const receiptLink = e.target?.closest?.('.pay-receipt-link');
        if (receiptLink) {
          e.preventDefault();
          e.stopPropagation();
          const pid = receiptLink.getAttribute('data-payment-id');
          if (!pid) return;

          (async () => {
            try {
              const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
              const resp = await fetch(`/api/receipts/payment/${encodeURIComponent(pid)}`, { headers: authHeaders, credentials: 'include' });
              if (!resp.ok) {
                const j = await resp.json().catch(() => null);
                throw new Error(j?.error || 'Failed to download receipt');
              }
              const ct = resp.headers.get('content-type') || '';
              if (!ct.toLowerCase().includes('application/pdf')) throw new Error('Download failed (server did not return a PDF).');

              const blob = await resp.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `receipt-${receiptLink.textContent.trim()}.pdf`;
              document.body.appendChild(a);
              a.click();
              URL.revokeObjectURL(url);
              a.remove();
            } catch (err) {
              console.error(err);
              if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to download receipt', 'error');
            }
          })();

          return;
        }

        const trRow = e.target?.closest?.('tr.pay-row');
        if (trRow) {
          const pid = trRow.getAttribute('data-id');
          if (pid && window.openUpdatePaymentModal) {
            window.openUpdatePaymentModal(pid).catch(err => {
              console.error(err);
              if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to open payment', 'error');
            });
          }
        }
      });
    }
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
    if (tbody) {
      const skelRow = () => `
        <tr class="table-skel-row">
          <td><div class="table-skel-line" style="width:60%"></div></td>
          <td><div class="table-skel-line" style="width:50%"></div></td>
          <td><div class="table-skel-line" style="width:35%"></div></td>
          <td><div class="table-skel-line" style="width:35%"></div></td>
          <td><div class="table-skel-line" style="width:30%"></div></td>
          <td><div class="table-skel-line" style="width:25%"></div></td>
          <td><div class="table-skel-line" style="width:40%"></div></td>
        </tr>
      `;
      tbody.innerHTML = Array.from({ length: 8 }).map(skelRow).join('');
    }

    if (!state.selectedProgramId || !state.selectedBatchName) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty">Select a program and batch</td></tr>`;
      return;
    }

    const fetchStatus = (state.selectedStatus === 'due_overdue') ? 'all' : state.selectedStatus;

    const res = await window.API.payments.coordinatorSummary(state.limit, {
      programId: state.selectedProgramId,
      batchName: state.selectedBatchName,
      status: fetchStatus,
      type: state.selectedInstallmentFilter
    });

    let rows = res.payments || [];

    // Support "Due + Overdue" as a UI-only option
    if (state.selectedStatus === 'due_overdue' && !state.selectedInstallmentFilter) {
      rows = rows.filter(r => ['due', 'overdue'].includes(String(r.computed_status || '').toLowerCase()));
    }

    state.lastSummary = rows;
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
    bindStatusDropdown();
    renderInstallmentTabs();

    const refreshBtn = qs('batchMgmtRefreshBtn');
    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.onclick = () => loadPayments().catch(console.error);
    }

    // Cross-view refresh: when admin confirms/unconfirms in the modal, update this table
    if (!window.__batchMgmtPaymentsUpdatedBound) {
      window.__batchMgmtPaymentsUpdatedBound = true;
      window.addEventListener('payments:updated', () => {
        loadPayments().catch(console.error);
      });
    }

    const limitEl = qs('batchMgmtLimit');
    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.onchange = () => {
        state.limit = parseInt(limitEl.value || '200', 10) || 200;
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
