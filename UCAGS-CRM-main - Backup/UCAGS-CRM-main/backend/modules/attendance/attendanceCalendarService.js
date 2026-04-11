/**
 * Attendance Calendar Summary
 *
 * Computes day statuses for an officer for a given month.
 * - present: has attendance record (checkin or checkout)
 * - leave: approved leave exists for date
 * - absent: no record and no approved leave, for dates <= today
 * - future: date > today
 */

const { getStaffRecords } = require('./attendanceService');
const { listLeaveRequests } = require('./leaveRequestsService');
const { listOverrides } = require('./adminAttendanceOverridesService');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

// Returns the officer's creation date as YYYY-MM-DD (Sri Lanka timezone), or null if not found.
async function getOfficerStartDate(officerName) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const { data: { users }, error } = await sb.auth.admin.listUsers();
    if (error || !users) return null;
    const match = users.find(u =>
      (u.user_metadata?.name || '').toLowerCase().trim() === String(officerName || '').toLowerCase().trim()
    );
    if (!match || !match.created_at) return null;
    // Convert to Asia/Colombo date
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isYm(s) {
  return /^\d{4}-\d{2}$/.test(String(s || ''));
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function toYmd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayYmdSriLanka(now = new Date()) {
  // Mirror attendanceService Asia/Colombo date logic using Intl
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = dtf.formatToParts(now);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

async function getOfficerMonthCalendar({ officerName, month }) {
  if (!officerName) throw new Error('officerName is required');
  if (!isYm(month)) throw new Error('month must be YYYY-MM');

  const [y, m] = month.split('-').map(n => Number(n));
  const count = daysInMonth(y, m);

  const from = `${month}-01`;
  const to = `${month}-${pad2(count)}`;

  // Officer's account creation date — dates before this are shown as 'before_start'
  const officerStartDate = await getOfficerStartDate(officerName);

  // Attendance rows for the month
  const records = await getStaffRecords(officerName, { fromDate: from, toDate: to });
  const presentSet = new Set(
    (records || [])
      .filter(r => r.date)
      .filter(r => r.checkIn || r.checkOut)
      .map(r => r.date)
  );

  // Approved leave requests for the month
  const approvedLeaves = await listLeaveRequests({ officerName, status: 'approved', fromDate: from, toDate: to });
  const leaveSet = new Set((approvedLeaves || []).map(r => r.leave_date));

  const today = todayYmdSriLanka(new Date());

  // Manual overrides (admin-adjusted statuses)
  let overrideMap = new Map();
  try {
    const overrides = await listOverrides({ officerName, fromDate: from, toDate: to });
    overrideMap = new Map((overrides || []).map(o => [o.date, o.status]));
  } catch (e) {
    // Non-fatal (if sheet tab missing etc.)
  }

  const days = [];
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${pad2(d)}`;

    let status = 'absent';
    if (date > today) status = 'future';
    else if (officerStartDate && date < officerStartDate) status = 'before_start';
    else if (presentSet.has(date)) status = 'present';
    else if (leaveSet.has(date)) status = 'leave';

    const o = overrideMap.get(date);
    // Only allow overrides on dates on or after the officer's start date.
    // Holiday overrides do NOT override an actual check-in — if the officer
    // checked in on a holiday they are marked present.
    if (o && ['present', 'absent', 'leave', 'holiday'].includes(String(o)) && status !== 'before_start') {
      if (String(o) === 'holiday' && presentSet.has(date)) {
        // Officer actually checked in — keep as present
      } else {
        status = String(o);
      }
    }

    days.push({ date, status });
  }

  return { month, officerName, from, to, today, officerStartDate, days };
}

module.exports = {
  getOfficerMonthCalendar
};
