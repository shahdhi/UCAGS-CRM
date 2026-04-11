/**
 * Attendance Calendar Summary
 *
 * Computes day statuses for an officer for a given month.
 * Reads from Supabase (attendance_records, leave_requests, attendance_overrides).
 *
 * Status values:
 *  - present      : has attendance record (checkin or checkout)
 *  - leave        : approved leave exists
 *  - absent       : no record, no approved leave, date <= today and >= officer start date
 *  - holiday      : admin-marked holiday
 *  - future       : date > today
 *  - before_start : date before officer's account creation date
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

const SRI_LANKA_TZ = 'Asia/Colombo';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isYm(s) {
  return /^\d{4}-\d{2}$/.test(String(s || ''));
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function todayYmdSriLanka(now = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: SRI_LANKA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = dtf.formatToParts(now);
  const map = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

async function getOfficerStartDate(officerName) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
    if (error || !users) return null;
    const match = users.find(u =>
      String(u.user_metadata?.name || '').toLowerCase().trim() === String(officerName || '').toLowerCase().trim()
    );
    if (!match?.created_at) return null;
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: SRI_LANKA_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const parts = dtf.formatToParts(new Date(match.created_at));
    const map = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
    return `${map.year}-${map.month}-${map.day}`;
  } catch (_) {
    return null;
  }
}

async function getOfficerMonthCalendar({ officerName, month }) {
  if (!officerName) throw new Error('officerName is required');
  if (!isYm(month)) throw new Error('month must be YYYY-MM');

  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin client not available');

  const [y, m] = month.split('-').map(Number);
  const count = daysInMonth(y, m);
  const from = `${month}-01`;
  const to = `${month}-${pad2(count)}`;

  const today = todayYmdSriLanka(new Date());
  const officerStartDate = await getOfficerStartDate(officerName);

  // Fetch attendance records for the month
  const { data: records, error: recErr } = await sb
    .from('attendance_records')
    .select('date, check_in, check_out')
    .eq('officer_name', officerName)
    .gte('date', from)
    .lte('date', to);
  if (recErr) throw recErr;

  const presentSet = new Set(
    (records || [])
      .filter(r => r.check_in || r.check_out)
      .map(r => r.date)
  );

  // Fetch approved leave requests for the month
  const { data: leaves, error: leaveErr } = await sb
    .from('leave_requests')
    .select('leave_date')
    .eq('officer_name', officerName)
    .eq('status', 'approved')
    .gte('leave_date', from)
    .lte('leave_date', to);
  if (leaveErr) throw leaveErr;

  const leaveSet = new Set((leaves || []).map(r => r.leave_date));

  // Fetch overrides for the month
  const { data: overrides, error: ovErr } = await sb
    .from('attendance_overrides')
    .select('date, status')
    .eq('officer_name', officerName)
    .gte('date', from)
    .lte('date', to);
  if (ovErr) throw ovErr;

  const overrideMap = new Map((overrides || []).map(o => [o.date, o.status]));

  const days = [];
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${pad2(d)}`;

    let status = 'absent';
    if (date > today) status = 'future';
    else if (officerStartDate && date < officerStartDate) status = 'before_start';
    else if (presentSet.has(date)) status = 'present';
    else if (leaveSet.has(date)) status = 'leave';

    // Apply override (holidays don't override actual check-ins)
    const override = overrideMap.get(date);
    if (override && ['present', 'absent', 'leave', 'holiday'].includes(override) && status !== 'before_start') {
      if (override === 'holiday' && presentSet.has(date)) {
        // Officer actually checked in on holiday — keep as present
      } else {
        status = override;
      }
    }

    days.push({ date, status });
  }

  return { month, officerName, from, to, today, officerStartDate, days };
}

module.exports = {
  getOfficerMonthCalendar
};
