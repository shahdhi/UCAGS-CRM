// @ts-nocheck
/**
 * CRM XP — Supabase Edge Function (Deno)
 *
 * Handles:
 *   GET /functions/v1/crm-xp/leaderboard  — all officers ranked by current-batch XP
 *   GET /functions/v1/crm-xp/me           — personal XP summary + recent events + rank
 *
 * Auth: Supabase JWT in Authorization header.
 * Runs close to the database — eliminates Vercel CPU for XP queries.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errResp(e: any): Response {
  const status = e?.status && e.status >= 100 && e.status < 600 ? e.status : 500;
  return jsonResp({ success: false, error: e?.message ?? String(e) }, status);
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

function adminSb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

async function getUser(req: Request): Promise<any | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: { user }, error } = await adminSb().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

function isAdmin(user: any): boolean {
  const role = cleanStr(user?.user_metadata?.role ?? user?.role);
  if (role === 'admin') return true;
  return ADMIN_EMAILS.includes(cleanStr(user?.email).toLowerCase());
}

function isAdminOrOfficer(user: any): boolean {
  if (isAdmin(user)) return true;
  const staffRoles = user?.user_metadata?.staff_roles;
  if (Array.isArray(staffRoles) && staffRoles.length > 0) return true;
  const r = cleanStr(user?.user_metadata?.role ?? user?.role);
  return ['officer', 'admission_officer', 'supervisor'].includes(r);
}

// ---------------------------------------------------------------------------
// Current batch helpers
// ---------------------------------------------------------------------------

async function getCurrentBatches(sb: any): Promise<Array<{ program_id: string; batch_name: string }>> {
  const { data, error } = await sb
    .from('program_batches')
    .select('program_id, batch_name')
    .eq('is_current', true);
  if (error) throw error;
  return data || [];
}

/**
 * Sums XP per user_id from officer_xp_events for all current batches.
 * Returns a Map<userId, totalXp>.
 */
async function getCurrentBatchXPMap(sb: any): Promise<Map<string, number>> {
  const currentBatches = await getCurrentBatches(sb);
  if (!currentBatches.length) return new Map();

  const xpMap = new Map<string, number>();

  for (const { program_id, batch_name } of currentBatches) {
    const { data: events, error } = await sb
      .from('officer_xp_events')
      .select('user_id, xp')
      .eq('program_id', program_id)
      .eq('batch_name', batch_name);

    if (error) throw error;

    for (const ev of (events || [])) {
      if (!ev.user_id) continue;
      xpMap.set(ev.user_id, (xpMap.get(ev.user_id) || 0) + Number(ev.xp || 0));
    }
  }

  return xpMap;
}

// ---------------------------------------------------------------------------
// Leaderboard logic (shared between /leaderboard and /me)
// ---------------------------------------------------------------------------

async function buildLeaderboard(sb: any, xpMap: Map<string, number>): Promise<any[]> {
  // Fetch all users
  const { data: uData, error: uErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 2000,
  });
  if (uErr) throw uErr;

  const users = uData?.users || [];

  // Only officers + admins
  const officers = users.filter((u: any) => {
    const role = cleanStr(u?.user_metadata?.role);
    const staffRoles: string[] = Array.isArray(u?.user_metadata?.staff_roles)
      ? u.user_metadata.staff_roles
      : [];
    return (
      role === 'officer' ||
      role === 'admin' ||
      role === 'admission_officer' ||
      staffRoles.includes('officer') ||
      staffRoles.includes('admission_officer')
    );
  });

  // Apply XP override adjustments if table exists
  let overrides = new Map<string, number>();
  try {
    const { data: ovData } = await sb
      .from('officer_xp_overrides')
      .select('user_id, xp');
    for (const ov of (ovData || [])) {
      if (ov.user_id) overrides.set(ov.user_id, Number(ov.xp || 0));
    }
  } catch (_) { /* table may not exist */ }

  const list = officers.map((u: any) => {
    const baseXp = xpMap.get(u.id) || 0;
    const overrideXp = overrides.has(u.id) ? overrides.get(u.id)! : baseXp;
    const totalXp = overrides.has(u.id) ? overrideXp : baseXp;
    return {
      userId: u.id,
      name: cleanStr(u.user_metadata?.name || u.email?.split('@')?.[0] || 'Unknown'),
      email: cleanStr(u.email || ''),
      role: cleanStr(u.user_metadata?.role || ''),
      totalXp,
      lastUpdated: null,
    };
  });

  // Sort by XP descending
  list.sort((a: any, b: any) => b.totalXp - a.totalXp);

  let rank = 1;
  return list.map((entry: any) => ({ ...entry, rank: rank++ }));
}

// ---------------------------------------------------------------------------
// /leaderboard handler
// ---------------------------------------------------------------------------

async function handleLeaderboard(sb: any): Promise<Response> {
  const xpMap = await getCurrentBatchXPMap(sb);
  const leaderboard = await buildLeaderboard(sb, xpMap);
  return jsonResp({ success: true, leaderboard });
}

// ---------------------------------------------------------------------------
// /me handler
// ---------------------------------------------------------------------------

async function handleMe(sb: any, userId: string): Promise<Response> {
  // Fetch XP map + recent events + leaderboard in parallel
  const [xpMap, eventsResult] = await Promise.all([
    getCurrentBatchXPMap(sb),
    sb
      .from('officer_xp_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const events = eventsResult.data || [];
  const totalXp = xpMap.get(userId) || 0;

  // Build leaderboard to get rank (reuses already-fetched xpMap)
  const leaderboard = await buildLeaderboard(sb, xpMap);
  const myEntry = leaderboard.find((r: any) => r.userId === userId);
  const rank = myEntry?.rank ?? null;
  const totalOfficers = leaderboard.length;

  return jsonResp({
    success: true,
    userId,
    totalXp,
    rank,
    totalOfficers,
    leaderboard,
    recentEvents: events,
  });
}

// ---------------------------------------------------------------------------
// /trend handler — personal XP trend over time
// ---------------------------------------------------------------------------

async function handleTrend(sb: any, userId: string, url: URL): Promise<Response> {
  const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from('officer_xp_events')
    .select('xp, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  const SL_OFFSET = 330;
  const byDate: Record<string, number> = {};
  for (const row of (data || [])) {
    const d = new Date(new Date(row.created_at).getTime() + SL_OFFSET * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDate[key] = (byDate[key] || 0) + Number(row.xp || 0);
  }

  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const shifted = new Date(d.getTime() + SL_OFFSET * 60 * 1000);
    const key = shifted.toISOString().slice(0, 10);
    trend.push({ date: key, xp: byDate[key] || 0 });
  }

  return jsonResp({ success: true, trend });
}

// ---------------------------------------------------------------------------
// /global-trend handler — all officers XP trend (admin only)
// ---------------------------------------------------------------------------

async function handleGlobalTrend(sb: any, url: URL): Promise<Response> {
  const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from('officer_xp_events')
    .select('xp, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  const SL_OFFSET = 330;
  const byDate: Record<string, number> = {};
  for (const row of (data || [])) {
    const d = new Date(new Date(row.created_at).getTime() + SL_OFFSET * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDate[key] = (byDate[key] || 0) + Number(row.xp || 0);
  }

  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const shifted = new Date(d.getTime() + SL_OFFSET * 60 * 1000);
    const key = shifted.toISOString().slice(0, 10);
    trend.push({ date: key, xp: byDate[key] || 0 });
  }

  return jsonResp({ success: true, trend });
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    // Auth check
    const user = await getUser(req);
    if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
    if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);

    if (req.method !== 'GET') {
      return jsonResp({ success: false, error: 'Method not allowed' }, 405);
    }

    const url = new URL(req.url);
    const fullPath = url.pathname;
    // Extract sub-path after "crm-xp"
    const fnIdx = fullPath.indexOf('crm-xp');
    const subPath = fnIdx !== -1
      ? fullPath.slice(fnIdx + 'crm-xp'.length).replace(/^\//, '')
      : '';

    const sb = adminSb();

    if (subPath === 'leaderboard' || subPath === '') {
      return await handleLeaderboard(sb);
    }

    if (subPath === 'me') {
      return await handleMe(sb, user.id);
    }

    if (subPath === 'trend') {
      return await handleTrend(sb, user.id, url);
    }

    if (subPath === 'global-trend') {
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      return await handleGlobalTrend(sb, url);
    }

    return jsonResp({ success: false, error: `Unknown path: /${subPath}` }, 404);
  } catch (e) {
    console.error('[crm-xp] error:', e);
    return errResp(e);
  }
});
