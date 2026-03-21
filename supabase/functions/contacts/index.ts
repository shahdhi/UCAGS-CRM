/**
 * contacts Edge Function
 * Maps to: /api/contacts/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /  — list contacts
router.get('/', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);

  let q = sb.from('contacts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (user.role !== 'admin') q = q.eq('created_by', user.id);
  if (search) {
    const s = search.replace(/"/g, '');
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ contacts: data ?? [] });
});

// POST /  — create a contact
router.post('/', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('contacts').insert({
    name: body.name ?? null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    notes: body.notes ?? null,
    tags: body.tags ?? null,
    created_by: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  return successResponse({ contact: data }, 201);
});

// PUT /:id  — update a contact
router.put('/:id', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { id: _id, created_at: _c, created_by: _cb, ...patch } = body;

  // Only owner or admin can update
  const { data: existing } = await sb.from('contacts').select('created_by').eq('id', params.id).maybeSingle();
  if (!existing) return errorResponse('Contact not found', 404);
  if (user.role !== 'admin' && existing.created_by !== user.id) return errorResponse('Forbidden', 403);

  const { data, error } = await sb.from('contacts').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ contact: data });
});

// DELETE /:id  — delete a contact
router.delete('/:id', async (req, params) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();

  const { data: existing } = await sb.from('contacts').select('created_by').eq('id', params.id).maybeSingle();
  if (!existing) return errorResponse('Contact not found', 404);
  if (user.role !== 'admin' && existing.created_by !== user.id) return errorResponse('Forbidden', 403);

  const { error } = await sb.from('contacts').delete().eq('id', params.id);
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
