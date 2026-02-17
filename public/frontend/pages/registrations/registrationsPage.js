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

  async function loadRegistrations() {
    const tbody = qs('registrationsTableBody');
    const limitEl = qs('registrationsLimit');
    const limit = Math.min(parseInt(limitEl?.value || '100', 10) || 100, 500);

    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading registrations...</td></tr>';
    }

    const res = await window.API.registrations.adminList(limit);
    const rows = res.registrations || [];

    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="12" class="loading">No registrations found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const submittedAt = formatDateTimeLocal(r.created_at);
      // Prefer top-level columns, fallback to payload for older rows
      const gender = r.gender ?? r.payload?.gender;
      const dob = r.date_of_birth ?? r.payload?.date_of_birth;
      const address = r.address ?? r.payload?.address;
      const country = r.country ?? r.payload?.country;
      const wa = r.wa_number ?? r.payload?.wa_number;
      const email = r.email ?? r.payload?.email;
      const working = r.working_status ?? r.payload?.working_status;
      const course = r.course_program ?? r.payload?.course_program;
      const source = r.source ?? r.payload?.source;

      return `
        <tr>
          <td>${escapeHtml(submittedAt)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(gender || '')}</td>
          <td>${escapeHtml(dob || '')}</td>
          <td>${escapeHtml(address || '')}</td>
          <td>${escapeHtml(country || '')}</td>
          <td>${escapeHtml(r.phone_number)}</td>
          <td>${escapeHtml(wa || '')}</td>
          <td>${escapeHtml(email || '')}</td>
          <td>${escapeHtml(working || '')}</td>
          <td>${escapeHtml(course || '')}</td>
          <td>${escapeHtml(source || '')}</td>
        </tr>
      `;
    }).join('');
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
