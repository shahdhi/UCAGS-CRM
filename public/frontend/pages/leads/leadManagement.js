/**
 * Lead Management Page
 * For officers to track and manage their leads with detailed follow-up information
 */

(function() {
  'use strict';
  
  // State
  let managementLeads = []; // Original data from server (immutable)
  let filteredManagementLeads = []; // Filtered/sorted data for display
  let isInitialized = false;
  let isLoading = false; // Prevent concurrent loads

  // Optional context override (used by admin Staff Lead Management view)
  // window.__leadManagementContext = {
  //   mode: 'admin',
  //   leadsRef: [],
  //   filteredLeadsRef: [],
  //   onAfterSave: async () => {}
  // }
  function getLeadManagementContext() {
    return window.__leadManagementContext || null;
  }

  function getContextLeads() {
    const ctx = getLeadManagementContext();
    return ctx?.leadsRef || managementLeads;
  }

  function getContextFilteredLeads() {
    const ctx = getLeadManagementContext();
    return ctx?.filteredLeadsRef || filteredManagementLeads;
  }

  const CANONICAL_LEAD_STATUSES = [
    'New',
    'Contacted',
    'Interested',
    'Registered',
    'Enrolled',
    'Not Interested',
    'Unreachable',
    'No Answer',
    'Awaiting Decision',
    'No Response',
    'Next Batch'
  ];

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

      // Legacy values still present in older UI
      case 'follow-up':
      case 'follow up': return 'Interested';
      case 'closed': return 'Not Interested';

      default:
        // If it already matches canonical (case-insensitive), return canonical-cased version
        const match = CANONICAL_LEAD_STATUSES.find(s => s.toLowerCase() === key);
        return match || raw;
    }
  }

/**
 * Initialize Lead Management page
 */
async function initLeadManagementPage() {
  // Setup event listeners only once
  if (!isInitialized) {
    setupManagementEventListeners();
    isInitialized = true;
  }

  // React to current-batch changes from Programs -> Batch Setup
  if (!window.__leadManagementCurrentBatchListenerBound) {
    window.__leadManagementCurrentBatchListenerBound = true;
    window.addEventListener('currentBatchChanged', async () => {
      try {
        // Reset so dropdown defaults to new current batch
        window.officerBatchFilter = '';
        window.officerSheetFilter = 'Main Leads';

        // Clear cached leads so we don't show stale data
        if (window.Cache) window.Cache.invalidatePrefix('leads:');

        const view = document.getElementById('lead-managementView');
        const visible = view && (view.classList.contains('active') || view.style.display !== 'none');
        if (visible) {
          await loadLeadManagement();
        }
      } catch (e) {
        // ignore
      }
    });
  }

  // Always load leads when page is opened
  await loadLeadManagement();

  // If calendar navigation requested opening a specific lead, open it
  if (window.__openLeadAfterNav && window.__openLeadAfterNav.leadId) {
    const leadId = window.__openLeadAfterNav.leadId;
    window.__openLeadAfterNav = null;

    // Small delay to ensure table is rendered
    setTimeout(() => {
      const row = document.querySelector(`#managementTableBody tr[data-lead-id="${CSS.escape(String(leadId))}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('lead-row-highlight');
        setTimeout(() => row.classList.remove('lead-row-highlight'), 3500);
      }

      // Open modal after scroll starts
      setTimeout(() => {
        if (window.openManageLeadModal) {
          window.openManageLeadModal(leadId);
        }
      }, 250);
    }, 200);
  }
}

/**
 * Setup event listeners (called once on first init)
 */
function setupManagementEventListeners() {
  // Search input — client-side filter only, no reload
  const searchInput = document.getElementById('managementSearchInput');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => filterManagementLeads(), 250);
    });
  }

  // Status filter — client-side filter only, no reload
  const statusFilter = document.getElementById('managementStatusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => filterManagementLeads());
  }

  // Priority filter — client-side filter only, no reload
  const priorityFilter = document.getElementById('managementPriorityFilter');
  if (priorityFilter) {
    priorityFilter.addEventListener('change', () => filterManagementLeads());
  }
}

/**
 * Load leads for management
 */
async function loadLeadManagement() {
  // Prevent multiple simultaneous loads
  if (isLoading) {
    return;
  }

  const ttlMs = 2 * 60 * 1000; // 2 minutes

  // Cache key depends on officer + batch + sheet
  const batchFilter = window.officerBatchFilter;
  const sheet = window.officerSheetFilter || 'Main Leads';

  // Do not overwrite the page title with the sheet name; sheet is shown via tabs
  // (Title is managed by app.js navigation)
  try {
    const titleEl = document.getElementById('leadManagementViewTitle');
    if (titleEl && !/Lead Management/i.test(titleEl.textContent || '')) {
      titleEl.innerHTML = `<i class="fas fa-tasks"></i> Lead Management`;
    }
  } catch (_) {}
  const officerKey = window.currentUser?.id || window.currentUser?.email || window.currentUser?.name || 'me';
  const programKey = window.adminProgramId || window.officerProgramId || 'noprog';
  const cacheKey = `leads:management:${encodeURIComponent(officerKey)}:${encodeURIComponent(programKey)}:${encodeURIComponent(batchFilter||'all')}:${encodeURIComponent(sheet)}`;

  // Sheet tabs (officer)
  // IMPORTANT: render tabs even when serving leads from cache, otherwise the tab bar can disappear.
  async function renderManagementSheetTabs() {
    const tabsEl = document.getElementById('managementSheetTabs');
    if (!tabsEl) return;

    const batch = window.officerBatchFilter;
    if (!batch || batch === 'all') {
      tabsEl.style.display = 'none';
      tabsEl.innerHTML = '';
      return;
    }

    const currentSheet = window.officerSheetFilter || 'Main Leads';

    let authHeaders = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session && session.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }

    let sheets = ['Main Leads', 'Extra Leads', 'Foxes'];
    const _userCacheId = (window.currentUser?.id || window.currentUser?.email || window.currentUser?.name || 'anon');
    const mgmtSheetsCacheKey = `__mgmtSheets_${batch}_${_userCacheId}`;
    if (window[mgmtSheetsCacheKey]) {
      sheets = window[mgmtSheetsCacheKey];
    } else {
      try {
        const res = await fetch(`/api/crm-leads/meta/sheets?batch=${encodeURIComponent(batch)}`, { headers: authHeaders });
        const json = await res.json();
        if (json.success && Array.isArray(json.sheets)) {
          sheets = Array.from(new Set([...sheets, ...json.sheets]));
          window[mgmtSheetsCacheKey] = sheets;
        }
      } catch (e) {
        console.warn('Failed to load management sheets list', e);
      }
    }

    tabsEl.style.display = 'flex';
    tabsEl.innerHTML = '';

    const makeTab = (name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '999px';
      btn.style.border = (name === currentSheet) ? '1px solid #592c88' : '1px solid #eaecf0';
      btn.style.background = (name === currentSheet) ? '#f4ebff' : '#fff';
      btn.style.color = (name === currentSheet) ? '#592c88' : '#344054';
      btn.textContent = name;
      btn.addEventListener('click', () => {
        // Instant active UI (don't wait for reload)
        try {
          tabsEl.querySelectorAll('button.btn').forEach(b => {
            const active = (b.textContent === name);
            b.style.border = active ? '1px solid #592c88' : '1px solid #eaecf0';
            b.style.background = active ? '#f4ebff' : '#fff';
            b.style.color = active ? '#592c88' : '#344054';
          });
        } catch (_) {}

        window.officerSheetFilter = name;
        const isAdmin2 = window.currentUser && window.currentUser.role === 'admin';
        const pid2 = isAdmin2 ? (window.adminProgramId || '') : (window.officerProgramId || '');
        const batchSlug2 = pid2
          ? `${encodeURIComponent(pid2)}__PROG__${encodeURIComponent(batch)}`
          : encodeURIComponent(batch);
        window.location.hash = `lead-management-batch-${batchSlug2}__sheet__${encodeURIComponent(name)}`;

        // Call loadLeadManagement directly — skip tab re-render to prevent flicker
        window.__skipManagementTabRender = true;
        loadLeadManagement().finally(() => {
          window.__skipManagementTabRender = false;
        });
      });
      return btn;
    };

    sheets.forEach(s => tabsEl.appendChild(makeTab(s)));

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary';
    addBtn.style.padding = '6px 10px';
    addBtn.textContent = '+ Add sheet';
    addBtn.addEventListener('click', () => {
      if (window.openAddSheetModal) {
        window.openAddSheetModal({ batchName: batch, scope: 'officer' });
      }
    });
    tabsEl.appendChild(addBtn);

    // refresh on created
    if (!tabsEl.__createdBound) {
      tabsEl.__createdBound = true;
      document.addEventListener('sheet:created', (ev) => {
        const d = ev.detail || {};
        if (String(d.batchName) !== String(batch)) return;
        if (d.sheetName) window.officerSheetFilter = d.sheetName;
        // Invalidate sheets cache so new tab appears
        const _uid2 = (window.currentUser?.id || window.currentUser?.email || window.currentUser?.name || 'anon');
        delete window[`__mgmtSheets_${batch}_${_uid2}`];
        // Reset skip flag so new sheet tab gets rendered, then load
        window.__skipManagementTabRender = false;
        loadLeadManagement();
      });
    }
  }

  // Render tabs only if not triggered by a tab click (prevents re-render loop and flickering)
  if (!window.__skipManagementTabRender) {
    try { await renderManagementSheetTabs(); } catch (_) { /* ignore */ }
  }

  // Fast path: use cache and skip fetch.
  // NOTE: if batchFilter is empty we are about to auto-select program's current batch,
  // so do NOT serve cached "all" data.
  if (window.Cache && batchFilter && batchFilter !== 'all') {
    const cached = window.Cache.getFresh(cacheKey, ttlMs);
    if (cached && Array.isArray(cached)) {
      managementLeads = cached;
      filteredManagementLeads = [...managementLeads];
      filterManagementLeads(/* skipRender */ true);
      renderManagementTable();
      return;
    }
  }

  if (isLoading) return;
  isLoading = true;
  
  try {
    if (!window.currentUser || !window.currentUser.name) {
      console.error('No current user found');
      isLoading = false;
      return;
    }
    
    // Get auth token
    let authHeaders = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session && session.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }
    }
    
    // Supabase CRM: load leads
    // Use isOfficerMode to detect actual officers OR admins impersonating officers
    const isAdmin = window.currentUser && window.currentUser.role === 'admin' && !(window.currentUser.viewingAs?.name);
    const isOfficerMode = window.currentUser && (window.currentUser.role !== 'admin' || window.currentUser.viewingAs?.name);
    
    // Program selector (admin only - hide for officers including impersonating admins)
    const programSelect = document.getElementById('managementProgramSelect');
    if (programSelect && !programSelect.__bound) {
      programSelect.__bound = true;

      if (!isAdmin) {
        programSelect.style.display = 'none';
      } else {
        programSelect.style.display = '';
        // Load programs and default to latest program
        (async () => {
          try {
            const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
            const r = await fetch('/api/programs/sidebar', { headers: authHeaders });
            const j = await r.json();
            const programs = (j.programs || []).slice();
            programs.sort((a, b) => {
              const ad = a?.created_at ? new Date(a.created_at).getTime() : 0;
              const bd = b?.created_at ? new Date(b.created_at).getTime() : 0;
              if (bd !== ad) return bd - ad;
              return String(a?.name || '').localeCompare(String(b?.name || ''));
            });

            programSelect.innerHTML = programs.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`).join('');

            if (!window.adminProgramId) window.adminProgramId = programs[0]?.id || '';
            programSelect.value = window.adminProgramId || '';

            programSelect.addEventListener('change', () => {
              window.adminProgramId = programSelect.value;
              // Reset batch filter so it auto-selects current batch for this program
              window.adminBatchFilter = '';
              window.adminSheetFilter = 'Main Leads';
              loadLeadManagement();
            });
          } catch (e) {
            console.warn('Failed to load programs for management program filter', e);
            programSelect.style.display = 'none';
          }
        })();
      }
    }
    
    // Program context batch dropdown (admin + officer)
    const sel = document.getElementById('managementProgramBatchSelect');
    if (sel) {
      const programId = isAdmin ? window.adminProgramId : window.officerProgramId;
      if (programId) {
        sel.style.display = '';
        if (!sel.__bound) {
          sel.__bound = true;
          sel.addEventListener('change', () => {
            const v = sel.value;
            if (v) {
              if (isAdmin) {
                window.adminBatchFilter = v;
                window.adminSheetFilter = 'Main Leads';
              } else {
                window.officerBatchFilter = v;
                window.officerSheetFilter = 'Main Leads';
              }
              // navigate to keep URL in sync
              const pid = isAdmin ? (window.adminProgramId || '') : (window.officerProgramId || '');
              const batchSlug = pid
                ? `${encodeURIComponent(pid)}__PROG__${encodeURIComponent(v)}`
                : encodeURIComponent(v);
              window.location.hash = `lead-management-batch-${batchSlug}__sheet__${encodeURIComponent('Main Leads')}`;
              // Sheet tabs will re-fetch for new batch (no cache for new batch key)
              loadLeadManagement();
            }
          });
        }

        if (!sel.__loadedFor || sel.__loadedFor !== programId) {
          sel.__loadedFor = programId;
          try {
            const authHeaders = {};
            if (window.supabaseClient) {
              const { data: { session } } = await window.supabaseClient.auth.getSession();
              if (session && session.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
            const r = await fetch('/api/programs/sidebar', { headers: authHeaders });
            const j = await r.json();
            const batches = (j.batches || []).filter(b => String(b.program_id) === String(programId));
            const current = batches.find(b => b.is_current);
            sel.innerHTML = '';
            batches.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).forEach(b => {
              const opt = document.createElement('option');
              opt.value = b.batch_name;
              opt.textContent = b.batch_name;
              sel.appendChild(opt);
            });
            const active = isAdmin ? window.adminBatchFilter : window.officerBatchFilter;
            if (active && active !== 'all') {
              sel.value = active;
            } else if (current?.batch_name) {
              sel.value = current.batch_name;
              // Keep filter in sync when auto-selecting current batch
              if (isAdmin) {
                window.adminBatchFilter = current.batch_name;
              } else {
                window.officerBatchFilter = current.batch_name;
              }
            }
          } catch (e) {
            console.warn('Failed to load batches for management dropdown', e);
          }
        }
      } else {
        sel.style.display = 'none';
      }
    }

    // Use officer filters when in officer mode (actual officer OR admin impersonating)
    const batchFilter = isOfficerMode ? window.officerBatchFilter : window.adminBatchFilter;
    const sheet = isOfficerMode ? (window.officerSheetFilter || 'Main Leads') : (window.adminSheetFilter || 'Main Leads');

    const params = new URLSearchParams();
    if (batchFilter && batchFilter !== 'all') params.set('batch', decodeURIComponent(batchFilter));
    if (sheet) params.set('sheet', sheet);
    // Pass programId to scope batch_name to the correct program
    const programIdForQuery = isOfficerMode ? window.officerProgramId : window.adminProgramId;
    if (programIdForQuery) params.set('programId', programIdForQuery);

    // If admin impersonating officer, always use admin endpoint with assignedTo filter
    const viewingAsName = window.currentUser?.viewingAs?.name;
    let endpoint;
    if (viewingAsName) {
        // Admin viewing as officer - ALWAYS use admin endpoint with assignedTo
        endpoint = '/api/crm-leads/admin';
        params.set('assignedTo', viewingAsName);
    } else {
        // Normal case: officer uses /my, admin uses /admin
        endpoint = isOfficerMode ? '/api/crm-leads/my' : '/api/crm-leads/admin';
    }

    const res = await fetch(`${endpoint}?${params.toString()}`, { headers: authHeaders });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load leads');
    managementLeads = (data.leads || []).map(l => ({ ...l, status: normalizeLeadStatus(l.status) }));

    // Load normalized followups for each lead (officer-owned) and hydrate legacy fields
    // This keeps the current UI working while storing followups in Supabase.
    await Promise.all(managementLeads.map(async (lead) => {
      try {
        const fr = await fetch(`/api/crm-followups/my/${encodeURIComponent(lead.batch)}/${encodeURIComponent(lead.sheet || 'Main Leads')}/${encodeURIComponent(lead.id)}`, { headers: authHeaders });
        const fj = await fr.json();
        if (!fj.success) return;
        const followups = fj.followups || [];

        // Map followups rows to legacy followUpN* fields (sequence-based)
        followups.forEach(f => {
          const n = Number(f.sequence);
          if (!n) return;
          // IMPORTANT: Do NOT fall back to existing lead fields here.
          // If the followup row has null/empty values (e.g. officer cleared Actual Date / Comment),
          // we must reflect that and not resurrect the old value from management_json.
          lead[`followUp${n}Schedule`] = f.scheduled_at ? String(f.scheduled_at).slice(0, 16) : '';
          lead[`followUp${n}Date`] = f.actual_at ? String(f.actual_at).slice(0, 16) : '';
          lead[`followUp${n}Answered`] = (f.answered === true) ? 'Yes' : (f.answered === false ? 'No' : '');
          lead[`followUp${n}Comment`] = (f.comment ?? '');
        });

        // Recompute derived fields
        lead.lastFollowUpComment = getLastFollowUpComment(lead);
      } catch (e) {
        // ignore
      }
    }));

    // If no leads exist, keep empty list (do NOT inject mock leads in production)
    if (managementLeads.length === 0) {
    }

    // cache hydrated leads for faster reloads
    if (window.Cache) window.Cache.setWithTs(cacheKey, managementLeads);

    // Apply filters then render once (skipRender=true so filterManagementLeads doesn't double-render)
    filterManagementLeads(/* skipRender */ true);
    renderManagementTable();
    
  } catch (error) {
    console.error('Error loading management leads:', error);
    showManagementError(error.message);
  } finally {
    isLoading = false;
  }
}

/**
 * Filter management leads (client-side only — no API call)
 * @param {boolean} skipRender - if true, only update filteredManagementLeads without re-rendering
 */
function filterManagementLeads(skipRender) {
  const searchInput = document.getElementById('managementSearchInput');
  const statusFilter = document.getElementById('managementStatusFilter');
  const priorityFilter = document.getElementById('managementPriorityFilter');

  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const statusValue = normalizeLeadStatus(statusFilter ? statusFilter.value : '');
  const priorityValue = priorityFilter ? priorityFilter.value : '';

  filteredManagementLeads = managementLeads.filter(lead => {
    const matchesSearch = !searchTerm ||
      lead.name?.toLowerCase().includes(searchTerm) ||
      lead.email?.toLowerCase().includes(searchTerm) ||
      String(lead.phone || '').includes(searchTerm);

    const matchesStatus = !statusValue || normalizeLeadStatus(lead.status) === statusValue;
    const matchesPriority = !priorityValue || lead.priority === priorityValue;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  if (!skipRender) renderManagementTable();
}

/**
 * Render management table
 */
function renderManagementTable() {
  const tbody = document.getElementById('managementTableBody');
  if (!tbody) {
    console.error('[MGMT-LEADS] ERROR: managementTableBody element not found!');
    return;
  }
  
  if (filteredManagementLeads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px;">
          <i class="fas fa-inbox" style="font-size: 48px; color: #ccc; margin-bottom: 10px;"></i>
          <p style="color: #666;">No leads found</p>
          <p style="color: #999; font-size: 14px;">Try adjusting your search or filters</p>
        </td>
      </tr>
    `;
    return;
  }
  
  // Helper: extract YYYY-MM-DD label from a date value
  const toDateLabel = (dateVal) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d)) return '';
      return d.toISOString().slice(0, 10);
    } catch { return ''; }
  };

  // Helper: human-friendly date label
  const formatDateLabel = (label) => {
    if (!label) return 'Unknown Date';
    try {
      const d = new Date(label + 'T00:00:00');
      if (isNaN(d)) return label;
      const today = new Date(); today.setHours(0,0,0,0);
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      if (d.getTime() === today.getTime()) return 'Today';
      if (d.getTime() === yesterday.getTime()) return 'Yesterday';
      return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return label; }
  };

  let lastDateLabel = null;
  let rowNum = 0;
  const rows = [];
  filteredManagementLeads.forEach(lead => {
    const dateLabel = toDateLabel(lead.createdDate);
    if (dateLabel !== lastDateLabel) {
      lastDateLabel = dateLabel;
      rows.push(`
        <tr class="leads-date-divider" style="pointer-events:none;">
          <td colspan="9" style="padding: 6px 12px; background: #f8f8fc; border-top: 1px solid #e9ecef; border-bottom: 1px solid #e9ecef;">
            <span style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#592c88; letter-spacing:0.03em;">
              <i class="fas fa-calendar-alt" style="font-size:11px; opacity:0.7;"></i>
              ${escapeHtml(formatDateLabel(dateLabel))}
            </span>
          </td>
        </tr>
      `);
    }
    rowNum++;
    rows.push(`
      <tr data-lead-id="${escapeHtml(String(lead.id))}">
        <td style="width:36px; text-align:center; color:#aaa; font-size:12px; font-weight:500; user-select:none;">${rowNum}</td>
        <td><strong>${escapeHtml(lead.name)}</strong></td>
        <td>${lead.phone ? `<a href="tel:${lead.phone}">${escapeHtml(lead.phone)}</a>` : '-'}</td>
        <td><span class="badge badge-${getStatusColor(lead.status)}">${escapeHtml(normalizeLeadStatus(lead.status) || 'New')}</span></td>
        <td><span class="badge badge-${getPriorityColor(lead.priority)}">${escapeHtml(lead.priority || '-')}</span></td>
        <td>${escapeHtml(getLastFollowUpComment(lead)) || '-'}</td>
        <td>${getNextFollowUpSchedule(lead) ? formatDate(getNextFollowUpSchedule(lead)) : '-'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="openManageLeadModal('${lead.id}')" title="Manage Lead">
            <i class="fas fa-edit"></i>
          </button>
        </td>
      </tr>
    `);
  });
  tbody.innerHTML = rows.join('');
}

/**
 * Get check icon for boolean values
 */
function getNextFollowUpSchedule(lead) {
  // Determine next follow-up to display as the scheduled date/time of the LAST follow-up (highest N).
  // If that same follow-up has an actual date/time filled, return empty.
  // Supports unlimited follow-ups (followUp1..., followUp2..., etc.)
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
  // Always prefer the latest (highest-numbered) non-empty follow-up comment.
  // Only if there are no follow-up comments at all, fall back to "Feedback After Call" (callFeedback).
  if (!lead || typeof lead !== 'object') return '';

  // Collect followUpNComment fields dynamically (supports unlimited follow-ups)
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
    .sort((a, b) => b.n - a.n); // highest follow-up number first

  for (const entry of commentEntries) {
    if (entry.value) return entry.value;
  }

  // Backward compatibility:
  // Only fall back to stored derived value if there are NO followUpNComment fields at all.
  // If followUpNComment fields exist but are empty, that means the officer intentionally cleared them.
  const hasAnyCommentField = Object.keys(lead).some(k => /^followUp\d+Comment$/.test(k));
  if (!hasAnyCommentField) {
    const stored = String(lead.lastFollowUpComment ?? '').trim();
    if (stored) return stored;
  }

  return String(lead.callFeedback ?? '').trim();
}

/**
 * Get priority badge color
 */
function getPriorityColor(priority) {
  switch(priority) {
    case 'High': return 'danger';
    case 'Medium': return 'warning';
    case 'Low': return 'secondary';
    default: return 'secondary';
  }
}

/**
 * Get status badge color
 */
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

/**
 * Show error message
 */
function showManagementError(message) {
  const tbody = document.getElementById('managementTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: #f44336;">
          <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 10px;"></i>
          <p><strong>Error loading leads</strong></p>
          <p>${escapeHtml(message)}</p>
        </td>
      </tr>
    `;
  }
}

/**
 * Open manage lead modal with full tracking fields
 */
async function openManageLeadModal(leadId) {
  const lead = getContextFilteredLeads().find(l => l.id == leadId);
  if (!lead) {
    alert('Lead not found');
    return;
  }
  
  const modalHTML = `
    <div class="modal-overlay" id="manageLeadModal" onclick="closeManageLeadModal(event)">
      <div class="modal-dialog manage-lead-dialog" onclick="event.stopPropagation()" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h2><i class="fas fa-tasks"></i> Manage Lead: ${escapeHtml(lead.name)}</h2>
          <button class="modal-close" onclick="closeManageLeadModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <form id="manageLeadForm">
            
            <!-- Section 1: Quick Actions / Outreach -->
            <div style="background: #f0f7ff; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 12px 0; color: #1976d2;">
                <i class="fas fa-paper-plane"></i> Initial Outreach
              </h3>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" id="pdfSent" ${lead.pdfSent ? 'checked' : ''} style="width: 20px; height: 20px;">
                  <span><i class="fas fa-file-pdf" style="color: #f44336;"></i> PDF Sent</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" id="waSent" ${lead.waSent ? 'checked' : ''} style="width: 20px; height: 20px;">
                  <span><i class="fab fa-whatsapp" style="color: #25D366;"></i> WhatsApp Sent</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" id="emailSent" ${lead.emailSent ? 'checked' : ''} style="width: 20px; height: 20px;">
                  <span><i class="fas fa-envelope" style="color: #1976d2;"></i> Email Sent</span>
                </label>
              </div>
            </div>
            
            <!-- Section 2: Lead Status & Priority -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 20px;">
              <div class="form-group">
                <label for="leadStatus"><i class="fas fa-info-circle"></i> Lead Status *</label>
                <select id="leadStatus" class="form-control" required>
                  ${CANONICAL_LEAD_STATUSES.map(s => `<option value="${s}" ${normalizeLeadStatus(lead.status) === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label for="priority"><i class="fas fa-flag"></i> Priority Level *</label>
                <select id="priority" class="form-control" required>
                  <option value="">-- Select Priority --</option>
                  <option value="High" ${lead.priority === 'High' ? 'selected' : ''}>🔴 High</option>
                  <option value="Medium" ${lead.priority === 'Medium' ? 'selected' : ''}>🟡 Medium</option>
                  <option value="Low" ${lead.priority === 'Low' ? 'selected' : ''}>🟢 Low</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="nextFollowUp"><i class="fas fa-calendar"></i> Next Follow-up</label>
                <input type="datetime-local" id="nextFollowUp" class="form-control" value="${getNextFollowUpSchedule(lead) || ''}" readonly>
              </div>
            </div>
            
            <!-- Section 3: Feedback After Call -->
            <div class="form-group" style="margin-bottom: 20px;">
              <label for="callFeedback"><i class="fas fa-comment"></i> Feedback After Call</label>
              <textarea id="callFeedback" class="form-control" rows="3" placeholder="Enter notes from your call with this lead...">${escapeHtml(lead.callFeedback || '')}</textarea>
            </div>
            
            <!-- Section 4: Follow-ups Container -->
            <div id="followUpsContainer">
              <!-- 1st Follow-up (Always visible) -->
              <div class="followup-section" style="background: #fff3e0; padding: 16px; border-radius: 8px; border-left: 4px solid #ff9800; margin-bottom: 16px;">
                <h3 style="margin: 0 0 12px 0; color: #e65100;">
                  <i class="fas fa-phone"></i> 1st Follow-up
                </h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 12px;">
                  <div class="form-group">
                    <label for="followUp1Schedule"><i class="fas fa-calendar-plus"></i> Scheduled Date & Time</label>
                    <input type="datetime-local" id="followUp1Schedule" class="form-control" value="${lead.followUp1Schedule || ''}">
                  </div>
                  <div class="form-group">
                    <label for="followUp1Date"><i class="fas fa-calendar-check"></i> Actual Date & Time</label>
                    <input type="datetime-local" id="followUp1Date" class="form-control" value="${lead.followUp1Date || ''}">
                  </div>
                  <div class="form-group">
                    <label for="followUp1Answered"><i class="fas fa-question-circle"></i> Answered?</label>
                    <select id="followUp1Answered" class="form-control">
                      <option value="">-- Select --</option>
                      <option value="Yes" ${lead.followUp1Answered === 'Yes' ? 'selected' : ''}>✓ Yes</option>
                      <option value="No" ${lead.followUp1Answered === 'No' ? 'selected' : ''}>✗ No</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label for="followUp1Comment"><i class="fas fa-sticky-note"></i> Comment After 1st Follow-up</label>
                  <textarea id="followUp1Comment" class="form-control" rows="2" placeholder="Notes from 1st follow-up...">${escapeHtml(lead.followUp1Comment || '')}</textarea>
                </div>
              </div>
              
              ${generateAdditionalFollowUps(lead, 2)}
            </div>
            
            <!-- Add More Follow-up Button -->
            <div style="text-align: center; margin-bottom: 20px;">
              <button type="button" class="btn btn-secondary" onclick="addMoreFollowUp()" id="addFollowUpBtn">
                <i class="fas fa-plus-circle"></i> Add Another Follow-up
              </button>
              <span id="followUpCount" style="margin-left: 12px; color: #666; font-size: 14px;">
                (1 follow-up added)
              </span>
            </div>
            
            <!-- Invite to Demo Session -->
            <div style="background:#f8f5ff; padding: 12px; border-radius: 10px; margin-bottom: 12px; border: 1px solid #e9d7fe;">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
                <div>
                  <div style="font-weight:900; color:#5b21b6;"><i class=\"fas fa-chalkboard-teacher\"></i> Invite to Demo Session</div>
                  <div style="font-size:12px; color:#667085; margin-top:2px;">Invite this lead to Demo 1..4 for the batch and track attendance/response.</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="demoGoToPageBtn" title="Open Demo Sessions page">
                  <i class="fas fa-external-link-alt"></i> Open
                </button>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
                <select id="demoInviteNumber" class="form-control" style="width:140px;">
                  <option value="1">Demo 1</option>
                  <option value="2">Demo 2</option>
                  <option value="3">Demo 3</option>
                  <option value="4">Demo 4</option>
                </select>
                <button type="button" class="btn btn-primary btn-sm" id="demoInviteBtn">
                  <i class="fas fa-paper-plane"></i> Invite
                </button>
                <span id="demoInviteMsg" style="font-size:12px; color:#667085;"></span>
              </div>
            </div>

            <!-- Demo Session Details (read-only; reflects Demo Sessions page updates) -->
            <div style="background:#ffffff; padding: 12px; border-radius: 10px; margin-bottom: 12px; border: 1px solid #eaecf0;">
              <div style="font-weight:900; color:#101828; margin-bottom:6px;"><i class=\"fas fa-bell\"></i> Demo Session Tracking</div>
              <div id="demoSessionDetails" style="font-size:12px; color:#667085;">Loading demo session details...</div>
            </div>

            <!-- Contact Information (Read-only reference) -->
            <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
              <strong>Contact:</strong> 
              ${lead.phone ? `<a href="tel:${lead.phone}"><i class="fas fa-phone"></i> ${escapeHtml(lead.phone)}</a>` : 'No phone'} | 
              ${lead.email ? `<a href="mailto:${lead.email}"><i class="fas fa-envelope"></i> ${escapeHtml(lead.email)}</a>` : 'No email'}
            </div>

            <!-- Extra Details (from lead form) -->
            <div style="background: #fafafa; padding: 12px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #eee;">
              <div style="display:grid; grid-template-columns: 1fr 2fr; gap: 8px 12px;">
                <div style="color:#666;">Platform</div>
                <div>${escapeHtml(getLeadIntakeValue(lead, 'platform')) || '-'}</div>
                <div style="color:#666;">Planning to start immediately</div>
                <div>${escapeHtml(getLeadIntakeValue(lead,
                  'are_you_planning_to_start_immediately?',
                  'are_you_planning_to_start_immediately',
                  'planning_to_start_immediately',
                  'start_immediately',
                  'start immediately',
                  'Are you planning to start immediately?'
                )) || '-'}</div>
                <div style="color:#666;">Why interested</div>
                <div>${escapeHtml(getLeadIntakeValue(lead,
                  'why_are_you_interested_in_this_diploma?',
                  'why_are_you_interested_in_this_diploma',
                  'why_interested',
                  'interest_reason',
                  'Why are you interested in this diploma?'
                )) || '-'}</div>
              </div>
            </div>
            
            <div class="modal-footer" style="border-top: 1px solid #e0e0e0; padding-top: 16px; display: flex; justify-content: flex-end; gap: 10px;">
              <button type="button" class="btn btn-secondary" onclick="closeManageLeadModal()">Cancel</button>
              <button type="submit" class="btn btn-primary">
                <i class="fas fa-save"></i> Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  document.body.style.overflow = 'hidden';

  // Demo session tracking actions (remove invite)
  const demoWrap = document.getElementById('demoSessionDetails');
  if (demoWrap && !demoWrap.__bound) {
    demoWrap.__bound = true;
    demoWrap.onclick = async (ev) => {
      const btn = ev.target.closest('[data-act="demo-remove-invite"]');
      if (!btn) return;
      const inviteId = btn.getAttribute('data-invite-id');
      if (!inviteId) return;
      if (!confirm('Remove this participant from the demo session?')) return;

      try {
        const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
        const res = await fetch(`/api/demo-sessions/invites/${encodeURIComponent(inviteId)}`, {
          method: 'DELETE',
          headers: authHeaders
        });
        const json = await res.json();
        if (!json?.success) throw new Error(json?.error || 'Failed to remove demo invite');
        if (window.UI?.showToast) UI.showToast('Removed from demo session', 'success');
        await loadDemoSessionDetailsIntoModal(lead);
      } catch (e) {
        if (window.UI?.showToast) UI.showToast(e.message, 'error');
      }
    };
  }

  // Load demo session details (read-only)
  try { await loadDemoSessionDetailsIntoModal(lead); } catch (_) { /* ignore */ }

  // Demo invite actions
  try {
    const goBtn = document.getElementById('demoGoToPageBtn');
    if (goBtn) {
      goBtn.onclick = () => {
        window.location.hash = 'demo-sessions';
        if (window.navigateToPage) window.navigateToPage('demo-sessions');
      };
    }

    const inviteBtn = document.getElementById('demoInviteBtn');
    if (inviteBtn) {
      inviteBtn.onclick = async () => {
        const msgEl = document.getElementById('demoInviteMsg');
        const demoNumber = Number(document.getElementById('demoInviteNumber')?.value || '1');
        try {
          inviteBtn.disabled = true;
          if (msgEl) msgEl.textContent = 'Inviting…';

          const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
          const res = await fetch('/api/demo-sessions/invite', {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchName: lead.batch,
              demoNumber,
              lead: {
                supabaseId: lead.supabaseId,
                batch: lead.batch,
                sheet: lead.sheet,
                sheetLeadId: lead.sheetLeadId,
                name: lead.name,
                phone: lead.phone
              }
            })
          });
          const json = await res.json();
          if (!json?.success) throw new Error(json?.error || 'Invite failed');

          if (msgEl) msgEl.textContent = `Invited to Demo ${demoNumber}`;
          if (window.UI?.showToast) UI.showToast(`Invited ${lead.name} to Demo ${demoNumber}`, 'success');

          // Refresh tracking block so Lead Management reflects latest Demo Sessions page values
          try { await loadDemoSessionDetailsIntoModal(lead); } catch (_) { /* ignore */ }
        } catch (e) {
          if (msgEl) msgEl.textContent = e.message;
          if (window.UI?.showToast) UI.showToast(e.message, 'error');
        } finally {
          inviteBtn.disabled = false;
        }
      };
    }
  } catch (e) {
    // ignore
  }

  // Bind submit handler safely (avoid inline onsubmit quoting issues)
  const form = document.getElementById('manageLeadForm');
  if (form) {
    form.addEventListener('submit', (e) => saveLeadManagement(e, String(leadId)));
  }

  // Supervisor mode: make entire modal read-only
  if (window.currentUser?.active_role === 'supervisor') {
    const modal = document.getElementById('manageLeadModal');
    if (modal) {
      // Disable all inputs, selects, textareas
      modal.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(el => {
        el.disabled = true;
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.7';
      });
      // Hide the save/submit button completely
      const submitBtn = modal.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.style.display = 'none';
      // Add a read-only banner
      const header = modal.querySelector('.modal-header');
      if (header) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#f0f4ff;border:1px solid #c7d7ff;color:#3b5bdb;padding:6px 16px;font-size:13px;display:flex;align-items:center;gap:6px;';
        banner.innerHTML = '<i class="fas fa-eye"></i> <span>Read-only — Supervisors cannot edit lead data</span>';
        header.insertAdjacentElement('afterend', banner);
      }
    }
  }

}

/**
 * Close manage lead modal
 */
function closeManageLeadModal(event) {
  if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) {
    return;
  }
  
  const modal = document.getElementById('manageLeadModal');
  if (modal) {
    modal.remove();
  }
  document.body.style.overflow = '';
}

/**
 * Save lead management data
 */
async function saveLeadManagement(event, leadId) {
  event.preventDefault();
  
  try {
    // Collect all form data (including dynamic follow-ups)
    const managementData = {
      pdfSent: document.getElementById('pdfSent').checked,
      waSent: document.getElementById('waSent').checked,
      emailSent: document.getElementById('emailSent').checked,
      status: normalizeLeadStatus(document.getElementById('leadStatus').value),
      priority: document.getElementById('priority').value,
      nextFollowUp: document.getElementById('nextFollowUp').value,
      callFeedback: document.getElementById('callFeedback').value
    };
    
    // Collect all follow-up data (unlimited)
    // IMPORTANT: Use the section's data-followup attribute so deletions don't shift numbering.
    const container = document.getElementById('followUpsContainer');
    const followUpSections = container ? container.querySelectorAll('.followup-section') : [];

    // First clear any existing followUpN* fields on the lead (so removed followups are truly removed)
    const existingLead = getContextLeads().find(l => l.id == leadId) || {};
    Object.keys(existingLead).forEach(k => {
      if (/^followUp\d+(Schedule|Date|Answered|Comment)$/.test(k)) {
        managementData[k] = '';
      }
    });

    followUpSections.forEach((section, index) => {
      const num = Number(section.dataset.followup) || (index + 1);
      // Use section.querySelector as fallback in case getElementById fails (e.g. duplicate IDs or rendering issues)
      const scheduleEl = document.getElementById(`followUp${num}Schedule`) || section.querySelector(`[id$="Schedule"]`);
      const dateEl = document.getElementById(`followUp${num}Date`) || section.querySelector(`[id$="Date"]`);
      const answeredEl = document.getElementById(`followUp${num}Answered`) || section.querySelector(`select[id$="Answered"]`);
      const commentEl = document.getElementById(`followUp${num}Comment`) || section.querySelector(`[id$="Comment"]`);
      
      if (scheduleEl) managementData[`followUp${num}Schedule`] = scheduleEl.value;
      if (dateEl) managementData[`followUp${num}Date`] = dateEl.value;
      if (answeredEl) managementData[`followUp${num}Answered`] = answeredEl.value;
      if (commentEl) managementData[`followUp${num}Comment`] = commentEl.value;
    });

    // Auto-set Next Follow-up based on the LAST follow-up schedule (highest N).
    // Rule (as requested):
    //  - If last follow-up is 1st, show 1st followUpSchedule; if last is 2nd, show 2nd, and so on.
    //  - If the last follow-up's actual date is filled, show nothing.
    managementData.nextFollowUp = getNextFollowUpSchedule(managementData) || '';
    
    console.log('Saving lead management data:', managementData);

    // Optimistic UI: update local state + close modal immediately
    const lead = getContextLeads().find(l => l.id == leadId);
    if (!lead) throw new Error('Lead not found');

    Object.assign(lead, managementData);
    lead.lastFollowUpComment = getLastFollowUpComment(lead);

    // Close modal and refresh table immediately (fast UX)
    closeManageLeadModal();
    {
      const ctx = getLeadManagementContext();
      if (!ctx) {
        renderManagementTable();
      }
    }

    // Show immediate feedback
    showToast('Saving changes...', 'info');

    // Save to backend in background
    (async () => {
      try {
        const ctx = getLeadManagementContext();
        const batch = lead.batch;
        const sheet = lead.sheet || 'Main Leads';
        const isAdminMode = ctx?.mode === 'admin';

        let authHeaders = { 'Content-Type': 'application/json' };
        if (window.supabaseClient) {
          const { data: { session } } = await window.supabaseClient.auth.getSession();
          if (session && session.access_token) {
            authHeaders['Authorization'] = `Bearer ${session.access_token}`;
          }
        }

        const endpoint = isAdminMode
          ? `/api/crm-leads/admin/${encodeURIComponent(batch)}/${encodeURIComponent(sheet)}/${encodeURIComponent(lead.id)}`
          : `/api/crm-leads/my/${encodeURIComponent(batch)}/${encodeURIComponent(sheet)}/${encodeURIComponent(lead.id)}`;

        const res = await fetch(endpoint, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(lead)
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to save');

        if (json.lead) {
          Object.assign(lead, json.lead);
        }

        // Invalidate leads caches (officer + admin views)
        if (window.Cache) window.Cache.invalidatePrefix('leads:');

        // Ensure status is always in canonical form for table rendering
        lead.status = normalizeLeadStatus(lead.status);

        // Notify caller (staff view) if present
        if (ctx?.onAfterSave) {
          try { await ctx.onAfterSave(json.lead || lead); } catch (e) { /* ignore */ }
        } else {
          renderManagementTable();
        }

        showToast('Saved successfully!', 'success');
      } catch (err) {
        console.error('Background save failed:', err);
        showToast('Save failed: ' + (err.message || err), 'error');

        // Reload to ensure UI reflects server truth
        const ctx = getLeadManagementContext();
        if (!ctx) {
          try { await loadLeadManagement(); } catch (e) { /* ignore */ }
        }
      }
    })();

    // TODO: Phase 3 - Save to tracking spreadsheet
    console.log('Note: Data currently stored in memory. Phase 3 will save to tracking sheet.');
    
  } catch (error) {
    console.error('Error saving lead management:', error);
    if (window.showToast) {
      showToast('Failed to save: ' + error.message, 'error');
    } else {
      alert('Failed to save: ' + error.message);
    }
  }
}

/**
 * Format date helper
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date)) return dateString;
  // If time exists, show date+time
  const hasTime = /T\d{2}:\d{2}/.test(dateString);
  return hasTime ? date.toLocaleString() : date.toLocaleDateString();
}

/**
 * Escape HTML helper
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Intake helper (same idea as leadsPage.js) so Lead Management modal can display
// values even when keys include punctuation like '?' or are nested in intake_json.
function normalizeIntakeKey(k) {
  return String(k || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getLeadIntakeValue(lead, ...candidateKeys) {
  if (!lead || typeof lead !== 'object') return '';

  let intake = lead.intake_json || lead.intake || {};

  // intake_json may be stringified JSON
  if (typeof intake === 'string') {
    try { intake = JSON.parse(intake); } catch { intake = {}; }
  }

  // Merge: intake first, then top-level lead (so legacy fields still work)
  const merged = { ...(typeof intake === 'object' && intake ? intake : {}), ...lead };

  // Direct match first
  for (const k of candidateKeys) {
    if (!k) continue;
    const v = merged[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }

  // Fuzzy match by normalized keys
  const nmap = new Map();
  Object.keys(merged).forEach(key => nmap.set(normalizeIntakeKey(key), key));
  for (const k of candidateKeys) {
    const realKey = nmap.get(normalizeIntakeKey(k));
    if (!realKey) continue;
    const v = merged[realKey];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }

  return '';
}

/**
 * Generate additional follow-up sections (2+) based on existing data
 */
function generateAdditionalFollowUps(lead, startNum) {
  let html = '';
  const colors = ['#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff9c4']; // Blue, Purple, Green, Yellow
  const borderColors = ['#2196f3', '#9c27b0', '#4caf50', '#ffc107'];
  
  // Find all follow-up data in lead object
  let maxFollowUp = startNum;
  for (let key in lead) {
    const match = key.match(/followUp(\d+)/);
    if (match && parseInt(match[1]) > maxFollowUp) {
      maxFollowUp = parseInt(match[1]);
    }
  }
  
  for (let i = startNum; i <= maxFollowUp; i++) {
    const hasData = lead[`followUp${i}Schedule`] || lead[`followUp${i}Date`] || 
                    lead[`followUp${i}Answered`] || lead[`followUp${i}Comment`];
    
    if (hasData) {
      const colorIndex = (i - 2) % colors.length;
      html += `
        <div class="followup-section" data-followup="${i}" style="background: ${colors[colorIndex]}; padding: 16px; border-radius: 8px; border-left: 4px solid ${borderColors[colorIndex]}; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; color: ${borderColors[colorIndex]};">
              <i class="fas fa-phone"></i> ${getOrdinal(i)} Follow-up
            </h3>
            <button type="button" class="btn btn-sm btn-danger" onclick="removeFollowUp(${i})" style="padding: 4px 8px;">
              <i class="fas fa-times"></i> Remove
            </button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 12px;">
            <div class="form-group">
              <label for="followUp${i}Schedule"><i class="fas fa-calendar-plus"></i> Scheduled Date & Time</label>
              <input type="datetime-local" id="followUp${i}Schedule" class="form-control" value="${lead[`followUp${i}Schedule`] || ''}">
            </div>
            <div class="form-group">
              <label for="followUp${i}Date"><i class="fas fa-calendar-check"></i> Actual Date & Time</label>
              <input type="datetime-local" id="followUp${i}Date" class="form-control" value="${lead[`followUp${i}Date`] || ''}">
            </div>
            <div class="form-group">
              <label for="followUp${i}Answered"><i class="fas fa-question-circle"></i> Answered?</label>
              <select id="followUp${i}Answered" class="form-control">
                <option value="">-- Select --</option>
                <option value="Yes" ${lead[`followUp${i}Answered`] === 'Yes' ? 'selected' : ''}>✓ Yes</option>
                <option value="No" ${lead[`followUp${i}Answered`] === 'No' ? 'selected' : ''}>✗ No</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="followUp${i}Comment"><i class="fas fa-sticky-note"></i> Comment After ${getOrdinal(i)} Follow-up</label>
            <textarea id="followUp${i}Comment" class="form-control" rows="2" placeholder="Notes from ${getOrdinal(i)} follow-up...">${escapeHtml(lead[`followUp${i}Comment`] || '')}</textarea>
          </div>
        </div>
      `;
    }
  }
  
  return html;
}

/**
 * Get ordinal number (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(num) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Add more follow-up section dynamically
 */
function addMoreFollowUp() {
  const container = document.getElementById('followUpsContainer');
  const existingSections = container.querySelectorAll('.followup-section');
  const nextNum = existingSections.length + 1;
  
  const colors = ['#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff9c4'];
  const borderColors = ['#2196f3', '#9c27b0', '#4caf50', '#ffc107'];
  const colorIndex = (nextNum - 2) % colors.length;
  
  const newSection = document.createElement('div');
  newSection.className = 'followup-section';
  newSection.dataset.followup = nextNum;
  newSection.style.cssText = `background: ${colors[colorIndex]}; padding: 16px; border-radius: 8px; border-left: 4px solid ${borderColors[colorIndex]}; margin-bottom: 16px;`;
  newSection.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h3 style="margin: 0; color: ${borderColors[colorIndex]};">
        <i class="fas fa-phone"></i> ${getOrdinal(nextNum)} Follow-up
      </h3>
      <button type="button" class="btn btn-sm btn-danger" onclick="removeFollowUp(${nextNum})" style="padding: 4px 8px;">
        <i class="fas fa-times"></i> Remove
      </button>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 12px;">
      <div class="form-group">
        <label for="followUp${nextNum}Schedule"><i class="fas fa-calendar-plus"></i> Scheduled Date & Time</label>
        <input type="datetime-local" id="followUp${nextNum}Schedule" class="form-control">
      </div>
      <div class="form-group">
        <label for="followUp${nextNum}Date"><i class="fas fa-calendar-check"></i> Actual Date & Time</label>
        <input type="datetime-local" id="followUp${nextNum}Date" class="form-control">
      </div>
      <div class="form-group">
        <label for="followUp${nextNum}Answered"><i class="fas fa-question-circle"></i> Answered?</label>
        <select id="followUp${nextNum}Answered" class="form-control">
          <option value="">-- Select --</option>
          <option value="Yes">✓ Yes</option>
          <option value="No">✗ No</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label for="followUp${nextNum}Comment"><i class="fas fa-sticky-note"></i> Comment After ${getOrdinal(nextNum)} Follow-up</label>
      <textarea id="followUp${nextNum}Comment" class="form-control" rows="2" placeholder="Notes from ${getOrdinal(nextNum)} follow-up..."></textarea>
    </div>
  `;
  
  container.appendChild(newSection);
  updateFollowUpCounter();
}

/**
 * Remove a follow-up section
 */
function removeFollowUp(num) {
  const section = document.querySelector(`.followup-section[data-followup="${num}"]`);
  if (section && confirm(`Remove ${getOrdinal(num)} follow-up section?`)) {
    section.remove();
    updateFollowUpCounter();
  }
}

/**
 * Update follow-up counter
 */
function updateFollowUpCounter() {
  const container = document.getElementById('followUpsContainer');
  const count = container ? container.querySelectorAll('.followup-section').length : 1;
  const counter = document.getElementById('followUpCount');
  if (counter) {
    counter.textContent = `(${count} follow-up${count > 1 ? 's' : ''} added)`;
  }
}

/**
 * Show toast notification
 */
async function loadDemoSessionDetailsIntoModal(lead) {
  const wrap = document.getElementById('demoSessionDetails');
  if (!wrap) return;

  const crmLeadId = lead?.supabaseId;
  if (!crmLeadId) {
    wrap.textContent = 'Demo session details not available (missing lead id).';
    return;
  }

  try {
    wrap.textContent = 'Loading demo session details...';
    const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
    const res = await fetch(`/api/demo-sessions/leads/${encodeURIComponent(crmLeadId)}`, { headers: authHeaders });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load demo session details');

    const items = json.items || [];
    if (!items.length) {
      wrap.innerHTML = '<span style="color:#667085;">No demo session invites yet.</span>';
      return;
    }

    const badge = (label, value) => {
      if (!value) return '';
      return `<span class="badge" style="background:#f2f4f7; color:#344054; border:1px solid #eaecf0; margin-right:6px;">${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
    };

    const renderReminders = (rems) => {
      const arr = rems || [];
      if (!arr.length) return '<span style="color:#98a2b3;">No reminders</span>';
      return arr.map(r => {
        const when = r.sent_at ? new Date(r.sent_at).toLocaleString() : '';
        const note = (r.note || '').trim();
        const tip = [when ? `Time: ${when}` : '', note ? `Note: ${note}` : ''].filter(Boolean).join('\n');
        const titleAttr = tip ? ` title="${escapeHtml(tip)}"` : '';
        const aria = tip ? ` aria-label="${escapeHtml(tip)}"` : '';
        return `<span class="badge"${titleAttr}${aria} tabindex="0" style="background:#f2f4f7; color:#344054; border:1px solid #eaecf0; margin-right:6px; cursor:help;">R${escapeHtml(r.reminder_number || '')}</span>`;
      }).join('');
    };

    wrap.innerHTML = items.map(it => {
      const inv = it.invite || it.invite; // compatibility
      const session = it.session || it.demo_session || null;
      const title = session?.title || (session?.demo_number ? `Demo ${session.demo_number}` : 'Demo session');
      const sched = session?.scheduled_at ? new Date(session.scheduled_at).toLocaleString() : '';
      const hdr = `${escapeHtml(title)}${sched ? ` <span style=\"color:#667085;\">(${escapeHtml(sched)})</span>` : ''}`;

      return `
        <div style="padding:10px; border:1px solid #eaecf0; border-radius:12px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:8px;">
            <div style="font-weight:800; color:#101828;">${hdr}</div>
            <button type="button" class="btn btn-danger btn-sm" data-act="demo-remove-invite" data-invite-id="${escapeHtml(it.invite?.id || '')}" title="Remove from demo session">
              <i class="fas fa-trash"></i>
            </button>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
            ${badge('Status', it.invite?.invite_status)}
            ${badge('Attendance', it.invite?.attendance)}
            ${badge('Response', it.invite?.response)}
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <span style="color:#667085;">Reminders:</span>
            ${renderReminders(it.reminders)}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    wrap.textContent = e.message || 'Failed to load demo session details';
  }
}

function showToast(message, type = 'info') {
  // Use global toast function if available
  if (window.UI && window.UI.showToast) {
    window.UI.showToast(message, type);
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

// Reset initialization flag (called when navigating away from the page)
function resetLeadManagementInit() {
  console.log('🔄 Resetting Lead Management initialization flag');
  isInitialized = false;
}

// Make functions global
window.initLeadManagementPage = initLeadManagementPage;
window.loadLeadManagement = loadLeadManagement;
window.filterManagementLeads = filterManagementLeads;
window.openManageLeadModal = openManageLeadModal;
window.closeManageLeadModal = closeManageLeadModal;
window.saveLeadManagement = saveLeadManagement;
window.addMoreFollowUp = addMoreFollowUp;
window.removeFollowUp = removeFollowUp;
window.resetLeadManagementInit = resetLeadManagementInit;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initLeadManagementPage,
    loadLeadManagement
  };
}

})(); // End of IIFE
