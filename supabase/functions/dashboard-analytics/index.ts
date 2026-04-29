// @ts-nocheck
/**
 * dashboard-analytics – Supabase Edge Function (Deno)
 *
 * Migrated from: GET /api/dashboard/analytics in dashboardRoutes.js
 *
 * Route:
 *   GET /dashboard-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Auth: Supabase JWT in Authorization header.
 * Service-role operations use SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Simple module-level cache (per isolate, resets on cold start)
// ---------------------------------------------------------------------------
const __analyticsCache = new Map<string, { value: any; expiresAt: number }>();
const __officerNamesCache = { at: 0, ttlMs: 5 * 60 * 1000, value: [] as string[] };

function cacheGet(map: Map<string, any>, key: string): any | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { map.delete(key); return null; }
  return hit.value;
}

function cacheSet(map: Map<string, any>, key: string, value: any, ttlMs: number) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Date helpers (same logic as Express handler)
// ---------------------------------------------------------------------------
function parseISODateOnly(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isFinite(d.getTime()) ? d : null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toISODate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// getCurrentBatchNames
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
  return Array.from(new Set((data || []).map((r: any) => r.batch_name).filter(Boolean))) as string[];
}

// ---------------------------------------------------------------------------
// getPaymentReceivedRegistrationIds
// ---------------------------------------------------------------------------
async function getPaymentReceivedRegistrationIds(sb: any, { from = null, to = null }: { from?: Date | null; to?: Date | null } = {}): Promise<string[]> {
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
    const hasReceipt = !!(r.slip_received || r.receipt_received);
    const hasDate = !!r.payment_date;
    return hasDate || hasReceipt;
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

  return Array.from(new Set(rows.map((r: any) => r.registration_id).filter(Boolean))) as string[];
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

    // Auth
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!jwt) return jsonResp({ success: false, error: 'Unauthorized' }, 401);

    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);

    const isAdminUser = String(user.user_metadata?.role || '').toLowerCase() === 'admin';
    const officerName = String(user.user_metadata?.name || '').trim();

    const url = new URL(req.url);
    const from = parseISODateOnly(url.searchParams.get('from'));
    const to   = parseISODateOnly(url.searchParams.get('to'));

    // Cache key
    const cacheKey = JSON.stringify({
      v: 6,
      role: isAdminUser ? 'admin' : 'officer',
      officerName: isAdminUser ? '' : officerName,
      from: String(url.searchParams.get('from') || ''),
      to:   String(url.searchParams.get('to') || ''),
    });
    const cached = cacheGet(__analyticsCache, cacheKey);
    if (cached) return jsonResp(cached);

    const currentBatches = await getCurrentBatchNames(sb);

    // Default window
    const toDefault   = endOfDay(new Date());
    const fromFallback = startOfDay(new Date(Date.now() - 29 * 24 * 3600 * 1000));

    let batchStart: Date | null = null;
    try {
      if (currentBatches.length) {
        const { data } = await sb
          .from('batches')
          .select('created_at')
          .in('name', currentBatches)
          .order('created_at', { ascending: true })
          .limit(1);
        const first = (data || [])[0];
        if (first?.created_at) batchStart = startOfDay(new Date(first.created_at));
      }
    } catch (_) { /* ignore */ }

    const fromDefault = batchStart || fromFallback;
    const fromEff = from ? startOfDay(from) : fromDefault;
    const toEff   = to   ? endOfDay(to)     : toDefault;

    // ── Follow-ups due/overdue ────────────────────────────────────────────
    let followUpsDue = 0;
    let followUpsOverdue = 0;
    try {
      const now = new Date();
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

      let leadsQuery = sb.from('crm_leads').select('id, assigned_to, management_json').limit(20000);
      if (!isAdminUser && officerName) leadsQuery = leadsQuery.eq('assigned_to', officerName);

      const { data: leadsData, error: leadsError } = await leadsQuery;
      if (leadsError) throw leadsError;

      (leadsData || []).forEach((lead: any) => {
        const mgmt = lead.management_json || {};
        for (const n of [1, 2, 3, 4, 5]) {
          const schedule = mgmt[`followUp${n}Schedule`];
          const actual   = mgmt[`followUp${n}Date`];
          if (!schedule || actual) continue;
          const scheduleDate = String(schedule).slice(0, 10);
          if (scheduleDate === todayStr) followUpsDue++;
          else if (scheduleDate < todayStr) followUpsOverdue++;
        }
      });
    } catch (_) { /* ignore */ }

    // ── Registrations received ────────────────────────────────────────────
    let registrationsReceived = 0;
    let missingAssignedTo = 0;
    try {
      let q = sb
        .from('registrations')
        .select('id, assigned_to, payload, created_at, batch_name')
        .gte('created_at', fromEff.toISOString())
        .lte('created_at', toEff.toISOString())
        .limit(20000);
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      if (!isAdminUser && officerName) q = q.eq('assigned_to', officerName);
      const { data, error } = await q;
      if (error) throw error;
      registrationsReceived = (data || []).length;
      if (isAdminUser) {
        (data || []).forEach((r: any) => {
          const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
          const a = r?.assigned_to || payload?.assigned_to || payload?.assignedTo;
          if (!a) missingAssignedTo++;
        });
      }
    } catch (_) { /* ignore */ }

    // ── Confirmed payments (date-filtered) ───────────────────────────────
    const confirmedRegIds = await getPaymentReceivedRegistrationIds(sb, { from: fromEff, to: toEff });
    let confirmedPayments = confirmedRegIds.length;

    if (!isAdminUser && officerName && confirmedRegIds.length) {
      try {
        let q = sb
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .in('id', confirmedRegIds)
          .eq('assigned_to', officerName);
        if (currentBatches.length) q = q.in('batch_name', currentBatches);
        const { count, error } = await q;
        if (error) throw error;
        confirmedPayments = Number(count || 0);
      } catch (_) { confirmedPayments = 0; }
    }

    // ── Confirmed payments (all-time, for conversion rate) ───────────────
    let confirmedPaymentsAllTime = 0;
    try {
      const allRegIds = await getPaymentReceivedRegistrationIds(sb);
      if (allRegIds.length) {
        let q = sb
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .in('id', allRegIds);
        if (currentBatches.length) q = q.in('batch_name', currentBatches);
        if (!isAdminUser && officerName) q = q.eq('assigned_to', officerName);
        const { count, error } = await q;
        if (!error) confirmedPaymentsAllTime = Number(count || 0);
      }
    } catch (_) { confirmedPaymentsAllTime = confirmedPayments; }

    // ── Leads count + active leads ────────────────────────────────────────
    let leadsCount = 0;
    let activeLeads = 0;
    try {
      let q = sb.from('crm_leads').select('status');
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      if (!isAdminUser && officerName) q = q.eq('assigned_to', officerName);
      const { data: leadsData, error } = await q;
      if (error) throw error;
      leadsCount = (leadsData || []).length;
      activeLeads = (leadsData || []).filter((r: any) => {
        const s = String(r.status || '').toLowerCase();
        return s === 'new' || s === 'contacted' || s === 'follow-up' || s === 'followup';
      }).length;
    } catch (_) { /* ignore */ }

    const conversionRate = leadsCount > 0 ? (confirmedPaymentsAllTime / leadsCount) : 0;

    // ── Funnel ────────────────────────────────────────────────────────────
    let funnel: any = { new: 0, contacted: 0, followUp: 0, registered: 0, confirmedPayments };
    try {
      let q = sb.from('crm_leads').select('status').limit(20000);
      if (isAdminUser) {
        q = q.gte('created_at', fromEff.toISOString()).lte('created_at', toEff.toISOString());
      }
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      if (!isAdminUser && officerName) q = q.eq('assigned_to', officerName);
      const { data, error } = await q;
      if (error) throw error;
      for (const r of (data || [])) {
        const s = String(r.status || '').toLowerCase();
        if (s === 'new') funnel.new++;
        else if (s === 'contacted') funnel.contacted++;
        else if (s === 'follow-up' || s === 'followup') funnel.followUp++;
        else if (s === 'registered') funnel.registered++;
      }
    } catch (_) { /* ignore */ }

    // ── Time series ───────────────────────────────────────────────────────
    const seriesDays: any[] = [];
    {
      const days: string[] = [];
      const d0 = startOfDay(fromEff);
      const d1 = startOfDay(toEff);
      for (let d = new Date(d0); d <= d1; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
        days.push(toISODate(d));
      }
      const counts = new Map(days.map(x => [x, 0]));

      try {
        const { data, error } = await sb
          .from('payments')
          .select('registration_id, payment_date, created_at, amount, slip_received, receipt_received, installment_no')
          .eq('installment_no', 1)
          .not('registration_id', 'is', null)
          .gte('created_at', fromEff.toISOString())
          .lte('created_at', toEff.toISOString())
          .limit(20000);
        if (error) throw error;

        let payRows = (data || []).filter((r: any) => {
          const amt = Number(r.amount || 0);
          if (!Number.isFinite(amt) || amt <= 0) return false;
          const hasReceipt = !!(r.slip_received || r.receipt_received);
          const hasDate = !!r.payment_date;
          return hasDate || hasReceipt;
        });

        if (!isAdminUser && officerName && payRows.length) {
          try {
            let rq = sb.from('registrations').select('id').eq('assigned_to', officerName).limit(20000);
            if (currentBatches.length) rq = rq.in('batch_name', currentBatches);
            const { data: rData, error: rErr } = await rq;
            if (rErr) throw rErr;
            const allowed = new Set((rData || []).map((x: any) => x.id));
            payRows = payRows.filter((p: any) => allowed.has(p.registration_id));
          } catch (_) { payRows = []; }
        }

        const seenByDay = new Map<string, Set<string>>();
        for (const r of payRows) {
          const day = toISODate(new Date(r.payment_date || r.created_at));
          if (!counts.has(day)) continue;
          if (!seenByDay.has(day)) seenByDay.set(day, new Set());
          seenByDay.get(day)!.add(r.registration_id);
        }
        for (const [day, set] of seenByDay.entries()) {
          counts.set(day, set.size);
        }
      } catch (_) { /* ignore */ }

      seriesDays.push(...days.map(day => ({ day, count: counts.get(day) || 0 })));
    }

    // ── Leaderboard ───────────────────────────────────────────────────────
    const officerNames: string[] = [];
    try {
      if (Date.now() < (__officerNamesCache.at + __officerNamesCache.ttlMs)) {
        officerNames.push(...__officerNamesCache.value);
      } else {
        const { data: uData, error: uErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
        if (uErr) throw uErr;
        const names: string[] = [];
        (uData?.users || []).forEach((u: any) => {
          const role = u.user_metadata?.role || 'officer';
          if (role === 'admin') return;
          const isOfficer = role === 'officer' || role === 'admission_officer';
          if (!isOfficer) return;
          const name = u.user_metadata?.name || u.email?.split('@')?.[0] || '';
          if (name) names.push(String(name));
        });
        __officerNamesCache.value = names;
        __officerNamesCache.at = Date.now();
        officerNames.push(...names);
      }
    } catch (_) { /* ignore */ }

    const enrollmentsMap = new Map<string, number>();
    for (const n of officerNames) enrollmentsMap.set(n, 0);

    const batchConfirmedIds = await getPaymentReceivedRegistrationIds(sb);
    if (batchConfirmedIds.length) {
      let q = sb
        .from('registrations')
        .select('id, assigned_to, payload, batch_name')
        .in('id', batchConfirmedIds)
        .limit(20000);
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      const { data, error } = await q;
      if (!error) {
        for (const r of (data || [])) {
          const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
          const officer = String(r?.assigned_to || payload?.assigned_to || payload?.assignedTo || 'Unassigned').trim() || 'Unassigned';
          enrollmentsMap.set(officer, (enrollmentsMap.get(officer) || 0) + 1);
        }
      }
    }

    const leadsMap = new Map<string, number>();
    for (const n of officerNames) leadsMap.set(n, 0);
    try {
      let q = sb.from('crm_leads').select('assigned_to, batch_name').limit(20000);
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      const { data, error } = await q;
      if (error) throw error;
      for (const r of (data || [])) {
        const officer = String(r?.assigned_to || 'Unassigned').trim() || 'Unassigned';
        leadsMap.set(officer, (leadsMap.get(officer) || 0) + 1);
      }
    } catch (_) { /* ignore */ }

    const leaderboard = Array.from(new Set([...enrollmentsMap.keys(), ...leadsMap.keys()]))
      .map(officer => {
        const count = enrollmentsMap.get(officer) || 0;
        const leadsAssigned = leadsMap.get(officer) || 0;
        const cr = leadsAssigned > 0 ? (count / leadsAssigned) : 0;
        return { officer, count, leadsAssigned, conversionRate: cr };
      })
      .filter(r => String(r.officer || '').toLowerCase() !== 'admin')
      .sort((a, b) => b.count - a.count || b.conversionRate - a.conversionRate || a.officer.localeCompare(b.officer));

    // ── Action center (admin only) ─────────────────────────────────────────
    let paymentsToBeConfirmed = 0;
    let toBeEnrolled = 0;

    if (isAdminUser) {
      try {
        const { data, error } = await sb
          .from('payments')
          .select('id, is_confirmed, installment_no, amount, payment_date, slip_received, receipt_received')
          .eq('installment_no', 1)
          .limit(20000);
        if (error) throw error;
        paymentsToBeConfirmed = (data || []).filter((p: any) => {
          const amt = Number(p.amount || 0);
          if (!Number.isFinite(amt) || amt <= 0) return false;
          const hasReceipt = !!(p.slip_received || p.receipt_received);
          const hasDate = !!p.payment_date;
          if (!(hasDate || hasReceipt)) return false;
          return p.is_confirmed === false;
        }).length;
      } catch (_) { paymentsToBeConfirmed = 0; }

      try {
        const paymentReceivedIds = await getPaymentReceivedRegistrationIds(sb);
        if (paymentReceivedIds.length) {
          const { data: regs, error: rErr } = await sb
            .from('registrations')
            .select('id, batch_name')
            .in('id', paymentReceivedIds)
            .in('batch_name', currentBatches)
            .limit(20000);
          if (rErr) throw rErr;
          const regIds = (regs || []).map((r: any) => r.id);
          if (regIds.length) {
            try {
              const { count, error: sErr } = await sb
                .from('students')
                .select('id', { count: 'exact', head: true })
                .in('registration_id', regIds);
              if (sErr) throw sErr;
              toBeEnrolled = Math.max(0, regIds.length - Number(count || 0));
            } catch (_) { toBeEnrolled = 0; }
          }
        }
      } catch (_) { toBeEnrolled = 0; }
    }

    // ── Build response payload ─────────────────────────────────────────────
    const payload = {
      success: true,
      range: { from: toISODate(fromEff), to: toISODate(toEff) },
      currentBatches,
      kpis: { followUpsDue, followUpsOverdue, registrationsReceived, confirmedPayments, conversionRate, activeLeads },
      funnel,
      series: { confirmedPaymentsPerDay: seriesDays },
      leaderboard: { enrollmentsCurrentBatch: leaderboard },
      actionCenter: isAdminUser ? {
        overdueFollowUps: followUpsOverdue,
        paymentsToBeConfirmed,
        toBeEnrolled,
        registrationsMissingAssignedTo: missingAssignedTo,
      } : null,
    };

    cacheSet(__analyticsCache, cacheKey, payload, 3 * 60 * 1000);
    return jsonResp(payload);

  } catch (e: any) {
    console.error('[dashboard-analytics error]', e?.message ?? e);
    return jsonResp({ success: false, error: e?.message ?? String(e) }, e?.status || 500);
  }
});
