/**
 * Staff Lead Management (Admin)
 *
 * Allows admin to view lead management data for any officer,
 * and switch between the officer's sheets (including officer-created custom tabs).
 */

(function () {
  'use strict';

  let isInitialized = false;
  let isLoading = false;

  let staffLeads = [];
  let filteredStaffLeads = [];

  async function getAuthHeaders() {
    const headers = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session && session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }
    return headers;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getStatusColor(status) {
    switch (status) {
      case 'New': return 'primary';
      case 'Contacted': return 'info';
      case 'Follow-up': return 'warning';
      case 'Registered': return 'success';
      case 'Closed': return 'secondary';
      default: return 'secondary';
    }
  }

  function getPriorityColor(priority) {
    switch (priority) {
      case 'High': return 'danger';
      case 'Medium': return 'warning';
      case 'Low': return 'secondary';
      default: return 'secondary';
    }
  }

  function formatDate(dateString) {
    try {
      if (!dateString) return '';
      const date = new Date(dateString);
      if (isNaN(date)) return String(dateString);
      return date.toLocaleString();
    } catch {
      return String(dateString || '');
    }
  }

  function getNextFollowUpSchedule(lead) {
    if (!lead || typeof lead !== 'object') return '';

    const scheduleEntries = Object.keys(lead)
      .map((key) => {
        const match = key.match(/^followUp(\d+)Schedule$/);
        if (!match) return null;
        const n = parseInt(match[1], 10);
        if (!Number.isFinite(n)) return null;
        const schedule = String(lead[key] ?? '').trim();
        if (!schedule) return null;
        return { n, schedule };
      })
      .filter(Boolean)
      .sort((a, b) => b.n - a.n);

    const latest = scheduleEntries[0];
    if (!latest) return '';

    const actual = String(lead[`followUp${latest.n}Date`] ?? '').trim();
    if (actual) return '';

    return latest.schedule;
  }

  function getLastFollowUpComment(lead) {
    if (!lead || typeof lead !== 'object') return '';

    const commentEntries = Object.keys(lead)
      .map((key) => {
        const match = key.match(/^followUp(\d+)Comment$/);
        if (!match) return null;
        const n = parseInt(match[1], 10);
        if (!Number.isFinite(n)) return null;
        const value = String(lead[key] ?? '').trim();
        return { n, value };
      })
      .filter(Boolean)
      .sort((a, b) => b.n - a.n);

    for (const entry of commentEntries) {
      if (entry.value) return entry.value;
    }

    const hasAnyCommentField = Object.keys(lead).some(k => /^followUp\d+Comment$/.test(k));
    if (!hasAnyCommentField) {
      const stored = String(lead.lastFollowUpComment ?? '').trim();
      if (stored) return stored;
    }

    return String(lead.callFeedback ?? '').trim();
  }

  async function initStaffLeadManagementPage() {
    if (!window.currentUser || window.currentUser.role !== 'admin') {
      console.warn('StaffLeadManagement: admin only');
      return;
    }

    if (!isInitialized) {
      isInitialized = true;
      await loadOfficersIntoSelect();
      setupEventListeners();

      // Preload batches/sheets for the initially-selected officer
      await loadBatchesAndSheetsForOfficer();
    }

    // initial load
    await refreshStaffLeadManagement();
    updateSubtitle();
  }

  function setupEventListeners() {
    const officerSel = $('staffLeadMgmtOfficerSelect');
    const batchSel = $('staffLeadMgmtBatchSelect');
    const sheetSel = $('staffLeadMgmtSheetSelect');

    if (officerSel) {
      officerSel.addEventListener('change', async () => {
        await loadBatchesAndSheetsForOfficer();
        await refreshStaffLeadManagement();
        updateSubtitle();
      });
    }

    if (batchSel) {
      batchSel.addEventListener('change', async () => {
        await loadSheetsForOfficerAndBatch();
        await refreshStaffLeadManagement();
        updateSubtitle();
      });
    }

    if (sheetSel) {
      sheetSel.addEventListener('change', async () => {
        await refreshStaffLeadManagement();
        updateSubtitle();
      });
    }

    const search = $('staffLeadMgmtSearchInput');
    const status = $('staffLeadMgmtStatusFilter');
    const priority = $('staffLeadMgmtPriorityFilter');

    const doFilter = () => filterStaffLeads();
    if (search) search.addEventListener('input', doFilter);
    if (status) status.addEventListener('change', doFilter);
    if (priority) priority.addEventListener('change', doFilter);
  }

  async function loadOfficersIntoSelect() {
    const sel = $('staffLeadMgmtOfficerSelect');
    if (!sel) return;

    sel.innerHTML = `<option value="">Loading officers...</option>`;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/users', { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load users');

      const officers = (json.users || [])
        .filter(u => String(u.role).toLowerCase() !== 'admin')
        .map(u => ({ id: u.id, name: u.name }))
        .filter(u => u.id && u.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!officers.length) {
        sel.innerHTML = `<option value="">No officers found</option>`;
        return;
      }

      sel.innerHTML = officers.map(o => `<option value="${escapeHtml(String(o.id))}" data-name="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`).join('');
    } catch (e) {
      console.error('Failed to load officers:', e);
      sel.innerHTML = `<option value="">Error loading officers</option>`;
    }
  }

  function getSelectedOfficer() {
    const sel = $('staffLeadMgmtOfficerSelect');
    if (!sel) return null;
    const opt = sel.options[sel.selectedIndex];
    if (!opt) return null;
    const officerUserId = opt.value;
    const officerName = opt.getAttribute('data-name') || opt.textContent;
    if (!officerUserId || !officerName) return null;
    return { officerUserId, officerName };
  }

  async function loadBatchesAndSheetsForOfficer() {
    await loadBatchesIntoSelect();
    await loadSheetsForOfficerAndBatch();
    updateSubtitle();
  }

  async function loadBatchesIntoSelect() {
    const batchSel = $('staffLeadMgmtBatchSelect');
    if (!batchSel) return;

    batchSel.innerHTML = `<option value="">Loading batches...</option>`;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/batch-leads/batches', { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load batches');

      const batches = (json.batches || []).filter(Boolean);
      batchSel.innerHTML = `<option value="">-- Select batch --</option>` + batches.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

      // auto-select first batch if none
      if (!batchSel.value && batches.length) {
        batchSel.value = batches[0];
      }
    } catch (e) {
      console.error('Failed to load batches:', e);
      batchSel.innerHTML = `<option value="">Error loading batches</option>`;
    }
  }

  async function loadSheetsForOfficerAndBatch() {
    const officer = getSelectedOfficer();
    const batchSel = $('staffLeadMgmtBatchSelect');
    const sheetSel = $('staffLeadMgmtSheetSelect');
    if (!officer || !batchSel || !sheetSel) return;

    const batch = batchSel.value;
    if (!batch) {
      sheetSel.innerHTML = `<option value="">-- Select batch first --</option>`;
      return;
    }

    sheetSel.innerHTML = `<option value="">Loading sheets...</option>`;

    try {
      const headers = await getAuthHeaders();
      const url = `/api/batch-leads/${encodeURIComponent(batch)}/officer/${encodeURIComponent(officer.officerName)}/sheets`;
      const res = await fetch(url, { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load officer sheets');

      const sheets = (json.sheets || []).filter(Boolean);
      const defaultSheet = 'Main Leads';

      sheetSel.innerHTML = sheets.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

      // prefer Main Leads
      if (sheets.includes(defaultSheet)) sheetSel.value = defaultSheet;
      else if (sheets.length) sheetSel.value = sheets[0];

      updateSubtitle();
    } catch (e) {
      console.error('Failed to load officer sheets:', e);
      sheetSel.innerHTML = `<option value="">Error loading sheets</option>`;
    }
  }

  function updateSubtitle() {
    const el = $('staffLeadMgmtSubtitle');
    if (!el) return;

    const officer = getSelectedOfficer();
    const batch = $('staffLeadMgmtBatchSelect')?.value;
    const sheet = $('staffLeadMgmtSheetSelect')?.value;

    const parts = [];
    if (officer?.officerName) parts.push(officer.officerName);
    if (batch) parts.push(batch);
    if (sheet) parts.push(sheet);

    el.textContent = parts.length ? parts.join('  •  ') : "View any officer's sheets (including personal sheets)";
  }

  async function refreshStaffLeadManagement() {
    if (isLoading) return;

    const officer = getSelectedOfficer();
    const batchSel = $('staffLeadMgmtBatchSelect');
    const sheetSel = $('staffLeadMgmtSheetSelect');

    const tbody = $('staffLeadMgmtTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="loading">Loading leads...</td></tr>`;
    }

    if (!officer || !batchSel || !sheetSel || !batchSel.value || !sheetSel.value) {
      staffLeads = [];
      filteredStaffLeads = [];
      renderStaffTable();
      return;
    }

    isLoading = true;

    try {
      const headers = await getAuthHeaders();

      const batch = batchSel.value;
      const sheet = sheetSel.value;

      const params = new URLSearchParams();
      params.set('batch', batch);
      params.set('sheet', sheet);
      params.set('assignedTo', officer.officerName);

      const res = await fetch(`/api/crm-leads/admin?${params.toString()}`, { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load leads');

      staffLeads = json.leads || [];

      // hydrate followups for each lead (admin view, officer-owned followups)
      await Promise.all(staffLeads.map(async (lead) => {
        try {
          const fr = await fetch(`/api/crm-followups/admin/${encodeURIComponent(officer.officerUserId)}/${encodeURIComponent(lead.batch)}/${encodeURIComponent(lead.sheet || 'Main Leads')}/${encodeURIComponent(lead.id)}`, { headers });
          const fj = await fr.json();
          if (!fj.success) return;
          const followups = fj.followups || [];

          followups.forEach(f => {
            const n = Number(f.sequence);
            if (!n) return;
            lead[`followUp${n}Schedule`] = f.scheduled_at ? String(f.scheduled_at).slice(0, 16) : '';
            lead[`followUp${n}Date`] = f.actual_at ? String(f.actual_at).slice(0, 16) : '';
            lead[`followUp${n}Answered`] = (f.answered === true) ? 'Yes' : (f.answered === false ? 'No' : '');
            lead[`followUp${n}Comment`] = (f.comment ?? '');
          });

          lead.lastFollowUpComment = getLastFollowUpComment(lead);
        } catch {
          // ignore
        }
      }));

      filteredStaffLeads = [...staffLeads];
      filterStaffLeads();
    } catch (e) {
      console.error('Error loading staff leads:', e);
      showStaffLeadError(e.message);
    } finally {
      isLoading = false;
    }
  }

  function filterStaffLeads() {
    const searchInput = $('staffLeadMgmtSearchInput');
    const statusFilter = $('staffLeadMgmtStatusFilter');
    const priorityFilter = $('staffLeadMgmtPriorityFilter');

    const term = (searchInput?.value || '').toLowerCase().trim();
    const status = statusFilter?.value || '';
    const prio = priorityFilter?.value || '';

    filteredStaffLeads = staffLeads.filter(lead => {
      const matchesSearch = !term ||
        lead.name?.toLowerCase().includes(term) ||
        lead.email?.toLowerCase().includes(term) ||
        String(lead.phone || '').includes(term);

      const matchesStatus = !status || lead.status === status;
      const matchesPrio = !prio || lead.priority === prio;

      return matchesSearch && matchesStatus && matchesPrio;
    });

    renderStaffTable();
  }

  function renderStaffTable() {
    const tbody = $('staffLeadMgmtTableBody');
    if (!tbody) return;

    if (!filteredStaffLeads.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px; color:#666;">
            No leads found
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredStaffLeads.map(lead => `
      <tr>
        <td><strong>${escapeHtml(lead.name)}</strong></td>
        <td>${lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a>` : '-'}</td>
        <td><span class="badge badge-${getStatusColor(lead.status)}">${escapeHtml(lead.status || 'New')}</span></td>
        <td><span class="badge badge-${getPriorityColor(lead.priority)}">${escapeHtml(lead.priority || '-')}</span></td>
        <td>${escapeHtml(getLastFollowUpComment(lead)) || '-'}</td>
        <td>${getNextFollowUpSchedule(lead) ? escapeHtml(formatDate(getNextFollowUpSchedule(lead))) : '-'}</td>
        <td style="color:#999; font-size:12px;">${escapeHtml(lead.assignedTo || '')}</td>
      </tr>
    `).join('');
  }

  function showStaffLeadError(message) {
    const tbody = $('staffLeadMgmtTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:#f44336;">
          <strong>Error loading leads</strong><br/>
          ${escapeHtml(message)}
        </td>
      </tr>
    `;
  }

  // globals
  window.initStaffLeadManagementPage = initStaffLeadManagementPage;
  window.refreshStaffLeadManagement = refreshStaffLeadManagement;
})();
