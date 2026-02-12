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

  const days = [];
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${pad2(d)}`;

    let status = 'absent';
    if (date > today) status = 'future';
    else if (presentSet.has(date)) status = 'present';
    else if (leaveSet.has(date)) status = 'leave';

    days.push({ date, status });
  }

  return { month, officerName, from, to, today, days };
}

module.exports = {
  getOfficerMonthCalendar
};
