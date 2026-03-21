/**
 * batches Edge Function
 * Maps to: /api/batches/* and /api/batch-leads/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { getSpreadsheetInfo, sheetExists, createSheet, writeSheet } from '../_shared/sheets.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

const ADMIN_HEADERS = ['platform','are_you_planning_to_start_immediately?','why_are_you_interested_in_this_diploma?','full_name','phone','email','ID','status','assigned_to','created_date','notes'];

function extractSpreadsheetId(input: string): string {
  const m = String(input).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : String(input).trim();
}

function colToLetter(col: number): string {
  let temp = col, letter = '';
  while (temp > 0) { const rem = (temp - 1) % 26; letter = String.fromCharCode(65 + rem) + letter; temp = Math.floor((temp - 1) / 26); }
  return letter;
}

// GET /  — list all batches
router.get('/', async (req) => {
  await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('batches').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return successResponse({ batches: data ?? [] });
});

// GET /officers  — list officer users (admin)
router.get('/officers', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { data: { users }, error } = await sb.auth.admin.listUsers();
  if (error) throw error;
  const adminEmails = new Set(['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com']);
  const officers = (users ?? [])
    .filter((u: any) => {
      const role = String(u.user_metadata?.role ?? '').toLowerCase();
      if (role === 'admin') return false;
      if (adminEmails.has(String(u.email ?? '').toLowerCase())) return false;
      return true;
    })
    .map((u: any) => ({ id: u.id, name: u.user_metadata?.name ?? u.email?.split('@')[0] ?? '' }));
  return successResponse({ officers });
});

// POST /create  — create a new batch with a main spreadsheet
router.post('/create', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { batchName, mainSpreadsheetUrl } = body;

  if (!batchName) return errorResponse('Batch name is required', 400);
  if (!/^[a-zA-Z0-9_-]+$/.test(batchName)) return errorResponse('Invalid batch name', 400);
  if (!mainSpreadsheetUrl) return errorResponse('Main spreadsheet URL is required', 400);

  const spreadsheetId = extractSpreadsheetId(mainSpreadsheetUrl);
  if (!spreadsheetId) return errorResponse('Invalid spreadsheet URL', 400);

  // Validate spreadsheet access
  await getSpreadsheetInfo(spreadsheetId);

  // Ensure default tabs exist
  for (const tab of ['Main Leads', 'Extra Leads']) {
    const exists = await sheetExists(spreadsheetId, tab);
    if (!exists) await createSheet(spreadsheetId, tab);
    await writeSheet(spreadsheetId, `${tab}!A1:${colToLetter(ADMIN_HEADERS.length)}1`, [ADMIN_HEADERS]);
  }

  // Upsert batch in Supabase
  const { data, error } = await sb.from('batches')
    .upsert({ name: batchName, admin_spreadsheet_id: spreadsheetId, drive_folder_id: null, updated_at: new Date().toISOString() }, { onConflict: 'name' })
    .select('*').single();
  if (error) throw error;

  return successResponse({ batch: data, batchName, mainSpreadsheet: { id: spreadsheetId, url: mainSpreadsheetUrl } }, 201);
});

// GET /:batchName/sheets  — list sheets for a batch
router.get('/:batchName/sheets', async (req, params) => {
  await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { data: batch } = await sb.from('batches').select('admin_spreadsheet_id').eq('name', params.batchName).maybeSingle();
  if (!batch?.admin_spreadsheet_id) return successResponse({ sheets: ['Main Leads', 'Extra Leads'] });
  const info = await getSpreadsheetInfo(batch.admin_spreadsheet_id);
  const sheets = (info.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean);
  return successResponse({ sheets });
});

// POST /:batchName/sheets  — create a sheet tab (admin)
router.post('/:batchName/sheets', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { sheetName } = await req.json();
  if (!sheetName) return errorResponse('sheetName is required', 400);
  const { data: batch } = await sb.from('batches').select('admin_spreadsheet_id').eq('name', params.batchName).maybeSingle();
  if (!batch?.admin_spreadsheet_id) return errorResponse('Batch spreadsheet not found', 404);
  await createSheet(batch.admin_spreadsheet_id, sheetName);
  await writeSheet(batch.admin_spreadsheet_id, `${sheetName}!A1:${colToLetter(ADMIN_HEADERS.length)}1`, [ADMIN_HEADERS]);
  return successResponse({ created: true, sheetName }, 201);
});

// DELETE /:batchName/sheets/:sheetName  — delete a sheet tab (admin)
router.delete('/:batchName/sheets/:sheetName', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { data: batch } = await sb.from('batches').select('admin_spreadsheet_id').eq('name', params.batchName).maybeSingle();
  if (!batch?.admin_spreadsheet_id) return errorResponse('Batch spreadsheet not found', 404);
  // Use batchUpdate to delete sheet
  const info = await getSpreadsheetInfo(batch.admin_spreadsheet_id);
  const sheet = (info.sheets ?? []).find((s: any) => s.properties?.title === params.sheetName);
  if (!sheet) return errorResponse('Sheet not found', 404);
  const token = await (async () => {
    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!;
    const rawKey = (Deno.env.get('GOOGLE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');
    // Re-use token from sheets module via fetch
    const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${batch.admin_spreadsheet_id}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ignored` },
      body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: sheet.properties.sheetId } }] }),
    });
    return resp;
  })();
  return successResponse({ deleted: true });
});

// GET /:batchName/leads  — list leads from Supabase for a batch (admin)
router.get('/:batchName/leads', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const sheet = url.searchParams.get('sheet') ?? 'Main Leads';
  const { data, error } = await sb.from('crm_leads').select('*')
    .eq('batch_name', params.batchName).eq('sheet_name', sheet)
    .order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return successResponse({ count: data?.length ?? 0, leads: data ?? [] });
});

// PUT /:batchName/leads/:leadId  — update a lead (admin)
router.put('/:batchName/leads/:leadId', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const sheet = url.searchParams.get('sheet') ?? 'Main Leads';
  const updates = await req.json();
  const { id: _id, created_at: _c, ...patch } = updates;
  const { data, error } = await sb.from('crm_leads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('batch_name', params.batchName).eq('sheet_name', sheet).eq('sheet_lead_id', params.leadId)
    .select('*').single();
  if (error) throw error;
  return successResponse({ lead: data });
});

// GET /:batchName/my-leads  — officer gets own leads
router.get('/:batchName/my-leads', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const sheet = url.searchParams.get('sheet') ?? 'Main Leads';
  const { data, error } = await sb.from('crm_leads').select('*')
    .eq('batch_name', params.batchName).eq('sheet_name', sheet).eq('assigned_to', user.name)
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return successResponse({ count: data?.length ?? 0, leads: data ?? [] });
});

// GET /:batchName/my-sheets  — officer's custom sheets
router.get('/:batchName/my-sheets', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('officer_custom_sheets').select('sheet_name')
    .eq('batch_name', params.batchName).eq('officer_name', user.name);
  if (error) throw error;
  return successResponse({ sheets: (data ?? []).map((r: any) => r.sheet_name) });
});

// GET /:batchName/my-custom-sheets  — officer's custom sheets (same endpoint, different name)
router.get('/:batchName/my-custom-sheets', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('officer_custom_sheets').select('sheet_name')
    .eq('batch_name', params.batchName).eq('officer_name', user.name);
  if (error) throw error;
  return successResponse({ sheets: (data ?? []).map((r: any) => r.sheet_name) });
});

// POST /:batchName/my-sheets  — officer creates a custom sheet
router.post('/:batchName/my-sheets', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { sheetName } = await req.json();
  if (!sheetName) return errorResponse('sheetName is required', 400);
  const { data, error } = await sb.from('officer_custom_sheets')
    .insert({ batch_name: params.batchName, sheet_name: sheetName, officer_name: user.name, created_by: user.name })
    .select('*').single();
  if (error) throw error;
  return successResponse({ sheet: data }, 201);
});

// DELETE /:batchName/my-sheets/:sheetName  — officer deletes a custom sheet
router.delete('/:batchName/my-sheets/:sheetName', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('officer_custom_sheets')
    .delete().eq('batch_name', params.batchName).eq('sheet_name', params.sheetName).eq('officer_name', user.name);
  if (error) throw error;
  return successResponse({ deleted: true });
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const res = await router.handle(req);
    if (res) return res;
    return errorResponse('Not found', 404);
  } catch (e: any) {
    return errorResponse(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
