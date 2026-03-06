/**
 * Daily Reports Service (Supabase)
 *
 * Stores officer-submitted daily KPI numbers for three scheduled slots per day.
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

function requireSupabase() {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const err = new Error('Supabase admin not configured');
    err.status = 500;
    throw err;
  }
  return sb;
}

const DEFAULT_SCHEDULE = {
  timezone: 'Asia/Colombo',
  graceMinutes: 20,
  slots: [
    { key: 'slot1', label: '10:30 AM', time: '10:30' },
    { key: 'slot2', label: '02:30 PM', time: '14:30' },
    { key: 'slot3', label: '06:00 PM', time: '18:00' }
  ]
};

function toInt(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

function cleanString(v) {
  if (v == null) return '';
  return String(v).trim();
}

function toISODateUTC(d) {
  // YYYY-MM-DD in UTC
  const x = new Date(d);
  if (isNaN(x)) return null;
  const yyyy = x.getUTCFullYear();
  const mm = String(x.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(x.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseTimeHHMM(t) {
  const s = cleanString(t);
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm, hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

const SRI_LANKA_OFFSET_MINUTES = 330; // UTC+05:30 (no DST)

function getDateISOInOffset(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function computeWindowUTC({ dateISO, timeHHMM, graceMinutes, offsetMinutes }) {
  // Build a UTC timestamp that corresponds to local (offset) time.
  const [y, m, d] = dateISO.split('-').map(Number);
  const tm = parseTimeHHMM(timeHHMM);
  if (!y || !m || !d || !tm) return null;

  // local time -> UTC by subtracting offset
  const startUTCms = Date.UTC(y, m - 1, d, tm.hh, tm.mm, 0) - offsetMinutes * 60 * 1000;
  const endUTCms = startUTCms + graceMinutes * 60 * 1000;
  return { start: new Date(startUTCms), end: new Date(endUTCms) };
}

async function getSchedule() {
  const sb = requireSupabase();

  // Table `daily_report_config` should have a single row with id=1.
  const { data, error } = await sb.from('daily_report_config').select('*').eq('id', 1).maybeSingle();

  if (error) {
    // If table missing, return defaults (don’t crash UI)
    console.warn('daily_report_config select failed:', error.message);
    return { source: 'default', config: DEFAULT_SCHEDULE };
  }

  if (!data) {
    return { source: 'default', config: DEFAULT_SCHEDULE };
  }

  const slots = [
    { key: 'slot1', label: data.slot1_label || '10:30 AM', time: data.slot1_time || '10:30' },
    { key: 'slot2', label: data.slot2_label || '02:30 PM', time: data.slot2_time || '14:30' },
    { key: 'slot3', label: data.slot3_label || '06:00 PM', time: data.slot3_time || '18:00' }
  ];

  return {
    source: 'supabase',
    config: {
      timezone: data.timezone || DEFAULT_SCHEDULE.timezone,
      graceMinutes: Number.isFinite(Number(data.grace_minutes)) ? Number(data.grace_minutes) : DEFAULT_SCHEDULE.graceMinutes,
      slots
    }
  };
}

async function updateSchedule({ timezone, graceMinutes, slots }) {
  const sb = requireSupabase();

  const s1 = slots?.[0] || {};
  const s2 = slots?.[1] || {};
  const s3 = slots?.[2] || {};

  const slot1 = parseTimeHHMM(s1.time) || parseTimeHHMM(DEFAULT_SCHEDULE.slots[0].time);
  const slot2 = parseTimeHHMM(s2.time) || parseTimeHHMM(DEFAULT_SCHEDULE.slots[1].time);
  const slot3 = parseTimeHHMM(s3.time) || parseTimeHHMM(DEFAULT_SCHEDULE.slots[2].time);

  const formatLabel = (hhmm) => {
    const t = parseTimeHHMM(hhmm);
    if (!t) return hhmm;
    const h12 = ((t.hh + 11) % 12) + 1;
    const ampm = t.hh >= 12 ? 'PM' : 'AM';
    return `${String(h12).padStart(2, '0')}:${String(t.mm).padStart(2, '0')} ${ampm}`;
  };

  const row = {
    id: 1,
    timezone: cleanString(timezone) || DEFAULT_SCHEDULE.timezone,
    grace_minutes: Number.isFinite(Number(graceMinutes)) ? Math.max(0, Math.trunc(Number(graceMinutes))) : DEFAULT_SCHEDULE.graceMinutes,
    slot1_time: slot1.hhmm,
    slot1_label: cleanString(s1.label) || formatLabel(slot1.hhmm),
    slot2_time: slot2.hhmm,
    slot2_label: cleanString(s2.label) || formatLabel(slot2.hhmm),
    slot3_time: slot3.hhmm,
    slot3_label: cleanString(s3.label) || formatLabel(slot3.hhmm),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from('daily_report_config')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

function normalizePayload(payload) {
  const p = payload || {};
  return {
    fresh_calls_made: toInt(p.freshCallsMade ?? p.fresh_calls_made),
    fresh_messages_reached: toInt(p.freshMessagesReached ?? p.fresh_messages_reached),
    interested_leads: toInt(p.interestedLeads ?? p.interested_leads),
    followup_calls: toInt(p.followUpCalls ?? p.followup_calls ?? p.followupCalls),
    followup_messages: toInt(p.followUpMessages ?? p.followup_messages ?? p.followupMessages),
    followup_scheduled: toInt(p.followUpScheduled ?? p.followup_scheduled ?? p.followupScheduled),
    closures: toInt(p.closures),
    notes: cleanString(p.notes || '')
  };
}

async function submitDailyReport({ officerUserId, officerName, slotKey, clientNowISO, payload }) {
  const sb = requireSupabase();
  const { config } = await getSchedule();

  const slot = (config.slots || []).find(s => s.key === slotKey);
  if (!slot) {
    const err = new Error('Invalid slot');
    err.status = 400;
    throw err;
  }

  const time = parseTimeHHMM(slot.time);
  if (!time) {
    const err = new Error('Invalid slot time configuration');
    err.status = 500;
    throw err;
  }

  const now = clientNowISO ? new Date(clientNowISO) : new Date();
  if (isNaN(now)) {
    const err = new Error('Invalid client time');
    err.status = 400;
    throw err;
  }

  // Always treat reporting as Sri Lanka time (UTC+05:30), independent of server timezone.
  const dateISO = getDateISOInOffset(now, SRI_LANKA_OFFSET_MINUTES);

  const windowUTC = computeWindowUTC({
    dateISO,
    timeHHMM: time.hhmm,
    graceMinutes: config.graceMinutes,
    offsetMinutes: SRI_LANKA_OFFSET_MINUTES
  });
  if (!windowUTC) {
    const err = new Error('Invalid slot window configuration');
    err.status = 500;
    throw err;
  }

  const { start, end } = windowUTC;
  if (now < start || now > end) {
    const err = new Error('Submission window closed');
    err.status = 403;
    err.meta = { start: start.toISOString(), end: end.toISOString(), now: now.toISOString(), report_date: dateISO };
    throw err;
  }

  const normalized = normalizePayload(payload);

  const row = {
    report_date: dateISO,
    slot_key: slotKey,
    officer_user_id: officerUserId,
    officer_name: cleanString(officerName) || null,
    ...normalized,
    submitted_at: now.toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from('daily_officer_reports')
    .upsert(row, { onConflict: 'report_date,slot_key,officer_user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function listDailyReports({ dateISO }) {
  const sb = requireSupabase();
  const date = cleanString(dateISO);
  if (!date) {
    const err = new Error('date is required');
    err.status = 400;
    throw err;
  }

  const { data, error } = await sb
    .from('daily_officer_reports')
    .select('*')
    .eq('report_date', date)
    .order('slot_key', { ascending: true })
    .order('officer_name', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

async function adminUpdateReport({ reportId, patch }) {
  const sb = requireSupabase();
  const id = Number(reportId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid reportId');
    err.status = 400;
    throw err;
  }

  const normalized = normalizePayload(patch);
  const row = {
    ...normalized,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from('daily_officer_reports')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * sendSlotReminders
 *
 * Called at (or just after) each slot time. Finds all officers who have NOT yet
 * submitted a report for the current slot and sends them an in-app reminder
 * notification.
 *
 * Returns { sent: number, skipped: number, slot: string|null }
 *
 * Safe to call repeatedly — uses a dedupe window so officers won't be spammed
 * if the cron fires slightly more than once per slot window.
 */
async function sendSlotReminders({ nowISO } = {}) {
  const sb = requireSupabase();
  const { config } = await getSchedule();

  const now = nowISO ? new Date(nowISO) : new Date();
  if (isNaN(now)) {
    const err = new Error('Invalid nowISO');
    err.status = 400;
    throw err;
  }

  const graceMinutes = config.graceMinutes ?? 20;
  const dateISO = getDateISOInOffset(now, SRI_LANKA_OFFSET_MINUTES);

  // Find the slot whose window is currently open
  let activeSlot = null;
  let activeWindow = null;
  for (const slot of (config.slots || [])) {
    const t = parseTimeHHMM(slot.time);
    if (!t) continue;
    const w = computeWindowUTC({ dateISO, timeHHMM: t.hhmm, graceMinutes, offsetMinutes: SRI_LANKA_OFFSET_MINUTES });
    if (!w) continue;
    if (now >= w.start && now <= w.end) {
      activeSlot = slot;
      activeWindow = w;
      break;
    }
  }

  if (!activeSlot) {
    // No slot window is open right now — nothing to do
    return { sent: 0, skipped: 0, slot: null, reason: 'no_open_window' };
  }

  // Get all officers (non-admin users with role officer / admission_officer)
  const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];
  const { data: { users }, error: usersErr } = await sb.auth.admin.listUsers();
  if (usersErr) throw usersErr;

  const officers = (users || []).filter(u => {
    const email = String(u.email || '').toLowerCase();
    if (ADMIN_EMAILS.includes(email) || email.includes('admin')) return false;
    const role = u.user_metadata?.role;
    return role === 'officer' || role === 'admission_officer';
  });

  if (!officers.length) {
    return { sent: 0, skipped: 0, slot: activeSlot.key, reason: 'no_officers' };
  }

  // Find which officers have already submitted for this slot today
  const { data: submitted, error: subErr } = await sb
    .from('daily_officer_reports')
    .select('officer_user_id')
    .eq('report_date', dateISO)
    .eq('slot_key', activeSlot.key);

  if (subErr) throw subErr;

  const submittedIds = new Set((submitted || []).map(r => r.officer_user_id));

  // Dedupe: don't re-notify if we already sent a reminder for this slot in this window
  const dedupeCategory = `daily_report_reminder_${activeSlot.key}`;
  const { data: recentReminders, error: remErr } = await sb
    .from('user_notifications')
    .select('user_id')
    .eq('category', dedupeCategory)
    .gte('created_at', activeWindow.start.toISOString());

  if (remErr) throw remErr;

  const alreadyRemindedIds = new Set((recentReminders || []).map(r => r.user_id));

  const { createNotification } = require('../notifications/notificationsService');

  let sent = 0;
  let skipped = 0;

  for (const officer of officers) {
    if (submittedIds.has(officer.id)) {
      skipped++; // already submitted
      continue;
    }
    if (alreadyRemindedIds.has(officer.id)) {
      skipped++; // already reminded this window
      continue;
    }

    const officerName = officer.user_metadata?.name || officer.email?.split('@')?.[0] || 'Officer';
    const endTime = activeWindow.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' });

    try {
      await createNotification({
        userId: officer.id,
        category: dedupeCategory,
        title: `Daily report due — ${activeSlot.label || activeSlot.time}`,
        message: `Please submit your daily report for the ${activeSlot.label || activeSlot.time} slot. Window closes at ${endTime} (SL time).`,
        type: 'warning'
      });
      sent++;
    } catch (e) {
      console.warn(`sendSlotReminders: failed to notify officer ${officer.id}:`, e.message);
    }
  }

  return { sent, skipped, slot: activeSlot.key, date: dateISO };
}

module.exports = {
  DEFAULT_SCHEDULE,
  getSchedule,
  updateSchedule,
  submitDailyReport,
  listDailyReports,
  adminUpdateReport,
  sendSlotReminders
};
