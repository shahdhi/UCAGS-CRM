/**
 * Supervisor Page Module
 *
 * Provides three views for officers in "Supervisor" role:
 *  1. Lead Management   – view/filter leads of supervised officers
 *  2. Registrations     – view registrations assigned to supervised officers
 *  3. Daily Checklist   – read-only checklist for supervised officers (no Record btn, no Leader of Week)
 *
 * All data is filtered client-side to only show records belonging to the
 * officer IDs listed in currentUser.supervisees.
 */

(function () {
  'use strict';

  /* ─── Helpers ─────────────────────────────────────────────────── */

  async function authHeaders() {
    if (window.getAuthHeadersWithRetry) return await window.getAuthHeadersWithRetry();
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    }
    return {};
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmt(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /** Return the supervisee IDs for the current supervisor user */
  function getSuperviseeIds() {
    return window.currentUser?.supervisees || [];
  }

  /**
   * Fetch all officers from the API and return only those whose ID is in superviseeIds.
   * Returns [{id, name, email}, ...]
   */
  async function fetchSupervisedOfficers() {
    const ids = getSuperviseeIds();
    if (ids.length === 0) return [];

    try {
      const headers = await authHeaders();
      const res = await fetch('/api/users', { headers });
      if (!res.ok) throw new Error('Failed to load users');
      const json = await res.json();
      const allUsers = json.users || [];
      return allUsers.filter(u => ids.includes(u.id)).map(u => ({
        id: u.id,
        name: u.name || u.email,
        email: u.email
      }));
    } catch (e) {
      console.error('[Supervisor] fetchSupervisedOfficers error:', e);
      return [];
    }
  }

  /**
   * Populate an <select> element with supervised officer options.
   * @param {string} selectId  – element ID
   * @param {Array}  officers  – [{id, name}]
   */
  function populateOfficerSelect(selectId, officers) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    // Keep the first "All" option
    const allOpt = sel.querySelector('option[value=""]');
    sel.innerHTML = '';
    if (allOpt) sel.appendChild(allOpt);
    officers.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      sel.appendChild(opt);
    });
  }

  /* ─── STATUS helpers (shared with lead management) ────────────── */

  function statusBadgeClass(status) {
    switch ((status || '').toLowerCase()) {
      case 'new':               return 'primary';
      case 'contacted':         return 'info';
      case 'interested':
      case 'awaiting decision': return 'warning';
      case 'registered':
      case 'enrolled':          return 'success';
      case 'no answer':
      case 'unreachable':       return 'secondary';
      case 'not interested':    return 'danger';
      default:                  return 'secondary';
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     1.  SUPERVISOR LEAD MANAGEMENT
  ═══════════════════════════════════════════════════════════════ */

  let _lmOfficers   = [];
  let _lmAllLeads   = [];
  let _lmInited     = false;
  let _lmLoading    = false;

  async function initLeadManagement() {
    if (_lmLoading) return;
    _lmLoading = true;

    const tbody   = document.getElementById('supLmTableBody');
    const offSel  = document.getElementById('supLmOfficerSelect');
    const stSel   = document.getElementById('supLmStatusFilter');
    const search  = document.getElementById('supLmSearch');
    const refresh = document.getElementById('supLmRefreshBtn');

    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading officers…</td></tr>';

    try {
      _lmOfficers = await fetchSupervisedOfficers();

      if (_lmOfficers.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No supervised officers assigned to you yet.</td></tr>';
        _lmLoading = false;
        return;
      }

      populateOfficerSelect('supLmOfficerSelect', _lmOfficers);

      // Load leads for all supervised officers
      await _lmLoadLeads();

      // Wire up filters (only once)
      if (!_lmInited) {
        if (offSel) offSel.addEventListener('change', _lmRender);
        if (stSel)  stSel.addEventListener('change', _lmRender);
        if (search) search.addEventListener('input', _lmRender);
        if (refresh) refresh.addEventListener('click', async () => {
          _lmAllLeads = [];
          _lmInited   = false;
          await initLeadManagement();
        });
        _lmInited = true;
      }
    } catch (e) {
      console.error('[Supervisor LM] error:', e);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color:#e53e3e;">Error loading data: ${esc(e.message)}</td></tr>`;
    } finally {
      _lmLoading = false;
    }
  }

  /**
   * Fetch leads for each supervised officer via the admin CRM leads endpoint.
   * Uses GET /api/crm-leads/admin?assignedTo=<officerName> which filters by name.
   */
  async function _lmLoadLeads() {
    const tbody = document.getElementById('supLmTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading leads…</td></tr>';

    const headers = await authHeaders();
    _lmAllLeads = [];

    await Promise.all(_lmOfficers.map(async (officer) => {
      try {
        const res = await fetch(`/api/crm-leads/admin?assignedTo=${encodeURIComponent(officer.name)}`, { headers });
        if (!res.ok) return;
        const json = await res.json();
        const leads = (json.leads || json.data || []).map(l => ({ ...l, _officerName: officer.name, _officerId: officer.id }));
        _lmAllLeads.push(...leads);
      } catch (e) {
        console.warn(`[Supervisor LM] failed for officer ${officer.name}:`, e);
      }
    }));

    _lmRender();
  }

  function _lmRender() {
    const tbody  = document.getElementById('supLmTableBody');
    const offSel = document.getElementById('supLmOfficerSelect');
    const stSel  = document.getElementById('supLmStatusFilter');
    const search = document.getElementById('supLmSearch');
    if (!tbody) return;

    const offFilter    = offSel?.value  || '';
    const statusFilter = stSel?.value   || '';
    const searchTerm   = (search?.value || '').toLowerCase().trim();

    let filtered = _lmAllLeads.filter(lead => {
      if (offFilter    && lead._officerId !== offFilter) return false;
      if (statusFilter && (lead.status || '') !== statusFilter) return false;
      if (searchTerm) {
        const name  = (lead.name  || '').toLowerCase();
        const phone = (lead.phone || lead.phone_number || '').toLowerCase();
        if (!name.includes(searchTerm) && !phone.includes(searchTerm)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No leads found.</td></tr>';
      return;
    }

    // Get last followup comment
    function lastComment(lead) {
      let latest = '';
      let latestIdx = 0;
      for (let i = 1; i <= 30; i++) {
        const c = lead[`followUp${i}Comment`] || lead[`follow_up_${i}_comment`] || '';
        if (c) { latest = c; latestIdx = i; }
      }
      return latest ? `<span title="${esc(latest)}">${esc(latest.slice(0, 60))}${latest.length > 60 ? '…' : ''}</span>` : '<span style="color:#aaa;">—</span>';
    }

    function nextFollowup(lead) {
      const today = new Date();
      for (let i = 1; i <= 30; i++) {
        const scheduled = lead[`followUp${i}Schedule`] || '';
        const actual    = lead[`followUp${i}Date`]     || '';
        // Show the next scheduled follow-up that hasn't been completed yet
        if (scheduled && !actual && new Date(scheduled.slice(0,10)) >= today) {
          return `<span style="color:#8b5cf6;">${esc(fmtDate(scheduled))}</span>`;
        }
      }
      return '<span style="color:#aaa;">—</span>';
    }

    tbody.innerHTML = filtered.map(lead => `
      <tr>
        <td><span style="font-size:12px;background:rgba(139,92,246,0.12);color:#8b5cf6;padding:2px 8px;border-radius:20px;">${esc(lead._officerName)}</span></td>
        <td>${esc(lead.name || '')}</td>
        <td>${esc(lead.phone || lead.phone_number || '')}</td>
        <td><span class="badge badge-${statusBadgeClass(lead.status)}">${esc(lead.status || '—')}</span></td>
        <td>${esc(lead.priority || '—')}</td>
        <td style="max-width:200px;white-space:normal;">${lastComment(lead)}</td>
        <td>${nextFollowup(lead)}</td>
      </tr>`).join('');
  }

  /* ═══════════════════════════════════════════════════════════════
     2.  SUPERVISOR REGISTRATIONS
  ═══════════════════════════════════════════════════════════════ */

  let _regOfficers  = [];
  let _regAllRegs   = [];
  let _regInited    = false;
  let _regLoading   = false;

  async function initRegistrations() {
    if (_regLoading) return;
    _regLoading = true;

    const tbody   = document.getElementById('supRegTableBody');
    const offSel  = document.getElementById('supRegOfficerSelect');
    const refresh = document.getElementById('supRegRefreshBtn');

    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading…</td></tr>';

    try {
      _regOfficers = await fetchSupervisedOfficers();

      if (_regOfficers.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No supervised officers assigned to you yet.</td></tr>';
        _regLoading = false;
        return;
      }

      populateOfficerSelect('supRegOfficerSelect', _regOfficers);
      await _regLoadData();

      if (!_regInited) {
        if (offSel) offSel.addEventListener('change', _regRender);
        if (refresh) refresh.addEventListener('click', async () => {
          _regAllRegs = [];
          _regInited  = false;
          await initRegistrations();
        });
        _regInited = true;
      }
    } catch (e) {
      console.error('[Supervisor Reg] error:', e);
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:#e53e3e;">Error loading data: ${esc(e.message)}</td></tr>`;
    } finally {
      _regLoading = false;
    }
  }

  async function _regLoadData() {
    const tbody = document.getElementById('supRegTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading registrations…</td></tr>';

    const headers = await authHeaders();

    try {
      // Fetch all registrations (admin endpoint) then filter by supervised officer names
      const res = await fetch('/api/registrations?limit=500', { headers });
      if (!res.ok) throw new Error('Failed to load registrations');
      const json = await res.json();
      const allRegs = json.registrations || json.data || [];

      // Filter to only registrations assigned to supervised officers (by name)
      const officerNames = new Set(_regOfficers.map(o => (o.name || '').toLowerCase()));
      _regAllRegs = allRegs.filter(r => {
        const assigned = (r.assigned_to || r.payload?.assigned_to || '').toLowerCase();
        return assigned && officerNames.has(assigned);
      });
    } catch (e) {
      console.error('[Supervisor Reg] load error:', e);
      _regAllRegs = [];
    }

    _regRender();
  }

  function _regRender() {
    const tbody  = document.getElementById('supRegTableBody');
    const offSel = document.getElementById('supRegOfficerSelect');
    if (!tbody) return;

    const offFilter = offSel?.value || '';

    let filtered = _regAllRegs.filter(r => {
      if (offFilter) {
        const officer = _regOfficers.find(o => o.id === offFilter);
        if (!officer) return false;
        const assigned = (r.assigned_to || r.payload?.assigned_to || '').toLowerCase();
        if (assigned !== officer.name.toLowerCase()) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No registrations found.</td></tr>';
      return;
    }

    function cell(r, key) {
      return esc(r?.[key] ?? r?.payload?.[key] ?? '');
    }

    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td>${cell(r, 'name')}</td>
        <td>${cell(r, 'phone_number') || cell(r, 'phone')}</td>
        <td>${cell(r, 'email')}</td>
        <td>${cell(r, 'program_name') || cell(r, 'course_program')}</td>
        <td><span class="badge badge-${r.payment_status === 'paid' ? 'success' : 'secondary'}">${esc(r.payment_status || '—')}</span></td>
        <td><span class="badge badge-${r.enrolled ? 'success' : 'secondary'}">${r.enrolled ? 'Yes' : 'No'}</span></td>
        <td>${esc(r.assigned_to || r.payload?.assigned_to || '—')}</td>
        <td style="font-size:12px;color:#888;">${esc(fmt(r.created_at))}</td>
      </tr>`).join('');
  }

  /* ═══════════════════════════════════════════════════════════════
     3.  SUPERVISOR DAILY CHECKLIST  (read-only, no Record / no Leader of Week)
  ═══════════════════════════════════════════════════════════════ */

  const SL_OFFSET_MIN = 330; // Sri Lanka UTC+5:30

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

  function mondayOfWeek(dateISO) {
    const d = new Date(`${dateISO}T00:00:00Z`);
    const day = d.getUTCDay(); // 0=Sun,1=Mon,...
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function dcBadge(ok) {
    const bg = ok ? '#dcfce7' : '#fee2e2';
    const fg = ok ? '#166534' : '#991b1b';
    const text = ok ? 'Submitted' : 'Not submitted';
    return `<span class="badge" style="background:${bg};color:${fg};border:1px solid ${ok ? '#bbf7d0' : '#fecaca'};">${text}</span>`;
  }

  let _dcOfficers = [];
  let _dcInited   = false;
  let _dcLoading  = false;
  let _dcCurrentStart = '';

  async function initDailyChecklist() {
    if (_dcLoading) return;
    _dcLoading = true;

    const startEl  = document.getElementById('supDcStart');
    const daysEl   = document.getElementById('supDcDays');
    const offSel   = document.getElementById('supDcOfficerSelect');
    const loadBtn  = document.getElementById('supDcLoadBtn');
    const prevBtn  = document.getElementById('supDcPrevBtn');
    const nextBtn  = document.getElementById('supDcNextBtn');
    const thisWeek = document.getElementById('supDcThisWeekBtn');
    const wrap     = document.getElementById('supDcWrap');

    // Default start date = Monday of this week
    const today = slTodayISO();
    _dcCurrentStart = mondayOfWeek(today);
    if (startEl && !startEl.value) startEl.value = _dcCurrentStart;

    if (wrap) wrap.innerHTML = '<div style="padding:20px;color:#888;">Loading officers…</div>';

    try {
      _dcOfficers = await fetchSupervisedOfficers();

      if (_dcOfficers.length === 0) {
        if (wrap) wrap.innerHTML = '<div style="padding:20px;color:#888;">No supervised officers assigned to you yet.</div>';
        _dcLoading = false;
        return;
      }

      populateOfficerSelect('supDcOfficerSelect', _dcOfficers);

      // Wire events (only once)
      if (!_dcInited) {
        if (loadBtn) loadBtn.addEventListener('click', _dcLoad);
        if (prevBtn) prevBtn.addEventListener('click', () => {
          _dcCurrentStart = addDaysISO(_dcCurrentStart, -7) || _dcCurrentStart;
          if (startEl) startEl.value = _dcCurrentStart;
          _dcLoad();
        });
        if (nextBtn) nextBtn.addEventListener('click', () => {
          _dcCurrentStart = addDaysISO(_dcCurrentStart, 7) || _dcCurrentStart;
          if (startEl) startEl.value = _dcCurrentStart;
          _dcLoad();
        });
        if (thisWeek) thisWeek.addEventListener('click', () => {
          _dcCurrentStart = mondayOfWeek(slTodayISO());
          if (startEl) startEl.value = _dcCurrentStart;
          _dcLoad();
        });
        if (offSel) offSel.addEventListener('change', _dcLoad);
        _dcInited = true;
      }

      await _dcLoad();
    } catch (e) {
      console.error('[Supervisor DC] error:', e);
      if (wrap) wrap.innerHTML = `<div style="color:#e53e3e;padding:20px;">Error: ${esc(e.message)}</div>`;
    } finally {
      _dcLoading = false;
    }
  }

  async function _dcLoad() {
    const startEl = document.getElementById('supDcStart');
    const daysEl  = document.getElementById('supDcDays');
    const offSel  = document.getElementById('supDcOfficerSelect');
    const wrap    = document.getElementById('supDcWrap');
    if (!wrap) return;

    const startDate = startEl?.value || _dcCurrentStart || slTodayISO();
    const numDays   = parseInt(daysEl?.value || '7', 10);
    const offFilter = offSel?.value || '';

    // Build date range
    const dates = [];
    for (let i = 0; i < numDays; i++) {
      const d = addDaysISO(startDate, i);
      if (d) dates.push(d);
    }

    // Officers to show
    const officers = offFilter
      ? _dcOfficers.filter(o => o.id === offFilter)
      : _dcOfficers;

    if (officers.length === 0) {
      wrap.innerHTML = '<div style="padding:20px;color:#888;">No officers to display.</div>';
      return;
    }

    wrap.innerHTML = '<div style="padding:20px;color:#888;">Loading checklist data…</div>';

    const headers = await authHeaders();

    // Fetch checklist data from the API
    try {
      const params = new URLSearchParams({
        start: startDate,
        days: String(numDays)
      });
      const res = await fetch(`/api/reports/daily-checklist?${params}`, { headers });
      if (!res.ok) throw new Error('Failed to load checklist');
      const json = await res.json();

      // Matrix: { [dateISO]: { [officerUserId]: { slot1, slot2, slot3, leadsToBeContacted, callRecording, hasSnapshot } } }
      const matrix = json.matrix || json.data || {};

      // Build officer id → name map for the supervised officers
      const officerMap = new Map(officers.map(o => [o.id, o.name]));

      // Render per-date sections
      wrap.innerHTML = dates.map(dateISO => {
        const dateLabel = new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
        });

        const rows = officers.map(officer => {
          const c = matrix?.[dateISO]?.[officer.id] || null;
          const slot1 = dcBadge(!!c?.slot1);
          const slot2 = dcBadge(!!c?.slot2);
          const slot3 = dcBadge(!!c?.slot3);
          const newLeads  = c ? Number(c.leadsToBeContacted || 0) : 0;
          const hasSnap   = c?.hasSnapshot || false;
          const recording = c?.callRecording || 'na';

          const recLabel = { received: '✅ Received', not_received: '❌ Not received', na: '—' }[recording] || '—';

          let leadsCell;
          if (hasSnap) {
            leadsCell = `<span style="font-size:14px;font-weight:700;">${newLeads}</span> <span style="font-size:11px;color:#6b7280;">to contact ❄️</span>`;
          } else if (newLeads > 0) {
            leadsCell = `<span style="font-size:14px;font-weight:700;">${newLeads}</span> <span style="font-size:11px;color:#6b7280;">to contact</span>`;
          } else {
            leadsCell = '<span style="color:#aaa;">—</span>';
          }

          return `
            <tr>
              <td style="font-weight:600;">${esc(officer.name)}</td>
              <td>${slot1}</td>
              <td>${slot2}</td>
              <td>${slot3}</td>
              <td>${leadsCell}</td>
              <td>${esc(recLabel)}</td>
            </tr>`;
        }).join('');

        return `
          <div class="dashboard-card" style="margin-bottom:12px;">
            <h3 style="margin:0 0 12px 0;font-size:15px;color:#667085;">
              <i class="fas fa-calendar-day" style="color:#8b5cf6;margin-right:6px;"></i>${esc(dateLabel)}
            </h3>
            <div class="table-container">
              <table class="data-table" style="margin:0;">
                <thead>
                  <tr>
                    <th>Officer</th>
                    <th>Slot 1</th>
                    <th>Slot 2</th>
                    <th>Slot 3</th>
                    <th>Leads to Contact</th>
                    <th>Call Recording</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      }).join('');

    } catch (e) {
      console.error('[Supervisor DC] load error:', e);
      wrap.innerHTML = `<div style="color:#e53e3e;padding:20px;">Error loading checklist: ${esc(e.message)}</div>`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     4.  SUPERVISOR DASHBOARD
  ═══════════════════════════════════════════════════════════════ */

  const SL_OFFSET_MIN_DASH = 330; // UTC+5:30

  function dashTodayISO() {
    const d = new Date(Date.now() + SL_OFFSET_MIN_DASH * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function dashMondayOfWeek(dateISO) {
    const d = new Date(`${dateISO}T00:00:00Z`);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function dashAddDays(dateISO, n) {
    const d = new Date(`${dateISO}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Chart instances (so we can destroy & recreate on refresh)
  let _dashDonutChart = null;
  let _dashTrendChart = null;
  let _dashInited = false;
  let _dashLoading = false;

  // Color palette
  const DASH_STATUS_COLORS = {
    'New':               '#6c47ff',
    'Contacted':         '#3b82f6',
    'Interested':        '#f59e0b',
    'Awaiting Decision': '#fb923c',
    'Registered':        '#10b981',
    'Enrolled':          '#059669',
    'Not Interested':    '#ef4444',
    'No Answer':         '#94a3b8',
    'Unreachable':       '#64748b',
  };

  const OFFICER_PALETTE = ['#6c47ff','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

  async function initSupervisorDashboard() {
    if (_dashLoading) return;
    _dashLoading = true;

    _setDashLoading(true);

    try {
      const headers = await authHeaders();
      const officers = await fetchSupervisedOfficers();

      if (officers.length === 0) {
        _setDashEmpty('No supervised officers assigned to you yet.');
        return;
      }

      // ── Fetch all leads for supervised officers ──
      let allLeads = [];
      await Promise.all(officers.map(async (officer) => {
        try {
          const res = await fetch(`/api/crm-leads/admin?assignedTo=${encodeURIComponent(officer.name)}`, { headers });
          if (!res.ok) return;
          const json = await res.json();
          const leads = (json.leads || json.data || []).map(l => ({ ...l, _officerName: officer.name, _officerId: officer.id }));
          allLeads.push(...leads);
        } catch (e) { /* skip */ }
      }));

      // ── Fetch registrations ──
      let allRegs = [];
      try {
        const res = await fetch('/api/registrations?limit=1000', { headers });
        if (res.ok) {
          const json = await res.json();
          const officerNames = new Set(officers.map(o => (o.name || '').toLowerCase()));
          allRegs = (json.registrations || json.data || []).filter(r => {
            const assigned = (r.assigned_to || r.payload?.assigned_to || '').toLowerCase();
            return officerNames.has(assigned);
          });
        }
      } catch (e) { /* skip */ }

      // ── Fetch checklist (this week) ──
      const today = dashTodayISO();
      const weekStart = dashMondayOfWeek(today);
      let checklistMatrix = {};
      try {
        const params = new URLSearchParams({ start: weekStart, days: '7' });
        const res = await fetch(`/api/reports/daily-checklist?${params}`, { headers });
        if (res.ok) {
          const json = await res.json();
          checklistMatrix = json.matrix || json.data || {};
        }
      } catch (e) { /* skip */ }

      // ── Render all sections ──
      _renderStatCards(allLeads, allRegs, officers, checklistMatrix, today);
      _renderDonutChart(allLeads);
      _renderOfficerCards(officers, allLeads, allRegs, checklistMatrix);
      _renderTrendChart(officers, allLeads);
      _renderHeatmap(officers, checklistMatrix, weekStart);
      _renderLeaderboard(officers, allLeads, allRegs, checklistMatrix);
      _renderAlerts(officers, allLeads, checklistMatrix, today);

      _dashInited = true;
    } catch (e) {
      console.error('[SupervisorDashboard] error:', e);
      _setDashEmpty('Error loading dashboard: ' + esc(e.message));
    } finally {
      _dashLoading = false;
      _setDashLoading(false);
    }
  }

  function _setDashLoading(on) {
    const btn = document.getElementById('supDashRefreshBtn');
    if (btn) btn.innerHTML = on
      ? '<i class="fas fa-spinner fa-spin"></i> Loading…'
      : '<i class="fas fa-sync"></i> Refresh';
    if (btn) btn.disabled = on;
  }

  function _setDashEmpty(msg) {
    _dashLoading = false;
    _setDashLoading(false);
    ['supDashOfficerCards','supDashHeatmap','supDashLeaderboard','supDashAlerts'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div style="color:#888;padding:12px;">${msg}</div>`;
    });
  }

  /* ── Stat Cards ── */
  function _renderStatCards(leads, regs, officers, matrix, today) {
    const hot = leads.filter(l => ['interested','awaiting decision'].includes((l.status||'').toLowerCase())).length;

    // Overdue follow-ups: scheduled date is in the past AND no actual follow-up date recorded
    let overdue = 0;
    leads.forEach(l => {
      if (['registered','enrolled'].includes((l.status||'').toLowerCase())) return;
      for (let i = 1; i <= 30; i++) {
        const scheduled = l[`followUp${i}Schedule`] || '';
        const actual    = l[`followUp${i}Date`]     || '';
        if (scheduled && !actual && new Date(scheduled.slice(0,10)) < new Date(today)) {
          overdue++;
          break;
        }
      }
    });

    // Top performer by registrations
    const regsByOfficer = {};
    regs.forEach(r => {
      const name = (r.assigned_to || r.payload?.assigned_to || '').trim();
      if (name) regsByOfficer[name] = (regsByOfficer[name] || 0) + 1;
    });
    let topName = '—';
    let topCount = 0;
    Object.entries(regsByOfficer).forEach(([name, count]) => {
      if (count > topCount) { topCount = count; topName = name; }
    });

    _setText('supDashTotalLeads', leads.length);
    _setText('supDashTotalRegs', regs.length);
    _setText('supDashHotLeads', hot);
    _setText('supDashOverdueFU', overdue);
    _setText('supDashTopPerformer', topName === '—' ? '—' : `🏆 ${topName}`);
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ── Donut Chart ── */
  function _renderDonutChart(leads) {
    const canvas = document.getElementById('supDashDonutChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Count by status
    const counts = {};
    leads.forEach(l => {
      const s = l.status || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const data = labels.map(k => counts[k]);
    const colors = labels.map(l => DASH_STATUS_COLORS[l] || '#94a3b8');

    if (_dashDonutChart) { _dashDonutChart.destroy(); _dashDonutChart = null; }

    _dashDonutChart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } }
        }
      }
    });

    // Custom legend
    const legendEl = document.getElementById('supDashDonutLegend');
    if (legendEl) {
      legendEl.innerHTML = labels.map((l, i) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};display:inline-block;"></span>
          ${esc(l)} (${data[i]})
        </span>`
      ).join('');
    }
  }

  /* ── Officer Performance Cards ── */
  function _renderOfficerCards(officers, leads, regs, matrix) {
    const el = document.getElementById('supDashOfficerCards');
    if (!el) return;

    const today = dashTodayISO();
    const weekStart = dashMondayOfWeek(today);
    const weekDates = Array.from({ length: 7 }, (_, i) => dashAddDays(weekStart, i));

    el.innerHTML = officers.map((officer, idx) => {
      const officerLeads = leads.filter(l => l._officerId === officer.id);
      const officerRegs = regs.filter(r =>
        (r.assigned_to || r.payload?.assigned_to || '').toLowerCase() === officer.name.toLowerCase()
      );

      // Checklist completion this week
      let slotsSubmitted = 0, totalSlots = 0;
      weekDates.forEach(date => {
        const c = matrix?.[date]?.[officer.id];
        totalSlots += 3;
        if (c?.slot1) slotsSubmitted++;
        if (c?.slot2) slotsSubmitted++;
        if (c?.slot3) slotsSubmitted++;
      });
      const checkPct = totalSlots > 0 ? Math.round((slotsSubmitted / totalSlots) * 100) : 0;
      const checkColor = checkPct >= 80 ? '#10b981' : checkPct >= 50 ? '#f59e0b' : '#ef4444';

      const hot = officerLeads.filter(l => ['interested','awaiting decision'].includes((l.status||'').toLowerCase())).length;
      const color = OFFICER_PALETTE[idx % OFFICER_PALETTE.length];

      return `
        <div style="border:1.5px solid #e8e0ff;border-radius:12px;padding:14px;background:#faf9ff;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <div style="width:32px;height:32px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;">
              ${esc((officer.name||'?')[0].toUpperCase())}
            </div>
            <div style="font-weight:600;font-size:14px;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(officer.name)}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;color:#555;margin-bottom:10px;">
            <div><i class="fas fa-users" style="color:${color};width:14px;"></i> <b>${officerLeads.length}</b> leads</div>
            <div><i class="fas fa-fire" style="color:#f59e0b;width:14px;"></i> <b>${hot}</b> hot</div>
            <div><i class="fas fa-clipboard-check" style="color:#10b981;width:14px;"></i> <b>${officerRegs.length}</b> regs</div>
            <div><i class="fas fa-th-list" style="color:#8b5cf6;width:14px;"></i> <b>${checkPct}%</b> check</div>
          </div>
          <div style="height:6px;background:#ede9ff;border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${checkPct}%;background:${checkColor};border-radius:4px;transition:width 0.6s;"></div>
          </div>
          <div style="font-size:10px;color:#888;margin-top:3px;">Checklist this week</div>
        </div>`;
    }).join('');
  }

  /* ── Trend Line Chart ── */
  function _renderTrendChart(officers, leads) {
    const canvas = document.getElementById('supDashTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Build last 30 days
    const today = dashTodayISO();
    const days = Array.from({ length: 30 }, (_, i) => dashAddDays(today, i - 29));

    // Group leads by officer + date added
    const datasets = officers.map((officer, idx) => {
      const officerLeads = leads.filter(l => l._officerId === officer.id);
      const data = days.map(date => {
        return officerLeads.filter(l => {
          const created = (l.created_at || '').slice(0, 10);
          return created === date;
        }).length;
      });
      const color = OFFICER_PALETTE[idx % OFFICER_PALETTE.length];
      return {
        label: officer.name,
        data,
        borderColor: color,
        backgroundColor: color + '22',
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      };
    });

    const shortDays = days.map(d => {
      const dt = new Date(d + 'T00:00:00Z');
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    });

    if (_dashTrendChart) { _dashTrendChart.destroy(); _dashTrendChart = null; }

    _dashTrendChart = new Chart(canvas, {
      type: 'line',
      data: { labels: shortDays, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 10, font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } }
        }
      }
    });
  }

  /* ── Weekly Checklist Heatmap ── */
  function _renderHeatmap(officers, matrix, weekStart) {
    const el = document.getElementById('supDashHeatmap');
    if (!el) return;

    const dates = Array.from({ length: 7 }, (_, i) => dashAddDays(weekStart, i));
    const dayLabels = dates.map(d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }));

    const cellStyle = 'width:68px;height:40px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff;cursor:default;';

    const headerRow = `<tr>
      <th style="padding:6px 10px;font-size:12px;color:#667085;text-align:left;min-width:130px;">Officer</th>
      ${dayLabels.map(l => `<th style="padding:6px 4px;font-size:11px;color:#667085;text-align:center;">${esc(l)}</th>`).join('')}
      <th style="padding:6px 8px;font-size:11px;color:#667085;text-align:center;">Rate</th>
    </tr>`;

    const rows = officers.map(officer => {
      let total = 0, submitted = 0;
      const cells = dates.map(date => {
        const c = matrix?.[date]?.[officer.id];
        const s1 = c?.slot1 ? 1 : 0;
        const s2 = c?.slot2 ? 1 : 0;
        const s3 = c?.slot3 ? 1 : 0;
        const count = s1 + s2 + s3;
        total += 3; submitted += count;

        let bg, label;
        if (!c || count === 0)       { bg = '#e5e7eb'; label = '—'; }
        else if (count === 3)         { bg = '#10b981'; label = '✓✓✓'; }
        else if (count === 2)         { bg = '#f59e0b'; label = '✓✓'; }
        else                          { bg = '#fb923c'; label = '✓'; }

        const title = `${date}: ${count}/3 slots`;
        return `<td style="padding:4px;text-align:center;"><div style="${cellStyle}background:${bg};" title="${esc(title)}">${label}</div></td>`;
      }).join('');

      const rate = total > 0 ? Math.round((submitted / total) * 100) : 0;
      const rateColor = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';

      return `<tr>
        <td style="padding:6px 10px;font-size:13px;font-weight:500;color:#1e293b;">${esc(officer.name)}</td>
        ${cells}
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:${rateColor};font-size:13px;">${rate}%</td>
      </tr>`;
    }).join('');

    el.innerHTML = `<table style="border-collapse:separate;border-spacing:0;width:100%;">
      <thead>${headerRow}</thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:10px;display:flex;gap:14px;font-size:12px;color:#555;flex-wrap:wrap;">
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#10b981;margin-right:4px;"></span>All 3 slots</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#f59e0b;margin-right:4px;"></span>2 slots</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#fb923c;margin-right:4px;"></span>1 slot</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#e5e7eb;margin-right:4px;"></span>Not submitted</span>
    </div>`;
  }

  /* ── Leaderboard ── */
  function _renderLeaderboard(officers, leads, regs, matrix) {
    const el = document.getElementById('supDashLeaderboard');
    if (!el) return;

    const today = dashTodayISO();
    const weekStart = dashMondayOfWeek(today);
    const weekDates = Array.from({ length: 7 }, (_, i) => dashAddDays(weekStart, i));

    const scored = officers.map(officer => {
      const officerLeads = leads.filter(l => l._officerId === officer.id);
      const officerRegs = regs.filter(r =>
        (r.assigned_to || r.payload?.assigned_to || '').toLowerCase() === officer.name.toLowerCase()
      );
      // Checklist slots this week
      let slots = 0;
      weekDates.forEach(d => {
        const c = matrix?.[d]?.[officer.id];
        if (c?.slot1) slots++;
        if (c?.slot2) slots++;
        if (c?.slot3) slots++;
      });
      // Score: 5pts per reg + 1pt per lead + 0.5pt per slot
      const score = officerRegs.length * 5 + officerLeads.length + slots * 0.5;
      return { officer, leads: officerLeads.length, regs: officerRegs.length, slots, score };
    }).sort((a, b) => b.score - a.score);

    const medals = ['🥇','🥈','🥉'];

    el.innerHTML = scored.map((s, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f0eeff;${i === scored.length - 1 ? 'border:none;' : ''}">
        <div style="font-size:20px;width:28px;text-align:center;">${medals[i] || `#${i+1}`}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.officer.name)}</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">${s.regs} regs · ${s.leads} leads · ${s.slots}/21 slots</div>
        </div>
        <div style="font-size:13px;font-weight:700;color:#6c47ff;">${Math.round(s.score)}<span style="font-size:10px;color:#aaa;font-weight:400;">pts</span></div>
      </div>`).join('');
  }

  /* ── Alerts ── */
  function _renderAlerts(officers, leads, matrix, today) {
    const el = document.getElementById('supDashAlerts');
    if (!el) return;

    const alerts = [];

    // 1. Officers who have missed any checklist slot in the last 2 days
    officers.forEach(officer => {
      let missedSlots = 0;
      let totalSlots = 0;
      for (let i = 1; i <= 2; i++) {
        const d = dashAddDays(today, -i);
        const c = matrix?.[d]?.[officer.id];
        totalSlots += 3;
        if (!c || !c.slot1) missedSlots++;
        if (!c || !c.slot2) missedSlots++;
        if (!c || !c.slot3) missedSlots++;
      }
      if (missedSlots > 0) {
        alerts.push({
          type: 'warning',
          icon: 'fa-clipboard-list',
          msg: `<b>${esc(officer.name)}</b> missed <b>${missedSlots}</b> checklist slot${missedSlots > 1 ? 's' : ''} in the last 2 days.`
        });
      }
    });

    // 2. Officers with overdue follow-ups (scheduled past + no actual date recorded)
    const overdueCounts = {};
    leads.forEach(l => {
      if (['registered','enrolled'].includes((l.status||'').toLowerCase())) return;
      for (let i = 1; i <= 30; i++) {
        const scheduled = l[`followUp${i}Schedule`] || '';
        const actual    = l[`followUp${i}Date`]     || '';
        if (scheduled && !actual && new Date(scheduled.slice(0,10)) < new Date(today)) {
          overdueCounts[l._officerName] = (overdueCounts[l._officerName] || 0) + 1;
          break;
        }
      }
    });
    Object.entries(overdueCounts).forEach(([name, count]) => {
      if (count > 0) {
        alerts.push({
          type: 'danger',
          icon: 'fa-calendar-times',
          msg: `<b>${esc(name)}</b> has <b>${count}</b> overdue follow-up${count > 1 ? 's' : ''}.`
        });
      }
    });

    // 3. Officers with no leads at all
    officers.forEach(officer => {
      const count = leads.filter(l => l._officerId === officer.id).length;
      if (count === 0) {
        alerts.push({
          type: 'info',
          icon: 'fa-user-slash',
          msg: `<b>${esc(officer.name)}</b> has no leads assigned yet.`
        });
      }
    });

    if (alerts.length === 0) {
      el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:#10b981;padding:10px 0;">
        <i class="fas fa-check-circle" style="font-size:18px;"></i>
        <span style="font-size:14px;font-weight:500;">All good! No issues found.</span>
      </div>`;
      return;
    }

    const alertColors = {
      warning: { bg: '#fffbeb', border: '#fde68a', icon: '#f59e0b', text: '#92400e' },
      danger:  { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444', text: '#991b1b' },
      info:    { bg: '#eff6ff', border: '#bfdbfe', icon: '#3b82f6', text: '#1e40af' },
    };

    el.innerHTML = alerts.map(a => {
      const c = alertColors[a.type] || alertColors.info;
      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:${c.bg};border:1.5px solid ${c.border};border-radius:8px;margin-bottom:8px;">
        <i class="fas ${a.icon}" style="color:${c.icon};margin-top:2px;flex-shrink:0;"></i>
        <span style="font-size:13px;color:${c.text};">${a.msg}</span>
      </div>`;
    }).join('');
  }

  /* ─── Public API for Dashboard ─────────────────────────────────── */
  window.SupervisorDashboard = {
    init: initSupervisorDashboard,
    refresh: async function () {
      _dashInited = false;
      await initSupervisorDashboard();
    }
  };

  /* ─── Public API ───────────────────────────────────────────────── */
  window.SupervisorPage = {
    initLeadManagement,
    initRegistrations,
    initDailyChecklist
  };

  console.log('✓ SupervisorPage module loaded');

})();
