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
    batchName: '',
    sessions: [],
    selectedSessionId: '',
    invites: [],
    remindersByInvite: new Map()
  };

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

  function renderInvites() {
    const tbody = qs('demoInvitesTbody');
    if (!tbody) return;

    const rows = (state.invites || []).map(inv => {
      const rems = state.remindersByInvite.get(inv.id) || [];
      const remHtml = rems.map(r => `<span class="badge" style="background:#f2f4f7; color:#344054; border:1px solid #eaecf0; margin-right:6px;">R${r.reminder_number}</span>`).join('') +
        ` <button class="btn btn-secondary btn-sm" data-act="add-rem" data-id="${escapeHtml(inv.id)}"><i class="fas fa-bell"></i></button>`;

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
            <select class="form-control" data-act="attendance" data-id="${escapeHtml(inv.id)}" style="min-width:140px;">
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

    // Bind change handlers
    tbody.querySelectorAll('[data-act]').forEach(el => {
      const act = el.getAttribute('data-act');
      const id = el.getAttribute('data-id');

      if (act === 'add-rem') {
        el.onclick = async () => {
          const note = prompt('Reminder note (optional):') || '';
          try {
            await apiPost(`/api/demo-sessions/invites/${encodeURIComponent(id)}/reminders`, { note });
            await loadRemindersForInvite(id);
            renderInvites();
            if (window.UI?.showToast) UI.showToast('Reminder added', 'success');
          } catch (e) {
            if (window.UI?.showToast) UI.showToast(e.message, 'error');
          }
        };
        return;
      }

      if (el.tagName === 'SELECT') {
        el.onchange = async () => {
          const patch = {};
          patch[act] = el.value;
          try {
            await apiPatch(`/api/demo-sessions/invites/${encodeURIComponent(id)}`, patch);
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
    if (!state.selectedSessionId) return;
    const j = await apiGet(`/api/demo-sessions/invites?sessionId=${encodeURIComponent(state.selectedSessionId)}`);
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

  async function loadBatchesIntoSelect() {
    const sel = qs('demoBatchSelect');
    if (!sel) return;

    const auth = await authHeaders();
    const r = await fetch('/api/programs/sidebar', { headers: auth });
    const j = await r.json();
    const batches = (j.batches || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    sel.innerHTML = batches.map(b => `<option value="${escapeHtml(b.batch_name)}">${escapeHtml(b.batch_name)}</option>`).join('');

    const current = batches.find(b => b.is_current);
    state.batchName = current?.batch_name || (batches[0]?.batch_name || '');
    sel.value = state.batchName;

    sel.onchange = async () => {
      state.batchName = sel.value;
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
    const view = qs('demoSessionsView');
    if (!view) return;

    // React to current-batch changes from Programs -> Batch Setup
    if (!window.__demoSessionsCurrentBatchListenerBound) {
      window.__demoSessionsCurrentBatchListenerBound = true;
      window.addEventListener('currentBatchChanged', async () => {
        try {
          await loadBatchesIntoSelect();
          await refreshAll();
        } catch (e) {
          // ignore
        }
      });
    }

    await loadBatchesIntoSelect();

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
