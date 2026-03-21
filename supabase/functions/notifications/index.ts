/**
 * notifications Edge Function
 * Maps to: /api/notifications/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

function cleanStr(v: unknown): string { return v == null ? '' : String(v).trim(); }

async function createNotification(sb: any, { userId, category = 'general', title, message, type = 'info' }: any) {
  const row = {
    user_id: userId,
    category: cleanStr(category) || 'general',
    title: cleanStr(title) || 'Notification',
    message: cleanStr(message) || '',
    type: cleanStr(type) || 'info',
    created_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from('user_notifications').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

// GET /  — list notifications for current user
router.get('/', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));

  const { data, error } = await sb
    .from('user_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return successResponse({ notifications: data ?? [] });
});

// POST /  — create notification for self
router.post('/', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { title, message, type } = await req.json();
  const saved = await createNotification(sb, { userId: user.id, title, message, type });
  return successResponse({ notification: saved });
});

// POST /mark-all-read
router.post('/mark-all-read', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const ts = new Date().toISOString();
  const { data, error } = await sb
    .from('user_notifications')
    .update({ read_at: ts })
    .eq('user_id', user.id)
    .is('read_at', null)
    .select('id');
  if (error) throw error;
  return successResponse({ updated: (data ?? []).length, read_at: ts });
});

// GET /settings
router.get('/settings', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('user_notification_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error && !String(error.message).includes('does not exist')) throw error;
  return successResponse({ settings: data ?? null });
});

// PUT /settings
router.put('/settings', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const patch = await req.json();
  const row = { user_id: user.id, ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await sb
    .from('user_notification_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('*').single();
  if (error) throw error;
  return successResponse({ settings: data });
});

// POST /purge  — cron: purge old notifications
router.post('/purge', async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('x-cron-secret');
  if (!cronSecret || provided !== cronSecret) return errorResponse('Forbidden', 403);

  const sb = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Number(body.olderThanDays ?? 7) || 7);
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await sb.from('user_notifications').delete().lt('created_at', cutoff).select('id');
  if (error) throw error;
  return successResponse({ deleted: (data ?? []).length, cutoff });
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
