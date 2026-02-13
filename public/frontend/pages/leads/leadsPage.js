 
/**
 * Distribute all unassigned leads - optimized for speed
 */
async function distributeUnassignedLeads() {
  // Get all unassigned leads
  const unassignedLeads = currentLeads.filter(lead => !lead.assignedTo || lead.assignedTo === '');
  
  if (unassignedLeads.length === 0) {
    showToast('No unassigned leads found', 'info');
    return;
  }
  
  // Use cached officers if available
  let officers = window.cachedOfficers || [];
  
  if (officers.length === 0) {
    try {
      const response = await fetch('/api/users/officers');
      const data = await response.json();
      if (data.success && data.officers) {
        officers = data.officers;
        window.cachedOfficers = officers;
      }
    } catch (e) {
      console.warn('Failed to load officers:', e);
    }
  }
  
  if (officers.length === 0) {
    showToast('No officers available', 'error');
    return;
  }
  
  // Build checkbox HTML - simplified
  const checkboxes = [];
  for (let i = 0; i < officers.length; i++) {
    const officer = officers[i];
    checkboxes.push(`<label><input type="checkbox" class="unassigned-officer-checkbox" value="${escapeHtml(officer.name)}"> ${escapeHtml(officer.name)}</label>`);
  }
  
  const modalHTML = `
    <div class="modal-overlay" id="distributeUnassignedModal" onclick="closeDistributeUnassignedModal(event)">
      <div class="modal-dialog" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h2>Distribute ${unassignedLeads.length} Leads</h2>
          <button class="modal-close" onclick="closeDistributeUnassignedModal()">✕</button>
        </div>
        <div class="modal-body">
          <p><strong>${unassignedLeads.length}</strong> unassigned leads found.</p>
          <p>Select officers to distribute equally:</p>
          <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 8px;">
            <label><input type="checkbox" id="selectAllUnassignedOfficers" onchange="toggleAllUnassignedOfficers()"> Select All</label>
            ${checkboxes.join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeDistributeUnassignedModal()">Cancel</button>
          <button class="btn btn-warning" onclick="executeDistributeUnassignedLeads()">Distribute</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  document.body.style.overflow = 'hidden';
}
