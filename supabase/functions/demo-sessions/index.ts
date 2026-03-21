/**
 * demo-sessions Edge Function
 * Maps to: /api/demo-sessions/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAdminOrOfficer } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /sessions
router.get('/sessions', async (req) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');
  let q = sb.from('demo_sessions').select('*').order('demo_number', { ascending: true });
  if (batchName) q = q.eq('batch_name', batchName);
  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ sessions: data ?? [] });
});

// POST /sessions
router.post('/sessions', async (req) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { batchName, demoNumber, patch } = body;

  if (!batchName || !demoNumber) return errorResponse('batchName and demoNumber are required', 400);

  const { data: existing } = await sb.from('demo_sessions').select('*')
    .eq('batch_name', batchName).eq('demo_number', Number(demoNumber)).maybeSingle();

  let session: any;
  if (existing) {
    const { data, error } = await sb.from('demo_sessions')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select('*').single();
    if (error) throw error;
    session = data;
  } else {
    const { data, error } = await sb.from('demo_sessions').insert({
      batch_name: batchName,
      demo_number: Number(demoNumber),
      ...patch,
      created_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;
    session = data;
  }
  return successResponse({ session });
});

// GET /leads/:crmLeadId
router.get('/leads/:crmLeadId', async (req, params) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('demo_session_invites').select('*').eq('crm_lead_id', params.crmLeadId);
  if (error) throw error;
  return successResponse({ items: data ?? [] });
});

// GET /invites
router.get('/invites', async (req) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const demoSessionId = url.searchParams.get('sessionId');
  const isAdmin = user.role === 'admin';
  const officerId = isAdmin ? (url.searchParams.get('officerId') ?? '') : user.id;

  let q = sb.from('demo_session_invites').select('*').order('created_at', { ascending: false });
  if (demoSessionId) q = q.eq('demo_session_id', demoSessionId);
  if (officerId) q = q.eq('officer_user_id', officerId);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ invites: data ?? [] });
});

// POST /invite
router.post('/invite', async (req) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { batchName, demoNumber, lead, link, officerUserId } = body;

  // Find or create session
  let { data: session } = await sb.from('demo_sessions').select('id')
    .eq('batch_name', batchName).eq('demo_number', Number(demoNumber)).maybeSingle();
  if (!session) {
    const { data: ns, error: nsErr } = await sb.from('demo_sessions').insert({
      batch_name: batchName, demo_number: Number(demoNumber), created_by: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select('id').single();
    if (nsErr) throw nsErr;
    session = ns;
  }

  const { data, error } = await sb.from('demo_session_invites').insert({
    demo_session_id: session.id,
    crm_lead_id: lead?.id ?? null,
    lead_name: lead?.name ?? null,
    lead_phone: lead?.phone ?? null,
    officer_user_id: officerUserId ?? user.id,
    invite_link: link ?? null,
    attendance: 'Invited',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  return successResponse({ invite: data, session }, 201);
});

// PATCH /invites/:id
router.patch('/invites/:id', async (req, params) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const patch = await req.json();
  const { data, error } = await sb.from('demo_session_invites')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ invite: data });
});

// DELETE /invites/:id
router.delete('/invites/:id', async (req, params) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('demo_session_invites').delete().eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ invite: data });
});

// GET /invites/:id/reminders
router.get('/invites/:id/reminders', async (req, params) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('demo_session_reminders').select('*').eq('invite_id', params.id).order('remind_at', { ascending: true });
  if (error) throw error;
  return successResponse({ reminders: data ?? [] });
});

// POST /invites/:id/reminders
router.post('/invites/:id/reminders', async (req, params) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('demo_session_reminders').insert({
    invite_id: params.id,
    remind_at: body.remindAt ?? new Date().toISOString(),
    note: body.note ?? null,
    created_by: user.id,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  return successResponse({ reminder: data }, 201);
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
