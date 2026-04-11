/**
 * Admin Attendance Overrides Service
 *
 * Stores manual day status adjustments in Supabase (attendance_overrides table).
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

const VALID_STATUSES = ['present', 'absent', 'leave', 'holiday'];

function requireSb() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin client not available');
  return sb;
}

function isYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function rowToObj(row) {
  return {
    officer_name: row.officer_name,
    date: row.date,
    status: row.status,
    updated_by: row.updated_by || '',
    updated_at: row.updated_at || ''
  };
}

async function listOverrides({ officerName, fromDate, toDate } = {}) {
  const sb = requireSb();
  let query = sb
    .from('attendance_overrides')
    .select('*')
    .order('updated_at', { ascending: false });

  if (officerName) query = query.eq('officer_name', officerName);
  if (fromDate)    query = query.gte('date', fromDate);
  if (toDate)      query = query.lte('date', toDate);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToObj);
}

async function upsertOverride({ officerName, date, status, updatedBy }) {
  if (!officerName) throw new Error('officerName is required');
  if (!isYmd(date)) throw new Error('date must be YYYY-MM-DD');
  if (!VALID_STATUSES.includes(String(status))) {
    throw new Error('status must be present|absent|leave|holiday');
  }

  const sb = requireSb();
  const nowIso = new Date().toISOString();

  const { data, error } = await sb
    .from('attendance_overrides')
    .upsert({
      officer_name: officerName,
      date,
      status,
      updated_by: updatedBy || '',
      updated_at: nowIso
    }, { onConflict: 'officer_name,date' })
    .select('*')
    .single();

  if (error) throw error;
  return { created: true, record: rowToObj(data) };
}

module.exports = {
  listOverrides,
  upsertOverride
};
