/**
 * Reports Page
 *
 * Officers: submit daily report for current time slot.
 * Admins: view all officers' daily reports by date and edit schedule times.
 */

(function () {
  async function authHeaders() {
    const headers = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  function $(id) { return document.getElementById(id); }

  function parseHHMM(t) {
    const s = String(t || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { hh, mm, hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function buildWindowHint({ slot, graceMinutes }) {
    return `Open at ${slot.label || slot.time}, closes after ${graceMinutes} minutes.`;
  }

  function computeWindowForToday(slotTimeHHMM, graceMinutes) {
    const date = todayISO();
    const start = new Date(`${date}T${slotTimeHHMM}:00`);
    const end = new Date(start.getTime() + graceMinutes * 60 * 1000);
    return { start, end };
  }

  function isWindowOpen({ slotTimeHHMM, graceMinutes, now = new Date() }) {
    const { start, end } = computeWindowForToday(slotTimeHHMM, graceMinutes);
    return now >= start && now <= end;
  }

  function renderAdminTable(reports) {
    const wrap = $('reportsAdminTableWrap');
    if (!wrap) return;

    if (!reports?.length) {
      wrap.innerHTML = '<div class="content-placeholder" style="padding: 20px;"><p>No reports found for this date.</p></div>';
      return;
    }

    const cols = [
      { key: 'officer_name', label: 'Officer' },
      { key: 'slot_key', label: 'Slot' },
      { key: 'fresh_calls_made', label: 'Fresh calls' },
      { key: 'fresh_messages_reached', label: 'Fresh messages' },
      { key: 'interested_leads', label: 'Interested' },
      { key: 'followup_calls', label: 'FU calls' },
      { key: 'followup_messages', label: 'FU messages' },
      { key: 'followup_scheduled', label: 'FU scheduled' },
      { key: 'closures', label: 'Closures' },
      { key: 'notes', label: 'Notes' },
      { key: 'actions', label: 'Actions' }
    ];

    const escape = (s) => String(s ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    wrap.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>${cols.map(c => `<th>${escape(c.label)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${reports.map(r => `
              <tr>
                <td>${escape(r.officer_name || r.officer_user_id)}</td>
                <td>${escape(r.slot_key)}</td>
                <td>${escape(r.fresh_calls_made)}</td>
                <td>${escape(r.fresh_messages_reached)}</td>
                <td>${escape(r.interested_leads)}</td>
                <td>${escape(r.followup_calls)}</td>
                <td>${escape(r.followup_messages)}</td>
                <td>${escape(r.followup_scheduled)}</td>
                <td>${escape(r.closures)}</td>
                <td style="max-width: 280px; white-space: pre-wrap;">${escape(r.notes || '')}</td>
                <td><button class="btn btn-secondary" data-edit-report="${r.id}"><i class="fas fa-edit"></i> Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    wrap.querySelectorAll('[data-edit-report]')?.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-edit-report');
        const row = reports.find(x => String(x.id) === String(id));
        if (!row) return;

        // Simple inline edit: reuse officer modal fields
        $('freshCallsMade').value = row.fresh_calls_made ?? 0;
        $('freshMessagesReached').value = row.fresh_messages_reached ?? 0;
        $('interestedLeads').value = row.interested_leads ?? 0;
        $('followUpCalls').value = row.followup_calls ?? 0;
        $('followUpMessages').value = row.followup_messages ?? 0;
        $('followUpScheduled').value = row.followup_scheduled ?? 0;
        $('closures').value = row.closures ?? 0;
        $('dailyReportNotes').value = row.notes ?? '';

        // Slot select locked when editing
        $('dailyReportSlot').innerHTML = `<option value="${row.slot_key}">${row.slot_key}</option>`;
        $('dailyReportSlot').disabled = true;

        const msg = $('dailyReportSubmitMsg');
        if (msg) msg.textContent = 'Admin editing existing report.';

        const submitBtn = $('submitDailyReportBtn');
        submitBtn.textContent = 'Save Changes';
        submitBtn.onclick = async () => {
          await adminSaveReportEdit(id);
        };

        if (window.openModal) window.openModal('dailyReportModal');
      });
    });
  }

  async function fetchSchedule() {
    const headers = await authHeaders();
    const res = await fetch('/api/reports/daily/schedule', { headers });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load schedule');
    return json.config;
  }

  async function officerSubmit(schedule) {
    const slotKey = $('dailyReportSlot').value;
    const payload = {
      freshCallsMade: $('freshCallsMade').value,
      freshMessagesReached: $('freshMessagesReached').value,
      interestedLeads: $('interestedLeads').value,
      followUpCalls: $('followUpCalls').value,
      followUpMessages: $('followUpMessages').value,
      followUpScheduled: $('followUpScheduled').value,
      closures: $('closures').value,
      notes: $('dailyReportNotes').value
    };

    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/reports/daily/submit', {
      method: 'POST',
      headers,
      body: JSON.stringify({ slotKey, payload, clientNowISO: new Date().toISOString() })
    });

    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Submit failed');
    return json.report;
  }

  async function adminLoadReports(date) {
    const headers = await authHeaders();
    const res = await fetch(`/api/reports/daily?date=${encodeURIComponent(date)}`, { headers });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load reports');
    return json.reports || [];
  }

  async function adminSaveSchedule() {
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const slots = [
      { key: 'slot1', time: $('slot1Time').value, label: '10:30 AM' },
      { key: 'slot2', time: $('slot2Time').value, label: '02:30 PM' },
      { key: 'slot3', time: $('slot3Time').value, label: '06:00 PM' }
    ];
    const graceMinutes = $('graceMinutes').value;

    const res = await fetch('/api/reports/daily/schedule', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ slots, graceMinutes, timezone: 'Asia/Colombo' })
    });

    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to save schedule');
    return json.config;
  }

  async function adminSaveReportEdit(reportId) {
    const payload = {
      freshCallsMade: $('freshCallsMade').value,
      freshMessagesReached: $('freshMessagesReached').value,
      interestedLeads: $('interestedLeads').value,
      followUpCalls: $('followUpCalls').value,
      followUpMessages: $('followUpMessages').value,
      followUpScheduled: $('followUpScheduled').value,
      closures: $('closures').value,
      notes: $('dailyReportNotes').value
    };

    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/reports/daily/${encodeURIComponent(reportId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to update report');

    if (window.showToast) showToast('Report updated', 'success');
    if (window.closeModal) closeModal('dailyReportModal');

    // restore modal state
    $('dailyReportSlot').disabled = false;
    $('submitDailyReportBtn').textContent = 'Submit';

    // reload current date table
    const date = $('reportsAdminDate')?.value || todayISO();
    const rows = await adminLoadReports(date);
    renderAdminTable(rows);
  }

  async function initOfficer(schedule) {
    const sec = $('reportsOfficerSection');
    if (!sec) return;
    sec.style.display = '';

    const select = $('dailyReportSlot');
    select.innerHTML = '';

    (schedule.slots || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.key;
      opt.textContent = `${s.label || s.time}`;
      select.appendChild(opt);
    });

    const hint = $('dailyReportWindowHint');
    const graceMinutes = schedule.graceMinutes ?? 20;

    const updateHintAndDisable = () => {
      const slot = (schedule.slots || []).find(x => x.key === select.value) || schedule.slots?.[0];
      const t = parseHHMM(slot?.time);
      if (!t) {
        if (hint) hint.textContent = 'Invalid schedule configuration.';
        $('submitDailyReportBtn').disabled = true;
        $('openDailyReportBtn').disabled = true;
        return;
      }
      if (hint) hint.textContent = buildWindowHint({ slot, graceMinutes });
      const open = isWindowOpen({ slotTimeHHMM: t.hhmm, graceMinutes });
      $('submitDailyReportBtn').disabled = !open;
      $('openDailyReportBtn').disabled = !open;

      const status = $('dailyReportStatus');
      if (status) {
        const { start, end } = computeWindowForToday(t.hhmm, graceMinutes);
        status.textContent = open
          ? `Submission window is OPEN until ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
          : `Submission window is CLOSED. Next window opens at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
      }
    };

    select.addEventListener('change', updateHintAndDisable);
    updateHintAndDisable();

    $('openDailyReportBtn').onclick = () => {
      updateHintAndDisable();
      if ($('openDailyReportBtn').disabled) {
        if (window.showToast) showToast('Submission window closed', 'warning');
        return;
      }
      if (window.openModal) openModal('dailyReportModal');
    };

    $('submitDailyReportBtn').onclick = async () => {
      const msg = $('dailyReportSubmitMsg');
      if (msg) msg.textContent = 'Submitting...';
      try {
        await officerSubmit(schedule);
        if (msg) msg.textContent = 'Submitted successfully.';
        if (window.showToast) showToast('Daily report submitted', 'success');
        if (window.closeModal) closeModal('dailyReportModal');
      } catch (e) {
        if (msg) msg.textContent = e.message;
        if (window.showToast) showToast(e.message, 'error');
      }
    };

    // Recompute every 30 seconds to auto-disable after grace
    setInterval(updateHintAndDisable, 30000);
  }

  async function initAdmin(schedule) {
    const sec = $('reportsAdminSection');
    if (!sec) return;
    sec.style.display = '';

    const dateInput = $('reportsAdminDate');
    if (dateInput && !dateInput.value) dateInput.value = todayISO();

    $('reportsAdminLoadBtn').onclick = async () => {
      try {
        const rows = await adminLoadReports(dateInput.value);
        renderAdminTable(rows);
      } catch (e) {
        if (window.showToast) showToast(e.message, 'error');
      }
    };

    $('reportsAdminEditScheduleBtn').onclick = async () => {
      try {
        // preload current values
        const s1 = schedule.slots?.[0];
        const s2 = schedule.slots?.[1];
        const s3 = schedule.slots?.[2];
        if (s1) $('slot1Time').value = s1.time;
        if (s2) $('slot2Time').value = s2.time;
        if (s3) $('slot3Time').value = s3.time;
        $('graceMinutes').value = schedule.graceMinutes ?? 20;

        if (window.openModal) openModal('dailyReportScheduleModal');
      } catch (e) {
        if (window.showToast) showToast(e.message, 'error');
      }
    };

    $('saveDailyReportScheduleBtn').onclick = async () => {
      const msg = $('dailyReportScheduleMsg');
      if (msg) msg.textContent = 'Saving...';

      // quick client validation
      const t1 = parseHHMM($('slot1Time').value);
      const t2 = parseHHMM($('slot2Time').value);
      const t3 = parseHHMM($('slot3Time').value);
      if (!t1 || !t2 || !t3) {
        if (msg) msg.textContent = 'Please enter valid times in HH:MM format.';
        return;
      }

      try {
        const saved = await adminSaveSchedule();
        if (msg) msg.textContent = 'Saved.';
        if (window.showToast) showToast('Schedule updated', 'success');
        if (window.closeModal) closeModal('dailyReportScheduleModal');
      } catch (e) {
        if (msg) msg.textContent = e.message;
        if (window.showToast) showToast(e.message, 'error');
      }
    };
  }

  window.initReportsPage = async function initReportsPage(currentUser) {
    try {
      const schedule = await fetchSchedule();

      // Reset modal defaults
      $('dailyReportSlot').disabled = false;
      $('submitDailyReportBtn').textContent = 'Submit';
      const msg = $('dailyReportSubmitMsg');
      if (msg) msg.textContent = '';

      if (currentUser?.role === 'admin') {
        await initAdmin(schedule);
      } else {
        await initOfficer(schedule);
      }
    } catch (e) {
      console.error('initReportsPage error:', e);
      if (window.showToast) showToast(e.message, 'error');
    }
  };
})();
