/**
 * Admin monthly attendance summary
 */

const { getSpreadsheetInfo } = require('../../core/sheets/sheetsClient');
const { getAttendanceSheetId } = require('../../core/config/appSettings');
const { getOfficerMonthCalendar } = require('./attendanceCalendarService');

function isYm(s) {
  return /^\d{4}-\d{2}$/.test(String(s || ''));
}

async function listOfficerSheets(spreadsheetId) {
  const info = await getSpreadsheetInfo(spreadsheetId);
  const titles = (info.sheets || []).map(s => s.properties.title).filter(Boolean);
  return titles.filter(t => t !== 'LeaveRequests' && t !== 'Sheet1' && !t.startsWith('_'));
}

async function getAdminMonthSummary({ month }) {
  if (!isYm(month)) throw new Error('month must be YYYY-MM');

  const spreadsheetId = await getAttendanceSheetId();
  if (!spreadsheetId) {
    return { month, officers: [] };
  }

  const officerNames = await listOfficerSheets(spreadsheetId);
  const results = [];

  for (const officerName of officerNames) {
    try {
      const cal = await getOfficerMonthCalendar({ officerName, month });
      const considered = (cal.days || []).filter(d => d.date <= cal.today);
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
  getAdminMonthSummary
};
