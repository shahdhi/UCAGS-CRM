/**
 * Calendar Tasks Service (Google Sheets)
 *
 * Stores custom tasks in a dedicated spreadsheet.
 */

const { config } = require('../../core/config/environment');
const { readSheet, appendSheet, writeSheet, sheetExists, createSheet } = require('../../core/sheets/sheetsClient');

const TAB = 'Tasks';
// NOTE: We keep backward compatibility with older sheets that only had A-F.
// New columns:
//  - repeat: none|daily|weekly|monthly
//  - visibility: personal|global
const HEADERS = ['id', 'owner_name', 'title', 'due_at', 'notes', 'created_at', 'repeat', 'visibility'];

function requireSheetId() {
  const id = config.sheets.calendarTasksSheetId;
  if (!id) {
    throw new Error('CALENDAR_TASKS_SHEET_ID not configured');
  }
  return id;
}

async function ensureTasksSheet() {
  const spreadsheetId = requireSheetId();
  const existing = await sheetExists(spreadsheetId, TAB);
  if (!existing) {
    await createSheet(spreadsheetId, TAB);
  }
  const headerRow = await readSheet(spreadsheetId, `${TAB}!A1:H1`);
  if (!headerRow || headerRow.length === 0 || (headerRow[0] || []).join('|') !== HEADERS.join('|')) {
    // Write/upgrade header row (does not delete existing data rows)
    await writeSheet(spreadsheetId, `${TAB}!A1:H1`, [HEADERS]);
  }
  return spreadsheetId;
}

function toRow(task) {
  return [
    task.id,
    task.owner_name,
    task.title,
    task.due_at,
    task.notes || '',
    task.created_at,
    task.repeat || 'none',
    task.visibility || 'personal'
  ];
}

function fromRow(row) {
  return {
    id: row[0] || '',
    owner_name: row[1] || '',
    title: row[2] || '',
    due_at: row[3] || '',
    notes: row[4] || '',
    created_at: row[5] || '',
    repeat: row[6] || 'none',
    visibility: row[7] || 'personal'
  };
}

async function listTasks({ owner, includeAllOwners = false, includeGlobal = true, from, to }) {
  const spreadsheetId = await ensureTasksSheet();
  const rows = await readSheet(spreadsheetId, `${TAB}!A2:H`);
  let tasks = (rows || []).map(fromRow).filter(t => t.id && (t.owner_name || t.visibility === 'global'));

  // Visibility rules:
  // - personal tasks: visible to the owner
  // - global tasks: visible to everyone (includeGlobal=true)
  tasks = tasks.filter(t => {
    if (t.visibility === 'global') return includeGlobal;
    if (includeAllOwners) return true;
    return t.owner_name === owner;
  });

  if (from) tasks = tasks.filter(t => String(t.due_at || '') >= from);
  if (to) tasks = tasks.filter(t => String(t.due_at || '') <= to);

  tasks.sort((a, b) => String(a.due_at || '').localeCompare(String(b.due_at || '')));
  return tasks;
}

async function createTask({ owner, title, dueAt, notes, repeat = 'none', visibility = 'personal' }) {
  const spreadsheetId = await ensureTasksSheet();
  const nowIso = new Date().toISOString();
  const task = {
    id: `TASK-${Date.now()}`,
    owner_name: owner,
    title,
    due_at: dueAt,
    notes: notes || '',
    created_at: nowIso,
    repeat: repeat || 'none',
    visibility: visibility || 'personal'
  };

  await appendSheet(spreadsheetId, `${TAB}!A:H`, [toRow(task)]);
  return task;
}

async function deleteTask({ requesterName, requesterRole, owner, id }) {
  const spreadsheetId = await ensureTasksSheet();
  const rows = await readSheet(spreadsheetId, `${TAB}!A2:H`);
  const tasks = (rows || []).map(fromRow);

  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return { success: true, skipped: true };

  const task = tasks[idx];

  const canDelete = (task.owner_name === requesterName) || (requesterRole === 'admin');
  if (!canDelete) {
    const err = new Error('Not allowed to delete this task');
    err.statusCode = 403;
    throw err;
  }

  const rowNumber = idx + 2;
  await writeSheet(spreadsheetId, `${TAB}!A${rowNumber}:H${rowNumber}`, [['', '', '', '', '', '', '', '']]);
  return { success: true };
}

module.exports = {
  listTasks,
  createTask,
  deleteTask
};
