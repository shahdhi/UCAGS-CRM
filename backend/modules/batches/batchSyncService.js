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

function parseLeadRow(row, idxFn, rowNumber) {
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

  // Core-ish fields (best-effort mapping; store full raw row for flexibility)
  return {
    sheet_lead_id: sheetLeadId,
    name: fullName,
    phone: String(getCell(row, idxFn('phone')) || '').trim(),
    email: String(getCell(row, idxFn('email')) || '').trim(),
    platform: String(getCell(row, idxFn('platform')) || '').trim(),
    status: String(getCell(row, idxFn('status')) || '').trim() || 'New',
    assigned_to: String(getCell(row, idxFn('assigned_to')) || getCell(row, idxFn('assigned to')) || '').trim(),
    created_date: String(getCell(row, idxFn('created_date')) || '').trim(),
    notes: String(getCell(row, idxFn('notes')) || '').trim()
  };
}

async function listSheetTabs(spreadsheetId) {
  const info = await getSpreadsheetInfo(spreadsheetId);
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

  const results = [];
  for (const sheetName of tabs) {
    // Read header
    const headerRow = await readSheet(spreadsheetId, `${sheetName}!A1:AZ1`);
    const headers = (headerRow && headerRow[0]) ? headerRow[0].map(normalizeHeader) : [];
    const idxFn = indexHeaders(headers);

    const idIdx = idxFn('ID');
    
    // Read rows
    const rows = await readSheet(spreadsheetId, `${sheetName}!A2:AZ`);
    const parsed = (rows || [])
      .filter(r => r && r.length)
      .map((r, i) => parseLeadRow(r, idxFn, i + 2))  // Pass row number (2 = first data row)
      .filter(l => l.sheet_lead_id);

    if (parsed.length === 0) {
      results.push({ sheetName, success: true, inserted: 0, updated: 0 });
      continue;
    }

    // Determine which leads already exist in Supabase (so we don't overwrite operational fields)
    const ids = parsed.map(p => p.sheet_lead_id);
    const { data: existing, error: existingErr } = await sb
      .from('crm_leads')
      .select('sheet_lead_id')
      .eq('batch_name', batchName)
      .eq('sheet_name', sheetName)
      .in('sheet_lead_id', ids);

    if (existingErr) {
      results.push({ sheetName, success: false, error: existingErr.message || String(existingErr) });
      continue;
    }

    const existingSet = new Set((existing || []).map(r => String(r.sheet_lead_id)));

    // Insert payload: full intake fields
    const nowIso = new Date().toISOString();
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
        created_date: l.created_date,
        notes: l.notes,
        source: 'google_sheets',
        synced_at: nowIso
      }));

    // Update payload: ONLY intake fields + synced_at. Do NOT overwrite assigned_to/status/priority/call feedback.
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
        created_date: l.created_date,
        notes: l.notes,
        synced_at: nowIso
      }));

    // Inserts
    if (insertPayload.length > 0) {
      const { error } = await sb
        .from('crm_leads')
        .insert(insertPayload);
      if (error) {
        results.push({ sheetName, success: false, error: error.message || String(error) });
        continue;
      }
    }

    // Updates (use upsert but payload excludes operational columns, so they won't be overwritten)
    if (updatePayload.length > 0) {
      const { error } = await sb
        .from('crm_leads')
        .upsert(updatePayload, { onConflict: 'batch_name,sheet_name,sheet_lead_id' });
      if (error) {
        results.push({ sheetName, success: false, error: error.message || String(error) });
        continue;
      }
    }

    results.push({ sheetName, success: true, inserted: insertPayload.length, updated: updatePayload.length });
  }

  return {
    success: true,
    batchName,
    spreadsheetId,
    sheets: results
  };
}

module.exports = {
  syncBatchToSupabase
};
