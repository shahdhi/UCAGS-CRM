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

  function computeWindowForToday(slotTimeHHMM, graceMinutes, baseDateISO = todayISO()) {
    const start = new Date(`${baseDateISO}T${slotTimeHHMM}:00`);
    const end = new Date(start.getTime() + graceMinutes * 60 * 1000);
    return { start, end };
  }

  function isWindowOpen({ slotTimeHHMM, graceMinutes, now = new Date() }) {
    const { start, end } = computeWindowForToday(slotTimeHHMM, graceMinutes);
    return now >= start && now <= end;
  }

  function getNextWindow(schedule, now = new Date()) {
    const graceMinutes = schedule?.graceMinutes ?? 20;
    const slots = schedule?.slots || [];

    const candidates = slots
      .map(s => {
        const t = parseHHMM(s.time);
        if (!t) return null;
        const w = computeWindowForToday(t.hhmm, graceMinutes, todayISO());
        return { slot: s, t, ...w };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);

    // If currently within any window, return that.
    const openNow = candidates.find(c => now >= c.start && now <= c.end);
    if (openNow) return { type: 'open', ...openNow };

    // Otherwise next start time today.
    const nextToday = candidates.find(c => now < c.start);
    if (nextToday) return { type: 'upcoming', ...nextToday };

    // Otherwise tomorrow first slot.
    if (candidates.length) {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      const dateISO = `${yyyy}-${mm}-${dd}`;
      const first = candidates[0];
      const w = computeWindowForToday(first.t.hhmm, graceMinutes, dateISO);
      return { type: 'tomorrow', slot: first.slot, t: first.t, start: w.start, end: w.end };
    }

    return null;
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

  function formatTimeLabel(hhmm) {
    const t = parseHHMM(hhmm);
    if (!t) return String(hhmm || '').trim();
    const h12 = ((t.hh + 11) % 12) + 1;
    const ampm = t.hh >= 12 ? 'PM' : 'AM';
    return `${String(h12).padStart(2, '0')}:${String(t.mm).padStart(2, '0')} ${ampm}`;
  }

  async function adminSaveSchedule() {
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };

    const slot1Time = $('slot1Time').value;
    const slot2Time = $('slot2Time').value;
    const slot3Time = $('slot3Time').value;

    const slots = [
      { key: 'slot1', time: slot1Time, label: formatTimeLabel(slot1Time) },
      { key: 'slot2', time: slot2Time, label: formatTimeLabel(slot2Time) },
      { key: 'slot3', time: slot3Time, label: formatTimeLabel(slot3Time) }
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

  function setOfficerDescription(schedule) {
    const sec = $('reportsOfficerSection');
    if (!sec) return;
    const p = sec.querySelector('p');
    const times = (schedule?.slots || []).map(s => (s.label || s.time)).join(', ');
    const grace = schedule?.graceMinutes ?? 20;
    if (p) p.textContent = `Submit ${schedule?.slots?.length || 3} reports/day (${times}). Submission closes ${grace} minutes after each time.`;
  }

  async function initOfficer(schedule) {
    const sec = $('reportsOfficerSection');
    if (!sec) return;
    sec.style.display = '';

    setOfficerDescription(schedule);

    const select = $('dailyReportSlot');
    select.innerHTML = '';

    (schedule.slots || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.key;
      opt.textContent = `${s.label || s.time}`;
      select.appendChild(opt);
    });

    // Auto-select currently open slot, otherwise next upcoming slot
    const next = getNextWindow(schedule, new Date());
    if (next?.slot?.key) {
      select.value = next.slot.key;
    }

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

      const now = new Date();
      const open = isWindowOpen({ slotTimeHHMM: t.hhmm, graceMinutes, now });
      $('submitDailyReportBtn').disabled = !open;
      $('openDailyReportBtn').disabled = !open;

      const status = $('dailyReportStatus');
      if (status) {
        const next = getNextWindow(schedule, now);
        if (open) {
          const { end } = computeWindowForToday(t.hhmm, graceMinutes);
          status.textContent = `Submission window is OPEN until ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
        } else if (next) {
          const when = next.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dayHint = next.type === 'tomorrow' ? ' (tomorrow)' : '';
          status.textContent = `Submission window is CLOSED. Next window opens at ${when}${dayHint}.`;
        } else {
          status.textContent = 'No schedule available.';
        }
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
        // Update in-memory schedule so UI immediately reflects changes
        schedule.graceMinutes = Number(saved.grace_minutes ?? schedule.graceMinutes ?? 20);
        schedule.slots = [
          { key: 'slot1', time: saved.slot1_time, label: saved.slot1_label },
          { key: 'slot2', time: saved.slot2_time, label: saved.slot2_label },
          { key: 'slot3', time: saved.slot3_time, label: saved.slot3_label }
        ];

        // If officer section exists (some shared deployments), refresh its hint + button disable logic
        try {
          if (typeof setOfficerDescription === 'function') setOfficerDescription(schedule);
          const select = $('dailyReportSlot');
          if (select && select.options?.length) {
            // rebuild option labels
            select.innerHTML = '';
            (schedule.slots || []).forEach(s => {
              const opt = document.createElement('option');
              opt.value = s.key;
              opt.textContent = `${s.label || s.time}`;
              select.appendChild(opt);
            });
          }
        } catch (e) {}

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
