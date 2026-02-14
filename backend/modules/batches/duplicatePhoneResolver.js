/**
 * Duplicate Phone Resolver
 *
 * Checks duplicates by phone number across all sheets of a batch:
 * - Main/admin spreadsheet tabs
 * - All officer spreadsheets tabs (including officer-created custom tabs)
 *
 * If a phone exists and is already assigned, returns that officer name.
 */

const { getBatch } = require('../../core/batches/batchesStore');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { getSpreadsheetInfo, readSheet } = require('../../core/sheets/sheetsClient');

const TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache = new Map(); // batchName -> { expiresAt, phoneToAssignee }

function normalizePhoneToSL(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('94')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return `94${digits.slice(1)}`;
  if (digits.length === 9) return `94${digits}`;
  if (digits.length > 11) return `94${digits.slice(-9)}`;
  return digits;
}

function indexHeaders(headers) {
  const map = new Map();
  (headers || []).forEach((h, i) => {
    const k = String(h || '').trim().toLowerCase();
    if (k) map.set(k, i);
  });
  return (name) => map.get(String(name).trim().toLowerCase());
}

function getCell(row, idx) {
  if (idx == null || idx < 0) return '';
  return row && row[idx] != null ? String(row[idx]) : '';
}

async function listAllOfficerSpreadsheets(batchName) {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('batch_officer_sheets')
    .select('officer_name, spreadsheet_id')
    .eq('batch_name', batchName);
  if (error) throw error;
  return data || [];
}

async function scanSpreadsheet(spreadsheetId, sheetNames, phoneToAssignee) {
  for (const sheetName of sheetNames) {
    const headerRow = await readSheet(spreadsheetId, `${sheetName}!A1:AZ1`);
    const headers = headerRow?.[0] || [];
    const idx = indexHeaders(headers);
    const phoneIdx = idx('phone');
    const assignedIdx = idx('assigned_to') ?? idx('assigned to');
    if (phoneIdx == null) continue;

    const rows = await readSheet(spreadsheetId, `${sheetName}!A2:AZ`);
    (rows || []).forEach(r => {
      const phone = normalizePhoneToSL(getCell(r, phoneIdx));
      if (!phone) return;
      const assigned = assignedIdx != null ? String(getCell(r, assignedIdx) || '').trim() : '';
      if (!assigned) return;
      if (!phoneToAssignee.has(phone)) {
        phoneToAssignee.set(phone, assigned);
      }
    });
  }
}

async function buildBatchPhoneIndex(batchName) {
  const phoneToAssignee = new Map();

  const batch = await getBatch(batchName);
  if (!batch?.admin_spreadsheet_id) return phoneToAssignee;

  // 1) Scan admin spreadsheet tabs
  const adminInfo = await getSpreadsheetInfo(batch.admin_spreadsheet_id, { force: true });
  const adminSheets = (adminInfo.sheets || [])
    .map(s => s.properties.title)
    .filter(t => t && t !== 'Sheet1');
  await scanSpreadsheet(batch.admin_spreadsheet_id, adminSheets, phoneToAssignee);

  // 2) Scan each officer spreadsheet tabs
  const officerSheets = await listAllOfficerSpreadsheets(batchName);
  for (const os of officerSheets) {
    if (!os?.spreadsheet_id) continue;
    const info = await getSpreadsheetInfo(os.spreadsheet_id, { force: true });
    const tabs = (info.sheets || []).map(s => s.properties.title).filter(Boolean);
    const sheets = tabs.filter(t => t && t !== 'Sheet1');
    await scanSpreadsheet(os.spreadsheet_id, sheets, phoneToAssignee);
  }

  return phoneToAssignee;
}

async function getAssigneeForDuplicatePhone(batchName, phone) {
  const canonical = normalizePhoneToSL(phone);
  if (!canonical) return '';

  const cached = cache.get(batchName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.phoneToAssignee.get(canonical) || '';
  }

  const index = await buildBatchPhoneIndex(batchName);
  cache.set(batchName, { expiresAt: Date.now() + TTL_MS, phoneToAssignee: index });
  return index.get(canonical) || '';
}

function clearCache(batchName) {
  if (batchName) cache.delete(batchName);
  else cache = new Map();
}

module.exports = {
  normalizePhoneToSL,
  getAssigneeForDuplicatePhone,
  clearCache
};
