// @ts-nocheck
/**
 * CRM Leaderboard — Supabase Edge Function (Deno)
 *
 * Runs close to the database (no cold-start penalty, no Vercel CPU usage).
 * Returns officer leaderboard: enrollments + leads assigned for current batch(es).
 *
 * GET /functions/v1/crm-leaderboard
 * Auth: Supabase JWT in Authorization header (admin or officer).
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
// Core leaderboard logic
// ---------------------------------------------------------------------------

async function getLeaderboard(sb: any): Promise<any> {
  // 1. Get current batch names
  let currentBatches: string[] = [];
  try {
    const { data, error } = await sb
      .from('program_batches')
      .select('batch_name')
      .eq('is_current', true);
    if (!error) {
      currentBatches = Array.from(
        new Set((data || []).map((r: any) => r.batch_name).filter(Boolean))
      );
    }
  } catch (_) {}

  if (!currentBatches.length) {
    return { success: true, currentBatches: [], leaderboard: [] };
  }

  // 2. Get all staff names from auth (officers, admission officers, admins — anyone who can be assigned leads)
  const officerNames: string[] = [];
  try {
    const { data: uData, error: uErr } = await sb.auth.admin.listUsers({
      page: 1,
      perPage: 2000,
    });
    if (!uErr) {
      (uData?.users || []).forEach((u: any) => {
        const role = cleanStr(u?.user_metadata?.role);
        const staffRoles: string[] = Array.isArray(u?.user_metadata?.staff_roles)
          ? u.user_metadata.staff_roles
          : [];
        // Include anyone who could be assigned leads: officers, admission officers, admins, supervisors
        const isStaff =
          role === 'officer' ||
          role === 'admission_officer' ||
          role === 'admin' ||
          role === 'supervisor' ||
          staffRoles.includes('officer') ||
          staffRoles.includes('admission_officer') ||
          staffRoles.includes('admin');
        if (!isStaff) return;
        const name = cleanStr(u?.user_metadata?.name || u?.email?.split('@')?.[0]);
        if (name) officerNames.push(name);
      });
    }
  } catch (_) {}

  // 3. Get payment-received registration IDs (installment_no=1, amount>0, payment_date OR slip)
  let paidRegIds: string[] = [];
  try {
    const { data: payData, error: payErr } = await sb
      .from('payments')
      .select('registration_id, payment_date, amount, slip_received, receipt_received, installment_no')
      .eq('installment_no', 1)
      .not('registration_id', 'is', null)
      .limit(20000);

    if (!payErr) {
      const filtered = (payData || []).filter((r: any) => {
        const amt = Number(r.amount || 0);
        if (!isFinite(amt) || amt <= 0) return false;
        return !!(r.payment_date || r.slip_received || r.receipt_received);
      });
      paidRegIds = Array.from(
        new Set(filtered.map((r: any) => r.registration_id).filter(Boolean))
      );
    }
  } catch (_) {}

  // 4. Enrollments per officer (registrations in current batch with payment received)
  const enrollmentsMap = new Map<string, number>();
  for (const n of officerNames) enrollmentsMap.set(n, 0);

  if (paidRegIds.length) {
    try {
      let q = sb
        .from('registrations')
        .select('id, assigned_to, payload, batch_name')
        .in('id', paidRegIds)
        .in('batch_name', currentBatches)
        .limit(20000);
      const { data: regs, error: regErr } = await q;
      if (!regErr) {
        for (const r of (regs || [])) {
          const payload =
            r?.payload && typeof r.payload === 'object' ? r.payload : {};
          const officer = cleanStr(
            r?.assigned_to ||
              payload?.assigned_to ||
              payload?.assignedTo ||
              'Unassigned'
          ) || 'Unassigned';
          enrollmentsMap.set(officer, (enrollmentsMap.get(officer) || 0) + 1);
        }
      }
    } catch (_) {}
  }

  // 5. Leads assigned per officer (current batch)
  const leadsMap = new Map<string, number>();
  for (const n of officerNames) leadsMap.set(n, 0);

  try {
    let q = sb
      .from('crm_leads')
      .select('assigned_to')
      .in('batch_name', currentBatches)
      .limit(20000);
    const { data: leadsData, error: leadsErr } = await q;
    if (!leadsErr) {
      for (const r of (leadsData || [])) {
        const officer = cleanStr(r?.assigned_to || 'Unassigned') || 'Unassigned';
        leadsMap.set(officer, (leadsMap.get(officer) || 0) + 1);
      }
    }
  } catch (_) {}

  // 6. Registrations per officer (current batch)
  const regsMap = new Map<string, number>();
  for (const n of officerNames) regsMap.set(n, 0);

  try {
    let q = sb
      .from('registrations')
      .select('assigned_to, payload')
      .in('batch_name', currentBatches)
      .limit(20000);
    const { data: allRegs, error: allRegsErr } = await q;
    if (!allRegsErr) {
      for (const r of (allRegs || [])) {
        const payload =
          r?.payload && typeof r.payload === 'object' ? r.payload : {};
        const officer = cleanStr(
          r?.assigned_to || payload?.assigned_to || payload?.assignedTo || 'Unassigned'
        ) || 'Unassigned';
        regsMap.set(officer, (regsMap.get(officer) || 0) + 1);
      }
    }
  } catch (_) {}

  // 7. Build leaderboard array
  const allOfficers = new Set([
    ...enrollmentsMap.keys(),
    ...leadsMap.keys(),
    ...regsMap.keys(),
  ]);

  const leaderboard = Array.from(allOfficers)
    .filter((o) => o !== 'Unassigned' && o !== 'Duplicate' && o !== '')
    .map((officer) => {
      const enrollments = enrollmentsMap.get(officer) || 0;
      const leadsAssigned = leadsMap.get(officer) || 0;
      const registrations = regsMap.get(officer) || 0;
      const conversionRate = leadsAssigned > 0 ? enrollments / leadsAssigned : 0;
      return { officer, enrollments, leadsAssigned, registrations, conversionRate };
    })
    .sort(
      (a, b) =>
        b.enrollments - a.enrollments ||
        b.conversionRate - a.conversionRate ||
        a.officer.localeCompare(b.officer)
    );

  return {
    success: true,
    currentBatches,
    leaderboard,
  };
}

// ---------------------------------------------------------------------------
// Request handler
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

    const sb = adminSb();
    const result = await getLeaderboard(sb);
    return jsonResp(result);
  } catch (e) {
    console.error('[crm-leaderboard] error:', e);
    return errResp(e);
  }
});
