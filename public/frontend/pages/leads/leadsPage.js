/**
 * Leads Page Module
 * Handles leads page functionality
 */

let currentLeads = [];
let currentPage = 1;
let rowsPerPage = 1000000; // Show all leads on one page
let totalPages = 1;
let sortColumn = 'id';
let sortDirection = 'desc';

/**
 * Initialize leads page
 * @param {string} modeOrBatch - For officers this is usually 'myLeads'. For admins it can be a batch name.
 */
async function initLeadsPage(modeOrBatch) {
  // Remember current mode/batch (used by loadLeads)
  window.leadsModeOrBatch = modeOrBatch;

  // Setup event listeners
  setupLeadsEventListeners();

  // Load leads data
  await loadLeads();

  // Start auto-refresh (every 30 seconds)
  startAutoRefresh();
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
        <td colspan="9" style="text-align: center; padding: 40px;">
          <i class="fas fa-inbox" style="font-size: 48px; color: #ccc; margin-bottom: 10px;"></i>
          <p style="color: #666;">No leads found</p>
        </td>
      </tr>
    `;
    return;
  }

  // Don't sort - keep original order from sheet
  const leadsToDisplay = currentLeads;

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
      <tr style="cursor: pointer;" onclick="viewLeadDetails(${JSON.stringify(lead.id)})" title="Click to view details">
        <td style="width:40px;" onclick="event.stopPropagation()">
          <input type="checkbox" class="lead-select-checkbox" data-lead-id="${escapeHtml(String(lead.id))}" ${isSelected ? 'checked' : ''} onchange="toggleLeadSelection(event, ${JSON.stringify(lead.id)})">
        </td>
        <td><strong>${escapeHtml(lead.name)}</strong></td>
        <td>${escapeHtml(lead.email)}</td>
        <td>${lead.phone ? `<a href="tel:${lead.phone}" onclick="event.stopPropagation()">${escapeHtml(lead.phone)}</a>` : '-'}</td>
        <td>${escapeHtml(lead.course || lead.intake_json?.course) || '-'}</td>
        <td>${escapeHtml(lead.source) || '-'}</td>
        <td><span class="badge badge-${getStatusColor(lead.status)}">${escapeHtml(lead.status || '-')}</span></td>
        <td>${escapeHtml(lead.priority) || '-'}</td>
        <td>${escapeHtml(lead.assignedTo) || '-'}</td>
      </tr>
    `;
  }).join('');

  // Sync header checkbox + toolbar
  updateSelectionUI();

  // No pagination UI on this screen
}

/**
 * Show loading state
 */
function showLeadsLoading() {
  const tbody = document.getElementById('leadsTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="loading" style="text-align: center; padding: 40px;">
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
        <td colspan="9" style="text-align: center; padding: 40px;">
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
                <span class="detail-value">${escapeHtml(lead.course) || '-'}</span>
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
                <input type="text" id="editAssignedTo" class="form-control" value="${escapeHtml(lead.assignedTo)}">
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
  // Refresh every 30 seconds
  setInterval(() => {
    if (document.getElementById('leadsView')?.classList.contains('active')) {
      console.log('Auto-refreshing leads...');
      loadLeads();
    }
  }, 30000);
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

// -------------------------
// Bulk selection helpers
// -------------------------
function ensureSelectionState() {
  if (!window.__selectedLeadIds) window.__selectedLeadIds = new Set();
}

function toggleLeadSelection(event, leadId) {
  ensureSelectionState();
  const id = String(leadId);
  const checked = event?.target?.checked;
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

  if (label) label.textContent = `${count} selected`;
  if (toolbar) toolbar.style.display = count > 0 ? 'block' : 'none';

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
            <input type="checkbox" class="ba_choice" value="__UNASSIGN__" />
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

  // Make checkboxes behave like single-select
  const choices = Array.from(document.querySelectorAll('#' + modalId + ' .ba_choice'));
  choices.forEach(ch => {
    ch.addEventListener('change', () => {
      if (!ch.checked) return;
      choices.forEach(other => { if (other !== ch) other.checked = false; });
    });
  });

  document.getElementById('ba_submit')?.addEventListener('click', async () => {
    const selected = choices.find(x => x.checked);
    if (!selected) {
      showToast('Select an officer or Unassign.', 'error');
      return;
    }

    const assignedTo = selected.value === '__UNASSIGN__' ? '' : selected.value;

    const btn = document.getElementById('ba_submit');
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    btn.disabled = true;
    try {
      await API.leads.bulkAssign({ batchName, sheetName, leadIds: ids, assignedTo });
      closeLeadsActionModal(modalId);
      clearSelection();
      await loadLeads();
      showToast(assignedTo ? `Assigned ${ids.length} leads to ${assignedTo}` : `Unassigned ${ids.length} leads`, 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to assign', 'error');
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
  return (json.officers || []).map(String).filter(Boolean);
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
  if (!window.currentUser || window.currentUser.role !== 'admin') {
    showToast('Only admin can create leads.', 'error');
    return;
  }

  const batchName = window.adminBatchFilter;
  const sheetName = window.adminSheetFilter || 'Main Leads';
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
              <div class="form-group">
                <label for="nl_assigned"><i class="fas fa-user-tie"></i> Assigned To</label>
                <select id="nl_assigned" class="form-control">
                  <option value="">Unassigned</option>
                </select>
                <small style="color:#666; margin-top:6px; display:block;">Optional. You can assign later too.</small>
              </div>
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

  // Populate officers dropdown
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

  const form = document.getElementById('newLeadForm');
  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const old = btn ? btn.innerHTML : '';
      if (btn) {
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
          assignedTo: document.getElementById('nl_assigned')?.value || '',
          notes: document.getElementById('nl_notes')?.value || '',
          status: 'New'
        };

        await API.leads.create({ batchName, sheetName, lead });
        closeLeadsActionModal(modalId);
        showToast('Lead created', 'success');
        await loadLeads();
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Failed to create lead', 'error');
      } finally {
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
window.toggleLeadSelection = toggleLeadSelection;
window.toggleSelectAll = toggleSelectAll;
window.clearSelection = clearSelection;
window.bulkAssignLeads = bulkAssignLeads;
window.bulkDistributeLeads = bulkDistributeLeads;
window.bulkDeleteLeads = bulkDeleteLeads;
window.createNewLead = createNewLead;
window.distributeUnassignedLeads = distributeUnassignedLeads;
