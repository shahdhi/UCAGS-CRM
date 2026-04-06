// @ts-nocheck
/**
 * CRM Analytics — Supabase Edge Function (Deno)
 *
 * Migrated from GET /api/dashboard/analytics (Vercel serverless).
 * Runs close to the database — eliminates heavy Vercel CPU for dashboard queries.
 *
 * GET /functions/v1/crm-analytics
 *   ?from=YYYY-MM-DD  (optional)
 *   ?to=YYYY-MM-DD    (optional)
 *   ?officerId=uuid   (optional — admin/supervisor scoped view)
 *
 * Auth: Supabase JWT in Authorization header.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanStr(v: unknown): string {
  return v == null ? '' : String(v).trim();
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

function adminSb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isFinite(d.getTime()) ? d : null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
}

function toISODate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function getUser(req: Request): Promise<any | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
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
// Core helpers
// ---------------------------------------------------------------------------

async function getCurrentBatchNames(sb: any): Promise<string[]> {
  const { data, error } = await sb
    .from('program_batches')
    .select('batch_name')
    .eq('is_current', true);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return [];
    throw error;
  }
  return Array.from(new Set((data || []).map((r: any) => r.batch_name).filter(Boolean)));
}

async function getPaymentReceivedRegIds(
  sb: any,
  { from = null, to = null }: { from?: Date | null; to?: Date | null } = {}
): Promise<string[]> {
  const { data, error } = await sb
    .from('payments')
    .select('registration_id, payment_date, created_at, amount, slip_received, receipt_received, installment_no')
    .eq('installment_no', 1)
    .not('registration_id', 'is', null)
    .limit(20000);
  if (error) throw error;

  let rows = (data || []).filter((r: any) => {
    const amt = Number(r.amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) return false;
    return !!(r.payment_date || r.slip_received || r.receipt_received);
  });

  if (from || to) {
    const fromMs = from ? startOfDay(from).getTime() : null;
    const toMs = to ? endOfDay(to).getTime() : null;
    rows = rows.filter((r: any) => {
      const t = new Date(r.payment_date || r.created_at || 0).getTime();
      if (!Number.isFinite(t)) return false;
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t > toMs) return false;
      return true;
    });
  }

  return Array.from(new Set(rows.map((r: any) => r.registration_id).filter(Boolean)));
}

// ---------------------------------------------------------------------------
// Main analytics handler
// ---------------------------------------------------------------------------

async function handleAnalytics(sb: any, user: any, url: URL): Promise<Response> {
  const isAdminUser = isAdmin(user);
  let officerName = cleanStr(user?.user_metadata?.name || user?.email?.split('@')?.[0]);
  const activeRole = cleanStr(user?.user_metadata?.active_role || user?.user_metadata?.role);
  const isSupervisor = activeRole === 'supervisor';

  // Admin/supervisor can scope to a specific officer via ?officerId=
  const officerId = url.searchParams.get('officerId');
  if (officerId && (isAdminUser || isSupervisor)) {
    try {
      const { data, error } = await sb.auth.admin.getUserById(officerId);
      const targetUser = data?.user ?? data;
      if (!error && targetUser) {
        officerName = cleanStr(targetUser.user_metadata?.name || targetUser.email?.split('@')?.[0]);
      }
    } catch (_) { /* ignore */ }
  }

  const scopedToOfficer = !isAdminUser && !!officerName;

  // Date range
  const from = parseDate(url.searchParams.get('from'));
  const to = parseDate(url.searchParams.get('to'));

  const toDefault = endOfDay(new Date());
  const fromFallback = startOfDay(new Date(Date.now() - 29 * 24 * 3600 * 1000));

  let currentBatches: string[] = [];
  try {
    currentBatches = await getCurrentBatchNames(sb);
  } catch (e) {
    console.error('[crm-analytics] getCurrentBatchNames failed:', e?.message);
    // Continue with empty batches — queries will still run without batch filter
  }

  // Batch start date for default range (try program_batches first, then batches)
  let batchStart: Date | null = null;
  if (currentBatches.length) {
    try {
      // Try program_batches table first (primary source)
      const { data: pbData, error: pbErr } = await sb
        .from('program_batches')
        .select('created_at')
        .in('batch_name', currentBatches)
        .order('created_at', { ascending: true })
        .limit(1);
      if (!pbErr && pbData?.[0]?.created_at) {
        batchStart = startOfDay(new Date(pbData[0].created_at));
      } else {
        // Fallback: try batches table
        const { data } = await sb
          .from('batches')
          .select('created_at')
          .in('name', currentBatches)
          .order('created_at', { ascending: true })
          .limit(1);
        if (data?.[0]?.created_at) batchStart = startOfDay(new Date(data[0].created_at));
      }
    } catch (_) { /* ignore — use last 30 days fallback */ }
  }

  const fromEff = from ? startOfDay(from) : (batchStart || fromFallback);
  const toEff = to ? endOfDay(to) : toDefault;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  // Run all independent queries in parallel
  const [
    followUpResult,
    registrationsResult,
    paymentRegIds,
    leadsResult,
    funnelResult,
  ] = await Promise.all([

    // ── Follow-ups due / overdue ──
    (async () => {
      let due = 0, overdue = 0;
      try {
        let q = sb.from('crm_leads').select('id, assigned_to, management_json').limit(20000);
        if (scopedToOfficer) q = q.eq('assigned_to', officerName);
        const { data } = await q;
        for (const lead of (data || [])) {
          const mgmt = lead.management_json || {};
          for (let n = 1; n <= 5; n++) {
            const schedule = mgmt[`followUp${n}Schedule`];
            const actual = mgmt[`followUp${n}Date`];
            if (!schedule || actual) continue;
            const schedDate = String(schedule).slice(0, 10);
            if (schedDate === todayStr) due++;
            else if (schedDate < todayStr) overdue++;
          }
        }
      } catch (_) { /* ignore */ }
      return { due, overdue };
    })(),

    // ── Registrations received ──
    (async () => {
      try {
        let q = sb.from('registrations')
          .select('id, assigned_to, payload, created_at, batch_name')
          .gte('created_at', fromEff.toISOString())
          .lte('created_at', toEff.toISOString())
          .limit(20000);
        if (currentBatches.length) q = q.in('batch_name', currentBatches);
        if (scopedToOfficer) q = q.eq('assigned_to', officerName);
        const { data } = await q;
        let missing = 0;
        if (isAdminUser) {
          for (const r of (data || [])) {
            const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
            if (!r?.assigned_to && !payload?.assigned_to && !payload?.assignedTo) missing++;
          }
        }
        return { count: (data || []).length, missing };
      } catch (_) { return { count: 0, missing: 0 }; }
    })(),

    // ── Payment-received reg IDs ──
    getPaymentReceivedRegIds(sb, { from: fromEff, to: toEff }).catch(() => []),

    // ── Leads count + active leads ──
    (async () => {
      try {
        let q = sb.from('crm_leads').select('status');
        if (currentBatches.length) q = q.in('batch_name', currentBatches);
        if (scopedToOfficer) q = q.eq('assigned_to', officerName);
        const { data } = await q;
        const total = (data || []).length;
        const active = (data || []).filter((r: any) => {
          const s = String(r.status || '').toLowerCase();
          return s === 'new' || s === 'contacted' || s === 'follow-up' || s === 'followup';
        }).length;
        return { total, active };
      } catch (_) { return { total: 0, active: 0 }; }
    })(),

    // ── Funnel (lead pipeline) ──
    (async () => {
      try {
        let q = sb.from('crm_leads').select('status').limit(20000);
        if (isAdminUser) {
          q = q.gte('created_at', fromEff.toISOString()).lte('created_at', toEff.toISOString());
        }
        if (currentBatches.length) q = q.in('batch_name', currentBatches);
        if (scopedToOfficer) q = q.eq('assigned_to', officerName);
        const { data } = await q;
        const funnel = { new: 0, contacted: 0, followUp: 0, registered: 0 };
        for (const r of (data || [])) {
          const s = String(r.status || '').toLowerCase();
          if (s === 'new') funnel.new++;
          else if (s === 'contacted') funnel.contacted++;
          else if (s === 'follow-up' || s === 'followup') funnel.followUp++;
          else if (s === 'registered') funnel.registered++;
        }
        return funnel;
      } catch (_) { return { new: 0, contacted: 0, followUp: 0, registered: 0 }; }
    })(),
  ]);

  // Confirmed payments — officer-scope if needed
  let confirmedPayments = paymentRegIds.length;
  if (scopedToOfficer && paymentRegIds.length) {
    try {
      let q = sb.from('registrations')
        .select('id', { count: 'exact', head: true })
        .in('id', paymentRegIds)
        .eq('assigned_to', officerName);
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      const { count } = await q;
      confirmedPayments = Number(count || 0);
    } catch (_) { confirmedPayments = 0; }
  }

  const leadsCount = leadsResult.total;
  const activeLeads = leadsResult.active;
  const conversionRate = leadsCount > 0 ? confirmedPayments / leadsCount : 0;

  // ── Time series: enrollments per day ──
  const seriesDays: Array<{ day: string; count: number }> = [];
  try {
    const { data: payRows } = await sb
      .from('payments')
      .select('registration_id, payment_date, created_at, amount, slip_received, receipt_received, installment_no')
      .eq('installment_no', 1)
      .not('registration_id', 'is', null)
      .gte('created_at', fromEff.toISOString())
      .lte('created_at', toEff.toISOString())
      .limit(20000);

    let validRows = (payRows || []).filter((r: any) => {
      const amt = Number(r.amount || 0);
      if (!Number.isFinite(amt) || amt <= 0) return false;
      return !!(r.payment_date || r.slip_received || r.receipt_received);
    });

    if (scopedToOfficer && validRows.length) {
      let rq = sb.from('registrations').select('id').eq('assigned_to', officerName).limit(20000);
      if (currentBatches.length) rq = rq.in('batch_name', currentBatches);
      const { data: rData } = await rq;
      const allowed = new Set((rData || []).map((x: any) => x.id));
      validRows = validRows.filter((p: any) => allowed.has(p.registration_id));
    }

    const days: string[] = [];
    const d0 = startOfDay(fromEff);
    const d1 = startOfDay(toEff);
    for (let d = new Date(d0); d <= d1; d = new Date(d.getTime() + 86400000)) {
      days.push(toISODate(d));
    }
    const counts = new Map<string, Set<string>>(days.map(x => [x, new Set()]));
    for (const r of validRows) {
      const day = toISODate(new Date(r.payment_date || r.created_at));
      if (counts.has(day)) counts.get(day)!.add(r.registration_id);
    }
    seriesDays.push(...days.map(day => ({ day, count: counts.get(day)!.size })));
  } catch (_) { /* ignore */ }

  // ── Action center (admin only) ──
  let actionCenter = null;
  if (isAdminUser) {
    let paymentsToBeConfirmed = 0;
    let toBeEnrolled = 0;

    const [actionPayments, allPayIds] = await Promise.all([
      sb.from('payments')
        .select('id, is_confirmed, installment_no, amount, payment_date, slip_received, receipt_received')
        .eq('installment_no', 1)
        .limit(20000)
        .catch(() => ({ data: [] })),
      getPaymentReceivedRegIds(sb).catch(() => []),
    ]);

    paymentsToBeConfirmed = (actionPayments.data || []).filter((p: any) => {
      const amt = Number(p.amount || 0);
      if (!Number.isFinite(amt) || amt <= 0) return false;
      if (!(p.payment_date || p.slip_received || p.receipt_received)) return false;
      return p.is_confirmed === false;
    }).length;

    if (allPayIds.length && currentBatches.length) {
      try {
        const { data: regs } = await sb
          .from('registrations')
          .select('id')
          .in('id', allPayIds)
          .in('batch_name', currentBatches)
          .limit(20000);
        const regIds = (regs || []).map((r: any) => r.id);
        if (regIds.length) {
          const { count: studentCount } = await sb
            .from('students')
            .select('id', { count: 'exact', head: true })
            .in('registration_id', regIds);
          toBeEnrolled = Math.max(0, regIds.length - Number(studentCount || 0));
        }
      } catch (_) { toBeEnrolled = 0; }
    }

    actionCenter = {
      overdueFollowUps: followUpResult.overdue,
      paymentsToBeConfirmed,
      toBeEnrolled,
      registrationsMissingAssignedTo: registrationsResult.missing,
    };
  }

  return jsonResp({
    success: true,
    range: { from: toISODate(fromEff), to: toISODate(toEff) },
    currentBatches,
    kpis: {
      followUpsDue: followUpResult.due,
      followUpsOverdue: followUpResult.overdue,
      registrationsReceived: registrationsResult.count,
      confirmedPayments,
      conversionRate,
      activeLeads,
    },
    funnel: { ...funnelResult, confirmedPayments },
    series: { confirmedPaymentsPerDay: seriesDays },
    leaderboard: { enrollmentsCurrentBatch: [] }, // served by crm-leaderboard edge function
    actionCenter,
  });
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await getUser(req);
    if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);
    if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
    if (req.method !== 'GET') return jsonResp({ success: false, error: 'Method not allowed' }, 405);

    const sb = adminSb();
    const url = new URL(req.url);
    return await handleAnalytics(sb, user, url);
  } catch (e) {
    console.error('[crm-analytics] error:', e);
    return errResp(e);
  }
});
