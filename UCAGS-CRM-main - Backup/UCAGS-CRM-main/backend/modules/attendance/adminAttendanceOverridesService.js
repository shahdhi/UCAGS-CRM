/**
 * Admin Attendance Overrides
 *
 * Stores manual day status adjustments in the Attendance Spreadsheet.
 * Tab: AttendanceOverrides
 *
 * Columns:
 *  - officer_name
 *  - date (YYYY-MM-DD)
 *  - status (present|absent|leave)
 *  - updated_by
 *  - updated_at (ISO)
 */

const { readSheet, writeSheet, appendSheet, sheetExists, createSheet } = require('../../core/sheets/sheetsClient');
const { getAttendanceSheetId } = require('../../core/config/appSettings');

const TAB = 'AttendanceOverrides';
const HEADERS = ['officer_name', 'date', 'status', 'updated_by', 'updated_at'];

function isYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

async function requireAttendanceSheetId() {
  const spreadsheetId = await getAttendanceSheetId();
  if (!spreadsheetId) throw new Error('Attendance spreadsheet not configured');
  return spreadsheetId;
}

async function ensureOverridesTab() {
  const spreadsheetId = await requireAttendanceSheetId();
  const existing = await sheetExists(spreadsheetId, TAB);
  if (!existing) {
    await createSheet(spreadsheetId, TAB);
    await writeSheet(spreadsheetId, `${TAB}!A1:E1`, [HEADERS]);
    return { created: true };
  }

  const headerRow = await readSheet(spreadsheetId, `${TAB}!A1:E1`);
  const current = (headerRow && headerRow[0]) || [];
  if (current.join('|') !== HEADERS.join('|')) {
    await writeSheet(spreadsheetId, `${TAB}!A1:E1`, [HEADERS]);
  }

  return { created: false };
}

function rowToObj(row) {
  return {
    officer_name: row[0] || '',
    date: row[1] || '',
    status: row[2] || '',
    updated_by: row[3] || '',
    updated_at: row[4] || ''
  };
}

function objToRow(obj) {
  return [
    obj.officer_name,
    obj.date,
    obj.status,
    obj.updated_by || '',
    obj.updated_at || ''
  ];
}

async function listOverrides({ officerName, fromDate, toDate } = {}) {
  const spreadsheetId = await requireAttendanceSheetId();
  await ensureOverridesTab();

  const rows = await readSheet(spreadsheetId, `${TAB}!A2:E`);
  let list = (rows || []).map(rowToObj).filter(r => r.officer_name && r.date);

  if (officerName) list = list.filter(r => r.officer_name === officerName);
  if (fromDate) list = list.filter(r => String(r.date) >= String(fromDate));
  if (toDate) list = list.filter(r => String(r.date) <= String(toDate));

  // latest first
  list.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return list;
}

async function upsertOverride({ officerName, date, status, updatedBy }) {
  if (!officerName) throw new Error('officerName is required');
  if (!isYmd(date)) throw new Error('date must be YYYY-MM-DD');
  if (!['present', 'absent', 'leave', 'holiday'].includes(String(status))) {
    throw new Error('status must be present|absent|leave|holiday');
  }

  const spreadsheetId = await requireAttendanceSheetId();
  await ensureOverridesTab();

  const rows = await readSheet(spreadsheetId, `${TAB}!A2:E`);
  const list = (rows || []).map(rowToObj);
  const idx = list.findIndex(r => r.officer_name === officerName && r.date === date);

  const nowIso = new Date().toISOString();
  const updated = {
    officer_name: officerName,
    date,
    status,
    updated_by: updatedBy || '',
    updated_at: nowIso
  };

  if (idx === -1) {
    await appendSheet(spreadsheetId, `${TAB}!A:E`, [objToRow(updated)]);
    return { created: true, record: updated };
  }

  // Row number offset (+2 for header)
  const rowNumber = idx + 2;
  await writeSheet(spreadsheetId, `${TAB}!A${rowNumber}:E${rowNumber}`, [objToRow(updated)]);
  return { created: false, record: updated };
}

module.exports = {
  TAB,
  HEADERS,
  ensureOverridesTab,
  listOverrides,
  upsertOverride
};
