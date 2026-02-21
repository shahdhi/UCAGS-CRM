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

    const ttlMs = 2 * 60 * 1000; // 2 minutes
    const cacheKey = `students:adminList:limit=${limit}:search=${encodeURIComponent(search)}`;

    // Fast path: render from cache if fresh and not explicitly showing skeleton
    if (tbody && !showSkeleton && window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached && cached.students) {
        // Render cached immediately and skip fetch
        const rows = cached.students || [];
        lastRowsById = new Map((rows || []).map(s => [String(s.id || s.student_id), s]));
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="4" class="loading">No students found</td></tr>';
        } else {
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
        }

        loadedOnce = true;
        isLoading = false;
        return;
      }
    }

    if (tbody && showSkeleton) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading students...</td></tr>';
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (search) params.set('search', search);

      const j = await window.API.students.adminList(limit, { search });
      if (window.Cache) window.Cache.setWithTs(cacheKey, j);
      const rows = j.students || [];

      lastRowsById = new Map((rows || []).map(s => [String(s.id || s.student_id), s]));

      if (!tbody) return;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">No students found</td></tr>';
        return;
      }

      const trHtmlFn = (s) => {
        const key = String(s.id || s.student_id);
        return `
          <tr data-row-key="${escapeHtml(key)}" data-student-key="${escapeHtml(key)}" style="cursor:pointer;">
            <td style="font-weight:700;">${escapeHtml(s.student_id || '')}</td>
            <td>${escapeHtml(s.name || '')}</td>
            <td>${escapeHtml(s.phone_number || '')}</td>
            <td>${escapeHtml(s.email || '')}</td>
          </tr>
        `;
      };

      if (window.DOMPatcher?.patchTableBody) {
        window.DOMPatcher.patchTableBody(tbody, rows, (x) => x.id || x.student_id, trHtmlFn);
      } else {
        tbody.innerHTML = rows.map(trHtmlFn).join('');
      }

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

  function renderSection(title, rowsHtml) {
    return `
      <div style="margin-top:14px;">
        <div style="font-size:13px; font-weight:800; color:#101828; margin-bottom:8px;">${escapeHtml(title)}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px 16px;">
          ${rowsHtml}
        </div>
      </div>
    `;
  }

  function renderKeyValueRows(entries) {
    return entries.map(([k, v]) => `
      <div style="display:flex; gap:6px; align-items:baseline; min-width:0; padding:6px 0; border-bottom:1px solid #f2f4f7;">
        <div style="color:#667085; font-size:13px; font-weight:600; white-space:nowrap;">${escapeHtml(k)}:</div>
        <div style="color:#101828; font-size:13px; font-weight:400; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(v || '')}</div>
      </div>
    `).join('');
  }

  async function loadStudentPaymentsInto(registrationId) {
    const el = qs('studentPaymentDetails');
    if (!el) return;

    if (!registrationId) {
      el.innerHTML = '<div style="color:#98a2b3; font-size:13px;">No registration linked.</div>';
      return;
    }

    el.innerHTML = '<div class="loading">Loading payment details...</div>';

    try {
      const res = await window.API.payments.adminListForRegistration(registrationId);
      const payments = res.payments || [];

      if (!payments.length) {
        el.innerHTML = '<div style="color:#98a2b3; font-size:13px;">No payments found.</div>';
        return;
      }

      el.innerHTML = `
        <div class="table-container" style="width:100%; margin-top:8px; overflow-x:hidden;">
          <table class="data-table" style="min-width:unset; table-layout:auto;">
            <thead>
              <tr>
                <th style="padding:6px 8px; font-size:12px;">Date</th>
                <th style="padding:6px 8px; font-size:12px;">Amount</th>
                <th style="padding:6px 8px; font-size:12px;">Method</th>
                <th style="padding:6px 8px; font-size:12px;">Plan</th>
                <th style="padding:6px 8px; font-size:12px;">Receipt</th>
                <th style="padding:6px 8px; font-size:12px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(p => {
                const status = p.is_confirmed
                  ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Confirmed</span>'
                  : '<span class="badge" style="background:#fffaeb; color:#b54708; border:1px solid #fedf89;">Pending</span>';
                return `
                  <tr>
                    <td style="padding:6px 8px; font-size:12px; white-space:nowrap;">${escapeHtml(p.payment_date || '')}</td>
                    <td style="padding:6px 8px; font-size:12px; white-space:nowrap;">${escapeHtml(p.amount ?? '')}</td>
                    <td style="padding:6px 8px; font-size:12px;">${escapeHtml(p.payment_method || '')}</td>
                    <td style="padding:6px 8px; font-size:12px;">${escapeHtml(p.payment_plan || '')}</td>
                    <td style="padding:6px 8px; font-size:12px; white-space:nowrap;">${escapeHtml(p.receipt_no || '')}</td>
                    <td style="padding:6px 8px; font-size:12px; white-space:nowrap;">${status}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div style="color:#ef4444; font-size:13px;">${escapeHtml(e.message || 'Failed to load payments')}</div>`;
    }
  }

  function renderStudentDetails(student) {
    selectedStudent = student;
    const body = qs('studentDetailsModalBody');
    if (!body) return;

    const payload = student?.payload && typeof student.payload === 'object' ? student.payload : {};
    const get = (key) => student?.[key] ?? payload?.[key] ?? '';

    const personal = [
      ['Student ID', student?.student_id],
      ['Name', get('name')],
      ['Phone', get('phone_number')],
      ['Email', get('email')],
      ['WhatsApp', get('wa_number')],
      ['Gender', get('gender')],
      ['Date of Birth', get('date_of_birth')],
      ['Address', get('address')],
      ['Country', get('country')],
      ['Working Status', get('working_status')],
      ['Source', get('source')]
    ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');

    const programs = [
      ['Program', get('program_name') || get('course_program') || student?.program_name],
      ['Batch', get('batch_name') || student?.batch_name],
      ['Created At', student?.created_at ? new Date(student.created_at).toLocaleString() : '']
    ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');

    const registrationId = student?.registration_id || payload?.registration_id || '';

    body.innerHTML = `
      <div style="margin-bottom: 6px;">
        <div style="font-size:12px; color:#667085;">Student</div>
        <div style="font-size:16px; font-weight:700; color:#101828; margin-top:2px;">${escapeHtml(student?.student_id || '')} — ${escapeHtml(get('name') || '')}</div>
      </div>

      ${renderSection('Personal Details', renderKeyValueRows(personal))}
      ${renderSection('Enrolled Programs', renderKeyValueRows(programs))}

      <div style="margin-top:14px;">
        <div style="font-size:13px; font-weight:800; color:#101828; margin-bottom:8px;">Payment Details</div>
        <div id="studentPaymentDetails"></div>
      </div>
    `;

    // Load payments async (after modal opens)
    loadStudentPaymentsInto(registrationId);
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
          if (window.Cache) window.Cache.invalidatePrefix('students:adminList');
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

    const hasRows = !!qs('studentsTableBody')?.querySelector('tr[data-row-key]');
    await loadStudents({ showSkeleton: !hasRows });
  }

  window.initStudentsPage = initStudentsPage;
})();
