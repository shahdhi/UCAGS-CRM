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
  'Updated At (ISO)',
  'Location Confirmed At (ISO)',
  'Location Lat',
  'Location Lng',
  'Location Accuracy (m)'
];

const ATT_COL_COUNT = ATT_HEADERS.length; // 11

// Google Sheets may auto-coerce values into date/time serial numbers depending on cell format.
// To keep Date + CheckIn/Out stable and human-readable, we write them as TEXT (prefix with apostrophe)
// and we also normalize reads in case older rows already got coerced.
function isNumericLike(v) {
  if (v == null) return false;
  if (typeof v === 'number') return true;
  const s = String(v).trim();
  return s !== '' && /^-?\d+(\.\d+)?$/.test(s);
}

function serialDateToYMD(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return '';
  // Google Sheets serial date: days since 1899-12-30
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

function serialTimeToHMS(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return '';
  // time-only cells are often fractional days
  const frac = n % 1;
  const totalSeconds = Math.round(frac * 86400);
  const hh = pad2(Math.floor(totalSeconds / 3600) % 24);
  const mm = pad2(Math.floor((totalSeconds % 3600) / 60));
  const ss = pad2(totalSeconds % 60);
  return `${hh}:${mm}:${ss}`;
}

function normalizeDateCell(v) {
  if (!v) return '';
  if (isNumericLike(v)) return serialDateToYMD(v);
  return String(v).trim();
}

function normalizeTimeCell(v) {
  if (!v) return '';
  if (isNumericLike(v)) return serialTimeToHMS(v);
  return String(v).trim();
}

function asTextCell(v) {
  if (!v) return '';
  const s = String(v);
  // If already text-forced, keep it
  if (s.startsWith("'")) return s;
  return `'${s}`;
}

async function requireAttendanceSheetId() {
  const { getAttendanceSheetId } = require('../../core/config/appSettings');
  const spreadsheetId = await getAttendanceSheetId();
  if (!spreadsheetId) {
    throw new Error('Attendance spreadsheet not configured. Set Supabase app_settings.attendance_sheet_id or ATTENDANCE_SHEET_ID');
  }
  return spreadsheetId;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

const SRI_LANKA_TZ = 'Asia/Colombo';

function getSriLankaDateParts(d) {
  // Use Intl to avoid relying on server timezone.
  // Returns { year, month, day, hour, minute, second } in Asia/Colombo.
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: SRI_LANKA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = dtf.formatToParts(d);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second
  };
}

function formatDateSriLanka(d) {
  const p = getSriLankaDateParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function formatTimeSriLanka(d) {
  const p = getSriLankaDateParts(d);
  return `${p.hour}:${p.minute}:${p.second}`;
}

async function ensureStaffSheet(staffName) {
  const spreadsheetId = await requireAttendanceSheetId();
  if (!staffName) throw new Error('staffName is required');

  const existing = await sheetExists(spreadsheetId, staffName);
  const actualName = existing || staffName;

  if (!existing) {
    await createSheet(spreadsheetId, staffName);
    await writeSheet(spreadsheetId, `${staffName}!A1:K1`, [ATT_HEADERS]);
    return { created: true, sheetName: staffName };
  }

  // Ensure headers exist (safe no-op if present)
  const headers = await readSheet(spreadsheetId, `${actualName}!A1:K1`);
  if (!headers || headers.length === 0 || (headers[0] || []).join('|') !== ATT_HEADERS.join('|')) {
    await writeSheet(spreadsheetId, `${actualName}!A1:K1`, [ATT_HEADERS]);
  }

  return { created: false, sheetName: actualName };
}

async function getStaffRecords(staffName, { fromDate, toDate, limit } = {}) {
  const spreadsheetId = await requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const rows = await readSheet(spreadsheetId, `${sheetName}!A2:K`);
  const records = (rows || []).map((row) => ({
    date: normalizeDateCell(row[0]),
    checkIn: normalizeTimeCell(row[1]),
    checkOut: normalizeTimeCell(row[2]),
    checkInIso: row[3] || '',
    checkOutIso: row[4] || '',
    createdAt: row[5] || '',
    updatedAt: row[6] || '',
    locationConfirmedAt: row[7] || '',
    locationLat: row[8] || '',
    locationLng: row[9] || '',
    locationAccuracy: row[10] || ''
  }));

  let filtered = records;
  if (fromDate) filtered = filtered.filter(r => r.date >= fromDate);
  if (toDate) filtered = filtered.filter(r => r.date <= toDate);
  if (limit) filtered = filtered.slice(Math.max(filtered.length - limit, 0));

  return filtered;
}

async function findRowIndexByDate(staffName, dateStr) {
  const spreadsheetId = await requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const rows = await readSheet(spreadsheetId, `${sheetName}!A2:A`);
  const idx = (rows || []).findIndex(r => normalizeDateCell(r[0]) === dateStr);
  if (idx === -1) return { sheetName, rowNumber: null };
  return { sheetName, rowNumber: idx + 2 }; // +2 for header + 0-based
}

async function checkIn(staffName, now = new Date()) {
  const spreadsheetId = await requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const dateStr = formatDateSriLanka(now);
  const timeStr = formatTimeSriLanka(now);
  const nowIso = now.toISOString();

  const { rowNumber } = await findRowIndexByDate(staffName, dateStr);
  if (rowNumber) {
    // Existing record for today: ensure check-in not set
    const existing = await readSheet(spreadsheetId, `${sheetName}!A${rowNumber}:K${rowNumber}`);
    const row = (existing && existing[0]) || [];
    if (row[1]) {
      const err = new Error('Already checked in for today');
      err.status = 409;
      throw err;
    }

    const updated = [
      asTextCell(dateStr),
      asTextCell(timeStr),
      row[2] ? asTextCell(normalizeTimeCell(row[2])) : '',
      nowIso,
      row[4] || '',
      row[5] || nowIso,
      nowIso,
      row[7] || '',
      row[8] || '',
      row[9] || '',
      row[10] || ''
    ];
    await writeSheet(spreadsheetId, `${sheetName}!A${rowNumber}:K${rowNumber}`, [updated]);
    return { date: dateStr, checkIn: timeStr, checkInIso: nowIso };
  }

  const newRow = [asTextCell(dateStr), asTextCell(timeStr), '', nowIso, '', nowIso, nowIso, '', '', '', ''];
  await appendSheet(spreadsheetId, `${sheetName}!A:K`, [newRow]);
  return { date: dateStr, checkIn: timeStr, checkInIso: nowIso };
}

async function checkOut(staffName, now = new Date()) {
  const spreadsheetId = await requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const dateStr = formatDateSriLanka(now);
  const timeStr = formatTimeSriLanka(now);
  const nowIso = now.toISOString();

  const { rowNumber } = await findRowIndexByDate(staffName, dateStr);
  if (!rowNumber) {
    const err = new Error('No check-in found for today');
    err.status = 409;
    throw err;
  }

  const existing = await readSheet(spreadsheetId, `${sheetName}!A${rowNumber}:K${rowNumber}`);
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
    asTextCell(normalizeDateCell(row[0]) || dateStr),
    row[1] ? asTextCell(normalizeTimeCell(row[1])) : '',
    asTextCell(timeStr),
    row[3] || '',
    nowIso,
    row[5] || row[3] || nowIso,
    nowIso,
    row[7] || '',
    row[8] || '',
    row[9] || '',
    row[10] || ''
  ];

  await writeSheet(spreadsheetId, `${sheetName}!A${rowNumber}:K${rowNumber}`, [updated]);
  return { date: dateStr, checkOut: timeStr, checkOutIso: nowIso };
}

async function getTodayStatus(staffName, now = new Date()) {
  const spreadsheetId = await requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const dateStr = formatDateSriLanka(now);
  const { rowNumber } = await findRowIndexByDate(staffName, dateStr);
  if (!rowNumber) {
    return { date: dateStr, checkedIn: false, checkedOut: false, record: null };
  }

  const existing = await readSheet(spreadsheetId, `${sheetName}!A${rowNumber}:K${rowNumber}`);
  const row = (existing && existing[0]) || [];

  const record = {
    date: normalizeDateCell(row[0]) || dateStr,
    checkIn: normalizeTimeCell(row[1]),
    checkOut: normalizeTimeCell(row[2]),
    checkInIso: row[3] || '',
    checkOutIso: row[4] || '',
    createdAt: row[5] || '',
    updatedAt: row[6] || '',
    locationConfirmedAt: row[7] || '',
    locationLat: row[8] || '',
    locationLng: row[9] || '',
    locationAccuracy: row[10] || ''
  };

  return {
    date: dateStr,
    checkedIn: !!record.checkIn,
    checkedOut: !!record.checkOut,
    record
  };
}

async function confirmLocation(staffName, { lat, lng, accuracy } = {}, now = new Date()) {
  const spreadsheetId = await requireAttendanceSheetId();
  const { sheetName } = await ensureStaffSheet(staffName);

  const dateStr = formatDateSriLanka(now);
  const { rowNumber } = await findRowIndexByDate(staffName, dateStr);
  if (!rowNumber) {
    const err = new Error('No attendance record found for today');
    err.status = 409;
    throw err;
  }

  const existing = await readSheet(spreadsheetId, `${sheetName}!A${rowNumber}:K${rowNumber}`);
  const row = (existing && existing[0]) || [];

  if (!row[1]) {
    const err = new Error('Please check in first');
    err.status = 409;
    throw err;
  }

  // If already confirmed, block duplicate confirm
  if (row[7] || row[8] || row[9]) {
    const err = new Error('Location already confirmed for today');
    err.status = 409;
    throw err;
  }

  if (lat == null || lng == null) {
    const err = new Error('lat and lng are required');
    err.status = 400;
    throw err;
  }

  const confirmedAtIso = now.toISOString();
  const updated = [
    row[0] ? asTextCell(normalizeDateCell(row[0])) : asTextCell(dateStr),
    row[1] ? asTextCell(normalizeTimeCell(row[1])) : '',
    row[2] ? asTextCell(normalizeTimeCell(row[2])) : '',
    row[3] || '',
    row[4] || '',
    row[5] || confirmedAtIso,
    confirmedAtIso,
    confirmedAtIso,
    String(lat),
    String(lng),
    accuracy != null ? String(accuracy) : ''
  ];

  await writeSheet(spreadsheetId, `${sheetName}!A${rowNumber}:K${rowNumber}`, [updated]);

  return {
    date: dateStr,
    locationConfirmedAt: confirmedAtIso,
    locationLat: String(lat),
    locationLng: String(lng),
    locationAccuracy: accuracy != null ? String(accuracy) : ''
  };
}

module.exports = {
  ATT_HEADERS,
  ensureStaffSheet,
  getStaffRecords,
  checkIn,
  checkOut,
  confirmLocation,
  getTodayStatus
};
