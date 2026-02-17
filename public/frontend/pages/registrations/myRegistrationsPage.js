// Officer: My Registrations Page

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

  function openDetailsModal(reg) {
    // Reuse the existing modal, but hide delete/actions for officers
    const delBtn = qs('registrationDeleteBtn');
    if (delBtn) delBtn.style.display = 'none';
    const actions = qs('registrationDetailsModalActions');
    if (actions) actions.style.display = 'none';

    const body = qs('registrationDetailsModalBody');
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

    openModal('registrationDetailsModal');
  }

  async function loadMyRegistrations() {
    const tbody = qs('registrationsMyTableBody');
    const limitEl = qs('registrationsMyLimit');
    const limit = Math.min(parseInt(limitEl?.value || '100', 10) || 100, 500);

    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading registrations...</td></tr>';
    }

    const res = await window.API.registrations.myList(limit);
    const rows = res.registrations || [];
    lastRowsById = new Map(rows.map(r => [r.id, r]));

    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading">No registrations found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const submittedAt = formatDateTimeLocal(r.created_at);
      const email = r.email ?? r.payload?.email ?? '';
      return `
        <tr data-registration-id="${escapeHtml(r.id)}" style="cursor:pointer;">
          <td>${escapeHtml(submittedAt)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.phone_number)}</td>
          <td>${escapeHtml(email)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-registration-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-registration-id');
        const reg = lastRowsById.get(id);
        if (reg) openDetailsModal(reg);
      });
    });
  }

  async function initMyRegistrationsPage() {
    if (!window.currentUser || window.currentUser.role === 'admin') return;

    const refreshBtn = qs('registrationsMyRefreshBtn');
    const limitEl = qs('registrationsMyLimit');

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => loadMyRegistrations().catch(err => {
        console.error(err);
        if (window.UI && UI.showToast) UI.showToast(err.message || 'Failed to load registrations', 'error');
      }));
    }

    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.addEventListener('change', () => loadMyRegistrations().catch(console.error));
    }

    await loadMyRegistrations();
  }

  window.initMyRegistrationsPage = initMyRegistrationsPage;
})();
