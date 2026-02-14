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

  function notifyBrowser(title, body) {
    if (!canUseBrowserNotifications()) return;
    if (!browserNotificationsEnabled()) return;
    if (Notification.permission !== 'granted') return;

    try {
      new Notification(title, { body });
    } catch (e) {
      // ignore
    }
  }

  function notifyInApp(message, type = 'info') {
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

  function scheduleForToday(schedule) {
    clearTimers();

    // Respect toggle
    if (!settings().dailyReports) {
      return;
    }

    const dateISO = toSriLankaDateISO();
    const slots = schedule?.slots || [];

    slots.forEach(slot => {
      const startMs = slotStartUTCms(dateISO, slot.time);
      if (!startMs) return;

      const delay = startMs - Date.now();
      if (delay < -5 * 60 * 1000) {
        // already passed by >5 minutes; don't schedule
        return;
      }

      const id = setTimeout(() => {
        if (wasReminderSent(dateISO, slot.key)) return;
        const timeLabel = slot.label || slot.time;
        const msg = `Daily report time: ${timeLabel}. Please submit within ${schedule.graceMinutes ?? 20} minutes.`;
        notifyInApp(msg, 'info');
        notifyBrowser('Daily Report Reminder', msg);
        if (window.NotificationCenter && typeof window.NotificationCenter.add === 'function') {
          window.NotificationCenter.add({ title: 'Daily Report Reminder', message: msg, ts: Date.now(), type: 'info' });
        }
        markReminderSent(dateISO, slot.key);
      }, Math.max(0, delay));
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
  }

  async function init(currentUser) {
    try {
      // Only officers get reminders
      const isAdmin = (currentUser?.role === 'admin') || document.body.classList.contains('admin');
      if (!currentUser || isAdmin) return;

      const schedule = await fetchSchedule();
      scheduleForToday(schedule);

      // Start polling-based notifications
      startPolling(currentUser);
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
