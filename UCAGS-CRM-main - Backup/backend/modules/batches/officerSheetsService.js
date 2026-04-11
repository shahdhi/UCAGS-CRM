/**
 * Officer-only sheets/tabs service
 *
 * Officer-only sheets/tabs service (Supabase-only)
 *
 * Stores officer-created sheet names in Supabase table `officer_custom_sheets`.
 * Does NOT create Google Sheets tabs.
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

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

async function listOfficerSheets(batchName, officerName) {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const { data, error } = await sb
    .from('officer_custom_sheets')
    .select('sheet_name, program_id, program_name')
    .eq('batch_name', batchName)
    .eq('officer_name', officerName)
    .order('created_at', { ascending: true });

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return [];
    throw error;
  }

  return (data || []).map(r => r.sheet_name).filter(Boolean);
}

async function createOfficerOnlySheet(batchName, officerName, sheetName, userId = null, { programId = null, programName = null } = {}) {
  validateSheetName(sheetName);

  const sb = getSupabaseAdmin();
  if (!sb) {
    const err = new Error('Supabase admin not configured');
    err.status = 500;
    throw err;
  }

  // Auto-resolve program_id + program_name from program_batches if not provided
  let resolvedProgramId = programId;
  let resolvedProgramName = programName;
  if (!resolvedProgramId && batchName) {
    try {
      const { data: pb } = await sb
        .from('program_batches')
        .select('program_id, programs(name)')
        .eq('batch_name', batchName)
        .limit(1)
        .maybeSingle();
      resolvedProgramId = pb?.program_id || null;
      resolvedProgramName = pb?.programs?.name || programName || null;
    } catch (_) {}
  }

  await sb.from('officer_custom_sheets').upsert({
    batch_name: batchName,
    officer_name: officerName,
    sheet_name: sheetName,
    created_by_user_id: userId || null,
    program_id: resolvedProgramId || null,
    program_name: resolvedProgramName || null,
    created_at: new Date().toISOString()
  }, { onConflict: 'batch_name,officer_name,sheet_name' });

  const sheets = await listOfficerSheets(batchName, officerName);
  return { success: true, sheets };
}

const DEFAULT_SHEETS = ['Main Leads', 'Extra Leads', 'Foxes'];

async function deleteOfficerOnlySheet(batchName, officerName, sheetName) {
  validateSheetName(sheetName);
  if (DEFAULT_SHEETS.map(s => s.toLowerCase()).includes(String(sheetName).toLowerCase())) {
    const err = new Error('Cannot delete default sheets');
    err.status = 400;
    throw err;
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    const err = new Error('Supabase admin not configured');
    err.status = 500;
    throw err;
  }

  // Only allow deleting sheets that were created by this officer
  const { data, error } = await sb
    .from('officer_custom_sheets')
    .select('sheet_name')
    .eq('batch_name', batchName)
    .eq('officer_name', officerName)
    .eq('sheet_name', sheetName)
    .maybeSingle();

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) {
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

  await sb.from('officer_custom_sheets')
    .delete()
    .eq('batch_name', batchName)
    .eq('officer_name', officerName)
    .eq('sheet_name', sheetName);

  // Optional: delete Supabase leads belonging to this officer sheet
  try {
    await sb.from('crm_leads')
      .delete()
      .eq('batch_name', batchName)
      .eq('sheet_name', sheetName)
      .eq('assigned_to', officerName);
  } catch (_) {}

  const sheets = await listOfficerSheets(batchName, officerName);
  return { success: true, sheets };
}

module.exports = {
  listOfficerSheets,
  createOfficerOnlySheet,
  deleteOfficerOnlySheet
};
