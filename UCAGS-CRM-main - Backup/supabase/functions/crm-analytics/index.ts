// @ts-nocheck
/**
 * CRM Analytics — Supabase Edge Function (Deno)
 *
 * Handles:
 *   GET /functions/v1/crm-analytics/analytics — full analytics dashboard data
 *
 * Auth: Supabase JWT in Authorization header.
 * Runs close to the database — eliminates Vercel CPU for analytics queries.
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

function parseISODateOnly(s: string | null | undefined): Date | null {
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

// ---------------------------------------------------------------------------
// Analytics helpers
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

async function getPaymentReceivedRegistrationIds(
  sb: any,
  { from = null, to = null }: { from?: Date | null; to?: Date | null } = {}
): Promise<string[]> {
  // Returns distinct registration_ids where payment-received was saved
  // installment_no=1, amount>0, and (payment_date set OR slip/receipt received).
  const baseSelect = 'registration_id, payment_date, created_at, amount, slip_received, receipt_received, installment_no';

  let q = sb
    .from('payments')
    .select(baseSelect)
    .eq('installment_no', 1)
    .not('registration_id', 'is', null)
    .limit(20000);

  const { data, error } = await q;
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

  return Array.from(new Set(rows.map((r: any) => r.registration_id).filter(Boolean)));
}

// ---------------------------------------------------------------------------
// Main analytics handler
// ---------------------------------------------------------------------------

async function handleAnalytics(req: Request): Promise<Response> {
  try {
    const user = await getUser(req);
    if (!user) {
      return jsonResp({ success: false, error: 'Unauthorized' }, 401);
    }

    const sb = adminSb();
    const isAdminUser = isAdmin(user);
    const officerName = cleanStr(user?.user_metadata?.name ?? '');

    // Query params
    const url = new URL(req.url);
    const from = parseISODateOnly(url.searchParams.get('from'));
    const to = parseISODateOnly(url.searchParams.get('to'));
    const officerId = url.searchParams.get('officerId');

    // If officerId provided and user is admin/supervisor, look up that officer's name
    let effectiveOfficerName = officerName;
    if (officerId && isAdminUser) {
      try {
        const { data: { users = [] } } = await adminSb().auth.admin.listUsers();
        const targetUser = users.find((u: any) => u.id === officerId);
        if (targetUser?.user_metadata?.name) {
          effectiveOfficerName = cleanStr(targetUser.user_metadata.name);
        }
      } catch (e) {
        // ignore — proceed with original officerName
      }
    }

    // Get current batches
    const currentBatches = await getCurrentBatchNames(sb);

    // Default window: current batch start date -> today (fallback: last 30 days)
    const toDefault = endOfDay(new Date());
    const fromFallback = startOfDay(new Date(Date.now() - 29 * 24 * 3600 * 1000));

    let batchStart = null;
    try {
      if (currentBatches.length) {
        const { data, error } = await sb
          .from('batches')
          .select('created_at')
          .in('name', currentBatches)
          .order('created_at', { ascending: true })
          .limit(1);
        if (!error) {
          const first = (data || [])[0];
          if (first?.created_at) batchStart = startOfDay(new Date(first.created_at));
        }
      }
    } catch (e) {
      // ignore
    }

    const fromDefault = batchStart || fromFallback;
    const fromEff = from ? startOfDay(from) : fromDefault;
    const toEff = to ? endOfDay(to) : toDefault;

    // Run all queries in parallel where possible
    const [
      followUpsCounts,
      registrationsData,
      confirmedRegIds,
      leadsData,
      funnelData,
      timeSeriesData,
      actionCenterData
    ] = await Promise.all([
      // a) Follow-ups due/overdue
      (async () => {
        let followUpsDue = 0;
        let followUpsOverdue = 0;
        try {
          const now = new Date();
          const pad2 = (n: number) => String(n).padStart(2, '0');
          const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

          let leadsQuery = sb
            .from('crm_leads')
            .select('id, assigned_to, management_json')
            .limit(20000);

          if (!isAdminUser && effectiveOfficerName) {
            leadsQuery = leadsQuery.eq('assigned_to', effectiveOfficerName);
          }

          const { data: leadsDataList, error: leadsError } = await leadsQuery;
          if (leadsError) throw leadsError;

          (leadsDataList || []).forEach((lead: any) => {
            const mgmt = lead.management_json || {};
            for (const n of [1, 2, 3, 4, 5]) {
              const schedule = mgmt[`followUp${n}Schedule`];
              const actual = mgmt[`followUp${n}Date`];
              if (!schedule || actual) continue;

              const scheduleDate = String(schedule).slice(0, 10);
              if (scheduleDate === todayStr) {
                followUpsDue++;
              } else if (scheduleDate < todayStr) {
                followUpsOverdue++;
              }
            }
          });
        } catch (e) {
          // ignore
        }
        return { followUpsDue, followUpsOverdue };
      })(),

      // b) Registrations received
      (async () => {
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
          if (!isAdminUser && effectiveOfficerName) q = q.eq('assigned_to', effectiveOfficerName);
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
        } catch (e) {
          // ignore
        }
        return { registrationsReceived, missingAssignedTo };
      })(),

      // c) Confirmed payment registration IDs
      getPaymentReceivedRegistrationIds(sb, { from: fromEff, to: toEff }),

      // d) Leads count + active leads
      (async () => {
        let leadsCount = 0;
        let activeLeads = 0;
        try {
          let q = sb
            .from('crm_leads')
            .select('status');
          if (currentBatches.length) q = q.in('batch_name', currentBatches);
          if (!isAdminUser && effectiveOfficerName) q = q.eq('assigned_to', effectiveOfficerName);
          const { data: leadsDataList, error } = await q;
          if (error) throw error;
          leadsCount = (leadsDataList || []).length;
          activeLeads = (leadsDataList || []).filter((r: any) => {
            const s = String(r.status || '').toLowerCase();
            return s === 'new' || s === 'contacted' || s === 'follow-up' || s === 'followup';
          }).length;
        } catch (e) {
          // ignore
        }
        return { leadsCount, activeLeads };
      })(),

      // e) Funnel
      (async () => {
        let funnel = { new: 0, contacted: 0, followUp: 0, registered: 0 };
        try {
          let q = sb
            .from('crm_leads')
            .select('status')
            .limit(20000);

          // Only apply date range filter for admin users
          if (isAdminUser) {
            q = q
              .gte('created_at', fromEff.toISOString())
              .lte('created_at', toEff.toISOString());
          }

          if (currentBatches.length) q = q.in('batch_name', currentBatches);
          if (!isAdminUser && effectiveOfficerName) q = q.eq('assigned_to', effectiveOfficerName);

          const { data, error } = await q;
          if (error) throw error;

          for (const r of (data || [])) {
            const s = String(r.status || '').toLowerCase();
            if (s === 'new') funnel.new++;
            else if (s === 'contacted') funnel.contacted++;
            else if (s === 'follow-up' || s === 'followup') funnel.followUp++;
            else if (s === 'registered') funnel.registered++;
          }
        } catch (e) {
          // keep defaults
        }
        return funnel;
      })(),

      // f) Time series (enrollments per day)
      (async () => {
        const seriesDays = [];
        try {
          const days = [];
          const d0 = startOfDay(fromEff);
          const d1 = startOfDay(toEff);
          for (let d = new Date(d0); d <= d1; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
            days.push(toISODate(d));
          }
          const counts = new Map(days.map((x: string) => [x, 0]));

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

          // Officers should see only their own enrollments
          if (!isAdminUser && effectiveOfficerName && payRows.length) {
            try {
              let rq = sb
                .from('registrations')
                .select('id')
                .eq('assigned_to', effectiveOfficerName)
                .limit(20000);
              if (currentBatches.length) rq = rq.in('batch_name', currentBatches);
              const { data: rData, error: rErr } = await rq;
              if (rErr) throw rErr;
              const allowed = new Set((rData || []).map((x: any) => x.id));
              payRows = payRows.filter((p: any) => allowed.has(p.registration_id));
            } catch (e) {
              payRows = [];
            }
          }

          // Count distinct registration_id per day
          const seenByDay = new Map();
          for (const r of payRows) {
            const day = toISODate(new Date(r.payment_date || r.created_at));
            if (!counts.has(day)) continue;
            if (!seenByDay.has(day)) seenByDay.set(day, new Set());
            seenByDay.get(day).add(r.registration_id);
          }
          for (const [day, set] of seenByDay.entries()) {
            counts.set(day, set.size);
          }

          seriesDays.push(...days.map((day: string) => ({ day, count: counts.get(day) || 0 })));
        } catch (e) {
          // ignore
        }
        return seriesDays;
      })(),

      // g) Action center (admin only)
      (async () => {
        if (!isAdminUser) return null;

        let paymentsToBeConfirmed = 0;
        let toBeEnrolled = 0;

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
        } catch (e1: any) {
          const msg = String(e1.message || '').toLowerCase();
          const missingCol =
            (msg.includes('column') && msg.includes('is_confirmed') && msg.includes('does not exist')) ||
            (msg.includes('schema cache') && msg.includes('is_confirmed') && msg.includes('could not find'));
          if (!missingCol) {
            console.warn('ActionCenter: failed paymentsToBeConfirmed:', e1.message || e1);
          }
          paymentsToBeConfirmed = 0;
        }

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
              let studentCount = 0;
              try {
                const { count, error: sErr } = await sb
                  .from('students')
                  .select('id', { count: 'exact', head: true })
                  .in('registration_id', regIds);
                if (sErr) throw sErr;
                studentCount = Number(count || 0);
              } catch (e2) {
                studentCount = 0;
              }

              toBeEnrolled = Math.max(0, regIds.length - studentCount);
            }
          }
        } catch (e) {
          toBeEnrolled = 0;
        }

        return {
          overdueFollowUps: 0, // will be filled from followUpsCounts.followUpsOverdue
          paymentsToBeConfirmed,
          toBeEnrolled,
          registrationsMissingAssignedTo: 0 // will be filled from registrationsData.missingAssignedTo
        };
      })()
    ]);

    // Extract values
    const { followUpsDue, followUpsOverdue } = followUpsCounts;
    const { registrationsReceived, missingAssignedTo } = registrationsData;
    const confirmedPayments = confirmedRegIds.length;

    // Officer's confirmed payments: filter to their own
    let officerConfirmedPayments = confirmedPayments;
    if (!isAdminUser && effectiveOfficerName && confirmedRegIds.length) {
      try {
        let q = sb
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .in('id', confirmedRegIds)
          .eq('assigned_to', effectiveOfficerName);
        if (currentBatches.length) q = q.in('batch_name', currentBatches);
        const { count, error } = await q;
        if (error) throw error;
        officerConfirmedPayments = Number(count || 0);
      } catch (e) {
        officerConfirmedPayments = 0;
      }
    }

    const { leadsCount, activeLeads } = leadsData;
    const conversionRate = leadsCount > 0 ? (officerConfirmedPayments / leadsCount) : 0;

    const funnel = {
      ...funnelData,
      confirmedPayments: officerConfirmedPayments
    };

    // Update action center with actual counts
    const actionCenter = actionCenterData
      ? {
          ...actionCenterData,
          overdueFollowUps: followUpsOverdue,
          registrationsMissingAssignedTo: missingAssignedTo
        }
      : null;

    const payload = {
      success: true,
      range: { from: toISODate(fromEff), to: toISODate(toEff) },
      currentBatches,
      kpis: {
        followUpsDue,
        followUpsOverdue,
        registrationsReceived,
        confirmedPayments: officerConfirmedPayments,
        conversionRate,
        activeLeads
      },
      funnel,
      series: {
        confirmedPaymentsPerDay: timeSeriesData
      },
      leaderboard: {
        enrollmentsCurrentBatch: []
      },
      actionCenter
    };

    return jsonResp(payload);
  } catch (e) {
    console.error('Analytics error:', e);
    return errResp(e);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Handle CORS
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const url = new URL(req.url);
    const subPath = url.pathname.split('/').filter(Boolean).pop() || '';

    // GET /functions/v1/crm-analytics or /functions/v1/crm-analytics/analytics
    if ((subPath === 'analytics' || subPath === 'crm-analytics' || url.pathname.endsWith('/crm-analytics')) && req.method === 'GET') {
      return await handleAnalytics(req);
    }

    return jsonResp({ success: false, error: 'Not found' }, 404);
  } catch (e) {
    return errResp(e);
  }
});
