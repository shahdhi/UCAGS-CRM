// Admin Registrations Page
// Shows website registration submissions stored in Supabase

(function () {
  function qs(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDateTimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  let lastRowsById = new Map();
  let selectedRegistrationId = null;

  let cachedOfficers = null;

  async function ensureOfficersLoaded() {
    if (cachedOfficers) return cachedOfficers;
    const res = await window.API.users.officers();
    cachedOfficers = (res.officers || []).map(o => o.name).filter(Boolean);
    return cachedOfficers;
  }

  async function openDetailsModal(reg) {
    selectedRegistrationId = reg?.id || null;

    const body = qs('registrationDetailsModalBody');
    const delBtn = qs('registrationDeleteBtn');
    const actions = qs('registrationDetailsModalActions');
    if (actions) actions.style.display = 'flex';

    const payload = reg?.payload || {};
    const get = (key) => reg?.[key] ?? payload?.[key] ?? '';

    const details = {
      'Submitted At': formatDateTimeLocal(reg?.created_at),
      'Name': get('name'),
      'Phone': get('phone_number'),
      'Email': get('email'),
      'Gender': get('gender'),
      'Date of Birth': get('date_of_birth'),
      'Address': get('address'),
      'Country': get('country'),
      'WhatsApp': get('wa_number'),
      'Working Status': get('working_status'),
      'Course/Program': get('course_program'),
      'Source': get('source')
    };

    if (body) {
      const currentAssigned = reg?.assigned_to ?? reg?.payload?.assigned_to ?? '';
      let officerOptions = '';
      try {
        const officers = await ensureOfficersLoaded();
        officerOptions = [''].concat(officers).map(name => {
          const label = name || 'Unassigned';
          const selected = String(name) === String(currentAssigned) ? 'selected' : '';
          return `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(label)}</option>`;
        }).join('');
      } catch (e) {
        console.warn('Failed to load officers for assignment dropdown:', e);
      }

      body.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom: 12px;">
          <div style="font-size:13px; color:#667085;">Assigned</div>
          <select id="registrationAssignedSelect" class="form-control" style="min-width: 220px;">
            ${officerOptions || `<option value="${escapeHtml(currentAssigned)}" selected>${escapeHtml(currentAssigned || 'Unassigned')}</option>`}
          </select>
          <button type="button" class="btn btn-primary" id="registrationAssignedSaveBtn">
            <i class="fas fa-save"></i> Save
          </button>
        </div>

        <div class="lead-details-grid" style="grid-template-columns: 1fr 1fr;">
          ${Object.entries(details).map(([k, v]) => `
            <div class="lead-detail-item">
              <div class="lead-detail-label">${escapeHtml(k)}</div>
              <div class="lead-detail-value">${escapeHtml(v || '')}</div>
            </div>
          `).join('')}
        </div>
      `;

      const saveBtn = qs('registrationAssignedSaveBtn');
      const sel = qs('registrationAssignedSelect');
      if (saveBtn && sel) {
        saveBtn.onclick = async () => {
          try {
            saveBtn.disabled = true;
            const assignedTo = sel.value;
            await window.API.registrations.adminAssign(selectedRegistrationId, assignedTo);
            if (window.UI && UI.showToast) UI.showToast('Assignment updated', 'success');
            await loadRegistrations();
          } catch (e) {
            console.error(e);
            if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to update assignment', 'error');
          } finally {
            saveBtn.disabled = false;
          }
        };
      }
    }

    if (delBtn) {
      delBtn.style.display = ''; // ensure visible for admins (officer page hides it)
      delBtn.onclick = async () => {
        if (!selectedRegistrationId) return;
        const ok = confirm('Delete this registration permanently?');
        if (!ok) return;

        try {
          delBtn.disabled = true;
          await window.API.registrations.adminDelete(selectedRegistrationId);
          if (window.UI && UI.showToast) UI.showToast('Registration deleted', 'success');
          closeModal('registrationDetailsModal');
          await loadRegistrations();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to delete registration', 'error');
        } finally {
          delBtn.disabled = false;
        }
      };
    }

    openModal('registrationDetailsModal');
  }

  async function loadRegistrations() {
    const tbody = qs('registrationsTableBody');
    const limitEl = qs('registrationsLimit');
    const limit = Math.min(parseInt(limitEl?.value || '100', 10) || 100, 500);

    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading registrations...</td></tr>';
    }

    const res = await window.API.registrations.adminList(limit);
    const rows = res.registrations || [];

    lastRowsById = new Map(rows.map(r => [r.id, r]));

    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading">No registrations found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const submittedAt = formatDateTimeLocal(r.created_at);
      const email = r.email ?? r.payload?.email ?? '';
      const assigned = r.assigned_to ?? r.payload?.assigned_to ?? '';
      return `
        <tr class="clickable" data-registration-id="${escapeHtml(r.id)}" style="cursor:pointer;">
          <td>${escapeHtml(submittedAt)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.phone_number)}</td>
          <td>${escapeHtml(email)}</td>
          <td>${escapeHtml(assigned)}</td>
        </tr>
      `;
    }).join('');

    // row click -> details
    tbody.querySelectorAll('tr[data-registration-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-registration-id');
        const reg = lastRowsById.get(id);
        if (reg) openDetailsModal(reg).catch(console.error);
      });
    });
  }

  async function initRegistrationsPage() {
    // Admin-only
    if (!window.currentUser || window.currentUser.role !== 'admin') {
      return;
    }

    const refreshBtn = qs('registrationsRefreshBtn');
    const limitEl = qs('registrationsLimit');

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => loadRegistrations().catch(err => {
        console.error(err);
        if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to load registrations', 'error');
      }));
    }

    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.addEventListener('change', () => loadRegistrations().catch(console.error));
    }

    await loadRegistrations();
  }

  window.initRegistrationsPage = initRegistrationsPage;
})();
