/**
 * Attendance Service
 *
 * Stores daily check-in/check-out records in a dedicated Google Spreadsheet.
 * Rule: Each staff member has their own sheet (sheet name = staff display name).
 */

const { readSheet, appendSheet, writeSheet, sheetExists, createSheet } = require('../../core/sheets/sheetsClient');
const { config } = require('../../core/config/environment');

const ATT_HEADERS = [
  'Date',
  'Check In',
  'Check Out',
  'Check In (ISO)',
  'Check Out (ISO)',
  'Created At (ISO)',
  'Updated At (ISO)'
];

function requireAttendanceSheetId() {
  const spreadsheetId = config.sheets.attendanceSheetId;
  if (!spreadsheetId) {
    throw new Error('Attendance spreadsheet not configured. Set ATTENDANCE_SHEET_ID');
  }
  return spreadsheetId;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateLocal(d) {
  // YYYY-MM-DD in server local time
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatTimeLocal(d) {
  // HH:MM:SS in server local time
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

async function ensureStaffSheet(staffName) {
  const spreadsheetId = requireAttendanceSheetId();
  if (!staffName) throw new Error('staffName is required');

  const existing = await sheetExists(spreadsheetId, staffName);
  const actualName = existing || staffName;

  if (!existing) {
    await createSheet(spreadsheetId, staffName);
    await writeSheet(spreadsheetId, `${staffName}!A1:G1`, [ATT_HEADERS]);
    return { created: true, sheetName: staffName };
  }

  // Ensure headers exist (safe no-op if present)
  const headers = await readSheet(spreadsheetId, `${actualName}!A1:G1`);
  if (!headers || headers.length === 0 || (headers[0] || []).join('|') !== ATT_HEADERS.join('|')) {
    await writeSheet(spreadsheetId, `${actualName}!A1:G1`, [ATT_HEADERS]);
  }

  return { created: false, sheetName: actualName };
}

async function getStaffRecords(staffName, { fromDate, toDate, limit } = {}) {
  const spreadsheetId = requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const rows = await readSheet(spreadsheetId, `${sheetName}!A2:G`);
  const records = (rows || []).map((row) => ({
    date: row[0] || '',
    checkIn: row[1] || '',
    checkOut: row[2] || '',
    checkInIso: row[3] || '',
    checkOutIso: row[4] || '',
    createdAt: row[5] || '',
    updatedAt: row[6] || ''
  }));

  let filtered = records;
  if (fromDate) filtered = filtered.filter(r => r.date >= fromDate);
  if (toDate) filtered = filtered.filter(r => r.date <= toDate);
  if (limit) filtered = filtered.slice(Math.max(filtered.length - limit, 0));

  return filtered;
}

async function findRowIndexByDate(staffName, dateStr) {
  const spreadsheetId = requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const rows = await readSheet(spreadsheetId, `${sheetName}!A2:A`);
  const idx = (rows || []).findIndex(r => (r[0] || '') === dateStr);
  if (idx === -1) return { sheetName, rowNumber: null };
  return { sheetName, rowNumber: idx + 2 }; // +2 for header + 0-based
}

async function checkIn(staffName, now = new Date()) {
  const spreadsheetId = requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const dateStr = formatDateLocal(now);
  const timeStr = formatTimeLocal(now);
  const nowIso = now.toISOString();

  const { rowNumber } = await findRowIndexByDate(staffName, dateStr);
  if (rowNumber) {
    // Existing record for today: ensure check-in not set
    const existing = await readSheet(spreadsheetId, `${sheetName}!A${rowNumber}:G${rowNumber}`);
    const row = (existing && existing[0]) || [];
    if (row[1]) {
      const err = new Error('Already checked in for today');
      err.status = 409;
      throw err;
    }

    const updated = [
      dateStr,
      timeStr,
      row[2] || '',
      nowIso,
      row[4] || '',
      row[5] || nowIso,
      nowIso
    ];
    await writeSheet(spreadsheetId, `${sheetName}!A${rowNumber}:G${rowNumber}`, [updated]);
    return { date: dateStr, checkIn: timeStr, checkInIso: nowIso };
  }

  const newRow = [dateStr, timeStr, '', nowIso, '', nowIso, nowIso];
  await appendSheet(spreadsheetId, `${sheetName}!A:G`, [newRow]);
  return { date: dateStr, checkIn: timeStr, checkInIso: nowIso };
}

async function checkOut(staffName, now = new Date()) {
  const spreadsheetId = requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const dateStr = formatDateLocal(now);
  const timeStr = formatTimeLocal(now);
  const nowIso = now.toISOString();

  const { rowNumber } = await findRowIndexByDate(staffName, dateStr);
  if (!rowNumber) {
    const err = new Error('No check-in found for today');
    err.status = 409;
    throw err;
  }

  const existing = await readSheet(spreadsheetId, `${sheetName}!A${rowNumber}:G${rowNumber}`);
  const row = (existing && existing[0]) || [];

  if (!row[1]) {
    const err = new Error('No check-in found for today');
    err.status = 409;
    throw err;
  }
  if (row[2]) {
    const err = new Error('Already checked out for today');
    err.status = 409;
    throw err;
  }

  const updated = [
    row[0] || dateStr,
    row[1] || '',
    timeStr,
    row[3] || '',
    nowIso,
    row[5] || row[3] || nowIso,
    nowIso
  ];

  await writeSheet(spreadsheetId, `${sheetName}!A${rowNumber}:G${rowNumber}`, [updated]);
  return { date: dateStr, checkOut: timeStr, checkOutIso: nowIso };
}

async function getTodayStatus(staffName, now = new Date()) {
  const spreadsheetId = requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const dateStr = formatDateLocal(now);
  const { rowNumber } = await findRowIndexByDate(staffName, dateStr);
  if (!rowNumber) {
    return { date: dateStr, checkedIn: false, checkedOut: false, record: null };
  }

  const existing = await readSheet(spreadsheetId, `${sheetName}!A${rowNumber}:G${rowNumber}`);
  const row = (existing && existing[0]) || [];

  const record = {
    date: row[0] || dateStr,
    checkIn: row[1] || '',
    checkOut: row[2] || '',
    checkInIso: row[3] || '',
    checkOutIso: row[4] || '',
    createdAt: row[5] || '',
    updatedAt: row[6] || ''
  };

  return {
    date: dateStr,
    checkedIn: !!record.checkIn,
    checkedOut: !!record.checkOut,
    record
  };
}

module.exports = {
  ATT_HEADERS,
  ensureStaffSheet,
  getStaffRecords,
  checkIn,
  checkOut,
  getTodayStatus
};
