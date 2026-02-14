// Client-side Notifications (In-app + Browser)
// - Designed for officer daily report reminders.
// - Uses Web Notifications API (not true push; works when page is open).

(function () {
  const SRI_LANKA_OFFSET_MINUTES = 330; // UTC+05:30

  function now() { return new Date(); }

  function toSriLankaDateISO(date = now()) {
    const shifted = new Date(date.getTime() + SRI_LANKA_OFFSET_MINUTES * 60 * 1000);
    const yyyy = shifted.getUTCFullYear();
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

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

  function slotStartUTCms(dateISO, hhmm) {
    const [y, m, d] = String(dateISO).split('-').map(Number);
    const t = parseHHMM(hhmm);
    if (!y || !m || !d || !t) return null;
    // local Sri Lanka time -> UTC
    return Date.UTC(y, m - 1, d, t.hh, t.mm, 0) - SRI_LANKA_OFFSET_MINUTES * 60 * 1000;
  }

  async function authHeaders() {
    const headers = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  async function fetchSchedule() {
    const res = await fetch('/api/reports/daily/schedule', { headers: await authHeaders() });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Failed to load report schedule');
    return json.config;
  }

  function canUseBrowserNotifications() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  function browserNotificationsEnabled() {
    return localStorage.getItem('browserNotificationsEnabled') === 'true';
  }

  // Server-backed preference (best effort). If false, never show browser notifications.
  let serverBrowserEnabled = null;
  async function refreshServerBrowserEnabled() {
    try {
      const res = await fetch('/api/notifications/settings', { headers: await getAuthHeaders() });
      const json = await res.json();
      if (json?.success && json.settings) {
        serverBrowserEnabled = json.settings.browser_alerts_enabled;
      }
    } catch (e) {}
  }

  function notifyBrowser(title, body) {
    if (!canUseBrowserNotifications()) return;
    if (serverBrowserEnabled === false) return;
    if (!browserNotificationsEnabled()) return;
    if (Notification.permission !== 'granted') return;

    try {
      new Notification(title, { body });
    } catch (e) {
      // ignore
    }
  }

  let userGestureSeen = false;
  window.addEventListener('click', () => { userGestureSeen = true; }, { once: true, capture: true });
  window.addEventListener('keydown', () => { userGestureSeen = true; }, { once: true, capture: true });

  function playNotificationSound() {
    try {
      // Autoplay policies: only play after a user gesture
      if (!userGestureSeen) return;

      // Simple beep using Web Audio API (no external asset)
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        try { o.stop(); } catch (e) {}
        try { ctx.close(); } catch (e) {}
      }, 160);
    } catch (e) {
      // ignore
    }
  }

  function notifyInApp(message, type = 'info') {
    // "Pop" + sound
    playNotificationSound();
    if (window.showToast) {
      window.showToast(message, type);
    } else if (window.UI?.showToast) {
      window.UI.showToast(message, type);
    } else {
      console.log('[notify]', message);
    }
  }

  // Avoid spamming: one reminder per slot per day
  function reminderKey(dateISO, slotKey) {
    return `dailyReportReminderSent:${dateISO}:${slotKey}`;
  }

  function wasReminderSent(dateISO, slotKey) {
    return localStorage.getItem(reminderKey(dateISO, slotKey)) === 'true';
  }

  function markReminderSent(dateISO, slotKey) {
    localStorage.setItem(reminderKey(dateISO, slotKey), 'true');
  }

  let timers = [];

  function clearTimers() {
    timers.forEach(t => clearTimeout(t));
    timers = [];
  }

  function fireDailyReportReminder(schedule, dateISO, slot) {
    if (wasReminderSent(dateISO, slot.key)) return;
    const timeLabel = slot.label || slot.time;
    const msg = `Daily report time: ${timeLabel}. Please submit within ${schedule.graceMinutes ?? 20} minutes.`;
    notifyInApp(msg, 'info');
    notifyBrowser('Daily Report Reminder', msg);
    if (window.NotificationCenter && typeof window.NotificationCenter.add === 'function') {
      window.NotificationCenter.add({ title: 'Daily Report Reminder', message: msg, ts: Date.now(), type: 'info' });
    }
    markReminderSent(dateISO, slot.key);
  }

  function missedKey(dateISO, slotKey) {
    return `dailyReportMissedSent:${dateISO}:${slotKey}`;
  }

  function wasMissedSent(dateISO, slotKey) {
    return localStorage.getItem(missedKey(dateISO, slotKey)) === 'true';
  }

  function markMissedSent(dateISO, slotKey) {
    localStorage.setItem(missedKey(dateISO, slotKey), 'true');
  }

  function fireMissedDailyReport(schedule, dateISO, slot) {
    if (wasMissedSent(dateISO, slot.key)) return;
    const timeLabel = slot.label || slot.time;
    const msg = `Missed daily report slot: ${timeLabel} (${dateISO}).`;
    notifyInApp(msg, 'warning');
    notifyBrowser('Missed Daily Report', msg);
    if (window.NotificationCenter?.add) {
      window.NotificationCenter.add({ title: 'Missed Daily Report', message: msg, ts: Date.now(), type: 'warning' });
    }
    markMissedSent(dateISO, slot.key);
  }

  function scheduleForToday(schedule) {
    clearTimers();

    // Respect toggle
    if (!settings().dailyReports) {
      return;
    }

    const graceMin = schedule.graceMinutes ?? 20;
    const graceMs = graceMin * 60 * 1000;

    const dateISO = toSriLankaDateISO();
    const slots = schedule?.slots || [];

    slots.forEach(slot => {
      const startMs = slotStartUTCms(dateISO, slot.time);
      if (!startMs) return;

      const delay = startMs - Date.now();

      // Catch-up behavior: if user was offline and comes back within the grace window,
      // show the reminder immediately.
      if (delay <= 0 && Math.abs(delay) <= graceMs) {
        fireDailyReportReminder(schedule, dateISO, slot);
        return;
      }

      // If we're beyond the grace window, record as missed.
      if (delay < -graceMs) {
        fireMissedDailyReport(schedule, dateISO, slot);
        return;
      }

      const id = setTimeout(() => fireDailyReportReminder(schedule, dateISO, slot), Math.max(0, delay));
      timers.push(id);
    });

    // Reschedule next day shortly after midnight Sri Lanka
    const nextDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nextISO = toSriLankaDateISO(nextDate);
    const midnightMs = slotStartUTCms(nextISO, '00:00');
    if (midnightMs) {
      const id = setTimeout(async () => {
        try {
          const latestSchedule = await fetchSchedule();
          scheduleForToday(latestSchedule);
        } catch (e) {
          // ignore
        }
      }, Math.max(60 * 1000, midnightMs - Date.now() + 60 * 1000));
      timers.push(id);
    }
  }

  async function requestBrowserPermission() {
    if (!canUseBrowserNotifications()) {
      throw new Error('Browser notifications not supported');
    }
    const permission = await Notification.requestPermission();
    return permission;
  }

  async function getAuthHeaders() {
    const headers = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: await getAuthHeaders() });
    const json = await res.json();
    if (!json?.success) throw new Error(json?.error || 'Request failed');
    return json;
  }

  function settings() {
    return {
      dailyReports: localStorage.getItem('notify:dailyReports') !== 'false',
      assignments: localStorage.getItem('notify:assignments') !== 'false',
      followups: localStorage.getItem('notify:followups') !== 'false'
    };
  }

  function setSetting(key, enabled) {
    localStorage.setItem(`notify:${key}`, enabled ? 'true' : 'false');
  }

  // --- New lead assignment notifications (poll) ---

  function snapshotStorageKey(officerId) {
    return `notify:snapshot:${officerId}`;
  }

  function loadSnapshot(officerId) {
    try {
      return JSON.parse(localStorage.getItem(snapshotStorageKey(officerId)) || '{}');
    } catch {
      return {};
    }
  }

  function saveSnapshot(officerId, snap) {
    localStorage.setItem(snapshotStorageKey(officerId), JSON.stringify(snap || {}));
  }

  function groupByBatchSheet(leads) {
    const map = new Map();
    (leads || []).forEach(l => {
      const batch = l.batch || l.batchName || l.batch_name || '';
      const sheet = l.sheet || l.sheetName || l.sheet_name || '';
      const key = `${batch}||${sheet}`;
      if (!map.has(key)) map.set(key, { batch, sheet, ids: new Set() });
      const g = map.get(key);
      g.ids.add(String(l.id || l.sheetLeadId || l.sheet_lead_id || l.leadId || ''));
    });
    return map;
  }

  async function pollAssignments(currentUser) {
    if (!settings().assignments) return;
    // Use Supabase CRM endpoint (fast). It returns leads assigned_to=officerName.
    const data = await fetchJson('/api/crm-leads/my?batch=all');
    const leads = data.leads || [];

    const officerId = currentUser?.id || 'me';
    const prev = loadSnapshot(officerId);

    const groups = groupByBatchSheet(leads);
    const newSnapshot = {};

    for (const [key, g] of groups.entries()) {
      const prevIds = new Set((prev[key] || []));
      const currIds = g.ids;
      const newOnes = Array.from(currIds).filter(id => id && !prevIds.has(id));
      newSnapshot[key] = Array.from(currIds);

      if (newOnes.length) {
        const title = 'New leads assigned';
        const msg = `${newOnes.length} lead(s) assigned — ${g.batch}${g.sheet ? ' / ' + g.sheet : ''}`;
        notifyInApp(msg, 'info');
        notifyBrowser(title, msg);
        if (window.NotificationCenter?.add) {
          window.NotificationCenter.add({ title, message: msg, ts: Date.now(), type: 'info' });
        }
      }
    }

    // Save snapshot
    saveSnapshot(officerId, newSnapshot);
  }

  // --- Follow-up due notifications (poll) ---
  function dueKey(officerId, event) {
    return `notify:followupDue:${officerId}:${event.batchName}::${event.sheetName}::${event.leadId}::${event.followUpNo}::${event.date}`;
  }

  function wasDueNotified(key) {
    return localStorage.getItem(key) === 'true';
  }

  function markDueNotified(key) {
    localStorage.setItem(key, 'true');
  }

  function normalizeDateForCompare(v) {
    const s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59`;
    return s;
  }

  async function pollFollowups(currentUser) {
    if (!settings().followups) return;
    const data = await fetchJson('/api/calendar/followups');
    const nowStr = data.now; // already in local server format
    const overdue = (data.overdue || []).slice(0, 200);
    const upcoming = (data.upcoming || []).slice(0, 200);
    const events = [...overdue, ...upcoming];

    const officerId = currentUser?.id || 'me';

    // Notify items that are due (overdue) or within a 1-minute window
    events.forEach(ev => {
      const when = normalizeDateForCompare(ev.date);
      // If it's due now or earlier
      if (when <= nowStr) {
        const k = dueKey(officerId, ev);
        if (wasDueNotified(k)) return;

        const title = 'Follow-up due';
        const msg = `Follow-up FU${ev.followUpNo} due now — ${ev.full_name || ''} (${ev.phone || ''}) — ${ev.batchName}${ev.sheetName ? ' / ' + ev.sheetName : ''}`;
        notifyInApp(msg, 'warning');
        notifyBrowser(title, msg);
        if (window.NotificationCenter?.add) {
          window.NotificationCenter.add({ title, message: msg, ts: Date.now(), type: 'warning' });
        }
        markDueNotified(k);
      }
    });
  }

  let pollTimer = null;

  function startPolling(currentUser) {
    if (pollTimer) return;

    const run = async () => {
      try {
        await pollAssignments(currentUser);
      } catch (e) {
        // ignore
      }
      try {
        await pollFollowups(currentUser);
      } catch (e) {
        // ignore
      }
    };

    // Run once quickly, then interval
    run();
    pollTimer = setInterval(run, 60 * 1000);

    // When coming back online, run immediately + reschedule daily reminders
    window.addEventListener('online', async () => {
      try { await run(); } catch (e) {}
      try { await window.Notifications?.reschedule?.(); } catch (e) {}
    });
  }

  // Watcher for server-generated notifications (admin + officer)
  let lastSeenNotificationId = null;

  function loadLastSeen(userId) {
    return localStorage.getItem(`notify:lastSeen:${userId}`) || null;
  }

  function saveLastSeen(userId, id) {
    if (!id) return;
    localStorage.setItem(`notify:lastSeen:${userId}`, String(id));
  }

  async function pollInbox(currentUser) {
    try {
      const userId = currentUser?.id || 'me';
      const res = await fetch('/api/notifications?limit=20', { headers: await getAuthHeaders() });
      const json = await res.json();
      if (!json?.success) return;

      const rows = json.notifications || [];
      if (!rows.length) return;

      const lastSeen = loadLastSeen(userId);
      // newest first
      const newest = rows[0];
      if (!lastSeen) {
        saveLastSeen(userId, newest.id);
        return;
      }

      // find notifications newer than lastSeen
      const idx = rows.findIndex(r => String(r.id) === String(lastSeen));
      const newOnes = idx === -1 ? rows : rows.slice(0, idx);

      // apply category toggles for admin
      const isAdmin = (currentUser?.role === 'admin') || document.body.classList.contains('admin');
      let settings = null;
      try {
        const r2 = await fetch('/api/notifications/settings', { headers: await getAuthHeaders() });
        const j2 = await r2.json();
        if (j2?.success) settings = j2.settings;
      } catch (e) {}

      newOnes.reverse().forEach(n => {
        if (isAdmin && settings) {
          if (n.category === 'admin_leave_requests' && settings.admin_leave_requests === false) return;
          if (n.category === 'admin_daily_reports' && settings.admin_daily_reports === false) return;
        }
        // Only pop if unread
        if (n.read_at) return;
        const msg = `${n.title}: ${n.message}`;
        notifyInApp(msg, n.type || 'info');
        notifyBrowser(n.title, n.message);
      });

      saveLastSeen(userId, newest.id);
    } catch (e) {
      // ignore
    }
  }

  let inboxTimer = null;
  function startInboxWatcher(currentUser) {
    if (inboxTimer) return;
    // initial
    pollInbox(currentUser);
    inboxTimer = setInterval(() => pollInbox(currentUser), 30 * 1000);
  }

  async function init(currentUser) {
    try {
      const isAdmin = (currentUser?.role === 'admin') || document.body.classList.contains('admin');
      if (!currentUser) return;

      await refreshServerBrowserEnabled();

      // Officers: daily report reminders + polling of leads/followups
      if (!isAdmin) {
        const schedule = await fetchSchedule();
        scheduleForToday(schedule);
        startPolling(currentUser);
      }

      // Everyone: server inbox watcher (for admin events, and future server-generated events)
      startInboxWatcher(currentUser);
    } catch (e) {
      console.warn('Notifications init failed:', e.message);
    }
  }

  window.Notifications = {
    init,
    fetchSchedule,
    requestBrowserPermission,
    canUseBrowserNotifications,
    browserNotificationsEnabled,
    setBrowserNotificationsEnabled(enabled) {
      localStorage.setItem('browserNotificationsEnabled', enabled ? 'true' : 'false');
    },

    // Preferences for other notifications
    getSettings: settings,
    setSetting,

    reschedule: async function () {
      const schedule = await fetchSchedule();
      scheduleForToday(schedule);
    }
  };
})();
