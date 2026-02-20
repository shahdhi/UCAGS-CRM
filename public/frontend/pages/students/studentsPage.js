// Students Page (Admin)

(function () {
  function qs(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let isLoading = false;
  let loadedOnce = false;

  async function loadStudents({ showSkeleton = false } = {}) {
    if (!window.currentUser || window.currentUser.role !== 'admin') return;
    if (isLoading) return;
    isLoading = true;

    const tbody = qs('studentsTableBody');
    const limitEl = qs('studentsLimit');
    const searchEl = qs('studentsSearch');
    const limit = Math.min(parseInt(limitEl?.value || '200', 10) || 200, 500);
    const search = String(searchEl?.value || '').trim();

    if (tbody && showSkeleton) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading students...</td></tr>';
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (search) params.set('search', search);

      const j = await window.API.students.adminList(limit, { search });
      const rows = j.students || [];

      if (!tbody) return;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No students found</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(s => {
        return `
          <tr>
            <td style="font-weight:700;">${escapeHtml(s.student_id || '')}</td>
            <td>${escapeHtml(s.name || '')}</td>
            <td>${escapeHtml(s.phone_number || '')}</td>
            <td>${escapeHtml(s.email || '')}</td>
            <td>${escapeHtml(s.program_name || '')}</td>
            <td>${escapeHtml(s.batch_name || '')}</td>
            <td>${escapeHtml(s.created_at ? new Date(s.created_at).toLocaleString() : '')}</td>
          </tr>
        `;
      }).join('');

      loadedOnce = true;
    } catch (e) {
      console.error(e);
      if (tbody && showSkeleton) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading">${escapeHtml(e.message || 'Failed to load')}</td></tr>`;
      }
    } finally {
      isLoading = false;
    }
  }

  async function initStudentsPage() {
    if (!window.currentUser || window.currentUser.role !== 'admin') return;

    const refreshBtn = qs('studentsRefreshBtn');
    const limitEl = qs('studentsLimit');
    const searchEl = qs('studentsSearch');

    if (refreshBtn && !refreshBtn.__bound) {
      refreshBtn.__bound = true;
      refreshBtn.addEventListener('click', () => loadStudents().catch(console.error));
    }

    if (limitEl && !limitEl.__bound) {
      limitEl.__bound = true;
      limitEl.addEventListener('change', () => loadStudents().catch(console.error));
    }

    if (searchEl && !searchEl.__bound) {
      searchEl.__bound = true;
      searchEl.addEventListener('input', () => {
        // no debounce for now; keep stable with isLoading guard
        loadStudents().catch(console.error);
      });
    }

    await loadStudents({ showSkeleton: !loadedOnce });
  }

  window.initStudentsPage = initStudentsPage;
})();
