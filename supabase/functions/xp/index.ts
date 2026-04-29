// @ts-nocheck
/**
 * XP – Supabase Edge Function (Deno)
 *
 * Phase 1 (read-only) + Phase 2 (admin write) routes migrated from Vercel Express backend.
 *
 * Routes:
 *   GET  /xp/me                          — personal XP summary + recent events
 *   GET  /xp/leaderboard                 — all officers ranked by total XP
 *   GET  /xp/trend?days=                 — personal daily XP trend
 *   GET  /xp/global-trend?days=          — global daily XP trend (admin)
 *   GET  /xp/archives?programId=&batchName= — batch XP archives (admin)
 *   GET  /xp/admin/overrides?batchName=  — list XP overrides (admin)
 *   PUT  /xp/admin/overrides             — upsert XP override (admin)
 *   DELETE /xp/admin/overrides/:id       — delete XP override (admin)
 *   POST /xp/admin/reset                 — archive+reset XP for a program/batch (admin)
 *   POST /xp/cron/overdue                — apply overdue followup penalties (admin/cron)
 *
 * Auth: expects a Supabase JWT in the Authorization header.
 * Service-role operations use SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function mkErr(msg: string, status = 500): Error {
  const e: any = new Error(msg);
  e.status = status;
  return e;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

async function getLeaderboard(sb: any): Promise<any[]> {
  const { data: summaries, error } = await sb
    .from('officer_xp_summary')
    .select('user_id, total_xp, last_updated')
    .order('total_xp', { ascending: false });
  if (error) throw error;

  const { data: { users } = {}, error: uErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
  if (uErr) throw uErr;

  const userMap = new Map((users as any[] || []).map((u: any) => [u.id, u]));

  let rank = 1;
  return (summaries || []).map((s: any) => {
    const u: any = userMap.get(s.user_id);
    return {
      userId: s.user_id,
      name: u?.user_metadata?.name || u?.email?.split('@')[0] || 'Unknown',
      email: u?.email || '',
      role: u?.user_metadata?.role || '',
      totalXp: s.total_xp || 0,
      rank: rank++,
      lastUpdated: s.last_updated,
    };
  });
}

// ---------------------------------------------------------------------------
// My XP
// ---------------------------------------------------------------------------

async function getMyXP(sb: any, userId: string): Promise<any> {
  const [summaryResult, eventsResult, leaderboard] = await Promise.all([
    sb.from('officer_xp_summary').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('officer_xp_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    getLeaderboard(sb),
  ]);

  const summary = summaryResult.data;
  const events = eventsResult.data || [];
  const rank = (leaderboard || []).find((r: any) => r.userId === userId)?.rank || null;
  const totalOfficers = (leaderboard || []).length;

  return {
    userId,
    totalXp: summary?.total_xp || 0,
    rank,
    totalOfficers,
    recentEvents: events,
  };
}

// ---------------------------------------------------------------------------
// Trends (SL offset = UTC+5:30 = 330 min)
// ---------------------------------------------------------------------------

const SL_OFFSET_MS = 330 * 60 * 1000;

function groupBySlDate(rows: any[]): Record<string, number> {
  const byDate: Record<string, number> = {};
  for (const row of rows) {
    const d = new Date(new Date(row.created_at).getTime() + SL_OFFSET_MS);
    const key = d.toISOString().slice(0, 10);
    byDate[key] = (byDate[key] || 0) + Number(row.xp || 0);
  }
  return byDate;
}

function fillTrendDays(byDate: Record<string, number>, days: number): any[] {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const shifted = new Date(d.getTime() + SL_OFFSET_MS);
    const key = shifted.toISOString().slice(0, 10);
    result.push({ date: key, xp: byDate[key] || 0 });
  }
  return result;
}

async function getXPTrend(sb: any, userId: string, days: number): Promise<any[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from('officer_xp_events')
    .select('xp, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;

  return fillTrendDays(groupBySlDate(data || []), days);
}

async function getGlobalXPTrend(sb: any, days: number): Promise<any[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from('officer_xp_events')
    .select('xp, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;

  return fillTrendDays(groupBySlDate(data || []), days);
}

// ---------------------------------------------------------------------------
// Archives
// ---------------------------------------------------------------------------

async function getArchives(sb: any, programId: string | null, batchName: string | null): Promise<any[]> {
  let q = sb
    .from('officer_xp_archives')
    .select('*')
    .order('archived_at', { ascending: false });
  if (programId) q = q.eq('program_id', programId);
  if (batchName) q = q.eq('batch_name', batchName);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// XP Award (for overdue penalty)
// ---------------------------------------------------------------------------

async function awardXP(sb: any, opts: any): Promise<any> {
  const { userId, eventType, xp, referenceId, referenceType, note, programId, batchName } = opts;
  if (!userId || !eventType || typeof xp !== 'number' || xp === 0) return null;

  const { data: event, error: evErr } = await sb
    .from('officer_xp_events')
    .insert({
      user_id: userId,
      event_type: eventType,
      xp,
      reference_id: referenceId || null,
      reference_type: referenceType || null,
      note: note || null,
      program_id: programId || null,
      batch_name: batchName || null,
    })
    .select('*')
    .single();

  if (evErr) throw evErr;

  const { data: existing } = await sb
    .from('officer_xp_summary')
    .select('total_xp')
    .eq('user_id', userId)
    .maybeSingle();

  const currentXP = Number(existing?.total_xp || 0);
  const newXP = Math.max(0, currentXP + xp);

  await sb
    .from('officer_xp_summary')
    .upsert({ user_id: userId, total_xp: newXP, last_updated: new Date().toISOString() }, { onConflict: 'user_id' });

  return event;
}

async function awardXPOnce(sb: any, opts: any): Promise<any> {
  const { userId, eventType, referenceId } = opts;
  if (!userId || !eventType || !referenceId) return null;

  const { data } = await sb
    .from('officer_xp_events')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .eq('reference_id', String(referenceId))
    .limit(1)
    .maybeSingle();

  if (data) return null; // already awarded
  return awardXP(sb, opts);
}

// ---------------------------------------------------------------------------
// Archive + Reset (Phase 2)
// ---------------------------------------------------------------------------

async function archiveAndResetXPForBatch(sb: any, programId: string, outgoingBatchName: string): Promise<any> {
  if (!programId || !outgoingBatchName) return { archived: 0, officers: [] };

  const { data: events, error: evErr } = await sb
    .from('officer_xp_events')
    .select('user_id, xp')
    .eq('program_id', programId)
    .eq('batch_name', outgoingBatchName);

  if (evErr) throw evErr;
  if (!events || events.length === 0) return { archived: 0, officers: [] };

  const xpByOfficer = new Map<string, number>();
  for (const ev of events) {
    if (!ev.user_id) continue;
    xpByOfficer.set(ev.user_id, (xpByOfficer.get(ev.user_id) || 0) + Number(ev.xp || 0));
  }

  const now = new Date().toISOString();
  const results: any[] = [];

  for (const [userId, batchXP] of xpByOfficer.entries()) {
    const { error: archErr } = await sb
      .from('officer_xp_archives')
      .insert({ user_id: userId, program_id: programId, batch_name: outgoingBatchName, total_xp: batchXP, archived_at: now });

    if (archErr) {
      results.push({ userId, status: 'archive_failed', error: archErr.message });
    } else {
      results.push({ userId, batchXP, status: 'archived' });
    }
  }

  return { archived: results.filter((r: any) => r.status === 'archived').length, officers: results };
}

// ---------------------------------------------------------------------------
// Overdue Followup Penalty (Phase 2)
// ---------------------------------------------------------------------------

async function penaliseOverdueFollowups(sb: any): Promise<any> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data: overdue, error } = await sb
    .from('crm_lead_followups')
    .select('id, officer_user_id, scheduled_at')
    .is('actual_at', null)
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', oneDayAgo.toISOString());

  if (error) throw error;

  const SL_OFFSET = 330;
  const todayShifted = new Date(now.getTime() + SL_OFFSET * 60 * 1000);
  const todayKey = todayShifted.toISOString().slice(0, 10);

  let penalised = 0;
  let skipped = 0;

  for (const f of (overdue || [])) {
    if (!f.officer_user_id) { skipped++; continue; }
    const refId = `${f.id}:${todayKey}`;
    const result = await awardXPOnce(sb, {
      userId: f.officer_user_id,
      eventType: 'followup_overdue',
      xp: -5,
      referenceId: refId,
      referenceType: 'followup',
      note: `Overdue followup penalty (${todayKey})`,
    });
    if (result) penalised++; else skipped++;
  }

  return { penalised, skipped };
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function getUser(sb: any, jwt: string | null): Promise<any | null> {
  if (!jwt) return null;
  const { data: { user }, error } = await sb.auth.getUser(jwt);
  if (error || !user) return null;
  return user;
}

function getUserRole(user: any): string {
  return String(user?.user_metadata?.role || '').toLowerCase();
}

function isAdmin(user: any): boolean {
  const role = getUserRole(user);
  return role === 'admin' || role === 'superadmin';
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Extract JWT from Authorization header for user-scoped auth checks
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const url = new URL(req.url);
    const method = req.method;

    // Strip function name prefix: /functions/v1/xp/me → /me
    const pathParts = url.pathname.split('/');
    const fnIdx = pathParts.indexOf('xp');
    const afterFn = fnIdx >= 0 ? pathParts.slice(fnIdx + 1).join('/') : '';

    // -----------------------------------------------------------------------
    // GET /me
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'me') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const data = await getMyXP(sb, user.id);
      return jsonResp({ success: true, ...data });
    }

    // -----------------------------------------------------------------------
    // GET /leaderboard
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'leaderboard') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const leaderboard = await getLeaderboard(sb);
      return jsonResp({ success: true, leaderboard });
    }

    // -----------------------------------------------------------------------
    // GET /trend?days=
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'trend') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 90);
      const trend = await getXPTrend(sb, user.id, days);
      return jsonResp({ success: true, trend });
    }

    // -----------------------------------------------------------------------
    // GET /global-trend?days=  (admin only)
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'global-trend') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 90);
      const trend = await getGlobalXPTrend(sb, days);
      return jsonResp({ success: true, trend });
    }

    // -----------------------------------------------------------------------
    // GET /archives?programId=&batchName=  (admin only)
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'archives') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const programId = url.searchParams.get('programId') || null;
      const batchName = url.searchParams.get('batchName') || null;
      const archives = await getArchives(sb, programId, batchName);
      return jsonResp({ success: true, archives });
    }

    // -----------------------------------------------------------------------
    // GET /admin/overrides?batchName=  (admin only)
    // -----------------------------------------------------------------------
    if (method === 'GET' && afterFn === 'admin/overrides') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const batchName = url.searchParams.get('batchName') || null;
      let q = sb.from('officer_xp_overrides').select('*').order('user_name', { ascending: true });
      if (batchName) q = q.eq('batch_name', batchName);
      const { data, error } = await q;
      if (error) throw error;
      return jsonResp({ success: true, overrides: data || [] });
    }

    // -----------------------------------------------------------------------
    // PUT /admin/overrides  (admin only)
    // -----------------------------------------------------------------------
    if (method === 'PUT' && afterFn === 'admin/overrides') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const { userId, userName, batchName, programId, xp, note } = body;
      if (!userId || !batchName || xp === undefined) {
        return jsonResp({ success: false, error: 'userId, batchName, and xp are required' }, 400);
      }
      const { data, error } = await sb
        .from('officer_xp_overrides')
        .upsert({
          user_id: userId,
          user_name: userName || '',
          batch_name: batchName,
          program_id: programId || null,
          xp: Number(xp),
          note: note || null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,batch_name' })
        .select('*')
        .single();
      if (error) throw error;
      return jsonResp({ success: true, override: data });
    }

    // -----------------------------------------------------------------------
    // DELETE /admin/overrides/:id  (admin only)
    // -----------------------------------------------------------------------
    if (method === 'DELETE' && afterFn.startsWith('admin/overrides/')) {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const id = afterFn.replace('admin/overrides/', '');
      if (!id) return jsonResp({ success: false, error: 'id is required' }, 400);
      const { error } = await sb.from('officer_xp_overrides').delete().eq('id', id);
      if (error) throw error;
      return jsonResp({ success: true });
    }

    // -----------------------------------------------------------------------
    // POST /admin/reset  (admin only)
    // -----------------------------------------------------------------------
    if (method === 'POST' && afterFn === 'admin/reset') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const body = await req.json().catch(() => ({}));
      const { programId, batchName } = body;
      if (!programId || !batchName) {
        return jsonResp({ success: false, error: 'programId and batchName are required' }, 400);
      }
      const result = await archiveAndResetXPForBatch(sb, programId, batchName);
      return jsonResp({ success: true, ...result });
    }

    // -----------------------------------------------------------------------
    // POST /cron/overdue  (admin only)
    // -----------------------------------------------------------------------
    if (method === 'POST' && afterFn === 'cron/overdue') {
      const user = await getUser(sb, jwt);
      if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      const result = await penaliseOverdueFollowups(sb);
      return jsonResp({ success: true, ...result });
    }

    // -----------------------------------------------------------------------
    // Fallback
    // -----------------------------------------------------------------------
    return jsonResp({ success: false, error: `Unknown route: ${method} /${afterFn}` }, 404);

  } catch (e: any) {
    console.error('[xp edge fn error]', e?.message ?? e);
    return errResp(e);
  }
});
