/**
 * Daily Checklist Page (Admin)
 */

(function () {
  const $ = (id) => document.getElementById(id);

  const SL_OFFSET_MIN = 330;

  function slTodayISO() {
    const d = new Date(Date.now() + SL_OFFSET_MIN * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function addDaysISO(dateISO, delta) {
    const d = new Date(`${dateISO}T00:00:00Z`);
    if (isNaN(d)) return null;
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function authHeaders() {
    if (window.getAuthHeadersWithRetry) return await window.getAuthHeadersWithRetry();
    // fallback
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    }
    return {};
  }

  function badge(ok) {
    const bg = ok ? '#dcfce7' : '#fee2e2';
    const fg = ok ? '#166534' : '#991b1b';
    const text = ok ? 'Submitted' : 'Not submitted';
    return `<span class="badge" style="background:${bg}; color:${fg}; border:1px solid ${ok ? '#bbf7d0' : '#fecaca'};">${text}</span>`;
  }

  function recordingSelect(value, dateISO, officerUserId) {
    const v = (value || 'na');
    const options = [
      { value: 'na', label: '—' },
      { value: 'received', label: 'Received' },
      { value: 'not_received', label: 'Not received' }
    ];
    return `
      <select class="form-control daily-checklist-recording" data-date="${escapeHtml(dateISO)}" data-officer="${escapeHtml(officerUserId)}" style="min-width:110px;">
        ${options.map(o => `<option value="${o.value}" ${o.value === v ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    `;
  }

  function isPastDayInSriLanka(dateISO) {
    // Disable once the Sri Lanka day is over.
    const nowSL = new Date(Date.now() + SL_OFFSET_MIN * 60 * 1000);
    const todaySL = nowSL.toISOString().slice(0, 10);
    return String(dateISO) < todaySL;
  }

  function renderDaySection(dateISO, officers, matrix) {
    const rows = officers.map(o => {
      const c = matrix?.[dateISO]?.[o.id] || null;
      const slot1 = c ? badge(!!c.slot1) : badge(false);
      const slot2 = c ? badge(!!c.slot2) : badge(false);
      const slot3 = c ? badge(!!c.slot3) : badge(false);
      const contacted = c ? Number(c.leadsContacted || 0) : 0;
      const newLeads = c ? Number(c.leadsToBeContacted || 0) : 0;
      const rec = recordingSelect(c?.callRecording || 'na', dateISO, o.id);

      const leadsStatus = newLeads > 0
        ? `<span style="font-size:14px; font-weight:700;">${newLeads}</span> <span style="font-size:13px;">to be contacted</span>`
        : `<span style="font-size:13px; font-weight:700; color:#166534;">All leads contacted</span>`;

      return `
        <tr>
          <td style="font-weight:700;">${escapeHtml(o.name)}</td>
          <td>${slot1}</td>
          <td>${slot2}</td>
          <td>${slot3}</td>
          <td>
            <div>${leadsStatus}</div>
          </td>
          <td>${rec}</td>
        </tr>
      `;
    }).join('');

    const recordDisabled = isPastDayInSriLanka(dateISO);

    return `
      <div class="dashboard-card" style="margin-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <h2 style="margin:0;"><i class="fas fa-calendar-day"></i> ${escapeHtml(dateISO)}</h2>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-primary daily-checklist-record-btn" data-date="${escapeHtml(dateISO)}" ${recordDisabled ? 'disabled' : ''} style="padding:6px 10px; font-size:12px; line-height:1.1;">
              <i class="fas fa-save"></i> Record
            </button>
          </div>
        </div>
        <div style="overflow:hidden; margin-top: 8px;">
          <table class="data-table" style="width:100%; table-layout:fixed;">
            <thead>
              <tr>
                <th>Officer</th>
                <th>Slot 1 report</th>
                <th>Slot 2 report</th>
                <th>Slot 3 report</th>
                <th>Leads</th>
                <th>Call recordings</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="6" class="loading">No officers found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function computeLeader(data) {
    const officers = data?.officers || [];
    const days = data?.days || [];
    const byDate = data?.byDate || {};

    // Pick leader by priority:
    // 1) Highest reports submitted
    // 2) Highest recordings received
    // 3) Lowest leads-to-be-contacted ("not contacted on time")
    const agg = new Map();
    for (const o of officers) {
      agg.set(o.id, { reports: 0, recordings: 0, toContact: 0 });
    }

    for (const d of days) {
      for (const o of officers) {
        const c = byDate?.[d]?.[o.id];
        if (!c) continue;
        const a = agg.get(o.id) || { reports: 0, recordings: 0, toContact: 0 };

        a.reports += (c.slot1 ? 1 : 0) + (c.slot2 ? 1 : 0) + (c.slot3 ? 1 : 0);
        a.recordings += (c.callRecording === 'received') ? 1 : 0;
        a.toContact += Number(c.leadsToBeContacted || 0);

        agg.set(o.id, a);
      }
    }

    let best = null;
    for (const o of officers) {
      const a = agg.get(o.id) || { reports: 0, recordings: 0, toContact: 0 };
      if (!best) {
        best = { officer: o, agg: a };
        continue;
      }

      const b = best.agg;
      const better =
        (a.reports > b.reports) ||
        (a.reports === b.reports && a.recordings > b.recordings) ||
        (a.reports === b.reports && a.recordings === b.recordings && a.toContact < b.toContact);

      if (better) best = { officer: o, agg: a };
    }

    const totals = {
      reportsTotal: (days.length || 0) * 3,
      recordingsTotal: (days.length || 0),
      daysCount: days.length || 0
    };

    return best ? { ...best, totals } : null;
  }

  async function saveRecordingStatus({ dateISO, officerUserId, status }) {
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/reports/daily-checklist/call-recording', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ dateISO, officerUserId, status })
    });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to save');
    return json.row;
  }

  async function recordSnapshotForDate(dateISO) {
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/reports/daily-checklist/snapshot', {
      method: 'POST',
      headers,
      body: JSON.stringify({ dateISO })
    });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to record snapshot');
    return json.result;
  }

  async function loadChecklist() {
    const start = $('dailyChecklistStart')?.value;
    const days = $('dailyChecklistDays')?.value || 7;
    const wrap = $('dailyChecklistWrap');
    const msg = $('dailyChecklistMsg');

    if (!start) {
      if (msg) msg.textContent = 'Please pick a week start date.';
      return;
    }

    if (wrap) wrap.innerHTML = `<div class="dashboard-card"><p class="loading">Loading checklist…</p></div>`;
    if (msg) msg.textContent = '';

    const headers = await authHeaders();
    const url = `/api/reports/daily-checklist?start=${encodeURIComponent(start)}&days=${encodeURIComponent(days)}`;
    const res = await fetch(url, { headers });
    const json = await res.json();

    if (!json?.success) {
      throw new Error(json?.error || 'Failed to load checklist');
    }

    const daysDesc = [...(json.days || [])].reverse();
    const sections = daysDesc.map(d => renderDaySection(d, json.officers || [], json.byDate || {})).join('');
    if (wrap) wrap.innerHTML = sections || `<div class="dashboard-card"><p class="loading">No data.</p></div>`;

    // Bind per-day Record snapshot buttons
    wrap?.querySelectorAll('button.daily-checklist-record-btn')?.forEach(btn => {
      if (btn.__bound) return;
      btn.__bound = true;
      btn.addEventListener('click', async () => {
        const dateISO = btn.getAttribute('data-date');
        if (!dateISO) return;

        btn.disabled = true;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recording…';
        try {
          await recordSnapshotForDate(dateISO);
          if (window.showToast) showToast(`Recorded snapshot for ${dateISO}`, 'success');
          // Reload checklist so the new snapshot values appear
          await loadChecklist();
        } catch (e) {
          console.error(e);
          if (window.showToast) showToast(e.message || 'Failed to record snapshot', 'error');
          btn.disabled = isPastDayInSriLanka(dateISO);
        } finally {
          btn.innerHTML = oldHtml;
          // If it's today, keep enabled for multiple clicks; if past day, stay disabled.
          btn.disabled = isPastDayInSriLanka(dateISO);
        }
      });
    });

    // Bind dropdown change
    wrap?.querySelectorAll('select.daily-checklist-recording')?.forEach(sel => {
      if (sel.__bound) return;
      sel.__bound = true;

      // Track previous value so we can revert on save failure
      sel.dataset.prevValue = sel.value;

      sel.addEventListener('focus', () => {
        sel.dataset.prevValue = sel.value;
      });

      sel.addEventListener('change', async () => {
        const dateISO = sel.getAttribute('data-date');
        const officerUserId = sel.getAttribute('data-officer');
        const status = sel.value;
        const prev = sel.dataset.prevValue;

        sel.disabled = true;
        try {
          await saveRecordingStatus({ dateISO, officerUserId, status });
          sel.dataset.prevValue = status;
          if (window.showToast) showToast('Saved', 'success');
        } catch (e) {
          console.error(e);
          if (window.showToast) showToast(e.message || 'Failed to save', 'error');
          sel.value = prev;
        } finally {
          sel.disabled = false;
        }
      });
    });

    const leader = computeLeader(json);
    const leaderEl = $('dailyChecklistLeader');
    const detailEl = $('dailyChecklistLeaderDetails');
    if (leaderEl) leaderEl.textContent = leader?.officer?.name ? `${leader.officer.name}` : '—';

    if (detailEl) {
      if (!leader?.agg || !leader?.totals) {
        detailEl.textContent = '';
      } else {
        const r = leader.agg;
        const t = leader.totals;
        detailEl.innerHTML = `
          <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
            <div><strong>Reports submitted:</strong> ${r.reports}/${t.reportsTotal}</div>
            <div><strong>Not contacted on time:</strong> ${r.toContact}</div>
            <div><strong>Recordings received:</strong> ${r.recordings}/${t.recordingsTotal}</div>
          </div>
        `;
      }
    }

    if (msg) msg.textContent = `Showing ${json.startISO} to ${json.endISO}`;

    // keep last payload
    window.__dailyChecklistLast = json;
  }

  function bindControlsOnce() {
    const loadBtn = $('dailyChecklistLoadBtn');
    const prevBtn = $('dailyChecklistPrevBtn');
    const nextBtn = $('dailyChecklistNextBtn');
    const thisWeekBtn = $('dailyChecklistThisWeekBtn');

    if (loadBtn && !loadBtn.__bound) {
      loadBtn.__bound = true;
      loadBtn.addEventListener('click', () => loadChecklist().catch(e => {
        console.error(e);
        if (window.showToast) showToast(e.message || 'Failed to load', 'error');
      }));
    }

    const shift = (delta) => {
      const startEl = $('dailyChecklistStart');
      if (!startEl?.value) return;
      const next = addDaysISO(startEl.value, delta);
      if (next) startEl.value = next;
      loadChecklist().catch(console.error);
    };

    if (prevBtn && !prevBtn.__bound) {
      prevBtn.__bound = true;
      prevBtn.addEventListener('click', () => shift(-7));
    }
    if (nextBtn && !nextBtn.__bound) {
      nextBtn.__bound = true;
      nextBtn.addEventListener('click', () => shift(7));
    }

    if (thisWeekBtn && !thisWeekBtn.__bound) {
      thisWeekBtn.__bound = true;
      thisWeekBtn.addEventListener('click', () => {
        const t = slTodayISO();
        // start = today-6 so we show past 7 days ending today
        const start = addDaysISO(t, -6);
        const startEl = $('dailyChecklistStart');
        if (startEl) startEl.value = start;
        loadChecklist().catch(console.error);
      });
    }
  }

  async function init() {
    const isAdminUser = (window.currentUser?.role === 'admin') || document.body.classList.contains('admin');
    if (!isAdminUser) {
      const wrap = $('dailyChecklistWrap');
      if (wrap) wrap.innerHTML = '<div class="dashboard-card"><p class="loading">Admin only.</p></div>';
      return;
    }

    bindControlsOnce();

    // Default load: last 7 days ending today
    const today = slTodayISO();
    const start = addDaysISO(today, -6);
    const startEl = $('dailyChecklistStart');
    if (startEl && !startEl.value) startEl.value = start;

    await loadChecklist();
  }

  window.initDailyChecklistPage = init;
})();
