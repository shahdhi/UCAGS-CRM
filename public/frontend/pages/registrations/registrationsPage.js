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

  function openDetailsModal(reg) {
    selectedRegistrationId = reg?.id || null;

    const body = qs('registrationDetailsModalBody');
    const delBtn = qs('registrationDeleteBtn');

    const payload = reg?.payload || {};
    const get = (key) => reg?.[key] ?? payload?.[key] ?? '';

    const details = {
      'Submitted At': formatDateTimeLocal(reg?.created_at),
      'Name': get('name'),
      'Gender': get('gender'),
      'Date of Birth': get('date_of_birth'),
      'Address': get('address'),
      'Country': get('country'),
      'Phone': get('phone_number'),
      'WhatsApp': get('wa_number'),
      'Email': get('email'),
      'Working Status': get('working_status'),
      'Course/Program': get('course_program'),
      'Source': get('source')
    };

    if (body) {
      body.innerHTML = `
        <div class="lead-details-grid" style="grid-template-columns: 1fr 1fr;">
          ${Object.entries(details).map(([k, v]) => `
            <div class="lead-detail-item">
              <div class="lead-detail-label">${escapeHtml(k)}</div>
              <div class="lead-detail-value">${escapeHtml(v || '')}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (delBtn) {
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
        if (reg) openDetailsModal(reg);
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
