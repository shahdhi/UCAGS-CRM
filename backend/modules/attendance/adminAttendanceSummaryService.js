/**
 * Admin monthly attendance summary
 *
 * Reads from Supabase (attendance_records, leave_requests, attendance_overrides).
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { getOfficerMonthCalendar } = require('./attendanceCalendarService');

function isYm(s) {
  return /^\d{4}-\d{2}$/.test(String(s || ''));
}

async function listAllOfficers() {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
  if (error || !users) return [];
  return users
    .filter(u => u.user_metadata?.role === 'officer' || u.user_metadata?.role === 'admin')
    .map(u => u.user_metadata?.name || u.email)
    .filter(Boolean);
}

async function getAdminMonthSummary({ month }) {
  if (!isYm(month)) throw new Error('month must be YYYY-MM');

  const officerNames = await listAllOfficers();
  const results = [];

  for (const officerName of officerNames) {
    try {
      const cal = await getOfficerMonthCalendar({ officerName, month });
      const considered = (cal.days || []).filter(d => d.date <= cal.today && d.status !== 'before_start' && d.status !== 'future');
      const presentish = considered.filter(d => d.status === 'present' || d.status === 'leave').length;
      const denom = considered.length || 0;
      const pct = denom ? Math.round((presentish / denom) * 100) : 0;
      results.push({ officerName, percentage: pct, presentDays: presentish, totalDays: denom });
    } catch (e) {
      results.push({ officerName, percentage: 0, presentDays: 0, totalDays: 0, error: e.message });
    }
  }

  results.sort((a, b) => a.officerName.localeCompare(b.officerName));
  return { month, officers: results };
}

module.exports = {
  getAdminMonthSummary,
  listAllOfficers
};
