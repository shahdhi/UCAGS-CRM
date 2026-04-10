(function () {
  'use strict';

  const qs = (id) => document.getElementById(id);
  const escapeHtml = (s) => {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  };

  async function authHeaders() {
    if (window.getAuthHeadersWithRetry) return await window.getAuthHeadersWithRetry();
    if (window.getAuthHeaders) return await window.getAuthHeaders();
    return {};
  }

  async function apiGet(url) {
    const h = await authHeaders();
    const r = await fetch(url, { headers: h });
    const j = await r.json();
    if (!j?.success) throw new Error(j?.error || 'Request failed');
    return j;
  }

  async function apiPost(url, body) {
    const h = await authHeaders();
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const j = await r.json();
    if (!j?.success) throw new Error(j?.error || 'Request failed');
    return j;
  }

  async function apiPatch(url, body) {
    const h = await authHeaders();
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const j = await r.json();
    if (!j?.success) throw new Error(j?.error || 'Request failed');
    return j;
  }

  let state = {
    programId: '',
    batchName: '',
    sessions: [],
    selectedSessionId: '',
    invites: [],
    remindersByInvite: new Map(),
    reminderInviteId: '',
    officerId: '',
    _programs: [],
    _batches: []
  };

  function toDatetimeLocalValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openReminderModal(inviteId) {
    state.reminderInviteId = inviteId;
    const whenEl = qs('demoReminderWhen');
    const noteEl = qs('demoReminderNote');
    if (whenEl) whenEl.value = toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)); // default +1h
    if (noteEl) noteEl.value = '';
    if (window.openModal) window.openModal('demoReminderModal');
  }

  async function saveReminderFromModal() {
    const inviteId = state.reminderInviteId;
    const whenEl = qs('demoReminderWhen');
    if (!inviteId) throw new Error('No invite selected');
    const v = (whenEl?.value || '').trim();
    if (!v) throw new Error('Reminder time is required');
    const remindAt = new Date(v);
    if (Number.isNaN(remindAt.getTime())) throw new Error('Invalid reminder time');

    const note = (qs('demoReminderNote')?.value || '').trim();
    await apiPost(`/api/demo-sessions/invites/${encodeURIComponent(inviteId)}/reminders`, {
      remindAt: remindAt.toISOString(),
      note
    });

    await loadRemindersForInvite(inviteId);
    renderInvites();
    if (window.closeModal) window.closeModal('demoReminderModal');
    if (window.UI?.showToast) UI.showToast('Reminder added', 'success');
  }

  function renderSessions() {
    const wrap = qs('demoSessionsCards');
    if (!wrap) return;

    const cards = (state.sessions || []).map(s => {
      const active = s.id === state.selectedSessionId;
      const when = s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : 'Not scheduled';
      const title = s.title || `Demo ${s.demo_number}`;

      return `
        <button class="demo-card" data-id="${escapeHtml(s.id)}" style="text-align:left; padding:10px 10px; border-radius:14px; border:1px solid ${active ? '#7c3aed' : '#eaecf0'}; background:${active ? 'rgba(124,58,237,0.06)' : '#fff'}; cursor:pointer; min-width: 0;">
          <div style="font-weight:900; color:#101828;">${escapeHtml(title)}</div>
          <div style="margin-top:4px; font-size:12px; color:#667085;">${escapeHtml(when)}</div>
        </button>
      `;
    }).join('');

    wrap.innerHTML = cards || '<div style="color:#667085; padding:10px;">No sessions yet</div>';

    wrap.querySelectorAll('button.demo-card').forEach(btn => {
      btn.onclick = async () => {
        state.selectedSessionId = btn.getAttribute('data-id');
        renderSessions();
        await loadInvites();
      };
    });
  }

  function applyAttendanceSelectStyle(selEl) {
    if (!selEl) return;
    const v = (selEl.value || selEl.getAttribute('data-value') || '').toLowerCase();
    selEl.style.fontWeight = '700';
    if (v === 'attended') {
      selEl.style.color = '#027a48';
      selEl.style.borderColor = '#a6f4c5';
      selEl.style.background = '#ecfdf3';
    } else if (v === 'not attended') {
      selEl.style.color = '#b42318';
      selEl.style.borderColor = '#fecdca';
      selEl.style.background = '#fef3f2';
    } else {
      selEl.style.color = '';
      selEl.style.borderColor = '';
      selEl.style.background = '';
      selEl.style.fontWeight = '';
    }
  }

  function renderInvites() {
    const tbody = qs('demoInvitesTbody');
    if (!tbody) return;

    const rows = (state.invites || []).map(inv => {
      const rems = state.remindersByInvite.get(inv.id) || [];
      const remHtml = rems.map(r => {
        const when = r.sent_at ? new Date(r.sent_at).toLocaleString() : '';
        const note = (r.note || '').trim();
        const tip = [when ? `Time: ${when}` : '', note ? `Note: ${note}` : ''].filter(Boolean).join('\n');
        const titleAttr = tip ? ` title="${escapeHtml(tip)}"` : '';
        const aria = tip ? ` aria-label="${escapeHtml(tip)}"` : '';
        return `<span class="badge"${titleAttr}${aria} tabindex="0" style="background:#f2f4f7; color:#344054; border:1px solid #eaecf0; margin-right:6px; cursor:help;">R${r.reminder_number}</span>`;
      }).join('') +
        ` <button class="btn btn-secondary btn-sm" data-act="add-rem" data-id="${escapeHtml(inv.id)}" title="Add reminder"><i class="fas fa-bell"></i></button>`;

      const sel = (val, opts) => opts.map(o => `<option value="${escapeHtml(o)}" ${String(o)===String(val)?'selected':''}>${escapeHtml(o)}</option>`).join('');

      return `
        <tr>
          <td>${escapeHtml(inv.name || '')}</td>
          <td>${escapeHtml(inv.contact_number || '')}</td>
          <td>
            <select class="form-control" data-act="invite_status" data-id="${escapeHtml(inv.id)}" style="min-width:140px;">
              ${sel(inv.invite_status, ['Invited','Confirmed','Cancelled','Not reachable'])}
            </select>
          </td>
          <td style="min-width:160px;">${remHtml}</td>
          <td>
            <select class="form-control demo-attendance-select" data-act="attendance" data-id="${escapeHtml(inv.id)}" data-value="${escapeHtml(inv.attendance || '')}" style="min-width:140px;">
              ${sel(inv.attendance, ['Unknown','Attended','Not attended'])}
            </select>
          </td>
          <td>
            <select class="form-control" data-act="response" data-id="${escapeHtml(inv.id)}" style="min-width:140px;">
              ${sel(inv.response, ['Pending','Positive','Negative','Neutral'])}
            </select>
          </td>
          <td>
            <input class="form-control" data-act="comments" data-id="${escapeHtml(inv.id)}" value="${escapeHtml(inv.comments_after_inauguration || '')}" placeholder="Comments" />
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rows || '<tr><td colspan="7" style="padding:14px; color:#667085;">No invites yet</td></tr>';

    // Supervisor mode: make entire table read-only
    const isSupervisor = window.currentUser?.active_role === 'supervisor';
    if (isSupervisor) {
      tbody.querySelectorAll('select, input, button').forEach(el => {
        el.disabled = true;
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.7';
      });
      return; // skip binding change handlers
    }

    // Apply attendance colors
    tbody.querySelectorAll('select[data-act="attendance"]').forEach(applyAttendanceSelectStyle);

    // Bind change handlers
    tbody.querySelectorAll('[data-act]').forEach(el => {
      const act = el.getAttribute('data-act');
      const id = el.getAttribute('data-id');

      if (act === 'add-rem') {
        el.onclick = async () => {
          openReminderModal(id);
        };
        return;
      }

      if (el.tagName === 'SELECT') {
        el.onchange = async () => {
          const patch = {};
          patch[act] = el.value;
          try {
            await apiPatch(`/api/demo-sessions/invites/${encodeURIComponent(id)}`, patch);
            if (act === 'attendance') applyAttendanceSelectStyle(el);
          } catch (e) {
            if (window.UI?.showToast) UI.showToast(e.message, 'error');
          }
        };
      } else if (el.tagName === 'INPUT') {
        // debounce on blur
        el.onblur = async () => {
          const patch = {};
          if (act === 'comments') patch.commentsAfterInauguration = el.value;
          try {
            await apiPatch(`/api/demo-sessions/invites/${encodeURIComponent(id)}`, patch);
          } catch (e) {
            if (window.UI?.showToast) UI.showToast(e.message, 'error');
          }
        };
      }
    });
  }

  async function loadSessions() {
    const batch = state.batchName;
    const j = await apiGet(`/api/demo-sessions/sessions?batch=${encodeURIComponent(batch)}`);
    state.sessions = j.sessions || [];

    // Ensure 4 demos exist
    for (let i = 1; i <= 4; i++) {
      if (!state.sessions.find(s => Number(s.demo_number) === i)) {
        try {
          const out = await apiPost('/api/demo-sessions/sessions', { batchName: batch, demoNumber: i, patch: { title: `Demo ${i}` } });
          state.sessions.push(out.session);
        } catch (_) {}
      }
    }

    state.sessions.sort((a, b) => Number(a.demo_number) - Number(b.demo_number));
    if (!state.selectedSessionId && state.sessions[0]) state.selectedSessionId = state.sessions[0].id;
    renderSessions();
  }

  async function loadRemindersForInvite(inviteId) {
    const j = await apiGet(`/api/demo-sessions/invites/${encodeURIComponent(inviteId)}/reminders`);
    state.remindersByInvite.set(inviteId, j.reminders || []);
  }

  async function loadInvites() {
    if (!state.selectedSessionId) {
      state.invites = [];
      state.remindersByInvite = new Map();
      renderInvites();
      return;
    }

    const officerQ = state.officerId ? `&officerId=${encodeURIComponent(state.officerId)}` : '';
    const j = await apiGet(`/api/demo-sessions/invites?sessionId=${encodeURIComponent(state.selectedSessionId)}${officerQ}`);
    state.invites = j.invites || [];

    state.remindersByInvite = new Map();
    // Load reminders for each invite (small batches; okay for MVP)
    for (const inv of state.invites) {
      try {
        await loadRemindersForInvite(inv.id);
      } catch (_) {
        state.remindersByInvite.set(inv.id, []);
      }
    }

    renderInvites();
  }

  async function loadOfficersIntoSelect() {
    const sel = qs('demoOfficerSelect');
    const isAdmin = window.currentUser?.role === 'admin' || document.body.classList.contains('admin');
    const isSupervisor = window.currentUser?.active_role === 'supervisor';
    if (!sel) return;

    if (!isAdmin && !isSupervisor) {
      sel.style.display = 'none';
      state.officerId = '';
      return;
    }

    sel.style.display = '';

    try {
      const j = await apiGet('/api/users/officers');
      let officers = j.officers || [];

      // Supervisor: restrict to supervised officers only
      if (isSupervisor && !isAdmin) {
        const superviseeIds = new Set(window.currentUser?.supervisees || []);
        if (superviseeIds.size > 0) {
          officers = officers.filter(o => superviseeIds.has(o.id));
        }
      }

      const allLabel = isSupervisor && !isAdmin ? 'All supervised officers' : 'All officers';
      const opts = [`<option value="">${escapeHtml(allLabel)}</option>`].concat(
        officers.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name || o.email || o.id)}</option>`)
      );
      sel.innerHTML = opts.join('');
      sel.value = state.officerId || '';

      sel.onchange = async () => {
        state.officerId = sel.value || '';
        await loadInvites();
      };
    } catch (e) {
      sel.style.display = 'none';
      state.officerId = '';
    }
  }

  function pickLatestProgram(programs) {
    const arr = (programs || []).slice();
    // Prefer created_at desc when available; otherwise fall back to name
    arr.sort((a, b) => {
      const ad = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b?.created_at ? new Date(b.created_at).getTime() : 0;
      if (bd !== ad) return bd - ad;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
    return arr[0] || null;
  }

  function getBatchesForProgram(batches, programId) {
    return (batches || []).filter(b => String(b.program_id) === String(programId));
  }

  function sortBatchesDesc(batches) {
    return (batches || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async function loadProgramsAndBatches() {
    const auth = await authHeaders();
    const r = await fetch('/api/programs/sidebar', { headers: auth });
    const j = await r.json();
    if (!j?.success) throw new Error(j?.error || 'Failed to load programs');
    state._programs = j.programs || [];
    state._batches = j.batches || [];
  }

  async function loadProgramAndBatchSelects() {
    const progSel = qs('demoProgramSelect');
    const batchSel = qs('demoBatchSelect');
    if (!progSel || !batchSel) return;

    await loadProgramsAndBatches();

    const programs = state._programs || [];
    progSel.innerHTML = programs.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`).join('');

    // Default program: latest program
    if (!state.programId) {
      const latest = pickLatestProgram(programs);
      state.programId = latest?.id || (programs[0]?.id || '');
    }
    progSel.value = state.programId;

    const rebuildBatches = () => {
      const batchesFor = sortBatchesDesc(getBatchesForProgram(state._batches, state.programId));
      batchSel.innerHTML = batchesFor.map(b => `<option value="${escapeHtml(b.batch_name)}">${escapeHtml(b.batch_name)}</option>`).join('');

      const current = batchesFor.find(b => b.is_current);
      state.batchName = current?.batch_name || (batchesFor[0]?.batch_name || '');
      batchSel.value = state.batchName;
    };

    rebuildBatches();

    progSel.onchange = async () => {
      state.programId = progSel.value;
      rebuildBatches();
      state.selectedSessionId = '';
      state.sessions = [];
      state.invites = [];
      await refreshAll();
    };

    batchSel.onchange = async () => {
      state.batchName = batchSel.value;
      state.selectedSessionId = '';
      state.sessions = [];
      state.invites = [];
      await refreshAll();
    };
  }

  async function refreshAll() {
    if (!state.batchName) return;
    await loadSessions();
    await loadInvites();
  }

  async function initDemoSessionsPage() {
    // If admin is viewing as officer, set officerId accordingly
    if (window.currentUser && window.currentUser.role === 'admin' && window.currentUser.viewingAs && window.currentUser.viewingAs.id) {
      state.officerId = window.currentUser.viewingAs.id;
    }
    // Bind reminder modal buttons once
    const remSave = qs('demoReminderSaveBtn');
    const remCancel = qs('demoReminderCancelBtn');
    if (remSave && !remSave.__bound) {
      remSave.__bound = true;
      remSave.onclick = async () => {
        try {
          await saveReminderFromModal();
        } catch (e) {
          if (window.UI?.showToast) UI.showToast(e.message, 'error');
        }
      };
    }
    if (remCancel && !remCancel.__bound) {
      remCancel.__bound = true;
      remCancel.onclick = () => window.closeModal && window.closeModal('demoReminderModal');
    }

    const view = qs('demoSessionsView');
    if (!view) return;

    // React to current-batch changes from Programs -> Batch Setup
    if (!window.__demoSessionsCurrentBatchListenerBound) {
      window.__demoSessionsCurrentBatchListenerBound = true;
      window.addEventListener('currentBatchChanged', async () => {
        try {
          await loadProgramAndBatchSelects();
          await loadOfficersIntoSelect();
          await refreshAll();
        } catch (e) {
          // ignore
        }
      });
    }

    await loadProgramAndBatchSelects();
    await loadOfficersIntoSelect();

    const refreshBtn = qs('demoSessionsRefreshBtn');
    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.onclick = async () => {
        try {
          await refreshAll();
          if (window.UI?.showToast) UI.showToast('Demo sessions refreshed', 'success');
        } catch (e) {
          if (window.UI?.showToast) UI.showToast(e.message, 'error');
        }
      };
    }

    await refreshAll();
  }

  window.initDemoSessionsPage = initDemoSessionsPage;
})();
