/**
 * Leads Page Module
 * Handles leads page functionality
 */

let currentLeads = [];
let currentPage = 1;
let rowsPerPage = 1000000; // Show all leads on one page
let totalPages = 1;
let sortColumn = ''; // empty = use backend default order
let sortDirection = 'asc';

function crmConfirm({ title = 'Confirm', message = '', confirmText = 'OK', cancelText = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const modalId = 'crmConfirmModal';
    document.getElementById(modalId)?.remove();

    const html = `
      <div class="modal-overlay" id="${modalId}" style="z-index: 10000;" onclick="document.getElementById('${modalId}')?.remove(); document.body.style.overflow='';">
        <div class="modal-dialog" style="max-width:520px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h2 style="margin:0; font-size:18px;"><i class="fas fa-sync"></i> ${escapeHtml(title)}</h2>
            <button class="modal-close" onclick="document.getElementById('${modalId}')?.remove(); document.body.style.overflow='';">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div style="color:#475467; font-size:13px; line-height:1.4;">${escapeHtml(message)}</div>
          </div>
          <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
            <button type="button" class="btn btn-secondary btn-sm" id="${modalId}_cancel">${escapeHtml(cancelText)}</button>
            <button type="button" class="btn btn-primary btn-sm" id="${modalId}_ok"><i class="fas fa-sync"></i> ${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    document.body.style.overflow = 'hidden';

    const close = (val) => {
      document.getElementById(modalId)?.remove();
      document.body.style.overflow = '';
      resolve(val);
    };

    document.getElementById(`${modalId}_cancel`)?.addEventListener('click', () => close(false));
    document.getElementById(`${modalId}_ok`)?.addEventListener('click', () => close(true));
  });
}


/**
 * Initialize leads page
 * @param {string} modeOrBatch - For officers this is usually 'myLeads'. For admins it can be a batch name.
 */
async function initLeadsPage(modeOrBatch) {
  // Remember current mode/batch (used by loadLeads)
  window.leadsModeOrBatch = modeOrBatch;

  // Setup event listeners (bind once)
  if (!window.__leadsListenersBound) {
    window.__leadsListenersBound = true;
    setupLeadsEventListeners();
  }

  // React to current-batch changes from Programs -> Batch Setup
  if (!window.__leadsCurrentBatchListenerBound) {
    window.__leadsCurrentBatchListenerBound = true;
    window.addEventListener('currentBatchChanged', async () => {
      try {
        const isOfficerView = (window.leadsModeOrBatch === 'myLeads') || (window.currentUser && window.currentUser.role !== 'admin');
        // Reset batch selection so dropdown defaults to new current batch
        if (isOfficerView) {
          window.officerBatchFilter = '';
          window.officerSheetFilter = 'Main Leads';
        } else {
          window.adminBatchFilter = '';
          window.adminSheetFilter = 'Main Leads';
        }

        const view = document.getElementById('leadsView');
        const visible = view && view.classList.contains('active');
        if (visible) {
          await loadLeads();
        }
      } catch (e) {
        // ignore
      }
    });
  }

  // Reset selection UI on entry
  ensureSelectionState();
  window.__selectedLeadIds.clear();
  updateSelectionUI();

  // Update header title: show only sheet name
  const isOfficerView = (window.leadsModeOrBatch === 'myLeads') || (window.currentUser && window.currentUser.role !== 'admin');
  const batch = isOfficerView ? window.officerBatchFilter : window.adminBatchFilter;
  const sheet = (isOfficerView ? window.officerSheetFilter : window.adminSheetFilter) || 'Main Leads';
  const titleEl = document.getElementById('leadsViewTitle');
  if (titleEl) titleEl.textContent = sheet;

  // Load leads data (no caching; always load fresh)
  await loadLeads();

  // Start auto-refresh (every 30 seconds) once
  if (!window.__leadsAutoRefreshStarted) {
    window.__leadsAutoRefreshStarted = true;
    startAutoRefresh();
  }
}

/**
 * Setup event listeners for leads page
 */
function setupLeadsEventListeners() {
  // Refresh button
  const refreshBtn = document.getElementById('refreshLeadsBtn');
  if (refreshBtn) {
    // Remove old listener first
    const newRefreshBtn = refreshBtn.cloneNode(true);
    refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
    // Add new listener
    newRefreshBtn.addEventListener('click', () => {
      console.log('Refresh button clicked');
      loadLeads();
    });
  }

  // Search input
  const searchInput = document.getElementById('leadsSearchInput');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 1;
        loadLeads();
      }, 500);
    });
  }

  // Program selector (admin-only)
  const programSelect = document.getElementById('leadsProgramSelect');
  if (programSelect && !programSelect.__bound) {
    programSelect.__bound = true;

    const isAdmin = window.currentUser && window.currentUser.role === 'admin';
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
            // Reset batch filter so loadLeads() auto-selects current batch for this program
            window.adminBatchFilter = '';
            window.adminSheetFilter = 'Main Leads';
            currentPage = 1;
            loadLeads();
          });

          // Ensure leads load respects the selected program
          if (window.adminProgramId) {
            currentPage = 1;
            loadLeads();
          }
        } catch (e) {
          console.warn('Failed to load programs for program filter', e);
          programSelect.style.display = 'none';
        }
      })();
    }
  }

  // Program batch selector (admin-only)
  const programBatchSelect = document.getElementById('leadsProgramBatchSelect');
  if (programBatchSelect && !programBatchSelect.__bound) {
    programBatchSelect.__bound = true;
    programBatchSelect.addEventListener('change', () => {
      const v = programBatchSelect.value;
      if (v) {
        if (window.currentUser && window.currentUser.role === 'admin') {
          window.adminBatchFilter = v;
          window.adminSheetFilter = 'Main Leads';
        } else {
          window.officerBatchFilter = v;
          window.officerSheetFilter = 'Main Leads';
        }
        // update hash
        const leadsPage = (window.currentUser && window.currentUser.role === 'admin')
          ? `leads-batch-${encodeURIComponent(v)}__sheet__${encodeURIComponent('Main Leads')}`
          : `leads-myLeads-batch-${encodeURIComponent(v)}__sheet__${encodeURIComponent('Main Leads')}`;
        window.location.hash = leadsPage;
        currentPage = 1;
        loadLeads();
      }
    });
  }

  // Status filter
  const statusFilter = document.getElementById('leadsStatusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      currentPage = 1;
      loadLeads();
    });
  }

  // New Lead button
  const addLeadBtn = document.getElementById('addLeadBtn');
  if (addLeadBtn) {
    addLeadBtn.addEventListener('click', () => createNewLead());
  }

  // Distribute Unassigned button (admin-only in HTML)
  // Note: HTML uses onclick="distributeUnassignedLeads()". Ensure global function exists.

  // No pagination / rows-per-page / export/import on this screen

  // Table header sorting (bind once; prevent duplicate handlers causing double-toggle)
  const table = document.getElementById('leadsTable');
  if (table && !window.__leadsSortHandlersBound) {
    window.__leadsSortHandlersBound = true;
    const headers = table.querySelectorAll('th[data-sort]');
    headers.forEach(header => {
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        const column = header.dataset.sort;
        if (sortColumn === column) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = column;
          sortDirection = 'asc';
        }
        // Visual indicator
        headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
        header.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');

        renderLeadsTable();
      });
    });
  }
}

/**
 * Load leads from API
 */
async function loadLeads() {
  try {
    const searchInput = document.getElementById('leadsSearchInput');
    const statusFilter = document.getElementById('leadsStatusFilter');

    const filters = {};
    if (searchInput && searchInput.value) {
      filters.search = searchInput.value;
    }
    if (statusFilter && statusFilter.value) {
      filters.status = statusFilter.value;
    }

    // Show loading state
    showLeadsLoading();

    // Officer view: always use /crm-leads/my (never admin endpoint)
    const isOfficerView = (window.leadsModeOrBatch === 'myLeads') || (window.currentUser && window.currentUser.role !== 'admin');

    // Program context batch dropdown (admin + officer)
    if (true) {
      const sel = document.getElementById('leadsProgramBatchSelect');
      if (sel) {
        const programId = window.adminProgramId || window.officerProgramId;
        if (programId) {
          sel.style.display = '';
          // No caching: always fetch fresh program batches and rebuild options
          try {
            const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
            const r = await fetch('/api/programs/sidebar', { headers: authHeaders });
            const j = await r.json();
            const batches = (j.batches || []).filter(b => String(b.program_id) === String(programId));
            const current = batches.find(b => b.is_current);

            sel.innerHTML = '';
            batches
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.batch_name;
                opt.textContent = b.batch_name;
                sel.appendChild(opt);
              });

            // Sync selection
            const activeBatch = (window.adminBatchFilter || window.officerBatchFilter);
            const currentBatchName = current?.batch_name;
            const hasOption = (val) => Array.from(sel.options || []).some(o => String(o.value) === String(val));
            if (activeBatch && activeBatch !== 'all' && hasOption(activeBatch)) {
              sel.value = activeBatch;
            } else if (currentBatchName && hasOption(currentBatchName)) {
              sel.value = currentBatchName;
              // IMPORTANT: keep internal batch filter in sync when we auto-select current batch.
              // Otherwise the dropdown shows current batch but the API call may still be "all batches".
              if (isOfficerView) window.officerBatchFilter = currentBatchName;
              else window.adminBatchFilter = currentBatchName;
            }
          } catch (e) {
            console.warn('Failed to load program batches for dropdown', e);
          }
        } else {
          // If user refreshed directly on a leads-batch-* route, infer program from batch
          if (window.adminBatchFilter) {
            try {
              const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
              const r = await fetch('/api/programs/sidebar', { headers: authHeaders });
              const j = await r.json();
              const activeBatch = window.adminBatchFilter || window.officerBatchFilter;
              const match = (j.batches || []).find(b => String(b.batch_name) === String(activeBatch));
              if (match?.program_id) {
                window.adminProgramId = window.adminProgramId || match.program_id;
                window.officerProgramId = window.officerProgramId || match.program_id;
                // re-run load once program context exists
                await loadLeads();
                return;
              }
            } catch (e) {
              console.warn('Failed to infer program from batch', e);
            }
          }
          sel.style.display = 'none';
        }
      }
    }

    // Sheet tabs (admin + officer)
    async function renderSheetTabs() {
      const tabsEl = document.getElementById('leadsSheetTabs');
      if (!tabsEl) return;

      const batch = isOfficerView ? window.officerBatchFilter : window.adminBatchFilter;
      if (!batch || batch === 'all') {
        tabsEl.style.display = 'none';
        tabsEl.innerHTML = '';
        return;
      }

      const currentSheet = (isOfficerView ? window.officerSheetFilter : window.adminSheetFilter) || 'Main Leads';

      // Auth
      let authHeaders = {};
      if (window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session && session.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }

      // No caching: start with defaults, then fetch from server
      let sheets = ['Main Leads', 'Extra Leads'];
      sheets = Array.from(new Set(sheets));

      // Officer-only: meta/sheets returns only the officer-created sheets (excluding defaults)
      let officerCreatedSheets = [];

      const updateOfficerNewLeadBtnVisibility = () => {
        if (!isOfficerView) return;
        const addLeadBtn = document.getElementById('addLeadBtn');
        if (!addLeadBtn) return;

        const sheetNow = (window.officerSheetFilter || currentSheet || 'Main Leads');
        const isDefault = ['main leads', 'extra leads'].includes(String(sheetNow).toLowerCase());
        const isPersonal = officerCreatedSheets.some(s => String(s) === String(sheetNow));

        // Only allow New Lead on officer-created sheets
        addLeadBtn.style.display = (!isDefault && isPersonal) ? '' : 'none';
      };

      const applyTabStyle = (btn, active) => {
        btn.style.border = active ? '1px solid #592c88' : '1px solid #eaecf0';
        btn.style.background = active ? '#f4ebff' : '#fff';
        btn.style.color = active ? '#592c88' : '#344054';
      };

      // Action buttons must be re-added on every tab render, because renderTabs()
      // clears tabsEl.innerHTML and is called multiple times (initial + async refresh).
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-secondary btn-sm';
      addBtn.innerHTML = '<i class="fas fa-plus"></i> Add sheet';
      addBtn.addEventListener('click', async () => {
        if (window.openAddSheetModal) {
          window.openAddSheetModal({ batchName: batch, scope: isOfficerView ? 'officer' : 'admin' });
        }
      });

      let actionsWrap = null;
      if (!isOfficerView) {
        actionsWrap = document.createElement('div');
        actionsWrap.style.display = 'inline-flex';
        actionsWrap.style.gap = '6px';
        actionsWrap.style.alignItems = 'center';

        const syncBtn = document.createElement('button');
        syncBtn.type = 'button';
        syncBtn.className = 'btn btn-secondary btn-sm';
        syncBtn.innerHTML = '<i class="fas fa-sync"></i> Sync';
        syncBtn.addEventListener('click', async () => {
          const ok = await crmConfirm({
            title: 'Sync Leads',
            message: `Sync leads from Google Sheet for batch "${batch}"?`,
            confirmText: 'Sync',
            cancelText: 'Cancel'
          });
          if (!ok) return;
          try {
            syncBtn.disabled = true;
            const res = await fetch(`/api/batches/${encodeURIComponent(batch)}/sync`, {
              method: 'POST',
              headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({})
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Sync failed');

            // Summarize results
            const pull = json.sheetsToSupabase?.sheets || [];
            const inserted = pull.reduce((a, s) => a + (s.inserted || 0), 0);
            const updated = pull.reduce((a, s) => a + (s.updated || 0), 0);
            const tabs = pull.length;

            if (window.UI && UI.showToast) UI.showToast(`Sync completed: ${inserted} inserted, ${updated} updated (${tabs} tabs)`, 'success');
            await loadLeads();
          } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Sync failed', 'error');
          } finally {
            syncBtn.disabled = false;
          }
        });

        actionsWrap.appendChild(syncBtn);
        actionsWrap.appendChild(addBtn);
      }

      const renderTabs = (sheetList) => {
        // Build tab bar
        tabsEl.style.display = 'flex';
        tabsEl.innerHTML = '';

        const makeTab = (name) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-secondary';
          btn.style.padding = '6px 10px';
          btn.style.borderRadius = '999px';
          applyTabStyle(btn, name === currentSheet);
          btn.textContent = name;

          btn.addEventListener('click', () => {
            // Instant active UI (don’t wait for loadLeads)
            try {
              tabsEl.querySelectorAll('button.btn').forEach(b => applyTabStyle(b, b.textContent === name));
            } catch (_) {}

            if (isOfficerView) window.officerSheetFilter = name;
            else window.adminSheetFilter = name;

            updateOfficerNewLeadBtnVisibility();

            const page = isOfficerView
              ? `leads-myLeads-batch-${encodeURIComponent(batch)}__sheet__${encodeURIComponent(name)}`
              : `leads-batch-${encodeURIComponent(batch)}__sheet__${encodeURIComponent(name)}`;
            window.location.hash = page;
            currentPage = 1;
            loadLeads();
          });
          return btn;
        };

        sheetList.forEach(s => tabsEl.appendChild(makeTab(s)));

        // Re-attach actions every time we render
        if (actionsWrap) tabsEl.appendChild(actionsWrap);
        else tabsEl.appendChild(addBtn);

        updateOfficerNewLeadBtnVisibility();
      };

      // Render immediately from cache/default
      renderTabs(sheets);

      // Refresh sheet list async (don’t block UI)
      (async () => {
        try {
          const res = await fetch(`/api/crm-leads/meta/sheets?batch=${encodeURIComponent(batch)}`, { headers: authHeaders });
          const json = await res.json();
          if (json.success && Array.isArray(json.sheets)) {
            const merged = Array.from(new Set(['Main Leads', 'Extra Leads', ...json.sheets]));

            if (isOfficerView) {
              officerCreatedSheets = (json.sheets || []).slice();
              updateOfficerNewLeadBtnVisibility();
            }

            // If list changed, re-render quickly
            if (merged.join('|') !== sheets.join('|')) {
              renderTabs(merged);
            }
          }
        } catch (e) {
          console.warn('Failed to load sheets list', e);
        }
      })();
    }

    await renderSheetTabs();

    // If a sheet is created via modal, refresh tabs + switch to it
    if (!window.__leadsSheetCreatedBound) {
      window.__leadsSheetCreatedBound = true;
      document.addEventListener('sheet:created', (ev) => {
        try {
          const d = ev.detail || {};
          const activeBatch = isOfficerView ? window.officerBatchFilter : window.adminBatchFilter;
          if (d.batchName && String(d.batchName) !== String(activeBatch)) return;
          if (d.sheetName) {
            if (isOfficerView) window.officerSheetFilter = d.sheetName;
            else window.adminSheetFilter = d.sheetName;
          }

          try { updateOfficerNewLeadBtnVisibility(); } catch (_) {}

          // reload
          loadLeads();
        } catch (_) {}
      });
    }

    let response;
    if (isOfficerView) {
      // Apply officer batch/sheet filters if set by router
      if (window.officerBatchFilter) filters.batch = window.officerBatchFilter;
      if (window.officerSheetFilter) filters.sheet = window.officerSheetFilter;
      response = await API.leads.getMyLeads(filters);
    } else {
      // Admin view: may use batch/sheet filters
      if (window.adminBatchFilter) filters.batch = window.adminBatchFilter;
      if (window.adminSheetFilter) filters.sheet = window.adminSheetFilter;
      response = await API.leads.getAll(filters);
    }

    currentLeads = response.leads || [];

    renderLeadsTable();
    
    console.log(`✓ Loaded ${currentLeads.length} leads`);
  } catch (error) {
    console.error('Error loading leads:', error);
    showLeadsError(error.message);
  }
}

/**
 * Render leads table
 */
function renderLeadsTable() {
  const tbody = document.getElementById('leadsTableBody');
  if (!tbody) return;

  if (currentLeads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px;">
          <i class="fas fa-inbox" style="font-size: 48px; color: #ccc; margin-bottom: 10px;"></i>
          <p style="color: #666;">No leads found</p>
        </td>
      </tr>
    `;
    return;
  }

  // Default: keep backend order (added order).
  // If user clicked a header, apply client-side sorting.
  let leadsToDisplay = currentLeads;
  if (sortColumn) {
    leadsToDisplay = [...currentLeads].sort((a, b) => compareLeads(a, b, sortColumn, sortDirection));
  }

  // Pagination
  totalPages = Math.max(1, Math.ceil(leadsToDisplay.length / rowsPerPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedLeads = leadsToDisplay.slice(startIndex, endIndex);

  // Render rows - clickable rows
  tbody.innerHTML = paginatedLeads.map(lead => {
    const isSelected = Boolean(window.__selectedLeadIds && window.__selectedLeadIds.has(String(lead.id)));
    return `
      <tr class="lead-row" data-lead-id="${escapeHtml(String(lead.id))}" style="cursor: pointer;" title="Click to view details">
        <td style="width:40px;">
          <input type="checkbox" class="lead-select-checkbox" data-lead-id="${escapeHtml(String(lead.id))}" ${isSelected ? 'checked' : ''}>
        </td>
        <td><strong>${escapeHtml(lead.name)}</strong></td>
        <td>${escapeHtml(lead.email)}</td>
        <td>${lead.phone ? `<a href="tel:${lead.phone}" class="lead-phone-link">${escapeHtml(lead.phone)}</a>` : '-'}</td>
        <td>${(String(lead.assignedTo||'').toLowerCase()==='duplicate' || lead.isDuplicate) ? '<span style="color:#d92d20; font-weight:700;">Duplicate</span>' : (escapeHtml(lead.assignedTo) || '-') }</td>
        <td>${escapeHtml(formatDate(lead.createdDate)) || '-'}</td>
      </tr>
    `;
  }).join('');

  // Row click opens details modal
  tbody.querySelectorAll('tr.lead-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const id = tr.getAttribute('data-lead-id');
      viewLeadDetails(id);
    });
  });

  // Attach handlers (avoid inline event issues)
  tbody.querySelectorAll('.lead-select-checkbox').forEach(cb => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-lead-id');
      toggleLeadSelectionFromCheckbox(cb, id);
    });
  });

  // Phone link should not open modal when clicked
  tbody.querySelectorAll('.lead-phone-link').forEach(a => {
    a.addEventListener('click', (e) => e.stopPropagation());
  });

  // Sync header checkbox + toolbar
  updateSelectionUI();

  // No pagination UI on this screen
}

/**
 * Show loading state
 */
function showLeadsLoading() {
  const tbody = document.getElementById('leadsTableBody');
  if (!tbody) return;

  // Skeleton shimmer placeholders
  const rows = 8;
  const cell = (w = '70%') => `<div class="leads-skel-line" style="width:${w}"></div>`;

  const rowHtml = () => `
    <tr class="leads-skel-row">
      <td>${cell('60%')}</td>
      <td>${cell('40%')}</td>
      <td>${cell('55%')}</td>
      <td>${cell('35%')}</td>
      <td>${cell('45%')}</td>
      <td>${cell('30%')}</td>
    </tr>
  `;

  tbody.innerHTML = Array.from({ length: rows }).map(rowHtml).join('');
}

/**
 * Show error state
 */
function showLeadsError(message) {
  const tbody = document.getElementById('leadsTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px;">
          <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f44336; margin-bottom: 10px;"></i>
          <p style="color: #f44336;"><strong>Error loading leads</strong></p>
          <p style="color: #666;">${escapeHtml(message)}</p>
          <button class="btn btn-primary" onclick="window.leadsPageLoadLeads()" style="margin-top: 10px;">
            <i class="fas fa-redo"></i> Retry
          </button>
        </td>
      </tr>
    `;
  }
}

/**
 * Update pagination info
 */
function updatePaginationInfo() {
  // intentionally no-op (all leads shown)
}

/**
 * View lead details in modal
 */
function viewLeadDetails(leadId) {
  const lead = currentLeads.find(l => l.id == leadId);
  if (!lead) return;
  
  // Create modal HTML
  const modalHTML = `
    <div class="modal-overlay" id="leadDetailsModal" onclick="closeLeadModal(event)">
      <div class="modal-dialog" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2><i class="fas fa-user-circle"></i> Lead Details</h2>
          <button class="modal-close" onclick="closeLeadModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="lead-details-grid">
            <div class="detail-section">
              <h3><i class="fas fa-user"></i> Contact Information</h3>
              <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value"><strong>${escapeHtml(lead.name)}</strong></span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Email:</span>
                <span class="detail-value">${escapeHtml(lead.email) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Phone:</span>
                <span class="detail-value">${lead.phone ? `<a href="tel:${lead.phone}">${escapeHtml(lead.phone)}</a>` : '-'}</span>
              </div>
            </div>
            
            <div class="detail-section">
              <h3><i class="fas fa-info-circle"></i> Lead Information</h3>
              <div class="detail-row">
                <span class="detail-label">Course:</span>
                <span class="detail-value">${escapeHtml(lead.course || lead.intake_json?.course) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Platform:</span>
                <span class="detail-value">${escapeHtml(lead.intake_json?.platform || lead.platform) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Start Immediately?</span>
                <span class="detail-value">${escapeHtml(getIntakeValue(
                  { ...(lead.intake_json || {}), ...lead },
                  'are_you_planning_to_start_immediately?',
                  'are_you_planning_to_start_immediately',
                  'planning_to_start_immediately',
                  'start_immediately',
                  'start immediately',
                  'Are you planning to start immediately?',
                  'are you planning to start immediately'
                )) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Why Interested?</span>
                <span class="detail-value">${escapeHtml(getIntakeValue(
                  { ...(lead.intake_json || {}), ...lead },
                  'why_are_you_interested_in_this_diploma?',
                  'why_are_you_interested_in_this_diploma',
                  'why_interested',
                  'interest_reason',
                  'why are you interested in this diploma?',
                  'Why are you interested in this diploma?',
                  'why are you interested in this diploma'
                )) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Source:</span>
                <span class="detail-value">${escapeHtml(lead.source) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value"><span class="badge badge-${getStatusColor(lead.status)}">${escapeHtml(lead.status)}</span></span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Priority:</span>
                <span class="detail-value">${escapeHtml(lead.priority) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Assigned To:</span>
                <span class="detail-value">${escapeHtml(lead.assignedTo) || 'Unassigned'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Created:</span>
                <span class="detail-value">${formatDate(lead.createdDate) || '-'}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section" style="margin-top: 20px;">
            <h3><i class="fas fa-sticky-note"></i> Notes</h3>
            <div class="notes-box">
              ${lead.notes ? escapeHtml(lead.notes).replace(/\n/g, '<br>') : '<em style="color: #999;">No notes available</em>'}
            </div>
          </div>

          
          <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap;">
            <button class="btn btn-secondary" id="saveContactBtn" onclick="saveLeadContact('${String(lead.id).replace(/'/g, "\\'")}')" style="padding: 12px 24px;">
              <i class="fas fa-address-book"></i> Save Contact
            </button>
            <button class="btn btn-primary" onclick="editLeadDetails('${String(lead.id).replace(/'/g, "\\'")}')" style="padding: 12px 24px;">
              <i class="fas fa-edit"></i> Edit Lead
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="copyLeadBtn" title="Copy this lead to another batch/sheet">
            <i class="fas fa-copy"></i> Copy
          </button>
          <button class="btn btn-secondary" onclick="closeLeadModal()">Close</button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Copy lead
  try {
    const copyBtn = document.getElementById('copyLeadBtn');
    if (copyBtn) {
      copyBtn.onclick = () => openCopyLeadModal(lead);
    }
  } catch (_) {}

  // After open: detect if contact already saved
  try {
    if (window.API && API.contacts && API.contacts.bySource) {
      API.contacts.bySource('crm_leads', String(lead.id))
        .then(r => {
          const exists = !!r?.contact;
          const btn = document.getElementById('saveContactBtn');
          if (btn && exists) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check"></i> Saved';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-success');
          }
        })
        .catch(e => {
          console.warn('Contact saved-state check failed:', e?.message || e);
        });
    }
  } catch (e) {
    console.warn('Contact saved-state check failed:', e?.message || e);
  }
  
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

/**
 * Close lead details modal
 */
async function saveLeadContact(leadId) {
  try {
    if (!window.API || !API.contacts) throw new Error('Contacts API not available');

    const lead = currentLeads.find(l => String(l.id) == String(leadId));
    if (!lead) throw new Error('Lead not found');

    const isOfficerView = (window.leadsModeOrBatch === 'myLeads') || (window.currentUser && window.currentUser.role !== 'admin');
    let batchName = isOfficerView ? window.officerBatchFilter : window.adminBatchFilter;
    if (!batchName || batchName === 'all') batchName = lead.batch || lead.batchName || lead.batch_name || '';

    const programName = String(lead.course || lead.intake_json?.course || '').trim();

    const btn = document.getElementById('saveContactBtn');
    if (btn) {
      btn.disabled = true;
      btn.dataset._oldHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }

    await API.contacts.saveFromLead(leadId, { programName, batchName });

    // Update button state immediately
    const btn2 = document.getElementById('saveContactBtn');
    if (btn2) {
      btn2.disabled = true;
      btn2.innerHTML = '<i class="fas fa-check"></i> Saved';
      btn2.classList.remove('btn-secondary');
      btn2.classList.add('btn-success');
    }

    if (window.UI && UI.showToast) UI.showToast('Contact saved', 'success');
    else showToast('Contact saved', 'success');
  } catch (e) {
    console.error(e);
    if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to save contact', 'error');
    else showToast(e.message || 'Failed to save contact', 'error');
  } finally {
    const btn = document.getElementById('saveContactBtn');
    if (btn) {
      btn.disabled = false;
      if (btn.dataset._oldHtml) btn.innerHTML = btn.dataset._oldHtml;
    }
  }
}

async function openCopyLeadModal(lead) {
  const modalId = 'copyLeadModal';
  document.getElementById(modalId)?.remove();

  const isAdmin = window.currentUser && window.currentUser.role === 'admin';

  const html = `
    <div class="modal-overlay" id="${modalId}" onclick="closeLeadsActionModalOnOverlayClick(event, '${modalId}')">
      <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 620px;">
        <div class="modal-header">
          <h2><i class="fas fa-copy"></i> Copy Lead</h2>
          <button class="modal-close" onclick="closeLeadsActionModal('${modalId}')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div style="color:#667085; font-size:13px; margin-bottom:12px;">
            Copy <strong>${escapeHtml(lead.name || '')}</strong> to another batch/sheet. The copied lead will be treated as a new lead.
          </div>

          <div class="form-row" style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group" style="margin:0;">
              <label>Target Batch</label>
              <select id="${modalId}_batch" class="form-control"></select>
            </div>
            <div class="form-group" style="margin:0;">
              <label>Target Sheet</label>
              <select id="${modalId}_sheet" class="form-control"></select>
            </div>
          </div>

          <div id="${modalId}_msg" style="margin-top:10px; font-size:13px; color:#667085;"></div>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #eaecf0; padding-top:12px;">
          <button type="button" class="btn btn-secondary" onclick="closeLeadsActionModal('${modalId}')">Cancel</button>
          <button type="button" class="btn btn-primary" id="${modalId}_ok"><i class="fas fa-copy"></i> Copy</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  const batchSel = document.getElementById(`${modalId}_batch`);
  const sheetSel = document.getElementById(`${modalId}_sheet`);
  const msgEl = document.getElementById(`${modalId}_msg`);
  const okBtn = document.getElementById(`${modalId}_ok`);

  msgEl.textContent = 'Loading batches...';

  // Load batches from programs sidebar
  const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
  const r = await fetch('/api/programs/sidebar', { headers: authHeaders });
  const j = await r.json();
  const batches = (j.batches || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const srcBatch = String(lead.batch || '').trim();
  batchSel.innerHTML = batches.map(b => {
    const bn = String(b.batch_name || '');
    const disabled = srcBatch && bn === srcBatch;
    const label = disabled ? `${bn} (Not allowed)` : bn;
    return `<option value="${escapeHtml(bn)}" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
  }).join('');

  // pick default: current batch unless disabled, else first enabled
  const preferred = batches.find(b => b.is_current)?.batch_name || batches[0]?.batch_name || '';
  const firstEnabled = (batches.find(b => String(b.batch_name) !== srcBatch)?.batch_name) || '';
  batchSel.value = (preferred && preferred !== srcBatch) ? preferred : firstEnabled;

  async function loadSheetsForBatch(batchName) {
    if (!batchName) {
      sheetSel.innerHTML = '';
      return;
    }
    msgEl.textContent = 'Loading sheets...';
    const sr = await fetch(`/api/crm-leads/meta/sheets?batch=${encodeURIComponent(batchName)}`, { headers: authHeaders });
    const sj = await sr.json();
    const sheets = (sj.sheets || []).slice();
    sheetSel.innerHTML = sheets.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    sheetSel.value = 'Main Leads';
    msgEl.textContent = '';
  }

  await loadSheetsForBatch(batchSel.value);

  batchSel.onchange = async () => {
    await loadSheetsForBatch(batchSel.value);
  };

  okBtn.onclick = async () => {
    const targetBatchName = batchSel.value;
    const targetSheetName = sheetSel.value;

    if (!targetBatchName || !targetSheetName) {
      msgEl.textContent = 'Please choose batch and sheet';
      return;
    }

    okBtn.disabled = true;
    msgEl.textContent = 'Copying...';

    try {
      const source = {
        batchName: lead.batch,
        sheetName: lead.sheet || 'Main Leads',
        leadId: lead.id
      };
      const target = { batchName: targetBatchName, sheetName: targetSheetName };

      if (isAdmin) await API.leads.copyAdmin({ source, target });
      else await API.leads.copyMy({ source, target });

      msgEl.textContent = 'Copied successfully';
      if (window.UI?.showToast) UI.showToast('Lead copied', 'success');

      closeLeadsActionModal(modalId);
      // refresh current view
      await loadLeads();
    } catch (e) {
      msgEl.textContent = e.message || 'Copy failed';
      if (window.UI?.showToast) UI.showToast(msgEl.textContent, 'error');
    } finally {
      okBtn.disabled = false;
    }
  };
}

function closeLeadModal(event) {
  // Only close if clicking overlay or close button
  if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) {
    return;
  }
  
  const modal = document.getElementById('leadDetailsModal');
  if (modal) {
    modal.remove();
  }
  
  // Restore body scroll
  document.body.style.overflow = '';
}

/**
 * Edit lead details
 */
function editLeadDetails(leadId) {
  const lead = currentLeads.find(l => l.id == leadId);
  if (!lead) return;
  
  // Create edit modal HTML
  const editModalHTML = `
    <div class="modal-overlay" id="editLeadModal" onclick="closeEditModal(event)">
      <div class="modal-dialog" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2><i class="fas fa-edit"></i> Edit Lead</h2>
          <button class="modal-close" onclick="closeEditModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <form id="editLeadForm" onsubmit="saveLeadChanges(event, ${lead.id})">
            <div class="form-grid">
              <div class="form-group">
                <label for="editName"><i class="fas fa-user"></i> Name *</label>
                <input type="text" id="editName" class="form-control" value="${escapeHtml(lead.name)}" required>
              </div>
              
              <div class="form-group">
                <label for="editEmail"><i class="fas fa-envelope"></i> Email</label>
                <input type="email" id="editEmail" class="form-control" value="${escapeHtml(lead.email)}">
              </div>
              
              <div class="form-group">
                <label for="editPhone"><i class="fas fa-phone"></i> Phone</label>
                <input type="tel" id="editPhone" class="form-control" value="${escapeHtml(lead.phone)}">
              </div>
              
              <div class="form-group">
                <label for="editCourse"><i class="fas fa-book"></i> Course</label>
                <input type="text" id="editCourse" class="form-control" value="${escapeHtml(lead.course)}">
              </div>
              
              <div class="form-group">
                <label for="editSource"><i class="fas fa-share-alt"></i> Source</label>
                <input type="text" id="editSource" class="form-control" value="${escapeHtml(lead.source)}">
              </div>
              
              <div class="form-group">
                <label for="editStatus"><i class="fas fa-info-circle"></i> Status</label>
                <select id="editStatus" class="form-control">
                  <option value="New" ${lead.status === 'New' ? 'selected' : ''}>New</option>
                  <option value="Contacted" ${lead.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
                  <option value="Follow-up" ${lead.status === 'Follow-up' ? 'selected' : ''}>Follow-up</option>
                  <option value="Registered" ${lead.status === 'Registered' ? 'selected' : ''}>Registered</option>
                  <option value="Closed" ${lead.status === 'Closed' ? 'selected' : ''}>Closed</option>
                  <option value="working_professional" ${lead.status === 'working_professional' ? 'selected' : ''}>Working Professional</option>
                  <option value="student" ${lead.status === 'student' ? 'selected' : ''}>Student</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="editAssignedTo"><i class="fas fa-user-tie"></i> Assigned To</label>
                <input type="text" id="editAssignedTo" class="form-control" value="${escapeHtml(lead.assignedTo)}" ${((String(lead.assignedTo||'').toLowerCase()==='duplicate') || lead.isDuplicate) ? 'readonly title="Duplicate lead (cannot assign)" style="background:#fef3f2; border-color:#fecdca; color:#d92d20;"' : ''}>
              </div>
              
              <div class="form-group full-width">
                <label for="editNotes"><i class="fas fa-sticky-note"></i> Notes</label>
                <textarea id="editNotes" class="form-control" rows="4">${escapeHtml(lead.notes)}</textarea>
              </div>
            </div>
            
            <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px;">
              <button type="button" class="btn btn-secondary" onclick="closeEditModal()">Cancel</button>
              <button type="submit" class="btn btn-primary">
                <i class="fas fa-save"></i> Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  
  // Close view modal first
  closeLeadModal();
  
  // Add edit modal to page
  document.body.insertAdjacentHTML('beforeend', editModalHTML);
  document.body.style.overflow = 'hidden';
}

/**
 * Save lead changes
 */
async function saveLeadChanges(event, leadId) {
  event.preventDefault();
  
  const assignedEl = document.getElementById('editAssignedTo');
  const updates = {
    name: document.getElementById('editName').value,
    email: document.getElementById('editEmail').value,
    phone: document.getElementById('editPhone').value,
    course: document.getElementById('editCourse').value,
    source: document.getElementById('editSource').value,
    status: document.getElementById('editStatus').value,
    notes: document.getElementById('editNotes').value
  };

  // For duplicate leads, assigned field is readonly and may contain the literal string "Duplicate".
  // Don’t send assignedTo updates in that case.
  if (assignedEl && !assignedEl.readOnly) {
    updates.assignedTo = assignedEl.value;
  }
  
  try {
    // Show loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;
    
    // Call API to update lead
    // Admin updates go via Supabase CRM endpoint and require batch+sheet context
    const isOfficerView = (window.leadsModeOrBatch === 'myLeads') || (window.currentUser && window.currentUser.role !== 'admin');
    if (isOfficerView) {
      // officers should edit in Lead Management page; keep read-only here
      throw new Error('Officers cannot edit leads from this screen. Use Lead Management.');
    }

    const batchName = window.adminBatchFilter;
    const sheetName = window.adminSheetFilter || 'Main Leads';
    const response = await API.leads.update(batchName, sheetName, leadId, updates);
    
    if (response.success) {
      // Show success message
      showToast('Lead updated successfully!', 'success');
      
      // Close modal
      closeEditModal();
      
      // Reload leads to show updated data
      await loadLeads();
    } else {
      throw new Error(response.error || 'Failed to update lead');
    }
  } catch (error) {
    console.error('Error updating lead:', error);
    showToast('Failed to update lead: ' + error.message, 'error');
    
    // Restore button
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    submitBtn.disabled = false;
  }
}

/**
 * Close edit modal
 */
function closeEditModal(event) {
  if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) {
    return;
  }
  
  const modal = document.getElementById('editLeadModal');
  if (modal) {
    modal.remove();
  }
  document.body.style.overflow = '';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Make functions global
window.closeLeadModal = closeLeadModal;
window.editLeadDetails = editLeadDetails;
window.closeEditModal = closeEditModal;
window.saveLeadChanges = saveLeadChanges;

/**
 * Start auto-refresh
 */
function startAutoRefresh() {
  // Prevent multiple timers when initLeadsPage() is called multiple times
  if (window.__leadsAutoRefreshTimer) {
    clearInterval(window.__leadsAutoRefreshTimer);
  }

  // Refresh every 60 seconds (less aggressive)
  window.__leadsAutoRefreshTimer = setInterval(() => {
    const view = document.getElementById('leadsView');
    const visible = view && view.style.display !== 'none';
    if (visible) {
      loadLeads();
    }
  }, 60000);
}

/**
 * Helper functions
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function normalizeKey(k) {
  return String(k || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getIntakeValue(intake, ...candidateKeys) {
  if (!intake) return '';

  // Some rows may come through with intake_json as a JSON string
  if (typeof intake === 'string') {
    try {
      intake = JSON.parse(intake);
    } catch {
      return '';
    }
  }

  if (typeof intake !== 'object') return '';

  // Direct match first
  for (const k of candidateKeys) {
    if (!k) continue;
    if (intake[k] !== undefined && intake[k] !== null && String(intake[k]).trim() !== '') {
      return String(intake[k]).trim();
    }
  }

  // Fuzzy match by normalized keys (handles punctuation like '?' and underscores)
  const nmap = new Map();
  Object.keys(intake).forEach(key => {
    nmap.set(normalizeKey(key), key);
  });

  for (const k of candidateKeys) {
    const nk = normalizeKey(k);
    const realKey = nmap.get(nk);
    if (realKey && intake[realKey] !== undefined && intake[realKey] !== null && String(intake[realKey]).trim() !== '') {
      return String(intake[realKey]).trim();
    }
  }

  return '';
}

function getStatusColor(status) {
  const colors = {
    'New': 'success',
    'Contacted': 'primary',
    'Follow-up': 'warning',
    'Registered': 'purple',
    'Closed': 'secondary'
  };
  return colors[status] || 'secondary';
}

function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

function getSortValue(lead, column) {
  switch (column) {
    case 'course':
      return lead.course || lead.intake_json?.course || '';
    case 'createdDate':
      return lead.createdDate || '';
    default:
      return lead[column] ?? '';
  }
}

function compareLeads(a, b, column, direction) {
  const av = getSortValue(a, column);
  const bv = getSortValue(b, column);

  // numeric compare if both look numeric
  const an = typeof av === 'number' ? av : (String(av).match(/^\d+(\.\d+)?$/) ? Number(av) : NaN);
  const bn = typeof bv === 'number' ? bv : (String(bv).match(/^\d+(\.\d+)?$/) ? Number(bv) : NaN);

  let cmp;
  if (!Number.isNaN(an) && !Number.isNaN(bn)) {
    cmp = an - bn;
  } else {
    cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
  }

  return direction === 'desc' ? -cmp : cmp;
}

// -------------------------
// Bulk selection helpers
// -------------------------
function ensureSelectionState() {
  if (!window.__selectedLeadIds) window.__selectedLeadIds = new Set();
}

function toggleLeadSelectionFromCheckbox(checkboxEl, leadId) {
  ensureSelectionState();
  const id = String(leadId);
  const checked = Boolean(checkboxEl && checkboxEl.checked);
  if (checked) window.__selectedLeadIds.add(id);
  else window.__selectedLeadIds.delete(id);
  updateSelectionUI();
}

function toggleSelectAll() {
  ensureSelectionState();
  const header = document.getElementById('selectAllCheckbox');
  const checked = Boolean(header && header.checked);
  if (checked) {
    currentLeads.forEach(l => window.__selectedLeadIds.add(String(l.id)));
  } else {
    window.__selectedLeadIds.clear();
  }
  renderLeadsTable();
}

function clearSelection() {
  ensureSelectionState();
  window.__selectedLeadIds.clear();
  renderLeadsTable();
}

function updateSelectionUI() {
  ensureSelectionState();
  const count = window.__selectedLeadIds.size;

  const toolbar = document.getElementById('bulkActionsToolbar');
  const label = document.getElementById('selectedCount');
  const header = document.getElementById('selectAllCheckbox');
  const commonActions = document.getElementById('bulkCommonActions');
  const adminActions = document.getElementById('bulkAdminActions');

  if (label) label.textContent = `${count} selected`;
  if (toolbar) toolbar.style.display = count > 0 ? 'block' : 'none';

  // Show common bulk actions for both admin and officers
  if (commonActions) {
    commonActions.style.display = count > 0 ? 'flex' : 'none';
    commonActions.style.alignItems = 'center';
  }

  // Show assign/distribute/delete only for admins
  const isAdmin = Boolean(window.currentUser && window.currentUser.role === 'admin');
  if (adminActions) {
    adminActions.style.display = (count > 0 && isAdmin) ? 'flex' : 'none';
    adminActions.style.alignItems = 'center';
  }

  if (header) {
    if (currentLeads.length === 0) {
      header.checked = false;
      header.indeterminate = false;
    } else if (count === 0) {
      header.checked = false;
      header.indeterminate = false;
    } else if (count === currentLeads.length) {
      header.checked = true;
      header.indeterminate = false;
    } else {
      header.checked = false;
      header.indeterminate = true;
    }
  }
}

// Bulk actions (admin-only buttons are hidden by CSS, but keep functions defined to avoid console errors)
async function bulkCopyLeads() {
  ensureSelectionState();
  const ids = Array.from(window.__selectedLeadIds || []);
  if (!ids.length) return;

  // Convert selected ids to copy sources
  const sources = ids.map(id => {
    const lead = currentLeads.find(l => String(l.id) === String(id));
    if (!lead) return null;
    return {
      batchName: lead.batch,
      sheetName: lead.sheet || 'Main Leads',
      leadId: lead.id
    };
  }).filter(Boolean);

  if (!sources.length) {
    showToast('No leads selected', 'error');
    return;
  }

  // Open same modal but with a slightly different message and bulk API call
  const modalId = 'copyLeadModal';
  document.getElementById(modalId)?.remove();

  const isAdmin = window.currentUser && window.currentUser.role === 'admin';

  const html = `
    <div class="modal-overlay" id="${modalId}" onclick="closeLeadsActionModalOnOverlayClick(event, '${modalId}')">
      <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 620px;">
        <div class="modal-header">
          <h2><i class="fas fa-copy"></i> Copy ${sources.length} Leads</h2>
          <button class="modal-close" onclick="closeLeadsActionModal('${modalId}')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div style="color:#667085; font-size:13px; margin-bottom:12px;">
            Copy selected leads to another batch/sheet. Copied leads will be treated as new leads.
          </div>

          <div class="form-row" style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group" style="margin:0;">
              <label>Target Batch</label>
              <select id="${modalId}_batch" class="form-control"></select>
            </div>
            <div class="form-group" style="margin:0;">
              <label>Target Sheet</label>
              <select id="${modalId}_sheet" class="form-control"></select>
            </div>
          </div>

          <div id="${modalId}_msg" style="margin-top:10px; font-size:13px; color:#667085;"></div>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #eaecf0; padding-top:12px;">
          <button type="button" class="btn btn-secondary" onclick="closeLeadsActionModal('${modalId}')">Cancel</button>
          <button type="button" class="btn btn-primary" id="${modalId}_ok"><i class="fas fa-copy"></i> Copy</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  const batchSel = document.getElementById(`${modalId}_batch`);
  const sheetSel = document.getElementById(`${modalId}_sheet`);
  const msgEl = document.getElementById(`${modalId}_msg`);
  const okBtn = document.getElementById(`${modalId}_ok`);

  msgEl.textContent = 'Loading batches...';

  const authHeaders = await (window.getAuthHeadersWithRetry ? getAuthHeadersWithRetry() : {});
  const r = await fetch('/api/programs/sidebar', { headers: authHeaders });
  const j = await r.json();
  const batches = (j.batches || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const sourceBatches = new Set(sources.map(s => String(s.batchName || '').trim()).filter(Boolean));
  batchSel.innerHTML = batches.map(b => {
    const bn = String(b.batch_name || '');
    const disabled = sourceBatches.has(bn);
    const label = disabled ? `${bn} (Not allowed)` : bn;
    return `<option value=\"${escapeHtml(bn)}\" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
  const preferred = batches.find(b => b.is_current)?.batch_name || batches[0]?.batch_name || '';
  const firstEnabled = (batches.find(b => !sourceBatches.has(String(b.batch_name)))?.batch_name) || '';
  batchSel.value = (!sourceBatches.has(preferred)) ? preferred : firstEnabled;

  async function loadSheetsForBatch(batchName) {
    if (!batchName) {
      sheetSel.innerHTML = '';
      return;
    }
    msgEl.textContent = 'Loading sheets...';
    const sr = await fetch(`/api/crm-leads/meta/sheets?batch=${encodeURIComponent(batchName)}`, { headers: authHeaders });
    const sj = await sr.json();
    const sheets = (sj.sheets || []).slice();
    sheetSel.innerHTML = sheets.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    sheetSel.value = 'Main Leads';
    msgEl.textContent = '';
  }

  await loadSheetsForBatch(batchSel.value);
  batchSel.onchange = async () => loadSheetsForBatch(batchSel.value);

  okBtn.onclick = async () => {
    const targetBatchName = batchSel.value;
    const targetSheetName = sheetSel.value;
    if (!targetBatchName || !targetSheetName) {
      msgEl.textContent = 'Please choose batch and sheet';
      return;
    }

    okBtn.disabled = true;
    msgEl.textContent = 'Copying...';

    try {
      const target = { batchName: targetBatchName, sheetName: targetSheetName };
      const resp = isAdmin
        ? await API.leads.copyAdminBulk({ sources, target })
        : await API.leads.copyMyBulk({ sources, target });

      const createdCount = resp.createdCount || resp.created_count || (resp.leads ? resp.leads.length : 0);
      if (window.UI?.showToast) UI.showToast(`Copied ${createdCount} lead(s)`, 'success');

      closeLeadsActionModal(modalId);
      window.__selectedLeadIds?.clear();
      await loadLeads();
      updateSelectionUI();
    } catch (e) {
      msgEl.textContent = e.message || 'Copy failed';
      if (window.UI?.showToast) UI.showToast(msgEl.textContent, 'error');
    } finally {
      okBtn.disabled = false;
    }
  };
}

async function bulkAssignLeads() {
  ensureSelectionState();
  const ids = Array.from(window.__selectedLeadIds || []);
  if (!ids.length) return;

  if (!window.currentUser || window.currentUser.role !== 'admin') {
    showToast('Only admin can assign leads.', 'error');
    return;
  }

  const batchName = window.adminBatchFilter;
  const sheetName = window.adminSheetFilter || 'Main Leads';
  if (!batchName || batchName === 'all') {
    showToast('Please select a batch/sheet from sidebar first.', 'error');
    return;
  }

  const officers = await fetchOfficers();
  if (!officers.length) {
    showToast('No officers found.', 'error');
    return;
  }

  const modalId = 'bulkAssignModal';
  closeLeadsActionModal(modalId);

  const officerOptions = officers.map(o => `
    <label style="display:flex; align-items:center; gap:10px; padding: 10px 12px; border:1px solid #eee; border-radius: 8px; margin-bottom: 10px; cursor:pointer;">
      <input type="checkbox" class="ba_choice" value="${escapeHtml(o)}" />
      <span style="font-weight:600;">${escapeHtml(o)}</span>
    </label>
  `).join('');

  const html = `
    <div class="modal-overlay" id="${modalId}" onclick="closeLeadsActionModalOnOverlayClick(event, '${modalId}')">
      <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 640px;">
        <div class="modal-header">
          <h2><i class="fas fa-user-tie"></i> Assign ${ids.length} Selected Leads</h2>
          <button class="modal-close" onclick="closeLeadsActionModal('${modalId}')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin-top:0; color:#555;">Choose an officer to assign. You can also unassign.</p>

          <label style="display:flex; align-items:center; gap:10px; padding: 10px 12px; border:1px dashed #bbb; border-radius: 8px; margin-bottom: 12px; cursor:pointer; background:#fafafa;">
            <input type="checkbox" id="ba_unassign" value="__UNASSIGN__" />
            <span style="font-weight:700;">Unassign (remove officer)</span>
          </label>

          <div style="margin: 10px 0 0;">
            ${officerOptions}
          </div>

          <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px;">
            <button type="button" class="btn btn-secondary" onclick="closeLeadsActionModal('${modalId}')">Cancel</button>
            <button type="button" class="btn btn-primary" id="ba_submit"><i class="fas fa-check"></i> Apply</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  const choices = Array.from(document.querySelectorAll('#' + modalId + ' .ba_choice'));
  const unassign = document.getElementById('ba_unassign');

  // If Unassign is checked, clear officer selection. If any officer is checked, uncheck Unassign.
  if (unassign) {
    unassign.addEventListener('change', () => {
      if (!unassign.checked) return;
      choices.forEach(c => c.checked = false);
    });
  }
  choices.forEach(c => {
    c.addEventListener('change', () => {
      if (c.checked && unassign) unassign.checked = false;
    });
  });

  document.getElementById('ba_submit')?.addEventListener('click', async () => {
    const selectedOfficers = choices.filter(x => x.checked).map(x => x.value);
    const doUnassign = Boolean(unassign && unassign.checked);

    if (!doUnassign && selectedOfficers.length === 0) {
      showToast('Select officer(s) or Unassign.', 'error');
      return;
    }

    const btn = document.getElementById('ba_submit');
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    btn.disabled = true;
    try {
      if (doUnassign) {
        await API.leads.bulkAssign({ batchName, sheetName, leadIds: ids, assignedTo: '' });
        showToast(`Unassigned ${ids.length} leads`, 'success');
      } else if (selectedOfficers.length === 1) {
        await API.leads.bulkAssign({ batchName, sheetName, leadIds: ids, assignedTo: selectedOfficers[0] });
        showToast(`Assigned ${ids.length} leads to ${selectedOfficers[0]}`, 'success');
      } else {
        // Multi-officer selection => distribute selected leads round-robin
        await API.leads.bulkDistribute({ batchName, sheetName, leadIds: ids, officers: selectedOfficers });
        showToast(`Distributed ${ids.length} leads among ${selectedOfficers.length} officers`, 'success');
      }

      closeLeadsActionModal(modalId);
      clearSelection();
      await loadLeads();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to update assignment', 'error');
    } finally {
      btn.innerHTML = old;
      btn.disabled = false;
    }
  });
}

async function bulkDistributeLeads() {
  ensureSelectionState();
  const ids = Array.from(window.__selectedLeadIds || []);
  if (!ids.length) return;

  if (!window.currentUser || window.currentUser.role !== 'admin') {
    showToast('Only admin can distribute leads.', 'error');
    return;
  }

  const batchName = window.adminBatchFilter;
  const sheetName = window.adminSheetFilter || 'Main Leads';
  if (!batchName || batchName === 'all') {
    showToast('Please select a batch/sheet from sidebar first.', 'error');
    return;
  }

  const officers = await fetchOfficers();
  if (!officers.length) {
    showToast('No officers found.', 'error');
    return;
  }

  const modalId = 'bulkDistributeModal';
  closeLeadsActionModal(modalId);

  const options = officers.map(o => `
    <label style="display:flex; align-items:center; gap:10px; padding: 10px 12px; border:1px solid #eee; border-radius: 8px; margin-bottom: 10px; cursor:pointer;">
      <input type="checkbox" class="bd_officer" value="${escapeHtml(o)}" />
      <span style="font-weight:600;">${escapeHtml(o)}</span>
    </label>
  `).join('');

  const html = `
    <div class="modal-overlay" id="${modalId}" onclick="closeLeadsActionModalOnOverlayClick(event, '${modalId}')">
      <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 640px;">
        <div class="modal-header">
          <h2><i class="fas fa-users"></i> Distribute ${ids.length} Selected Leads</h2>
          <button class="modal-close" onclick="closeLeadsActionModal('${modalId}')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin-top:0; color:#555;">Select one or more officers. Leads will be distributed round-robin.</p>
          <div style="margin: 14px 0;">
            ${options}
          </div>

          <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px;">
            <button type="button" class="btn btn-secondary" onclick="closeLeadsActionModal('${modalId}')">Cancel</button>
            <button type="button" class="btn btn-success" id="bd_submit"><i class="fas fa-check"></i> Distribute</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  document.getElementById('bd_submit')?.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('#' + modalId + ' .bd_officer:checked')).map(x => x.value);
    if (!selected.length) {
      showToast('Select at least one officer.', 'error');
      return;
    }

    const btn = document.getElementById('bd_submit');
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Distributing...';
    btn.disabled = true;
    try {
      await API.leads.bulkDistribute({ batchName, sheetName, leadIds: ids, officers: selected });
      closeLeadsActionModal(modalId);
      clearSelection();
      await loadLeads();
      showToast(`Distributed ${ids.length} leads among ${selected.length} officers`, 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to distribute', 'error');
    } finally {
      btn.innerHTML = old;
      btn.disabled = false;
    }
  });
}

async function bulkDeleteLeads() {
  ensureSelectionState();
  const ids = Array.from(window.__selectedLeadIds || []);
  if (!ids.length) return;

  if (!window.currentUser || window.currentUser.role !== 'admin') {
    showToast('Only admin can delete leads.', 'error');
    return;
  }

  const batchName = window.adminBatchFilter;
  const sheetName = window.adminSheetFilter || 'Main Leads';
  if (!batchName || batchName === 'all') {
    showToast('Please select a batch/sheet from sidebar first.', 'error');
    return;
  }

  const modalId = 'bulkDeleteModal';
  closeLeadsActionModal(modalId);

  const html = `
    <div class="modal-overlay" id="${modalId}" onclick="closeLeadsActionModalOnOverlayClick(event, '${modalId}')">
      <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 520px;">
        <div class="modal-header" style="background: linear-gradient(135deg, #dc3545 0%, #b02a37 100%);">
          <h2><i class="fas fa-trash"></i> Delete ${ids.length} Leads</h2>
          <button class="modal-close" onclick="closeLeadsActionModal('${modalId}')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin-top:0; color:#333; font-weight:600;">This action cannot be undone.</p>
          <p style="color:#666;">Are you sure you want to permanently delete the selected leads?</p>

          <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px;">
            <button type="button" class="btn btn-secondary" onclick="closeLeadsActionModal('${modalId}')">Cancel</button>
            <button type="button" class="btn btn-danger" id="bdl_submit"><i class="fas fa-trash"></i> Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  document.getElementById('bdl_submit')?.addEventListener('click', async () => {
    const btn = document.getElementById('bdl_submit');
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    btn.disabled = true;
    try {
      await API.leads.bulkDelete({ batchName, sheetName, leadIds: ids });
      closeLeadsActionModal(modalId);
      clearSelection();
      await loadLeads();
      showToast(`Deleted ${ids.length} leads`, 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to delete', 'error');
    } finally {
      btn.innerHTML = old;
      btn.disabled = false;
    }
  });
}


async function getAuthHeaders() {
  let authHeaders = {};
  if (window.supabaseClient) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session && session.access_token) {
      authHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }
  }
  return authHeaders;
}

async function fetchOfficers() {
  const authHeaders = await getAuthHeaders();
  const res = await fetch('/api/batches/officers', { headers: authHeaders });
  const json = await res.json();
  if (!json.success) return [];
  const raw = (json.officers || []);
  return raw
    .map(o => {
      if (o == null) return '';
      if (typeof o === 'string') return o;
      // support { name }, { officer_name }, { email }
      return o.name || o.officer_name || o.officerName || o.email || '';
    })
    .map(x => String(x || '').trim())
    .filter(Boolean);
}

// -------------------------
// Modal helpers (Leads)
// -------------------------
function closeLeadsActionModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.remove();
  document.body.style.overflow = '';
}

function closeLeadsActionModalOnOverlayClick(event, modalId) {
  if (event && event.target && event.target.classList.contains('modal-overlay')) {
    closeLeadsActionModal(modalId);
  }
}

async function openNewLeadModal() {
  const isOfficerView = (window.leadsModeOrBatch === 'myLeads') || (window.currentUser && window.currentUser.role !== 'admin');

  const batchName = isOfficerView ? window.officerBatchFilter : window.adminBatchFilter;
  const sheetName = (isOfficerView ? window.officerSheetFilter : window.adminSheetFilter) || 'Main Leads';

  if (!batchName || batchName === 'all') {
    showToast('Please select a batch/sheet from sidebar first.', 'error');
    return;
  }

  const modalId = 'newLeadModal';
  closeLeadsActionModal(modalId);

  const html = `
    <div class="modal-overlay" id="${modalId}" onclick="closeLeadsActionModalOnOverlayClick(event, '${modalId}')">
      <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 640px;">
        <div class="modal-header">
          <h2><i class="fas fa-plus"></i> New Lead</h2>
          <button class="modal-close" onclick="closeLeadsActionModal('${modalId}')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <form id="newLeadForm">
            <div class="form-grid">
              <div class="form-group full-width">
                <label for="nl_name"><i class="fas fa-user"></i> Name *</label>
                <input type="text" id="nl_name" class="form-control" required />
              </div>
              <div class="form-group">
                <label for="nl_phone"><i class="fas fa-phone"></i> Phone</label>
                <input type="tel" id="nl_phone" class="form-control" />
              </div>
              <div class="form-group">
                <label for="nl_email"><i class="fas fa-envelope"></i> Email</label>
                <input type="email" id="nl_email" class="form-control" />
              </div>
              <div class="form-group">
                <label for="nl_course"><i class="fas fa-book"></i> Course</label>
                <input type="text" id="nl_course" class="form-control" />
              </div>
              <div class="form-group">
                <label for="nl_source"><i class="fas fa-share-alt"></i> Source</label>
                <input type="text" id="nl_source" class="form-control" />
              </div>
              <div class="form-group">
                <label for="nl_priority"><i class="fas fa-flag"></i> Priority</label>
                <select id="nl_priority" class="form-control">
                  <option value="">(none)</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              ${isOfficerView ? '' : `
              <div class="form-group">
                <label for="nl_assigned"><i class="fas fa-user-tie"></i> Assigned To</label>
                <select id="nl_assigned" class="form-control">
                  <option value="">Unassigned</option>
                </select>
                <small style="color:#666; margin-top:6px; display:block;">Optional. You can assign later too.</small>
              </div>
              `}
              <div class="form-group full-width">
                <label for="nl_notes"><i class="fas fa-sticky-note"></i> Notes</label>
                <textarea id="nl_notes" class="form-control" rows="3"></textarea>
              </div>
            </div>

            <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px;">
              <button type="button" class="btn btn-secondary" onclick="closeLeadsActionModal('${modalId}')">Cancel</button>
              <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Create Lead</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  // Populate officers dropdown (admin only)
  if (!isOfficerView) {
    try {
      const officers = await fetchOfficers();
      const select = document.getElementById('nl_assigned');
      if (select) {
        officers.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          select.appendChild(opt);
        });
      }
    } catch (e) {
      // ignore
    }
  }

  const form = document.getElementById('newLeadForm');
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const old = btn ? btn.innerHTML : '';
      
      // Prevent double-click by immediately disabling
      if (btn) {
        if (btn.disabled) return; // Already submitting
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        btn.disabled = true;
      }

      try {
        const lead = {
          name: document.getElementById('nl_name')?.value || '',
          phone: document.getElementById('nl_phone')?.value || '',
          email: document.getElementById('nl_email')?.value || '',
          course: document.getElementById('nl_course')?.value || '',
          source: document.getElementById('nl_source')?.value || '',
          priority: document.getElementById('nl_priority')?.value || '',
          assignedTo: isOfficerView ? '' : (document.getElementById('nl_assigned')?.value || ''),
          notes: document.getElementById('nl_notes')?.value || '',
          status: 'New'
        };

        const result = isOfficerView 
          ? await API.leads.createMy({ batchName, sheetName, lead })
          : await API.leads.create({ batchName, sheetName, lead });
        
        // Check if the created lead is marked as duplicate
        const createdLead = result?.lead;
        if (createdLead && (createdLead.isDuplicate || String(createdLead.assignedTo || '').toLowerCase() === 'duplicate')) {
          showToast('Lead created but marked as Duplicate (phone number already exists in this batch)', 'warning');
        } else {
          showToast('Lead created successfully', 'success');
        }
        
        // Close modal after showing toast
        closeLeadsActionModal(modalId);
        
        await loadLeads();
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Failed to create lead', 'error');
        // Re-enable button on error so user can retry
        if (btn) {
          btn.innerHTML = old;
          btn.disabled = false;
        }
      }
    });
  }

  // focus
  setTimeout(() => document.getElementById('nl_name')?.focus(), 50);
}

async function openDistributeUnassignedModal() {
  if (!window.currentUser || window.currentUser.role !== 'admin') {
    showToast('Only admin can distribute leads.', 'error');
    return;
  }

  const batchName = window.adminBatchFilter;
  const sheetName = window.adminSheetFilter || 'Main Leads';
  if (!batchName || batchName === 'all') {
    showToast('Please select a batch/sheet from sidebar first.', 'error');
    return;
  }

  const officers = await fetchOfficers();
  if (!officers.length) {
    showToast('No officers found to distribute.', 'error');
    return;
  }

  const modalId = 'distributeUnassignedModal';
  closeLeadsActionModal(modalId);

  const options = officers.map(o => `
    <label style="display:flex; align-items:center; gap:10px; padding: 10px 12px; border:1px solid #eee; border-radius: 8px; margin-bottom: 10px; cursor:pointer;">
      <input type="checkbox" class="du_officer" value="${escapeHtml(o)}" />
      <span style="font-weight:600;">${escapeHtml(o)}</span>
    </label>
  `).join('');

  const html = `
    <div class="modal-overlay" id="${modalId}" onclick="closeLeadsActionModalOnOverlayClick(event, '${modalId}')">
      <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 640px;">
        <div class="modal-header">
          <h2><i class="fas fa-share-alt"></i> Distribute Unassigned Leads</h2>
          <button class="modal-close" onclick="closeLeadsActionModal('${modalId}')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin-top:0; color:#555;">Select one or more officers. Leads will be distributed round-robin.</p>
          <div style="margin: 14px 0;">
            ${options}
          </div>

          <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px;">
            <button type="button" class="btn btn-secondary" onclick="closeLeadsActionModal('${modalId}')">Cancel</button>
            <button type="button" class="btn btn-warning" id="du_submitBtn"><i class="fas fa-users"></i> Distribute</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  const submit = document.getElementById('du_submitBtn');
  if (submit) {
    submit.addEventListener('click', async () => {
      const btn = submit;
      const old = btn.innerHTML;
      const selected = Array.from(document.querySelectorAll('#' + modalId + ' .du_officer:checked')).map(x => x.value);
      if (!selected.length) {
        showToast('Select at least one officer.', 'error');
        return;
      }

      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Distributing...';
      btn.disabled = true;
      try {
        const result = await API.leads.distributeUnassigned({ batchName, sheetName, officers: selected });
        closeLeadsActionModal(modalId);
        showToast(`Distributed ${result.updatedCount || 0} unassigned leads`, 'success');
        await loadLeads();
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Failed to distribute', 'error');
      } finally {
        btn.innerHTML = old;
        btn.disabled = false;
      }
    });
  }
}

// Keep old function names (buttons call these)
async function createNewLead() {
  return openNewLeadModal();
}

async function distributeUnassignedLeads() {
  return openDistributeUnassignedModal();
}

// Export for global access
window.initLeadsPage = initLeadsPage;
window.leadsPageLoadLeads = loadLeads;  // Renamed to avoid conflict
window.viewLeadDetails = viewLeadDetails;
window.toggleLeadSelectionFromCheckbox = toggleLeadSelectionFromCheckbox;
window.toggleSelectAll = toggleSelectAll;
window.clearSelection = clearSelection;
window.bulkAssignLeads = bulkAssignLeads;
window.bulkDistributeLeads = bulkDistributeLeads;
window.bulkDeleteLeads = bulkDeleteLeads;
window.createNewLead = createNewLead;
window.distributeUnassignedLeads = distributeUnassignedLeads;
