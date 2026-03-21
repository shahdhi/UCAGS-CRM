/**
 * Leave Requests Service (stored in Attendance Spreadsheet)
 *
 * Uses a shared tab "LeaveRequests" inside the attendance spreadsheet.
 */

const { readSheet, writeSheet, appendSheet, sheetExists, createSheet } = require('../../core/sheets/sheetsClient');

const TAB = 'LeaveRequests';
const HEADERS = [
  'id',
  'officer_name',
  'leave_date',
  'leave_type', // full_day|morning|afternoon
  'reason',
  'status', // pending|approved|rejected
  'admin_name',
  'admin_comment',
  'created_at',
  'decided_at'
];

async function requireAttendanceSheetId() {
  const { getAttendanceSheetId } = require('../../core/config/appSettings');
  const spreadsheetId = await getAttendanceSheetId();
  if (!spreadsheetId) {
    throw new Error('Attendance spreadsheet not configured');
  }
  return spreadsheetId;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function generateId() {
  return `LR-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function ensureLeaveRequestsTab() {
  const spreadsheetId = await requireAttendanceSheetId();

  const existing = await sheetExists(spreadsheetId, TAB);
  if (!existing) {
    await createSheet(spreadsheetId, TAB);
    await writeSheet(spreadsheetId, `${TAB}!A1:J1`, [HEADERS]);
    return { created: true };
  }

  const headerRow = await readSheet(spreadsheetId, `${TAB}!A1:J1`);
  const current = (headerRow && headerRow[0]) || [];
  if (current.join('|') !== HEADERS.join('|')) {
    await writeSheet(spreadsheetId, `${TAB}!A1:J1`, [HEADERS]);
  }

  return { created: false };
}

function rowToObj(row) {
  // Detect legacy rows (9 cols, no leave_type column) vs new rows (10 cols with leave_type).
  // Legacy rows: row[3] is reason (free text), row[4] is status (pending|approved|rejected).
  // New rows:    row[3] is leave_type (full_day|morning|afternoon), row[4] is reason, row[5] is status.
  const STATUSES = ['pending', 'approved', 'rejected'];
  const LEAVE_TYPES = ['full_day', 'morning', 'afternoon'];
  const isLegacy = STATUSES.includes(row[4] || '') && !LEAVE_TYPES.includes(row[3] || '');

  if (isLegacy) {
    return {
      id: row[0] || '',
      officer_name: row[1] || '',
      leave_date: row[2] || '',
      leave_type: 'full_day',
      reason: row[3] || '',
      status: row[4] || 'pending',
      admin_name: row[5] || '',
      admin_comment: row[6] || '',
      created_at: row[7] || '',
      decided_at: row[8] || ''
    };
  }

  return {
    id: row[0] || '',
    officer_name: row[1] || '',
    leave_date: row[2] || '',
    leave_type: row[3] || 'full_day',
    reason: row[4] || '',
    status: row[5] || 'pending',
    admin_name: row[6] || '',
    admin_comment: row[7] || '',
    created_at: row[8] || '',
    decided_at: row[9] || ''
  };
}

function objToRow(obj) {
  return [
    obj.id,
    obj.officer_name,
    obj.leave_date,
    obj.leave_type || 'full_day',
    obj.reason || '',
    obj.status || 'pending',
    obj.admin_name || '',
    obj.admin_comment || '',
    obj.created_at || '',
    obj.decided_at || ''
  ];
}

async function listLeaveRequests({ officerName, status, fromDate, toDate } = {}) {
  const spreadsheetId = await requireAttendanceSheetId();
  await ensureLeaveRequestsTab();

  const rows = await readSheet(spreadsheetId, `${TAB}!A2:J`);
  let list = (rows || []).map(rowToObj).filter(r => r.id);

  if (officerName) list = list.filter(r => r.officer_name === officerName);
  if (status) list = list.filter(r => r.status === status);
  if (fromDate) list = list.filter(r => String(r.leave_date) >= fromDate);
  if (toDate) list = list.filter(r => String(r.leave_date) <= toDate);

  // Most recent first
  list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return list;
}

const VALID_LEAVE_TYPES = ['full_day', 'morning', 'afternoon'];

async function submitLeaveRequest({ officerName, leaveDate, leaveType, reason }) {
  if (!officerName) throw new Error('officerName is required');
  if (!isYmd(leaveDate)) throw new Error('leaveDate must be YYYY-MM-DD');
  if (!reason || !String(reason).trim()) throw new Error('reason is required');

  const normalizedLeaveType = VALID_LEAVE_TYPES.includes(leaveType) ? leaveType : 'full_day';

  const spreadsheetId = await requireAttendanceSheetId();
  await ensureLeaveRequestsTab();

  // Prevent duplicate pending/approved request for same date + type
  const existing = await listLeaveRequests({ officerName, fromDate: leaveDate, toDate: leaveDate });
  const dup = existing.find(r =>
    r.leave_date === leaveDate &&
    (r.status === 'pending' || r.status === 'approved') &&
    (r.leave_type === normalizedLeaveType || r.leave_type === 'full_day' || normalizedLeaveType === 'full_day')
  );
  if (dup) {
    const err = new Error('Leave request already exists for that date/period');
    err.status = 409;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const obj = {
    id: generateId(),
    officer_name: officerName,
    leave_date: leaveDate,
    leave_type: normalizedLeaveType,
    reason: String(reason).trim(),
    status: 'pending',
    admin_name: '',
    admin_comment: '',
    created_at: nowIso,
    decided_at: ''
  };

  await appendSheet(spreadsheetId, `${TAB}!A:J`, [objToRow(obj)]);
  return obj;
}

async function findRowById(id) {
  const spreadsheetId = await requireAttendanceSheetId();
  await ensureLeaveRequestsTab();

  const rows = await readSheet(spreadsheetId, `${TAB}!A2:J`);
  const list = (rows || []).map(rowToObj);
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return { rowNumber: null, record: null };
  return { rowNumber: idx + 2, record: list[idx] };
}

async function decideLeaveRequest({ id, adminName, status, adminComment }) {
  if (!id) throw new Error('id is required');
  if (!adminName) throw new Error('adminName is required');
  if (!['approved', 'rejected'].includes(status)) throw new Error('status must be approved or rejected');

  const spreadsheetId = await requireAttendanceSheetId();
  const { rowNumber, record } = await findRowById(id);
  if (!rowNumber || !record) {
    const err = new Error('Leave request not found');
    err.status = 404;
    throw err;
  }

  if (record.status !== 'pending') {
    const err = new Error('Leave request already decided');
    err.status = 409;
    throw err;
  }

  const decidedAt = new Date().toISOString();
  const updated = {
    ...record,
    status,
    admin_name: adminName,
    admin_comment: adminComment ? String(adminComment).trim() : '',
    decided_at: decidedAt
  };

  await writeSheet(spreadsheetId, `${TAB}!A${rowNumber}:J${rowNumber}`, [objToRow(updated)]);
  return updated;
}

module.exports = {
  TAB,
  HEADERS,
  ensureLeaveRequestsTab,
  listLeaveRequests,
  submitLeaveRequest,
  decideLeaveRequest
};
