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

  function normalizeLeadStatus(status) {
    if (status == null) return '';
    const raw = String(status).trim();
    if (!raw) return '';
    const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    switch (key) {
      case 'new': return 'New';
      case 'contacted': return 'Contacted';
      case 'interested': return 'Interested';
      case 'registered': return 'Registered';
      case 'enrolled': return 'Enrolled';
      case 'not interested': return 'Not Interested';
      case 'unreachable': return 'Unreachable';
      case 'no answer': return 'No Answer';
      case 'awaiting decision': return 'Awaiting Decision';
      case 'no response': return 'No Response';
      case 'next batch': return 'Next Batch';
      case 'no response next batch': return 'No Response';
      // legacy
      case 'follow-up':
      case 'follow up': return 'Interested';
      case 'closed': return 'Not Interested';
      default: return raw;
    }
  }

  function getStatusColor(status) {
    const s = normalizeLeadStatus(status);
    switch (s) {
      case 'New': return 'primary';
      case 'Contacted': return 'info';
      case 'Interested': return 'warning';
      case 'Awaiting Decision': return 'warning';
      case 'Registered': return 'success';
      case 'Enrolled': return 'success';
      case 'No Answer': return 'secondary';
      case 'Unreachable': return 'secondary';
      case 'Not Interested': return 'danger';
      case 'No Response': return 'dark';
      case 'Next Batch': return 'primary';
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
    const isSupervisor = window.currentUser?.active_role === 'supervisor';
    if (!window.currentUser || (window.currentUser.role !== 'admin' && !isSupervisor)) {
      console.warn('StaffLeadManagement: admin or supervisor only');
      return;
    }

    if (!isInitialized) {
      isInitialized = true;
      await loadProgramsIntoSelect();
      await loadOfficersIntoSelect();
      setupEventListeners();

      // React to current-batch changes from Programs -> Batch Setup
      if (!window.__staffLeadMgmtCurrentBatchListenerBound) {
        window.__staffLeadMgmtCurrentBatchListenerBound = true;
        window.addEventListener('currentBatchChanged', async () => {
          try {
            // Clear caches so we don't show stale results
            if (window.Cache) window.Cache.invalidatePrefix('leads:');
            // Reload programs, batches/sheets + refresh current table
            await loadProgramsIntoSelect();
            await loadBatchesAndSheetsForOfficer();
            await refreshStaffLeadManagement({ showSkeleton: true });
          } catch (e) {
            // ignore
          }
        });
      }

      // Preload batches/sheets for the initially-selected officer
      await loadBatchesAndSheetsForOfficer();
    }

    // initial load
    await refreshStaffLeadManagement();
    updateSubtitle();
  }

  function setupEventListeners() {
    const programSel = $('staffLeadMgmtProgramSelect');
    const officerSel = $('staffLeadMgmtOfficerSelect');
    const batchSel = $('staffLeadMgmtBatchSelect');
    const sheetSel = $('staffLeadMgmtSheetSelect');

    if (programSel) {
      programSel.addEventListener('change', async () => {
        await loadBatchesAndSheetsForOfficer();
        await refreshStaffLeadManagement();
        updateSubtitle();
      });
    }

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

  async function loadProgramsIntoSelect() {
    const sel = $('staffLeadMgmtProgramSelect');
    if (!sel) return;

    sel.innerHTML = `<option value="">Loading programs...</option>`;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/programs/sidebar', { headers });
      const json = await res.json();

      const programs = (json.programs || []).slice();
      programs.sort((a, b) => {
        const ad = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b?.created_at ? new Date(b.created_at).getTime() : 0;
        if (bd !== ad) return bd - ad;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      });

      if (!programs.length) {
        sel.innerHTML = `<option value="">No programs found</option>`;
        return;
      }

      sel.innerHTML = `<option value="">All Programs</option>` +
        programs.map(p => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.name || p.id)}</option>`).join('');

      // Store sidebar data for batch filtering later
      sel.__programBatches = json.batches || [];

      // Auto-select first (latest) program
      if (programs[0]) sel.value = String(programs[0].id);
    } catch (e) {
      console.error('Failed to load programs:', e);
      sel.innerHTML = `<option value="">All Programs</option>`;
    }
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

      let officers = (json.users || [])
        .filter(u => String(u.role).toLowerCase() !== 'admin')
        .map(u => ({ id: u.id, name: u.name }))
        .filter(u => u.id && u.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Supervisor mode: restrict to supervised officers only
      const superviseeIds = window.currentUser?.supervisees || [];
      if (window.currentUser?.active_role === 'supervisor' && superviseeIds.length > 0) {
        officers = officers.filter(o => superviseeIds.includes(o.id));
      }

      if (!officers.length) {
        sel.innerHTML = `<option value="">No officers found</option>`;
        return;
      }

      // "All Officers" option at the top — shows leads from every officer in scope
      const allLabel = window.currentUser?.active_role === 'supervisor' ? '👥 All Supervised Officers' : '👥 All Officers';
      sel.innerHTML = `<option value="__ALL__" data-name="__ALL__">${allLabel}</option>` +
        officers.map(o => `<option value="${escapeHtml(String(o.id))}" data-name="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`).join('');
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
    // Special sentinel: "All Officers" — no per-officer filter
    if (officerUserId === '__ALL__') return { officerUserId: '__ALL__', officerName: '__ALL__', allOfficers: true };
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
      const officer = getSelectedOfficer();
      if (!officer) {
        batchSel.innerHTML = `<option value="">Select officer first</option>`;
        return;
      }

      // Check if a program is selected — if so, filter batches to only that program's batches
      const programSel = $('staffLeadMgmtProgramSelect');
      const selectedProgramId = programSel?.value || '';
      const programBatches = programSel?.__programBatches || [];

      let allowedBatchNames = null; // null = no restriction
      if (selectedProgramId && programBatches.length) {
        allowedBatchNames = new Set(
          programBatches
            .filter(b => String(b.program_id) === String(selectedProgramId))
            .map(b => b.batch_name)
            .filter(Boolean)
        );
      }

      const headers = await getAuthHeaders();
      // For "All Officers", fetch batches without an assignedTo filter
      const batchUrl = officer.allOfficers
        ? `/api/crm-leads/admin/meta/batches`
        : `/api/crm-leads/admin/meta/batches?assignedTo=${encodeURIComponent(officer.officerName)}`;
      const res = await fetch(batchUrl, { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load batches');

      let batches = (json.batches || []).filter(Boolean);

      // Filter by program if one is selected
      if (allowedBatchNames) {
        batches = batches.filter(b => allowedBatchNames.has(b));
      }

      if (!batches.length) {
        batchSel.innerHTML = `<option value="">No batches for this program</option>`;
        return;
      }

      batchSel.innerHTML = `<option value="">-- Select batch --</option>` + batches.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

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
      // For "All Officers", fetch sheets without an assignedTo filter
      let url = officer.allOfficers
        ? `/api/crm-leads/admin/meta/sheets?batch=${encodeURIComponent(batch)}`
        : `/api/crm-leads/admin/meta/sheets?assignedTo=${encodeURIComponent(officer.officerName)}&batch=${encodeURIComponent(batch)}`;
      let res = await fetch(url, { headers });
      let json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load sheets');

      let sheets = (json.sheets || []).filter(Boolean);

      // If none found for batch, retry without batch filter (in case data uses different batch naming)
      if (!sheets.length) {
        url = officer.allOfficers
          ? `/api/crm-leads/admin/meta/sheets`
          : `/api/crm-leads/admin/meta/sheets?assignedTo=${encodeURIComponent(officer.officerName)}`;
        res = await fetch(url, { headers });
        json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to load sheets');
        sheets = (json.sheets || []).filter(Boolean);
      }

      const defaultSheet = 'Main Leads';

      // Add an "All Sheets" option
      sheets = ['(All Sheets)', ...sheets];

      if (!sheets.length) {
        sheetSel.innerHTML = `<option value="">No sheets</option>`;
        return;
      }

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

    const programSel = $('staffLeadMgmtProgramSelect');
    const programName = programSel?.options[programSel.selectedIndex]?.textContent || '';
    const officer = getSelectedOfficer();
    const batch = $('staffLeadMgmtBatchSelect')?.value;
    const sheet = $('staffLeadMgmtSheetSelect')?.value;

    const parts = [];
    if (programName && programSel?.value) parts.push(programName);
    if (officer?.allOfficers) parts.push('All Officers');
    else if (officer?.officerName) parts.push(officer.officerName);
    if (batch) parts.push(batch);
    if (sheet) parts.push(sheet);

    el.textContent = parts.length ? parts.join('  •  ') : "View any officer's lead lists (Supabase)";
  }

  async function refreshStaffLeadManagement({ showSkeleton = false } = {}) {
    if (isLoading) return;

    const officer = getSelectedOfficer();
    const batchSel = $('staffLeadMgmtBatchSelect');
    const sheetSel = $('staffLeadMgmtSheetSelect');

    const tbody = $('staffLeadMgmtTableBody');

    if (!officer || !batchSel || !sheetSel || !batchSel.value || !sheetSel.value) {
      staffLeads = [];
      filteredStaffLeads = [];
      renderStaffTable();
      return;
    }

    const batch = batchSel.value;
    const sheet = sheetSel.value;

    const ttlMs = 2 * 60 * 1000; // 2 minutes
    const cacheKey = officer.allOfficers
      ? `leads:staffMgmt:__ALL__:${encodeURIComponent(batch)}:${encodeURIComponent(sheet)}`
      : `leads:staffMgmt:${encodeURIComponent(officer.officerUserId)}:${encodeURIComponent(officer.officerName)}:${encodeURIComponent(batch)}:${encodeURIComponent(sheet)}`;

    // Fast path: use cache
    if (tbody && !showSkeleton && window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached && Array.isArray(cached)) {
        staffLeads = cached;
        filteredStaffLeads = [...staffLeads];
        filterStaffLeads();
        return;
      }
    }

    if (tbody && (showSkeleton || !window.Cache)) {
      const skelRow = () => `
        <tr class="table-skel-row">
          <td><div class="table-skel-line" style="width:50%"></div></td>
          <td><div class="table-skel-line" style="width:35%"></div></td>
          <td><div class="table-skel-line" style="width:60%"></div></td>
          <td><div class="table-skel-line" style="width:40%"></div></td>
          <td><div class="table-skel-line" style="width:30%"></div></td>
          <td><div class="table-skel-line" style="width:35%"></div></td>
          <td><div class="table-skel-line" style="width:25%"></div></td>
        </tr>
      `;
      tbody.innerHTML = Array.from({ length: 8 }).map(skelRow).join('');
    }

    isLoading = true;

    try {
      const headers = await getAuthHeaders();

      const batch = batchSel.value;
      const sheet = sheetSel.value;

      const params = new URLSearchParams();
      params.set('batch', batch);
      if (sheet && sheet !== '(All Sheets)') params.set('sheet', sheet);
      // Only filter by officer when a specific officer is selected
      if (!officer.allOfficers) params.set('assignedTo', officer.officerName);
      // Pass programId to scope batch_name to the correct program (prevents cross-program leakage)
      const programSel2 = $('staffLeadMgmtProgramSelect');
      const selectedProgramId2 = programSel2?.value || '';
      if (selectedProgramId2) params.set('programId', selectedProgramId2);

      const res = await fetch(`/api/crm-leads/admin?${params.toString()}`, { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load leads');

      staffLeads = (json.leads || []).map(l => ({ ...l, status: normalizeLeadStatus(l.status) }));

      // hydrate followups for each lead (admin view, officer-owned followups)
      await Promise.all(staffLeads.map(async (lead) => {
        try {
          // For "All Officers" mode, use the lead's own assignedTo user ID from lead data
          const followupOfficerId = officer.allOfficers ? (lead.assignedToUserId || lead.userId || officer.officerUserId) : officer.officerUserId;
          const fr = await fetch(`/api/crm-followups/admin/${encodeURIComponent(followupOfficerId)}/${encodeURIComponent(lead.batch)}/${encodeURIComponent(lead.sheet || 'Main Leads')}/${encodeURIComponent(lead.id)}`, { headers });
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

      // cache hydrated staff leads
      if (window.Cache) window.Cache.setWithTs(cacheKey, staffLeads);

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

      const matchesStatus = !status || normalizeLeadStatus(lead.status) === normalizeLeadStatus(status);
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
          <td colspan="8" style="text-align:center; padding:40px; color:#666;">
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
        <td><span class="badge badge-${getStatusColor(lead.status)}">${escapeHtml(normalizeLeadStatus(lead.status) || 'New')}</span></td>
        <td><span class="badge badge-${getPriorityColor(lead.priority)}">${escapeHtml(lead.priority || '-')}</span></td>
        <td>${escapeHtml(getLastFollowUpComment(lead)) || '-'}</td>
        <td>${getNextFollowUpSchedule(lead) ? escapeHtml(formatDate(getNextFollowUpSchedule(lead))) : '-'}</td>
        <td style="color:#999; font-size:12px;">${escapeHtml(lead.assignedTo || '')}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="openStaffManageLeadModal('${escapeHtml(String(lead.id))}')" title="Manage Lead">
            <i class="fas fa-edit"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  function showStaffLeadError(message) {
    const tbody = $('staffLeadMgmtTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:40px; color:#f44336;">
          <strong>Error loading leads</strong><br/>
          ${escapeHtml(message)}
        </td>
      </tr>
    `;
  }

  async function openStaffManageLeadModal(leadId) {
    const officer = getSelectedOfficer();
    if (!officer) return;

    // Provide context so leadManagement.js modal can operate on staff leads list
    window.__leadManagementContext = {
      mode: 'admin',
      leadsRef: staffLeads,
      filteredLeadsRef: filteredStaffLeads,
      onAfterSave: async () => {
        // Reload current officer view after save so table stays consistent.
        // Small delay avoids UI reverting if backend returns slightly stale reads.
        await new Promise(r => setTimeout(r, 200));
        await refreshStaffLeadManagement();
      }
    };

    if (window.openManageLeadModal) {
      await window.openManageLeadModal(leadId);
    } else {
      alert('Lead management modal not available');
    }
  }

  // Reset so officer dropdown reloads with correct role filter on next visit
  function resetStaffLeadMgmt() {
    isInitialized = false;
    isLoading = false;
    staffLeads = [];
    filteredStaffLeads = [];
  }

  // globals
  window.initStaffLeadManagementPage = initStaffLeadManagementPage;
  window.refreshStaffLeadManagement = refreshStaffLeadManagement;
  window.openStaffManageLeadModal = openStaffManageLeadModal;
  window.__staffLeadMgmtReset = resetStaffLeadMgmt;
})();
