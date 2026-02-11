/**
 * Batches Store (Supabase)
 * Stores mapping:
 *  - batch name -> drive folder id
 *  - batch name -> admin spreadsheet id
 *  - batch name + officer name -> officer spreadsheet id
 *
 * Requires Supabase tables (create once):
 *
 * create table if not exists batches (
 *   name text primary key,
 *   drive_folder_id text,
 *   admin_spreadsheet_id text,
 *   created_at timestamptz default now()
 * );
 *
 * create table if not exists batch_officer_sheets (
 *   batch_name text references batches(name) on delete cascade,
 *   officer_name text,
 *   spreadsheet_id text,
 *   created_at timestamptz default now(),
 *   primary key (batch_name, officer_name)
 * );
 */

const { getSupabaseAdmin } = require('../supabase/supabaseAdmin');

function requireSupabase() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin not configured');
  return sb;
}

async function listBatches() {
  const sb = requireSupabase();
  const { data, error } = await sb.from('batches').select('name').order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(r => r.name);
}

async function getBatch(batchName) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('batches').select('*').eq('name', batchName).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertBatch({ name, drive_folder_id, admin_spreadsheet_id }) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('batches').upsert({
    name,
    drive_folder_id,
    admin_spreadsheet_id
  }, { onConflict: 'name' }).select('*').single();
  if (error) throw error;
  return data;
}

async function upsertOfficerSheet({ batch_name, officer_name, spreadsheet_id }) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('batch_officer_sheets').upsert({
    batch_name,
    officer_name,
    spreadsheet_id
  }, { onConflict: 'batch_name,officer_name' }).select('*').single();
  if (error) throw error;
  return data;
}

async function getOfficerSpreadsheetId(batchName, officerName) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('batch_officer_sheets')
    .select('spreadsheet_id')
    .eq('batch_name', batchName)
    .eq('officer_name', officerName)
    .maybeSingle();
  if (error) throw error;
  return data?.spreadsheet_id || null;
}

module.exports = {
  listBatches,
  getBatch,
  upsertBatch,
  upsertOfficerSheet,
  getOfficerSpreadsheetId
};
