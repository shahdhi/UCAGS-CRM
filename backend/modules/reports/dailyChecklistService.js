/**
 * Daily Checklist Service
 *
 * Admin-only operational checklist over a date range:
 *  - Slot 1/2/3 daily report submission status (auto)
 *  - Leads contacted / to-be-contacted (auto, derived from follow-ups)
 *  - Call recordings received status (manual)
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

function cleanString(v) {
  if (v == null) return '';
  return String(v).trim();
}

const SRI_LANKA_OFFSET_MINUTES = 330; // UTC+05:30

function getDateISOInOffset(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODate(dateISO) {
  const s = cleanString(dateISO);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d, iso: s };
}

function addDaysISO(dateISO, deltaDays) {
  const p = parseISODate(dateISO);
  if (!p) return null;
  const utcMidnight = Date.UTC(p.y, p.mo - 1, p.d, 0, 0, 0);
  const next = new Date(utcMidnight + deltaDays * 24 * 60 * 60 * 1000);
  return getDateISOInOffset(next, 0); // already UTC
}

function toUTCBoundaryFromSLDate(dateISO) {
  // Start-of-day in Sri Lanka converted to UTC.
  const p = parseISODate(dateISO);
  if (!p) return null;
  const slStartUTCms = Date.UTC(p.y, p.mo - 1, p.d, 0, 0, 0) - SRI_LANKA_OFFSET_MINUTES * 60 * 1000;
  return new Date(slStartUTCms);
}

function buildDateList({ startISO, days }) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(startISO, i);
    if (!d) break;
    out.push(d);
  }
  return out;
}

async function listDailyReportsRange({ startISO, endISO }) {
  const sb = requireSupabase();
  const start = cleanString(startISO);
  const end = cleanString(endISO);
  if (!start || !end) {
    const err = new Error('startISO/endISO required');
    err.status = 400;
    throw err;
  }

  const { data, error } = await sb
    .from('daily_officer_reports')
    .select('report_date, slot_key, officer_user_id')
    .gte('report_date', start)
    .lte('report_date', end);

  if (error) throw error;
  return data || [];
}

async function listFollowupsRange({ startISO, endISO }) {
  const sb = requireSupabase();

  // Query by timestamp range. We'll fetch any followup whose actual_at is within the
  // Sri Lanka day range (inclusive) and then group in JS by SL local date.
  const startUTC = toUTCBoundaryFromSLDate(startISO);
  const endPlus1UTC = toUTCBoundaryFromSLDate(addDaysISO(endISO, 1));
  if (!startUTC || !endPlus1UTC) {
    const err = new Error('Invalid date range');
    err.status = 400;
    throw err;
  }

  const fields = 'officer_user_id, officer_name, batch_name, sheet_name, sheet_lead_id, sequence, actual_at';

  const { data, error } = await sb
    .from('crm_lead_followups')
    .select(fields)
    .gte('actual_at', startUTC.toISOString())
    .lt('actual_at', endPlus1UTC.toISOString());

  if (error) throw error;
  return data || [];
}

async function listLeadSnapshotsRange({ startISO, endISO }) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('daily_officer_leads_snapshot')
    .select('snapshot_date, officer_user_id, new_leads_count')
    .gte('snapshot_date', startISO)
    .lte('snapshot_date', endISO);

  if (error) {
    // If table isn't created yet, be non-fatal.
    console.warn('daily_officer_leads_snapshot select failed:', error.message);
    return [];
  }
  return data || [];
}

async function computeNewLeadsCountsCurrent({ officers }) {
  const sb = requireSupabase();

  // Current counts of leads in status=New grouped by assigned_to (officer name)
  const fields = 'id, batch_name, sheet_name, sheet_lead_id, assigned_to, status';
  const { data, error } = await sb
    .from('crm_leads')
    .select(fields)
    .eq('status', 'New');

  if (error) throw error;

  const officerNameToId = new Map((officers || []).map(o => [String(o.name || '').trim(), o.id]));
  const counts = new Map();

  for (const l of (data || [])) {
    const assignee = String(l.assigned_to || '').trim();
    const officerId = officerNameToId.get(assignee);
    if (!officerId) continue;

    const leadKey = [l.batch_name, l.sheet_name, l.sheet_lead_id].join('|');
    const set = counts.get(officerId) || new Set();
    set.add(leadKey);
    counts.set(officerId, set);
  }

  // Return map officerId -> count
  const out = new Map();
  for (const [officerId, set] of counts.entries()) out.set(officerId, set.size);
  return out;
}

async function listCallRecordingStatuses({ startISO, endISO }) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('daily_call_recordings')
    .select('report_date, officer_user_id, status')
    .gte('report_date', startISO)
    .lte('report_date', endISO);

  if (error) {
    // If table not yet created, be non-fatal (UI can still work without manual column).
    console.warn('daily_call_recordings select failed:', error.message);
    return [];
  }
  return data || [];
}

async function upsertCallRecordingStatus({ dateISO, officerUserId, status }) {
  const sb = requireSupabase();
  const date = cleanString(dateISO);
  const officer = cleanString(officerUserId);
  const st = cleanString(status);

  if (!date || !officer) {
    const err = new Error('dateISO and officerUserId are required');
    err.status = 400;
    throw err;
  }

  const allowed = new Set(['received', 'not_received', 'na', '']);
  if (!allowed.has(st)) {
    const err = new Error('Invalid status');
    err.status = 400;
    throw err;
  }

  const row = {
    report_date: date,
    officer_user_id: officer,
    status: st || 'na',
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from('daily_call_recordings')
    .upsert(row, { onConflict: 'report_date,officer_user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

function buildEmptyMatrix({ dates, officers }) {
  const byDate = {};
  for (const d of dates) {
    const byOfficer = {};
    for (const o of officers) {
      byOfficer[o.id] = {
        officerUserId: o.id,
        officerName: o.name,
        slot1: false,
        slot2: false,
        slot3: false,
        leadsContacted: 0,
        leadsToBeContacted: 0,
        callRecording: 'na'
      };
    }
    byDate[d] = byOfficer;
  }
  return byDate;
}

async function getDailyChecklist({ startISO, days, officers }) {
  const start = cleanString(startISO);
  const n = Number(days);
  if (!start) throw Object.assign(new Error('start is required (YYYY-MM-DD)'), { status: 400 });
  if (!Number.isFinite(n) || n <= 0 || n > 31) throw Object.assign(new Error('days must be 1..31'), { status: 400 });

  const dates = buildDateList({ startISO: start, days: n });
  if (!dates.length) throw Object.assign(new Error('Invalid start date'), { status: 400 });

  const end = dates[dates.length - 1];

  const [reportRows, followups, leadSnapshots, recordings] = await Promise.all([
    listDailyReportsRange({ startISO: start, endISO: end }),
    listFollowupsRange({ startISO: start, endISO: end }),
    listLeadSnapshotsRange({ startISO: start, endISO: end }),
    listCallRecordingStatuses({ startISO: start, endISO: end })
  ]);

  const byDate = buildEmptyMatrix({ dates, officers });

  // reports
  for (const r of reportRows) {
    if (!byDate[r.report_date]) continue;
    const cell = byDate[r.report_date]?.[r.officer_user_id];
    if (!cell) continue;
    if (r.slot_key === 'slot1') cell.slot1 = true;
    if (r.slot_key === 'slot2') cell.slot2 = true;
    if (r.slot_key === 'slot3') cell.slot3 = true;
  }

  // Leads contacted: distinct leads with an actual_at followup within the day.
  const contactedByDayOfficer = new Map();

  for (const f of followups) {
    const officerId = f.officer_user_id;
    if (!officerId) continue;
    if (!f.actual_at) continue;

    const leadKey = [f.batch_name, f.sheet_name, f.sheet_lead_id].join('|');
    const d = getDateISOInOffset(new Date(f.actual_at), SRI_LANKA_OFFSET_MINUTES);
    const k = `${d}|${officerId}`;
    const set = contactedByDayOfficer.get(k) || new Set();
    set.add(leadKey);
    contactedByDayOfficer.set(k, set);
  }

  // To be contacted: per-day snapshot values from daily_officer_leads_snapshot.
  // If a snapshot row is missing, default to 0 (admin can backfill via snapshot endpoint).
  const snapshotByDayOfficer = new Map();
  for (const r of (leadSnapshots || [])) {
    const d = String(r.snapshot_date).slice(0, 10);
    const k = `${d}|${r.officer_user_id}`;
    snapshotByDayOfficer.set(k, Number(r.new_leads_count || 0));
  }

  for (const d of dates) {
    for (const o of officers) {
      const k = `${d}|${o.id}`;
      const cell = byDate[d][o.id];
      cell.leadsContacted = (contactedByDayOfficer.get(k)?.size) || 0;
      cell.leadsToBeContacted = snapshotByDayOfficer.get(k) || 0;
    }
  }

  // call recordings (manual)
  for (const r of recordings) {
    if (!byDate[r.report_date]) continue;
    const cell = byDate[r.report_date]?.[r.officer_user_id];
    if (!cell) continue;
    cell.callRecording = r.status || 'na';
  }

  return {
    startISO: start,
    endISO: end,
    days: dates,
    officers,
    byDate
  };
}

async function upsertLeadsSnapshot({ dateISO, officers }) {
  const sb = requireSupabase();
  const date = cleanString(dateISO);
  if (!date) throw Object.assign(new Error('dateISO is required'), { status: 400 });

  const counts = await computeNewLeadsCountsCurrent({ officers });

  const rows = (officers || []).map(o => ({
    snapshot_date: date,
    officer_user_id: o.id,
    new_leads_count: counts.get(o.id) || 0,
    meta: { source: 'crm_leads_status_new', generated_at: new Date().toISOString() }
  }));

  const { data, error } = await sb
    .from('daily_officer_leads_snapshot')
    .upsert(rows, { onConflict: 'snapshot_date,officer_user_id' })
    .select('snapshot_date, officer_user_id, new_leads_count');

  if (error) throw error;
  return data || [];
}

module.exports = {
  getDailyChecklist,
  upsertCallRecordingStatus,
  upsertLeadsSnapshot
};
