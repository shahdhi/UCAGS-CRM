/**
 * Leads Page Module
 * Handles leads page functionality
 */

let currentLeads = [];
let currentPage = 1;
let rowsPerPage = 1000; // Show all leads (increased from 10)
let sortColumn = 'id';
let sortDirection = 'desc';

let currentBatch = 'all'; // Track current batch
let selectedLeads = new Set(); // Track selected lead IDs
let isInitialized = false; // Track if page is already initialized
let isLoading = false; // Track if currently loading to prevent duplicates

/**
 * Initialize leads page
 * @param {string} batchName - Name of the batch sheet (e.g., 'all', 'Batch10', 'Batch12', etc.)
 */
async function initLeadsPage(batchName = 'all') {
  // Prevent duplicate initialization for the same batch
  if (currentBatch === batchName && isInitialized) {
    console.log(`ℹ️  Already initialized for ${batchName}, just loading data...`);
    await loadLeads();
    return;
  }
  
  console.log('🔄 Initializing leads page for:', batchName);
  
  // For officers viewing personal leads, don't set batch
  if (window.currentUser && window.currentUser.role !== 'admin' && batchName === 'myLeads') {
    currentBatch = null; // Officers don't use batch system
    console.log('Initializing personal leads page for officer:', window.currentUser.name);
  } else {
    currentBatch = batchName;
    console.log('Initializing leads page for batch:', batchName);
  }
  
  // Setup event listeners (only once)
  if (!isInitialized) {
    setupLeadsEventListeners();
    startAutoRefresh(); // Start auto-refresh (every 30 seconds)
  }
  
  // Mark as initialized
  isInitialized = true;
  
  // Load leads data
  await loadLeads();
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
  
  // Add Lead button
  const addLeadBtn = document.getElementById('addLeadBtn');
  if (addLeadBtn) {
    // Remove old listener first
    const newAddLeadBtn = addLeadBtn.cloneNode(true);
    addLeadBtn.parentNode.replaceChild(newAddLeadBtn, addLeadBtn);
    // Add new listener
    newAddLeadBtn.addEventListener('click', () => {
      openAddLeadModal();
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

  // Status filter
  const statusFilter = document.getElementById('leadsStatusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      currentPage = 1;
      loadLeads();
    });
  }

  // Table header sorting
  const table = document.getElementById('leadsTable');
  if (table) {
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
        renderLeadsTable();
      });
    });
  }
}

/**
 * Load leads from API
 * @param {boolean} silentRefresh - If true, don't show loading state (for auto-refresh)
 */
async function loadLeads(silentRefresh = false) {
  // Prevent duplicate simultaneous loads
  if (isLoading) {
    console.log('⚠️  Load already in progress, skipping...');
    return;
  }
  
  isLoading = true;
  
  try {
    const searchInput = document.getElementById('leadsSearchInput');
    const statusFilter = document.getElementById('leadsStatusFilter');

    // Show loading state only if not silent refresh
    if (!silentRefresh) {
      showLeadsLoading();
    }

    // Debug logging
    console.log('=== loadLeads Debug ===');
    console.log('window.currentUser:', window.currentUser);
    console.log('currentUser.role:', window.currentUser?.role);
    console.log('Is admin?:', window.currentUser?.role === 'admin');
    console.log('======================');

    // Check if user is an officer - they should only see their own leads
    if (window.currentUser && window.currentUser.role !== 'admin') {
      // Officer: Fetch from their personal sheet
      console.log('📋 Current User:', window.currentUser);
      console.log(`📋 Loading personal leads for: ${window.currentUser.name}`);
      
      // Validate that user has a name
      if (!window.currentUser.name || window.currentUser.name.includes('@')) {
        showLeadsError('Your account is not properly set up. Please contact an administrator to set your name properly.');
        return;
      }
      
      try {
        // Get auth token
        let authHeaders = {};
        if (window.supabaseClient) {
          const { data: { session } } = await window.supabaseClient.auth.getSession();
          if (session && session.access_token) {
            authHeaders['Authorization'] = `Bearer ${session.access_token}`;
          }
        }
        
        // New system: load officer leads from per-batch spreadsheets
        const batchesRes = await fetch('/api/batch-leads/batches', { headers: authHeaders });
        const batchesData = await batchesRes.json();
        const batches = (batchesData && batchesData.batches) ? batchesData.batches : [];

        const batchFilter = window.officerBatchFilter;

        if (batchFilter && batchFilter !== 'all') {
          const targetBatch = decodeURIComponent(batchFilter);
          const sheet = window.officerSheetFilter || 'Main Leads';
          const res = await fetch(`/api/batch-leads/${encodeURIComponent(targetBatch)}/my-leads?sheet=${encodeURIComponent(sheet)}`, { headers: authHeaders });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || 'Failed to fetch your leads');
          currentLeads = data.leads || [];
        } else {
          // Aggregate across all batches
          const all = [];
          for (const b of batches) {
            try {
              const sheet = window.officerSheetFilter || 'Main Leads';
              const res = await fetch(`/api/batch-leads/${encodeURIComponent(b)}/my-leads?sheet=${encodeURIComponent(sheet)}`, { headers: authHeaders });
              const data = await res.json();
              if (data.success && data.leads) {
                data.leads.forEach(l => { if (!l.batch) l.batch = b; });
                all.push(...data.leads);
              }
            } catch (e) {
              console.warn('Failed to load my leads for batch', b, e);
            }
          }
          currentLeads = all;
        }
        
        // Apply filters if any
        if (searchInput && searchInput.value) {
          const searchTerm = searchInput.value.toLowerCase();
          currentLeads = currentLeads.filter(lead => 
            lead.name.toLowerCase().includes(searchTerm) ||
            (lead.email && lead.email.toLowerCase().includes(searchTerm)) ||
            (lead.phone && lead.phone.includes(searchTerm))
          );
        }
        
        if (statusFilter && statusFilter.value) {
          currentLeads = currentLeads.filter(lead => lead.status === statusFilter.value);
        }
        
        renderLeadsTable();
        console.log(`✓ Loaded ${currentLeads.length} personal leads`);

      // Officer batch filtering is handled at fetch time in the new per-batch system
        
      } catch (error) {
        console.error('Error loading personal leads:', error);
        showLeadsError('Could not load your personal leads. Your sheet may not exist yet. Contact admin.');
      }
      
    } else {
      // Admin: Fetch from batch sheets (original behavior)
      console.log('📊 Loading batch leads for admin');
      
      const filters = {};
      if (searchInput && searchInput.value) {
        filters.search = searchInput.value;
      }
      if (statusFilter && statusFilter.value) {
        filters.status = statusFilter.value;
      }
      
      // Add batch filter
      if (currentBatch && currentBatch !== 'all' && currentBatch !== 'myLeads') {
        filters.batch = currentBatch;
      }

      const response = await API.leads.getAll(filters);
      currentLeads = response.leads || [];

      renderLeadsTable();
      
      console.log(`✓ Loaded ${currentLeads.length} leads from ${currentBatch || 'all batches'}`);
    }
  } catch (error) {
    console.error('Error loading leads:', error);
    showLeadsError(error.message);
  } finally {
    isLoading = false;
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
    updateBulkActionsToolbar();
    return;
  }

  // Don't sort - keep original order from sheet
  const leadsToDisplay = currentLeads;

  // Pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedLeads = leadsToDisplay.slice(startIndex, endIndex);

  // Generate new HTML with checkboxes
  const newHTML = paginatedLeads.map(lead => `
    <tr style="cursor: pointer;" onclick="viewLeadDetails(${lead.id})" title="Click to view details">
      <td onclick="event.stopPropagation()">
        <input type="checkbox" 
               class="lead-checkbox" 
               data-lead-id="${lead.id}" 
               ${selectedLeads.has(lead.id) ? 'checked' : ''}
               onchange="toggleLeadSelection(${lead.id})">
      </td>
      <td>${lead.id}</td>
      <td><strong>${escapeHtml(lead.name)}</strong></td>
      <td>${escapeHtml(lead.email)}</td>
      <td>${lead.phone ? `<a href="tel:${lead.phone}" onclick="event.stopPropagation()">${escapeHtml(lead.phone)}</a>` : '-'}</td>
      <td>${escapeHtml(lead.assignedTo) || '-'}</td>
    </tr>
  `).join('');

  // Only update if content has changed (prevents unnecessary re-renders)
  if (tbody.innerHTML !== newHTML) {
    // Save scroll position (window/document scroll)
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    tbody.innerHTML = newHTML;
    
    // Restore scroll position
    window.scrollTo(0, scrollTop);
  }

  // Update pagination info
  updatePaginationInfo(leadsToDisplay.length);
  
  // Update bulk actions toolbar
  updateBulkActionsToolbar();
  
  // Update select all checkbox
  updateSelectAllCheckbox();
}

/**
 * Toggle individual lead selection
 */
function toggleLeadSelection(leadId) {
  if (selectedLeads.has(leadId)) {
    selectedLeads.delete(leadId);
  } else {
    selectedLeads.add(leadId);
  }
  updateBulkActionsToolbar();
  updateSelectAllCheckbox();
}

/**
 * Toggle select all
 */
function toggleSelectAll() {
  const checkbox = document.getElementById('selectAllCheckbox');
  if (!checkbox) return;
  
  if (checkbox.checked) {
    // Select all visible leads
    currentLeads.forEach(lead => selectedLeads.add(lead.id));
  } else {
    // Clear selection
    selectedLeads.clear();
  }
  
  renderLeadsTable();
}

/**
 * Update select all checkbox state
 */
function updateSelectAllCheckbox() {
  const checkbox = document.getElementById('selectAllCheckbox');
  if (!checkbox) return;
  
  const visibleLeadIds = currentLeads.map(l => l.id);
  const allSelected = visibleLeadIds.length > 0 && visibleLeadIds.every(id => selectedLeads.has(id));
  const someSelected = visibleLeadIds.some(id => selectedLeads.has(id));
  
  checkbox.checked = allSelected;
  checkbox.indeterminate = someSelected && !allSelected;
}

/**
 * Clear selection
 */
function clearSelection() {
  selectedLeads.clear();
  renderLeadsTable();
}

/**
 * Update bulk actions toolbar
 */
function updateBulkActionsToolbar() {
  const toolbar = document.getElementById('bulkActionsToolbar');
  const countSpan = document.getElementById('selectedCount');
  
  if (!toolbar) return;
  
  if (selectedLeads.size > 0) {
    toolbar.style.display = 'flex';
    if (countSpan) {
      countSpan.textContent = `${selectedLeads.size} selected`;
    }
  } else {
    toolbar.style.display = 'none';
  }
}

/**
 * Bulk assign leads to officer
 */
async function bulkAssignLeads() {
  if (selectedLeads.size === 0) {
    showToast('Please select leads first', 'error');
    return;
  }
  
  // Fetch officers
  try {
    const response = await fetch('/api/users/officers');
    const data = await response.json();
    
    if (!data.success || !data.officers || data.officers.length === 0) {
      showToast('No officers available', 'error');
      return;
    }
    
    // Create selection modal
    const options = data.officers.map(officer => 
      `<option value="${escapeHtml(officer.name)}">${escapeHtml(officer.name)}</option>`
    ).join('');
    
    const modalHTML = `
      <div class="modal-overlay" id="bulkAssignModal" onclick="closeBulkAssignModal(event)">
        <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 500px;">
          <div class="modal-header">
            <h2><i class="fas fa-user-tie"></i> Assign ${selectedLeads.size} Leads</h2>
            <button class="modal-close" onclick="closeBulkAssignModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <p>Select an officer to assign ${selectedLeads.size} selected lead(s):</p>
            <select id="bulkAssignOfficer" class="form-control" style="margin-top: 16px;">
              <option value="">-- Select Officer --</option>
              ${options}
              <option value="__UNASSIGN__" style="color: #f44336; font-weight: 600;">✕ Unassign All</option>
            </select>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeBulkAssignModal()">Cancel</button>
            <button class="btn btn-primary" onclick="executeBulkAssign()">
              <i class="fas fa-check"></i> Assign Leads
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('Error loading officers:', error);
    showToast('Failed to load officers', 'error');
  }
}

/**
 * Execute bulk assignment
 */
async function executeBulkAssign() {
  const select = document.getElementById('bulkAssignOfficer');
  if (!select) return;
  
  let officer = select.value;
  if (!officer) {
    showToast('Please select an officer or unassign option', 'error');
    return;
  }
  
  // Handle unassign action
  let isUnassign = false;
  if (officer === '__UNASSIGN__') {
    if (!confirm(`Are you sure you want to unassign ${selectedLeads.size} selected lead(s)? They will be removed from officers' sheets.`)) {
      return;
    }
    officer = ''; // Set to empty string for unassign
    isUnassign = true;
  }
  
  const leadIds = Array.from(selectedLeads);
  let successCount = 0;
  let failCount = 0;
  
  try {
    if (isUnassign) {
      showToast(`Unassigning ${leadIds.length} leads...`, 'info');
    } else {
      showToast(`Assigning ${leadIds.length} leads...`, 'info');
    }
    
    for (const leadId of leadIds) {
      try {
        const response = await API.leads.update(leadId, { assignedTo: officer }, currentBatch);
        if (response.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
        console.error(`Failed to assign lead ${leadId}:`, error);
      }
    }
    
    closeBulkAssignModal();
    
    if (failCount === 0) {
      if (isUnassign) {
        showToast(`✓ Successfully unassigned ${successCount} leads`, 'success');
      } else {
        showToast(`✓ Successfully assigned ${successCount} leads to ${officer}`, 'success');
      }
    } else {
      if (isUnassign) {
        showToast(`Unassigned ${successCount} leads, ${failCount} failed`, 'warning');
      } else {
        showToast(`Assigned ${successCount} leads, ${failCount} failed`, 'warning');
      }
    }
    
    clearSelection();
    // Use silent refresh to avoid flickering
    await loadLeads(true);
    
  } catch (error) {
    console.error('Error in bulk assign:', error);
    showToast('Bulk assignment failed', 'error');
  }
}

/**
 * Close bulk assign modal
 */
function closeBulkAssignModal(event) {
  if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) {
    return;
  }
  
  const modal = document.getElementById('bulkAssignModal');
  if (modal) {
    modal.remove();
  }
  document.body.style.overflow = '';
}

/**
 * Bulk distribute leads among multiple officers
 */
async function bulkDistributeLeads() {
  if (selectedLeads.size === 0) {
    showToast('Please select leads first', 'error');
    return;
  }
  
  // Fetch officers
  try {
    const response = await fetch('/api/users/officers');
    const data = await response.json();
    
    if (!data.success || !data.officers || data.officers.length === 0) {
      showToast('No officers available', 'error');
      return;
    }
    
    // Create multi-select modal
    const checkboxes = data.officers.map(officer => 
      `<label style="display: block; padding: 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" class="officer-checkbox" value="${escapeHtml(officer.name)}" style="margin-right: 8px;">
        ${escapeHtml(officer.name)}
      </label>`
    ).join('');
    
    const modalHTML = `
      <div class="modal-overlay" id="bulkDistributeModal" onclick="closeBulkDistributeModal(event)">
        <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 550px;">
          <div class="modal-header">
            <h2><i class="fas fa-users"></i> Distribute ${selectedLeads.size} Leads</h2>
            <button class="modal-close" onclick="closeBulkDistributeModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom: 16px;">Select officers to distribute ${selectedLeads.size} lead(s) equally among them:</p>
            <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 16px; max-height: 300px; overflow-y: auto;">
              <div style="margin-bottom: 12px;">
                <label style="display: block; padding: 8px; cursor: pointer; background: #e3f2fd; border-radius: 4px; font-weight: 600;">
                  <input type="checkbox" id="selectAllOfficers" onchange="toggleAllOfficers()" style="margin-right: 8px;">
                  Select All Officers
                </label>
              </div>
              <div id="officerCheckboxes">
                ${checkboxes}
              </div>
            </div>
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin-top: 16px;">
              <p style="margin: 0; color: #856404; font-size: 13px;">
                <i class="fas fa-info-circle"></i> <strong>Distribution Logic:</strong><br>
                Leads will be distributed equally. If leads cannot be divided evenly, some officers will receive one extra lead.
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeBulkDistributeModal()">Cancel</button>
            <button class="btn btn-success" onclick="executeDistributeLeads()">
              <i class="fas fa-check"></i> Distribute Leads
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('Error loading officers:', error);
    showToast('Failed to load officers', 'error');
  }
}

/**
 * Toggle all officers checkbox
 */
function toggleAllOfficers() {
  const selectAll = document.getElementById('selectAllOfficers');
  const checkboxes = document.querySelectorAll('.officer-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

/**
 * Execute lead distribution
 */
async function executeDistributeLeads() {
  const checkboxes = document.querySelectorAll('.officer-checkbox:checked');
  
  if (checkboxes.length === 0) {
    showToast('Please select at least one officer', 'error');
    return;
  }
  
  const officers = Array.from(checkboxes).map(cb => cb.value);
  const leadIds = Array.from(selectedLeads);
  
  // Calculate distribution
  const leadsPerOfficer = Math.floor(leadIds.length / officers.length);
  const remainder = leadIds.length % officers.length;
  
  console.log(`📊 Distributing ${leadIds.length} leads among ${officers.length} officers`);
  console.log(`Each officer gets: ${leadsPerOfficer} leads, ${remainder} officer(s) get +1 extra`);
  
  try {
    showToast(`Distributing ${leadIds.length} leads among ${officers.length} officers...`, 'info');
    
    let leadIndex = 0;
    let successCount = 0;
    let failCount = 0;
    
    // Distribute leads
    for (let i = 0; i < officers.length; i++) {
      const officer = officers[i];
      // First 'remainder' officers get one extra lead
      const leadsForThisOfficer = leadsPerOfficer + (i < remainder ? 1 : 0);
      
      console.log(`Assigning ${leadsForThisOfficer} leads to ${officer}`);
      
      for (let j = 0; j < leadsForThisOfficer && leadIndex < leadIds.length; j++) {
        const leadId = leadIds[leadIndex++];
        
        try {
          const response = await API.leads.update(leadId, { assignedTo: officer }, currentBatch);
          if (response.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
          console.error(`Failed to assign lead ${leadId} to ${officer}:`, error);
        }
      }
    }
    
    closeBulkDistributeModal();
    
    // Show results
    const summary = officers.map((officer, i) => {
      const count = leadsPerOfficer + (i < remainder ? 1 : 0);
      return `${officer}: ${count} lead(s)`;
    }).join('\n');
    
    if (failCount === 0) {
      showToast(`✓ Successfully distributed ${successCount} leads!\n\n${summary}`, 'success');
    } else {
      showToast(`Distributed ${successCount} leads, ${failCount} failed\n\n${summary}`, 'warning');
    }
    
    clearSelection();
    await loadLeads(true);
    
  } catch (error) {
    console.error('Error in distribute leads:', error);
    showToast('Lead distribution failed', 'error');
  }
}

/**
 * Close bulk distribute modal
 */
function closeBulkDistributeModal(event) {
  if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) {
    return;
  }
  
  const modal = document.getElementById('bulkDistributeModal');
  if (modal) {
    modal.remove();
  }
  document.body.style.overflow = '';
}

/**
 * Distribute all unassigned leads
 */
async function distributeUnassignedLeads() {
  // Get all unassigned leads
  const unassignedLeads = currentLeads.filter(lead => !lead.assignedTo || lead.assignedTo === '');
  
  if (unassignedLeads.length === 0) {
    showToast('No unassigned leads found', 'info');
    return;
  }
  
  // Fetch officers
  try {
    const response = await fetch('/api/users/officers');
    const data = await response.json();
    
    if (!data.success || !data.officers || data.officers.length === 0) {
      showToast('No officers available', 'error');
      return;
    }
    
    // Create multi-select modal
    const checkboxes = data.officers.map(officer => 
      `<label style="display: block; padding: 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" class="unassigned-officer-checkbox" value="${escapeHtml(officer.name)}" style="margin-right: 8px;">
        ${escapeHtml(officer.name)}
      </label>`
    ).join('');
    
    const modalHTML = `
      <div class="modal-overlay" id="distributeUnassignedModal" onclick="closeDistributeUnassignedModal(event)">
        <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 550px;">
          <div class="modal-header">
            <h2><i class="fas fa-share-alt"></i> Distribute ${unassignedLeads.length} Unassigned Leads</h2>
            <button class="modal-close" onclick="closeDistributeUnassignedModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
              <p style="margin: 0; color: #e65100; font-size: 14px;">
                <i class="fas fa-info-circle"></i> <strong>${unassignedLeads.length} unassigned leads</strong> found in the current batch.
              </p>
            </div>
            <p style="margin-bottom: 16px;">Select officers to distribute these leads equally:</p>
            <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 16px; max-height: 300px; overflow-y: auto;">
              <div style="margin-bottom: 12px;">
                <label style="display: block; padding: 8px; cursor: pointer; background: #e3f2fd; border-radius: 4px; font-weight: 600;">
                  <input type="checkbox" id="selectAllUnassignedOfficers" onchange="toggleAllUnassignedOfficers()" style="margin-right: 8px;">
                  Select All Officers
                </label>
              </div>
              <div id="unassignedOfficerCheckboxes">
                ${checkboxes}
              </div>
            </div>
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin-top: 16px;">
              <p style="margin: 0; color: #856404; font-size: 13px;">
                <i class="fas fa-info-circle"></i> <strong>Distribution Logic:</strong><br>
                All ${unassignedLeads.length} unassigned leads will be distributed equally among selected officers.
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeDistributeUnassignedModal()">Cancel</button>
            <button class="btn btn-warning" onclick="executeDistributeUnassignedLeads()">
              <i class="fas fa-check"></i> Distribute Leads
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('Error loading officers:', error);
    showToast('Failed to load officers', 'error');
  }
}

/**
 * Toggle all unassigned officers checkbox
 */
function toggleAllUnassignedOfficers() {
  const selectAll = document.getElementById('selectAllUnassignedOfficers');
  const checkboxes = document.querySelectorAll('.unassigned-officer-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

/**
 * Execute unassigned leads distribution
 */
async function executeDistributeUnassignedLeads() {
  const checkboxes = document.querySelectorAll('.unassigned-officer-checkbox:checked');
  
  if (checkboxes.length === 0) {
    showToast('Please select at least one officer', 'error');
    return;
  }
  
  const officers = Array.from(checkboxes).map(cb => cb.value);
  const unassignedLeads = currentLeads.filter(lead => !lead.assignedTo || lead.assignedTo === '');
  const leadIds = unassignedLeads.map(lead => lead.id);
  
  // Calculate distribution
  const leadsPerOfficer = Math.floor(leadIds.length / officers.length);
  const remainder = leadIds.length % officers.length;
  
  console.log(`📊 Distributing ${leadIds.length} unassigned leads among ${officers.length} officers`);
  console.log(`Each officer gets: ${leadsPerOfficer} leads, ${remainder} officer(s) get +1 extra`);
  
  try {
    showToast(`Distributing ${leadIds.length} unassigned leads among ${officers.length} officers...`, 'info');
    
    let leadIndex = 0;
    let successCount = 0;
    let failCount = 0;
    
    // Distribute leads
    for (let i = 0; i < officers.length; i++) {
      const officer = officers[i];
      const leadsForThisOfficer = leadsPerOfficer + (i < remainder ? 1 : 0);
      
      console.log(`Assigning ${leadsForThisOfficer} unassigned leads to ${officer}`);
      
      for (let j = 0; j < leadsForThisOfficer && leadIndex < leadIds.length; j++) {
        const leadId = leadIds[leadIndex++];
        
        try {
          const response = await API.leads.update(leadId, { assignedTo: officer }, currentBatch);
          if (response.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
          console.error(`Failed to assign lead ${leadId} to ${officer}:`, error);
        }
      }
    }
    
    closeDistributeUnassignedModal();
    
    // Show results
    const summary = officers.map((officer, i) => {
      const count = leadsPerOfficer + (i < remainder ? 1 : 0);
      return `${officer}: ${count} lead(s)`;
    }).join('\n');
    
    if (failCount === 0) {
      showToast(`✓ Successfully distributed ${successCount} unassigned leads!\n\n${summary}`, 'success');
    } else {
      showToast(`Distributed ${successCount} leads, ${failCount} failed\n\n${summary}`, 'warning');
    }
    
    await loadLeads(true);
    
  } catch (error) {
    console.error('Error in distribute unassigned leads:', error);
    showToast('Distribution failed', 'error');
  }
}

/**
 * Close distribute unassigned modal
 */
function closeDistributeUnassignedModal(event) {
  if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) {
    return;
  }
  
  const modal = document.getElementById('distributeUnassignedModal');
  if (modal) {
    modal.remove();
  }
  document.body.style.overflow = '';
}

/**
 * Bulk delete leads
 */
async function bulkDeleteLeads() {
  if (selectedLeads.size === 0) {
    showToast('Please select leads first', 'error');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete ${selectedLeads.size} selected lead(s)? This action cannot be undone.`)) {
    return;
  }
  
  const leadIds = Array.from(selectedLeads);
  let successCount = 0;
  let failCount = 0;
  
  try {
    showToast(`Deleting ${leadIds.length} leads...`, 'info');
    
    for (const leadId of leadIds) {
      try {
        const response = await API.leads.delete(leadId);
        if (response.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
        console.error(`Failed to delete lead ${leadId}:`, error);
      }
    }
    
    if (failCount === 0) {
      showToast(`✓ Successfully deleted ${successCount} leads`, 'success');
    } else {
      showToast(`Deleted ${successCount} leads, ${failCount} failed`, 'warning');
    }
    
    clearSelection();
    // Use silent refresh to avoid flickering
    await loadLeads(true);
    
  } catch (error) {
    console.error('Error in bulk delete:', error);
    showToast('Bulk delete failed', 'error');
  }
}

/**
 * Show loading state
 */
function showLeadsLoading() {
  const tbody = document.getElementById('leadsTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="loading" style="text-align: center; padding: 40px;">
          <i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>
          <p>Loading leads...</p>
        </td>
      </tr>
    `;
  }
}

/**
 * Show error state
 */
function showLeadsError(message) {
  const tbody = document.getElementById('leadsTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 40px;">
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
function updatePaginationInfo(totalLeads) {
  // This can be expanded to show pagination controls
  console.log(`Showing ${Math.min(currentPage * rowsPerPage, totalLeads)} of ${totalLeads} leads`);
}

/**
 * View lead details in modal
 */
async function viewLeadDetails(leadId) {
  const lead = currentLeads.find(l => l.id == leadId);
  if (!lead) return;
  
  // Check if user is admin - load officers for dropdown
  const isAdmin = window.currentUser && window.currentUser.role === 'admin';
  let assignedToSection = `<span class="detail-value">${escapeHtml(lead.assignedTo) || 'Unassigned'}</span>`;
  
  if (isAdmin) {
    try {
      // Fetch officers from API
      const response = await fetch('/api/users/officers');
      const data = await response.json();
      
      if (data.success && data.officers) {
        const options = data.officers.map(officer => 
          `<option value="${escapeHtml(officer.name)}" ${lead.assignedTo === officer.name ? 'selected' : ''}>${escapeHtml(officer.name)}</option>`
        ).join('');
        
        assignedToSection = `
          <select id="quickAssignOfficer" class="form-control" style="display: inline-block; width: auto; min-width: 200px;" onchange="quickAssignLead(${lead.id})">
            <option value="">-- Select Officer --</option>
            ${options}
            <option value="__UNASSIGN__" style="color: #f44336; font-weight: 600;">✕ Unassign</option>
          </select>
          <span id="assignSaveStatus" style="margin-left: 10px; color: #4CAF50; display: none;">
            <i class="fas fa-check-circle"></i> Saved
          </span>
        `;
      } else {
        assignedToSection = `<span class="detail-value">${escapeHtml(lead.assignedTo) || 'Unassigned'}</span>`;
      }
    } catch (error) {
      console.error('Error loading officers:', error);
      assignedToSection = `<span class="detail-value">${escapeHtml(lead.assignedTo) || 'Unassigned'}</span>`;
    }
  }
  
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
                <span class="detail-value">${escapeHtml(lead.course) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Source:</span>
                <span class="detail-value">${escapeHtml(lead.source) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Platform:</span>
                <span class="detail-value">${escapeHtml(lead.platform) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Planning to start immediately:</span>
                <span class="detail-value">${escapeHtml(lead.are_you_planning_to_start_immediately) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Why interested:</span>
                <span class="detail-value">${escapeHtml(lead.why_are_you_interested_in_this_diploma) || '-'}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value"><span class="badge badge-${getStatusColor(lead.status)}">${escapeHtml(lead.status)}</span></span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Assigned To:</span>
                ${assignedToSection}
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

          <div class="detail-section" style="margin-top: 20px;">
            <h3><i class="fab fa-whatsapp" style="color:#25D366;"></i> WhatsApp</h3>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap: wrap;">
              <button class="btn btn-success" type="button" onclick="(window.openWhatsAppSidePanel ? window.openWhatsAppSidePanel() : (window.WhatsAppPanel && window.WhatsAppPanel.open ? window.WhatsAppPanel.open() : (window.location.hash='whatsapp')))">
                <i class=\"fas fa-external-link-alt\"></i> Open WhatsApp Web
              </button>
              <span style="color:#666; font-size:13px;">Opens in a dedicated browser window and stays logged in.</span>
            </div>
          </div>
          
          <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: flex-end;">
            <button class="btn btn-primary" onclick="editLeadDetails(${lead.id})" style="padding: 12px 24px;">
              <i class="fas fa-edit"></i> Edit Lead
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeLeadModal()">Close</button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // WhatsApp: nothing to render here anymore (opens in dedicated popup window)
  
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

/**
 * Close lead details modal
 */
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
async function editLeadDetails(leadId) {
  const lead = currentLeads.find(l => l.id == leadId);
  if (!lead) return;
  
  // Check if user is admin - load officers for dropdown
  const isAdmin = window.currentUser && window.currentUser.role === 'admin';
  let officersDropdown = '';
  
  if (isAdmin) {
    try {
      // Fetch officers from API
      const response = await fetch('/api/users/officers');
      const data = await response.json();
      
      if (data.success && data.officers) {
        const options = data.officers.map(officer => 
          `<option value="${escapeHtml(officer.name)}" ${lead.assignedTo === officer.name ? 'selected' : ''}>${escapeHtml(officer.name)}</option>`
        ).join('');
        
        officersDropdown = `
          <div class="form-group">
            <label for="editAssignedTo"><i class="fas fa-user-tie"></i> Assigned To</label>
            <select id="editAssignedTo" class="form-control">
              <option value="">-- Unassigned --</option>
              ${options}
            </select>
          </div>
        `;
      } else {
        // Fallback to text input if API fails
        officersDropdown = `
          <div class="form-group">
            <label for="editAssignedTo"><i class="fas fa-user-tie"></i> Assigned To</label>
            <input type="text" id="editAssignedTo" class="form-control" value="${escapeHtml(lead.assignedTo)}">
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading officers:', error);
      // Fallback to text input
      officersDropdown = `
        <div class="form-group">
          <label for="editAssignedTo"><i class="fas fa-user-tie"></i> Assigned To</label>
          <input type="text" id="editAssignedTo" class="form-control" value="${escapeHtml(lead.assignedTo)}">
        </div>
      `;
    }
  } else {
    // Officers see text input (non-editable or read-only)
    officersDropdown = `
      <div class="form-group">
        <label for="editAssignedTo"><i class="fas fa-user-tie"></i> Assigned To</label>
        <input type="text" id="editAssignedTo" class="form-control" value="${escapeHtml(lead.assignedTo)}" readonly>
      </div>
    `;
  }
  
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
              
              ${officersDropdown}
              
              <div class="form-group full-width">
                <label for="editNotes"><i class="fas fa-sticky-note"></i> Notes</label>
                <textarea id="editNotes" class="form-control" rows="4">${escapeHtml(lead.notes)}</textarea>
              </div>
            </div>
            
            <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px; display: flex; justify-content: space-between;">
              <button type="button" class="btn btn-danger" onclick="deleteLead(${lead.id})">
                <i class="fas fa-trash"></i> Delete Lead
              </button>
              <div style="display: flex; gap: 10px;">
                <button type="button" class="btn btn-secondary" onclick="closeEditModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">
                  <i class="fas fa-save"></i> Save Changes
                </button>
              </div>
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
  
  const updates = {
    name: document.getElementById('editName').value,
    email: document.getElementById('editEmail').value,
    phone: document.getElementById('editPhone').value,
    course: document.getElementById('editCourse').value,
    source: document.getElementById('editSource').value,
    status: document.getElementById('editStatus').value,
    assignedTo: document.getElementById('editAssignedTo').value,
    notes: document.getElementById('editNotes').value
  };
  
  try {
    // Show loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;
    
    // Call API to update lead (pass current batch context)
    const response = await API.leads.update(leadId, updates, currentBatch);
    
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

/**
 * Open add lead modal
 */
function openAddLeadModal() {
  const addModalHTML = `
    <div class="modal-overlay" id="addLeadModal" onclick="closeAddModal(event)">
      <div class="modal-dialog" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2><i class="fas fa-plus-circle"></i> Add New Lead</h2>
          <button class="modal-close" onclick="closeAddModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <form id="addLeadForm" onsubmit="saveNewLead(event)">
            <div class="form-grid">
              <div class="form-group">
                <label for="addName"><i class="fas fa-user"></i> Name *</label>
                <input type="text" id="addName" class="form-control" required>
              </div>
              
              <div class="form-group">
                <label for="addEmail"><i class="fas fa-envelope"></i> Email</label>
                <input type="email" id="addEmail" class="form-control">
              </div>
              
              <div class="form-group">
                <label for="addPhone"><i class="fas fa-phone"></i> Phone</label>
                <input type="tel" id="addPhone" class="form-control">
              </div>
              
              <div class="form-group">
                <label for="addCourse"><i class="fas fa-book"></i> Course</label>
                <input type="text" id="addCourse" class="form-control">
              </div>
              
              <div class="form-group">
                <label for="addSource"><i class="fas fa-share-alt"></i> Source</label>
                <input type="text" id="addSource" class="form-control">
              </div>
              
              <div class="form-group">
                <label for="addStatus"><i class="fas fa-info-circle"></i> Status</label>
                <select id="addStatus" class="form-control">
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Registered">Registered</option>
                  <option value="Closed">Closed</option>
                  <option value="working_professional">Working Professional</option>
                  <option value="student">Student</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="addAssignedTo"><i class="fas fa-user-tie"></i> Assigned To</label>
                <input type="text" id="addAssignedTo" class="form-control">
              </div>
              
              <div class="form-group full-width">
                <label for="addNotes"><i class="fas fa-sticky-note"></i> Notes</label>
                <textarea id="addNotes" class="form-control" rows="4"></textarea>
              </div>
            </div>
            
            <div class="modal-footer" style="border-top: 1px solid #e0e0e0; margin-top: 20px; padding-top: 20px;">
              <button type="button" class="btn btn-secondary" onclick="closeAddModal()">Cancel</button>
              <button type="submit" class="btn btn-primary">
                <i class="fas fa-plus"></i> Add Lead
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', addModalHTML);
  document.body.style.overflow = 'hidden';
}

/**
 * Save new lead
 */
async function saveNewLead(event) {
  event.preventDefault();
  
  const newLead = {
    name: document.getElementById('addName').value,
    email: document.getElementById('addEmail').value,
    phone: document.getElementById('addPhone').value,
    course: document.getElementById('addCourse').value,
    source: document.getElementById('addSource').value,
    status: document.getElementById('addStatus').value,
    assignedTo: document.getElementById('addAssignedTo').value,
    notes: document.getElementById('addNotes').value,
    created: new Date().toISOString().split('T')[0] // Current date
  };
  
  try {
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    submitBtn.disabled = true;
    
    let response;
    
    // Officers should not create leads directly in the new per-batch architecture.
    if (window.currentUser && window.currentUser.role !== 'admin') {
      throw new Error('Officers cannot create new leads. Please ask admin to add and assign leads.');
    } else {
      // Admin: Add to batch sheets (original behavior)
      response = await API.leads.create(newLead);
    }
    
    if (response.success) {
      showToast('Lead added successfully!', 'success');
      closeAddModal();
      await loadLeads();
    } else {
      throw new Error(response.error || 'Failed to add lead');
    }
  } catch (error) {
    console.error('Error adding lead:', error);
    showToast('Failed to add lead: ' + error.message, 'error');
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-plus"></i> Add Lead';
    submitBtn.disabled = false;
  }
}

/**
 * Close add modal
 */
function closeAddModal(event) {
  if (event && event.target.className !== 'modal-overlay' && !event.target.closest('.modal-close')) {
    return;
  }
  
  const modal = document.getElementById('addLeadModal');
  if (modal) {
    modal.remove();
  }
  document.body.style.overflow = '';
}

/**
 * Delete lead
 */
async function deleteLead(leadId) {
  // Confirm deletion
  if (!confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await API.leads.delete(leadId);
    
    if (response.success) {
      showToast('Lead deleted successfully!', 'success');
      closeEditModal();
      await loadLeads();
    } else {
      throw new Error(response.error || 'Failed to delete lead');
    }
  } catch (error) {
    console.error('Error deleting lead:', error);
    showToast('Failed to delete lead: ' + error.message, 'error');
  }
}

/**
 * Quick assign lead to officer (from view modal)
 */
async function quickAssignLead(leadId) {
  const select = document.getElementById('quickAssignOfficer');
  const statusSpan = document.getElementById('assignSaveStatus');
  
  if (!select) return;
  
  let newOfficer = select.value;
  
  // Handle unassign action
  if (newOfficer === '__UNASSIGN__') {
    if (!confirm('Are you sure you want to unassign this lead? It will be removed from the officer\'s sheet.')) {
      // Reset select to previous value
      const lead = currentLeads.find(l => l.id == leadId);
      if (lead && select) {
        select.value = lead.assignedTo || '';
      }
      return;
    }
    newOfficer = ''; // Set to empty string for unassign
  }
  
  try {
    // Show saving indicator
    if (statusSpan) {
      statusSpan.style.display = 'none';
    }
    
    // Call API to update lead (pass current batch context)
    const response = await API.leads.update(leadId, {
      assignedTo: newOfficer
    }, currentBatch);
    
    if (response.success) {
      // Update local data
      const lead = currentLeads.find(l => l.id == leadId);
      if (lead) {
        lead.assignedTo = newOfficer;
      }
      
      // Show success indicator
      if (statusSpan) {
        statusSpan.style.display = 'inline';
        setTimeout(() => {
          statusSpan.style.display = 'none';
        }, 2000);
      }
      
      // Don't reload immediately - let auto-refresh handle it
      // setTimeout(() => loadLeads(true), 500);
      
      console.log('Lead assigned successfully');
    } else {
      throw new Error(response.error || 'Failed to assign lead');
    }
  } catch (error) {
    console.error('Error assigning lead:', error);
    showToast('Failed to assign lead: ' + error.message, 'error');
    
    // Revert select
    const lead = currentLeads.find(l => l.id == leadId);
    if (lead && select) {
      select.value = lead.assignedTo || '';
    }
  }
}

// Make functions global
window.closeLeadModal = closeLeadModal;
window.editLeadDetails = editLeadDetails;
window.closeEditModal = closeEditModal;
window.saveLeadChanges = saveLeadChanges;
window.openAddLeadModal = openAddLeadModal;
window.closeAddModal = closeAddModal;
window.saveNewLead = saveNewLead;
window.deleteLead = deleteLead;
window.quickAssignLead = quickAssignLead;
window.toggleLeadSelection = toggleLeadSelection;
window.toggleSelectAll = toggleSelectAll;
window.clearSelection = clearSelection;
window.bulkAssignLeads = bulkAssignLeads;
window.executeBulkAssign = executeBulkAssign;
window.closeBulkAssignModal = closeBulkAssignModal;
window.bulkDistributeLeads = bulkDistributeLeads;
window.toggleAllOfficers = toggleAllOfficers;
window.executeDistributeLeads = executeDistributeLeads;
window.closeBulkDistributeModal = closeBulkDistributeModal;
window.distributeUnassignedLeads = distributeUnassignedLeads;
window.toggleAllUnassignedOfficers = toggleAllUnassignedOfficers;
window.executeDistributeUnassignedLeads = executeDistributeUnassignedLeads;
window.closeDistributeUnassignedModal = closeDistributeUnassignedModal;
window.bulkDeleteLeads = bulkDeleteLeads;

// Track auto-refresh interval
let autoRefreshInterval = null;

/**
 * Start auto-refresh
 */
function startAutoRefresh() {
  // Clear any existing interval to prevent duplicates
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
  
  // Refresh every 30 seconds
  autoRefreshInterval = setInterval(() => {
    const leadsView = document.getElementById('leadsView');
    if (leadsView && leadsView.classList.contains('active')) {
      console.log('Auto-refreshing leads...');
      loadLeads(true); // Silent refresh - no loading screen
    }
  }, 30000);
}

/**
 * Stop auto-refresh
 */
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    console.log('Auto-refresh stopped');
  }
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

// Export for global access
window.initLeadsPage = initLeadsPage;
window.leadsPageLoadLeads = loadLeads;  // Renamed to avoid conflict
window.viewLeadDetails = viewLeadDetails;
