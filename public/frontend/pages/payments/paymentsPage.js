// Admin Payments Page

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

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString();
  }

  async function openPaymentDetails(registrationId, registrationName) {
    const body = qs('paymentDetailsModalBody');
    if (body) body.innerHTML = '<p class="loading">Loading payment history...</p>';

    openModal('paymentDetailsModal');

    const res = await window.API.payments.adminListForRegistration(registrationId);
    const rows = res.payments || [];

    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<p class="loading">No payments found</p>';
      return;
    }

    body.innerHTML = `
      <div style="margin-bottom:10px; color:#475467;">${escapeHtml(registrationName || '')}</div>
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
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(p => {
              const plan = (p.payment_plan || '') + (p.installment_no ? ` #${p.installment_no}` : '');
              return `
                <tr data-id="${escapeHtml(p.id)}">
                  <td>
                    <select class="pay-plan form-control" style="min-width:220px;">
                      ${[
                        '',
                        'Installment',
                        'Installment with early bird',
                        'Full payment',
                        'Full payment with early bird',
                        'registration fee only'
                      ].map(m => `<option value="${escapeHtml(m)}" ${m=== (p.payment_plan||'') ? 'selected' : ''}>${escapeHtml(m||'Select')}</option>`).join('')}
                    </select>
                    <div style="font-size:12px; color:#667085; margin-top:4px;">${escapeHtml(p.installment_no ? `Installment #${p.installment_no}` : '')}</div>
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
                  <td><input type="text" class="form-control pay-receipt" value="${escapeHtml(p.receipt_no || '')}" style="min-width:120px;" /></td>
                  <td style="text-align:center;">
                    <input type="checkbox" class="pay-received" ${p.is_confirmed ? 'checked' : ''} ${p.is_confirmed ? 'disabled' : ''} />
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // bind updates inside modal
    body.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.getAttribute('data-id');
      const patch = async () => {
        const payload = {
          email_sent: tr.querySelector('.pay-email')?.checked,
          whatsapp_sent: tr.querySelector('.pay-wa')?.checked,
          payment_method: tr.querySelector('.pay-method')?.value,
          payment_plan: tr.querySelector('.pay-plan')?.value,
          amount: Number(tr.querySelector('.pay-amount')?.value),
          payment_date: tr.querySelector('.pay-date')?.value || null,
          slip_received: tr.querySelector('.pay-slip')?.checked,
          receipt_no: tr.querySelector('.pay-receipt')?.value
        };
        await window.API.payments.adminUpdate(id, payload);
      };

      let t = null;
      const debounce = () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => patch().catch(console.error), 600);
      };

      tr.querySelectorAll('input,select').forEach(el => {
        el.addEventListener('change', debounce);
        el.addEventListener('input', debounce);
      });

      const receivedCb = tr.querySelector('.pay-received');
      if (receivedCb) {
        receivedCb.addEventListener('change', async () => {
          try {
            if (!receivedCb.checked) {
              receivedCb.checked = false;
              return;
            }
            receivedCb.disabled = true;
            await window.API.payments.adminConfirm(id);
            if (window.UI && UI.showToast) UI.showToast('Payment confirmed', 'success');
            // refresh modal and main table
            await loadPayments();
            await openPaymentDetails(registrationId, registrationName);
          } catch (e) {
            console.error(e);
            receivedCb.checked = false;
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to confirm', 'error');
          } finally {
            receivedCb.disabled = false;
          }
        });
      }
    });
  }

  async function loadPayments() {
    const tbody = qs('paymentsTableBody');
    const limit = parseInt(qs('paymentsLimit')?.value || '200', 10) || 200;
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="loading">Loading payments...</td></tr>';

    const res = await window.API.payments.adminList(limit);
    const rows = res.payments || [];

    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="loading">No payments found</td></tr>';
      return;
    }

    // Show only the latest payment row per registration (by created_at), click to see all
    const latestByReg = new Map();
    rows.forEach(p => {
      const key = p.registration_id;
      if (!key) return;
      if (!latestByReg.has(key)) latestByReg.set(key, p);
    });

    const displayRows = Array.from(latestByReg.values());

    tbody.innerHTML = displayRows.map(p => {
      const plan = p.payment_plan || '';
      const installmentLabel = (p.installment_group_id && p.installment_no)
        ? ` #${p.installment_no}`
        : '';

      const received = p.is_confirmed
        ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Received</span>'
        : '<span style="color:#98a2b3;">-</span>';

      return `
        <tr data-id="${escapeHtml(p.id)}" data-registration-id="${escapeHtml(p.registration_id || '')}">
          <td>
            <a href="#" class="pay-view" style="color:#175CD3; text-decoration:none; font-weight:600;">${escapeHtml(p.registration_name || '')}</a>
          </td>
          <td><input type="checkbox" class="pay-email" ${p.email_sent ? 'checked' : ''} /></td>
          <td><input type="checkbox" class="pay-wa" ${p.whatsapp_sent ? 'checked' : ''} /></td>
          <td>
            <select class="pay-method form-control" style="min-width:160px;">
              ${['', 'Online Transfer', 'Bank Deposit'].map(m => `<option value="${escapeHtml(m)}" ${m=== (p.payment_method||'') ? 'selected' : ''}>${escapeHtml(m||'Select')}</option>`).join('')}
            </select>
          </td>
          <td>
            <select class="pay-plan form-control" style="min-width:220px;">
              ${[
                '',
                'Installment',
                'Installment with early bird',
                'Full payment',
                'Full payment with early bird',
                'registration fee only'
              ].map(m => `<option value="${escapeHtml(m)}" ${m=== (p.payment_plan||'') ? 'selected' : ''}>${escapeHtml(m||'Select')}</option>`).join('')}
            </select>
          </td>
          <td><input type="number" class="pay-amount form-control" value="${escapeHtml(p.amount ?? '')}" style="width:120px;" /></td>
          <td><input type="date" class="pay-date form-control" value="${escapeHtml(p.payment_date || '')}" style="width:160px;" /></td>
          <td><input type="checkbox" class="pay-slip" ${p.slip_received ? 'checked' : ''} /></td>
          <td style="text-align:center;">
            <input type="checkbox" class="pay-received" ${p.is_confirmed ? 'checked' : ''} ${p.is_confirmed ? 'disabled' : ''} />
          </td>
          <td><input type="text" class="pay-receipt form-control" value="${escapeHtml(p.receipt_no || '')}" style="min-width:120px;" /></td>
        </tr>
      `;
    }).join('');

    // bind actions
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.getAttribute('data-id');
      const registrationId = tr.getAttribute('data-registration-id');
      const registrationName = tr.querySelector('.pay-view')?.textContent;

      const viewLink = tr.querySelector('.pay-view');
      if (viewLink) {
        viewLink.addEventListener('click', (e) => {
          e.preventDefault();
          if (registrationId) openPaymentDetails(registrationId, registrationName).catch(console.error);
        });
      }

      const patch = async () => {
        const body = {
          email_sent: tr.querySelector('.pay-email')?.checked,
          whatsapp_sent: tr.querySelector('.pay-wa')?.checked,
          payment_method: tr.querySelector('.pay-method')?.value,
          payment_plan: tr.querySelector('.pay-plan')?.value,
          amount: Number(tr.querySelector('.pay-amount')?.value),
          payment_date: tr.querySelector('.pay-date')?.value || null,
          slip_received: tr.querySelector('.pay-slip')?.checked,
          receipt_no: tr.querySelector('.pay-receipt')?.value
        };
        await window.API.payments.adminUpdate(id, body);
      };

      // auto-save on change (debounced)
      let t = null;
      const debounce = () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          patch().catch(e => {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to save payment', 'error');
          });
        }, 600);
      };

      tr.querySelectorAll('input,select').forEach(el => {
        el.addEventListener('change', debounce);
        el.addEventListener('input', debounce);
      });

      const receivedCb = tr.querySelector('.pay-received');
      if (receivedCb) {
        receivedCb.addEventListener('change', async () => {
          if (!receivedCb.checked) {
            // do not support un-confirm
            receivedCb.checked = false;
            return;
          }
          try {
            receivedCb.disabled = true;
            await window.API.payments.adminConfirm(id);
            if (window.UI && UI.showToast) UI.showToast('Payment confirmed', 'success');
            await loadPayments();
          } catch (e) {
            console.error(e);
            receivedCb.checked = false;
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to confirm payment', 'error');
          }
        });
      }
    });
  }

  async function initPaymentsPage() {
    if (!window.currentUser || window.currentUser.role !== 'admin') return;

    const refreshBtn = qs('paymentsRefreshBtn');
    const limitEl = qs('paymentsLimit');

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => loadPayments().catch(console.error));
    }
    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.addEventListener('change', () => loadPayments().catch(console.error));
    }

    await loadPayments();
  }

  window.initPaymentsPage = initPaymentsPage;
})();
