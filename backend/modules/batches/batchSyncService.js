/**
 * Batch → Supabase Sync Service
 *
 * Pulls leads from a batch's MAIN Google Spreadsheet tabs (Main Leads, Extra Leads, and any custom tabs)
 * and upserts them into Supabase for fast operational reads/writes.
 *
 * Upsert key: (batch_name, sheet_name, sheet_lead_id) where sheet_lead_id comes from the sheet column header "ID".
 */

const { readSheet, getSpreadsheetInfo } = require('../../core/sheets/sheetsClient');
const { getBatch } = require('../../core/batches/batchesStore');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { normalizePhoneToSL } = require('./duplicatePhoneResolver');

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

function quotedSheetName(sheetName) {
  const safe = String(sheetName || '').replace(/'/g, "''");
  return `'${safe}'`;
}

async function readSheetWithFallback(readFn, spreadsheetId, sheetName, a1Range, opts) {
  // Try unquoted first (works reliably for existing sheets).
  let v = await readFn(spreadsheetId, `${sheetName}!${a1Range}`, opts);

  // If empty and sheet name contains spaces/specials, try quoted name.
  if ((!v || v.length === 0) && /[^A-Za-z0-9_]/.test(String(sheetName || ''))) {
    v = await readFn(spreadsheetId, `${quotedSheetName(sheetName)}!${a1Range}`, opts);
  }

  return v || [];
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

function parseLeadRow(row, idxFn, rowNumber, headers) {
  let sheetLeadId = String(getCell(row, idxFn('ID')) || '').trim();
  
  // Auto-generate ID if missing
  if (!sheetLeadId) {
    // Generate ID based on phone or fallback to row number
    const phone = String(getCell(row, idxFn('phone')) || '').trim();
    const name = String(getCell(row, idxFn('full_name')) || getCell(row, idxFn('name')) || '').trim();
    
    if (phone) {
      // Clean phone number and use as ID
      sheetLeadId = `lead_${phone.replace(/\D/g, '')}`;
    } else if (name) {
      // Use name + row number
      sheetLeadId = `lead_${name.toLowerCase().replace(/\s+/g, '_')}_${rowNumber}`;
    } else {
      // Fallback to row number
      sheetLeadId = `lead_${rowNumber}`;
    }
  }

  const fullName = String(getCell(row, idxFn('full_name')) || getCell(row, idxFn('name')) || '').trim();

  // Build intake_json with ALL columns from the sheet for flexibility
  const intakeJson = {};
  headers.forEach((header, idx) => {
    if (header && header.toLowerCase() !== 'id') {
      const value = getCell(row, idx);
      if (value !== null && value !== undefined && value !== '') {
        intakeJson[header] = value;
      }
    }
  });

  // Core fields (best-effort mapping)
  // Normalize phone number to canonical Sri Lanka format for consistent matching
  const rawPhone = String(getCell(row, idxFn('phone')) || '').trim();
  const normalizedPhone = normalizePhoneToSL(rawPhone) || rawPhone;
  
  return {
    sheet_lead_id: sheetLeadId,
    name: fullName,
    phone: normalizedPhone,
    email: String(getCell(row, idxFn('email')) || '').trim(),
    platform: String(getCell(row, idxFn('platform')) || '').trim(),
    status: String(getCell(row, idxFn('status')) || '').trim() || 'New',
    assigned_to: String(getCell(row, idxFn('assigned_to')) || getCell(row, idxFn('assigned to')) || '').trim(),
    created_date: String(getCell(row, idxFn('created_date')) || '').trim(),
    notes: String(getCell(row, idxFn('notes')) || '').trim(),
    
    // Additional common fields for modal display
    course: String(getCell(row, idxFn('course')) || '').trim(),
    source: String(getCell(row, idxFn('source')) || '').trim(),
    
    // Full raw row for flexibility
    intake_json: intakeJson
  };
}

async function listSheetTabs(spreadsheetId) {
  // Force fresh metadata so newly created tabs are included immediately (important on serverless).
  const info = await getSpreadsheetInfo(spreadsheetId, { force: true });
  const titles = (info.sheets || []).map(s => s.properties?.title).filter(Boolean);
  return titles;
}

async function syncBatchToSupabase(batchName, { sheetNames } = {}) {
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

  // Resolve program_id + program_name once for the whole batch (same for all sheets)
  let syncProgramId = null;
  let syncProgramName = null;
  try {
    const { data: pb } = await sb
      .from('program_batches')
      .select('program_id, programs(name)')
      .eq('batch_name', batchName)
      .limit(1)
      .maybeSingle();
    syncProgramId = pb?.program_id || null;
    syncProgramName = pb?.programs?.name || null;
  } catch (_) {}

  const results = [];
  for (const sheetName of tabs) {
    // Read header
    const headerRow = await readSheetWithFallback(readSheet, spreadsheetId, sheetName, 'A1:AZ1', { force: true });
    const headers = (headerRow && headerRow[0]) ? headerRow[0].map(normalizeHeader) : [];
    const idxFn = indexHeaders(headers);

    const idIdx = idxFn('ID');
    
    // Read rows
    const rows = await readSheetWithFallback(readSheet, spreadsheetId, sheetName, 'A2:AZ', { force: true });
    const parsed = (rows || [])
      .filter(r => r && r.length)
      .map((r, i) => ({ ...parseLeadRow(r, idxFn, i + 2, headers), sheet_row_index: i }))  // i = 0-based row order from sheet
      .filter(l => l.sheet_lead_id);

    if (parsed.length === 0) {
      results.push({ sheetName, success: true, inserted: 0, updated: 0, debug: { headers: headers.length, rowsRead: (rows || []).length } });
      continue;
    }

    // Determine which leads already exist in Supabase (so we don't overwrite operational fields)
    // Fetch in chunks to avoid URL length limits with large .in() queries
    const ids = parsed.map(p => p.sheet_lead_id);
    const existingSet = new Set();
    const CHUNK_SIZE = 100;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const { data: existingChunk, error: existingErr } = await sb
        .from('crm_leads')
        .select('sheet_lead_id')
        .eq('batch_name', batchName)
        .eq('sheet_name', sheetName)
        .in('sheet_lead_id', chunk);
      if (existingErr) {
        results.push({ sheetName, success: false, error: existingErr.message || String(existingErr) });
        break;
      }
      (existingChunk || []).forEach(r => existingSet.add(String(r.sheet_lead_id)));
    }
    // Skip this sheet if we got an error mid-chunk
    if (results.length && results[results.length - 1].success === false && results[results.length - 1].sheetName === sheetName) {
      continue;
    }

    const nowIso = new Date().toISOString();

    // New leads: insert in chunks to avoid payload size limits
    const insertPayload = parsed
      .filter(l => !existingSet.has(String(l.sheet_lead_id)))
      .map(l => ({
        batch_name: batchName,
        sheet_name: sheetName,
        sheet_lead_id: l.sheet_lead_id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        platform: l.platform,
        course: l.course,
        source: l.source,
        created_date: l.created_date,
        notes: l.notes,
        intake_json: l.intake_json,
        assigned_to: l.assigned_to,
        sheet_row_index: l.sheet_row_index,
        program_id: syncProgramId,
        program_name: syncProgramName,
        synced_at: nowIso
      }));

    // Existing leads: update ONLY intake fields, do NOT overwrite assigned_to/status/priority
    const updatePayload = parsed
      .filter(l => existingSet.has(String(l.sheet_lead_id)))
      .map(l => ({
        batch_name: batchName,
        sheet_name: sheetName,
        sheet_lead_id: l.sheet_lead_id,
        name: l.name,
        phone: l.phone,
        email: l.email,
        platform: l.platform,
        course: l.course,
        source: l.source,
        intake_json: l.intake_json,
        created_date: l.created_date,
        notes: l.notes,
        sheet_row_index: l.sheet_row_index,
        synced_at: nowIso
      }));

    // Insert new leads in chunks
    let insertedCount = 0;
    for (let i = 0; i < insertPayload.length; i += CHUNK_SIZE) {
      const chunk = insertPayload.slice(i, i + CHUNK_SIZE);
      const { error } = await sb.from('crm_leads').insert(chunk);
      if (error) {
        // Try upsert as fallback (handles race conditions / duplicate sheet_lead_ids)
        const { error: upsertErr } = await sb
          .from('crm_leads')
          .upsert(chunk, { onConflict: 'batch_name,sheet_name,sheet_lead_id', ignoreDuplicates: true });
        if (upsertErr) {
          console.error(`[sync] Insert chunk error for ${sheetName}:`, upsertErr.message);
          continue; // skip bad chunk, don't abort entire sheet
        }
      }
      insertedCount += chunk.length;
    }

    // Update existing leads in chunks
    let updatedCount = 0;
    for (let i = 0; i < updatePayload.length; i += CHUNK_SIZE) {
      const chunk = updatePayload.slice(i, i + CHUNK_SIZE);
      const { error } = await sb
        .from('crm_leads')
        .upsert(chunk, { onConflict: 'batch_name,sheet_name,sheet_lead_id' });
      if (error) {
        console.error(`[sync] Update chunk error for ${sheetName}:`, error.message);
        continue; // skip bad chunk, don't abort entire sheet
      }
      updatedCount += chunk.length;
    }

    results.push({ sheetName, success: true, inserted: insertedCount, updated: updatedCount, debug: { headers: headers.length, rowsRead: (rows || []).length } });
  }

  return {
    success: true,
    batchName,
    spreadsheetId,
    tabsProcessed: tabs,
    sheets: results
  };
}

module.exports = {
  syncBatchToSupabase
};
