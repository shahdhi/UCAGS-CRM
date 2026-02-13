/**
 * Leads Page Module
 * Handles leads page functionality
 */

let currentLeads = [];
let currentPage = 1;
let rowsPerPage = 1000; // Show all leads (increased from 10)
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
        <td colspan="5" style="text-align: center; padding: 40px;">
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
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedLeads = leadsToDisplay.slice(startIndex, endIndex);

  // Render rows - clickable rows
  tbody.innerHTML = paginatedLeads.map(lead => `
    <tr style="cursor: pointer;" onclick="viewLeadDetails(${lead.id})" title="Click to view details">
      <td>${lead.id}</td>
      <td><strong>${escapeHtml(lead.name)}</strong></td>
      <td>${escapeHtml(lead.email)}</td>
      <td>${lead.phone ? `<a href="tel:${lead.phone}" onclick="event.stopPropagation()">${escapeHtml(lead.phone)}</a>` : '-'}</td>
      <td>${escapeHtml(lead.assignedTo) || '-'}</td>
    </tr>
  `).join('');

  // Update pagination info
  updatePaginationInfo(leadsToDisplay.length);
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
    const response = await API.leads.update(leadId, updates);
    
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

// Export for global access
window.initLeadsPage = initLeadsPage;
window.leadsPageLoadLeads = loadLeads;  // Renamed to avoid conflict
window.viewLeadDetails = viewLeadDetails;
