/**
 * Batch Sheets Cache (Supabase)
 *
 * Stores per-batch sheet/tab names so we don't have to call Google Sheets
 * spreadsheet metadata endpoints frequently (quota).
 *
 * Table: batch_sheets
 *  - batch_name text primary key
 *  - sheets text[] not null
 *  - updated_at timestamptz not null default now()
 */

const { getSupabaseAdmin } = require('../supabase/supabaseAdmin');

function isMissingTableError(error) {
  const msg = String(error?.message || error || '');
  // PostgREST messages vary; cover common cases
  return msg.includes('relation') && msg.includes('does not exist');
}

async function getCachedSheets(batchName) {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb
    .from('batch_sheets')
    .select('sheets, updated_at')
    .eq('batch_name', batchName)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }

  if (!data || !Array.isArray(data.sheets)) return null;
  return { sheets: data.sheets, updated_at: data.updated_at };
}

async function setCachedSheets(batchName, sheets) {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  const payload = {
    batch_name: batchName,
    sheets: Array.isArray(sheets) ? sheets : [],
    updated_at: new Date().toISOString()
  };

  const { error } = await sb
    .from('batch_sheets')
    .upsert(payload, { onConflict: 'batch_name' });

  if (error) {
    if (isMissingTableError(error)) return;
    throw error;
  }
}

module.exports = {
  getCachedSheets,
  setCachedSheets
};
