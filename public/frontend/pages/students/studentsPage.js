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
  let lastRowsById = new Map();

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
      tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading students...</td></tr>';
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (search) params.set('search', search);

      const j = await window.API.students.adminList(limit, { search });
      const rows = j.students || [];

      lastRowsById = new Map((rows || []).map(s => [String(s.id || s.student_id), s]));

      if (!tbody) return;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">No students found</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(s => {
        const key = String(s.id || s.student_id);
        return `
          <tr data-student-key="${escapeHtml(key)}" style="cursor:pointer;">
            <td style="font-weight:700;">${escapeHtml(s.student_id || '')}</td>
            <td>${escapeHtml(s.name || '')}</td>
            <td>${escapeHtml(s.phone_number || '')}</td>
            <td>${escapeHtml(s.email || '')}</td>
          </tr>
        `;
      }).join('');

      loadedOnce = true;
    } catch (e) {
      console.error(e);
      if (tbody && showSkeleton) {
        tbody.innerHTML = `<tr><td colspan="4" class="loading">${escapeHtml(e.message || 'Failed to load')}</td></tr>`;
      }
    } finally {
      isLoading = false;
    }
  }

  let selectedStudent = null;

  function renderStudentDetails(student) {
    selectedStudent = student;
    const body = qs('studentDetailsModalBody');
    if (!body) return;

    const payload = student?.payload && typeof student.payload === 'object' ? student.payload : {};

    const get = (key) => student?.[key] ?? payload?.[key] ?? '';

    const base = {
      'Student ID': student?.student_id,
      'Name': get('name'),
      'Phone': get('phone_number'),
      'Email': get('email'),
      'Gender': get('gender'),
      'Date of Birth': get('date_of_birth'),
      'Address': get('address'),
      'Country': get('country'),
      'WhatsApp': get('wa_number'),
      'Working Status': get('working_status'),
      'Source': get('source'),
      'Program': get('program_name') || get('course_program') || student?.program_name,
      'Batch': get('batch_name') || student?.batch_name,
      'Created At': student?.created_at ? new Date(student.created_at).toLocaleString() : ''
    };

    // Clean details view (no duplicated "Additional Details" section)
    const entries = Object.entries(base)
      .filter(([k, v]) => v !== null && v !== undefined && String(v).trim() !== '');

    body.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom: 10px;">
        <div>
          <div style="font-size:12px; color:#667085; font-weight:600;">Student Profile</div>
          <div style="font-size:18px; font-weight:800; color:#101828; margin-top:2px;">${escapeHtml(student?.student_id || '')} — ${escapeHtml(get('name') || '')}</div>
        </div>
      </div>

      <div class="lead-details-grid" style="grid-template-columns: 1fr 1fr; gap: 10px;">
        ${entries.map(([k, v]) => `
          <div class="lead-detail-item" style="background:#f9fafb; border:1px solid #eaecf0; border-radius:12px; padding:10px;">
            <div class="lead-detail-label" style="font-size:12px; color:#667085; font-weight:700;">${escapeHtml(k)}</div>
            <div class="lead-detail-value" style="font-size:14px; color:#101828; font-weight:700; margin-top:4px;">${escapeHtml(v || '')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function initStudentsPage() {
    if (!window.currentUser || window.currentUser.role !== 'admin') return;

    const refreshBtn = qs('studentsRefreshBtn');
    const limitEl = qs('studentsLimit');
    const searchEl = qs('studentsSearch');
    const tbody = qs('studentsTableBody');

    // One-time: row click -> details (event delegation)
    if (tbody && !tbody.__delegated) {
      tbody.__delegated = true;
      tbody.addEventListener('click', (e) => {
        const tr = e.target?.closest?.('tr[data-student-key]');
        if (!tr) return;
        const key = tr.getAttribute('data-student-key');
        const student = lastRowsById.get(String(key));
        if (!student) return;

        renderStudentDetails(student);
        openModal('studentDetailsModal');
      });
    }

    const deleteBtn = qs('studentDeleteEnrollmentBtn');
    if (deleteBtn && !deleteBtn.__bound) {
      deleteBtn.__bound = true;
      deleteBtn.addEventListener('click', async () => {
        try {
          if (!selectedStudent?.id) return;
          const ok = confirm(`Delete enrollment for ${selectedStudent.student_id || ''}? This will also revert the linked registration.`);
          if (!ok) return;

          deleteBtn.disabled = true;
          await window.API.students.adminDelete(selectedStudent.id);
          if (window.UI && UI.showToast) UI.showToast('Enrollment deleted', 'success');
          closeModal('studentDetailsModal');
          await loadStudents();
        } catch (e) {
          console.error(e);
          if (window.UI && UI.showToast) UI.showToast(e.message || 'Failed to delete enrollment', 'error');
        } finally {
          deleteBtn.disabled = false;
        }
      });
    }

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
