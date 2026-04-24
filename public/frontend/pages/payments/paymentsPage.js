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

  function formatStudentId(sid) {
    const raw = String(sid || '').trim();
    if (!raw) return '';
    if (raw.includes('/')) return raw;
    const m = raw.match(/^([A-Za-z]+)(\d+)$/);
    if (!m) return raw;
    return `${m[1]}/${m[2]}`;
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
      // Fallback
      return `LKR ${Math.round(n)}`;
    }
  }

  function getPlanTypeBadge(plan) {
    const p = String(plan || '').toLowerCase();
    if (p.includes('early bird') && p.includes('full')) {
      return '<span class="badge" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-size:11px;">EB Full</span>';
    }
    if (p.includes('early bird')) {
      return '<span class="badge" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-size:11px;">Early Bird</span>';
    }
    if (p.includes('full')) {
      return '<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:11px;">Full Pay</span>';
    }
    if (p.includes('registration') || p === 'reg fee only') {
      return '<span class="badge" style="background:#fefce8; color:#a16207; border:1px solid #fde68a; font-size:11px;">Reg Fee</span>';
    }
    if (p.includes('installment')) {
      return '<span class="badge" style="background:#faf5ff; color:#7e22ce; border:1px solid #e9d5ff; font-size:11px;">Installment</span>';
    }
    return '';
  }

  function buildPaymentHistorySection(sortedPayments, currentPid, totalConfirmed) {
    if (!sortedPayments || !sortedPayments.length) return '';

    const rows = sortedPayments.map(p => {
      const n = Number(p.installment_no ?? 1);
      const isRegFee = n === 0;
      const ord = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n ? `${n}th` : '#';
      const label = isRegFee ? 'Registration Fee' : (n ? `${ord} Installment` : 'Payment');
      const isSelected = String(p.id) === String(currentPid);

      const statusBadge = p.is_confirmed
        ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6; font-size:11px;">Confirmed</span>'
        : p.slip_received
          ? '<span class="badge" style="background:#fffaeb; color:#b54708; border:1px solid #fedf89; font-size:11px;">Pending</span>'
          : '<span class="badge" style="background:#f9fafb; color:#667085; border:1px solid #eaecf0; font-size:11px;">Awaiting</span>';

      const receiptCell = p.receipt_no
        ? `<a href="#" class="pay-history-receipt-link" data-payment-id="${escapeHtml(p.id)}" style="color:#175CD3; font-weight:700; font-size:12px; text-decoration:none;">${escapeHtml(p.receipt_no)}</a>`
        : '<span style="color:#98a2b3; font-size:12px;">—</span>';

      const rowBg = isSelected ? 'background:#f4ebff;' : isRegFee ? 'background:#fffaeb;' : '';
      const fontWeight = isSelected ? '800' : '600';
      const labelColor = isRegFee ? '#b54708' : '#101828';

      return `
        <tr class="pay-history-row" data-payment-id="${escapeHtml(p.id)}" style="cursor:pointer; ${rowBg} border-bottom:1px solid #f2f4f7;">
          <td style="padding:7px 8px; font-size:13px; font-weight:${fontWeight}; color:${labelColor};">${isRegFee ? '<i class="fas fa-file-invoice" style="margin-right:5px; font-size:11px;"></i>' : ''}${escapeHtml(label)}</td>
          <td style="padding:7px 8px; text-align:right; font-size:13px; font-weight:700; color:#101828;">${escapeHtml(fmtLkr(p.amount ?? ''))}</td>
          <td style="padding:7px 8px; text-align:center; font-size:12px; color:#475467;">${escapeHtml(p.payment_date || '—')}</td>
          <td style="padding:7px 8px; text-align:center;">${statusBadge}</td>
          <td style="padding:7px 8px; text-align:center;">${receiptCell}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="border:1px solid #eaecf0; border-radius:12px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <div style="font-weight:800; color:#101828;">Payment overview</div>
          <div style="font-size:12px; color:#667085;">Click a row to edit that installment</div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid #eaecf0;">
                <th style="text-align:left; padding:6px 8px; color:#667085; font-size:11px; font-weight:700; text-transform:uppercase;">Installment</th>
                <th style="text-align:right; padding:6px 8px; color:#667085; font-size:11px; font-weight:700; text-transform:uppercase;">Amount</th>
                <th style="text-align:center; padding:6px 8px; color:#667085; font-size:11px; font-weight:700; text-transform:uppercase;">Paid On</th>
                <th style="text-align:center; padding:6px 8px; color:#667085; font-size:11px; font-weight:700; text-transform:uppercase;">Status</th>
                <th style="text-align:center; padding:6px 8px; color:#667085; font-size:11px; font-weight:700; text-transform:uppercase;">Receipt</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="border-top:2px solid #eaecf0;">
                <td style="padding:8px; font-weight:800; color:#101828; font-size:13px;">Total collected</td>
                <td style="text-align:right; padding:8px; font-weight:800; color:#027a48; font-size:13px;">${escapeHtml(fmtLkr(totalConfirmed))}</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  async function openPaymentDetails(registrationId, registrationName) {
    // legacy (kept for now, but no longer used)

    const body = qs('paymentDetailsModalBody');
    if (body) body.innerHTML = '<p class="loading">Loading payment history...</p>';

    openModal('paymentDetailsModal');

    const isAdmin = String(window.currentUser?.role || '').toLowerCase() === 'admin';
    const res = isAdmin
      ? await window.API.payments.adminListForRegistration(registrationId)
      : await window.API.payments.coordinatorListForRegistration(registrationId);
    const rawRows = res.payments || [];

    // De-duplicate rows by plan+installment_no (keep latest), to avoid showing duplicates
    // caused by older registration payment flow that generated installments repeatedly.
    const byKey = new Map();
    for (const p of rawRows) {
      const key = `${p.payment_plan_id || p.payment_plan || ''}:${Number(p.installment_no || 0)}`;
      const cur = byKey.get(key);
      if (!cur) {
        byKey.set(key, p);
      } else {
        const t0 = new Date(cur.created_at || 0).getTime();
        const t1 = new Date(p.created_at || 0).getTime();
        if (t1 >= t0) byKey.set(key, p);
      }
    }

    const rows = Array.from(byKey.values()).sort((a, b) => {
      const ia = Number(a.installment_no || 0);
      const ib = Number(b.installment_no || 0);
      if (ia !== ib) return ia - ib;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<p class="empty">No payments found</p>';
      return;
    }

    // Use current summary row (if available) to show due window + lead details
    let windowHtml = '';
    let detailsHtml = '';

    if (window.__paymentsLastSummary && Array.isArray(window.__paymentsLastSummary)) {
      const cur = window.__paymentsLastSummary.find(x => String(x.registration_id) === String(registrationId));

      if (cur && (cur.window_start_date || cur.window_end_date)) {
        windowHtml = `<div style=\"font-size:12px; color:#667085; margin-top:6px;\">Window: ${escapeHtml(cur.window_start_date || '')} → ${escapeHtml(cur.window_end_date || '')}</div>`;
      }

      if (cur) {
        const name = cur.registration_name || registrationName || '';
        const email = cur.registration_email || '';
        const phone = cur.registration_phone_number || '';
        const wa = cur.registration_wa_number || phone || '';
        const sid = formatStudentId(cur.student_id) || '';
        const assignedTo = cur.assigned_to || '';

        const row = (label, value) => `
          <div style="display:flex; gap:8px;">
            <div style="min-width:120px; color:#667085; font-weight:600;">${escapeHtml(label)}</div>
            <div style="color:#101828; font-weight:600;">${escapeHtml(value || '-')}</div>
          </div>
        `;

        detailsHtml = `
          <div style="display:grid; gap:6px; padding:10px 12px; border:1px solid #eaecf0; border-radius:10px; background:#fcfcfd; margin-top:10px;">
            ${row('Name', name)}
            ${row('Email', email)}
            ${row('Whatsapp Number', wa)}
            ${row('Student ID', sid)}
            ${row('Assigned to', assignedTo)}
          </div>
        `;
      }
    }

    body.innerHTML = `
      <div style="margin-bottom:10px; color:#475467;">
        <div style="font-weight:700; color:#101828;">${escapeHtml(registrationName || '')}</div>
        ${windowHtml}
        ${detailsHtml}
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
              const instLabel = p.installment_no ? `Installment ${Number(p.installment_no)}` : '';
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
  // Default view should be "All" (per requirement)
  let selectedStatus = 'all';
  let selectedInstallmentFilter = '';
  let selectedNotConfirmed = false; // "Not confirmed" tab: slip received but not yet confirmed

  async function loadProgramsForPayments() {
    const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
    const res = await fetch('/api/programs/sidebar', { headers: authHeaders });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to load programs');
    return json;
  }

  async function renderProgramTabs() {
    const programSel = qs('paymentsProgramTabs');
    const batchSel = qs('paymentsBatchSelect');
    if (!programSel || !batchSel) return;

    const { programs, batches } = await loadProgramsForPayments();

    // default program = first
    if (!selectedProgramId && programs.length) selectedProgramId = programs[0].id;

    // Rebuild program dropdown only if programs changed (avoid resetting scroll position)
    const currentOptions = Array.from(programSel.options).map(o => o.value).join(',');
    const newOptions = programs.map(p => String(p.id)).join(',');
    if (currentOptions !== newOptions) {
      programSel.innerHTML = '';
      programs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        programSel.appendChild(opt);
      });

      // Bind change handler once
      if (!programSel.__bound) {
        programSel.__bound = true;
        programSel.addEventListener('change', async () => {
          selectedProgramId = programSel.value;
          selectedBatchName = '';
          await renderProgramTabs();
          await loadPayments({ showSkeleton: true });
        });
      }
    }

    programSel.value = String(selectedProgramId);

    // Batches for selected program
    const bs = (batches || []).filter(b => String(b.program_id) === String(selectedProgramId));
    const current = bs.find(b => b.is_current);
    batchSel.innerHTML = '';
    bs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.batch_name;
      opt.textContent = b.batch_name;
      batchSel.appendChild(opt);
    });

    if (!selectedBatchName) selectedBatchName = current?.batch_name || (bs[0]?.batch_name || '');
    batchSel.value = selectedBatchName;
  }

  function bindStatusDropdown() {
    const sel = qs('paymentsStatusSelect');
    if (!sel || sel.__bound) return;
    sel.__bound = true;

    // Initialize dropdown to current selectedStatus
    sel.value = selectedStatus || 'all';

    sel.addEventListener('change', () => {
      selectedStatus = sel.value || 'all';
      loadPayments({ showSkeleton: true }).catch(console.error);
    });
  }

  function renderInstallmentTabs() {
    const wrap = qs('paymentsInstallmentTabs');
    if (!wrap) return;

    const tabs = [
      { key: '', label: 'All', notConfirmed: false },
      { key: '__not_confirmed__', label: 'Not confirmed', notConfirmed: true },
      { key: 'installment_1', label: '1st Installment', notConfirmed: false },
      { key: 'installment_2', label: '2nd Installment', notConfirmed: false },
      { key: 'installment_3', label: '3rd Installment', notConfirmed: false },
      { key: 'installment_4', label: '4th Installment', notConfirmed: false },
      { key: 'full_payment', label: 'Full payment', notConfirmed: false },
      { key: 'reg_fee_only', label: 'Reg Fee Only', notConfirmed: false }
    ];

    wrap.innerHTML = '';
    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '999px';

      const isNotConfirmedTab = t.notConfirmed;
      const active = isNotConfirmedTab
        ? selectedNotConfirmed
        : (!selectedNotConfirmed && String(t.key) === String(selectedInstallmentFilter || ''));

      btn.style.border = active ? '1px solid #592c88' : '1px solid #eaecf0';
      btn.style.background = active ? '#f4ebff' : '#fff';
      btn.style.color = active ? '#592c88' : '#344054';
      btn.textContent = t.label;
      btn.onclick = () => {
        if (isNotConfirmedTab) {
          selectedNotConfirmed = true;
          selectedInstallmentFilter = '';
          // Show all statuses so slip_received rows appear regardless of due/overdue
          selectedStatus = 'all';
          const statusSel = qs('paymentsStatusSelect');
          if (statusSel) statusSel.value = 'all';
        } else {
          selectedNotConfirmed = false;
          selectedInstallmentFilter = t.key;

          // Requirement: when filtering by installment, also show confirmed/paid payments.
          // Switch status to "All" automatically.
          const statusSel = qs('paymentsStatusSelect');
          if (selectedInstallmentFilter) {
            selectedStatus = 'all';
            if (statusSel) statusSel.value = 'all';
          }
        }
        renderInstallmentTabs();
        loadPayments({ showSkeleton: true }).catch(console.error);
      };
      wrap.appendChild(btn);
    });
  }

  // Inline fields were removed from the payments table; confirmation is handled independently.
  function isRequiredFieldsFilled(_) {
    return true;
  }

  function updateConfirmButtonState(tr) {
    const confirmBtn = tr.querySelector('.pay-confirm');
    if (!confirmBtn) return;
    confirmBtn.disabled = false;
  }

  let __autoDefaultedInstallment = false;
  let __paymentsAllRows = [];

  async function loadPayments({ showSkeleton = false } = {}) {
    const tbody = qs('paymentsTableBody');
    const limit = parseInt(qs('paymentsLimit')?.value || '200', 10) || 200;

    const ttlMs = 2 * 60 * 1000; // 2 minutes
    const fetchStatus = (selectedStatus === 'due_overdue') ? 'all' : selectedStatus;
    const cacheKey = `payments:adminSummary:limit=${limit}:program=${encodeURIComponent(selectedProgramId||'')}:batch=${encodeURIComponent(selectedBatchName||'')}:status=${encodeURIComponent(fetchStatus)}:type=${encodeURIComponent(selectedInstallmentFilter||'')}:notConfirmed=${selectedNotConfirmed}`;

    // Fast path: render from cache if fresh and skip fetch
    if (tbody && !showSkeleton && window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached && cached.payments) {
        let rows = cached.payments || [];
        window.__paymentsLastSummary = rows;

        // If an installment/type filter is selected, include confirmed/completed rows too.
        if (selectedStatus === 'due_overdue' && !selectedInstallmentFilter) {
          rows = rows.filter(r => ['due', 'overdue'].includes(String(r.computed_status)));
        }

        rows = applyInstallmentFilter(rows);
        if (selectedNotConfirmed) {
          rows = rows.filter(r => r.slip_received && !r.is_confirmed);
        }
        __paymentsAllRows = rows;
        rows = filterPaymentsByQuery(rows, getPaymentsSearchQuery());
        renderPaymentsRows(rows, tbody);
        return;
      }
    }

    if (tbody && (showSkeleton || !window.__paymentsLastSummary)) {
      // Skeleton shimmer placeholders
      const skelRow = () => `
        <tr class="table-skel-row">
          <td><div class="table-skel-line" style="width:60%"></div></td>
          <td><div class="table-skel-line" style="width:50%"></div></td>
          <td><div class="table-skel-line" style="width:35%"></div></td>
          <td><div class="table-skel-line" style="width:35%"></div></td>
          <td><div class="table-skel-line" style="width:30%"></div></td>
          <td><div class="table-skel-line" style="width:25%"></div></td>
          <td><div class="table-skel-line" style="width:40%"></div></td>
          <td><div class="table-skel-line" style="width:25%"></div></td>
        </tr>
      `;
      tbody.innerHTML = Array.from({ length: 8 }).map(skelRow).join('');
    }

    // Use summary endpoint (one row per registration)
    const res = await window.API.payments.adminSummary(limit, {
      programId: selectedProgramId,
      batchName: selectedBatchName,
      status: fetchStatus,
      type: selectedInstallmentFilter === 'reg_fee_only' ? '' : selectedInstallmentFilter
    });

    // Auto-default installment filter to current window (only once, only if user hasn't selected)
    try {
      if (!__autoDefaultedInstallment && !selectedInstallmentFilter) {
        const today = new Date();
        const rows0 = res.payments || [];
        const match = rows0.find(r => {
          if (!r.window_start_date || !r.window_end_date) return false;
          const s = new Date(r.window_start_date);
          const e = new Date(r.window_end_date);
          if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
          return today >= s && today <= e;
        });
        const n = Number(match?.installment_no || 0);
        if (n >= 1 && n <= 4) {
          selectedInstallmentFilter = `installment_${n}`;
          __autoDefaultedInstallment = true;

          // keep UI in sync with new installment tabs
          renderInstallmentTabs();

          selectedStatus = 'all';
          const statusSel = qs('paymentsStatusSelect');
          if (statusSel) statusSel.value = 'all';

          // Reload once with type filter applied
          await loadPayments({ showSkeleton: false });
          return;
        }
        __autoDefaultedInstallment = true;
      }
    } catch (e) {
      console.warn('Auto default installment failed:', e?.message || e);
      __autoDefaultedInstallment = true;
    }

    if (window.Cache) window.Cache.setWithTs(cacheKey, res);
    let rows = res.payments || [];
    window.__paymentsLastSummary = rows;

    // If an installment/type filter is selected, include confirmed/completed rows too.
    if (selectedStatus === 'due_overdue' && !selectedInstallmentFilter) {
      rows = rows.filter(r => ['due', 'overdue'].includes(String(r.computed_status)));
    }

    rows = applyInstallmentFilter(rows);
    if (selectedNotConfirmed) {
      rows = rows.filter(r => r.slip_received && !r.is_confirmed);
    }
    __paymentsAllRows = rows;

    rows = filterPaymentsByQuery(rows, getPaymentsSearchQuery());
    renderPaymentsRows(rows, tbody);
  }

  function applyInstallmentFilter(rows) {
    if (selectedInstallmentFilter === 'reg_fee_only') {
      return rows.filter(r => {
        if (Number(r.installment_no) === 0) return true;
        const p = String(r.payment_plan || '').toLowerCase();
        return p.includes('registration') || p === 'registration fee only' || p === 'reg fee only';
      });
    }
    return rows;
  }

  function normalizeSearchText(s) {
    return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function filterPaymentsByQuery(rows, qRaw) {
    const q = normalizeSearchText(qRaw);
    if (!q) return rows;

    return (rows || []).filter(r => {
      const hay = [
        r.registration_name,
        r.registration_email,
        r.registration_phone_number,
        r.registration_wa_number,
        r.student_id,
        r.assigned_to,
        r.receipt_no,
        r.payment_method,
        r.payment_plan,
        r.amount,
        r.computed_status,
        r.installment_no,
        r.window_start_date,
        r.window_end_date
      ].map(normalizeSearchText).join(' | ');

      return hay.includes(q);
    });
  }

  function getPaymentsSearchQuery() {
    return qs('paymentsSearchInput')?.value || '';
  }

  function renderPaymentsRows(rows, tbody) {
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No payments found</td></tr>';
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

      const installmentText = (() => {
        const n = Number(p.installment_no ?? 1);
        if (n === 0) return 'Registration Fee';
        if (!n) return '';
        const ord = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

        // Normalize status label
        const st = String(p.computed_status || status || '').toLowerCase();
        const label = st ? (st.charAt(0).toUpperCase() + st.slice(1)) : '';

        return label ? `${ord} installment (${label})` : `${ord} installment`;
      })();

      return `
        <tr class="pay-row" data-id="${escapeHtml(p.id)}" data-registration-id="${escapeHtml(p.registration_id || '')}" style="cursor:pointer;">
          <td style="font-weight:600; color:#101828;">${escapeHtml(p.registration_name || '')}</td>
          <td style="color:#475467; font-weight:600;">${escapeHtml(installmentText || '-')}</td>
          <td style="color:#101828; font-weight:600;">${escapeHtml(fmtLkr(p.amount ?? ''))}</td>
          <td style="color:#475467;">${escapeHtml(p.payment_date || '')}</td>
          <td>${statusBadge}</td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-success btn-sm pay-confirm">
              ${p.is_confirmed ? 'Undo' : 'Confirm'}
            </button>
          </td>
          <td>
            ${p.receipt_no
              ? `<a href="#" class="pay-receipt-link" data-payment-id="${escapeHtml(p.id)}" style="color:#175CD3; text-decoration:none; font-weight:700;">${escapeHtml(p.receipt_no)}</a>`
              : `<span style="color:#98a2b3;">-</span>`
            }
          </td>
          <td>${getPlanTypeBadge(p.payment_plan)}</td>
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

      // Inline editing removed (updates happen via Update Payment modal)
      const debouncePatch = () => {};

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

        const trRow = e.target?.closest?.('tr.pay-row');
        if (trRow) {
          // Row click -> Update Payment modal
          const pid = trRow.getAttribute('data-id');
          if (pid && window.openUpdatePaymentModal) {
            window.openUpdatePaymentModal(pid).catch(err => {
              console.error(err);
              if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to open payment', 'error');
            });
          }
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

              const isUndo = btn.textContent.trim().toLowerCase() === 'undo';

              if (!isUndo) {
                const r = await window.API.payments.adminConfirm(id);
                const rn = r?.payment?.receipt_no || r?.receipt_no;
                if (window.UI && UI.showToast) UI.showToast(rn ? `Payment confirmed (${rn})` : 'Payment confirmed', 'success');
              } else {
                await window.API.payments.adminUnconfirm(id);
                if (window.UI && UI.showToast) UI.showToast('Payment unconfirmed', 'success');
              }

              // Toggle label immediately
              btn.textContent = isUndo ? 'Confirm' : 'Undo';

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

    // legacy per-row binding removed
  }

  async function initPaymentsPage() {
    if (!window.currentUser || window.currentUser.role !== 'admin') return;

    // React to current-batch changes from Programs -> Batch Setup
    if (!window.__paymentsCurrentBatchListenerBound) {
      window.__paymentsCurrentBatchListenerBound = true;
      window.addEventListener('currentBatchChanged', async () => {
        try {
          selectedBatchName = '';
          await renderProgramTabs();
          await loadPayments({ showSkeleton: false });
        } catch (e) {
          // ignore
        }
      });
    }

    const refreshBtn = qs('paymentsRefreshBtn');
    const limitEl = qs('paymentsLimit');
    const batchSel = qs('paymentsBatchSelect');
    const statusSel = qs('paymentsStatusSelect');
    const searchInput = qs('paymentsSearchInput');

    if (batchSel && !batchSel.__bound) {
      batchSel.__bound = true;
      batchSel.addEventListener('change', () => {
        selectedBatchName = batchSel.value;
        loadPayments({ showSkeleton: true }).catch(console.error);
      });
    }

    if (statusSel && !statusSel.__bound) {
      statusSel.__bound = true;
      statusSel.addEventListener('change', () => {
        selectedStatus = statusSel.value || 'all';
        loadPayments({ showSkeleton: true }).catch(console.error);
      });
    }

    if (searchInput && !searchInput.__bound) {
      searchInput.__bound = true;
      let t = null;
      searchInput.addEventListener('input', () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          const tbody = qs('paymentsTableBody');
          const filtered = filterPaymentsByQuery(__paymentsAllRows, searchInput.value);
          renderPaymentsRows(filtered, tbody);
        }, 150);
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

    bindStatusDropdown();
    renderInstallmentTabs();
    await renderProgramTabs();
    const hasRows = !!qs('paymentsTableBody')?.querySelector('tr[data-row-key]');
    await loadPayments({ showSkeleton: !hasRows });
  }

  // Update Payment modal
  async function openUpdatePaymentModal(paymentId) {
    const pid = String(paymentId || '').trim();
    if (!pid) throw new Error('Missing payment id');

    const body = qs('paymentUpdateModalBody');
    const saveBtn = qs('paymentUpdateSaveBtn');

    if (body) {
      body.innerHTML = `
        <div class="home-skel">
          <div class="table-skel-line" style="width:60%; height:16px; margin:10px 0;"></div>
          <div class="table-skel-line" style="width:45%; height:12px; margin:10px 0;"></div>
          <div class="table-skel-line" style="width:75%; height:12px; margin:10px 0;"></div>
          <div class="table-skel-line" style="width:50%; height:12px; margin:10px 0;"></div>
          <div class="table-skel-line" style="width:70%; height:12px; margin:10px 0;"></div>
        </div>
      `;
    }
    if (saveBtn) saveBtn.disabled = true;

    openModal('paymentUpdateModal');

    const showModalError = (msg) => {
      if (body) {
        body.innerHTML = `<div style="padding:10px 12px; border:1px solid #fecdca; background:#fffbfa; border-radius:12px; color:#b42318; font-weight:700;">${escapeHtml(msg || 'Failed to load payment')}</div>`;
      }
      if (saveBtn) saveBtn.disabled = true;
    };

    // Find registrationId from currently loaded summary (fast path)
    const sumRow = (window.__paymentsLastSummary || []).find(r => String(r.id) === String(pid));
    const registrationId = sumRow?.registration_id;
    if (!registrationId) {
      showModalError('Unable to resolve registration for this payment');
      return;
    }

    const isAdmin = String(window.currentUser?.role || '').toLowerCase() === 'admin';
    const res = isAdmin
      ? await window.API.payments.adminListForRegistration(registrationId)
      : await window.API.payments.coordinatorListForRegistration(registrationId);

    const payments = res.payments || [];
    const selected = payments.find(p => String(p.id) === String(pid)) || payments[0];

    // Load batch payment setup (methods + plans) for dropdowns
    const batchNameForSetup = String(selected?.batch_name || sumRow?.batch_name || '').trim();
    let paymentSetup = { methods: [], plans: [] };
    try {
      if (batchNameForSetup) {
        const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
        const r = await fetch(`/api/payment-setup/batches/${encodeURIComponent(batchNameForSetup)}`, { headers: authHeaders, credentials: 'include' });
        const j = await r.json().catch(() => null);
        if (r.ok && j?.success) paymentSetup = j;
      }
    } catch (e) {
      // Non-fatal: fallback to allowing manual selection from current value
      console.warn('Payment setup load failed:', e?.message || e);
    }

    // Registration/student details (from summary if available)
    const reg = (window.__paymentsLastSummary || []).find(r => String(r.registration_id) === String(registrationId)) || sumRow || {};

    const detailRow = (label, value) => `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <div style="color:#667085; font-size:12px; font-weight:700; text-transform:uppercase;">${escapeHtml(label)}</div>
        <div style="color:#101828; font-weight:700; font-size:13px; text-align:right;">${escapeHtml(value || '-')}</div>
      </div>
    `;

    const planName = selected?.payment_plan || '';
    const installmentNo = Number(selected?.installment_no) === 0 ? 'Registration Fee' : (selected?.installment_no ? `Installment ${Number(selected.installment_no)}` : '');

    const sortedPayments = [...payments].sort((a, b) => Number(a.installment_no||0) - Number(b.installment_no||0));
    const totalConfirmed = sortedPayments.reduce((s, p) => s + (p.is_confirmed ? (Number(p.amount)||0) : 0), 0);

    if (body) {
      body.innerHTML = `
        <div style="display:grid; gap:12px;">
          <div style="border:1px solid #eaecf0; background:#fcfcfd; border-radius:12px; padding:12px;">
            <div style="font-weight:800; color:#101828; margin-bottom:8px;">Student details</div>
            <div style="display:grid; gap:6px;">
              ${detailRow('Name', reg.registration_name)}
              ${detailRow('Email', reg.registration_email)}
              ${detailRow('Phone', reg.registration_phone_number)}
              ${detailRow('Whatsapp', reg.registration_wa_number || reg.registration_phone_number)}
              ${detailRow('Student ID', formatStudentId(reg.student_id || ''))}
              ${detailRow('Assigned to', reg.assigned_to || '')}
            </div>
          </div>

          ${buildPaymentHistorySection(sortedPayments, pid, totalConfirmed)}

          <div style="border:1px solid #eaecf0; border-radius:12px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
              <div>
                <div style="font-weight:800; color:#101828;">Payment details</div>
                <div style="color:#667085; font-size:12px; margin-top:2px;">${escapeHtml(planName)} ${escapeHtml(installmentNo)}</div>
              </div>
              <div data-up-receipt-host>
                ${selected?.receipt_no
                  ? `<a href="#" class="pay-receipt-link" data-payment-id="${escapeHtml(selected.id)}" style="color:#175CD3; text-decoration:none; font-weight:800;">Receipt: ${escapeHtml(selected.receipt_no)}</a>`
                  : `<span style="color:#98a2b3; font-size:12px;">No receipt yet</span>`
                }
              </div>
            </div>

            <div style="display:grid; gap:12px; margin-top:12px;">
              <div class="form-group">
                <label>Payment Method</label>
                <select id="upPayMethod" class="form-control"></select>
              </div>

              <div class="form-group">
                <label>Payment Plan</label>
                <select id="upPayPlan" class="form-control"></select>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <div class="form-group">
                  <label>Amount</label>
                  <input id="upPayAmount" class="form-control" type="number" value="${escapeHtml(selected?.amount ?? '')}" />
                  <div style="margin-top:6px; font-size:12px; color:#667085; font-weight:700;">${escapeHtml(fmtLkr(selected?.amount ?? ''))}</div>
                </div>
                <div class="form-group">
                  <label>Payment date</label>
                  <input id="upPayDate" class="form-control" type="date" value="${escapeHtml(selected?.payment_date || '')}" />
                </div>
              </div>

              <div style="display:grid; gap:8px;">
                <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid #eaecf0; border-radius:10px; background:#fcfcfd;">
                  <input id="upPaySlip" type="checkbox" ${selected?.slip_received ? 'checked' : ''} />
                  <label style="margin:0; font-weight:700; color:#101828;">Receipt/Slip received</label>
                </div>

                <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid #eaecf0; border-radius:10px; background:#fcfcfd;">
                  <input id="upPayEmail" type="checkbox" ${selected?.email_sent ? 'checked' : ''} />
                  <label style="margin:0; font-weight:700; color:#101828;">Email sent</label>
                </div>

                <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid #eaecf0; border-radius:10px; background:#fcfcfd;">
                  <input id="upPayWa" type="checkbox" ${selected?.whatsapp_sent ? 'checked' : ''} />
                  <label style="margin:0; font-weight:700; color:#101828;">Whatsapp sent</label>
                </div>
              </div>

              <div id="upPayConfirmWrap" style="display:flex; gap:10px; align-items:center; justify-content:flex-end; margin-top:4px;"></div>
            </div>
          </div>
        </div>
      `;

      // History overview row: click to switch to that installment
      body.querySelectorAll('.pay-history-row').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.pay-history-receipt-link')) return;
          const switchPid = tr.getAttribute('data-payment-id');
          if (switchPid && switchPid !== String(pid)) {
            openUpdatePaymentModal(switchPid).catch(console.error);
          }
        });
      });

      // History receipt links: download PDF
      body.querySelectorAll('.pay-history-receipt-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const rpid = link.getAttribute('data-payment-id');
          if (!rpid) return;
          (async () => {
            try {
              const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
              const resp = await fetch(`/api/receipts/payment/${encodeURIComponent(rpid)}`, { headers: authHeaders, credentials: 'include' });
              if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || 'Failed to download receipt');
              if (!(resp.headers.get('content-type') || '').toLowerCase().includes('application/pdf')) throw new Error('Server did not return a PDF.');
              const blob = await resp.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `receipt-${link.textContent.trim()}.pdf`;
              document.body.appendChild(a);
              a.click();
              URL.revokeObjectURL(url);
              a.remove();
            } catch (err) {
              if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to download', 'error');
            }
          })();
        });
      });

      const receiptHost = body.querySelector('[data-up-receipt-host]') || body;

      const bindReceiptDownload = (anchorEl, receiptNo) => {
        if (!anchorEl) return;
        anchorEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pid2 = anchorEl.getAttribute('data-payment-id');
          (async () => {
            try {
              const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
              const resp = await fetch(`/api/receipts/payment/${encodeURIComponent(pid2)}`, { headers: authHeaders, credentials: 'include' });
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
              a.download = `receipt-${(receiptNo || 'receipt')}.pdf`;
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
      };

      const renderReceiptHeader = (receiptNo) => {
        const header = body.querySelector('[data-up-receipt-host]');
        if (!header) return;
        if (receiptNo) {
          header.innerHTML = `<a href="#" class="pay-receipt-link" data-payment-id="${escapeHtml(selected.id)}" style="color:#175CD3; text-decoration:none; font-weight:800;">Receipt: ${escapeHtml(receiptNo)}</a>`;
          bindReceiptDownload(header.querySelector('a.pay-receipt-link'), receiptNo);
        } else {
          header.innerHTML = `<span style="color:#98a2b3; font-size:12px;">No receipt yet</span>`;
        }
      };

      // Populate dropdowns from batch setup
      const methodSel = qs('upPayMethod');
      const planSel = qs('upPayPlan');

      const fillSelect = (sel, values, currentValue, placeholder = 'Select') => {
        if (!sel) return;
        const uniq = Array.from(new Set((values || []).filter(Boolean)));
        const cur = String(currentValue || '');

        sel.innerHTML = [`<option value="">${escapeHtml(placeholder)}</option>`]
          .concat(uniq.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`))
          .join('');

        // Ensure current value exists even if batch setup doesn't have it
        if (cur && !uniq.includes(cur)) {
          const opt = document.createElement('option');
          opt.value = cur;
          opt.textContent = cur;
          sel.appendChild(opt);
        }
        sel.value = cur;
      };

      const methodValues = (paymentSetup?.methods || []).map(m => m.method_name);
      const planValues = (paymentSetup?.plans || []).map(p => p.plan_name);
      fillSelect(methodSel, methodValues, selected?.payment_method, 'Select method');
      fillSelect(planSel, planValues, selected?.payment_plan, 'Select plan');

      // Initial receipt link binding
      renderReceiptHeader(selected?.receipt_no || null);

      // Confirm/Undo payment button (Admin only)
      const confirmWrap = qs('upPayConfirmWrap');
      if (confirmWrap && window.currentUser?.role === 'admin') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-success';
        btn.style.minWidth = '170px';
        btn.textContent = selected?.is_confirmed ? 'Undo Payment' : 'Confirm Payment';

        confirmWrap.innerHTML = '';
        confirmWrap.appendChild(btn);

        btn.addEventListener('click', async () => {
          try {
            btn.disabled = true;
            btn.textContent = 'Working...';

            // Save latest edits first
            const payload = {
              payment_method: qs('upPayMethod')?.value || null,
              payment_plan: qs('upPayPlan')?.value || null,
              amount: Number(qs('upPayAmount')?.value),
              payment_date: qs('upPayDate')?.value || null,
              slip_received: !!qs('upPaySlip')?.checked,
              email_sent: !!qs('upPayEmail')?.checked,
              whatsapp_sent: !!qs('upPayWa')?.checked
            };
            const isAdmin = String(window.currentUser?.role || '').toLowerCase() === 'admin';
            if (isAdmin) {
              await window.API.payments.adminUpdate(selected.id, payload);
            } else {
              await window.API.payments.coordinatorUpdate(selected.id, payload);
            }

            const isUndo = !!selected?.is_confirmed;
            let r = null;
            if (!isUndo) {
              // validate required fields for confirm
              const method = payload.payment_method;
              const plan = payload.payment_plan;
              const amt = payload.amount;
              const date = payload.payment_date;
              const slip = payload.slip_received;
              if (!(method && plan && Number.isFinite(amt) && amt > 0 && date && slip)) {
                throw new Error('Fill payment method, plan, amount, date and slip received before confirming.');
              }
              r = await window.API.payments.adminConfirm(selected.id);
              const rn = r?.payment?.receipt_no || r?.receipt_no;
              selected.is_confirmed = true;
              selected.receipt_no = rn || selected.receipt_no;
              if (window.UI && UI.showToast) UI.showToast(rn ? `Payment confirmed (${rn})` : 'Payment confirmed', 'success');
            } else {
              await window.API.payments.adminUnconfirm(selected.id);
              selected.is_confirmed = false;
              selected.receipt_no = null;
              if (window.UI && UI.showToast) UI.showToast('Payment unconfirmed', 'success');
            }

            // Refresh tables
            if (window.Cache) window.Cache.invalidatePrefix('payments:adminSummary');
            await loadPayments();
            window.dispatchEvent(new CustomEvent('payments:updated', { detail: { paymentId: selected.id, registrationId: selected.registration_id } }));

            // Refresh header + button label
            renderReceiptHeader(selected?.receipt_no || null);
            btn.textContent = selected?.is_confirmed ? 'Undo Payment' : 'Confirm Payment';
          } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to confirm payment', 'error');
          } finally {
            btn.disabled = false;
            btn.innerHTML = selected?.is_confirmed ? 'Undo Payment' : 'Confirm Payment';
          }
        });
      }
    }

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.onclick = async () => {
        try {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';

          const payload = {
            payment_method: qs('upPayMethod')?.value || null,
            payment_plan: qs('upPayPlan')?.value || null,
            amount: Number(qs('upPayAmount')?.value),
            payment_date: qs('upPayDate')?.value || null,
            slip_received: !!qs('upPaySlip')?.checked,
            email_sent: !!qs('upPayEmail')?.checked,
            whatsapp_sent: !!qs('upPayWa')?.checked
          };

          const isAdmin = String(window.currentUser?.role || '').toLowerCase() === 'admin';
          if (isAdmin) {
            await window.API.payments.adminUpdate(selected.id, payload);
            if (window.Cache) window.Cache.invalidatePrefix('payments:adminSummary');
            await loadPayments();
          } else {
            await window.API.payments.coordinatorUpdate(selected.id, payload);
          }

          // Notify any other open views (e.g., Batch Management) to refresh
          window.dispatchEvent(new CustomEvent('payments:updated', { detail: { paymentId: selected.id, registrationId: selected.registration_id } }));
          if (window.UI && UI.showToast) UI.showToast('Saved', 'success');
          // keep modal open so admin can confirm & download receipt
          // closeModal('paymentUpdateModal');
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to save', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
        }
      };
    }
  }

  window.openUpdatePaymentModal = openUpdatePaymentModal;

  window.initPaymentsPage = initPaymentsPage;
})();
