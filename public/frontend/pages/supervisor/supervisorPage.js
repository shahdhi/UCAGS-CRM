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
   * Fetch leads for each supervised officer via the staff lead management API.
   * The API endpoint GET /api/crm-leads?scope=officer&officerId=<id> returns leads for that officer.
   */
  async function _lmLoadLeads() {
    const tbody = document.getElementById('supLmTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading leads…</td></tr>';

    const headers = await authHeaders();
    _lmAllLeads = [];

    await Promise.all(_lmOfficers.map(async (officer) => {
      try {
        // Use the staff lead management endpoint (admin can view any officer's leads)
        const res = await fetch(`/api/crm-leads?officerId=${encodeURIComponent(officer.id)}`, { headers });
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
      for (let i = 1; i <= 30; i++) {
        const d = lead[`followUp${i}Date`] || lead[`follow_up_${i}_date`] || '';
        if (d && new Date(d) >= new Date()) return `<span style="color:#8b5cf6;">${esc(fmtDate(d))}</span>`;
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
        startDate: startDate,
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

  /* ─── Public API ───────────────────────────────────────────────── */
  window.SupervisorPage = {
    initLeadManagement,
    initRegistrations,
    initDailyChecklist
  };

  console.log('✓ SupervisorPage module loaded');

})();
