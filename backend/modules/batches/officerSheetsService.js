/**
 * Officer-only sheets/tabs service
 *
 * Allows an officer to create and list tabs only inside their own batch spreadsheet.
 */

const { getOfficerSpreadsheetId } = require('../../core/batches/batchesStore');
const { getSpreadsheetInfo, createSheet, sheetExists, writeSheet } = require('../../core/sheets/sheetsClient');
const { OFFICER_HEADERS } = require('./batchSheetsService');

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

function validateSheetName(name) {
  if (!name) throw Object.assign(new Error('sheetName is required'), { status: 400 });
  if (name.length > 80) throw Object.assign(new Error('sheetName too long'), { status: 400 });
  if (/[\[\]\:\*\?\/\\]/.test(name)) throw Object.assign(new Error('sheetName contains invalid characters'), { status: 400 });
}

async function listOfficerSheets(batchName, officerName, opts = {}) {
  const force = Boolean(opts.force);
  const spreadsheetId = await getOfficerSpreadsheetId(batchName, officerName);
  if (!spreadsheetId) {
    const err = new Error('Officer spreadsheet not found for this batch');
    err.status = 404;
    throw err;
  }

  const info = await getSpreadsheetInfo(spreadsheetId, { force });
  const titles = (info.sheets || []).map(s => s.properties.title).filter(Boolean);
  return titles.filter(t => t && t !== 'Sheet1');
}

async function ensureSheetWithHeaders(spreadsheetId, sheetTitle, headers) {
  const existing = await sheetExists(spreadsheetId, sheetTitle);
  if (!existing) {
    await createSheet(spreadsheetId, sheetTitle);
  }
  await writeSheet(spreadsheetId, `${sheetTitle}!A1:${colToLetter(headers.length)}1`, [headers]);
}

async function createOfficerOnlySheet(batchName, officerName, sheetName) {
  validateSheetName(sheetName);

  const spreadsheetId = await getOfficerSpreadsheetId(batchName, officerName);
  if (!spreadsheetId) {
    const err = new Error('Officer spreadsheet not found for this batch');
    err.status = 404;
    throw err;
  }

  await ensureSheetWithHeaders(spreadsheetId, sheetName, OFFICER_HEADERS);

  // Track officer-created sheets in Supabase (so officers can't delete admin-created tabs)
  try {
    const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
    const sb = getSupabaseAdmin();
    if (sb) {
      await sb.from('officer_custom_sheets').upsert({
        batch_name: batchName,
        officer_name: officerName,
        sheet_name: sheetName,
        created_at: new Date().toISOString()
      }, { onConflict: 'batch_name,officer_name,sheet_name' });
    }
  } catch (e) {
    console.warn('Failed to write officer_custom_sheets (optional):', e.message || e);
  }

  const sheets = await listOfficerSheets(batchName, officerName, { force: true });
  return { success: true, sheets };
}

const { deleteSheetTab } = require('../../core/sheets/sheetsClient');

const DEFAULT_SHEETS = ['Main Leads', 'Extra Leads'];

async function deleteOfficerOnlySheet(batchName, officerName, sheetName) {
  validateSheetName(sheetName);
  if (DEFAULT_SHEETS.map(s => s.toLowerCase()).includes(String(sheetName).toLowerCase())) {
    const err = new Error('Cannot delete default sheets');
    err.status = 400;
    throw err;
  }

  // Only allow deleting sheets that were created by this officer via /my-sheets
  try {
    const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
    const sb = getSupabaseAdmin();
    if (sb) {
      const { data, error } = await sb
        .from('officer_custom_sheets')
        .select('sheet_name')
        .eq('batch_name', batchName)
        .eq('officer_name', officerName)
        .eq('sheet_name', sheetName)
        .maybeSingle();

      if (error) {
        // If table missing, safest is to disallow deletion
        const msg = String(error.message || '');
        if (msg.includes('relation') && msg.includes('does not exist')) {
          const err = new Error('Officer custom sheet tracking not configured');
          err.status = 403;
          throw err;
        }
        throw error;
      }

      if (!data) {
        const err = new Error('You can only delete sheets that you created');
        err.status = 403;
        throw err;
      }
    } else {
      const err = new Error('Supabase admin not configured');
      err.status = 403;
      throw err;
    }
  } catch (e) {
    if (e.status) throw e;
    console.warn('officer_custom_sheets check failed:', e.message || e);
    const err = new Error('You can only delete sheets that you created');
    err.status = 403;
    throw err;
  }

  const spreadsheetId = await getOfficerSpreadsheetId(batchName, officerName);
  if (!spreadsheetId) {
    const err = new Error('Officer spreadsheet not found for this batch');
    err.status = 404;
    throw err;
  }

  await deleteSheetTab(spreadsheetId, sheetName);

  // Remove tracking row
  try {
    const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
    const sb = getSupabaseAdmin();
    if (sb) {
      await sb.from('officer_custom_sheets')
        .delete()
        .eq('batch_name', batchName)
        .eq('officer_name', officerName)
        .eq('sheet_name', sheetName);
    }
  } catch (e) {
    console.warn('Failed to delete officer_custom_sheets row:', e.message || e);
  }

  const sheets = await listOfficerSheets(batchName, officerName, { force: true });
  return { success: true, sheets };
}

module.exports = {
  listOfficerSheets,
  createOfficerOnlySheet,
  deleteOfficerOnlySheet
};
