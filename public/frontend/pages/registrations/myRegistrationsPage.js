// Officer: My Registrations Page

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

  function formatDateTimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  let lastRowsById = new Map();

  // Prevent concurrent loads (stable like Lead Management)
  let isLoading = false;

  async function openDetailsModal(reg) {
    // Reuse the existing modal, but hide delete/actions for officers
    const delBtn = qs('registrationDeleteBtn');
    if (delBtn) delBtn.style.display = 'none';
    const actions = qs('registrationDetailsModalActions');
    if (actions) actions.style.display = 'none';

    const body = qs('registrationDetailsModalBody');
    const payload = reg?.payload || {};
    const get = (key) => reg?.[key] ?? payload?.[key] ?? '';

    const details = {
      'Submitted At': formatDateTimeLocal(reg?.created_at),
      'Name': get('name'),
      'Phone': get('phone_number'),
      'Email': get('email')
    };

    if (body) {
      body.innerHTML = `
        <div class="lead-details-grid" style="grid-template-columns: 1fr 1fr;">
          ${Object.entries(details).map(([k, v]) => `
            <div class="lead-detail-item">
              <div class="lead-detail-label">${escapeHtml(k)}</div>
              <div class="lead-detail-value">${escapeHtml(v || '')}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 14px;">
          <button type="button" class="btn btn-success" id="registrationPaymentToggleBtn">
            <i class="fas fa-money-bill-wave"></i> Payment received
          </button>

          <div id="registrationPaymentSection" style="display:none; margin: 10px 0 0; padding: 12px; border: 1px solid #eaecf0; border-radius: 12px; background: #f9fafb;">
            <div style="font-weight:600; color:#101828; margin-bottom:10px;">Payment Details</div>
            <div class="form-row" style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group" style="margin:0;">
                <label style="font-size:13px; color:#344054; font-weight:600;">Payment method</label>
                <select id="registrationPaymentMethod" class="form-control">
                  <option value="">Select</option>
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label style="font-size:13px; color:#344054; font-weight:600;">Payment plan</label>
                <select id="registrationPaymentPlan" class="form-control">
                  <option value="">Select</option>
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label style="font-size:13px; color:#344054; font-weight:600;">Payment date</label>
                <input id="registrationPaymentDate" type="date" class="form-control" />
              </div>
              <div class="form-group" style="margin:0;">
                <label style="font-size:13px; color:#344054; font-weight:600;">Amount</label>
                <input id="registrationPaymentAmount" type="number" min="0" step="0.01" class="form-control" placeholder="0.00" />
              </div>
              <div class="form-group" style="margin:0; display:flex; align-items:center; gap:10px;">
                <input id="registrationReceiptReceived" type="checkbox" />
                <label for="registrationReceiptReceived" style="margin:0; font-size:13px; color:#344054; font-weight:600; display:inline;">Payment receipt received</label>
              </div>
            </div>

            <div style="margin-top: 12px; display:flex; justify-content:flex-end;">
              <button type="button" class="btn btn-primary" id="registrationPaymentSaveBtn">
                <i class="fas fa-save"></i> Save payment
              </button>
            </div>
          </div>
        </div>
      `;

      const payToggleBtn = qs('registrationPaymentToggleBtn');
      const paySection = qs('registrationPaymentSection');
      const paySaveBtn = qs('registrationPaymentSaveBtn');

      if (payToggleBtn && paySection) {
        payToggleBtn.onclick = () => {
          const open = paySection.style.display !== 'none';
          paySection.style.display = open ? 'none' : 'block';
          payToggleBtn.innerHTML = open
            ? '<i class="fas fa-money-bill-wave"></i> Payment received'
            : '<i class="fas fa-times"></i> Cancel payment';
        };
      }

      if (paySaveBtn) {
        paySaveBtn.onclick = async () => {
          const method = qs('registrationPaymentMethod')?.value;
          const plan = qs('registrationPaymentPlan')?.value;
          const date = qs('registrationPaymentDate')?.value;
          const amountStr = qs('registrationPaymentAmount')?.value;
          const receipt = !!qs('registrationReceiptReceived')?.checked;

          const amount = Number(amountStr);
          if (!method) {
            if (window.UI && UI.showToast) UI.showToast('Please select a payment method', 'error');
            return;
          }
          if (!plan) {
            if (window.UI && UI.showToast) UI.showToast('Please select a payment plan', 'error');
            return;
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            if (window.UI && UI.showToast) UI.showToast('Please enter a valid amount', 'error');
            return;
          }

          try {
            paySaveBtn.disabled = true;
            await window.API.registrations.addPayment(reg?.id, {
              payment_method: method,
              payment_plan: plan,
              payment_date: date || null,
              amount,
              slip_received: receipt,
              receipt_received: receipt
            });
            if (window.UI && UI.showToast) UI.showToast('Payment saved', 'success');

            if (qs('registrationPaymentAmount')) qs('registrationPaymentAmount').value = '';
            if (qs('registrationReceiptReceived')) qs('registrationReceiptReceived').checked = false;
            if (qs('registrationPaymentDate')) qs('registrationPaymentDate').value = '';
            if (paySection) paySection.style.display = 'none';
            if (payToggleBtn) payToggleBtn.innerHTML = '<i class="fas fa-money-bill-wave"></i> Payment received';

          } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to save payment', 'error');
          } finally {
            paySaveBtn.disabled = false;
          }
        };
      }
    }

    // Reset dropdowns and load batch payment setup
    try {
      const batchName = reg?.batch_name || reg?.payload?.batch_name;
      const methodSel0 = qs('registrationPaymentMethod');
      const planSel0 = qs('registrationPaymentPlan');
      if (methodSel0) {
        methodSel0.innerHTML = '<option value="">Select</option>';
        methodSel0.disabled = true;
      }
      if (planSel0) {
        planSel0.innerHTML = '<option value="">Select</option>';
        planSel0.disabled = true;
      }

      if (batchName) {
        let authHeaders = {};
        if (window.supabaseClient) {
          const { data: { session } } = await window.supabaseClient.auth.getSession();
          if (session && session.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
        const r = await fetch(`/api/payment-setup/batches/${encodeURIComponent(batchName)}`, { headers: authHeaders });
        const j = await r.json();
        if (j.success) {
          const methodSel = qs('registrationPaymentMethod');
          const planSel = qs('registrationPaymentPlan');
          if (methodSel) {
            methodSel.innerHTML = '<option value="">Select</option>' + (j.methods || []).map(m => `<option value="${escapeHtml(m.method_name)}">${escapeHtml(m.method_name)}</option>`).join('');
            methodSel.disabled = false;
          }
          if (planSel) {
            planSel.innerHTML = '<option value="">Select</option>' + (j.plans || []).map(p => `<option value="${escapeHtml(p.plan_name)}">${escapeHtml(p.plan_name)}</option>`).join('');
            planSel.disabled = false;
          }
        }
      }

      // Load latest saved payment and prefill
      if (reg?.id && window.API?.registrations?.listPayments) {
        const payRes = await window.API.registrations.listPayments(reg.id);
        const p = (payRes.payments || [])[0];
        if (p) {
          if (qs('registrationPaymentMethod')) qs('registrationPaymentMethod').value = p.payment_method || '';
          if (qs('registrationPaymentPlan')) qs('registrationPaymentPlan').value = p.payment_plan || '';
          if (qs('registrationPaymentDate')) qs('registrationPaymentDate').value = p.payment_date || '';
          if (qs('registrationPaymentAmount')) qs('registrationPaymentAmount').value = String(p.amount ?? '');
          if (qs('registrationReceiptReceived')) qs('registrationReceiptReceived').checked = !!(p.slip_received || p.receipt_received);

          // Auto-open payment section
          const paySection = qs('registrationPaymentSection');
          const payToggleBtn = qs('registrationPaymentToggleBtn');
          if (paySection) paySection.style.display = 'block';
          if (payToggleBtn) payToggleBtn.innerHTML = '<i class="fas fa-times"></i> Cancel payment';
        }
      }
    } catch (e) {
      console.warn('Failed to load payment setup for batch', e);
    }

    openModal('registrationDetailsModal');
  }

  let selectedProgramId = '';
  let selectedBatchName = '';

  async function loadProgramsForMyRegistrations() {
    const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
    const res = await fetch('/api/programs/sidebar', { headers: authHeaders });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to load programs');
    return json;
  }

  async function renderProgramTabs() {
    const tabs = qs('registrationsMyProgramTabs');
    const batchSel = qs('registrationsMyBatchSelect');
    if (!tabs || !batchSel) return;

    const { programs, batches } = await loadProgramsForMyRegistrations();
    if (!selectedProgramId && programs.length) selectedProgramId = programs[0].id;

    tabs.innerHTML = '';
    programs.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '999px';
      const active = String(p.id) === String(selectedProgramId);
      btn.style.border = active ? '1px solid #592c88' : '1px solid #eaecf0';
      btn.style.background = active ? '#f4ebff' : '#fff';
      btn.style.color = active ? '#592c88' : '#344054';
      btn.textContent = p.name;
      btn.onclick = async () => {
        selectedProgramId = p.id;
        selectedBatchName = '';
        await renderProgramTabs();
        await loadMyRegistrations();
      };
      tabs.appendChild(btn);
    });

    const bs = (batches || []).filter(b => String(b.program_id) === String(selectedProgramId));
    const current = bs.find(b => b.is_current);
    batchSel.innerHTML = '';
    bs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.batch_name;
      opt.textContent = b.batch_name;
      batchSel.appendChild(opt);
    });

    if (!selectedBatchName) selectedBatchName = current?.batch_name || (bs[0]?.batch_name || '');
    batchSel.value = selectedBatchName;
  }

  async function loadMyRegistrations({ showSkeleton = false } = {}) {
    if (isLoading) return;
    isLoading = true;

    const tbody = qs('registrationsMyTableBody');
    const limitEl = qs('registrationsMyLimit');
    const limit = Math.min(parseInt(limitEl?.value || '100', 10) || 100, 500);

    const ttlMs = 2 * 60 * 1000; // 2 minutes
    const cacheKey = `registrations:myList:limit=${limit}:program=${encodeURIComponent(selectedProgramId||'')}:batch=${encodeURIComponent(selectedBatchName||'')}`;

    const isEnrolled = (reg) => {
      const payload = reg?.payload || {};
      return !!(
        reg?.enrolled === true ||
        reg?.is_enrolled === true ||
        reg?.enrolled_at ||
        payload?.enrolled === true ||
        payload?.enrolled_at
      );
    };

    const renderRows = (rows) => {
      lastRowsById = new Map((rows || []).map(r => [String(r.id), r]));

      if (!tbody) return;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No registrations found</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const submittedAt = formatDateTimeLocal(r.created_at);
        const email = r.email ?? r.payload?.email ?? '';
        const paid = !!(r.payment_received);
        const paymentCell = paid
          ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Received</span>'
          : '<span style="color:#98a2b3;">-</span>';

        const enrolled = isEnrolled(r);
        const enrolledCell = enrolled
          ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Enrolled</span>'
          : '<span style="color:#98a2b3;">-</span>';

        return `
          <tr data-registration-id="${escapeHtml(r.id)}" style="cursor:pointer;">
            <td>${escapeHtml(r.name)}</td>
            <td>${escapeHtml(r.phone_number)}</td>
            <td>${escapeHtml(email)}</td>
            <td>${paymentCell}</td>
            <td>${enrolledCell}</td>
            <td>${escapeHtml(submittedAt)}</td>
          </tr>
        `;
      }).join('');
    };

    // Fast path: render from cache if fresh and skip fetch
    if (tbody && !showSkeleton && window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached && cached.registrations) {
        renderRows(cached.registrations || []);
        isLoading = false;
        return;
      }
    }

    // Only show skeleton on first load to prevent flicker
    if (tbody && showSkeleton) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading registrations...</td></tr>';
    }

    try {
      const res = await window.API.registrations.myList(limit, { programId: selectedProgramId, batchName: selectedBatchName });
      if (window.Cache) window.Cache.setWithTs(cacheKey, res);
      const rows = res.registrations || [];
      renderRows(rows);
    } catch (e) {
      console.error(e);
      if (tbody && showSkeleton) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading">${escapeHtml(e.message || 'Failed to load registrations')}</td></tr>`;
      }
      throw e;
    } finally {
      isLoading = false;
    }
  }

  async function initMyRegistrationsPage() {
    if (!window.currentUser || window.currentUser.role === 'admin') return;

    const refreshBtn = qs('registrationsMyRefreshBtn');
    const limitEl = qs('registrationsMyLimit');
    const batchSel = qs('registrationsMyBatchSelect');
    const tbody = qs('registrationsMyTableBody');

    // One-time: row click -> details (event delegation)
    if (tbody && !tbody.__delegated) {
      tbody.__delegated = true;
      tbody.addEventListener('click', (e) => {
        const tr = e.target?.closest?.('tr[data-registration-id]');
        if (!tr) return;
        const id = tr.getAttribute('data-registration-id');
        const reg = lastRowsById.get(String(id));
        if (reg) openDetailsModal(reg).catch(console.error);
      });
    }

    if (batchSel && !batchSel.__bound) {
      batchSel.__bound = true;
      batchSel.addEventListener('change', () => {
        selectedBatchName = batchSel.value;
        loadMyRegistrations().catch(console.error);
      });
    }

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => loadMyRegistrations().catch(err => {
        console.error(err);
        if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to load registrations', 'error');
      }));
    }

    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.addEventListener('change', () => loadMyRegistrations().catch(console.error));
    }

    await renderProgramTabs();
    await loadMyRegistrations({ showSkeleton: true });
  }

  window.initMyRegistrationsPage = initMyRegistrationsPage;
})();
