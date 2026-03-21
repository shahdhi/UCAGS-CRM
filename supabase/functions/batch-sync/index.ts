/**
 * batch-sync Edge Function
 * Maps to: /api/batches/:batchName/sync, /api/batches/:batchName/sync-assignments
 * and /api/batches/:batchName/leads (DELETE), /api/batches/:batchName (DELETE)
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { readSheet, writeSheet, getSpreadsheetInfo } from '../_shared/sheets.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

function normalizePhone(phone: string): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.startsWith('94')) return d;
  if (d.length === 10 && d.startsWith('0')) return `94${d.slice(1)}`;
  if (d.length === 9) return `94${d}`;
  if (d.length > 11) return `94${d.slice(-9)}`;
  return d;
}

function colToLetter(col: number): string {
  let temp = col + 1, letter = '';
  while (temp > 0) { const rem = (temp - 1) % 26; letter = String.fromCharCode(65 + rem) + letter; temp = Math.floor((temp - 1) / 26); }
  return letter;
}

async function syncBatchToSupabase(batchName: string, opts: { sheetNames?: string[] } = {}) {
  const sb = getSupabaseAdmin();
  const { data: batch } = await sb.from('batches').select('admin_spreadsheet_id').eq('name', batchName).maybeSingle();
  if (!batch?.admin_spreadsheet_id) throw Object.assign(new Error(`Batch "${batchName}" not found or no spreadsheet configured`), { status: 404 });

  const spreadsheetId = batch.admin_spreadsheet_id;
  const info = await getSpreadsheetInfo(spreadsheetId);
  const allSheets = (info.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean) as string[];
  const sheetsToSync = opts.sheetNames ? allSheets.filter(s => opts.sheetNames!.includes(s)) : allSheets;

  let totalUpserted = 0;
  const results: any[] = [];

  for (const sheetName of sheetsToSync) {
    try {
      const rows = await readSheet(spreadsheetId, `${sheetName}!A1:AZ2000`);
      if (!rows.length) { results.push({ sheetName, upserted: 0 }); continue; }

      const headers = rows[0].map((h: string) => String(h ?? '').trim().toLowerCase());
      const idx = (name: string) => headers.indexOf(name.toLowerCase());

      const dataRows = rows.slice(1).filter(r => r.some((c: string) => String(c ?? '').trim()));

      const toUpsert = dataRows.map((row: string[], i: number) => {
        const get = (h: string) => { const ix = idx(h); return ix >= 0 ? String(row[ix] ?? '').trim() : ''; };
        const id = get('id') || get('ID') || String(i + 2);
        const phone = get('phone');
        return {
          batch_name: batchName,
          sheet_name: sheetName,
          sheet_lead_id: id,
          name: get('full_name') || get('name') || null,
          phone: phone || null,
          email: get('email') || null,
          status: get('status') || 'New',
          assigned_to: get('assigned_to') || null,
          notes: get('notes') || null,
          platform: get('platform') || null,
          source: get('platform') || null,
          updated_at: new Date().toISOString(),
        };
      }).filter(r => r.name || r.phone);

      if (toUpsert.length) {
        const { data, error } = await sb.from('crm_leads')
          .upsert(toUpsert, { onConflict: 'batch_name,sheet_name,sheet_lead_id', ignoreDuplicates: false })
          .select('id');
        if (error) throw error;
        totalUpserted += data?.length ?? 0;
        results.push({ sheetName, upserted: data?.length ?? 0 });
      } else {
        results.push({ sheetName, upserted: 0 });
      }
    } catch (e: any) {
      results.push({ sheetName, error: e.message });
    }
  }
  return { success: true, totalUpserted, sheets: results };
}

async function syncAssignmentsToSheets(batchName: string, opts: { sheetNames?: string[] } = {}) {
  const sb = getSupabaseAdmin();
  const { data: batch } = await sb.from('batches').select('admin_spreadsheet_id').eq('name', batchName).maybeSingle();
  if (!batch?.admin_spreadsheet_id) return { success: false, error: 'No spreadsheet configured' };

  const spreadsheetId = batch.admin_spreadsheet_id;
  const info = await getSpreadsheetInfo(spreadsheetId);
  const allSheets = (info.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean) as string[];
  const sheetsToSync = opts.sheetNames ? allSheets.filter(s => opts.sheetNames!.includes(s)) : allSheets;

  let totalUpdated = 0;
  const results: any[] = [];

  for (const sheetName of sheetsToSync) {
    try {
      const rows = await readSheet(spreadsheetId, `${sheetName}!A1:AZ2000`);
      if (!rows.length) { results.push({ sheetName, updated: 0 }); continue; }

      const headers = rows[0].map((h: string) => String(h ?? '').trim().toLowerCase());
      const assignedToIdx = headers.indexOf('assigned_to');
      const idIdx = Math.max(headers.indexOf('id'), headers.indexOf('ID'.toLowerCase()));
      if (assignedToIdx < 0) { results.push({ sheetName, updated: 0, note: 'No assigned_to column' }); continue; }

      const { data: leads } = await sb.from('crm_leads').select('sheet_lead_id,assigned_to')
        .eq('batch_name', batchName).eq('sheet_name', sheetName);
      const leadMap = new Map((leads ?? []).map((l: any) => [String(l.sheet_lead_id), l.assigned_to ?? '']));

      const writes: { range: string; values: string[][] }[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const id = idIdx >= 0 ? String(row[idIdx] ?? '').trim() : String(i + 1);
        if (!id) continue;
        const dbAssigned = leadMap.get(id);
        if (dbAssigned === undefined) continue;
        const sheetAssigned = String(row[assignedToIdx] ?? '').trim();
        if (dbAssigned !== sheetAssigned) {
          writes.push({ range: `${sheetName}!${colToLetter(assignedToIdx)}${i + 1}`, values: [[dbAssigned]] });
        }
      }

      for (const w of writes) await writeSheet(spreadsheetId, w.range, w.values);
      totalUpdated += writes.length;
      results.push({ sheetName, updated: writes.length });
    } catch (e: any) {
      results.push({ sheetName, error: e.message });
    }
  }
  return { success: true, totalUpdated, sheets: results };
}

// POST /:batchName/sync
router.post('/:batchName/sync', async (req, params) => {
  await isAdmin(req);
  const body = await req.json().catch(() => ({}));
  const sheetNames = Array.isArray(body?.sheetNames) ? body.sheetNames : undefined;

  const pull = await syncBatchToSupabase(params.batchName, { sheetNames });
  let push: any = null;
  try { push = await syncAssignmentsToSheets(params.batchName, { sheetNames }); }
  catch (e: any) { push = { success: false, error: e.message }; }

  return successResponse({ batchName: params.batchName, sheetsToSupabase: pull, supabaseToSheets: push });
});

// POST /:batchName/sync-assignments
router.post('/:batchName/sync-assignments', async (req, params) => {
  await isAdmin(req);
  const body = await req.json().catch(() => ({}));
  const sheetNames = Array.isArray(body?.sheetNames) ? body.sheetNames : undefined;
  const result = await syncAssignmentsToSheets(params.batchName, { sheetNames });
  return successResponse(result);
});

// DELETE /:batchName/leads
router.delete('/:batchName/leads', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('crm_leads').delete().eq('batch_name', params.batchName).select('id');
  if (error) throw error;
  return successResponse({ deleted: true, deletedCount: data?.length ?? 0, message: `Deleted ${data?.length ?? 0} leads from batch "${params.batchName}"` });
});

// DELETE /:batchName
router.delete('/:batchName', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { data: leads, error: lErr } = await sb.from('crm_leads').delete().eq('batch_name', params.batchName).select('id');
  if (lErr) throw lErr;
  const { error: bErr } = await sb.from('batches').delete().eq('name', params.batchName);
  if (bErr) throw bErr;
  return successResponse({ deleted: true, deletedLeadCount: leads?.length ?? 0 });
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
