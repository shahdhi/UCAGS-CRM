/**
 * Attendance Service
 *
 * Stores daily check-in/check-out records in Supabase (attendance_records table).
 * One row per officer per day.
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

const SRI_LANKA_TZ = 'Asia/Colombo';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getSriLankaDateParts(d) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: SRI_LANKA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(d);
  const map = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return map;
}

function formatDateSriLanka(d) {
  const p = getSriLankaDateParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function formatTimeSriLanka(d) {
  const p = getSriLankaDateParts(d);
  return `${p.hour}:${p.minute}:${p.second}`;
}

function requireSb() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin client not available');
  return sb;
}

async function getUserId(officerName) {
  // Lookup user_id from auth.users by display name
  const sb = requireSb();
  const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
  if (error) throw error;
  const match = (users || []).find(u =>
    String(u.user_metadata?.name || '').trim().toLowerCase() === String(officerName || '').trim().toLowerCase()
  );
  return match?.id || null;
}

async function getTodayRecord(userId, dateStr) {
  const sb = requireSb();
  const { data, error } = await sb
    .from('attendance_records')
    .select('*')
    .eq('user_id', userId)
    .eq('date', dateStr)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function recordToResponse(row, locationRow) {
  if (!row) return null;
  return {
    date: row.date,
    checkIn: row.check_in || '',
    checkOut: row.check_out || '',
    checkInIso: row.check_in_iso || '',
    checkOutIso: row.check_out_iso || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    // Location comes from the attendance_locations table (may be null)
    locationConfirmedAt: locationRow?.confirmed_at || '',
    locationLat: locationRow?.lat != null ? String(locationRow.lat) : '',
    locationLng: locationRow?.lng != null ? String(locationRow.lng) : '',
    locationAccuracy: locationRow?.accuracy != null ? String(locationRow.accuracy) : ''
  };
}

// Kept for backward compat (routes call ensureStaffSheet on first use)
async function ensureStaffSheet(staffName) {
  return { created: false, sheetName: staffName };
}

async function getStaffRecords(officerName, { fromDate, toDate, limit } = {}) {
  const sb = requireSb();
  let query = sb
    .from('attendance_records')
    .select('*, attendance_locations(*)')
    .eq('officer_name', officerName)
    .order('date', { ascending: true });

  if (fromDate) query = query.gte('date', fromDate);
  if (toDate)   query = query.lte('date', toDate);
  if (limit)    query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(row => recordToResponse(row, row.attendance_locations?.[0] ?? null));
}

async function checkIn(staffName, now = new Date()) {
  const sb = requireSb();
  const userId = await getUserId(staffName);
  if (!userId) throw Object.assign(new Error('Officer account not found'), { status: 404 });

  const dateStr = formatDateSriLanka(now);
  const timeStr = formatTimeSriLanka(now);
  const nowIso = now.toISOString();

  const existing = await getTodayRecord(userId, dateStr);
  if (existing?.check_in) {
    throw Object.assign(new Error('Already checked in for today'), { status: 409 });
  }

  if (existing) {
    const { data, error } = await sb
      .from('attendance_records')
      .update({ check_in: timeStr, check_in_iso: nowIso, updated_at: nowIso })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return { date: dateStr, checkIn: timeStr, checkInIso: nowIso };
  }

  const { data, error } = await sb
    .from('attendance_records')
    .insert({
      user_id: userId,
      officer_name: staffName,
      date: dateStr,
      check_in: timeStr,
      check_in_iso: nowIso,
      created_at: nowIso,
      updated_at: nowIso
    })
    .select('*')
    .single();
  if (error) throw error;
  return { date: dateStr, checkIn: timeStr, checkInIso: nowIso };
}

async function checkOut(staffName, now = new Date()) {
  const sb = requireSb();
  const userId = await getUserId(staffName);
  if (!userId) throw Object.assign(new Error('Officer account not found'), { status: 404 });

  const dateStr = formatDateSriLanka(now);
  const timeStr = formatTimeSriLanka(now);
  const nowIso = now.toISOString();

  const existing = await getTodayRecord(userId, dateStr);
  if (!existing?.check_in) {
    throw Object.assign(new Error('No check-in found for today'), { status: 409 });
  }
  if (existing?.check_out) {
    throw Object.assign(new Error('Already checked out for today'), { status: 409 });
  }

  const { error } = await sb
    .from('attendance_records')
    .update({ check_out: timeStr, check_out_iso: nowIso, updated_at: nowIso })
    .eq('id', existing.id);
  if (error) throw error;
  return { date: dateStr, checkOut: timeStr, checkOutIso: nowIso };
}

async function getTodayStatus(staffName, now = new Date()) {
  const sb = requireSb();
  const userId = await getUserId(staffName);
  if (!userId) return { date: formatDateSriLanka(now), checkedIn: false, checkedOut: false, record: null };

  const dateStr = formatDateSriLanka(now);
  const row = await getTodayRecord(userId, dateStr);

  // Fetch location for today's record if it exists
  let locationRow = null;
  if (row?.id) {
    const { data: locData } = await sb
      .from('attendance_locations')
      .select('*')
      .eq('attendance_record_id', row.id)
      .maybeSingle();
    locationRow = locData || null;
  }

  const record = recordToResponse(row, locationRow);

  return {
    date: dateStr,
    checkedIn: !!(record?.checkIn),
    checkedOut: !!(record?.checkOut),
    record
  };
}

async function confirmLocation(staffName, { lat, lng, accuracy } = {}, now = new Date()) {
  const sb = requireSb();
  const userId = await getUserId(staffName);
  if (!userId) throw Object.assign(new Error('Officer account not found'), { status: 404 });

  if (lat == null || lng == null) {
    throw Object.assign(new Error('lat and lng are required'), { status: 400 });
  }

  const dateStr = formatDateSriLanka(now);
  const existing = await getTodayRecord(userId, dateStr);

  if (!existing?.check_in) {
    throw Object.assign(new Error('Please check in first'), { status: 409 });
  }

  // Check if location already confirmed for today (in attendance_locations table)
  const { data: existingLoc } = await sb
    .from('attendance_locations')
    .select('id')
    .eq('attendance_record_id', existing.id)
    .maybeSingle();

  if (existingLoc) {
    throw Object.assign(new Error('Location already confirmed for today'), { status: 409 });
  }

  const confirmedAtIso = now.toISOString();

  // Insert into the dedicated attendance_locations table
  const { error } = await sb
    .from('attendance_locations')
    .insert({
      attendance_record_id: existing.id,
      user_id: userId,
      officer_name: staffName,
      date: dateStr,
      lat,
      lng,
      accuracy: accuracy ?? null,
      confirmed_at: confirmedAtIso
    });
  if (error) throw error;

  return {
    date: dateStr,
    locationConfirmedAt: confirmedAtIso,
    locationLat: String(lat),
    locationLng: String(lng),
    locationAccuracy: accuracy != null ? String(accuracy) : ''
  };
}

module.exports = {
  ensureStaffSheet,
  getStaffRecords,
  checkIn,
  checkOut,
  confirmLocation,
  getTodayStatus,
  formatDateSriLanka
};
