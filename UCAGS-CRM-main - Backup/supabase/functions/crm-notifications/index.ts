// @ts-nocheck
/**
 * CRM Notifications – Supabase Edge Function (Deno)
 *
 * Handles all /notifications/* routes previously served by the Vercel Express backend.
 * Auth: expects a Supabase JWT in the Authorization header.
 * Service-role operations use SUPABASE_SERVICE_ROLE_KEY (available natively in edge runtime).
 *
 * Routes:
 *   GET    /                    → list user notifications
 *   POST   /                    → create notification (for self)
 *   POST   /mark-all-read       → mark all as read
 *   GET    /settings            → get notification settings
 *   PUT    /settings            → upsert notification settings
 *   POST   /purge               → delete old notifications (cron, secret-protected)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function mkErr(msg: string, status = 500): Error {
  const e: any = new Error(msg);
  e.status = status;
  return e;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errResp(e: any): Response {
  const status = e?.status >= 100 && e?.status < 600 ? e.status : 500;
  return jsonResp({ success: false, error: e?.message ?? String(e) }, status);
}

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------

function adminSb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function getUser(req: Request): Promise<any | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: { user }, error } = await adminSb().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

function isAdmin(user: any): boolean {
  if (cleanStr(user?.user_metadata?.role) === 'admin') return true;
  return ADMIN_EMAILS.includes(cleanStr(user?.email).toLowerCase());
}

// ---------------------------------------------------------------------------
// Service functions (mirrors notificationsService.js)
// ---------------------------------------------------------------------------

async function listNotifications(sb: any, { userId, limit = 50 }: any) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const { data, error } = await sb
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) throw error;
  return data ?? [];
}

async function createNotification(sb: any, { userId, category = 'general', title, message, type = 'info' }: any) {
  const row = {
    user_id: userId,
    category: cleanStr(category) || 'general',
    title: cleanStr(title) || 'Notification',
    message: cleanStr(message) || '',
    type: cleanStr(type) || 'info',
    created_at: new Date().toISOString(),
  };

  // Dedupe guard for lead_assignment (same as original service)
  if (row.category === 'lead_assignment') {
    try {
      const cutoff = new Date(Date.now() - 10 * 1000).toISOString();
      const { data: existing, error: exErr } = await sb
        .from('user_notifications')
        .select('*')
        .eq('user_id', row.user_id)
        .eq('category', row.category)
        .is('read_at', null)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!exErr && existing) return existing;
    } catch (_) { /* ignore dedupe failures */ }
  }

  const { data, error } = await sb.from('user_notifications').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function markAllRead(sb: any, { userId }: any) {
  const ts = new Date().toISOString();
  const { data, error } = await sb
    .from('user_notifications')
    .update({ read_at: ts })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id');
  if (error) throw error;
  return { updated: (data ?? []).length, read_at: ts };
}

async function getNotificationSettings(sb: any, userId: string) {
  const { data, error } = await sb
    .from('user_notification_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null; // table might not exist yet
  return data ?? null;
}

async function upsertNotificationSettings(sb: any, userId: string, patch: Record<string, any>) {
  const row = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from('user_notification_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function purgeOldNotifications(sb: any, { olderThanDays = 7 }: any) {
  const days = Math.max(1, Math.trunc(Number(olderThanDays) || 7));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('user_notifications')
    .delete()
    .lt('created_at', cutoff)
    .select('id');
  if (error) throw error;
  return { deleted: (data ?? []).length, cutoff };
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url = new URL(req.url);
  const fnName = 'crm-notifications';
  const fnIdx = url.pathname.indexOf(fnName);
  const afterFn = fnIdx !== -1
    ? url.pathname.slice(fnIdx + fnName.length).replace(/^\//, '')
    : url.pathname.replace(/^\/+/, '');
  const method = req.method.toUpperCase();

  const sb = adminSb();

  try {
    // ── POST /purge  (cron, no user auth — uses shared secret) ────────────────
    if (method === 'POST' && afterFn === 'purge') {
      const provided = req.headers.get('x-cron-secret') ?? '';
      if (!CRON_SECRET || provided !== CRON_SECRET) {
        return jsonResp({ success: false, error: 'Forbidden' }, 403);
      }
      let body: any = {};
      try { body = await req.json(); } catch (_) {}
      const result = await purgeOldNotifications(sb, { olderThanDays: body?.olderThanDays ?? 7 });
      return jsonResp({ success: true, ...result });
    }

    // All other routes require a valid user JWT
    const user = await getUser(req);
    if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);

    // ── GET /  (list notifications) ──────────────────────────────────────────
    if (method === 'GET' && afterFn === '') {
      const limit = url.searchParams.get('limit') ?? '50';
      const rows = await listNotifications(sb, { userId: user.id, limit });
      return jsonResp({ success: true, notifications: rows });
    }

    // ── POST /  (create notification for self) ───────────────────────────────
    if (method === 'POST' && afterFn === '') {
      let body: any = {};
      try { body = await req.json(); } catch (_) {}
      const { title, message, type, category } = body;
      const saved = await createNotification(sb, { userId: user.id, title, message, type, category });
      return jsonResp({ success: true, notification: saved });
    }

    // ── POST /mark-all-read ──────────────────────────────────────────────────
    if (method === 'POST' && afterFn === 'mark-all-read') {
      const result = await markAllRead(sb, { userId: user.id });
      return jsonResp({ success: true, ...result });
    }

    // ── GET /settings ────────────────────────────────────────────────────────
    if (method === 'GET' && afterFn === 'settings') {
      const settings = await getNotificationSettings(sb, user.id);
      return jsonResp({ success: true, settings: settings ?? null });
    }

    // ── PUT /settings ────────────────────────────────────────────────────────
    if (method === 'PUT' && afterFn === 'settings') {
      let patch: any = {};
      try { patch = await req.json(); } catch (_) {}
      const saved = await upsertNotificationSettings(sb, user.id, patch);
      return jsonResp({ success: true, settings: saved });
    }

    return jsonResp({ success: false, error: `Unknown route: ${method} /${afterFn}` }, 404);
  } catch (e: any) {
    console.error('[crm-notifications] error:', e?.message);
    return errResp(e);
  }
});
