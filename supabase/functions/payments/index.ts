/**
 * payments Edge Function
 * Maps to: /api/payments/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAdmin, isAdminOrOfficer } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /  — list payments (admin)
router.get('/', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');
  const programId = url.searchParams.get('programId');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 1000);

  let q = sb.from('payments').select('*').order('created_at', { ascending: false }).limit(limit);
  if (batchName) q = q.eq('batch_name', batchName);
  if (programId) q = q.eq('program_id', programId);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ payments: data ?? [] });
});

// PUT /:id  — update a payment row (admin/officer)
router.put('/:id', async (req, params) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { id: _id, created_at: _c, registration_id: _r, ...patch } = body;
  const { data, error } = await sb.from('payments').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ payment: data });
});

// DELETE /:id  — delete a payment row (admin)
router.delete('/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('payments').delete().eq('id', params.id);
  if (error) throw error;
  return successResponse({ deleted: true });
});

// GET /plans  — list payment plans for a batch
router.get('/plans', async (req) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');
  let q = sb.from('batch_payment_plans').select('*');
  if (batchName) q = q.eq('batch_name', batchName);
  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ plans: data ?? [] });
});

// POST /plans  — create a payment plan (admin)
router.post('/plans', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('batch_payment_plans').insert({
    batch_name: body.batch_name,
    plan_name: body.plan_name,
    installment_count: Number(body.installment_count ?? 1),
    description: body.description ?? null,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  return successResponse({ plan: data }, 201);
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
