/**
 * crm-followups Edge Function
 * Maps to: /api/crm-followups/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

function cleanStr(v: unknown): string { return v == null ? '' : String(v).trim(); }
function toNull(v: unknown): string | null { const s = cleanStr(v); return s || null; }

function parseDateTimeLocal(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// GET /admin/:officerUserId/:batchName/:sheetName/:leadId
router.get('/admin/:officerUserId/:batchName/:sheetName/:leadId', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { officerUserId, batchName, sheetName, leadId } = params;

  const { data, error } = await sb
    .from('crm_lead_followups')
    .select('*')
    .eq('officer_user_id', officerUserId)
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('sheet_lead_id', leadId)
    .order('sequence', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return successResponse({ followups: data ?? [] });
});

// GET /my/:batchName/:sheetName/:leadId
router.get('/my/:batchName/:sheetName/:leadId', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, leadId } = params;

  const { data, error } = await sb
    .from('crm_lead_followups')
    .select('*')
    .eq('officer_user_id', user.id)
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('sheet_lead_id', leadId)
    .order('sequence', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return successResponse({ followups: data ?? [] });
});

// POST /my/:batchName/:sheetName/:leadId
router.post('/my/:batchName/:sheetName/:leadId', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { batchName, sheetName, leadId } = params;
  const body = await req.json();
  const { sequence, ...payload } = body;

  const row: Record<string, unknown> = {
    officer_user_id: user.id,
    officer_name: user.name || null,
    batch_name: batchName,
    sheet_name: sheetName,
    sheet_lead_id: String(leadId),
    sequence: sequence ? Number(sequence) : null,
    channel: toNull(payload.channel),
    scheduled_at: parseDateTimeLocal(payload.scheduledAt ?? payload.scheduled_at ?? payload.schedule),
    actual_at: parseDateTimeLocal(payload.actualAt ?? payload.actual_at ?? payload.date),
    answered: (payload.answered === '' || payload.answered == null)
      ? null
      : (String(payload.answered).toLowerCase() === 'yes' || payload.answered === true),
    comment: toNull(payload.comment),
  };

  const { data, error } = await sb
    .from('crm_lead_followups')
    .upsert(row, { onConflict: 'batch_name,sheet_name,sheet_lead_id,officer_user_id,sequence' })
    .select('*')
    .single();

  if (error) throw error;
  return successResponse({ followup: data }, 201);
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
