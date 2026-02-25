/**
 * Reports Page
 *
 * Officers: submit daily report for current time slot.
 * Admins: view all officers' daily reports by date and edit schedule times.
 */

(function () {
  // Prevent multiple intervals / concurrent init when navigating views
  let officerHintIntervalId = null;
  let isInitReports = false;

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

  const SRI_LANKA_OFFSET_MINUTES = 330; // UTC+05:30

  function nowInSriLanka() {
    const now = new Date();
    return new Date(now.getTime() + SRI_LANKA_OFFSET_MINUTES * 60 * 1000);
  }

  function todayISO() {
    // Compute YYYY-MM-DD in Sri Lanka time (independent of client device timezone settings)
    const d = nowInSriLanka();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function buildWindowHint({ slot, graceMinutes }) {
    return `Open at ${slot.label || slot.time}, closes after ${graceMinutes} minutes.`;
  }

  function computeWindowForToday(slotTimeHHMM, graceMinutes, baseDateISO = todayISO()) {
    // Build a UTC window that corresponds to Sri Lanka local time.
    const t = parseHHMM(slotTimeHHMM);
    if (!t) return { start: new Date('invalid'), end: new Date('invalid') };
    const parts = String(baseDateISO).split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    const startUTCms = Date.UTC(y, m - 1, d, t.hh, t.mm, 0) - SRI_LANKA_OFFSET_MINUTES * 60 * 1000;
    const endUTCms = startUTCms + graceMinutes * 60 * 1000;
    return { start: new Date(startUTCms), end: new Date(endUTCms) };
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

  function renderAdminTable(reports, officers, schedule) {
    const wrap = $('reportsAdminTableWrap');
    if (!wrap) return;

    // Allow rendering even when there are no submissions (we will show Missing rows)
    const safeReports = Array.isArray(reports) ? reports : [];

    const cols = [
      { key: 'officer_name', label: 'Officer' },
      { key: 'slot_key', label: 'Slot' },
      { key: 'missing', label: 'Status' },
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

    const trHtmlFn = (r) => `
      <tr data-row-key="${escape(String(r.id))}" ${r.is_missing ? 'style="opacity:0.75;"' : ''}>
        <td>${escape(r.officer_name || r.officer_user_id)}</td>
        <td>${escape(r.slot_key)}</td>
        <td>${r.is_missing ? '<span class="badge" style="background:#fff1f2; color:#9f1239; border:1px solid #fecdd3;">Not submitted</span>' : '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Submitted</span>'}</td>
        <td>${escape(r.fresh_calls_made)}</td>
        <td>${escape(r.fresh_messages_reached)}</td>
        <td>${escape(r.interested_leads)}</td>
        <td>${escape(r.followup_calls)}</td>
        <td>${escape(r.followup_messages)}</td>
        <td>${escape(r.followup_scheduled)}</td>
        <td>${escape(r.closures)}</td>
        <td style="max-width: 280px; white-space: pre-wrap;">${escape(r.notes || '')}</td>
        <td>${r.is_missing ? '' : `<button class="btn btn-secondary" data-edit-report="${r.id}"><i class="fas fa-edit"></i> Edit</button>`}</td>
      </tr>
    `;

    // Expand to include missing slots for all officers (admin view)
    let rowsToRender = safeReports.slice();

    const slots = (schedule?.slots || []).map(s => s.key).filter(Boolean);
    if (Array.isArray(officers) && officers.length && slots.length) {
      const byOfficerSlot = new Map();
      for (const r of rowsToRender) {
        byOfficerSlot.set(`${r.officer_user_id}:${r.slot_key}`, r);
      }

      const expanded = [];
      for (const o of officers) {
        for (const slotKey of slots) {
          const key = `${o.id}:${slotKey}`;
          const found = byOfficerSlot.get(key);
          if (found) {
            expanded.push({ ...found, is_missing: false });
          } else {
            expanded.push({
              id: `missing:${o.id}:${slotKey}`,
              officer_user_id: o.id,
              officer_name: o.name,
              slot_key: slotKey,
              fresh_calls_made: 0,
              fresh_messages_reached: 0,
              interested_leads: 0,
              followup_calls: 0,
              followup_messages: 0,
              followup_scheduled: 0,
              closures: 0,
              notes: '',
              is_missing: true
            });
          }
        }
      }

      // Sort by officer name, then slot order
      const slotIndex = new Map(slots.map((s, i) => [s, i]));
      rowsToRender = expanded.sort((a, b) => {
        const an = String(a.officer_name || a.officer_user_id || '');
        const bn = String(b.officer_name || b.officer_user_id || '');
        if (an !== bn) return an.localeCompare(bn);
        return (slotIndex.get(a.slot_key) ?? 99) - (slotIndex.get(b.slot_key) ?? 99);
      });
    }

    // Create table skeleton once, then patch tbody
    if (!wrap.querySelector('table')) {
      wrap.innerHTML = `
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>${cols.map(c => `<th>${escape(c.label)}</th>`).join('')}</tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      `;
    }

    const tbody = wrap.querySelector('tbody');
    if (tbody && window.DOMPatcher?.patchTableBody) {
      window.DOMPatcher.patchTableBody(tbody, rowsToRender, (x) => x.id, trHtmlFn);
    } else if (tbody) {
      tbody.innerHTML = rowsToRender.map(trHtmlFn).join('');
    }

    wrap.querySelectorAll('[data-edit-report]')?.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-edit-report');
        const row = rowsToRender.find(x => String(x.id) === String(id));
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
    const ttlMs = 2 * 60 * 1000; // 2 minutes
    const cacheKey = 'reports:dailySchedule';

    if (window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached) return cached;
    }

    const headers = await authHeaders();
    const res = await fetch('/api/reports/daily/schedule', { headers });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load schedule');

    if (window.Cache) window.Cache.setWithTs(cacheKey, json.config);
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

    // Invalidate admin daily cache for today
    if (window.Cache) window.Cache.invalidatePrefix('reports:daily:');

    return json.report;
  }

  async function adminLoadReports(date) {
    const ttlMs = 2 * 60 * 1000; // 2 minutes
    const cacheKey = `reports:daily:${encodeURIComponent(date)}`;

    if (window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached && Array.isArray(cached)) return cached;
    }

    const headers = await authHeaders();
    const res = await fetch(`/api/reports/daily?date=${encodeURIComponent(date)}`, { headers });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load reports');

    const rows = json.reports || [];
    if (window.Cache) window.Cache.setWithTs(cacheKey, rows);
    return rows;
  }

  async function fetchOfficers() {
    const ttlMs = 5 * 60 * 1000;
    const cacheKey = 'reports:officers';
    if (window.Cache) {
      const cached = window.Cache.getFresh(cacheKey, ttlMs);
      if (cached) return cached;
    }

    const headers = await authHeaders();
    const res = await fetch('/api/users/officers', { headers });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load officers');
    const officers = json.officers || [];
    if (window.Cache) window.Cache.setWithTs(cacheKey, officers);
    return officers;
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

    if (window.Cache) window.Cache.invalidate('reports:dailySchedule');

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
    if (window.Cache) window.Cache.invalidatePrefix('reports:daily:');
    const date = $('reportsAdminDate')?.value || todayISO();
    const rows = await adminLoadReports(date);
    renderAdminTable(rows, officers, schedule);
  }

  function setOfficerDescription(schedule) {
    const sec = $('reportsOfficerSection');
    if (!sec) return;
    const p = sec.querySelector('p');
    const times = (schedule?.slots || []).map(s => (s.label || s.time)).join(', ');
    const grace = schedule?.graceMinutes ?? 20;
    if (p) p.textContent = `Submit ${schedule?.slots?.length || 3} reports/day (${times}). Submission closes ${grace} minutes after each time.`;
  }

  function renderOfficerOverview({ reports, officers, schedule }) {
    const wrap = $('reportsOfficerTableWrap');
    if (!wrap) return;

    const safeReports = Array.isArray(reports) ? reports : [];
    const safeOfficers = Array.isArray(officers) ? officers : [];
    const slots = (schedule?.slots || []).filter(s => s?.key);

    const escape = (s) => String(s ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const byOfficerSlot = new Map();
    for (const r of safeReports) {
      if (!r?.officer_user_id || !r?.slot_key) continue;
      byOfficerSlot.set(`${r.officer_user_id}:${r.slot_key}`, r);
    }

    const badge = (submitted) => submitted
      ? '<span class="badge" style="background:#ecfdf3; color:#027a48; border:1px solid #abefc6;">Submitted</span>'
      : '<span class="badge" style="background:#fff1f2; color:#9f1239; border:1px solid #fecdd3;">Not submitted</span>';

    const officersSorted = safeOfficers
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const sectionsHtml = slots.map(slot => {
      const listHtml = officersSorted.map(o => {
        const found = byOfficerSlot.get(`${o.id}:${slot.key}`);
        return `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 10px; border:1px solid #eaecf0; border-radius:10px; background:#fff; margin-top:8px;">
            <div style="font-weight:700; color:#101828;">${escape(o.name)}</div>
            <div>${badge(!!found)}</div>
          </div>
        `;
      }).join('');

      const slotTitle = (slot.key || '').toLowerCase() === 'slot1' ? 'Slot 1' : (slot.key || '').toLowerCase() === 'slot2' ? 'Slot 2' : (slot.key || '').toLowerCase() === 'slot3' ? 'Slot 3' : String(slot.key || '').toUpperCase();

      return `
        <div style="margin-top:14px; padding:12px; border:1px solid #eaecf0; border-radius:12px; background:#fcfcfd;">
          <div style="font-weight:900; color:#101828; margin-bottom:6px;">${escape(slotTitle)}:</div>
          ${listHtml || `<div class=\"empty\" style=\"padding:10px;\">No officers</div>`}
        </div>
      `;
    }).join('');

    wrap.innerHTML = sectionsHtml || '<div class="content-placeholder" style="padding: 20px;"><p>No slots configured.</p></div>';
  }

  async function officerLoadOverview(dateISO) {
    const headers = await authHeaders();
    const res = await fetch(`/api/reports/daily/overview?date=${encodeURIComponent(dateISO)}`, { headers });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load reports');
    return { reports: json.reports || [], officers: json.officers || [] };
  }

  async function initOfficer(schedule) {
    const sec = $('reportsOfficerSection');
    if (!sec) return;
    sec.style.display = 'block';

    setOfficerDescription(schedule);

    // Load overview table for all officers (today)
    try {
      const wrap = $('reportsOfficerTableWrap');
      if (wrap) wrap.innerHTML = '<div class="content-placeholder" style="padding: 20px;"><p class="loading">Loading...</p></div>';
      const { reports, officers } = await officerLoadOverview(todayISO());
      renderOfficerOverview({ reports, officers, schedule });
    } catch (e) {
      const wrap = $('reportsOfficerTableWrap');
      if (wrap) wrap.innerHTML = `<div class="content-placeholder" style="padding: 20px;"><p style="color:#ef4444;">${String(e.message || e)}</p></div>`;
    }

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
    if (officerHintIntervalId) clearInterval(officerHintIntervalId);
    officerHintIntervalId = setInterval(updateHintAndDisable, 30000);
  }

  async function initAdmin(schedule) {
    const officers = await fetchOfficers().catch(() => []);
    const sec = $('reportsAdminSection');
    if (!sec) return;
    sec.style.display = 'block';

    const wrap = $('reportsAdminTableWrap');
    if (wrap && !wrap.__loadedOnce) {
      wrap.__loadedOnce = true;
      wrap.innerHTML = '<div class="content-placeholder" style="padding: 20px;"><p class="loading">Loading...</p></div>';
    }

    const dateInput = $('reportsAdminDate');
    if (dateInput && !dateInput.value) dateInput.value = todayISO();

    const doLoad = async () => {
      const wrap = $('reportsAdminTableWrap');
      if (wrap) wrap.innerHTML = '<div class="content-placeholder" style="padding: 20px;"><p class="loading">Loading...</p></div>';
      try {
        const rows = await adminLoadReports(dateInput.value);
        renderAdminTable(rows, officers, schedule);
      } catch (e) {
        if (wrap) wrap.innerHTML = `<div class="content-placeholder" style="padding: 20px;"><p style="color:#ef4444;">${String(e.message || e)}</p></div>`;
        if (window.showToast) showToast(e.message, 'error');
      }
    };

    $('reportsAdminLoadBtn').onclick = doLoad;

    // Auto-load for the selected date (defaults to today)
    doLoad();

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
    if (isInitReports) return;
    isInitReports = true;
    try {
      const schedule = await fetchSchedule();

      // Reset modal defaults
      $('dailyReportSlot').disabled = false;
      $('submitDailyReportBtn').textContent = 'Submit';
      const msg = $('dailyReportSubmitMsg');
      if (msg) msg.textContent = '';

      // Determine admin using same signal as the rest of the app (body.admin),
      // but also allow explicit role === 'admin'.
      const isAdminUser = (currentUser?.role === 'admin') || document.body.classList.contains('admin');

      // Hide both sections first (avoid stale state across navigation)
      const adminSec = $('reportsAdminSection');
      const officerSec = $('reportsOfficerSection');
      if (adminSec) adminSec.style.display = 'none';
      if (officerSec) officerSec.style.display = 'none';

      if (isAdminUser) {
        await initAdmin(schedule);
      } else {
        await initOfficer(schedule);
      }
    } catch (e) {
      console.error('initReportsPage error:', e);
      if (window.showToast) showToast(e.message, 'error');
    } finally {
      isInitReports = false;
    }
  };
})();
