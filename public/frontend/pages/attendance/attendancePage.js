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
    const res = await fetch('/api/attendance/me/today', { headers });
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
    if (btnIn) btnIn.disabled = checkedIn;
    if (btnOut) btnOut.disabled = !checkedIn || checkedOut;
  }

  async function doCheckIn() {
    const btnIn = document.getElementById('attendanceCheckInBtn');
    if (btnIn) btnIn.disabled = true;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/attendance/me/checkin', { method: 'POST', headers });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'Check-in failed');

      if (window.UI?.showToast) UI.showToast('Checked in successfully', 'success');
      await loadMyStatus();
    } catch (e) {
      if (window.UI?.showToast) UI.showToast(e.message || 'Check-in failed', 'error');
      await loadMyStatus();
    }
  }

  async function doCheckOut() {
    const btnOut = document.getElementById('attendanceCheckOutBtn');
    if (btnOut) btnOut.disabled = true;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/attendance/me/checkout', { method: 'POST', headers });
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

    tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading…</td></tr>';

    const dateInput = document.getElementById('attendanceAdminDate');
    const date = dateInput ? dateInput.value : '';

    const headers = await getAuthHeaders();
    const url = date ? `/api/attendance/records?date=${encodeURIComponent(date)}` : '/api/attendance/records';

    const res = await fetch(url, { headers });
    const json = await res.json();

    if (!json?.success) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color:#b00;">${escapeHtml(json?.error || 'Failed to load records')}</td></tr>`;
      return;
    }

    const records = json.records || [];
    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color:#666;">No records found</td></tr>';
      return;
    }

    tbody.innerHTML = records.slice(0, 500).map(r => `
      <tr>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.staffName)}</td>
        <td>${escapeHtml(r.checkIn || '-')}</td>
        <td>${escapeHtml(r.checkOut || '-')}</td>
      </tr>
    `).join('');
  }

  function init() {
    const btnIn = document.getElementById('attendanceCheckInBtn');
    const btnOut = document.getElementById('attendanceCheckOutBtn');
    if (btnIn) btnIn.addEventListener('click', doCheckIn);
    if (btnOut) btnOut.addEventListener('click', doCheckOut);

    const adminBtn = document.getElementById('attendanceAdminRefreshBtn');
    if (adminBtn) adminBtn.addEventListener('click', loadAdminRecords);

    const dateInput = document.getElementById('attendanceAdminDate');
    if (dateInput) {
      dateInput.addEventListener('change', loadAdminRecords);
    }
  }

  window.initAttendancePage = async function () {
    init();

    // If admin: hide personal check-in/out controls (admins don't need to check in/out)
    const isAdmin = window.currentUser && window.currentUser.role === 'admin';
    const btnIn = document.getElementById('attendanceCheckInBtn');
    const btnOut = document.getElementById('attendanceCheckOutBtn');
    if (isAdmin) {
      if (btnIn) btnIn.style.display = 'none';
      if (btnOut) btnOut.style.display = 'none';
    }

    // Officers: load personal status
    if (!isAdmin) {
      await loadMyStatus();
    } else {
      const statusEl = document.getElementById('attendanceMyStatus');
      if (statusEl) statusEl.innerHTML = '<div>Admin account: check-in/out not required.</div>';
    }

    // Load admin table only if visible
    const adminSection = document.getElementById('attendanceAdminSection');
    if (adminSection && adminSection.style.display !== 'none') {
      await loadAdminRecords();
    }
  };
})();
