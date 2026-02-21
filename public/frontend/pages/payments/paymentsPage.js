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

    // Use current summary row (if available) to show due window
    let windowHtml = '';
    if (window.__paymentsLastSummary && Array.isArray(window.__paymentsLastSummary)) {
      const cur = window.__paymentsLastSummary.find(x => String(x.registration_id) === String(registrationId));
      if (cur && (cur.window_start_date || cur.window_end_date)) {
        windowHtml = `<div style=\"font-size:12px; color:#667085; margin-top:6px;\">Window: ${escapeHtml(cur.window_start_date || '')} → ${escapeHtml(cur.window_end_date || '')}</div>`;
      }
    }

    body.innerHTML = `
      <div style="margin-bottom:10px; color:#475467;">
        <div style="font-weight:700; color:#101828;">${escapeHtml(registrationName || '')}</div>
        ${windowHtml}
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
                  <td>
                    ${p.receipt_no
                      ? `<a href="#" class="pay-receipt-link-modal" style="color:#175CD3; text-decoration:none; font-weight:700;" data-payment-id="${escapeHtml(p.id)}">${escapeHtml(p.receipt_no)}</a>`
                      : `<input type="text" class="form-control pay-receipt" value="" style="min-width:120px;" />`
                    }
                  </td>
                  <td style="text-align:center;">
                    <button type="button" class="btn btn-success btn-sm pay-confirm-modal">
                      ${p.is_confirmed ? 'Undo' : 'Confirm'}
                    </button>
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

      const receiptLink = tr.querySelector('.pay-receipt-link-modal');
      if (receiptLink) {
        receiptLink.addEventListener('click', (e) => {
          e.preventDefault();
          const pid = receiptLink.getAttribute('data-payment-id') || id;
          (async () => {
            try {
              const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
              const resp = await fetch(`/api/receipts/payment/${encodeURIComponent(pid)}`, {
                headers: authHeaders,
                credentials: 'include'
              });
              if (!resp.ok) {
                const j = await resp.json().catch(() => null);
                throw new Error(j?.error || 'Failed to download receipt');
              }
              const ct = resp.headers.get('content-type') || '';
              if (!ct.toLowerCase().includes('application/pdf')) {
                throw new Error('Download failed (server did not return a PDF).');
              }

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
        });
      }

      const confirmBtn = tr.querySelector('.pay-confirm-modal');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          try {
            confirmBtn.disabled = true;
            await patch();

            const isUndo = confirmBtn.textContent.trim().toLowerCase() === 'undo';
            let r = null;
            if (!isUndo) {
              const method = tr.querySelector('.pay-method')?.value;
              const plan = tr.querySelector('.pay-plan')?.value;
              const amt = Number(tr.querySelector('.pay-amount')?.value);
              const date = tr.querySelector('.pay-date')?.value;
              const slip = !!tr.querySelector('.pay-slip')?.checked;
              if (!(method && plan && Number.isFinite(amt) && amt > 0 && date && slip)) {
                throw new Error('Fill payment method, plan, amount, date and slip received before confirming.');
              }

              r = await window.API.payments.adminConfirm(id);
              const rn = r?.payment?.receipt_no || r?.receipt_no;
              if (window.UI && UI.showToast) UI.showToast(rn ? `Payment confirmed (${rn})` : 'Payment confirmed', 'success');
            } else {
              await window.API.payments.adminUnconfirm(id);
              if (window.UI && UI.showToast) UI.showToast('Payment unconfirmed', 'success');
            }

            // refresh main table silently, but don't reload modal
            if (window.Cache) window.Cache.invalidatePrefix('payments:adminSummary');
            await loadPayments();

            // Update modal row UI in-place
            confirmBtn.textContent = isUndo ? 'Confirm' : 'Undo';

            // If receipt was created, replace input with link
            const receiptNo = (!isUndo) ? (r?.payment?.receipt_no || r?.receipt_no) : null;
            if (receiptNo) {
              const receiptCell = tr.querySelector('td:nth-child(8)');
              if (receiptCell) {
                receiptCell.innerHTML = `<a href="#" class="pay-receipt-link-modal" style="color:#175CD3; text-decoration:none; font-weight:700;" data-payment-id="${escapeHtml(id)}">${escapeHtml(receiptNo)}</a>`;

                // bind click for the newly inserted link
                const newLink = receiptCell.querySelector('.pay-receipt-link-modal');
                if (newLink) {
                  newLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    const pid2 = newLink.getAttribute('data-payment-id') || id;
                    (async () => {
                      try {
                        const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
                        const resp = await fetch(`/api/receipts/payment/${encodeURIComponent(pid2)}`, {
                          headers: authHeaders,
                          credentials: 'include'
                        });
                        if (!resp.ok) {
                          const j = await resp.json().catch(() => null);
                          throw new Error(j?.error || 'Failed to download receipt');
                        }
                        const ct = resp.headers.get('content-type') || '';
                        if (!ct.toLowerCase().includes('application/pdf')) {
                          throw new Error('Download failed (server did not return a PDF).');
                        }
                        const blob = await resp.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `receipt-${newLink.textContent.trim()}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        URL.revokeObjectURL(url);
                        a.remove();
                      } catch (err) {
                        console.error(err);
                        if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to download receipt', 'error');
                      }
                    })();
                  });
                }
              }
            }
          } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to update', 'error');
          } finally {
            confirmBtn.disabled = false;
          }
        });
      }
    });
  }

  let selectedProgramId = '';
  let selectedBatchName = '';
  let selectedStatus = 'due_overdue';
  let selectedInstallmentFilter = '';

  async function loadProgramsForPayments() {
    const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
    const res = await fetch('/api/programs/sidebar', { headers: authHeaders });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to load programs');
    return json;
  }

  async function renderProgramTabs() {
    const tabs = qs('paymentsProgramTabs');
    const batchSel = qs('paymentsBatchSelect');
    if (!tabs || !batchSel) return;

    const { programs, batches } = await loadProgramsForPayments();

    // default program = first
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
        await renderProgramTabs();
        await loadPayments();
      };
      tabs.appendChild(btn);
    });

    // batches for selected program
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

  function renderStatusTabs() {
    const wrap = qs('paymentsStatusTabs');
    if (!wrap) return;

    const tabs = [
      { key: 'due_overdue', label: 'Due + Overdue' },
      { key: 'due', label: 'Due' },
      { key: 'overdue', label: 'Overdue' },
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'completed', label: 'Completed' },
      { key: 'all', label: 'All' }
    ];

    wrap.innerHTML = '';
    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '999px';
      const active = t.key === selectedStatus;
      btn.style.border = active ? '1px solid #592c88' : '1px solid #eaecf0';
      btn.style.background = active ? '#f4ebff' : '#fff';
      btn.style.color = active ? '#592c88' : '#344054';
      btn.textContent = t.label;
      btn.onclick = () => {
        selectedStatus = t.key;
        renderStatusTabs();
        loadPayments().catch(console.error);
      };
      wrap.appendChild(btn);
    });
  }

  function isRequiredFieldsFilled(tr) {
    const method = tr.querySelector('.pay-method')?.value;
    const plan = tr.querySelector('.pay-plan')?.value;
    const amt = Number(tr.querySelector('.pay-amount')?.value);
    const date = tr.querySelector('.pay-date')?.value;
    const slip = !!tr.querySelector('.pay-slip')?.checked;

    // Email sent + Whatsapp sent are NOT mandatory
    return !!(method && plan && Number.isFinite(amt) && amt > 0 && date && slip);
  }

  function updateConfirmButtonState(tr) {
    const confirmBtn = tr.querySelector('.pay-confirm');
    if (!confirmBtn) return;

    // Undo should always be possible
    const isUndo = confirmBtn.textContent.trim().toLowerCase() === 'undo';
    if (isUndo) {
      confirmBtn.disabled = false;
      return;
    }

    confirmBtn.disabled = !isRequiredFieldsFilled(tr);
  }

  async function loadPayments({ showSkeleton = false } = {}) {
    const tbody = qs('paymentsTableBody');
    const limit = parseInt(qs('paymentsLimit')?.value || '200', 10) || 200;

    const ttlMs = 2 * 60 * 1000; // 2 minutes
    const fetchStatus = (selectedStatus === 'due_overdue') ? 'all' : selectedStatus;
    const cacheKey = `payments:adminSummary:limit=${limit}:program=${encodeURIComponent(selectedProgramId||'')}:batch=${encodeURIComponent(selectedBatchName||'')}:status=${encodeURIComponent(fetchStatus)}:type=${encodeURIComponent(selectedInstallmentFilter||'')}`;

    // Fast path: render from cache if fresh and skip fetch
    if (tbody && !showSkeleton && window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached && cached.payments) {
        let rows = cached.payments || [];
        window.__paymentsLastSummary = rows;
        if (selectedStatus === 'due_overdue') {
          rows = rows.filter(r => ['due', 'overdue'].includes(String(r.computed_status)));
        }
        rows = applyInstallmentFilter(rows);
        renderPaymentsRows(rows, tbody);
        return;
      }
    }

    if (tbody && (showSkeleton || !window.__paymentsLastSummary)) {
      tbody.innerHTML = '<tr><td colspan="13" class="loading">Loading payments...</td></tr>';
    }

    // Use summary endpoint (one row per registration)
    const res = await window.API.payments.adminSummary(limit, { programId: selectedProgramId, batchName: selectedBatchName, status: fetchStatus });
    if (window.Cache) window.Cache.setWithTs(cacheKey, res);
    let rows = res.payments || [];
    window.__paymentsLastSummary = rows;

    if (selectedStatus === 'due_overdue') {
      rows = rows.filter(r => ['due', 'overdue'].includes(String(r.computed_status)));
    }

    rows = applyInstallmentFilter(rows);

    renderPaymentsRows(rows, tbody);
  }

  function applyInstallmentFilter(rows) {
    const f = String(selectedInstallmentFilter || '').trim();
    if (!f) return rows;

    if (f.startsWith('installment_')) {
      const n = parseInt(f.split('_')[1], 10);
      return rows.filter(r => Number(r.installment_no) === n);
    }

    if (f === 'full_payment') {
      return rows.filter(r => String(r.payment_plan || '').toLowerCase().includes('full payment'));
    }

    return rows;
  }

  function renderPaymentsRows(rows, tbody) {
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="13" class="loading">No payments found</td></tr>';
      return;
    }

    // Summary already returns one row per registration
    const displayRows = rows;

    const trHtmlFn = (p) => {
      const status = String(p.computed_status || '').toLowerCase();
      const statusBadge = (() => {
        if (status === 'overdue') return '<span class="badge" style="background:#fef3f2; color:#b42318; border:1px solid #fecdca;">Overdue</span>';
        if (status === 'due') return '<span class="badge" style="background:#fffaeb; color:#b54708; border:1px solid #fedf89;">Due</span>';
        if (status === 'upcoming') return '<span class="badge" style="background:#eff8ff; color:#175cd3; border:1px solid #b2ddff;">Upcoming</span>';
        if (status === 'completed') return '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Completed</span>';
        return '<span style="color:#98a2b3;">-</span>';
      })();

      const installmentText = p.installment_no
        ? `${String(status).toLowerCase() === 'due' ? 'Due ' : ''}${String(status).toLowerCase() === 'overdue' ? 'Overdue ' : ''}Installment #${p.installment_no}`.trim()
        : '';

      return `
        <tr data-id="${escapeHtml(p.id)}" data-registration-id="${escapeHtml(p.registration_id || '')}">
          <td>
            <a href="#" class="pay-view" style="color:#175CD3; text-decoration:none; font-weight:600;">${escapeHtml(p.registration_name || '')}</a>
          </td>
          <td style="font-weight:700; color:#101828;">${escapeHtml(p.student_id || '-')}</td>
          <td>${statusBadge}</td>
          <td style="color:#475467; font-weight:600;">${escapeHtml(installmentText || '-')}</td>
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
          <td><input type="number" class="pay-amount form-control" value="${escapeHtml(p.amount ?? '')}" /></td>
          <td><input type="date" class="pay-date form-control" value="${escapeHtml(p.payment_date || '')}" /></td>
          <td><input type="checkbox" class="pay-slip" ${p.slip_received ? 'checked' : ''} /></td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-success btn-sm pay-confirm">
              ${p.is_confirmed ? 'Undo' : 'Confirm'}
            </button>
          </td>
          <td>
            ${p.receipt_no
              ? `<a href="#" class="pay-receipt-link" data-payment-id="${escapeHtml(p.id)}" style="color:#175CD3; text-decoration:none; font-weight:700;">${escapeHtml(p.receipt_no)}</a>`
              : `<input type="text" class="pay-receipt form-control" value="" style="min-width:120px;" />`
            }
          </td>
        </tr>
      `;
    };

    const htmlRows = displayRows.map(trHtmlFn).join('');

    if (window.DOMPatcher?.patchTableBody) {
      window.DOMPatcher.patchTableBody(tbody, displayRows, (x) => x.registration_id || x.id, (row) => {
        const tr = trHtmlFn(row);
        return tr.replace('<tr ', `<tr data-row-key="${escapeHtml(row.registration_id || row.id)}" `);
      });
    } else {
      tbody.innerHTML = htmlRows;
    }

    // bind actions (delegated once)
    if (!tbody.__delegated) {
      tbody.__delegated = true;

      const patchFromTr = async (tr) => {
        const id = tr.getAttribute('data-id');
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

      let t = null;
      const debouncePatch = (tr) => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          patchFromTr(tr).catch(e => {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to save payment', 'error');
          });
        }, 600);
      };

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
              const resp = await fetch(`/api/receipts/payment/${encodeURIComponent(pid)}`, {
                headers: authHeaders,
                credentials: 'include'
              });
              if (!resp.ok) {
                const j = await resp.json().catch(() => null);
                throw new Error(j?.error || 'Failed to download receipt');
              }
              const ct = resp.headers.get('content-type') || '';
              if (!ct.toLowerCase().includes('application/pdf')) {
                throw new Error('Download failed (server did not return a PDF).');
              }

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

        const view = e.target?.closest?.('.pay-view');
        if (view) {
          e.preventDefault();
          const tr = view.closest('tr[data-id]');
          const registrationId = tr?.getAttribute('data-registration-id');
          const registrationName = view.textContent;
          if (registrationId) openPaymentDetails(registrationId, registrationName).catch(console.error);
          return;
        }

        const btn = e.target?.closest?.('.pay-confirm');
        if (btn) {
          const tr = btn.closest('tr[data-id]');
          const id = tr?.getAttribute('data-id');
          if (!tr || !id) return;

          (async () => {
            try {
              btn.disabled = true;
              await patchFromTr(tr);

              if (btn.textContent.trim().toLowerCase() !== 'undo') {
                if (!isRequiredFieldsFilled(tr)) {
                  throw new Error('Fill payment method, plan, amount, date and slip received before confirming.');
                }
                const r = await window.API.payments.adminConfirm(id);
                const rn = r?.payment?.receipt_no || r?.receipt_no;
                if (window.UI && UI.showToast) UI.showToast(rn ? `Payment confirmed (${rn})` : 'Payment confirmed', 'success');
              } else {
                await window.API.payments.adminUnconfirm(id);
                if (window.UI && UI.showToast) UI.showToast('Payment unconfirmed', 'success');
              }

              if (window.Cache) window.Cache.invalidatePrefix('payments:adminSummary');
              await loadPayments();
            } catch (err) {
              console.error(err);
              if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to update payment status', 'error');
            } finally {
              btn.disabled = false;
            }
          })();
          return;
        }
      });

      tbody.addEventListener('change', (e) => {
        const tr = e.target?.closest?.('tr[data-id]');
        if (!tr) return;
        updateConfirmButtonState(tr);
        debouncePatch(tr);
      });

      tbody.addEventListener('input', (e) => {
        const tr = e.target?.closest?.('tr[data-id]');
        if (!tr) return;
        updateConfirmButtonState(tr);
        debouncePatch(tr);
      });
    }

    // initial state for confirm buttons
    tbody.querySelectorAll('tr[data-id]').forEach(tr => updateConfirmButtonState(tr));

    return;

    // legacy per-row binding removed
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
        el.addEventListener('change', () => {
          updateConfirmButtonState(tr);
          debounce();
        });
        el.addEventListener('input', () => {
          updateConfirmButtonState(tr);
          debounce();
        });
      });

      // initial state
      updateConfirmButtonState(tr);

      const confirmBtn = tr.querySelector('.pay-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          try {
            confirmBtn.disabled = true;
            await patch();

            // Validate required fields before confirm (Undo allowed anytime)
            if (confirmBtn.textContent.trim().toLowerCase() !== 'undo') {
              if (!isRequiredFieldsFilled(tr)) {
                throw new Error('Fill payment method, plan, amount, date and slip received before confirming.');
              }
              await window.API.payments.adminConfirm(id);
              if (window.UI && UI.showToast) UI.showToast('Payment confirmed', 'success');
            } else {
              await window.API.payments.adminUnconfirm(id);
              if (window.UI && UI.showToast) UI.showToast('Payment unconfirmed', 'success');
            }

            if (window.Cache) window.Cache.invalidatePrefix('payments:adminSummary');
            await loadPayments();
          } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to update payment status', 'error');
          } finally {
            // after confirm/undo, recalc current row state (in case loadPayments() fails)
            updateConfirmButtonState(tr);
          }
        });
      }
    });
  }

  async function initPaymentsPage() {
    if (!window.currentUser || window.currentUser.role !== 'admin') return;

    const refreshBtn = qs('paymentsRefreshBtn');
    const limitEl = qs('paymentsLimit');
    const batchSel = qs('paymentsBatchSelect');
    const typeSel = qs('paymentsInstallmentFilter');

    if (batchSel && !batchSel.__bound) {
      batchSel.__bound = true;
      batchSel.addEventListener('change', () => {
        selectedBatchName = batchSel.value;
        loadPayments().catch(console.error);
      });
    }

    if (typeSel && !typeSel.__bound) {
      typeSel.__bound = true;
      typeSel.addEventListener('change', () => {
        selectedInstallmentFilter = typeSel.value;
        loadPayments().catch(console.error);
      });
    }

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => loadPayments().catch(console.error));
    }
    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.addEventListener('change', () => loadPayments().catch(console.error));
    }

    renderStatusTabs();
    await renderProgramTabs();
    const hasRows = !!qs('paymentsTableBody')?.querySelector('tr[data-row-key]');
    await loadPayments({ showSkeleton: !hasRows });
  }

  window.initPaymentsPage = initPaymentsPage;
})();
