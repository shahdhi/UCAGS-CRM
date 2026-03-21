/**
 * users Edge Function
 * Maps to: /api/users/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

const ADMIN_EMAILS = new Set(['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com']);

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.has(String(email ?? '').toLowerCase());
}

// GET /  — list all users (admin)
router.get('/', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { data: { users }, error } = await sb.auth.admin.listUsers();
  if (error) throw error;
  const formatted = (users ?? []).map((u: any) => ({
    id: u.id,
    email: u.email,
    name: u.user_metadata?.name ?? u.email?.split('@')[0] ?? '',
    role: u.user_metadata?.role ?? 'officer',
    created_at: u.created_at,
    confirmed_at: u.confirmed_at,
    last_sign_in_at: u.last_sign_in_at,
  }));
  return successResponse({ users: formatted });
});

// GET /me  — current user profile
router.get('/me', async (req) => {
  const user = await isAuthenticated(req);
  return successResponse({ user });
});

// GET /officers  — list only officer users (admin)
router.get('/officers', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { data: { users }, error } = await sb.auth.admin.listUsers();
  if (error) throw error;
  const officers = (users ?? [])
    .filter((u: any) => {
      const role = String(u.user_metadata?.role ?? '').toLowerCase();
      if (role === 'admin') return false;
      if (isAdminEmail(u.email ?? '')) return false;
      return true;
    })
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.name ?? u.email?.split('@')[0] ?? '',
      role: u.user_metadata?.role ?? 'officer',
    }));
  return successResponse({ officers });
});

// POST /  — create a new user (admin)
router.post('/', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { email, password, name, role } = body;
  if (!email || !password) return errorResponse('email and password are required', 400);

  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name ?? email.split('@')[0], role: role ?? 'officer' },
  });
  if (error) throw error;
  return successResponse({ user: data.user }, 201);
});

// PUT /:id  — update user metadata (admin)
router.put('/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.auth.admin.updateUserById(params.id, {
    user_metadata: { name: body.name, role: body.role },
    ...(body.email ? { email: body.email } : {}),
    ...(body.password ? { password: body.password } : {}),
  });
  if (error) throw error;
  return successResponse({ user: data.user });
});

// DELETE /:id  — delete a user (admin)
router.delete('/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { error } = await sb.auth.admin.deleteUser(params.id);
  if (error) throw error;
  return successResponse({ deleted: true });
});

// POST /:id/confirm  — confirm a user email (admin)
router.post('/:id/confirm', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.updateUserById(params.id, { email_confirm: true });
  if (error) throw error;
  return successResponse({ user: data.user });
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
