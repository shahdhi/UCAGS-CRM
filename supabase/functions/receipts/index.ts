/**
 * receipts Edge Function
 * Maps to: /api/receipts/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAdmin, isAdminOrOfficer } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /  — list receipts (admin/officer)
router.get('/', async (req) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const batchName = url.searchParams.get('batch');
  const registrationId = url.searchParams.get('registrationId');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);

  let q = sb.from('receipts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (batchName) q = q.eq('batch_name', batchName);
  if (registrationId) q = q.eq('registration_id', registrationId);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ receipts: data ?? [] });
});

// POST /  — create a receipt (admin/officer)
router.post('/', async (req) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();

  const row = {
    registration_id: body.registration_id ?? null,
    registration_name: body.registration_name ?? null,
    batch_name: body.batch_name ?? null,
    program_id: body.program_id ?? null,
    program_name: body.program_name ?? null,
    payment_id: body.payment_id ?? null,
    amount: Number(body.amount ?? 0),
    payment_method: body.payment_method ?? null,
    payment_date: body.payment_date ?? null,
    installment_no: Number(body.installment_no ?? 1),
    receipt_number: body.receipt_number ?? null,
    notes: body.notes ?? null,
    created_by: user.name || null,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from('receipts').insert(row).select('*').single();
  if (error) throw error;
  return successResponse({ receipt: data }, 201);
});

// GET /:id  — get a single receipt
router.get('/:id', async (req, params) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('receipts').select('*').eq('id', params.id).single();
  if (error) throw error;
  return successResponse({ receipt: data });
});

// PUT /:id  — update a receipt (admin)
router.put('/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { id: _id, created_at: _c, ...patch } = body;
  const { data, error } = await sb.from('receipts').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ receipt: data });
});

// DELETE /:id  — delete a receipt (admin)
router.delete('/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('receipts').delete().eq('id', params.id);
  if (error) throw error;
  return successResponse({ deleted: true });
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
