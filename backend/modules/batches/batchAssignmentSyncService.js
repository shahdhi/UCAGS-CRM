/**
 * Assignment Sync Service (Supabase → Google Sheets)
 *
 * For a given batch, read all tabs in the batch main spreadsheet, match rows by sheet "ID",
 * then write back ONLY the assigned_to column from Supabase (clearing it if Supabase is blank).
 */

const { getSpreadsheetInfo, readSheet } = require('../../core/sheets/sheetsClient');
const { getBatch } = require('../../core/batches/batchesStore');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { google } = require('googleapis');
const { config } = require('../../core/config/environment');

let cachedAuth = null;

function normalizeEnv(v) {
  if (v == null) return v;
  let s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

async function getSheetsAuth() {
  if (cachedAuth) return cachedAuth;

  const serviceAccountEmail = normalizeEnv(config.google.serviceAccountEmail);
  let privateKey = normalizeEnv(config.google.privateKey);
  if (!serviceAccountEmail || !privateKey) {
    const err = new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY');
    err.status = 500;
    throw err;
  }
  privateKey = privateKey.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
  const auth = new google.auth.JWT(serviceAccountEmail, null, privateKey, scopes);
  await auth.authorize();
  cachedAuth = auth;
  return auth;
}

async function getSheetsApi() {
  const auth = await getSheetsAuth();
  return google.sheets({ version: 'v4', auth });
}

function requireSupabase() {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const err = new Error('Supabase admin not configured');
    err.status = 500;
    throw err;
  }
  return sb;
}

function normalizeHeader(h) {
  return String(h || '').trim();
}

function indexHeaders(headers) {
  const lowerToIndex = new Map();
  (headers || []).forEach((h, i) => {
    const k = String(h || '').trim().toLowerCase();
    if (k) lowerToIndex.set(k, i);
  });
  return (name) => lowerToIndex.get(String(name).toLowerCase());
}

function getCell(row, i) {
  if (i == null || i < 0) return '';
  return row && row[i] != null ? row[i] : '';
}

function colToLetter(col) {
  let temp = col + 1;
  let letter = '';
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

async function listSheetTabs(spreadsheetId) {
  const info = await getSpreadsheetInfo(spreadsheetId);
  return (info.sheets || []).map(s => s.properties?.title).filter(Boolean);
}

async function syncAssignmentsToSheets(batchName, { sheetNames } = {}) {
  const sb = requireSupabase();

  const batch = await getBatch(batchName);
  const spreadsheetId = batch?.admin_spreadsheet_id;
  if (!spreadsheetId) {
    const err = new Error(`Batch not found or main spreadsheet not configured: ${batchName}`);
    err.status = 404;
    throw err;
  }

  const tabs = Array.isArray(sheetNames) && sheetNames.length
    ? sheetNames
    : await listSheetTabs(spreadsheetId);

  const sheetsApi = await getSheetsApi();

  const perSheetResults = [];

  for (const sheetName of tabs) {
    const headerRow = await readSheet(spreadsheetId, `${sheetName}!A1:AZ1`);
    const headers = (headerRow && headerRow[0]) ? headerRow[0].map(normalizeHeader) : [];
    const idxFn = indexHeaders(headers);

    const idIdx = idxFn('ID');
    const assignedIdx = idxFn('assigned_to');

    if (idIdx == null) {
      perSheetResults.push({ sheetName, success: false, error: 'Missing required header: ID' });
      continue;
    }
    if (assignedIdx == null) {
      perSheetResults.push({ sheetName, success: false, error: 'Missing required header: assigned_to' });
      continue;
    }

    const rows = await readSheet(spreadsheetId, `${sheetName}!A2:AZ`);
    const ids = (rows || [])
      .filter(r => r && r.length)
      .map(r => String(getCell(r, idIdx) || '').trim())
      .filter(Boolean);

    if (ids.length === 0) {
      perSheetResults.push({ sheetName, success: true, updated: 0 });
      continue;
    }

    // Fetch assignments from Supabase for these IDs
    const { data, error } = await sb
      .from('crm_leads')
      .select('sheet_lead_id, assigned_to')
      .eq('batch_name', batchName)
      .eq('sheet_name', sheetName)
      .in('sheet_lead_id', ids);

    if (error) {
      perSheetResults.push({ sheetName, success: false, error: error.message || String(error) });
      continue;
    }

    const map = new Map();
    (data || []).forEach(r => map.set(String(r.sheet_lead_id), r.assigned_to == null ? '' : String(r.assigned_to)));

    // Build updates: update assigned_to cell for every row that has an ID.
    // If ID not found in Supabase, set blank (since you said clear blanks too).
    const updates = [];
    const colLetter = colToLetter(assignedIdx);

    (rows || []).forEach((r, i) => {
      if (!r || !r.length) return;
      const sheetLeadId = String(getCell(r, idIdx) || '').trim();
      if (!sheetLeadId) return;
      const assigned = map.get(sheetLeadId) ?? '';

      const rowNumber = i + 2; // data starts at row 2
      updates.push({
        range: `${sheetName}!${colLetter}${rowNumber}`,
        values: [[assigned]]
      });
    });

    if (updates.length === 0) {
      perSheetResults.push({ sheetName, success: true, updated: 0 });
      continue;
    }

    // Batch update in chunks to avoid request size limits
    const CHUNK = 500;
    let updatedCount = 0;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await sheetsApi.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: chunk
        }
      });
      updatedCount += chunk.length;
    }

    perSheetResults.push({ sheetName, success: true, updated: updatedCount });
  }

  return {
    success: true,
    batchName,
    spreadsheetId,
    sheets: perSheetResults
  };
}

module.exports = {
  syncAssignmentsToSheets
};
