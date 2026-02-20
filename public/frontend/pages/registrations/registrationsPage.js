// Admin Registrations Page
// Shows website registration submissions stored in Supabase

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
  let selectedRegistrationId = null;

  let cachedOfficers = null;

  async function ensureOfficersLoaded() {
    if (cachedOfficers) return cachedOfficers;
    const res = await window.API.users.officers();
    cachedOfficers = (res.officers || []).map(o => o.name).filter(Boolean);
    return cachedOfficers;
  }

  async function openDetailsModal(reg) {
    selectedRegistrationId = reg?.id || null;

    const body = qs('registrationDetailsModalBody');
    const delBtn = qs('registrationDeleteBtn');
    const actions = qs('registrationDetailsModalActions');
    if (actions) actions.style.display = 'flex';

    const payload = reg?.payload || {};
    const get = (key) => reg?.[key] ?? payload?.[key] ?? '';

    const details = {
      'Submitted At': formatDateTimeLocal(reg?.created_at),
      'Program': reg?.program_name ?? reg?.payload?.program_name ?? reg?.course_program ?? reg?.payload?.course_program ?? '',
      'Batch': reg?.batch_name ?? reg?.payload?.batch_name ?? '',
      'Name': get('name'),
      'Phone': get('phone_number'),
      'Email': get('email'),
      'Gender': get('gender'),
      'Date of Birth': get('date_of_birth'),
      'Address': get('address'),
      'Country': get('country'),
      'WhatsApp': get('wa_number'),
      'Working Status': get('working_status'),
      'Course/Program': get('course_program'),
      'Source': get('source')
    };

    if (body) {
      const currentAssigned = reg?.assigned_to ?? reg?.payload?.assigned_to ?? '';
      let officerOptions = '';
      try {
        const officers = await ensureOfficersLoaded();
        officerOptions = [''].concat(officers).map(name => {
          const label = name || 'Unassigned';
          const selected = String(name) === String(currentAssigned) ? 'selected' : '';
          return `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(label)}</option>`;
        }).join('');
      } catch (e) {
        console.warn('Failed to load officers for assignment dropdown:', e);
      }

      body.innerHTML = `
        <div class="lead-details-grid" style="grid-template-columns: 1fr 1fr;">
          ${Object.entries(details).map(([k, v]) => `
            <div class="lead-detail-item">
              <div class="lead-detail-label">${escapeHtml(k)}</div>
              <div class="lead-detail-value">${escapeHtml(v || '')}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div style="font-size:13px; color:#667085;">Assigned</div>
          <select id="registrationAssignedSelect" class="form-control" style="min-width: 220px;">
            ${officerOptions || `<option value="${escapeHtml(currentAssigned)}" selected>${escapeHtml(currentAssigned || 'Unassigned')}</option>`}
          </select>
          <button type="button" class="btn btn-primary" id="registrationAssignedSaveBtn">
            <i class="fas fa-save"></i> Save
          </button>
        </div>

        <div style="margin-top: 12px;">
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

      const saveBtn = qs('registrationAssignedSaveBtn');
      const sel = qs('registrationAssignedSelect');
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
            const result = await window.API.registrations.addPayment(selectedRegistrationId, {
              payment_method: method,
              payment_plan: plan,
              payment_date: date || null,
              amount,
              slip_received: receipt,
              receipt_received: receipt
            });
            if (window.UI && UI.showToast) UI.showToast('Payment saved', 'success');

            // Fill fields with saved values (use the first row)
            const saved = (result && result.payments && result.payments[0]) ? result.payments[0] : null;
            if (saved) {
              if (qs('registrationPaymentMethod')) qs('registrationPaymentMethod').value = saved.payment_method || method;
              if (qs('registrationPaymentPlan')) qs('registrationPaymentPlan').value = saved.payment_plan || plan;
              if (qs('registrationPaymentDate')) qs('registrationPaymentDate').value = saved.payment_date || (date || '');
              if (qs('registrationPaymentAmount')) qs('registrationPaymentAmount').value = String(saved.amount ?? amount);
              if (qs('registrationReceiptReceived')) qs('registrationReceiptReceived').checked = !!(saved.slip_received || saved.receipt_received);
            }

            // Keep the form visible for further edits
            if (payToggleBtn) payToggleBtn.innerHTML = '<i class="fas fa-money-bill-wave"></i> Payment received';

          } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to save payment', 'error');
          } finally {
            paySaveBtn.disabled = false;
          }
        };
      }

      if (saveBtn && sel) {
        saveBtn.onclick = async () => {
          try {
            saveBtn.disabled = true;
            const assignedTo = sel.value;
            await window.API.registrations.adminAssign(selectedRegistrationId, assignedTo);
            if (window.UI && UI.showToast) UI.showToast('Assignment updated', 'success');
            await loadRegistrations();
          } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to update assignment', 'error');
          } finally {
            saveBtn.disabled = false;
          }
        };
      }
    }

    if (delBtn) {
      delBtn.style.display = ''; // ensure visible for admins (officer page hides it)
      delBtn.onclick = async () => {
        if (!selectedRegistrationId) return;
        const ok = confirm('Delete this registration permanently?');
        if (!ok) return;

        try {
          delBtn.disabled = true;
          await window.API.registrations.adminDelete(selectedRegistrationId);
          if (window.UI && UI.showToast) UI.showToast('Registration deleted', 'success');
          closeModal('registrationDetailsModal');
          await loadRegistrations();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to delete registration', 'error');
        } finally {
          delBtn.disabled = false;
        }
      };
    }

    // Reset payment dropdowns (avoid showing previous batch values)
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

    // Load batch-specific payment setup into dropdowns
    try {
      const batchName = reg?.batch_name || reg?.payload?.batch_name;
      if (batchName) {
        const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
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
    } catch (e) {
      console.warn('Failed to load payment setup for batch', e);
    }

    openModal('registrationDetailsModal');
  }

  async function loadRegistrations() {
    const tbody = qs('registrationsTableBody');
    const limitEl = qs('registrationsLimit');
    const limit = Math.min(parseInt(limitEl?.value || '100', 10) || 100, 500);

    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading registrations...</td></tr>';
    }

    const res = await window.API.registrations.adminList(limit);
    const rows = res.registrations || [];

    lastRowsById = new Map(rows.map(r => [r.id, r]));

    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading">No registrations found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const submittedAt = formatDateTimeLocal(r.created_at);
      const email = r.email ?? r.payload?.email ?? '';
      const assigned = r.assigned_to ?? r.payload?.assigned_to ?? '';
      const paid = !!(r.payment_received);
      const paymentCell = paid
        ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Received</span>'
        : '<span style="color:#98a2b3;">-</span>';

      return `
        <tr class="clickable" data-registration-id="${escapeHtml(r.id)}" style="cursor:pointer;">
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.phone_number)}</td>
          <td>${escapeHtml(email)}</td>
          <td>${paymentCell}</td>
          <td>${escapeHtml(assigned)}</td>
          <td>${escapeHtml(submittedAt)}</td>
        </tr>
      `;
    }).join('');

    // row click -> details
    tbody.querySelectorAll('tr[data-registration-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-registration-id');
        const reg = lastRowsById.get(id);
        if (reg) openDetailsModal(reg).catch(console.error);
      });
    });
  }

  async function initRegistrationsPage() {
    // Admin-only
    if (!window.currentUser || window.currentUser.role !== 'admin') {
      return;
    }

    const refreshBtn = qs('registrationsRefreshBtn');
    const limitEl = qs('registrationsLimit');

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => loadRegistrations().catch(err => {
        console.error(err);
        if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to load registrations', 'error');
      }));
    }

    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.addEventListener('change', () => loadRegistrations().catch(console.error));
    }

    await loadRegistrations();
  }

  window.initRegistrationsPage = initRegistrationsPage;
})();
