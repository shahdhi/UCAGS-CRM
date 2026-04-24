// Batch Payment Setup (Admin)

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

  function norm(name) {
    const raw = String(name || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    const low = raw.toLowerCase();
    if (low === 'main leads') return 'Main Leads';
    if (low === 'extra leads') return 'Extra Leads';
    return raw;
  }

  function validateName(label, value) {
    const v = norm(value);
    if (!v) throw new Error(`${label} is required`);
    if (!/^[a-zA-Z0-9 _-]+$/.test(v)) throw new Error(`${label} can only contain letters, numbers, spaces, hyphen (-) and underscore (_)`);
    return v;
  }

  let state = { methods: [], plans: [], earlyBird: false, reg_fee_amount: '', reg_fee_date: '' };

  function renderBatchSettings() {
    const wrap = qs('paymentBatchSettingsWrap');
    if (!wrap) return;

    const eb = state.earlyBird;
    wrap.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
          <div style="font-weight:700; color:#101828;">Early Bird</div>
          <label class="toggle-switch" style="display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;">
            <div style="position:relative; width:44px; height:24px;">
              <input type="checkbox" id="earlyBirdToggle" style="opacity:0; width:0; height:0; position:absolute;" ${eb ? 'checked' : ''} />
              <div id="earlyBirdTrack" style="position:absolute; inset:0; border-radius:24px; background:${eb ? '#592c88' : '#d0d5dd'}; transition:background 0.2s;"></div>
              <div id="earlyBirdThumb" style="position:absolute; top:3px; left:${eb ? '23px' : '3px'}; width:18px; height:18px; border-radius:50%; background:#fff; transition:left 0.2s; box-shadow:0 1px 3px rgba(0,0,0,.2);"></div>
            </div>
            <span style="font-size:13px; color:${eb ? '#592c88' : '#667085'}; font-weight:700;">${eb ? 'ON — No registration fee for all plans' : 'OFF — Registration fee applies'}</span>
          </label>
        </div>

        <div id="regFeeSettingsWrap" style="display:${eb ? 'none' : 'flex'}; gap:12px; align-items:flex-end; flex-wrap:wrap;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:13px; font-weight:700;">Registration fee (LKR)</label>
            <input id="batchRegFeeAmount" type="number" min="0" class="form-control" style="width:180px;" value="${escapeHtml(String(state.reg_fee_amount || ''))}" placeholder="e.g. 5000" />
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:13px; font-weight:700;">Registration fee due date</label>
            <input id="batchRegFeeDate" type="date" class="form-control" style="width:180px;" value="${escapeHtml(state.reg_fee_date || '')}" />
          </div>
        </div>
      </div>
    `;

    // Toggle interaction
    const toggle = qs('earlyBirdToggle');
    const track = qs('earlyBirdTrack');
    const thumb = qs('earlyBirdThumb');
    const regFeeWrap = qs('regFeeSettingsWrap');

    if (toggle) {
      toggle.addEventListener('change', () => {
        state.earlyBird = toggle.checked;
        if (track) track.style.background = state.earlyBird ? '#592c88' : '#d0d5dd';
        if (thumb) thumb.style.left = state.earlyBird ? '23px' : '3px';
        if (regFeeWrap) regFeeWrap.style.display = state.earlyBird ? 'none' : 'flex';
        // Re-render plan label hints
        renderPlans();
        // Update toggle label
        const lbl = toggle.closest('label')?.querySelector('span');
        if (lbl) {
          lbl.textContent = state.earlyBird ? 'ON — No registration fee for all plans' : 'OFF — Registration fee applies';
          lbl.style.color = state.earlyBird ? '#592c88' : '#667085';
        }
      });
    }

    const regFeeAmtInp = qs('batchRegFeeAmount');
    const regFeeDateInp = qs('batchRegFeeDate');
    if (regFeeAmtInp) regFeeAmtInp.addEventListener('input', () => { state.reg_fee_amount = regFeeAmtInp.value; });
    if (regFeeDateInp) regFeeDateInp.addEventListener('change', () => { state.reg_fee_date = regFeeDateInp.value; });
  }

  function renderMethods() {
    const wrap = qs('paymentMethodsWrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    state.methods.forEach((m, idx) => {
      const pill = document.createElement('div');
      pill.style.display = 'inline-flex';
      pill.style.alignItems = 'center';
      pill.style.gap = '8px';
      pill.style.padding = '6px 10px';
      pill.style.border = '1px solid #eaecf0';
      pill.style.borderRadius = '999px';
      pill.style.background = '#fff';
      pill.innerHTML = `<span style="font-weight:600;">${escapeHtml(m)}</span>`;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-danger btn-sm';
      del.textContent = 'x';
      del.onclick = () => {
        state.methods.splice(idx, 1);
        renderMethods();
      };
      pill.appendChild(del);
      wrap.appendChild(pill);
    });
  }

  function renderPlans() {
    const wrap = qs('paymentPlansWrap');
    if (!wrap) return;

    wrap.innerHTML = state.plans.map((p, idx) => {
      const count = Number(p.installment_count || 1);
      const dueInputs = count > 1
        ? Array.from({ length: count }).map((_, i) => {
            const v = (p.due_dates && p.due_dates[i]) ? p.due_dates[i] : '';
            return `
              <div class="form-group" style="margin:0;">
                <label style="font-size:12px; color:#667085; font-weight:600;">Installment ${i + 1} due date</label>
                <input type="date" class="form-control plan-due" data-plan="${idx}" data-i="${i}" value="${escapeHtml(v)}" />
              </div>
            `;
          }).join('')
        : '';

      return `
        <div style="border:1px solid ${state.earlyBird ? '#bbf7d0' : '#eaecf0'}; border-radius:12px; padding:12px; margin-bottom:10px; background:#fff;">
          <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="font-weight:700;">Plan ${idx + 1}</div>
              ${state.earlyBird ? '<span class="badge" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-size:11px;">Early Bird</span>' : ''}
            </div>
            <button type="button" class="btn btn-danger btn-sm" data-action="remove-plan" data-i="${idx}">Remove</button>
          </div>

          <div class="form-row" style="grid-template-columns: 1fr 180px; gap: 12px; margin-top:10px;">
            <div class="form-group" style="margin:0;">
              <label>Plan name</label>
              <input type="text" class="form-control plan-name" data-i="${idx}" value="${escapeHtml(p.plan_name || '')}" placeholder="e.g., Installment" />
            </div>
            <div class="form-group" style="margin:0;">
              <label>Installments</label>
              <input type="number" min="1" max="12" class="form-control plan-count" data-i="${idx}" value="${escapeHtml(count)}" />
            </div>
          </div>

          <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top:10px;">
            <div class="form-group" style="margin:0;">
              <label>Plan type</label>
              <select class="form-control plan-type" data-i="${idx}">
                ${[
                  { v: '', l: 'Select type' },
                  { v: 'installment', l: 'Installment (with reg fee)' },
                  { v: 'installment_early_bird', l: 'Installment (early bird)' },
                  { v: 'full_payment', l: 'Full payment (with reg fee)' },
                  { v: 'full_payment_early_bird', l: 'Full payment (early bird)' },
                ].map(o => `<option value="${o.v}" ${p.plan_type === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <label>Registration fee (LKR)</label>
              <input type="number" min="0" class="form-control plan-reg-fee" data-i="${idx}" value="${escapeHtml(String(p.registration_fee || ''))}" placeholder="e.g. 5000" />
            </div>
            <div class="form-group" style="margin:0;">
              <label>Course fee (LKR)</label>
              <input type="number" min="0" class="form-control plan-course-fee" data-i="${idx}" value="${escapeHtml(String(p.course_fee || ''))}" placeholder="e.g. 40000" />
            </div>
          </div>

          ${count > 1 ? `<div class="form-row" style="grid-template-columns: repeat(2, 1fr); gap:12px; margin-top:10px;">${dueInputs}</div>` : ''}
        </div>
      `;
    }).join('');

    // bind
    wrap.querySelectorAll('[data-action="remove-plan"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-i'));
        state.plans.splice(i, 1);
        renderPlans();
      });
    });

    wrap.querySelectorAll('.plan-name').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.getAttribute('data-i'));
        state.plans[i].plan_name = inp.value;
      });
    });

    wrap.querySelectorAll('.plan-count').forEach(inp => {
      inp.addEventListener('change', () => {
        const i = Number(inp.getAttribute('data-i'));
        const v = Math.max(Number(inp.value || 1), 1);
        state.plans[i].installment_count = v;
        state.plans[i].due_dates = Array.from({ length: v }).map((_, k) => state.plans[i].due_dates?.[k] || '');
        renderPlans();
      });
    });

    wrap.querySelectorAll('.plan-due').forEach(inp => {
      inp.addEventListener('change', () => {
        const pI = Number(inp.getAttribute('data-plan'));
        const i = Number(inp.getAttribute('data-i'));
        state.plans[pI].due_dates[i] = inp.value;
      });
    });

    wrap.querySelectorAll('.plan-type').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.getAttribute('data-i'));
        state.plans[i].plan_type = sel.value;
      });
    });

    wrap.querySelectorAll('.plan-reg-fee').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.getAttribute('data-i'));
        state.plans[i].registration_fee = inp.value;
      });
    });

    wrap.querySelectorAll('.plan-course-fee').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.getAttribute('data-i'));
        state.plans[i].course_fee = inp.value;
      });
    });
  }

  async function load(batchName) {
    const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
    const res = await fetch(`/api/payment-setup/batches/${encodeURIComponent(batchName)}`, { headers: authHeaders });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to load payment setup');

    state.earlyBird = !!(json.earlyBird || json.early_bird);
    state.reg_fee_amount = json.reg_fee_amount || json.registration_fee_amount || '';
    state.reg_fee_date = json.reg_fee_date || json.registration_fee_date || '';
    state.methods = (json.methods || []).map(m => m.method_name);
    state.plans = (json.plans || []).map(p => {
      const dues = (json.installments || []).filter(i => i.plan_id === p.id).sort((a,b) => a.installment_no - b.installment_no).map(i => i.due_date);
      return {
        plan_name: p.plan_name,
        installment_count: p.installment_count,
        due_dates: dues,
        plan_type: p.plan_type || '',
        registration_fee: p.registration_fee || '',
        course_fee: p.course_fee || ''
      };
    });

    renderMethods();
    renderPlans();
    renderBatchSettings();
  }

  async function save(batchName) {
    const methods = state.methods.map(m => validateName('Payment method', m));
    const plans = state.plans.map(p => {
      const name = validateName('Payment plan', p.plan_name);
      const count = Math.max(parseInt(p.installment_count || '1', 10) || 1, 1);
      const due_dates = Array.isArray(p.due_dates) ? p.due_dates.slice(0, count) : [];
      if (count > 1 && due_dates.some(d => !d)) {
        throw new Error(`All due dates are required for plan "${name}"`);
      }
      return {
        plan_name: name,
        installment_count: count,
        due_dates,
        plan_type: p.plan_type || '',
        registration_fee: Number.isFinite(Number(p.registration_fee)) ? Number(p.registration_fee) : 0,
        course_fee: Number.isFinite(Number(p.course_fee)) ? Number(p.course_fee) : 0
      };
    });

    const authHeaders = {
      ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
      'Content-Type': 'application/json'
    };

    const res = await fetch(`/api/payment-setup/batches/${encodeURIComponent(batchName)}` , {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        methods,
        plans,
        earlyBird: !!state.earlyBird,
        reg_fee_amount: Number.isFinite(Number(state.reg_fee_amount)) ? Number(state.reg_fee_amount) : 0,
        reg_fee_date: state.reg_fee_date || null
      })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to save setup');
  }

  async function open(batchName, { programId = '', batchId = '' } = {}) {
    qs('paymentSetupBatchName').value = batchName;
    if (qs('paymentSetupProgramId')) qs('paymentSetupProgramId').value = programId;
    if (qs('paymentSetupBatchId')) qs('paymentSetupBatchId').value = batchId;
    openModal('batchPaymentSetupModal');
    await load(batchName);
  }

  async function init() {
    const addMethodBtn = qs('paymentMethodAddBtn');
    const addMethodInput = qs('paymentMethodNew');
    const addPlanBtn = qs('paymentPlanAddBtn');
    const saveBtn = qs('paymentSetupSaveBtn');

    if (addMethodBtn && !addMethodBtn.__bound) {
      addMethodBtn.__bound = true;
      addMethodBtn.addEventListener('click', () => {
        const v = addMethodInput?.value;
        if (!v) return;
        const n = norm(v);
        if (!n) return;
        if (!state.methods.map(m => m.toLowerCase()).includes(n.toLowerCase())) {
          state.methods.push(n);
        }
        addMethodInput.value = '';
        renderMethods();
      });
    }

    if (addPlanBtn && !addPlanBtn.__bound) {
      addPlanBtn.__bound = true;
      addPlanBtn.addEventListener('click', () => {
        state.plans.push({ plan_name: '', installment_count: 1, due_dates: [''], plan_type: '', registration_fee: '', course_fee: '' });
        renderPlans();
      });
    }

    const deleteBtn = qs('paymentSetupDeleteBatchBtn');
    if (deleteBtn && !deleteBtn.__bound) {
      deleteBtn.__bound = true;
      deleteBtn.addEventListener('click', async () => {
        const programId = qs('paymentSetupProgramId')?.value;
        const batchId = qs('paymentSetupBatchId')?.value;
        const batchName = qs('paymentSetupBatchName')?.value;
        if (!programId || !batchId) {
          if (window.UI && UI.showToast) UI.showToast('Missing batch context for delete', 'error');
          return;
        }
        if (!confirm(`Delete batch "${batchName}"? This will delete Supabase leads and unlink Google Sheet mapping.`)) return;

        try {
          deleteBtn.disabled = true;
          const authHeaders = {
            ...(await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {})),
            'Content-Type': 'application/json'
          };
          const res = await fetch(`/api/programs/${encodeURIComponent(programId)}/batches/${encodeURIComponent(batchId)}`, {
            method: 'DELETE',
            headers: authHeaders
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || 'Failed to delete batch');
          closeModal('batchPaymentSetupModal');
          if (window.UI && UI.showToast) UI.showToast('Batch deleted', 'success');
          // refresh programs page if open
          if (window.initProgramsPage) window.initProgramsPage();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to delete batch', 'error');
        } finally {
          deleteBtn.disabled = false;
        }
      });
    }

    if (saveBtn && !saveBtn.__bound) {
      saveBtn.__bound = true;
      saveBtn.addEventListener('click', async () => {
        const batchName = qs('paymentSetupBatchName')?.value;
        if (!batchName) return;
        try {
          saveBtn.disabled = true;
          await save(batchName);
          if (window.UI && UI.showToast) UI.showToast('Payment setup saved', 'success');
          closeModal('batchPaymentSetupModal');
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to save payment setup', 'error');
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  }

  window.BatchPaymentSetup = { open, init };

  document.addEventListener('DOMContentLoaded', () => {
    init().catch(console.error);
  });
})();
