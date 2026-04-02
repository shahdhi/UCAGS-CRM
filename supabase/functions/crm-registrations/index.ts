// @ts-nocheck
/**
 * CRM Registrations – Supabase Edge Function (Deno)
 *
 * Migrated from backend/modules/registrations/registrationsRoutes.js
 *
 * Routes (all pure Supabase – no Google Sheets dependency):
 *   POST   /intake                    → public registration submission
 *   GET    /my                        → officer's own registrations
 *   GET    /admin                     → admin list all registrations
 *   PUT    /admin/:id/assign          → assign registration to officer
 *   POST   /:id/payments              → add/update payment for registration
 *   DELETE /:id/payments              → delete payments for registration
 *   GET    /:id/payments              → list payments for registration
 *   POST   /admin/:id/enroll          → enroll a registration → creates student
 *   DELETE /admin/:id                 → delete registration + payments
 *
 * NOTE: POST /admin/export-sheet (Google Sheets export) is intentionally
 * NOT migrated here — it depends on Google Sheets API which is not available
 * in the Deno edge runtime. Keep that endpoint on the Express/Vercel backend.
 *
 * Auth: JWT in Authorization header. Service-role key for DB ops.
 * Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
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
// Phone normalisation (Sri Lanka – mirrors duplicatePhoneResolver.js)
// ---------------------------------------------------------------------------

function normalizePhoneToSL(raw: unknown): string {
  let p = String(raw ?? '').replace(/[\s\-().+]/g, '');
  if (!p) return '';
  if (p.startsWith('94') && p.length >= 11) p = '0' + p.slice(2);
  if (p.startsWith('00') && p.length >= 12) p = '0' + p.slice(4);
  if (!p.startsWith('0') && p.length === 9) p = '0' + p;
  return p;
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

// ---------------------------------------------------------------------------
// Role helpers (mirrors server/middleware/auth.js)
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

function userRole(user: any): string {
  return String(user?.user_metadata?.role ?? '').trim();
}

function userName(user: any): string {
  return String(user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? '').trim();
}

function isAdmin(user: any): boolean {
  if (userRole(user) === 'admin') return true;
  return ADMIN_EMAILS.includes(String(user?.email ?? '').toLowerCase());
}

function isAdminOrOfficer(user: any): boolean {
  if (isAdmin(user)) return true;
  const staffRoles = user?.user_metadata?.staff_roles;
  if (Array.isArray(staffRoles) && staffRoles.length > 0) return true;
  const r = userRole(user);
  return ['officer', 'admission_officer'].includes(r);
}

// ---------------------------------------------------------------------------
// Assignment lookup (mirrors registrationAssignmentService.js)
// In-memory cache per isolate lifetime (5 min TTL)
// ---------------------------------------------------------------------------

const TTL_MS = 5 * 60 * 1000;
const assigneeCache = new Map<string, { assignee: string; expiresAt: number }>();

async function findAssigneeByPhone(sb: any, canonicalPhone: string, batchName?: string): Promise<string> {
  if (!canonicalPhone) return '';
  const last9 = canonicalPhone.replace(/\D/g, '').slice(-9);
  if (!last9) return '';

  let q = sb
    .from('crm_leads')
    .select('phone, assigned_to, updated_at, created_at, batch_name')
    .ilike('phone', `%${last9}`);
  if (batchName) q = q.eq('batch_name', batchName);

  const { data, error } = await q
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return '';
    throw error;
  }

  for (const r of (data ?? [])) {
    const rCanon = normalizePhoneToSL(r.phone);
    if (rCanon === canonicalPhone && r.assigned_to && String(r.assigned_to).trim()) {
      return String(r.assigned_to).trim();
    }
  }
  return '';
}

async function findAssignee(sb: any, rawPhone: string, opts: { batchName?: string } = {}): Promise<string> {
  const canonical = normalizePhoneToSL(rawPhone);
  if (!canonical) return '';

  const cacheKey = `${canonical}|${opts.batchName ?? ''}`;
  const cached = assigneeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.assignee;

  try {
    const assignee = await findAssigneeByPhone(sb, canonical, opts.batchName);
    assigneeCache.set(cacheKey, { assignee, expiresAt: Date.now() + TTL_MS });
    return assignee;
  } catch (_) {
    assigneeCache.set(cacheKey, { assignee: '', expiresAt: Date.now() + TTL_MS });
    return '';
  }
}

// ---------------------------------------------------------------------------
// Notification helpers (best-effort, mirrors notificationsService.js)
// ---------------------------------------------------------------------------

async function createNotification(sb: any, { userId, category, title, message, type = 'info' }: any) {
  try {
    await sb.from('user_notifications').insert({
      user_id: userId,
      category: category ?? 'general',
      title: title ?? 'Notification',
      message: message ?? '',
      type,
      created_at: new Date().toISOString(),
    });
  } catch (_) { /* non-fatal */ }
}

async function listAdminUserIds(sb: any): Promise<string[]> {
  try {
    const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
    if (error || !users) return [];
    return (users as any[])
      .filter(u => isAdmin(u))
      .map(u => u.id)
      .filter(Boolean);
  } catch (_) { return []; }
}

async function getNotificationSettings(sb: any, userId: string): Promise<any> {
  try {
    const { data } = await sb
      .from('user_notification_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data ?? null;
  } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// CRM Lead status sync (best-effort, mirrors crmLeadsService.js)
// ---------------------------------------------------------------------------

async function updateLeadStatusByPhoneAndBatch(sb: any, canonicalPhone: string, batchName: string, nextStatus: string) {
  if (!canonicalPhone || !batchName) return;
  const last9 = canonicalPhone.replace(/\D/g, '').slice(-9);
  if (!last9) return;
  try {
    const { data, error } = await sb
      .from('crm_leads')
      .select('id, phone, status')
      .eq('batch_name', batchName)
      .ilike('phone', `%${last9}`)
      .limit(20);
    if (error || !data?.length) return;
    const ids = (data as any[])
      .filter(r => normalizePhoneToSL(r.phone) === canonicalPhone)
      .map(r => r.id);
    if (!ids.length) return;
    await sb.from('crm_leads')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .in('id', ids);
  } catch (_) { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// XP helper (best-effort, mirrors xpService.js)
// ---------------------------------------------------------------------------

async function awardXPOnce(sb: any, { userId, eventType, xp, referenceId, referenceType, note }: any) {
  if (!userId || !eventType) return;
  try {
    // Idempotent: check if already awarded for this reference
    if (referenceId) {
      const { data: existing } = await sb
        .from('xp_events')
        .select('id')
        .eq('user_id', userId)
        .eq('event_type', eventType)
        .eq('reference_id', String(referenceId))
        .maybeSingle();
      if (existing) return; // already awarded
    }
    await sb.from('xp_events').insert({
      user_id: userId,
      event_type: eventType,
      xp_awarded: xp ?? 0,
      reference_id: referenceId ? String(referenceId) : null,
      reference_type: referenceType ?? null,
      note: note ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (_) { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Shared query helpers
// ---------------------------------------------------------------------------

async function attachPaymentFlags(sb: any, registrations: any[]): Promise<any[]> {
  const ids = (registrations ?? []).map(r => r.id).filter(Boolean);
  if (!ids.length) return registrations ?? [];

  const { data, error } = await sb
    .from('payments')
    .select('registration_id, installment_no, amount, payment_date, slip_received, receipt_received')
    .in('registration_id', ids);

  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return registrations ?? [];
    throw error;
  }

  const paidSet = new Set(
    (data ?? [])
      .filter((r: any) => {
        const n = Number(r.installment_no ?? 1);
        if (n !== 1) return false;
        const amt = Number(r.amount ?? 0);
        if (!Number.isFinite(amt) || amt <= 0) return false;
        return !!(r.payment_date || r.slip_received || r.receipt_received);
      })
      .map((r: any) => r.registration_id)
  );

  return (registrations ?? []).map(r => ({ ...r, payment_received: paidSet.has(r.id) }));
}

async function getCurrentBatchNames(sb: any): Promise<string[]> {
  const { data, error } = await sb
    .from('program_batches')
    .select('batch_name')
    .eq('is_current', true);
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return [];
    throw error;
  }
  return Array.from(new Set<string>((data ?? []).map((r: any) => r.batch_name).filter(Boolean)));
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// POST /intake  – public, no auth required
async function handleIntake(sb: any, body: any): Promise<Response> {
  const canonicalPhone = normalizePhoneToSL(body?.phone_number);
  const programId = cleanStr(body?.program_id);
  if (!programId) throw mkErr('Program is required', 400);

  // Lookup program
  const { data: programRow, error: programErr } = await sb
    .from('programs').select('id,name').eq('id', programId).maybeSingle();
  if (programErr) throw programErr;
  if (!programRow) throw mkErr('Invalid program selected', 400);

  // Find current batch
  let { data: currentBatch, error: batchErr } = await sb
    .from('program_batches').select('batch_name')
    .eq('program_id', programId).eq('is_current', true).maybeSingle();
  if (batchErr) throw batchErr;

  if (!currentBatch?.batch_name) {
    const { data: latest, error: latestErr } = await sb
      .from('program_batches').select('batch_name')
      .eq('program_id', programId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (latestErr) throw latestErr;
    currentBatch = latest;
  }
  if (!currentBatch?.batch_name) throw mkErr('No batch configured for this program', 400);

  const registrationBatchName = String(currentBatch.batch_name);

  // Infer assignee from existing leads
  const inferredAssignee = await findAssignee(sb, canonicalPhone, { batchName: registrationBatchName });

  const row: Record<string, any> = {
    name: cleanStr(body?.name),
    gender: cleanStr(body?.gender),
    date_of_birth: cleanStr(body?.date_of_birth),
    address: cleanStr(body?.address),
    country: cleanStr(body?.country),
    phone_number: cleanStr(canonicalPhone || body?.phone_number),
    wa_number: cleanStr(normalizePhoneToSL(body?.wa_number || body?.phone_number) || body?.wa_number),
    email: cleanStr(body?.email),
    working_status: cleanStr(body?.working_status),
    program_id: programRow.id,
    program_name: cleanStr(programRow.name),
    batch_name: cleanStr(registrationBatchName),
    course_program: cleanStr(programRow.name),
    assigned_to: cleanStr(body?.assigned_to) ?? cleanStr(inferredAssignee),
    source: 'crm-register-page',
    payload: body,
  };

  if (!row.name || !row.phone_number) throw mkErr('Name and Phone Number are required', 400);

  // Insert with fallback for missing columns
  async function insertWithFallback(insertRow: Record<string, any>): Promise<any> {
    const first = await sb.from('registrations').insert(insertRow).select('*').single();
    if (!first.error) return first.data;
    const msg = String(first.error.message ?? '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist'))
      throw mkErr('Supabase table "registrations" not found. Create it first.', 500);
    if (msg.includes('schema cache') && msg.includes('could not find')) {
      const retryRow = { ...insertRow };
      ['course_program','working_status','assigned_to','wa_number','email','gender','date_of_birth','address','country','source']
        .forEach(c => { delete retryRow[c]; });
      const retry = await sb.from('registrations').insert(retryRow).select('*').single();
      if (!retry.error) return retry.data;
    }
    throw first.error;
  }

  // Check existing registration for same phone+batch (for dedup / XP logic)
  let existingReg: any = null;
  try {
    const { data: existingRegs } = await sb.from('registrations')
      .select('id, enrolled, enrolled_at, payload')
      .eq('phone_number', cleanStr(canonicalPhone || body?.phone_number))
      .eq('batch_name', registrationBatchName)
      .order('created_at', { ascending: false }).limit(5);
    existingReg = (existingRegs ?? [])[0] ?? null;
  } catch (_) {}

  const data = await insertWithFallback(row);

  // Resolve previous (must differ from newly inserted)
  let previousReg: any = null;
  if (existingReg && existingReg.id !== data?.id) previousReg = existingReg;

  // Determine if old reg is replaceable (not enrolled, no payment)
  let previousIsReplaceable = false;
  if (previousReg) {
    const prevPayload = previousReg.payload && typeof previousReg.payload === 'object' ? previousReg.payload : {};
    const isEnrolled = !!(previousReg.enrolled === true || previousReg.enrolled_at || prevPayload?.enrolled === true || prevPayload?.enrolled_at);
    if (!isEnrolled) {
      try {
        const { data: prevPayments } = await sb.from('payments').select('id, amount, payment_date, slip_received, receipt_received').eq('registration_id', previousReg.id).limit(10);
        const hasPayment = (prevPayments ?? []).some((p: any) => {
          const amt = Number(p.amount ?? 0);
          return amt > 0 && !!(p.payment_date || p.slip_received || p.receipt_received);
        });
        previousIsReplaceable = !hasPayment;
      } catch (_) { previousIsReplaceable = true; }
    }
  }

  // Delete old replaceable reg
  if (previousReg && previousIsReplaceable) {
    try {
      await sb.from('payments').delete().eq('registration_id', previousReg.id);
      await sb.from('registrations').delete().eq('id', previousReg.id);
    } catch (_) {}
  }

  // Notifications (best-effort)
  try {
    const assignedToName = cleanStr(data?.assigned_to ?? row.assigned_to);
    if (assignedToName) {
      const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
      if (!error && Array.isArray(users)) {
        const target = (users as any[]).find(u => {
          const role = u.user_metadata?.role;
          if (role === 'admin') return false;
          if (!['officer','admission_officer'].includes(role)) {
            const staffRoles = u.user_metadata?.staff_roles;
            if (!Array.isArray(staffRoles) || !staffRoles.length) return false;
          }
          return String(u.user_metadata?.name ?? '').trim().toLowerCase() === assignedToName.toLowerCase();
        });
        if (target?.id) {
          await createNotification(sb, {
            userId: target.id, category: 'registrations',
            title: 'New registration received',
            message: `${data.name ?? 'A student'} submitted a registration for ${data.program_name ?? 'a program'}.`,
            type: 'info',
          });
        }
      }
    }

    const adminIds = await listAdminUserIds(sb);
    for (const adminId of adminIds) {
      const s = await getNotificationSettings(sb, adminId);
      if (s && s.admin_registrations === false) continue;
      await createNotification(sb, {
        userId: adminId, category: 'admin_registrations',
        title: 'Registration received',
        message: `${data.name ?? 'A student'} registered for ${data.program_name ?? 'a program'}${data.assigned_to ? ` (Assigned to: ${data.assigned_to})` : ''}.`,
        type: 'info',
      });
    }
  } catch (_) {}

  // Sync CRM lead status → Registered
  await updateLeadStatusByPhoneAndBatch(sb, row.phone_number, registrationBatchName, 'Registered');

  // XP: +40 for officer on first registration (not re-submissions)
  const isResubmission = !!previousReg;
  if (!isResubmission) {
    try {
      const assignedOfficerName = cleanStr(data?.assigned_to ?? row.assigned_to);
      if (assignedOfficerName && data?.id) {
        const { data: { users } } = await adminSb().auth.admin.listUsers({ page: 1, perPage: 2000 });
        const officerUser = (users as any[]).find(u =>
          String(u.user_metadata?.name ?? '').trim().toLowerCase() === assignedOfficerName.toLowerCase()
        );
        if (officerUser?.id) {
          await awardXPOnce(sb, {
            userId: officerUser.id, eventType: 'registration_received',
            xp: 40, referenceId: data.id, referenceType: 'registration',
            note: `Registration received: ${data.name ?? 'student'}`,
          });
        }
      }
    } catch (_) {}
  }

  return jsonResp({ success: true, registration: data });
}

// GET /my
async function handleGetMy(sb: any, user: any, params: URLSearchParams): Promise<Response> {
  const officerName = userName(user);
  if (!officerName) throw mkErr('Missing officer name', 400);

  const limit = Math.min(parseInt(params.get('limit') ?? '100', 10) || 100, 500);
  const programId = params.get('programId') ?? '';
  const batchName = params.get('batchName') ?? '';
  const showAll = (params.get('all') ?? '') === '1';
  const currentBatches = showAll ? [] : await getCurrentBatchNames(sb);

  let q = sb.from('registrations').select('*').eq('assigned_to', officerName);
  if (programId) q = q.eq('program_id', programId);
  if (batchName) q = q.eq('batch_name', batchName);
  else if (currentBatches.length) q = q.in('batch_name', currentBatches);

  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const withPayments = await attachPaymentFlags(sb, data ?? []);
  return jsonResp({ success: true, registrations: withPayments });
}

// GET /admin
async function handleGetAdmin(sb: any, params: URLSearchParams): Promise<Response> {
  const limit = Math.min(parseInt(params.get('limit') ?? '100', 10) || 100, 500);
  const programId = params.get('programId') ?? '';
  const batchName = params.get('batchName') ?? '';
  const showAll = (params.get('all') ?? '') === '1';
  const currentBatches = showAll ? [] : await getCurrentBatchNames(sb);

  let q = sb.from('registrations').select('*');
  if (programId) q = q.eq('program_id', programId);
  if (batchName) q = q.eq('batch_name', batchName);
  else if (currentBatches.length) q = q.in('batch_name', currentBatches);

  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const withPayments = await attachPaymentFlags(sb, data ?? []);
  return jsonResp({ success: true, registrations: withPayments });
}

// PUT /admin/:id/assign
async function handleAssign(sb: any, id: string, body: any): Promise<Response> {
  if (!id) throw mkErr('Missing id', 400);
  const assignedTo = cleanStr(body?.assigned_to);
  const { data, error } = await sb.from('registrations')
    .update({ assigned_to: assignedTo ?? null })
    .eq('id', id).select('*').single();
  if (error) throw error;
  return jsonResp({ success: true, registration: data });
}

// POST /:id/payments
async function handleAddPayment(sb: any, id: string, body: any, user: any): Promise<Response> {
  if (!id) throw mkErr('Missing registration id', 400);

  const paymentMethod = cleanStr(body?.payment_method);
  const paymentPlan = cleanStr(body?.payment_plan);
  const paymentDate = cleanStr(body?.payment_date);
  const amount = Number(body?.amount);
  const slipReceived = !!(body?.slip_received || body?.receipt_received);
  const receiptReceived = !!body?.receipt_received;

  if (!paymentPlan) throw mkErr('Payment plan is required', 400);
  if (!Number.isFinite(amount) || amount <= 0) throw mkErr('Amount must be greater than 0', 400);

  const createdBy = cleanStr(user?.user_metadata?.name ?? user?.email);

  const { data: regRow, error: regErr } = await sb.from('registrations')
    .select('name,phone_number,batch_name,program_id,program_name').eq('id', id).maybeSingle();
  if (regErr) throw regErr;

  const registrationName = cleanStr(regRow?.name);
  const batchName = cleanStr(regRow?.batch_name);
  const programId = regRow?.program_id ?? null;
  const programName = cleanStr(regRow?.program_name);

  let installmentCount = 1, planId: string | null = null;
  let dueDates: string[] = [];

  if (batchName) {
    const { data: planRow } = await sb.from('batch_payment_plans')
      .select('id,installment_count').eq('batch_name', batchName).eq('plan_name', paymentPlan).maybeSingle();
    if (planRow) {
      planId = planRow.id;
      installmentCount = Math.max(Number(planRow.installment_count ?? 1), 1);
      if (installmentCount > 1) {
        const { data: instRows } = await sb.from('batch_payment_installments')
          .select('installment_no,due_date').eq('plan_id', planId).order('installment_no', { ascending: true });
        dueDates = (instRows ?? []).map((r: any) => r.due_date);
      }
    }
  }

  const { data: existingRows, error: exErr } = await sb.from('payments')
    .select('*').eq('registration_id', id).order('created_at', { ascending: true }).limit(50);
  if (exErr) throw exErr;

  const existingFirst = (existingRows ?? []).find((r: any) => Number(r.installment_no ?? 1) === 1) ?? (existingRows ?? [])[0] ?? null;

  const firstRow: Record<string, any> = {
    registration_id: id, registration_name: registrationName, batch_name: batchName,
    program_id: programId, program_name: programName, payment_plan_id: planId,
    installment_group_id: null, installment_no: 1, installment_due_date: dueDates[0] ?? null,
    payment_method: paymentMethod ?? null, payment_plan: paymentPlan,
    payment_date: paymentDate ?? null, amount, slip_received: slipReceived,
    receipt_received: receiptReceived, created_by: createdBy ?? null,
  };

  let saved: any = null;
  if (existingFirst?.id) {
    const { data, error } = await sb.from('payments').update(firstRow).eq('id', existingFirst.id).select('*').single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await sb.from('payments').insert(firstRow).select('*').single();
    if (error) throw error;
    saved = data;
  }

  // Ensure installment placeholder rows exist (2..N)
  if (planId && installmentCount > 1) {
    const existingForPlan = (existingRows ?? []).filter((r: any) => String(r.payment_plan_id ?? '') === String(planId));
    const have = new Set<number>(existingForPlan.map((r: any) => Number(r.installment_no ?? 0)).filter((n: number) => n > 0));
    const toInsert: any[] = [];
    for (let n = 2; n <= installmentCount; n++) {
      if (have.has(n)) continue;
      toInsert.push({
        registration_id: id, registration_name: registrationName, batch_name: batchName,
        program_id: programId, program_name: programName, payment_plan_id: planId,
        installment_group_id: null, installment_no: n, installment_due_date: dueDates[n - 1] ?? null,
        payment_method: null, payment_plan: paymentPlan, payment_date: null, amount: 0,
        slip_received: false, receipt_received: false, created_by: createdBy ?? null,
      });
    }
    if (toInsert.length) {
      const { error: iErr } = await sb.from('payments').insert(toInsert);
      if (iErr) throw iErr;
    }
  }

  // Sync CRM lead status → Enrolled
  await updateLeadStatusByPhoneAndBatch(sb, regRow?.phone_number, batchName ?? '', 'Enrolled');

  return jsonResp({ success: true, payments: saved ? [saved] : [] });
}

// DELETE /:id/payments
async function handleDeletePayments(sb: any, id: string): Promise<Response> {
  if (!id) throw mkErr('Missing registration id', 400);
  const { error } = await sb.from('payments').delete().eq('registration_id', id);
  if (error) throw error;
  return jsonResp({ success: true });
}

// GET /:id/payments
async function handleGetPayments(sb: any, id: string): Promise<Response> {
  if (!id) throw mkErr('Missing registration id', 400);
  const { data, error } = await sb.from('payments').select('*').eq('registration_id', id).order('created_at', { ascending: false });
  if (error) throw error;
  return jsonResp({ success: true, payments: data ?? [] });
}

// POST /admin/:id/enroll
async function handleEnroll(sb: any, id: string): Promise<Response> {
  if (!id) throw mkErr('Missing id', 400);
  const nowIso = new Date().toISOString();

  const { data: reg, error: regErr } = await sb.from('registrations').select('*').eq('id', id).single();
  if (regErr) throw regErr;

  const payload = reg?.payload && typeof reg.payload === 'object' ? reg.payload : {};
  const alreadyEnrolled = !!(reg?.enrolled === true || reg?.enrolled_at || payload?.enrolled === true || payload?.enrolled_at);

  const assignedTo = reg?.assigned_to ?? payload?.assigned_to ?? payload?.assignedTo ?? null;

  const updateEnrolled = async (studentId?: string | null) => {
    const tryUpdate = async (patch: Record<string, any>) => {
      const { data: u, error: uErr } = await sb.from('registrations').update(patch).eq('id', id).select('*').single();
      if (uErr) throw uErr;
      return u;
    };
    try { return await tryUpdate({ enrolled: true, enrolled_at: nowIso, student_id: studentId ?? null }); } catch (e1: any) {
      const m = String(e1.message ?? '').toLowerCase();
      if (!(m.includes('column') && m.includes('does not exist'))) throw e1;
    }
    try { return await tryUpdate({ enrolled: true, enrolled_at: nowIso }); } catch (e2: any) {
      const m = String(e2.message ?? '').toLowerCase();
      if (!(m.includes('column') && m.includes('does not exist'))) throw e2;
    }
    const np = { ...payload, enrolled: true, enrolled_at: nowIso };
    if (studentId) np.student_id = studentId;
    return await tryUpdate({ payload: np });
  };

  if (alreadyEnrolled) {
    let student: any = null;
    try {
      const { data } = await sb.from('students').select('*').eq('registration_id', id).order('created_at', { ascending: false }).limit(1);
      student = (data ?? [])[0] ?? null;
    } catch (_) {}
    const updated = await updateEnrolled(student?.student_id ?? payload?.student_id ?? null);
    return jsonResp({ success: true, registration: updated, student });
  }

  const studentBase: Record<string, any> = {
    registration_id: id, program_id: reg?.program_id ?? null,
    program_name: reg?.program_name ?? payload?.program_name ?? null,
    batch_name: reg?.batch_name ?? payload?.batch_name ?? null,
    name: reg?.name ?? payload?.name ?? null,
    phone_number: reg?.phone_number ?? payload?.phone_number ?? null,
    email: reg?.email ?? payload?.email ?? null,
    payload: { ...(payload ?? {}), assigned_to: assignedTo },
  };
  const studentInsert = assignedTo ? { ...studentBase, assigned_to: assignedTo } : studentBase;

  let student: any = null;
  try {
    const { data, error } = await sb.from('students').insert(studentInsert).select('*').single();
    if (error) throw error;
    student = data;
  } catch (e: any) {
    const msg = String(e.message ?? '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist'))
      throw mkErr('Students module not configured in database (students table missing).', 501);
    const missingCol = (msg.includes('column') && msg.includes('assigned_to') && msg.includes('does not exist')) ||
      (msg.includes('schema cache') && msg.includes('assigned_to') && msg.includes('could not find'));
    if (missingCol) {
      const { data, error: e2 } = await sb.from('students').insert(studentBase).select('*').single();
      if (e2) throw e2;
      student = data;
    } else throw e;
  }

  const updated = await updateEnrolled(student?.student_id ?? null);
  return jsonResp({ success: true, registration: updated, student });
}

// DELETE /admin/:id
async function handleDeleteRegistration(sb: any, id: string): Promise<Response> {
  if (!id) throw mkErr('Missing id', 400);
  const { data: reg, error: regErr } = await sb.from('registrations').select('id').eq('id', id).maybeSingle();
  if (regErr) throw regErr;
  if (!reg) throw mkErr('Registration not found', 404);
  const { error: payErr } = await sb.from('payments').delete().eq('registration_id', id);
  if (payErr) throw payErr;
  const { error: delErr } = await sb.from('registrations').delete().eq('id', id);
  if (delErr) throw delErr;
  return jsonResp({ success: true });
}

// ---------------------------------------------------------------------------
// Main request handler / router
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  // Strip function prefix to get sub-path
  // Edge URL: /functions/v1/crm-registrations/...
  const fnName = 'crm-registrations';
  const fnIdx = url.pathname.indexOf(fnName);
  const afterFn = fnIdx !== -1
    ? url.pathname.slice(fnIdx + fnName.length).replace(/^\//, '')
    : url.pathname.replace(/^\/+/, '');
  // Examples: "intake", "my", "admin", "admin/UUID/assign",
  //           "UUID/payments", "admin/UUID/enroll", "admin/UUID"

  const sb = adminSb();

  try {
    // ── POST /intake  (public – no auth) ─────────────────────────────────────
    if (method === 'POST' && afterFn === 'intake') {
      let body: any = {};
      try { body = await req.json(); } catch (_) {}
      return await handleIntake(sb, body);
    }

    // All other routes require a valid user JWT
    const user = await getUser(req);
    if (!user) return jsonResp({ success: false, error: 'Unauthorized' }, 401);

    const params = url.searchParams;

    // ── GET /my ──────────────────────────────────────────────────────────────
    if (method === 'GET' && afterFn === 'my') {
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      return await handleGetMy(sb, user, params);
    }

    // ── GET /admin ───────────────────────────────────────────────────────────
    if (method === 'GET' && afterFn === 'admin') {
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      return await handleGetAdmin(sb, params);
    }

    // ── PUT /admin/:id/assign ────────────────────────────────────────────────
    // afterFn: "admin/UUID/assign"
    const assignMatch = afterFn.match(/^admin\/([^/]+)\/assign$/);
    if (method === 'PUT' && assignMatch) {
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      let body: any = {};
      try { body = await req.json(); } catch (_) {}
      return await handleAssign(sb, assignMatch[1], body);
    }

    // ── POST /admin/:id/enroll ───────────────────────────────────────────────
    // afterFn: "admin/UUID/enroll"
    const enrollMatch = afterFn.match(/^admin\/([^/]+)\/enroll$/);
    if (method === 'POST' && enrollMatch) {
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      return await handleEnroll(sb, enrollMatch[1]);
    }

    // ── DELETE /admin/:id ────────────────────────────────────────────────────
    // afterFn: "admin/UUID"
    const adminIdMatch = afterFn.match(/^admin\/([^/]+)$/);
    if (method === 'DELETE' && adminIdMatch) {
      if (!isAdmin(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      return await handleDeleteRegistration(sb, adminIdMatch[1]);
    }

    // ── POST /:id/payments ───────────────────────────────────────────────────
    // afterFn: "UUID/payments"
    const paymentsMatch = afterFn.match(/^([^/]+)\/payments$/);
    if (method === 'POST' && paymentsMatch) {
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      let body: any = {};
      try { body = await req.json(); } catch (_) {}
      return await handleAddPayment(sb, paymentsMatch[1], body, user);
    }

    if (method === 'DELETE' && paymentsMatch) {
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      return await handleDeletePayments(sb, paymentsMatch[1]);
    }

    if (method === 'GET' && paymentsMatch) {
      if (!isAdminOrOfficer(user)) return jsonResp({ success: false, error: 'Forbidden' }, 403);
      return await handleGetPayments(sb, paymentsMatch[1]);
    }

    return jsonResp({ success: false, error: `Unknown route: ${method} /${afterFn}` }, 404);
  } catch (e: any) {
    console.error('[crm-registrations] error:', e?.message ?? e);
    return errResp(e);
  }
});
