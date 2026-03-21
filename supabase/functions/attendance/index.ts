/**
 * attendance Edge Function
 * Maps to: /api/attendance/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin, isAdminOrOfficer } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /  — get attendance records (my or all)
router.get('/', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const month = url.searchParams.get('month'); // YYYY-MM
  const officerName = url.searchParams.get('officer');

  let q = sb.from('attendance').select('*').order('date', { ascending: false }).limit(200);

  if (user.role === 'admin' && officerName) {
    q = q.eq('officer_name', officerName);
  } else if (user.role !== 'admin') {
    q = q.eq('user_id', user.id);
  }

  if (month) {
    q = q.gte('date', `${month}-01`).lt('date', `${month.slice(0, 4)}-${String(parseInt(month.slice(5)) + 1).padStart(2, '0')}-01`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ attendance: data ?? [] });
});

// POST /  — submit attendance (officer)
router.post('/', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { date, type, notes, check_in, check_out } = body;

  if (!date) return errorResponse('date is required', 400);

  const row = {
    user_id: user.id,
    officer_name: user.name,
    date,
    type: type || 'present',
    notes: notes || null,
    check_in: check_in || null,
    check_out: check_out || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('attendance')
    .upsert(row, { onConflict: 'user_id,date' })
    .select('*').single();
  if (error) throw error;
  return successResponse({ attendance: data }, 201);
});

// GET /summary  — attendance summary (admin or self)
router.get('/summary', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const month = url.searchParams.get('month');
  const officerName = url.searchParams.get('officer');

  let q = sb.from('attendance').select('user_id,officer_name,type,date');
  if (user.role !== 'admin') q = q.eq('user_id', user.id);
  else if (officerName) q = q.eq('officer_name', officerName);
  if (month) q = q.gte('date', `${month}-01`).lt('date', `${month.slice(0, 4)}-${String(parseInt(month.slice(5)) + 1).padStart(2, '0')}-01`);

  const { data, error } = await q;
  if (error) throw error;

  const summary: Record<string, Record<string, number>> = {};
  for (const r of data ?? []) {
    const key = r.officer_name || r.user_id || 'Unknown';
    if (!summary[key]) summary[key] = { present: 0, absent: 0, leave: 0, half_day: 0 };
    const t = r.type || 'present';
    summary[key][t] = (summary[key][t] ?? 0) + 1;
  }
  return successResponse({ summary });
});

// GET /admin/summary  — full admin summary across all officers
router.get('/admin/summary', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const month = url.searchParams.get('month');

  let q = sb.from('attendance').select('*').order('date', { ascending: false }).limit(2000);
  if (month) q = q.gte('date', `${month}-01`).lt('date', `${month.slice(0, 4)}-${String(parseInt(month.slice(5)) + 1).padStart(2, '0')}-01`);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ attendance: data ?? [] });
});

// GET /calendar  — calendar view of attendance
router.get('/calendar', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const month = url.searchParams.get('month');

  let q = sb.from('attendance').select('*').eq('user_id', user.id);
  if (month) q = q.gte('date', `${month}-01`).lt('date', `${month.slice(0, 4)}-${String(parseInt(month.slice(5)) + 1).padStart(2, '0')}-01`);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ calendar: data ?? [] });
});

// POST /leave  — submit a leave request
router.post('/leave', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { date, reason, type } = body;
  if (!date) return errorResponse('date is required', 400);

  const { data, error } = await sb.from('leave_requests').insert({
    user_id: user.id,
    officer_name: user.name,
    date,
    reason: reason || null,
    type: type || 'leave',
    status: 'pending',
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  return successResponse({ leave: data }, 201);
});

// GET /leave  — get leave requests (own or admin sees all)
router.get('/leave', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  let q = sb.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(100);
  if (user.role !== 'admin') q = q.eq('user_id', user.id);
  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ leave_requests: data ?? [] });
});

// PUT /leave/:id  — update leave request status (admin)
router.put('/leave/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('leave_requests')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ leave: data });
});

// GET /leave-requests  — alias used by app.js (?status=pending)
router.get('/leave-requests', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  let q = sb.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(100);
  if (user.role !== 'admin') q = q.eq('user_id', user.id);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ leave_requests: data ?? [] });
});

// GET /me/today  — today's attendance for current user
router.get('/me/today', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from('attendance').select('*').eq('user_id', user.id).eq('date', today).maybeSingle();
  if (error) throw error;
  return successResponse({ attendance: data ?? null });
});

// PUT /admin/override/:userId/:date  — admin override for attendance
router.put('/admin/override/:userId/:date', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('attendance')
    .upsert({
      user_id: params.userId,
      date: params.date,
      type: body.type || 'present',
      notes: body.notes || null,
      admin_override: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' })
    .select('*').single();
  if (error) throw error;
  return successResponse({ attendance: data });
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
