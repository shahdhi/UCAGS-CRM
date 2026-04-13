/**
 * Leads Page Module
 * Handles leads page functionality
 */

let currentLeads = [];
let isLoadingLeads = false;
let hasMoreLeads = true;
let leadsPageSize = 30; // Number of leads to load per scroll
let leadsOffset = 0;
let leadsFilters = {};
let sortColumn = 'id';
let sortDirection = 'desc';

/**
 * Initialize leads page
 * @param {string} modeOrBatch - For officers this is usually 'myLeads'. For admins it can be a batch name.
 */
async function initLeadsPage(modeOrBatch) {
  console.log('Initializing leads page...');
  window.leadsModeOrBatch = modeOrBatch;

  // Setup event listeners
  setupLeadsEventListeners();

  // Reset state
  currentLeads = [];
  leadsOffset = 0;
  hasMoreLeads = true;

  // Load initial leads
  await loadLeads(true);

  // Setup infinite scroll
  setupLeadsInfiniteScroll();

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
    refreshBtn.addEventListener('click', () => {
      currentLeads = [];
      leadsOffset = 0;
      hasMoreLeads = true;
      loadLeads(true);
    });
  }

  // Search input
  const searchInput = document.getElementById('leadsSearchInput');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentLeads = [];
        leadsOffset = 0;
        hasMoreLeads = true;
        loadLeads(true);
      }, 500);
    });
  }

  // Status filter
  const statusFilter = document.getElementById('leadsStatusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      currentLeads = [];
      leadsOffset = 0;
      hasMoreLeads = true;
      loadLeads(true);
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
async function loadLeads(reset = false) {
  if (isLoadingLeads || !hasMoreLeads) return;
  isLoadingLeads = true;
  try {
    const searchInput = document.getElementById('leadsSearchInput');
    const statusFilter = document.getElementById('leadsStatusFilter');

    // Build filters
    leadsFilters = {};
    if (searchInput && searchInput.value) {
      leadsFilters.search = searchInput.value;
    }
    if (statusFilter && statusFilter.value) {
      leadsFilters.status = statusFilter.value;
    }

    // Show loading state if first load
    if (reset || currentLeads.length === 0) showLeadsLoading();

    const isOfficerView = (window.leadsModeOrBatch === 'myLeads') || (window.currentUser && window.currentUser.role !== 'admin');

    // Add pagination params
    const filtersWithPaging = { ...leadsFilters, offset: leadsOffset, limit: leadsPageSize };

    let response;
    if (isOfficerView) {
      if (window.officerBatchFilter) filtersWithPaging.batch = window.officerBatchFilter;
      if (window.officerSheetFilter) filtersWithPaging.sheet = window.officerSheetFilter;
      response = await API.leads.getMyLeads(filtersWithPaging);
    } else {
      if (window.adminBatchFilter) filtersWithPaging.batch = window.adminBatchFilter;
      if (window.adminSheetFilter) filtersWithPaging.sheet = window.adminSheetFilter;
      response = await API.leads.getAll(filtersWithPaging);
    }

    const newLeads = response.leads || [];
    if (reset) {
      currentLeads = newLeads;
    } else {
      currentLeads = currentLeads.concat(newLeads);
    }
    leadsOffset += newLeads.length;
    hasMoreLeads = newLeads.length === leadsPageSize;

    renderLeadsTable();
    console.log(`✓ Loaded ${currentLeads.length} leads (offset: ${leadsOffset})`);
  } catch (error) {
    console.error('Error loading leads:', error);
    showLeadsError(error.message);
  } finally {
    isLoadingLeads = false;
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

  // Render all loaded leads
  tbody.innerHTML = currentLeads.map(lead => `
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

  // Optionally, show a loading row if more leads are being loaded
  if (isLoadingLeads && hasMoreLeads) {
    tbody.innerHTML += `
      <tr><td colspan="10" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading more leads...</td></tr>
    `;
  }

  // Update info (optional)
  updatePaginationInfo(currentLeads.length);
}

// Infinite scroll setup
function setupLeadsInfiniteScroll() {
  const tableContainer = document.getElementById('leadsTableContainer') || document;
  tableContainer.addEventListener('scroll', () => {
    // If near bottom, load more
    const scrollable = tableContainer === document ? document.documentElement : tableContainer;
    const scrollTop = scrollable.scrollTop;
    const scrollHeight = scrollable.scrollHeight;
    const clientHeight = scrollable.clientHeight;
    if (scrollHeight - scrollTop - clientHeight < 200 && hasMoreLeads && !isLoadingLeads) {
      loadLeads();
    }
  });
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
