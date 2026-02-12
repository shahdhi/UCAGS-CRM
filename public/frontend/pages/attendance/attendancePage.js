/**
 * Attendance Page (Officer + Admin)
 */

(function () {
  'use strict';

  async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }
    return headers;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function fmt(ts) {
    if (!ts) return '-';
    try {
      // Accept ISO or time strings
      if (/^\d{2}:\d{2}/.test(ts)) return ts;
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  async function loadMyStatus() {
    const statusEl = document.getElementById('attendanceMyStatus');
    if (statusEl) statusEl.textContent = 'Loading…';

    const headers = await getAuthHeaders();
    const res = await fetch('/api/attendance/me/today', { headers, cache: 'no-store' });
    const json = await res.json();

    if (!json?.success) {
      if (statusEl) statusEl.textContent = 'Failed to load status';
      if (window.UI?.showToast) UI.showToast(json?.error || 'Failed to load attendance status', 'error');
      return;
    }

    const rec = json.record;
    const checkedIn = json.checkedIn;
    const checkedOut = json.checkedOut;

    if (statusEl) {
      statusEl.innerHTML = `
        <div><strong>Date:</strong> ${escapeHtml(json.date)}</div>
        <div><strong>Check In:</strong> ${escapeHtml(rec?.checkIn || '-')}</div>
        <div><strong>Check Out:</strong> ${escapeHtml(rec?.checkOut || '-')}</div>
      `;
    }

    const btnIn = document.getElementById('attendanceCheckInBtn');
    const btnOut = document.getElementById('attendanceCheckOutBtn');
    const btnLoc = document.getElementById('attendanceConfirmLocationBtn');
    const locStatus = document.getElementById('attendanceLocationStatus');

    if (btnIn) btnIn.disabled = checkedIn;
    if (btnOut) btnOut.disabled = !checkedIn || checkedOut;

    const hasLoc = !!(rec?.locationLat && rec?.locationLng);
    if (btnLoc) btnLoc.disabled = !checkedIn || hasLoc;

    if (locStatus) {
      locStatus.innerHTML = hasLoc
        ? `Location confirmed. <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(rec.locationLat)},${encodeURIComponent(rec.locationLng)}">View on map</a>`
        : '';
    }
  }

  async function doCheckIn() {
    const btnIn = document.getElementById('attendanceCheckInBtn');
    if (btnIn) btnIn.disabled = true;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/attendance/me/checkin', { method: 'POST', headers, cache: 'no-store' });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'Check-in failed');

      if (window.UI?.showToast) UI.showToast('Checked in successfully', 'success');
      await loadMyStatus();
    } catch (e) {
      if (window.UI?.showToast) UI.showToast(e.message || 'Check-in failed', 'error');
      await loadMyStatus();
    }
  }

  function getBrowserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Location not supported on this device/browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        (err) => {
          reject(new Error(err.message || 'Failed to get location'));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function doConfirmLocation() {
    const btn = document.getElementById('attendanceConfirmLocationBtn');
    if (btn) btn.disabled = true;

    try {
      const loc = await getBrowserLocation();
      const headers = await getAuthHeaders();
      const res = await fetch('/api/attendance/me/confirm-location', {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify(loc)
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'Confirm location failed');

      if (window.UI?.showToast) UI.showToast('Location confirmed', 'success');
      await loadMyStatus();
    } catch (e) {
      if (window.UI?.showToast) UI.showToast(e.message || 'Confirm location failed', 'error');
      await loadMyStatus();
    }
  }

  async function doCheckOut() {
    const btnOut = document.getElementById('attendanceCheckOutBtn');
    if (btnOut) btnOut.disabled = true;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/attendance/me/checkout', { method: 'POST', headers, cache: 'no-store' });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'Check-out failed');

      if (window.UI?.showToast) UI.showToast('Checked out successfully', 'success');
      await loadMyStatus();
    } catch (e) {
      if (window.UI?.showToast) UI.showToast(e.message || 'Check-out failed', 'error');
      await loadMyStatus();
    }
  }

  async function loadAdminRecords() {
    const tbody = document.getElementById('attendanceAdminTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading…</td></tr>';

    const dateInput = document.getElementById('attendanceAdminDate');
    const date = dateInput ? dateInput.value : '';

    const headers = await getAuthHeaders();
    const url = date ? `/api/attendance/records?date=${encodeURIComponent(date)}` : '/api/attendance/records';

    const res = await fetch(url, { headers, cache: 'no-store' });
    const json = await res.json();

    if (!json?.success) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color:#b00;">${escapeHtml(json?.error || 'Failed to load records')}</td></tr>`;
      return;
    }

    const records = json.records || [];
    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#666;">No records found</td></tr>';
      return;
    }

    tbody.innerHTML = records.slice(0, 500).map(r => {
      const hasLoc = !!(r.locationLat && r.locationLng);
      const mapBtn = hasLoc
        ? `<a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(r.locationLat)},${encodeURIComponent(r.locationLng)}">View on map</a>`
        : '';

      return `
        <tr>
          <td>${escapeHtml(r.date)}</td>
          <td>${escapeHtml(r.staffName)}</td>
          <td>${escapeHtml(r.checkIn || '-')}</td>
          <td>${escapeHtml(r.checkOut || '-')}</td>
          <td>${mapBtn}</td>
        </tr>
      `;
    }).join('');
  }

  // ---- Officer calendar + leave requests ----
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymdToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  };
  const ymToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  };

  let currentMonth = ymToday();

  function monthAdd(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  }

  function renderAttendanceCalendarSkeleton() {
    const grid = document.getElementById('attendanceCalendarGrid');
    const label = document.getElementById('attendanceMonthLabel');
    if (label) label.textContent = 'Loading…';
    if (!grid) return;

    const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const cells = [];
    for (const h of headers) {
      cells.push(`<div class="followup-calendar-cell" style="font-weight:600; background:#f9fafb;">${h}</div>`);
    }
    for (let i = 0; i < 42; i++) {
      cells.push(`
        <div class="followup-calendar-cell loading-shimmer" style="min-height:78px; background:#f3f4f6; border:1px solid #e5e7eb;">
          <div style="height:12px; width:40%; background:rgba(255,255,255,0.35); border-radius:6px;"></div>
          <div style="height:10px; width:60%; margin-top:10px; background:rgba(255,255,255,0.25); border-radius:6px;"></div>
        </div>
      `);
    }
    grid.innerHTML = cells.join('');
  }

  function renderAttendanceCalendar(days) {
    const grid = document.getElementById('attendanceCalendarGrid');
    const label = document.getElementById('attendanceMonthLabel');
    if (label) label.textContent = monthLabel(currentMonth);
    if (!grid) return;

    // Build 7-column grid similar to calendar
    const [y, m] = currentMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startDow = first.getDay(); // 0 Sun

    const statusByDate = new Map((days || []).map(d => [d.date, d.status]));

    const cells = [];
    const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const h of headers) {
      cells.push(`<div class="followup-calendar-cell header" style="font-weight:600; background:#f9fafb;">${h}</div>`);
    }

    // blanks
    for (let i = 0; i < startDow; i++) {
      cells.push(`<div class="followup-calendar-cell" style="background:#fff; border:1px solid #f0f0f0;"></div>`);
    }

    // days
    const totalDays = days ? days.length : 0;
    for (let d = 1; d <= totalDays; d++) {
      const date = `${currentMonth}-${pad2(d)}`;
      const status = statusByDate.get(date) || 'future';

      let bg = '#fff';
      let border = '#e5e7eb';
      if (status === 'present') bg = '#dcfce7';
      else if (status === 'absent') bg = '#fee2e2';
      else if (status === 'leave') bg = '#dbeafe';
      else if (status === 'future') bg = '#f3f4f6';

      cells.push(
        `<div class="followup-calendar-cell" data-date="${date}" style="background:${bg}; border:1px solid ${border}; cursor:default;">` +
          `<div style="display:flex; justify-content: space-between; align-items:center;">` +
            `<span style="font-weight:600;">${d}</span>` +
            `<span style="font-size:11px; color:#555;">${status === 'leave' ? 'Leave' : status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : ''}</span>` +
          `</div>` +
        `</div>`
      );
    }

    grid.innerHTML = cells.join('');
  }

  async function loadMyCalendar() {
    try {
      const officerSection = document.getElementById('attendanceOfficerSection');
      if (!officerSection || officerSection.classList.contains('hidden')) return;

      renderAttendanceCalendarSkeleton();
      const res = await API.attendance.getMyCalendar(currentMonth);
      renderAttendanceCalendar(res.days || []);
    } catch (e) {
      console.error(e);
      if (window.UI?.showToast) UI.showToast(e.message, 'error');
    }
  }

  async function loadMyLeaveRequests() {
    const tbody = document.getElementById('attendanceMyLeaveTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="loading">Loading...</td></tr>`;
    try {
      const res = await API.attendance.getMyLeaveRequests({});
      const list = res.requests || [];
      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:#666;">No leave requests</td></tr>`;
        return;
      }
      tbody.innerHTML = list.map(r => {
        const admin = r.admin_name ? `${escapeHtml(r.admin_name)}${r.admin_comment ? ' - ' + escapeHtml(r.admin_comment) : ''}` : '';
        return `
          <tr>
            <td>${escapeHtml(r.leave_date)}</td>
            <td>${escapeHtml(r.reason || '')}</td>
            <td>${escapeHtml(r.status)}</td>
            <td>${admin}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" style="color:#ef4444;">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function submitLeaveRequest() {
    const dateEl = document.getElementById('attendanceLeaveDate');
    const reasonEl = document.getElementById('attendanceLeaveReason');
    const msg = document.getElementById('attendanceLeaveSubmitMsg');

    const date = dateEl?.value;
    const reason = reasonEl?.value || '';

    try {
      if (!date) throw new Error('Please select a date');
      if (!reason.trim()) throw new Error('Please enter a reason');

      if (msg) msg.textContent = 'Submitting...';
      await API.attendance.submitLeaveRequest({ date, reason });
      if (msg) msg.textContent = 'Leave request submitted';
      if (reasonEl) reasonEl.value = '';

      await loadMyLeaveRequests();
      await loadMyCalendar();
    } catch (e) {
      if (msg) msg.textContent = e.message;
      if (window.UI?.showToast) UI.showToast(e.message, 'error');
    }
  }

  // ---- Admin leave approvals ----
  async function loadAdminLeaveRequests() {
    const tbody = document.getElementById('attendanceAdminLeaveTableBody');
    const statusSel = document.getElementById('attendanceAdminLeaveStatus');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="loading">Loading...</td></tr>`;
    try {
      const status = statusSel?.value || 'pending';
      const res = await API.attendance.getLeaveRequests({ status });
      const list = res.requests || [];

      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#666;">No requests</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(r => {
        const actions = status === 'pending'
          ? `<button class="btn btn-success btn-sm" data-act="approve" data-id="${escapeHtml(r.id)}">Approve</button>
             <button class="btn btn-danger btn-sm" data-act="reject" data-id="${escapeHtml(r.id)}">Reject</button>`
          : '';
        return `
          <tr>
            <td>${escapeHtml(r.leave_date)}</td>
            <td>${escapeHtml(r.officer_name)}</td>
            <td>${escapeHtml(r.reason || '')}</td>
            <td>${escapeHtml(r.status)}</td>
            <td style="display:flex; gap:6px; flex-wrap: wrap;">${actions}</td>
          </tr>
        `;
      }).join('');

      // bind actions
      tbody.querySelectorAll('button[data-act]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const act = btn.getAttribute('data-act');
          if (!id || !act) return;
          const comment = prompt('Admin comment (optional):') || '';
          try {
            if (act === 'approve') await API.attendance.approveLeaveRequest(id, comment);
            if (act === 'reject') await API.attendance.rejectLeaveRequest(id, comment);

            // Keep the row visible even if filtering by pending
            const row = btn.closest('tr');
            if (row) {
              const statusCell = row.children[3];
              if (statusCell) statusCell.textContent = act === 'approve' ? 'approved' : 'rejected';
              const actionsCell = row.children[4];
              if (actionsCell) actionsCell.innerHTML = '';
            }

            // Optionally refresh if user is not in pending filter
            const statusSelNow = document.getElementById('attendanceAdminLeaveStatus');
            if (statusSelNow && statusSelNow.value && statusSelNow.value !== 'pending') {
              await loadAdminLeaveRequests();
            }
          } catch (e) { 
            if (window.UI?.showToast) UI.showToast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function init() {
    const btnIn = document.getElementById('attendanceCheckInBtn');
    const btnOut = document.getElementById('attendanceCheckOutBtn');
    const btnLoc = document.getElementById('attendanceConfirmLocationBtn');
    if (btnIn) btnIn.addEventListener('click', doCheckIn);
    if (btnOut) btnOut.addEventListener('click', doCheckOut);
    if (btnLoc) btnLoc.addEventListener('click', doConfirmLocation);

    const adminBtn = document.getElementById('attendanceAdminRefreshBtn');
    if (adminBtn) adminBtn.addEventListener('click', loadAdminRecords);

    const dateInput = document.getElementById('attendanceAdminDate');
    if (dateInput) {
      dateInput.addEventListener('change', loadAdminRecords);
    }

    // Officer calendar controls
    const prevBtn = document.getElementById('attendancePrevMonthBtn');
    const nextBtn = document.getElementById('attendanceNextMonthBtn');
    const thisBtn = document.getElementById('attendanceThisMonthBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentMonth = monthAdd(currentMonth, -1); loadMyCalendar(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentMonth = monthAdd(currentMonth, 1); loadMyCalendar(); });
    if (thisBtn) thisBtn.addEventListener('click', () => { currentMonth = ymToday(); loadMyCalendar(); });

    // Officer leave submit
    const leaveBtn = document.getElementById('attendanceLeaveSubmitBtn');
    if (leaveBtn) leaveBtn.addEventListener('click', submitLeaveRequest);

    const leaveDate = document.getElementById('attendanceLeaveDate');
    if (leaveDate && !leaveDate.value) leaveDate.value = ymdToday();

    // Admin leave approvals
    const adminLeaveRefresh = document.getElementById('attendanceAdminLeaveRefreshBtn');
    const adminLeaveStatus = document.getElementById('attendanceAdminLeaveStatus');
    if (adminLeaveRefresh) adminLeaveRefresh.addEventListener('click', loadAdminLeaveRequests);
    if (adminLeaveStatus) adminLeaveStatus.addEventListener('change', loadAdminLeaveRequests);
  }

  window.initAttendancePage = async function () {
    init();

    // If admin: hide the entire "My Today" card (admins don't do check-in/out)
    const isAdmin = window.currentUser && window.currentUser.role === 'admin';
    if (isAdmin) {
      const myCard = document.getElementById('attendanceMyTodayCard');
      if (myCard) myCard.style.display = 'none';

      const officerSection = document.getElementById('attendanceOfficerSection');
      if (officerSection) officerSection.classList.add('hidden');

      const adminLeave = document.getElementById('attendanceAdminLeaveSection');
      if (adminLeave) adminLeave.classList.remove('hidden');
      await loadAdminLeaveRequests();
    } else {
      // Ensure My Today card is visible for officers (in case a previous admin session hid it)
      const myCard = document.getElementById('attendanceMyTodayCard');
      if (myCard) myCard.style.display = '';

      await loadMyStatus();

      const officerSection = document.getElementById('attendanceOfficerSection');
      if (officerSection) officerSection.classList.remove('hidden');
      const adminLeave = document.getElementById('attendanceAdminLeaveSection');
      if (adminLeave) adminLeave.classList.add('hidden');

      await loadMyCalendar();
      await loadMyLeaveRequests();
    }

    // Load admin table only if visible
    const adminSection = document.getElementById('attendanceAdminSection');
    if (adminSection && adminSection.style.display !== 'none') {
      // Default to today's date if empty
      const dateInput = document.getElementById('attendanceAdminDate');
      if (dateInput && !dateInput.value) {
        const now = new Date();
        const pad2 = (n) => String(n).padStart(2, '0');
        dateInput.value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      }
      await loadAdminRecords();
    }
  };
})();
