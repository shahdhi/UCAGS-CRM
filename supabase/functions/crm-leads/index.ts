// @ts-nocheck
/**
 * CRM Leads â€“ Supabase Edge Function (Deno)
 *
 * Handles all /crm-leads/* routes previously served by the Vercel Express backend.
 * Auth: expects a Supabase JWT in the Authorization header.
 * Service-role operations use SUPABASE_SERVICE_ROLE_KEY (available natively in edge runtime).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function toBool(v: unknown): boolean {
  if (v === true || v === false) return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return false;
  return ['true', '1', 'yes', 'y', 'checked'].includes(s);
}

function normalizeLeadIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((x) => String(x)).filter(Boolean);
}

function normalizeSheetName(name: unknown): string {
  const raw = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const low = raw.toLowerCase();
  if (low === 'main leads') return 'Main Leads';
  if (low === 'extra leads') return 'Extra Leads';
  return raw;
}

function validateSheetName(name: unknown): string {
  const n = normalizeSheetName(name);
  if (!n) throw mkErr('Sheet name is required', 400);
  if (!/^[a-zA-Z0-9 _-]+$/.test(n))
    throw mkErr('Sheet name can only contain letters, numbers, spaces, hyphen and underscore', 400);
  if (['main leads', 'extra leads'].includes(n.toLowerCase()))
    throw mkErr('This sheet name is reserved', 400);
  return n;
}

function mkErr(msg: string, status = 500): Error {
  const e: any = new Error(msg);
  e.status = status;
  return e;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errResp(e: any): Response {
  const status = e?.status && e.status >= 100 && e.status < 600 ? e.status : 500;
  return jsonResp({ success: false, error: e?.message ?? String(e) }, status);
}

// ---------------------------------------------------------------------------
// Phone normalisation (Sri Lanka focus â€” mirrors duplicatePhoneResolver.js)
// ---------------------------------------------------------------------------

function normalizePhoneToSL(raw: unknown): string {
  let p = String(raw ?? '').replace(/[\s\-().+]/g, '');
  if (!p) return '';
  // remove country code prefix
  if (p.startsWith('94') && p.length >= 11) p = '0' + p.slice(2);
  if (p.startsWith('00') && p.length >= 12) p = '0' + p.slice(4);
  if (!p.startsWith('0') && p.length === 9) p = '0' + p;
  return p;
}

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------

/** Service-role client — can do anything, used for all DB ops */
function adminSb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Verify the JWT from the request and return the decoded user payload.
 * Uses the service-role client's auth.getUser(token) which works with any valid JWT
 * without needing the anon key (only SUPABASE_SERVICE_ROLE_KEY is needed).
 */
async function getUser(req: Request): Promise<any | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  // The admin/service-role client can verify any JWT via getUser(token)
  const { data: { user }, error } = await adminSb().auth.getUser(token);
  if (error) {
    console.error('[crm-leads] getUser error:', error.message, error.status);
    return null;
  }
  if (!user) {
    console.error('[crm-leads] getUser returned no user for token');
    return null;
  }
  console.log('[crm-leads] user verified:', user.id, 'role:', user.user_metadata?.role);
  return user;
}

function userRole(user: any): string {
  return cleanStr(user?.user_metadata?.role ?? user?.role);
}

function userName(user: any): string {
  return cleanStr(user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? '');
}

function isAdmin(user: any): boolean {
  return userRole(user) === 'admin';
}

function isAdminOrOfficer(user: any): boolean {
  const r = userRole(user);
  return ['admin', 'officer', 'admission_officer'].includes(r);
}

// ---------------------------------------------------------------------------
// Duplicate-phone cache (in-memory, per isolate lifetime)
// ---------------------------------------------------------------------------

const DUP_TTL_MS = 5 * 60 * 1000;
const dupPhoneCache = new Map<string, { expiresAt: number; ids: Set<string> }>();

async function buildDupSet(sb: any, batchName: string): Promise<Set<string>> {
  const batch = cleanStr(batchName);
  if (!batch) return new Set();
  const primary = new Map<string, { id: string; createdAt: number; sheetId: string }>();
  const dupIds = new Set<string>();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('crm_leads')
      .select('sheet_lead_id, phone, created_at')
      .eq('batch_name', batch)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    (data ?? []).forEach((r: any) => {
      const canon = normalizePhoneToSL(r?.phone);
      const id = String(r?.sheet_lead_id ?? '');
      if (!canon || !id) return;
      const createdAt = r?.created_at ? new Date(r.created_at).getTime() : 0;
      const prev = primary.get(canon);
      if (!prev) { primary.set(canon, { id, createdAt, sheetId: id }); return; }
      const earlier = createdAt && prev.createdAt
        ? createdAt < prev.createdAt
        : !!createdAt;
      let curEarlier = earlier;
      if (createdAt === prev.createdAt) {
        curEarlier = id.localeCompare(prev.sheetId, undefined, { numeric: true, sensitivity: 'base' }) < 0;
      }
      if (curEarlier) { dupIds.add(prev.id); primary.set(canon, { id, createdAt, sheetId: id }); }
      else { dupIds.add(id); }
    });
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return dupIds;
}

async function getDupSet(sb: any, batchName: string): Promise<Set<string>> {
  const b = cleanStr(batchName);
  const cached = dupPhoneCache.get(b);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;
  const ids = await buildDupSet(sb, b);
  dupPhoneCache.set(b, { ids, expiresAt: Date.now() + DUP_TTL_MS });
  return ids;
}

function clearDupCache(batchName?: string) {
  if (batchName) dupPhoneCache.delete(cleanStr(batchName));
  else dupPhoneCache.clear();
}

async function isDupLead(sb: any, batchName: string, sheetLeadId: string): Promise<boolean> {
  const b = cleanStr(batchName);
  const id = String(sheetLeadId ?? '');
  if (!b || !id) return false;
  const s = await getDupSet(sb, b);
  return s.has(id);
}

function applyDup(lead: any, dupSet: Set<string>): any {
  const id = String(lead?.id ?? lead?.sheetLeadId ?? '');
  if (!id || !dupSet.has(id)) return lead;
  return { ...lead, isDuplicate: true, assignedTo: 'Duplicate' };
}

// ---------------------------------------------------------------------------
// Row ? API shape
// ---------------------------------------------------------------------------

function rowToLead(r: any): any {
  const mgmt = r.management_json ?? {};
  const intake = r.intake_json ?? {};
  return {
    id: r.sheet_lead_id,
    sheetLeadId: r.sheet_lead_id,
    supabaseId: r.id,
    batch: r.batch_name,
    sheet: r.sheet_name,
    name: r.name ?? '',
    email: r.email ?? '',
    phone: r.phone ?? '',
    platform: r.platform ?? '',
    status: r.status ?? 'New',
    assignedTo: r.assigned_to ?? '',
    createdDate: r.created_date ?? r.created_at ?? '',
    notes: r.notes ?? '',
    source: r.source ?? '',
    intake_json: intake,
    priority: mgmt.priority ?? r.priority ?? '',
    callFeedback: mgmt.callFeedback ?? r.call_feedback ?? '',
    nextFollowUp: mgmt.nextFollowUp ?? r.next_follow_up ?? '',
    lastFollowUpComment: mgmt.lastFollowUpComment ?? r.last_follow_up_comment ?? '',
    pdfSent: mgmt.pdfSent ?? r.pdf_sent ?? false,
    waSent: mgmt.waSent ?? r.wa_sent ?? false,
    emailSent: mgmt.emailSent ?? r.email_sent ?? false,
    ...mgmt,
  };
}

function pickMgmtFields(input: Record<string, any> = {}): Record<string, any> {
  const mgmt: Record<string, any> = {};
  const direct = ['priority','callFeedback','nextFollowUp','lastFollowUpComment','pdfSent','waSent','emailSent'];
  direct.forEach(k => { if (input[k] !== undefined) mgmt[k] = input[k]; });
  Object.keys(input).forEach(k => {
    if (/^followUp\d+(Schedule|Date|Answered|Comment)$/.test(k)) mgmt[k] = input[k];
  });
  return mgmt;
}

// ---------------------------------------------------------------------------
// Notifications helper (best-effort)
// ---------------------------------------------------------------------------

async function notifyAssignment(sb: any, officerName: string, leadCount: number, batchName: string, sheetName: string) {
  try {
    const { data: { users } = {}, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
    if (error || !users) return;
    const name = cleanStr(officerName).toLowerCase();
    const found = (users as any[]).find(u => {
      const display = cleanStr(u?.user_metadata?.name ?? u?.email?.split('@')?.[0]).toLowerCase();
      return display === name;
    });
    if (!found) return;
    await sb.from('notifications').insert({
      user_id: found.id,
      category: 'lead_assignment',
      title: 'New leads assigned',
      message: `${leadCount} lead(s) assigned — ${cleanStr(batchName)}${sheetName ? ' / ' + cleanStr(sheetName) : ''}`,
      type: 'info',
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } catch (_) { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// LIST helpers
// ---------------------------------------------------------------------------

async function listMyLeads(sb: any, { officerName, batchName, sheetName, search, status, programId }: any): Promise<any[]> {
  if (!officerName) throw mkErr('Missing officerName', 400);

  let resolvedBatchNames: string[] | null = null;
  if (programId) {
    const { data: pb, error: pbErr } = await sb.from('program_batches').select('batch_name').eq('program_id', String(programId));
    if (pbErr) throw pbErr;
    resolvedBatchNames = (pb ?? []).map((r: any) => r.batch_name).filter(Boolean);
  }

  let q = sb.from('crm_leads').select('*').eq('assigned_to', officerName);

  if (batchName && batchName !== 'all') {
    if (resolvedBatchNames && !resolvedBatchNames.includes(batchName)) return [];
    q = q.eq('batch_name', batchName);
  } else if (resolvedBatchNames) {
    if (resolvedBatchNames.length === 0) return [];
    q = q.in('batch_name', resolvedBatchNames);
  }

  if (sheetName) q = q.eq('sheet_name', sheetName);
  if (status) q = q.eq('status', status);
  if (search) {
    const s = `%${search}%`;
    q = q.or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
  }

  const { data, error } = await q
    .order('sheet_row_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true, nullsFirst: false })
    .order('sheet_lead_id', { ascending: true });
  if (error) throw error;

  const leads = (data ?? []).map(rowToLead);
  if (batchName && batchName !== 'all') {
    try {
      const dupSet = await getDupSet(sb, batchName);
      return leads.map((l: any) => applyDup(l, dupSet));
    } catch (_) {}
  }
  return leads;
}

async function listAdminLeads(sb: any, { batchName, sheetName, search, status, assignedTo, programId }: any): Promise<any[]> {
  let resolvedBatchNames: string[] | null = null;
  if (programId) {
    const { data: pb, error: pbErr } = await sb.from('program_batches').select('batch_name').eq('program_id', String(programId));
    if (pbErr) throw pbErr;
    resolvedBatchNames = (pb ?? []).map((r: any) => r.batch_name).filter(Boolean);
  }

  let q = sb.from('crm_leads').select('*');

  if (batchName && batchName !== 'all') {
    if (resolvedBatchNames && !resolvedBatchNames.includes(batchName)) return [];
    q = q.eq('batch_name', batchName);
  } else if (resolvedBatchNames) {
    if (resolvedBatchNames.length === 0) return [];
    q = q.in('batch_name', resolvedBatchNames);
  }

  if (sheetName) q = q.eq('sheet_name', sheetName);
  if (status) q = q.eq('status', status);
  if (assignedTo) q = q.eq('assigned_to', cleanStr(assignedTo));
  if (search) {
    const s = `%${search}%`;
    q = q.or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
  }

  const { data, error } = await q
    .order('sheet_row_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true, nullsFirst: false })
    .order('sheet_lead_id', { ascending: true });
  if (error) throw error;

  const leads = (data ?? []).map(rowToLead);
  if (batchName && batchName !== 'all') {
    try {
      const dupSet = await getDupSet(sb, batchName);
      return leads.map((l: any) => applyDup(l, dupSet));
    } catch (_) {}
  }
  return leads;
}

// ---------------------------------------------------------------------------
// UPDATE helpers
// ---------------------------------------------------------------------------

async function updateMyLead(sb: any, { officerName, batchName, sheetName, sheetLeadId, updates }: any): Promise<any> {
  if (!officerName) throw mkErr('Missing officerName', 400);
  if (!batchName || !sheetName || !sheetLeadId) throw mkErr('Missing batchName/sheetName/leadId', 400);

  const { data: existing, error: exErr } = await sb
    .from('crm_leads').select('id, assigned_to, management_json')
    .eq('batch_name', batchName).eq('sheet_name', sheetName)
    .eq('sheet_lead_id', sheetLeadId).maybeSingle();
  if (exErr) throw exErr;
  if (!existing) throw mkErr('Lead not found', 404);
  if (cleanStr(existing.assigned_to) !== cleanStr(officerName)) throw mkErr('Forbidden: lead not assigned to you', 403);

  const mgmtUpdates = pickMgmtFields(updates ?? {});
  const mergedMgmt = { ...(existing.management_json ?? {}), ...mgmtUpdates };

  const patch: Record<string, any> = { management_json: mergedMgmt, updated_at: new Date().toISOString() };
  if (updates.status !== undefined) patch.status = cleanStr(updates.status) || 'New';
  if (mgmtUpdates.priority !== undefined) patch.priority = cleanStr(mgmtUpdates.priority);
  if (mgmtUpdates.callFeedback !== undefined) patch.call_feedback = cleanStr(mgmtUpdates.callFeedback);
  if (mgmtUpdates.nextFollowUp !== undefined) patch.next_follow_up = cleanStr(mgmtUpdates.nextFollowUp);
  if (mgmtUpdates.lastFollowUpComment !== undefined) patch.last_follow_up_comment = cleanStr(mgmtUpdates.lastFollowUpComment);
  if (mgmtUpdates.pdfSent !== undefined) patch.pdf_sent = toBool(mgmtUpdates.pdfSent);
  if (mgmtUpdates.waSent !== undefined) patch.wa_sent = toBool(mgmtUpdates.waSent);
  if (mgmtUpdates.emailSent !== undefined) patch.email_sent = toBool(mgmtUpdates.emailSent);

  const { data: updated, error } = await sb.from('crm_leads').update(patch).eq('id', existing.id).select('*').single();
  if (error) throw error;
  return rowToLead(updated);
}

async function updateAdminLead(sb: any, { batchName, sheetName, sheetLeadId, updates }: any): Promise<any> {
  if (!batchName || !sheetName || !sheetLeadId) throw mkErr('Missing batchName/sheetName/leadId', 400);

  const { data: existing, error: exErr } = await sb
    .from('crm_leads').select('id, management_json, assigned_to, phone')
    .eq('batch_name', batchName).eq('sheet_name', sheetName)
    .eq('sheet_lead_id', sheetLeadId).maybeSingle();
  if (exErr) throw exErr;
  if (!existing) throw mkErr('Lead not found', 404);

  const mgmtUpdates = pickMgmtFields(updates ?? {});
  const mergedMgmt = { ...(existing.management_json ?? {}), ...mgmtUpdates };

  const patch: Record<string, any> = { management_json: mergedMgmt, updated_at: new Date().toISOString() };

  if (updates.assignedTo !== undefined) {
    const next = cleanStr(updates.assignedTo);
    if (next) {
      const isDup = await isDupLead(sb, batchName, sheetLeadId);
      if (isDup) throw mkErr('Cannot assign this lead because the phone number is duplicated in this batch', 409);
    }
    patch.assigned_to = next;
  }
  if (updates.status !== undefined) patch.status = cleanStr(updates.status) || 'New';
  if (mgmtUpdates.priority !== undefined) patch.priority = cleanStr(mgmtUpdates.priority);
  if (mgmtUpdates.callFeedback !== undefined) patch.call_feedback = cleanStr(mgmtUpdates.callFeedback);
  if (mgmtUpdates.nextFollowUp !== undefined) patch.next_follow_up = cleanStr(mgmtUpdates.nextFollowUp);
  if (mgmtUpdates.lastFollowUpComment !== undefined) patch.last_follow_up_comment = cleanStr(mgmtUpdates.lastFollowUpComment);
  if (mgmtUpdates.pdfSent !== undefined) patch.pdf_sent = toBool(mgmtUpdates.pdfSent);
  if (mgmtUpdates.waSent !== undefined) patch.wa_sent = toBool(mgmtUpdates.waSent);
  if (mgmtUpdates.emailSent !== undefined) patch.email_sent = toBool(mgmtUpdates.emailSent);

  const { data: updated, error } = await sb.from('crm_leads').update(patch).eq('id', existing.id).select('*').single();
  if (error) throw error;

  clearDupCache(batchName);

  try {
    const prev = cleanStr(existing?.assigned_to);
    const next = cleanStr(updated?.assigned_to);
    if (updates?.assignedTo !== undefined && prev !== next && next) {
      await notifyAssignment(sb, next, 1, batchName, sheetName);
    }
  } catch (_) {}

  return rowToLead(updated);
}

// ---------------------------------------------------------------------------
// CREATE helpers
// ---------------------------------------------------------------------------

async function createAdminLead(sb: any, { batchName, sheetName, lead }: any): Promise<any> {
  if (!batchName || !sheetName) throw mkErr('Missing batchName/sheetName', 400);
  const sheetLeadId = cleanStr(lead?.id) || String(Date.now());
  const phone = cleanStr(lead?.phone);
  let assignedTo = cleanStr(lead?.assignedTo);

  if (phone && assignedTo) {
    const canon = normalizePhoneToSL(phone);
    if (canon && canon.length >= 9) {
      const last9 = canon.slice(-9);
      const { data: existing } = await sb.from('crm_leads').select('sheet_lead_id, phone')
        .eq('batch_name', batchName).ilike('phone', `%${last9}`).order('created_at', { ascending: true }).limit(10);
      for (const r of (existing ?? [])) {
        if (normalizePhoneToSL(r.phone) === canon) { assignedTo = 'Duplicate'; break; }
      }
    }
  }

  const row: Record<string, any> = {
    batch_name: batchName, sheet_name: sheetName, sheet_lead_id: sheetLeadId,
    name: cleanStr(lead?.name), email: cleanStr(lead?.email), phone,
    source: cleanStr(lead?.source), status: cleanStr(lead?.status) || 'New',
    priority: cleanStr(lead?.priority), notes: cleanStr(lead?.notes),
    assigned_to: assignedTo,
    created_at: new Date().toISOString(), created_date: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const course = cleanStr(lead?.course);
  if (course) row.intake_json = { course };

  const { data, error } = await sb.from('crm_leads').insert(row).select('*').single();
  if (error) throw error;
  clearDupCache(batchName);
  const apiLead = rowToLead(data);
  try { return applyDup(apiLead, await getDupSet(sb, batchName)); } catch (_) { return apiLead; }
}

async function createOfficerLead(sb: any, { officerName, batchName, sheetName, lead }: any): Promise<any> {
  if (!officerName) throw mkErr('Missing officerName', 400);
  if (!batchName || batchName === 'all' || !sheetName) throw mkErr('Missing batchName/sheetName', 400);
  await assertOfficerSheet(sb, { batchName, sheetName, officerName });

  const sheetLeadId = cleanStr(lead?.id) || String(Date.now());
  const phone = cleanStr(lead?.phone);
  const row: Record<string, any> = {
    batch_name: batchName, sheet_name: sheetName, sheet_lead_id: sheetLeadId,
    name: cleanStr(lead?.name), email: cleanStr(lead?.email), phone,
    source: cleanStr(lead?.source), status: cleanStr(lead?.status) || 'New',
    priority: cleanStr(lead?.priority), notes: cleanStr(lead?.notes),
    assigned_to: officerName,
    created_at: new Date().toISOString(), created_date: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const course = cleanStr(lead?.course);
  if (course) row.intake_json = { course };

  const { data, error } = await sb.from('crm_leads').insert(row).select('*').single();
  if (error) throw error;
  clearDupCache(batchName);
  const apiLead = rowToLead(data);
  try { return applyDup(apiLead, await getDupSet(sb, batchName)); } catch (_) { return apiLead; }
}

// ---------------------------------------------------------------------------
// Officer sheet guard
// ---------------------------------------------------------------------------

async function assertOfficerSheet(sb: any, { batchName, sheetName, officerName }: any): Promise<void> {
  const b = cleanStr(batchName);
  const s = normalizeSheetName(sheetName);
  const off = cleanStr(officerName);
  if (!b || !s) throw mkErr('Missing batch/sheet', 400);
  const low = s.toLowerCase();
  if (['main leads', 'extra leads'].includes(low))
    throw mkErr('Officers cannot add/delete leads in Main Leads / Extra Leads', 403);
  if (!off) throw mkErr('Missing officer name', 400);

  const { data: mine, error: mineErr } = await sb
    .from('officer_custom_sheets').select('sheet_name')
    .eq('batch_name', b).eq('officer_name', off).eq('sheet_name', s).maybeSingle();
  if (mineErr) {
    const msg = String(mineErr.message ?? '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist'))
      throw mkErr('Officer custom sheets table not found', 500);
    throw mineErr;
  }
  if (!mine) throw mkErr('Officers can only add/delete leads in sheets they created', 403);
}

// ---------------------------------------------------------------------------
// BULK operations
// ---------------------------------------------------------------------------

async function bulkAssignAdmin(sb: any, { batchName, sheetName, leadIds, assignedTo }: any) {
  const ids = normalizeLeadIds(leadIds);
  if (!batchName || !sheetName) throw mkErr('Missing batchName/sheetName', 400);
  if (!ids.length) return { updatedCount: 0, skippedDuplicateCount: 0, skippedDuplicateLeadIds: [] };

  const { data: phones, error: phErr } = await sb.from('crm_leads').select('sheet_lead_id, phone')
    .eq('batch_name', batchName).in('sheet_lead_id', ids);
  if (phErr) throw phErr;

  const dupSet = await getDupSet(sb, batchName);
  const assignable: string[] = [], skipped: string[] = [];
  (phones ?? []).forEach((r: any) => {
    const id = String(r.sheet_lead_id);
    if (dupSet.has(id)) skipped.push(id); else assignable.push(id);
  });
  if (!assignable.length) return { updatedCount: 0, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };

  const { data, error } = await sb.from('crm_leads')
    .update({ assigned_to: cleanStr(assignedTo), updated_at: new Date().toISOString() })
    .eq('batch_name', batchName).eq('sheet_name', sheetName).in('sheet_lead_id', assignable).select('id');
  if (error) throw error;
  clearDupCache(batchName);
  try { if (cleanStr(assignedTo)) await notifyAssignment(sb, cleanStr(assignedTo), (data ?? []).length, batchName, sheetName); } catch (_) {}
  return { updatedCount: (data ?? []).length, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };
}

async function bulkDistributeAdmin(sb: any, { batchName, sheetName, leadIds, officers }: any) {
  const ids = normalizeLeadIds(leadIds).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const offs = Array.isArray(officers) ? officers.map(cleanStr).filter(Boolean) : [];
  if (!batchName || !sheetName) throw mkErr('Missing batchName/sheetName', 400);
  if (!ids.length) return { updatedCount: 0, skippedDuplicateCount: 0, skippedDuplicateLeadIds: [] };
  if (!offs.length) throw mkErr('Missing officers list', 400);

  const { data: phones, error: phErr } = await sb.from('crm_leads').select('sheet_lead_id, phone')
    .eq('batch_name', batchName).in('sheet_lead_id', ids);
  if (phErr) throw phErr;

  const dupSet = await getDupSet(sb, batchName);
  const distributable: string[] = [], skipped: string[] = [];
  (phones ?? []).forEach((r: any) => {
    const id = String(r.sheet_lead_id);
    if (dupSet.has(id)) skipped.push(id); else distributable.push(id);
  });
  if (!distributable.length) return { updatedCount: 0, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };

  const patches = distributable.map((id, idx) => ({
    batch_name: batchName, sheet_name: sheetName, sheet_lead_id: id, assigned_to: offs[idx % offs.length],
  }));

  const { error: uErr } = await sb.from('crm_leads')
    .upsert(patches, { onConflict: 'batch_name,sheet_name,sheet_lead_id', ignoreDuplicates: false });
  clearDupCache(batchName);
  if (uErr) {
    let count = 0;
    for (const p of patches) {
      const { data, error } = await sb.from('crm_leads')
        .update({ assigned_to: p.assigned_to, updated_at: new Date().toISOString() })
        .eq('batch_name', p.batch_name).eq('sheet_name', p.sheet_name).eq('sheet_lead_id', p.sheet_lead_id).select('id');
      if (error) throw error;
      count += (data ?? []).length;
    }
    return { updatedCount: count, fallback: true, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };
  }
  return { updatedCount: distributable.length, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };
}

async function distributeUnassigned(sb: any, { batchName, sheetName, officers }: any) {
  const offs = Array.isArray(officers) ? officers.map(cleanStr).filter(Boolean) : [];
  if (!batchName || !sheetName) throw mkErr('Missing batchName/sheetName', 400);
  if (!offs.length) throw mkErr('Missing officers list', 400);
  const { data: unassigned, error } = await sb.from('crm_leads').select('*')
    .eq('batch_name', batchName).eq('sheet_name', sheetName)
    .or('assigned_to.is.null,assigned_to.eq.').order('sheet_lead_id', { ascending: true });
  if (error) throw error;
  const ids = (unassigned ?? []).map((r: any) => String(r.sheet_lead_id)).filter(Boolean);
  if (!ids.length) return { updatedCount: 0 };
  return bulkDistributeAdmin(sb, { batchName, sheetName, leadIds: ids, officers: offs });
}

async function bulkDeleteAdmin(sb: any, { batchName, sheetName, leadIds }: any) {
  const ids = normalizeLeadIds(leadIds);
  if (!batchName || !sheetName) throw mkErr('Missing batchName/sheetName', 400);
  if (!ids.length) return { deletedCount: 0 };
  const { data, error } = await sb.from('crm_leads').delete()
    .eq('batch_name', batchName).eq('sheet_name', sheetName).in('sheet_lead_id', ids).select('id');
  if (error) throw error;
  return { deletedCount: (data ?? []).length };
}

async function bulkDeleteMy(sb: any, { officerName, batchName, sheetName, leadIds }: any) {
  const off = cleanStr(officerName);
  const ids = normalizeLeadIds(leadIds);
  if (!off) throw mkErr('Missing officerName', 400);
  if (!batchName || !sheetName) throw mkErr('Missing batchName/sheetName', 400);
  await assertOfficerSheet(sb, { batchName, sheetName, officerName: off });
  if (!ids.length) return { deletedCount: 0 };
  const { data, error } = await sb.from('crm_leads').delete()
    .eq('batch_name', batchName).eq('sheet_name', sheetName).eq('assigned_to', off).in('sheet_lead_id', ids).select('id');
  if (error) throw error;
  clearDupCache(batchName);
  return { deletedCount: (data ?? []).length };
}

// ---------------------------------------------------------------------------
// COPY helpers
// ---------------------------------------------------------------------------

async function copyLeadRow(sb: any, { sourceRow, targetBatchName, targetSheetName, assignedToOverride }: any): Promise<any> {
  const now = new Date().toISOString();
  const newId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const row: Record<string, any> = {
    batch_name: cleanStr(targetBatchName), sheet_name: normalizeSheetName(targetSheetName),
    sheet_lead_id: newId, name: cleanStr(sourceRow?.name), email: cleanStr(sourceRow?.email),
    phone: cleanStr(sourceRow?.phone), source: cleanStr(sourceRow?.source),
    status: cleanStr(sourceRow?.status) || 'New', priority: cleanStr(sourceRow?.priority),
    notes: cleanStr(sourceRow?.notes), management_json: null,
    intake_json: (sourceRow?.intake_json && typeof sourceRow.intake_json === 'object') ? sourceRow.intake_json : null,
    assigned_to: assignedToOverride !== undefined ? cleanStr(assignedToOverride) : cleanStr(sourceRow?.assigned_to),
    created_at: now, created_date: now, updated_at: now,
  };
  const { data, error } = await sb.from('crm_leads').insert(row).select('*').single();
  if (error) throw error;
  clearDupCache(targetBatchName);
  const apiLead = rowToLead(data);
  try { return applyDup(apiLead, await getDupSet(sb, targetBatchName)); } catch (_) { return apiLead; }
}

async function copyAdminLead(sb: any, { sourceBatchName, sourceSheetName, sourceLeadId, targetBatchName, targetSheetName }: any) {
  const srcBatch = cleanStr(sourceBatchName), tgtBatch = cleanStr(targetBatchName);
  if (tgtBatch && tgtBatch === srcBatch) throw mkErr('Cannot copy to the same batch', 400);
  const { data: src, error } = await sb.from('crm_leads').select('*')
    .eq('batch_name', srcBatch).eq('sheet_name', normalizeSheetName(sourceSheetName))
    .eq('sheet_lead_id', cleanStr(sourceLeadId)).single();
  if (error) throw error;
  return copyLeadRow(sb, { sourceRow: src, targetBatchName, targetSheetName });
}

async function copyMyLead(sb: any, { officerName, sourceBatchName, sourceSheetName, sourceLeadId, targetBatchName, targetSheetName }: any) {
  const off = cleanStr(officerName);
  if (!off) throw mkErr('Missing officerName', 400);
  const tgtBatch = cleanStr(targetBatchName), srcBatch = cleanStr(sourceBatchName);
  if (tgtBatch && tgtBatch === srcBatch) throw mkErr('Cannot copy to the same batch', 400);
  await assertOfficerSheet(sb, { batchName: tgtBatch, sheetName: targetSheetName, officerName: off });
  const { data: src, error } = await sb.from('crm_leads').select('*')
    .eq('batch_name', srcBatch).eq('sheet_name', normalizeSheetName(sourceSheetName))
    .eq('sheet_lead_id', cleanStr(sourceLeadId)).single();
  if (error) throw error;
  if (cleanStr(src.assigned_to) !== off) throw mkErr('Forbidden: lead not assigned to you', 403);
  return copyLeadRow(sb, { sourceRow: src, targetBatchName, targetSheetName, assignedToOverride: off });
}

function normCopySources(sources: unknown): Array<{ batchName: string; sheetName: string; leadId: string }> {
  const arr = Array.isArray(sources) ? sources : [];
  return arr.map((s: any) => ({
    batchName: cleanStr(s?.batchName),
    sheetName: normalizeSheetName(s?.sheetName || 'Main Leads'),
    leadId: cleanStr(s?.leadId),
  })).filter((s) => s.batchName && s.sheetName && s.leadId);
}

async function copyAdminLeadsBulk(sb: any, { sources, targetBatchName, targetSheetName }: any) {
  const tgtBatch = cleanStr(targetBatchName);
  const srcs = normCopySources(sources);
  if (!srcs.length) throw mkErr('No leads selected', 400);
  if (srcs.some(s => s.batchName === tgtBatch)) throw mkErr('Cannot copy to the same batch', 400);
  const leadIds = srcs.map(s => s.leadId);
  const batches = [...new Set(srcs.map(s => s.batchName))];
  const { data: rows, error } = await sb.from('crm_leads').select('*').in('sheet_lead_id', leadIds).in('batch_name', batches);
  if (error) throw error;
  const map = new Map((rows ?? []).map((r: any) => [`${r.batch_name}||${normalizeSheetName(r.sheet_name)}||${r.sheet_lead_id}`, r]));
  const created: any[] = [];
  for (const s of srcs) {
    const src = map.get(`${s.batchName}||${s.sheetName}||${s.leadId}`);
    if (!src) continue;
    created.push(await copyLeadRow(sb, { sourceRow: src, targetBatchName, targetSheetName }));
  }
  return { createdCount: created.length, leads: created };
}

async function copyMyLeadsBulk(sb: any, { officerName, sources, targetBatchName, targetSheetName }: any) {
  const off = cleanStr(officerName);
  if (!off) throw mkErr('Missing officerName', 400);
  const tgtBatch = cleanStr(targetBatchName);
  await assertOfficerSheet(sb, { batchName: tgtBatch, sheetName: targetSheetName, officerName: off });
  const srcs = normCopySources(sources);
  if (!srcs.length) throw mkErr('No leads selected', 400);
  if (srcs.some(s => s.batchName === tgtBatch)) throw mkErr('Cannot copy to the same batch', 400);
  const leadIds = srcs.map(s => s.leadId);
  const batches = [...new Set(srcs.map(s => s.batchName))];
  const { data: rows, error } = await sb.from('crm_leads').select('*').in('sheet_lead_id', leadIds).in('batch_name', batches);
  if (error) throw error;
  const map = new Map((rows ?? []).map((r: any) => [`${r.batch_name}||${normalizeSheetName(r.sheet_name)}||${r.sheet_lead_id}`, r]));
  const created: any[] = [];
  for (const s of srcs) {
    const src = map.get(`${s.batchName}||${s.sheetName}||${s.leadId}`);
    if (!src) continue;
    if (cleanStr(src.assigned_to) !== off) throw mkErr('Forbidden: one or more leads not assigned to you', 403);
    created.push(await copyLeadRow(sb, { sourceRow: src, targetBatchName, targetSheetName, assignedToOverride: off }));
  }
  return { createdCount: created.length, leads: created };
}

// ---------------------------------------------------------------------------
// CSV export / import
// ---------------------------------------------------------------------------

function toCsvVal(v: unknown): string {
  const s = String(v ?? '');
  if (/[\n\r,"]/g.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportCsv(sb: any, { batchName, sheetName, search, status }: any): Promise<string> {
  const leads = await listAdminLeads(sb, { batchName, sheetName, search, status, assignedTo: null, programId: null });
  const headers = ['batch','sheet','id','name','email','phone','source','status','priority','assignedTo','notes'];
  const lines = [headers.join(',')];
  for (const l of leads) {
    lines.push([l.batch,l.sheet,l.id,l.name,l.email,l.phone,l.source,l.status,l.priority,l.assignedTo,l.notes].map(toCsvVal).join(','));
  }
  return lines.join('\n');
}

function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let i = 0, cur = '', inQ = false, row: string[] = [];
  const text = String(csvText ?? '');
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i+1] === '"') { cur += '"'; i += 2; continue; } inQ = false; i++; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { row.push(cur); cur = ''; i++; continue; }
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    cur += ch; i++;
  }
  row.push(cur);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

async function importCsv(sb: any, { batchName, sheetName, csvText }: any) {
  if (!batchName || !sheetName) throw mkErr('Missing batchName/sheetName', 400);
  const rows = parseCsv(csvText);
  if (!rows.length) return { importedCount: 0 };
  const headers = rows[0].map(h => String(h ?? '').trim());
  const idx = (h: string) => headers.findIndex(x => x.toLowerCase() === h.toLowerCase());
  const idIdx = idx('id');
  if (idIdx === -1) throw mkErr('CSV must include id column', 400);
  const patches: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = String(row[idIdx] ?? '').trim();
    if (!id) continue;
    patches.push({
      batch_name: batchName, sheet_name: sheetName, sheet_lead_id: id,
      name: String(row[idx('name')] ?? ''), email: String(row[idx('email')] ?? ''),
      phone: String(row[idx('phone')] ?? ''), source: String(row[idx('source')] ?? ''),
      status: String(row[idx('status')] ?? ''), notes: String(row[idx('notes')] ?? ''),
      assigned_to: String(row[idx('assignedTo')] ?? row[idx('assigned_to')] ?? ''),
      priority: String(row[idx('priority')] ?? ''), updated_at: new Date().toISOString(),
    });
  }
  if (!patches.length) return { importedCount: 0 };
  const { error } = await sb.from('crm_leads').upsert(patches, { onConflict: 'batch_name,sheet_name,sheet_lead_id', ignoreDuplicates: false });
  if (error) throw error;
  clearDupCache(batchName);
  return { importedCount: patches.length };
}

// ---------------------------------------------------------------------------
// METADATA – batches / sheets
// ---------------------------------------------------------------------------

async function listAdminBatches(sb: any, { assignedTo }: any): Promise<string[]> {
  let q = sb.from('crm_leads').select('batch_name');
  if (assignedTo) q = q.eq('assigned_to', cleanStr(assignedTo));
  const { data, error } = await q;
  if (error) throw error;
  const set = new Set<string>((data ?? []).map((r: any) => r.batch_name).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

async function listAdminSheets(sb: any, { assignedTo, batchName }: any): Promise<string[]> {
  const excluded = new Set(['registrations', 'registration']);
  let q = sb.from('crm_leads').select('sheet_name, batch_name, assigned_to');
  if (assignedTo) q = q.eq('assigned_to', cleanStr(assignedTo));
  if (batchName) q = q.eq('batch_name', cleanStr(batchName));
  const { data, error } = await q;
  if (error) throw error;
  const set = new Set<string>((data ?? []).map((r: any) => normalizeSheetName(r.sheet_name)).filter(Boolean).filter((s: string) => !excluded.has(s.toLowerCase())));
  try {
    let oq = sb.from('officer_custom_sheets').select('sheet_name, officer_name, batch_name');
    if (batchName) oq = oq.eq('batch_name', cleanStr(batchName));
    if (assignedTo) oq = oq.eq('officer_name', cleanStr(assignedTo));
    const { data: oSheets } = await oq;
    (oSheets ?? []).map((r: any) => normalizeSheetName(r.sheet_name)).filter(Boolean).filter((s: string) => !excluded.has(s.toLowerCase())).forEach((s: string) => set.add(s));
  } catch (_) {}
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

async function listSheetsForBatch(sb: any, { batchName, user }: any): Promise<string[]> {
  const b = cleanStr(batchName);
  if (!b) throw mkErr('batch is required', 400);
  const defaults = ['Main Leads', 'Extra Leads'];
  const isAdm = isAdmin(user);
  const officerName = userName(user);
  const excluded = new Set(['registrations', 'registration']);

  let allOfficerCustom = new Set<string>(), myCustom = new Set<string>();
  try {
    const { data: allCustom } = await sb.from('officer_custom_sheets').select('sheet_name, officer_name').eq('batch_name', b);
    (allCustom ?? []).forEach((r: any) => {
      const s = normalizeSheetName(r.sheet_name); if (!s) return;
      allOfficerCustom.add(s);
      if (!isAdm && officerName && r.officer_name === officerName) myCustom.add(s);
    });
  } catch (_) {}

  const { data: leadSheets, error: lErr } = await sb.from('crm_leads').select('sheet_name').eq('batch_name', b);
  if (lErr) throw lErr;

  const set = new Set<string>(defaults);
  (leadSheets ?? []).map((r: any) => normalizeSheetName(r.sheet_name)).filter(Boolean).forEach((s: string) => {
    if (allOfficerCustom.has(s)) return;
    set.add(s);
  });

  try {
    const { data: shared } = await sb.from('batch_shared_sheets').select('sheet_name').eq('batch_name', b);
    (shared ?? []).map((r: any) => normalizeSheetName(r.sheet_name)).filter(Boolean).forEach((s: string) => set.add(s));
  } catch (_) {}

  if (!isAdm && officerName) myCustom.forEach(s => set.add(s));

  return Array.from(set).filter(s => !excluded.has(normalizeSheetName(s).toLowerCase())).sort((a, c) => a.localeCompare(c));
}

async function createSheet(sb: any, { batchName, sheetName, scope, user }: any) {
  const b = cleanStr(batchName);
  if (!b) throw mkErr('batchName is required', 400);
  const s = validateSheetName(sheetName);
  const sc = String(scope ?? '').toLowerCase();

  if (isAdmin(user) && sc === 'admin') {
    await sb.from('batch_shared_sheets').upsert({ batch_name: b, sheet_name: s, created_by: userName(user) || null }, { onConflict: 'batch_name,sheet_name' });
    return { sheetName: s, scope: 'admin' };
  }

  const officerName = userName(user);
  const userId = user?.id;
  if (!officerName) throw mkErr('Missing officer name', 400);
  await sb.from('officer_custom_sheets').upsert({
    batch_name: b, officer_name: officerName, sheet_name: s,
    created_by_user_id: userId ?? null, created_at: new Date().toISOString(),
  }, { onConflict: 'batch_name,officer_name,sheet_name' });
  return { sheetName: s, scope: 'officer' };
}

async function deleteSheet(sb: any, { batchName, sheetName, scope, user }: any) {
  const b = cleanStr(batchName);
  const sheet = normalizeSheetName(sheetName);
  if (!b) throw mkErr('batch is required', 400);
  if (!sheet) throw mkErr('sheet is required', 400);
  const low = sheet.toLowerCase();
  if (['main leads', 'extra leads'].includes(low)) throw mkErr('Cannot delete default sheets', 400);

  const sc = String(scope ?? '').toLowerCase();
  if (isAdmin(user) && sc === 'admin') {
    await sb.from('crm_leads').delete().eq('batch_name', b).eq('sheet_name', sheet);
    await sb.from('batch_shared_sheets').delete().eq('batch_name', b).eq('sheet_name', sheet);
    await sb.from('officer_custom_sheets').delete().eq('batch_name', b).eq('sheet_name', sheet);
    clearDupCache(b);
    return { deleted: true, scope: 'admin', sheetName: sheet };
  }

  const officerName = userName(user);
  const userId = user?.id;
  if (!officerName && !userId) throw mkErr('Missing officer identification', 400);

  const { data: allSheets, error: listErr } = await sb.from('officer_custom_sheets')
    .select('sheet_name, officer_name, created_by_user_id').eq('batch_name', b);
  if (listErr) throw listErr;

  const ownerCheck = (allSheets ?? []).find((s: any) => normalizeSheetName(s.sheet_name) === sheet);
  if (!ownerCheck) throw mkErr('Sheet not found', 404);

  const nameMatch = ownerCheck.officer_name === officerName;
  const idMatch = userId && ownerCheck.created_by_user_id === userId;
  if (!nameMatch && !idMatch) throw mkErr('You can only delete sheets that you created', 403);

  await sb.from('crm_leads').delete().eq('batch_name', b).eq('sheet_name', sheet).eq('assigned_to', officerName);
  await sb.from('officer_custom_sheets').delete().eq('batch_name', b).eq('officer_name', officerName).eq('sheet_name', sheet);
  clearDupCache(b);
  return { deleted: true, scope: 'officer', sheetName: sheet };
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url = new URL(req.url);
  // Strip the function prefix so pathname starts at /crm-leads/...
  // Edge function URL: /functions/v1/crm-leads/...
  // After stripping we work with segments after "crm-leads"
  const fullPath = url.pathname; // e.g. /functions/v1/crm-leads/admin
  const afterFn = fullPath.replace(/^\/functions\/v1\/crm-leads\/?/, '').replace(/^crm-leads\/?/, '');
  // afterFn examples: "admin", "my", "admin/meta/batches", "admin/Batch-14/Main Leads/123"
  const method = req.method.toUpperCase();

  const sb = adminSb();

  // Auth
  const user = await getUser(req);

  try {
    // -----------------------------------------------------------------------
    // OPTIONS already handled above via handleCors
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // GET /meta/sheets?batch=...
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'meta/sheets') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const batchName = url.searchParams.get('batch') ?? '';
      const sheets = await listSheetsForBatch(sb, { batchName, user });
      return jsonResp({ success: true, sheets });
    }

    // POST /meta/sheets { batchName, sheetName, scope }
    if (method === 'POST' && afterFn === 'meta/sheets') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const result = await createSheet(sb, { batchName: body.batchName, sheetName: body.sheetName, scope: body.scope, user });
      return jsonResp({ success: true, ...result }, 201);
    }

    // DELETE /meta/sheets?batch=...&sheet=...&scope=...
    if (method === 'DELETE' && afterFn === 'meta/sheets') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const result = await deleteSheet(sb, {
        batchName: url.searchParams.get('batch'), sheetName: url.searchParams.get('sheet'),
        scope: url.searchParams.get('scope'), user,
      });
      return jsonResp({ success: true, ...result });
    }

    // -----------------------------------------------------------------------
    // GET /admin/meta/batches?assignedTo=...
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'admin/meta/batches') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const assignedTo = url.searchParams.get('assignedTo') ?? url.searchParams.get('officer');
      const batches = await listAdminBatches(sb, { assignedTo });
      return jsonResp({ success: true, batches });
    }

    // GET /admin/meta/sheets?assignedTo=...&batch=...
    if (method === 'GET' && afterFn === 'admin/meta/sheets') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const assignedTo = url.searchParams.get('assignedTo') ?? url.searchParams.get('officer');
      const batchName = url.searchParams.get('batch');
      const sheets = await listAdminSheets(sb, { assignedTo, batchName });
      return jsonResp({ success: true, sheets });
    }

    // -----------------------------------------------------------------------
    // GET /admin/export.csv
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'admin/export.csv') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const csv = await exportCsv(sb, {
        batchName: url.searchParams.get('batch'), sheetName: url.searchParams.get('sheet'),
        search: url.searchParams.get('search'), status: url.searchParams.get('status'),
      });
      return new Response(csv, {
        headers: { ...corsHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads-export.csv"' },
      });
    }

    // -----------------------------------------------------------------------
    // POST /admin/import
    // -----------------------------------------------------------------------
    if (method === 'POST' && afterFn === 'admin/import') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const result = await importCsv(sb, { batchName: body.batchName, sheetName: body.sheetName, csvText: body.csvText });
      return jsonResp({ success: true, ...result });
    }

    // -----------------------------------------------------------------------
    // POST /admin/create
    // -----------------------------------------------------------------------
    if (method === 'POST' && afterFn === 'admin/create') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const lead = await createAdminLead(sb, { batchName: body.batchName, sheetName: body.sheetName, lead: body.lead ?? {} });
      return jsonResp({ success: true, lead }, 201);
    }

    // POST /admin/copy
    if (method === 'POST' && afterFn === 'admin/copy') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const lead = await copyAdminLead(sb, { sourceBatchName: body.source?.batchName, sourceSheetName: body.source?.sheetName, sourceLeadId: body.source?.leadId, targetBatchName: body.target?.batchName, targetSheetName: body.target?.sheetName });
      return jsonResp({ success: true, lead }, 201);
    }

    // POST /admin/copy-bulk
    if (method === 'POST' && afterFn === 'admin/copy-bulk') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const result = await copyAdminLeadsBulk(sb, { sources: body.sources, targetBatchName: body.target?.batchName, targetSheetName: body.target?.sheetName });
      return jsonResp({ success: true, ...result }, 201);
    }

    // POST /admin/distribute-unassigned
    if (method === 'POST' && afterFn === 'admin/distribute-unassigned') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const result = await distributeUnassigned(sb, { batchName: body.batchName, sheetName: body.sheetName, officers: body.officers });
      return jsonResp({ success: true, ...result });
    }

    // POST /admin/bulk-assign
    if (method === 'POST' && afterFn === 'admin/bulk-assign') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const result = await bulkAssignAdmin(sb, { batchName: body.batchName, sheetName: body.sheetName, leadIds: body.leadIds, assignedTo: body.assignedTo });
      return jsonResp({ success: true, ...result });
    }

    // POST /admin/bulk-distribute
    if (method === 'POST' && afterFn === 'admin/bulk-distribute') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const result = await bulkDistributeAdmin(sb, { batchName: body.batchName, sheetName: body.sheetName, leadIds: body.leadIds, officers: body.officers });
      return jsonResp({ success: true, ...result });
    }

    // POST /admin/bulk-delete
    if (method === 'POST' && afterFn === 'admin/bulk-delete') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const result = await bulkDeleteAdmin(sb, { batchName: body.batchName, sheetName: body.sheetName, leadIds: body.leadIds });
      return jsonResp({ success: true, ...result });
    }

    // -----------------------------------------------------------------------
    // GET /admin?batch=...&sheet=...
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'admin') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const leads = await listAdminLeads(sb, {
        batchName: url.searchParams.get('batch'), sheetName: url.searchParams.get('sheet'),
        search: url.searchParams.get('search'), status: url.searchParams.get('status'),
        assignedTo: url.searchParams.get('assignedTo') ?? url.searchParams.get('officer'),
        programId: url.searchParams.get('programId'),
      });
      return jsonResp({ success: true, count: leads.length, leads });
    }

    // PUT /admin/:batchName/:sheetName/:leadId
    if (method === 'PUT' && afterFn.startsWith('admin/')) {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const parts = afterFn.split('/');
      // parts: ['admin', batchName, sheetName, leadId]
      const [, batchName, sheetName, leadId] = parts;
      if (!batchName || !sheetName || !leadId) return jsonResp({ success: false, error: 'Missing params' }, 400);
      const body = await req.json().catch(() => ({}));
      const lead = await updateAdminLead(sb, { batchName: decodeURIComponent(batchName), sheetName: decodeURIComponent(sheetName), sheetLeadId: decodeURIComponent(leadId), updates: body });
      return jsonResp({ success: true, lead });
    }

    // -----------------------------------------------------------------------
    // GET /my?batch=...
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'my') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const officerName = userName(user);
      if (!officerName) return jsonResp({ success: false, error: 'Officer name not found in user profile. Please contact administrator.' }, 400);
      const leads = await listMyLeads(sb, {
        officerName,
        batchName: url.searchParams.get('batch'), sheetName: url.searchParams.get('sheet'),
        search: url.searchParams.get('search'), status: url.searchParams.get('status'),
        programId: url.searchParams.get('programId'),
      });
      return jsonResp({ success: true, count: leads.length, leads });
    }

    // POST /my/create
    if (method === 'POST' && afterFn === 'my/create') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const officerName = userName(user);
      const body = await req.json().catch(() => ({}));
      const lead = await createOfficerLead(sb, { officerName, batchName: body.batchName, sheetName: body.sheetName, lead: body.lead ?? {} });
      return jsonResp({ success: true, lead }, 201);
    }

    // POST /my/copy
    if (method === 'POST' && afterFn === 'my/copy') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const officerName = userName(user);
      const body = await req.json().catch(() => ({}));
      const lead = await copyMyLead(sb, { officerName, sourceBatchName: body.source?.batchName, sourceSheetName: body.source?.sheetName, sourceLeadId: body.source?.leadId, targetBatchName: body.target?.batchName, targetSheetName: body.target?.sheetName });
      return jsonResp({ success: true, lead }, 201);
    }

    // POST /my/copy-bulk
    if (method === 'POST' && afterFn === 'my/copy-bulk') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const officerName = userName(user);
      const body = await req.json().catch(() => ({}));
      const result = await copyMyLeadsBulk(sb, { officerName, sources: body.sources, targetBatchName: body.target?.batchName, targetSheetName: body.target?.sheetName });
      return jsonResp({ success: true, ...result }, 201);
    }

    // POST /my/bulk-delete
    if (method === 'POST' && afterFn === 'my/bulk-delete') {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const officerName = userName(user);
      const body = await req.json().catch(() => ({}));
      const result = await bulkDeleteMy(sb, { officerName, batchName: body.batchName, sheetName: body.sheetName, leadIds: body.leadIds });
      return jsonResp({ success: true, ...result });
    }

    // PUT /my/:batchName/:sheetName/:leadId
    if (method === 'PUT' && afterFn.startsWith('my/')) {
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const officerName = userName(user);
      const parts = afterFn.split('/');
      // parts: ['my', batchName, sheetName, leadId]
      const [, batchName, sheetName, leadId] = parts;
      if (!batchName || !sheetName || !leadId) return jsonResp({ success: false, error: 'Missing params' }, 400);
      const body = await req.json().catch(() => ({}));
      const lead = await updateMyLead(sb, { officerName, batchName: decodeURIComponent(batchName), sheetName: decodeURIComponent(sheetName), sheetLeadId: decodeURIComponent(leadId), updates: body });
      return jsonResp({ success: true, lead });
    }

    // -----------------------------------------------------------------------
    // Fallback
    // -----------------------------------------------------------------------
    return jsonResp({ success: false, error: `Unknown route: ${method} /${afterFn}` }, 404);

  } catch (e: any) {
    console.error('[crm-leads edge fn error]', e?.message ?? e);
    return errResp(e);
  }
});
