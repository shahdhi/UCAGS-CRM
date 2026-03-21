/**
 * reports Edge Function
 * Maps to: /api/reports/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /daily  — get daily reports
router.get('/daily', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const officer = url.searchParams.get('officer');

  let q = sb.from('daily_reports').select('*').order('date', { ascending: false }).limit(100);
  if (user.role !== 'admin') q = q.eq('user_id', user.id);
  else if (officer) q = q.eq('officer_name', officer);
  if (date) q = q.eq('date', date);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ reports: data ?? [] });
});

// POST /daily  — submit daily report
router.post('/daily', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { date, leads_called, leads_contacted, follow_ups, demos_scheduled, demos_attended, notes } = body;
  if (!date) return errorResponse('date is required', 400);

  const row = {
    user_id: user.id,
    officer_name: user.name,
    date,
    leads_called: Number(leads_called ?? 0),
    leads_contacted: Number(leads_contacted ?? 0),
    follow_ups: Number(follow_ups ?? 0),
    demos_scheduled: Number(demos_scheduled ?? 0),
    demos_attended: Number(demos_attended ?? 0),
    notes: notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('daily_reports')
    .upsert(row, { onConflict: 'user_id,date' })
    .select('*').single();
  if (error) throw error;
  return successResponse({ report: data }, 201);
});

// GET /daily/checklist  — get daily checklist items
router.get('/daily/checklist', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await sb
    .from('daily_checklists')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle();
  if (error && !String(error.message).includes('does not exist')) throw error;
  return successResponse({ checklist: data ?? null });
});

// POST /daily/checklist  — upsert daily checklist
router.post('/daily/checklist', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { date, items } = body;
  if (!date) return errorResponse('date is required', 400);

  const { data, error } = await sb
    .from('daily_checklists')
    .upsert({
      user_id: user.id,
      officer_name: user.name,
      date,
      items: items ?? {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' })
    .select('*').single();
  if (error) throw error;
  return successResponse({ checklist: data }, 201);
});

// GET /admin/daily  — admin view of all daily reports
router.get('/admin/daily', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const officer = url.searchParams.get('officer');

  let q = sb.from('daily_reports').select('*').order('date', { ascending: false }).limit(500);
  if (officer) q = q.eq('officer_name', officer);
  if (date) q = q.eq('date', date);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ reports: data ?? [] });
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
