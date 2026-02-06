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
 */
async function initLeadsPage() {
  console.log('Initializing leads page...');
  
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
    refreshBtn.addEventListener('click', loadLeads);
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

    const response = await API.leads.getAll(filters);
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
        <td colspan="10" style="text-align: center; padding: 40px;">
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

  // Render rows
  tbody.innerHTML = paginatedLeads.map(lead => `
    <tr>
      <td>${lead.id}</td>
      <td><strong>${escapeHtml(lead.name)}</strong></td>
      <td>${escapeHtml(lead.email)}</td>
      <td>${lead.phone ? `<a href="tel:${lead.phone}">${escapeHtml(lead.phone)}</a>` : '-'}</td>
      <td>${escapeHtml(lead.course) || '-'}</td>
      <td>${escapeHtml(lead.source) || '-'}</td>
      <td><span class="badge badge-${getStatusColor(lead.status)}">${escapeHtml(lead.status)}</span></td>
      <td>${escapeHtml(lead.assignedTo) || '-'}</td>
      <td>${formatDate(lead.createdDate)}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewLeadDetails(${lead.id})" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
      </td>
    </tr>
  `).join('');

  // Update pagination info
  updatePaginationInfo(sorted.length);
}

/**
 * Show loading state
 */
function showLeadsLoading() {
  const tbody = document.getElementById('leadsTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="loading" style="text-align: center; padding: 40px;">
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
        <td colspan="10" style="text-align: center; padding: 40px;">
          <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f44336; margin-bottom: 10px;"></i>
          <p style="color: #f44336;"><strong>Error loading leads</strong></p>
          <p style="color: #666;">${escapeHtml(message)}</p>
          <button class="btn btn-primary" onclick="loadLeads()" style="margin-top: 10px;">
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
 * View lead details (placeholder for future modal)
 */
function viewLeadDetails(leadId) {
  const lead = currentLeads.find(l => l.id === leadId);
  if (lead) {
    alert(`Lead Details:\n\nName: ${lead.name}\nEmail: ${lead.email}\nPhone: ${lead.phone}\nCourse: ${lead.course}\nStatus: ${lead.status}\nNotes: ${lead.notes || 'None'}`);
  }
}

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
window.loadLeads = loadLeads;
window.viewLeadDetails = viewLeadDetails;
