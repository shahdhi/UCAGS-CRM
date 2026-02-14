/**
 * Lead Management Page
 * For officers to track and manage their leads with detailed follow-up information
 */

(function() {
  'use strict';
  
  // State
  let managementLeads = [];
  let filteredManagementLeads = [];
  let isInitialized = false;
  let isLoading = false;

/**
 * Initialize Lead Management page
 */
async function initLeadManagementPage() {
  console.log('🔄 Initializing Lead Management page...');
  
  // Setup event listeners only once
  if (!isInitialized) {
    setupManagementEventListeners();
    isInitialized = true;
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
 * Setup event listeners
 */
function setupManagementEventListeners() {
  console.log('Setting up Lead Management event listeners');
  // Event listeners are inline in HTML for now
}

/**
 * Load leads for management
 */
async function loadLeadManagement() {
  // Prevent multiple simultaneous loads
  if (isLoading) {
    console.log('⚠️ Already loading leads, skipping...');
    return;
  }
  
  isLoading = true;
  
  try {
    console.log('📊 Loading leads for management...');
    
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
    
    // Supabase CRM: load officer leads (fast)
    const batchFilter = window.officerBatchFilter;
    const sheet = window.officerSheetFilter || 'Main Leads';

    const params = new URLSearchParams();
    if (batchFilter && batchFilter !== 'all') params.set('batch', decodeURIComponent(batchFilter));
    if (sheet) params.set('sheet', sheet);

    const res = await fetch(`/api/crm-leads/my?${params.toString()}`, { headers: authHeaders });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load leads');
    managementLeads = data.leads || [];

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
          lead[`followUp${n}Schedule`] = f.scheduled_at ? String(f.scheduled_at).slice(0,16) : (lead[`followUp${n}Schedule`] || '');
          lead[`followUp${n}Date`] = f.actual_at ? String(f.actual_at).slice(0,16) : (lead[`followUp${n}Date`] || '');
          lead[`followUp${n}Answered`] = (f.answered === true) ? 'Yes' : (f.answered === false ? 'No' : (lead[`followUp${n}Answered`] || ''));
          lead[`followUp${n}Comment`] = f.comment || (lead[`followUp${n}Comment`] || '');
        });

        // Recompute derived fields
        lead.lastFollowUpComment = getLastFollowUpComment(lead);
      } catch (e) {
        // ignore
      }
    }));

    console.log('📦 Raw leads data:', managementLeads);


    // If no leads exist, keep empty list (do NOT inject mock leads in production)
    if (managementLeads.length === 0) {
      console.log('ℹ️ No leads assigned to this officer');
    }

    filteredManagementLeads = [...managementLeads];
    console.log('📊 Filtered leads:', filteredManagementLeads);
    
    console.log(`✓ Loaded ${managementLeads.length} leads for management`);

    renderManagementTable();
    
  } catch (error) {
    console.error('Error loading management leads:', error);
    showManagementError(error.message);
  } finally {
    isLoading = false;
  }
}

/**
 * Filter management leads
 */
function filterManagementLeads() {
  const searchInput = document.getElementById('managementSearchInput');
  const statusFilter = document.getElementById('managementStatusFilter');
  const priorityFilter = document.getElementById('managementPriorityFilter');
  
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const statusValue = statusFilter ? statusFilter.value : '';
  const priorityValue = priorityFilter ? priorityFilter.value : '';
  
  filteredManagementLeads = managementLeads.filter(lead => {
    // Search filter
    const matchesSearch = !searchTerm || 
      lead.name?.toLowerCase().includes(searchTerm) ||
      lead.email?.toLowerCase().includes(searchTerm) ||
      lead.phone?.includes(searchTerm);
    
    // Status filter
    const matchesStatus = !statusValue || lead.status === statusValue;
    
    // Priority filter
    const matchesPriority = !priorityValue || lead.priority === priorityValue;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });
  
  renderManagementTable();
}

/**
 * Render management table
 */
function renderManagementTable() {
  console.log('📋 Rendering management table...');
  const tbody = document.getElementById('managementTableBody');
  if (!tbody) {
    console.error('❌ managementTableBody element not found!');
    return;
  }
  console.log(`📊 Rendering ${filteredManagementLeads.length} leads`);
  
  if (filteredManagementLeads.length === 0) {
    console.log('ℹ️ No leads to display');
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
  
  console.log('✓ Rendering table rows...');
  
  tbody.innerHTML = filteredManagementLeads.map(lead => `
    <tr data-lead-id="${escapeHtml(String(lead.id))}">
      <td><strong>${escapeHtml(lead.name)}</strong></td>
      <td>${lead.phone ? `<a href="tel:${lead.phone}">${escapeHtml(lead.phone)}</a>` : '-'}</td>
      <td><span class="badge badge-${getStatusColor(lead.status)}">${escapeHtml(lead.status || 'New')}</span></td>
      <td><span class="badge badge-${getPriorityColor(lead.priority)}">${escapeHtml(lead.priority || '-')}</span></td>
      <td>${escapeHtml(getLastFollowUpComment(lead)) || '-'}</td>
      <td>${getNextFollowUpSchedule(lead) ? formatDate(getNextFollowUpSchedule(lead)) : '-'}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openManageLeadModal('${lead.id}')" title="Manage Lead">
          <i class="fas fa-edit"></i>
        </button>
      </td>
    </tr>
  `).join('');
  
  console.log('✅ Table rendered successfully');
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

  // Backward compatibility: some sheets may store an already-derived value
  const stored = String(lead.lastFollowUpComment || '').trim();
  if (stored) return stored;

  return String(lead.callFeedback || '').trim();
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
  switch(status) {
    case 'New': return 'primary';
    case 'Contacted': return 'info';
    case 'Follow-up': return 'warning';
    case 'Registered': return 'success';
    case 'Closed': return 'secondary';
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
  const lead = filteredManagementLeads.find(l => l.id == leadId);
  if (!lead) {
    alert('Lead not found');
    return;
  }
  
  const modalHTML = `
    <div class="modal-overlay" id="manageLeadModal" onclick="closeManageLeadModal(event)">
      <div class="modal-dialog" onclick="event.stopPropagation()" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h2><i class="fas fa-tasks"></i> Manage Lead: ${escapeHtml(lead.name)}</h2>
          <button class="modal-close" onclick="closeManageLeadModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <form id="manageLeadForm" onsubmit="saveLeadManagement(event, ${JSON.stringify(String(lead.id))})">
            
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
                  <option value="New" ${lead.status === 'New' ? 'selected' : ''}>New</option>
                  <option value="Contacted" ${lead.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
                  <option value="Follow-up" ${lead.status === 'Follow-up' ? 'selected' : ''}>Follow-up</option>
                  <option value="Registered" ${lead.status === 'Registered' ? 'selected' : ''}>Registered</option>
                  <option value="Closed" ${lead.status === 'Closed' ? 'selected' : ''}>Closed</option>
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
                <div>${escapeHtml(lead.platform) || '-'}</div>
                <div style="color:#666;">Planning to start immediately</div>
                <div>${escapeHtml(lead.are_you_planning_to_start_immediately) || '-'}</div>
                <div style="color:#666;">Why interested</div>
                <div>${escapeHtml(lead.why_are_you_interested_in_this_diploma) || '-'}</div>
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
      status: document.getElementById('leadStatus').value,
      priority: document.getElementById('priority').value,
      nextFollowUp: document.getElementById('nextFollowUp').value,
      callFeedback: document.getElementById('callFeedback').value
    };
    
    // Collect all follow-up data (unlimited)
    const container = document.getElementById('followUpsContainer');
    const followUpSections = container ? container.querySelectorAll('.followup-section') : [];
    
    followUpSections.forEach((section, index) => {
      const num = index + 1;
      const scheduleEl = document.getElementById(`followUp${num}Schedule`);
      const dateEl = document.getElementById(`followUp${num}Date`);
      const answeredEl = document.getElementById(`followUp${num}Answered`);
      const commentEl = document.getElementById(`followUp${num}Comment`);
      
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
    
    // Persist to officer sheet (per batch + sheet)
    const lead = managementLeads.find(l => l.id == leadId);
    if (lead) {
      Object.assign(lead, managementData);

      // Always derive last follow-up comment (prefer follow-up comments)
      lead.lastFollowUpComment = getLastFollowUpComment(lead);

      // Save to backend
      const batch = window.officerBatchFilter && window.officerBatchFilter !== 'all' ? window.officerBatchFilter : lead.batch;
      const sheet = window.officerSheetFilter || 'Main Leads';

      let authHeaders = { 'Content-Type': 'application/json' };
      if (window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session && session.access_token) {
          authHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const res = await fetch(`/api/crm-leads/my/${encodeURIComponent(batch)}/${encodeURIComponent(sheet)}/${encodeURIComponent(lead.id)}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(lead)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to save');

      // Update local lead with latest server response (includes merged management_json)
      if (json.lead) {
        Object.assign(lead, json.lead);
      }
    }
    
    // Show success message
    if (window.showToast) {
      showToast('Lead management data saved successfully!', 'success');
    } else {
      alert('Lead management data saved!');
    }
    
    // Close modal and refresh table
    closeManageLeadModal();
    renderManagementTable();
    
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
