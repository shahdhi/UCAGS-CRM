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
const { getCachedSheets, setCachedSheets } = require('../../core/batches/batchSheetsCache');

// Admin sheets (core only)
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

// Officer sheets (core + tracking)
const OFFICER_HEADERS = [
  ...ADMIN_HEADERS,
  'priority',
  'next_follow_up',
  'call_feedback',
  'pdf_sent',
  'wa_sent',
  'email_sent',
  'last_follow_up_comment',
  'followup1_schedule',
  'followup1_date',
  'followup1_answered',
  'followup1_comment',
  'followup2_schedule',
  'followup2_date',
  'followup2_answered',
  'followup2_comment',
  'followup3_schedule',
  'followup3_date',
  'followup3_answered',
  'followup3_comment'
];

function colToLetter(col) {
  let temp = col;
  let letter = '';
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}


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

async function listSheetsForBatch(batchName, opts = {}) {
  const force = Boolean(opts.force);

  // 1) Try Supabase cache first
  if (!force) {
    try {
      const cached = await getCachedSheets(batchName);
      if (cached && Array.isArray(cached.sheets) && cached.sheets.length) {
        return cached.sheets;
      }
    } catch (e) {
      // If cache fails, continue with Sheets API fallback
      console.warn('batch_sheets cache read failed:', e.message || e);
    }
  }

  // 2) Fallback to Google Sheets metadata
  const adminSpreadsheetId = await getAdminSpreadsheetId(batchName);
  const info = await getSpreadsheetInfo(adminSpreadsheetId, { force });
  const titles = (info.sheets || []).map(s => s.properties.title);
  const result = titles.filter(t => t && t !== 'Sheet1');

  // 3) Write back to cache (best-effort)
  try {
    await setCachedSheets(batchName, result);
  } catch (e) {
    console.warn('batch_sheets cache write failed:', e.message || e);
  }

  return result;
}

async function ensureSheetWithHeaders(spreadsheetId, sheetTitle, headers) {
  const existing = await sheetExists(spreadsheetId, sheetTitle);
  if (!existing) {
    await createSheet(spreadsheetId, sheetTitle);
  }
  await writeSheet(spreadsheetId, `${sheetTitle}!A1:${colToLetter(headers.length)}1`, [headers]);
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

  // Create in admin (core headers only)
  await ensureSheetWithHeaders(adminSpreadsheetId, sheetName, ADMIN_HEADERS);

  // Create in all officers (core + tracking)
  for (const id of officerSpreadsheetIds) {
    await ensureSheetWithHeaders(id, sheetName, OFFICER_HEADERS);
  }

  // Update cache (best-effort)
  try {
    const existing = await listSheetsForBatch(batchName, { force: true });
    const merged = Array.from(new Set([...(existing || []), sheetName])).filter(Boolean);
    await setCachedSheets(batchName, merged);
  } catch (e) {
    console.warn('Failed to update batch_sheets cache after create:', e.message || e);
  }

  return { success: true };
}

async function upgradeOfficerHeadersForBatch(batchName) {
  const sheets = await listSheetsForBatch(batchName);
  const officerSpreadsheetIds = await listOfficerSpreadsheetIds(batchName);

  for (const sheetName of sheets) {
    for (const id of officerSpreadsheetIds) {
      await ensureSheetWithHeaders(id, sheetName, OFFICER_HEADERS);
    }
  }

  return { success: true, batchName, sheetsUpdated: sheets.length, officersUpdated: officerSpreadsheetIds.length };
}

const { deleteSheetTab } = require('../../core/sheets/sheetsClient');

const DEFAULT_SHEETS = ['Main Leads', 'Extra Leads'];

async function deleteSheetForBatch(batchName, sheetName) {
  validateSheetName(sheetName);
  if (DEFAULT_SHEETS.map(s => s.toLowerCase()).includes(String(sheetName).toLowerCase())) {
    const err = new Error('Cannot delete default sheets');
    err.status = 400;
    throw err;
  }

  const adminSpreadsheetId = await getAdminSpreadsheetId(batchName);
  const officerSpreadsheetIds = await listOfficerSpreadsheetIds(batchName);

  await deleteSheetTab(adminSpreadsheetId, sheetName);
  for (const id of officerSpreadsheetIds) {
    await deleteSheetTab(id, sheetName);
  }

  // Update cache
  try {
    const existing = await listSheetsForBatch(batchName, { force: true });
    const filtered = (existing || []).filter(s => String(s).toLowerCase() !== String(sheetName).toLowerCase());
    await setCachedSheets(batchName, filtered);
  } catch (e) {
    console.warn('Failed to update batch_sheets cache after delete:', e.message || e);
  }

  return { success: true };
}

module.exports = {
  listSheetsForBatch,
  createSheetForBatch,
  deleteSheetForBatch,
  upgradeOfficerHeadersForBatch,
  OFFICER_HEADERS
};
