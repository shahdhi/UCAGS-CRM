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
  // Supabase query builders are thenables, not full Promises — wrap first.
  const safeQ = (q: PromiseLike<any>) =>
    Promise.resolve(q).catch(() => ({ data: [], error: null }));

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
    allXpRes,
    followupXpRes,
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
        .select('id, reference_id, xp, created_at, note')
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

    // 5. Overdue follow-ups: unresolved follow-ups scheduled between batch start and "to" date
    safeQ(
      sb.from('crm_lead_followups')
        .select('id, sheet_lead_id, channel, scheduled_at, comment, created_at')
        .eq('officer_user_id', officerId)
        .gte('scheduled_at', fromStart)
        .lte('scheduled_at', toEnd)
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

    // 10. Enrollments — fetch registrations for this officer first, then match students
    // (can't filter on joined table columns in PostgREST via .eq; done in post-processing)
    officerName
      ? safeQ(
          sb.from('students')
            .select('id, user_full_name, email, phone, created_at, registration_id')
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

    // 12. Demo session invites — officer_user_id (new) or created_by (legacy)
    safeQ(
      sb.from('demo_session_invites')
        .select('id, demo_session_id, invite_status, attendance, created_at, demo_sessions(session_date, session_time, topic, program_name)')
        .or(`officer_user_id.eq.${officerId},created_by.eq.${officerId}`)
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),

    // 13. Demo attended XP events (reference_id = demo_session_invites.id)
    safeQ(
      sb.from('officer_xp_events')
        .select('id, reference_id, xp, created_at')
        .eq('user_id', officerId)
        .eq('event_type', 'demo_attended')
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
        .order('created_at', { ascending: false })
    ),

    // 14. ALL XP events in range — used for accurate total (includes followups, penalties, etc.)
    safeQ(
      sb.from('officer_xp_events')
        .select('id, event_type, xp, created_at')
        .eq('user_id', officerId)
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
    ),

    // 15. Followup completed XP events (reference_id = crm_lead_followups.id)
    safeQ(
      sb.from('officer_xp_events')
        .select('id, reference_id, xp, created_at')
        .eq('user_id', officerId)
        .in('event_type', ['followup_completed', 'lead_responded_fast'])
        .gte('created_at', fromStart)
        .lte('created_at', toEnd)
    ),
  ]);

  const safe = (res: any) => (res?.error ? [] : (res?.data || []));

  const attendance            = safe(attendanceRes);
  const leadsAssigned         = safe(leadsAssignedRes);
  const leadsContactedEvents  = safe(leadsContactedEventsRes);
  const overdueFollowups      = safe(overdueFollowupsRes);
  const contactsSaved         = safe(contactsSavedRes);
  const dailyReports          = safe(dailyReportsRes);
  const registrations         = safe(registrationsRes);
  const registrationXpEvents  = safe(registrationXpRes);
  const enrollments           = safe(enrollmentsRes);
  const enrollmentXpEvents    = safe(enrollmentXpRes);
  const demoInvites           = safe(demoInvitesRes);
  const demoXpEvents          = safe(demoXpRes);
  const allXpEvents           = safe(allXpRes);
  const followupXpEvents      = safe(followupXpRes);

  // Build followup XP map: followup_id -> total xp (sum completed + speed bonus)
  const followupXpMap: Record<string, number> = {};
  followupXpEvents.forEach((e: any) => {
    if (e.reference_id) {
      const key = String(e.reference_id);
      followupXpMap[key] = (followupXpMap[key] || 0) + (Number(e.xp) || 0);
    }
  });
  const followupsWithXp = safe(followupsRes).map((f: any) => ({
    ...f,
    xp: followupXpMap[String(f.id)] ?? null,
  }));
  const followups = followupsWithXp;

  // ------------------------------------------------------------------
  // Enrich leads contacted with lead details
  // reference_id format: "batchName|sheetName|leadUUID" — extract last segment as UUID
  // Also build a name-keyed fallback map from ALL leads ever assigned to this officer
  // ------------------------------------------------------------------
  let leadsContacted: any[] = leadsContactedEvents;
  const extractLeadId = (refId: string | null) => {
    if (!refId) return null;
    const parts = refId.split('|');
    return parts[parts.length - 1] || null;
  };
  const contactedLeadIds = [...new Set<string>(
    leadsContactedEvents.map((e: any) => extractLeadId(e.reference_id)).filter(Boolean) as string[]
  )];

  // Fetch ALL leads ever assigned to this officer (no date filter) to maximise match rate
  const { data: allOfficerLeads } = officerName
    ? await safeQ(
        sb.from('crm_leads')
          .select('id, name, email, phone, status, program_name, batch_name')
          .eq('assigned_to', officerName)
      )
    : Promise.resolve({ data: [] });

  // Primary map: by UUID
  const leadMapById: Record<string, any> = {};
  (allOfficerLeads || []).forEach((l: any) => { leadMapById[l.id] = l; });

  // Supplemental: fetch by UUID list in case leads were reassigned
  if (contactedLeadIds.length > 0) {
    const missing = contactedLeadIds.filter((id: string) => !leadMapById[id]);
    if (missing.length > 0) {
      const { data: extraLeads } = await safeQ(
        sb.from('crm_leads')
          .select('id, name, email, phone, status, program_name, batch_name')
          .in('id', missing)
      );
      (extraLeads || []).forEach((l: any) => { leadMapById[l.id] = l; });
    }
  }

  leadsContacted = leadsContactedEvents.map((e: any) => ({
    ...e,
    lead: leadMapById[extractLeadId(e.reference_id) as string] || null,
  }));

  // ------------------------------------------------------------------
  // XP lookup maps for joins
  // ------------------------------------------------------------------
  const regXpMap: Record<string, number> = {};
  registrationXpEvents.forEach((e: any) => { if (e.reference_id) regXpMap[String(e.reference_id)] = e.xp; });

  // Supplemental: fetch registrations referenced by XP events but possibly missed by name query
  const nameMatchedRegIds = new Set<string>(registrations.map((r: any) => String(r.id)));
  const xpRefRegIds = Object.keys(regXpMap).filter((id: string) => !nameMatchedRegIds.has(id));
  let allRegistrations = [...registrations];
  if (xpRefRegIds.length > 0) {
    const { data: extraRegs } = await safeQ(
      sb.from('registrations')
        .select('id, full_name, email, phone_number, created_at, payment_status, program_name, batch_name')
        .in('id', xpRefRegIds)
    );
    allRegistrations = [...registrations, ...(extraRegs || [])];
  }

  const enrollXpMap: Record<string, number> = {};
  enrollmentXpEvents.forEach((e: any) => { if (e.reference_id) enrollXpMap[String(e.reference_id)] = e.xp; });

  // demo_attended reference_id = demo_session_invites.id (the invite row ID)
  const demoXpMap: Record<string, number> = {};
  demoXpEvents.forEach((e: any) => { if (e.reference_id) demoXpMap[String(e.reference_id)] = e.xp; });

  const registrationsWithXp = allRegistrations.map((r: any) => ({ ...r, xp: regXpMap[String(r.id)] ?? null }));

  // Filter students to only those whose registration belongs to this officer.
  const officerRegIds = new Set<string>(allRegistrations.map((r: any) => String(r.id)));
  const enrollmentsFiltered = officerName
    ? (safe(enrollmentsRes) as any[]).filter((s: any) => officerRegIds.has(String(s.registration_id)))
    : [];
  const enrollmentsWithXp = enrollmentsFiltered.map((e: any) => ({
    ...e,
    xp: enrollXpMap[String(e.registration_id)] ?? null,
  }));

  // demo XP is keyed by invite row ID
  const demoInvitesWithXp = demoInvites.map((inv: any) => ({ ...inv, xp: demoXpMap[String(inv.id)] ?? null }));

  // Sum ALL XP events in range — includes followups, penalties, reports, attendance, etc.
  const totalXp = allXpEvents.reduce((s: number, e: any) => s + (Number(e.xp) || 0), 0);

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
      registrations:    allRegistrations.length,
      enrollments:      enrollmentsFiltered.length,
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
