/**
 * calendar Edge Function
 * Maps to: /api/calendar/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /tasks
router.get('/tasks', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'me';
  const officer = url.searchParams.get('officer');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let q = sb.from('calendar_tasks').select('*').order('due_at', { ascending: true }).limit(500);

  if (user.role === 'admin') {
    if (mode === 'everyone') {
      // all tasks
    } else if (mode === 'officer' && officer) {
      q = q.eq('owner', officer);
    } else {
      q = q.or(`owner.eq.${user.name},visibility.eq.global`);
    }
  } else {
    q = q.or(`owner.eq.${user.name},visibility.eq.global`);
  }

  if (from) q = q.gte('due_at', from);
  if (to) q = q.lte('due_at', to);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ tasks: data ?? [] });
});

// POST /tasks
router.post('/tasks', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { title, dueAt, notes, repeat, visibility, ownerName } = body;

  if (!title || !dueAt) return errorResponse('title and dueAt are required', 400);

  const owner = (user.role === 'admin' && ownerName) ? ownerName : user.name;
  const safeVisibility = (user.role === 'admin' && visibility === 'global') ? 'global' : 'personal';
  const safeRepeat = ['none', 'daily', 'weekly', 'monthly'].includes(String(repeat ?? 'none')) ? String(repeat ?? 'none') : 'none';

  const { data, error } = await sb.from('calendar_tasks').insert({
    owner,
    title,
    due_at: dueAt,
    notes: notes ?? null,
    repeat: safeRepeat,
    visibility: safeVisibility,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  return successResponse({ task: data }, 201);
});

// DELETE /tasks/:id
router.delete('/tasks/:id', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();

  const { data: task } = await sb.from('calendar_tasks').select('owner').eq('id', params.id).maybeSingle();
  if (!task) return errorResponse('Task not found', 404);
  if (user.role !== 'admin' && task.owner !== user.name) return errorResponse('Forbidden', 403);

  const { error } = await sb.from('calendar_tasks').delete().eq('id', params.id);
  if (error) throw error;
  return successResponse({ deleted: true });
});

// GET /followups  — followup calendar events from crm_lead_followups
router.get('/followups', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const officerFilter = url.searchParams.get('officer');

  let q = sb.from('crm_lead_followups').select('*').not('scheduled_at', 'is', null).order('scheduled_at', { ascending: true }).limit(500);

  if (user.role !== 'admin') {
    q = q.eq('officer_user_id', user.id);
  } else if (officerFilter) {
    // filter by officer name
    q = q.eq('officer_name', officerFilter);
  }

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ followups: data ?? [], events: data ?? [] });
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
