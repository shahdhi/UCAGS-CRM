/**
 * crm-leads Edge Function
 * Maps to: /api/crm-leads/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse, jsonResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin, isAdminOrOfficer } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

function cleanStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function toNull(v: unknown): string | null {
  const s = cleanStr(v);
  return s || null;
}

// ── Meta: list sheets ──────────────────────────────────────────────────────────

router.get('/admin/meta/batches', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const assignedTo = url.searchParams.get('assignedTo') || url.searchParams.get('officer');

  let q = sb.from('officer_custom_sheets').select('batch_name').not('batch_name', 'is', null);
  if (assignedTo) q = q.eq('officer_name', assignedTo);

  const { data, error } = await q;
  if (error) throw error;
  const batches = [...new Set((data ?? []).map((r: any) => r.batch_name).filter(Boolean))];
  return successResponse({ batches });
});

router.get('/meta/sheets', async (req) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');

  let q = sb.from('officer_custom_sheets').select('*').eq('batch_name', batchName);
  if (user.role !== 'admin') q = q.eq('officer_name', user.name);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ sheets: data ?? [] });
});

router.post('/meta/sheets', async (req) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { batchName, sheetName, scope } = body;

  const row = {
    batch_name: batchName,
    sheet_name: sheetName,
    officer_name: user.role === 'admin' ? (scope === 'admin' ? null : user.name) : user.name,
    scope: scope || 'officer',
    created_by: user.name,
  };

  const { data, error } = await sb.from('officer_custom_sheets').insert(row).select('*').single();
  if (error) throw error;
  return successResponse({ sheet: data }, 201);
});

router.delete('/meta/sheets', async (req) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');
  const sheetName = url.searchParams.get('sheet');

  let q = sb.from('officer_custom_sheets').delete()
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName);
  if (user.role !== 'admin') q = q.eq('officer_name', user.name);

  const { error } = await q;
  if (error) throw error;
  return successResponse({ deleted: true });
});

router.get('/admin/meta/sheets', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const assignedTo = url.searchParams.get('assignedTo') || url.searchParams.get('officer');
  const batchName = url.searchParams.get('batch');

  let q = sb.from('officer_custom_sheets').select('*');
  if (assignedTo) q = q.eq('officer_name', assignedTo);
  if (batchName) q = q.eq('batch_name', batchName);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ sheets: data ?? [] });
});

// ── List leads ─────────────────────────────────────────────────────────────────

router.get('/admin', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');
  const sheetName = url.searchParams.get('sheet');
  const search = url.searchParams.get('search');
  const status = url.searchParams.get('status');
  const assignedTo = url.searchParams.get('assignedTo') || url.searchParams.get('officer');
  const programId = url.searchParams.get('programId');

  let q = sb.from('crm_leads').select('*').order('created_at', { ascending: false }).limit(500);
  if (batchName) q = q.eq('batch_name', batchName);
  if (sheetName) q = q.eq('sheet_name', sheetName);
  if (status) q = q.eq('status', status);
  if (assignedTo) q = q.eq('assigned_to', assignedTo);
  if (programId) q = q.eq('program_id', programId);
  if (search) {
    const s = search.replace(/"/g, '');
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ count: data?.length ?? 0, leads: data ?? [] });
});

router.get('/my', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');
  const sheetName = url.searchParams.get('sheet');
  const search = url.searchParams.get('search');
  const status = url.searchParams.get('status');
  const programId = url.searchParams.get('programId');

  if (!user.name) return errorResponse('Officer name not found in user profile', 400);

  let q = sb.from('crm_leads').select('*')
    .eq('assigned_to', user.name)
    .order('created_at', { ascending: false })
    .limit(500);

  if (batchName) q = q.eq('batch_name', batchName);
  if (sheetName) q = q.eq('sheet_name', sheetName);
  if (status) q = q.eq('status', status);
  if (programId) q = q.eq('program_id', programId);
  if (search) {
    const s = search.replace(/"/g, '');
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ count: data?.length ?? 0, leads: data ?? [] });
});

// ── Update leads ───────────────────────────────────────────────────────────────

router.put('/my/:batchName/:sheetName/:leadId', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, leadId } = params;
  const updates = await req.json();

  // Only allow updating own leads
  const { data: existing, error: fetchErr } = await sb
    .from('crm_leads')
    .select('*')
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('sheet_lead_id', String(leadId))
    .eq('assigned_to', user.name)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) return errorResponse('Lead not found or not assigned to you', 404);

  const patch: Record<string, unknown> = {};
  const allowed = ['status', 'priority', 'next_follow_up', 'call_feedback', 'pdf_sent', 'wa_sent', 'email_sent', 'notes', 'last_follow_up_comment'];
  for (const k of allowed) {
    if (k in updates) patch[k] = updates[k];
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from('crm_leads')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) throw error;
  return successResponse({ lead: data });
});

router.put('/admin/:batchName/:sheetName/:leadId', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, leadId } = params;
  const updates = await req.json();

  const { data: existing, error: fetchErr } = await sb
    .from('crm_leads')
    .select('*')
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('sheet_lead_id', String(leadId))
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) return errorResponse('Lead not found', 404);

  const patch: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
  delete patch.id;
  delete patch.created_at;

  const { data, error } = await sb
    .from('crm_leads')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) throw error;
  return successResponse({ lead: data });
});

// ── Create leads ───────────────────────────────────────────────────────────────

router.post('/admin/create', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { batchName, sheetName, lead } = body;

  const row = {
    batch_name: batchName,
    sheet_name: sheetName || 'Main Leads',
    sheet_lead_id: String(Date.now()),
    name: toNull(lead.name),
    phone: toNull(lead.phone),
    email: toNull(lead.email),
    status: lead.status || 'New',
    assigned_to: toNull(lead.assignedTo || lead.assigned_to),
    notes: toNull(lead.notes),
    priority: toNull(lead.priority),
    source: toNull(lead.source),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from('crm_leads').insert(row).select('*').single();
  if (error) throw error;
  return successResponse({ lead: data }, 201);
});

router.post('/my/create', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { batchName, sheetName, lead } = body;

  const row = {
    batch_name: batchName,
    sheet_name: sheetName || 'Main Leads',
    sheet_lead_id: String(Date.now()),
    name: toNull(lead.name),
    phone: toNull(lead.phone),
    email: toNull(lead.email),
    status: lead.status || 'New',
    assigned_to: user.name,
    notes: toNull(lead.notes),
    priority: toNull(lead.priority),
    source: toNull(lead.source),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from('crm_leads').insert(row).select('*').single();
  if (error) throw error;
  return successResponse({ lead: data }, 201);
});

// ── Bulk operations ────────────────────────────────────────────────────────────

router.post('/admin/bulk-assign', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, leadIds, assignedTo } = await req.json();

  const { data, error } = await sb
    .from('crm_leads')
    .update({ assigned_to: assignedTo, assigned_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .in('sheet_lead_id', (leadIds ?? []).map(String))
    .select('id');

  if (error) throw error;
  return successResponse({ updated: data?.length ?? 0 });
});

router.post('/admin/bulk-delete', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, leadIds } = await req.json();

  const { data, error } = await sb
    .from('crm_leads')
    .delete()
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .in('sheet_lead_id', (leadIds ?? []).map(String))
    .select('id');

  if (error) throw error;
  return successResponse({ deleted: data?.length ?? 0 });
});

router.post('/my/bulk-delete', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, leadIds } = await req.json();

  const { data, error } = await sb
    .from('crm_leads')
    .delete()
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('assigned_to', user.name)
    .in('sheet_lead_id', (leadIds ?? []).map(String))
    .select('id');

  if (error) throw error;
  return successResponse({ deleted: data?.length ?? 0 });
});

router.post('/admin/bulk-distribute', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, leadIds, officers } = await req.json();

  if (!officers?.length) return errorResponse('No officers provided', 400);
  const ids = (leadIds ?? []).map(String);
  const updates = ids.map((id: string, i: number) => ({
    sheet_lead_id: id,
    batch_name: batchName,
    sheet_name: sheetName,
    assigned_to: officers[i % officers.length],
    assigned_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  let updated = 0;
  for (const u of updates) {
    const { error } = await sb.from('crm_leads').update({
      assigned_to: u.assigned_to,
      assigned_at: u.assigned_at,
      updated_at: u.updated_at,
    }).eq('batch_name', batchName).eq('sheet_name', sheetName).eq('sheet_lead_id', u.sheet_lead_id);
    if (!error) updated++;
  }
  return successResponse({ updated });
});

router.post('/admin/distribute-unassigned', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, officers } = await req.json();
  if (!officers?.length) return errorResponse('No officers provided', 400);

  const { data: unassigned, error } = await sb
    .from('crm_leads')
    .select('sheet_lead_id')
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .or('assigned_to.is.null,assigned_to.eq.');

  if (error) throw error;
  const ids = (unassigned ?? []).map((r: any) => r.sheet_lead_id);
  let updated = 0;
  for (let i = 0; i < ids.length; i++) {
    const { error: uErr } = await sb.from('crm_leads').update({
      assigned_to: officers[i % officers.length],
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('batch_name', batchName).eq('sheet_name', sheetName).eq('sheet_lead_id', ids[i]);
    if (!uErr) updated++;
  }
  return successResponse({ updated, total: ids.length });
});

// ── Copy operations ────────────────────────────────────────────────────────────

router.post('/admin/copy', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { source, target } = await req.json();

  const { data: src, error: srcErr } = await sb
    .from('crm_leads').select('*')
    .eq('batch_name', source.batchName).eq('sheet_name', source.sheetName)
    .eq('sheet_lead_id', String(source.leadId)).maybeSingle();
  if (srcErr) throw srcErr;
  if (!src) return errorResponse('Source lead not found', 404);

  const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
  const newRow = { ...rest, batch_name: target.batchName, sheet_name: target.sheetName, sheet_lead_id: String(Date.now()), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data, error } = await sb.from('crm_leads').insert(newRow).select('*').single();
  if (error) throw error;
  return successResponse({ lead: data }, 201);
});

router.post('/admin/copy-bulk', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { sources, target } = await req.json();
  let copied = 0;
  for (const source of sources ?? []) {
    const { data: src } = await sb.from('crm_leads').select('*')
      .eq('batch_name', source.batchName).eq('sheet_name', source.sheetName)
      .eq('sheet_lead_id', String(source.leadId)).maybeSingle();
    if (!src) continue;
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
    const newRow = { ...rest, batch_name: target.batchName, sheet_name: target.sheetName, sheet_lead_id: String(Date.now() + copied), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { error } = await sb.from('crm_leads').insert(newRow);
    if (!error) copied++;
  }
  return successResponse({ copied }, 201);
});

router.post('/my/copy', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { source, target } = await req.json();

  const { data: src, error: srcErr } = await sb.from('crm_leads').select('*')
    .eq('batch_name', source.batchName).eq('sheet_name', source.sheetName)
    .eq('sheet_lead_id', String(source.leadId)).eq('assigned_to', user.name).maybeSingle();
  if (srcErr) throw srcErr;
  if (!src) return errorResponse('Source lead not found', 404);

  const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
  const newRow = { ...rest, batch_name: target.batchName, sheet_name: target.sheetName, sheet_lead_id: String(Date.now()), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data, error } = await sb.from('crm_leads').insert(newRow).select('*').single();
  if (error) throw error;
  return successResponse({ lead: data }, 201);
});

router.post('/my/copy-bulk', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { sources, target } = await req.json();
  let copied = 0;
  for (const source of sources ?? []) {
    const { data: src } = await sb.from('crm_leads').select('*')
      .eq('batch_name', source.batchName).eq('sheet_name', source.sheetName)
      .eq('sheet_lead_id', String(source.leadId)).eq('assigned_to', user.name).maybeSingle();
    if (!src) continue;
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
    const newRow = { ...rest, batch_name: target.batchName, sheet_name: target.sheetName, sheet_lead_id: String(Date.now() + copied), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { error } = await sb.from('crm_leads').insert(newRow);
    if (!error) copied++;
  }
  return successResponse({ copied }, 201);
});

// ── CSV export ─────────────────────────────────────────────────────────────────

router.get('/admin/export.csv', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');
  const sheetName = url.searchParams.get('sheet');
  const search = url.searchParams.get('search');
  const status = url.searchParams.get('status');

  let q = sb.from('crm_leads').select('*').order('created_at', { ascending: false }).limit(5000);
  if (batchName) q = q.eq('batch_name', batchName);
  if (sheetName) q = q.eq('sheet_name', sheetName);
  if (status) q = q.eq('status', status);
  if (search) { const s = search.replace(/"/g, ''); q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`); }

  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return new Response('', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="leads-export.csv"' } });

  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r: any) => cols.map(c => escape(r[c])).join(','))].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads-export.csv"',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// ── CSV import ─────────────────────────────────────────────────────────────────

router.post('/admin/import', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, csvText } = await req.json();
  if (!csvText) return errorResponse('csvText is required', 400);

  const lines = String(csvText).split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return errorResponse('CSV must have at least a header and one data row', 400);

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });

  const toInsert = rows.map((r, i) => ({
    batch_name: batchName,
    sheet_name: sheetName || 'Main Leads',
    sheet_lead_id: String(Date.now() + i),
    name: r.name || r.full_name || null,
    phone: r.phone || null,
    email: r.email || null,
    status: r.status || 'New',
    assigned_to: r.assigned_to || r.assignedto || null,
    notes: r.notes || null,
    source: r.source || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await sb.from('crm_leads').insert(toInsert).select('id');
  if (error) throw error;
  return successResponse({ imported: data?.length ?? 0, total: rows.length });
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
