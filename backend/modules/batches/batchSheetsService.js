/**
 * Batch Sheets Service
 *
 * Supports listing and creating tabs (sheets) inside the per-batch spreadsheets.
 *
 * Rule: When a new sheet is created for a batch:
 *  - Create the tab in the batch admin spreadsheet
 *  - Create the same tab in ALL officer spreadsheets for that batch
 *  - Write the same header row
 */

const { getSpreadsheetInfo, createSheet, sheetExists, writeSheet } = require('../../core/sheets/sheetsClient');
const { getBatch } = require('../../core/batches/batchesStore');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

const ADMIN_HEADERS = [
  'platform',
  'are_you_planning_to_start_immediately?',
  'why_are_you_interested_in_this_diploma?',
  'full_name',
  'phone',
  'email',
  'ID',
  'status',
  'assigned_to',
  'created_date',
  'notes'
];

async function getAdminSpreadsheetId(batchName) {
  const batch = await getBatch(batchName);
  if (!batch?.admin_spreadsheet_id) {
    const err = new Error('Batch not found');
    err.status = 404;
    throw err;
  }
  return batch.admin_spreadsheet_id;
}

async function listOfficerSpreadsheetIds(batchName) {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin not configured');

  const { data, error } = await sb
    .from('batch_officer_sheets')
    .select('spreadsheet_id')
    .eq('batch_name', batchName);

  if (error) throw error;
  return (data || []).map(r => r.spreadsheet_id).filter(Boolean);
}

async function listSheetsForBatch(batchName) {
  const adminSpreadsheetId = await getAdminSpreadsheetId(batchName);
  const info = await getSpreadsheetInfo(adminSpreadsheetId);
  const titles = (info.sheets || []).map(s => s.properties.title);
  // Hide default Sheet1 if it exists (we use named tabs)
  return titles.filter(t => t && t !== 'Sheet1');
}

async function ensureSheetWithHeaders(spreadsheetId, sheetTitle) {
  const existing = await sheetExists(spreadsheetId, sheetTitle);
  if (!existing) {
    await createSheet(spreadsheetId, sheetTitle);
  }
  await writeSheet(spreadsheetId, `${sheetTitle}!A1:${String.fromCharCode(64 + ADMIN_HEADERS.length)}1`, [ADMIN_HEADERS]);
}

function validateSheetName(name) {
  if (!name) throw Object.assign(new Error('sheetName is required'), { status: 400 });
  // Google Sheets constraints: max 100 chars, cannot contain [ ] : * ? / \
  if (name.length > 80) throw Object.assign(new Error('sheetName too long'), { status: 400 });
  if (/[\[\]\:\*\?\/\\]/.test(name)) throw Object.assign(new Error('sheetName contains invalid characters'), { status: 400 });
}

async function createSheetForBatch(batchName, sheetName) {
  validateSheetName(sheetName);

  const adminSpreadsheetId = await getAdminSpreadsheetId(batchName);
  const officerSpreadsheetIds = await listOfficerSpreadsheetIds(batchName);

  // Create in admin
  await ensureSheetWithHeaders(adminSpreadsheetId, sheetName);

  // Create in all officers
  for (const id of officerSpreadsheetIds) {
    await ensureSheetWithHeaders(id, sheetName);
  }

  return { success: true };
}

module.exports = {
  listSheetsForBatch,
  createSheetForBatch
};
