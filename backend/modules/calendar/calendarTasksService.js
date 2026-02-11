/**
 * Calendar Tasks Service (Google Sheets)
 *
 * Stores custom tasks in a dedicated spreadsheet.
 */

const { config } = require('../../core/config/environment');
const { readSheet, appendSheet, writeSheet, sheetExists, createSheet } = require('../../core/sheets/sheetsClient');

const TAB = 'Tasks';
const HEADERS = ['id', 'owner_name', 'title', 'due_at', 'notes', 'created_at'];

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
  const headerRow = await readSheet(spreadsheetId, `${TAB}!A1:F1`);
  if (!headerRow || headerRow.length === 0 || (headerRow[0] || []).join('|') !== HEADERS.join('|')) {
    await writeSheet(spreadsheetId, `${TAB}!A1:F1`, [HEADERS]);
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
    task.created_at
  ];
}

function fromRow(row) {
  return {
    id: row[0] || '',
    owner_name: row[1] || '',
    title: row[2] || '',
    due_at: row[3] || '',
    notes: row[4] || '',
    created_at: row[5] || ''
  };
}

async function listTasks({ owner, from, to }) {
  const spreadsheetId = await ensureTasksSheet();
  const rows = await readSheet(spreadsheetId, `${TAB}!A2:F`);
  let tasks = (rows || []).map(fromRow).filter(t => t.id && t.owner_name);

  tasks = tasks.filter(t => t.owner_name === owner);
  if (from) tasks = tasks.filter(t => t.due_at >= from);
  if (to) tasks = tasks.filter(t => t.due_at <= to);

  tasks.sort((a, b) => String(a.due_at || '').localeCompare(String(b.due_at || '')));
  return tasks;
}

async function createTask({ owner, title, dueAt, notes }) {
  const spreadsheetId = await ensureTasksSheet();
  const nowIso = new Date().toISOString();
  const task = {
    id: `TASK-${Date.now()}`,
    owner_name: owner,
    title,
    due_at: dueAt,
    notes: notes || '',
    created_at: nowIso
  };

  await appendSheet(spreadsheetId, `${TAB}!A:F`, [toRow(task)]);
  return task;
}

async function deleteTask({ owner, id }) {
  const spreadsheetId = await ensureTasksSheet();
  const rows = await readSheet(spreadsheetId, `${TAB}!A2:F`);
  const tasks = (rows || []).map(fromRow);
  const idx = tasks.findIndex(t => t.id === id && t.owner_name === owner);
  if (idx === -1) return { success: true, skipped: true };

  const rowNumber = idx + 2;
  await writeSheet(spreadsheetId, `${TAB}!A${rowNumber}:F${rowNumber}`, [['', '', '', '', '', '']]);
  return { success: true };
}

module.exports = {
  listTasks,
  createTask,
  deleteTask
};
