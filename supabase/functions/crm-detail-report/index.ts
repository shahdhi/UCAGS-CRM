// @ts-nocheck
/**
 * CRM Detail Report — Supabase Edge Function (Deno)
 *
 * Provides a comprehensive per-officer activity report covering:
 *   attendance, leads assigned, leads contacted, follow-ups, overdue follow-ups,
 *   contacts saved, daily reports, registrations, enrollments, demo sessions.
 *
 * Routes:
 *   GET /officers                               — list all staff (admin only)
 *   GET /report?officerId=&from=&to=            — full officer report (admin only)
 *
 * Auth: expects a Supabase JWT in Authorization header.
 * Service-role ops use SUPABASE_SERVICE_ROLE_KEY (available natively in edge runtime).
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
// Auth helpers
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

function requireAuth(user: any | null): asserts user is NonNullable<typeof user> {
  if (!user) throw mkErr('Unauthorized', 401);
}

function requireAdmin(user: any | null) {
  requireAuth(user);
  if (!isAdmin(user)) throw mkErr('Forbidden: admin only', 403);
}

// ---------------------------------------------------------------------------
// Officer list
// ---------------------------------------------------------------------------

async function listOfficers(sb: any) {
  const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
  if (error) throw error;

  const STAFF_ROLES = new Set(['officer', 'admin', 'academic_advisor', 'supervisor', 'admission_officer']);

  return (users as any[])
    .filter(u => {
      const role = cleanStr(u.user_metadata?.role);
      return STAFF_ROLES.has(role) || ADMIN_EMAILS.includes(cleanStr(u.email).toLowerCase());
    })
    .map(u => ({
      id: u.id,
      name: cleanStr(u.user_metadata?.name || u.user_metadata?.full_name || u.email),
      email: cleanStr(u.email),
      role: cleanStr(u.user_metadata?.role),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Officer name resolver (for name-keyed columns like assigned_to)
// ---------------------------------------------------------------------------

async function resolveOfficerName(sb: any, officerId: string): Promise<string | null> {
  const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
  if (error) throw error;
  const user = (users as any[]).find(u => u.id === officerId);
  if (!user) return null;
  return cleanStr(
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.email
  ) || null;
}

// ---------------------------------------------------------------------------
// Officer Report
// ---------------------------------------------------------------------------

async function getOfficerReport(sb: any, officerId: string, from: string, to: string) {
  // Date bounds
  const fromStart = from + 'T00:00:00.000Z';
  const toEnd   = to   + 'T23:59:59.999Z';

  // Resolve officer name for name-keyed columns
  const officerName = await resolveOfficerName(sb, officerId);

  // ------------------------------------------------------------------
  // Parallel data fetch — all 13 queries at once
  // ------------------------------------------------------------------
  const safeQ = (p: Promise<any>) => p.catch(() => ({ data: [], error: null }));

  const nameQuery = (table: string, cols: string) =>
    officerName
      ? safeQ(sb.from(table).select(cols).eq('assigned_to', officerName)
          .gte('created_at', fromStart).lte('created_at', toEnd)
          .order('created_at', { ascending: false }))
      : Promise.resolve({ data: [], error: null });

  const [
    attendanceRes,
    leadsAssignedRes,
    leadsContactedEventsRes,
    followupsRes,
    overdueFollowupsRes,
    contactsSavedRes,
    dailyReportsRes,
    registrationsRes,
    registrationXpRes,
    enrollmentsRes,
    enrollmentXpRes,
    demoInvitesRes,
    demoXpRes,
  ] = await Promise.all([
    // 1. Attendance
    safeQ(
      sb.from('attendance_records')
        .select('id, date, check_in, check_out, check_in_iso, check_out_iso')
        .eq('user_id', officerId)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
    ),

    // 2. Leads assigned (name-based)
    nameQuery(
      'crm_leads',
      'id, name, email, phone, status, assigned_to, created_at, source, program_name, batch_name'
    ),

    // 3. Leads contacted XP events
    safeQ(
      sb.from('officer_xp_events')
        .select('id, reference_id, xp, created_at, notes')
        .eq('user_id', officerId)
        .eq('event_type', 'lead_contacted')
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),

    // 4. Follow-ups created in range
    safeQ(
      sb.from('crm_lead_followups')
        .select('id, sheet_lead_id, channel, scheduled_at, actual_at, answered, comment, created_at, updated_at')
        .eq('officer_user_id', officerId)
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),

    // 5. Overdue follow-ups (scheduled in past, not completed)
    safeQ(
      sb.from('crm_lead_followups')
        .select('id, sheet_lead_id, channel, scheduled_at, comment, created_at')
        .eq('officer_user_id', officerId)
        .lte('scheduled_at', new Date().toISOString())
        .is('actual_at', null)
        .order('scheduled_at', { ascending: true })
    ),

    // 6. Contacts saved
    safeQ(
      sb.from('contacts')
        .select('id, display_name, phone_number, email, created_at')
        .eq('assigned_user_id', officerId)
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),

    // 7. Daily officer reports
    safeQ(
      sb.from('daily_officer_reports')
        .select('id, report_date, slot_key, submitted_at, fresh_calls_made, fresh_messages_reached, interested_leads, closures')
        .eq('officer_user_id', officerId)
        .gte('report_date', from)
        .lte('report_date', to)
        .order('submitted_at', { ascending: false })
    ),

    // 8. Registrations (name-based)
    nameQuery(
      'registrations',
      'id, full_name, email, phone_number, created_at, payment_status, program_name, batch_name'
    ),

    // 9. Registration XP events
    safeQ(
      sb.from('officer_xp_events')
        .select('id, reference_id, xp, created_at')
        .eq('user_id', officerId)
        .eq('event_type', 'registration_received')
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),

    // 10. Enrollments via students → registrations join
    officerName
      ? safeQ(
          sb.from('students')
            .select('id, user_full_name, email, phone, created_at, registration_id, registrations!inner(assigned_to)')
            .eq('registrations.assigned_to', officerName)
            .gte('created_at', fromStart)
            .lte('created_at', toEnd)
            .order('created_at', { ascending: false })
        )
      : Promise.resolve({ data: [], error: null }),

    // 11. Enrollment XP events (payment_received)
    safeQ(
      sb.from('officer_xp_events')
        .select('id, reference_id, xp, created_at')
        .eq('user_id', officerId)
        .eq('event_type', 'payment_received')
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),

    // 12. Demo session invites
    safeQ(
      sb.from('demo_session_invites')
        .select('id, demo_session_id, invite_status, attendance, created_at, demo_sessions(session_date, session_time, topic, program_name)')
        .eq('officer_user_id', officerId)
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),

    // 13. Demo attended XP events
    safeQ(
      sb.from('officer_xp_events')
        .select('id, reference_id, xp, created_at')
        .eq('user_id', officerId)
        .eq('event_type', 'demo_attended')
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),
  ]);

  const safe = (res: any) => (res?.error ? [] : (res?.data || []));

  const attendance            = safe(attendanceRes);
  const leadsAssigned         = safe(leadsAssignedRes);
  const leadsContactedEvents  = safe(leadsContactedEventsRes);
  const followups             = safe(followupsRes);
  const overdueFollowups      = safe(overdueFollowupsRes);
  const contactsSaved         = safe(contactsSavedRes);
  const dailyReports          = safe(dailyReportsRes);
  const registrations         = safe(registrationsRes);
  const registrationXpEvents  = safe(registrationXpRes);
  const enrollments           = safe(enrollmentsRes);
  const enrollmentXpEvents    = safe(enrollmentXpRes);
  const demoInvites           = safe(demoInvitesRes);
  const demoXpEvents          = safe(demoXpRes);

  // ------------------------------------------------------------------
  // Enrich leads contacted with lead details (batch lookup)
  // ------------------------------------------------------------------
  let leadsContacted: any[] = leadsContactedEvents;
  const contactedLeadIds = [...new Set<string>(leadsContactedEvents.map((e: any) => e.reference_id).filter(Boolean))];
  if (contactedLeadIds.length > 0) {
    const { data: leadDetails } = await safeQ(
      sb.from('crm_leads')
        .select('id, name, email, phone, status, program_name, batch_name')
        .in('id', contactedLeadIds)
    );
    const leadMap: Record<string, any> = {};
    (leadDetails || []).forEach((l: any) => { leadMap[l.id] = l; });
    leadsContacted = leadsContactedEvents.map((e: any) => ({
      ...e,
      lead: leadMap[e.reference_id] || null,
    }));
  }

  // ------------------------------------------------------------------
  // XP lookup maps for joins
  // ------------------------------------------------------------------
  const regXpMap: Record<string, number> = {};
  registrationXpEvents.forEach((e: any) => { if (e.reference_id) regXpMap[e.reference_id] = e.xp; });

  const enrollXpMap: Record<string, number> = {};
  enrollmentXpEvents.forEach((e: any) => { if (e.reference_id) enrollXpMap[e.reference_id] = e.xp; });

  const demoXpMap: Record<string, number> = {};
  demoXpEvents.forEach((e: any) => { if (e.reference_id) demoXpMap[e.reference_id] = e.xp; });

  const registrationsWithXp = registrations.map((r: any) => ({ ...r, xp: regXpMap[r.id] ?? null }));
  const enrollmentsWithXp   = enrollments.map((e: any) => ({ ...e, xp: enrollXpMap[e.registration_id] ?? null }));
  const demoInvitesWithXp   = demoInvites.map((inv: any) => ({ ...inv, xp: demoXpMap[inv.demo_session_id] ?? null }));

  // ------------------------------------------------------------------
  // Summary totals
  // ------------------------------------------------------------------
  const totalXp =
    leadsContacted.reduce((s: number, e: any) => s + (e.xp || 0), 0) +
    registrationXpEvents.reduce((s: number, e: any) => s + (e.xp || 0), 0) +
    enrollmentXpEvents.reduce((s: number, e: any) => s + (e.xp || 0), 0) +
    demoXpEvents.reduce((s: number, e: any) => s + (e.xp || 0), 0);

  return {
    officerName,
    from,
    to,
    summary: {
      attendanceDays:   attendance.length,
      leadsAssigned:    leadsAssigned.length,
      leadsContacted:   leadsContacted.length,
      followups:        followups.length,
      overdueFollowups: overdueFollowups.length,
      contactsSaved:    contactsSaved.length,
      dailyReports:     dailyReports.length,
      registrations:    registrations.length,
      enrollments:      enrollments.length,
      demoSessions:     demoInvites.length,
      totalXp,
    },
    attendance,
    leadsAssigned,
    leadsContacted,
    followups,
    overdueFollowups,
    contactsSaved,
    dailyReports,
    registrations: registrationsWithXp,
    enrollments:   enrollmentsWithXp,
    demoSessions:  demoInvitesWithXp,
  };
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url = new URL(req.url);
  const fullPath = url.pathname;
  const fnIdx = fullPath.indexOf('crm-detail-report');
  const afterFn = fnIdx !== -1
    ? fullPath.slice(fnIdx + 'crm-detail-report'.length).replace(/^\//, '')
    : fullPath.replace(/^\/+/, '');

  const method = req.method.toUpperCase();
  const sb = adminSb();

  try {
    // -------------------------------------------------------------------------
    // GET /officers  — list all staff members (admin only)
    // -------------------------------------------------------------------------
    if (afterFn === 'officers' && method === 'GET') {
      const user = await getUser(req);
      requireAdmin(user);
      const officers = await listOfficers(sb);
      return jsonResp({ success: true, officers });
    }

    // -------------------------------------------------------------------------
    // GET /report?officerId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD  (admin only)
    // -------------------------------------------------------------------------
    if (afterFn === 'report' && method === 'GET') {
      const user = await getUser(req);
      requireAdmin(user);

      const officerId = cleanStr(url.searchParams.get('officerId'));
      const from      = cleanStr(url.searchParams.get('from'));
      const to        = cleanStr(url.searchParams.get('to'));

      if (!officerId) throw mkErr('officerId is required', 400);
      if (!from || !to) throw mkErr('from and to dates are required (YYYY-MM-DD)', 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
        throw mkErr('from and to must be in YYYY-MM-DD format', 400);
      if (from > to) throw mkErr('from must not be after to', 400);

      const report = await getOfficerReport(sb, officerId, from, to);
      return jsonResp({ success: true, ...report });
    }

    // -------------------------------------------------------------------------
    // 404 — unknown route
    // -------------------------------------------------------------------------
    return jsonResp({ success: false, error: `Unknown route: ${method} /${afterFn}` }, 404);

  } catch (e: any) {
    return errResp(e);
  }
});
