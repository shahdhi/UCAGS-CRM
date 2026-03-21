/**
 * xp Edge Function
 * Maps to: /api/xp/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin, isAdminOrOfficer } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /leaderboard
router.get('/leaderboard', async (req) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('xp_totals').select('*').order('total_xp', { ascending: false }).limit(50);
  if (error) {
    // fallback: compute from xp_events
    const { data: events } = await sb.from('xp_events').select('user_id,xp,officer_name');
    const totals: Record<string, { user_id: string; officer_name: string; total_xp: number }> = {};
    for (const e of events ?? []) {
      if (!totals[e.user_id]) totals[e.user_id] = { user_id: e.user_id, officer_name: e.officer_name ?? '', total_xp: 0 };
      totals[e.user_id].total_xp += Number(e.xp ?? 0);
    }
    const leaderboard = Object.values(totals).sort((a, b) => b.total_xp - a.total_xp);
    return successResponse({ leaderboard });
  }
  return successResponse({ leaderboard: data ?? [] });
});

// GET /me
router.get('/me', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();

  const { data: events, error } = await sb.from('xp_events').select('*')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;

  const totalXp = (events ?? []).reduce((sum: number, e: any) => sum + Number(e.xp ?? 0), 0);
  return successResponse({ totalXp, recentEvents: events ?? [] });
});

// GET /trend
router.get('/trend', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 90);
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data, error } = await sb.from('xp_events').select('xp,created_at')
    .eq('user_id', user.id).gte('created_at', since).order('created_at');
  if (error) throw error;

  const trend: Record<string, number> = {};
  for (const e of data ?? []) {
    const d = String(e.created_at ?? '').slice(0, 10);
    if (d) trend[d] = (trend[d] ?? 0) + Number(e.xp ?? 0);
  }
  return successResponse({ trend });
});

// GET /global-trend (admin)
router.get('/global-trend', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 90);
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data, error } = await sb.from('xp_events').select('xp,created_at,officer_name').gte('created_at', since).order('created_at');
  if (error) throw error;

  const trend: Record<string, number> = {};
  for (const e of data ?? []) {
    const d = String(e.created_at ?? '').slice(0, 10);
    if (d) trend[d] = (trend[d] ?? 0) + Number(e.xp ?? 0);
  }
  return successResponse({ trend });
});

// POST /cron/overdue (admin — penalise overdue followups)
router.post('/cron/overdue', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  // Find followups with scheduled_at in the past and no actual_at
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: overdue } = await sb.from('crm_lead_followups').select('id,officer_user_id,officer_name,batch_name,sheet_name,sheet_lead_id,sequence')
    .lt('scheduled_at', cutoff).is('actual_at', null).limit(200);

  let penalised = 0;
  for (const f of overdue ?? []) {
    if (!f.officer_user_id) continue;
    // Check if already penalised
    const { data: existing } = await sb.from('xp_events').select('id')
      .eq('user_id', f.officer_user_id).eq('event_type', 'overdue_penalty').eq('reference_id', f.id).maybeSingle();
    if (existing) continue;

    await sb.from('xp_events').insert({
      user_id: f.officer_user_id,
      officer_name: f.officer_name ?? null,
      event_type: 'overdue_penalty',
      xp: -5,
      reference_id: f.id,
      reference_type: 'followup',
      note: `Overdue follow-up #${f.sequence ?? '?'} penalty`,
      created_at: new Date().toISOString(),
    });
    penalised++;
  }
  return successResponse({ penalised, total: overdue?.length ?? 0 });
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
