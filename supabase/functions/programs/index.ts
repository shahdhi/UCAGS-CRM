/**
 * programs Edge Function
 * Maps to: /api/programs/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /  — list all programs (authenticated)
router.get('/', async (req) => {
  await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('programs').select('*').order('name');
  if (error) throw error;
  return successResponse({ programs: data ?? [] });
});

// GET /sidebar  — programs with their current batches (for sidebar nav)
router.get('/sidebar', async (req) => {
  await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { data: programs, error: pErr } = await sb.from('programs').select('id,name,code').eq('is_active', true).order('name');
  if (pErr) throw pErr;
  const { data: batches, error: bErr } = await sb.from('program_batches').select('id,program_id,batch_name,is_current').eq('is_current', true);
  if (bErr) throw bErr;
  const batchMap: Record<string, any> = {};
  for (const b of batches ?? []) batchMap[b.program_id] = b;
  const result = (programs ?? []).map((p: any) => ({ ...p, currentBatch: batchMap[p.id] ?? null }));
  return successResponse({ programs: result });
});

// POST /  — create a program (admin)
router.post('/', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('programs').insert({
    name: body.name,
    code: body.code,
    description: body.description,
    duration: body.duration,
    fee: body.fee,
    is_active: body.is_active ?? true,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  return successResponse({ program: data }, 201);
});

// PUT /:id  — update a program (admin)
router.put('/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { id: _id, created_at: _c, ...patch } = body;
  const { data, error } = await sb.from('programs').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ program: data });
});

// DELETE /:id  — delete a program (admin)
router.delete('/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('programs').delete().eq('id', params.id);
  if (error) throw error;
  return successResponse({ deleted: true });
});

// GET /batches  — list all program_batches (authenticated)
router.get('/batches', async (req) => {
  await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const programId = url.searchParams.get('programId');
  let q = sb.from('program_batches').select('*').order('created_at', { ascending: false });
  if (programId) q = q.eq('program_id', programId);
  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ batches: data ?? [] });
});

// POST /batches  — create a program batch (admin)
router.post('/batches', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('program_batches').insert({
    program_id: body.program_id,
    batch_name: body.batch_name,
    is_current: body.is_current ?? false,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  return successResponse({ batch: data }, 201);
});

// PUT /batches/:id  — update a program batch (admin)
router.put('/batches/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { id: _id, created_at: _c, ...patch } = body;
  const { data, error } = await sb.from('program_batches').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ batch: data });
});

// DELETE /batches/:id  — delete a program batch (admin)
router.delete('/batches/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('program_batches').delete().eq('id', params.id);
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
