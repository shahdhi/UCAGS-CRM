// @ts-nocheck
/**
 * payments – Supabase Edge Function (Deno)
 *
 * Phase 3: migrated from Vercel Express backend (backend/modules/payments/paymentsRoutes.js)
 *
 * Routes:
 *   GET  /payments/admin/summary                         — admin payments summary (computed status)
 *   GET  /payments/admin                                 — admin raw payments list
 *   GET  /payments/admin/registration/:id               — admin: all payments for a registration
 *   PUT  /payments/admin/:id                            — admin: update payment fields
 *   POST /payments/admin/:id/confirm                    — admin: confirm + create receipt + award XP
 *   POST /payments/admin/:id/unconfirm                  — admin: undo confirm
 *   GET  /payments/coordinator/summary                  — coordinator payments summary
 *   GET  /payments/coordinator/registration/:id         — coordinator: all payments for a registration
 *   PUT  /payments/coordinator/:id                      — coordinator: update payment fields
 *
 * Auth: Supabase JWT in Authorization header.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Response helpers
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

function mkErr(msg: string, status = 400): Error {
  const e: any = new Error(msg);
  e.status = status;
  return e;
}

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------
function cleanString(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function startOfDayISO(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function cmpDateStr(a: any, b: any): number {
  return String(a || '').localeCompare(String(b || ''));
}

function computeStatus(today: string, startDate: string | null, endDate: string | null, isConfirmed: boolean): string {
  if (isConfirmed) return 'completed';
  if (!startDate || !endDate) return 'due';
  if (cmpDateStr(today, startDate) < 0) return 'upcoming';
  if (cmpDateStr(today, endDate) > 0) return 'overdue';
  return 'due';
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

// Mirror the email-based admin fallback from server/middleware/auth.js
const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

function resolveRole(user: any): string {
  const metaRole = String(user?.user_metadata?.role || '').toLowerCase();
  if (metaRole) return metaRole;
  // Email-based admin fallback (matches Express middleware behaviour)
  const email = String(user?.email || '').toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return 'admin';
  return '';
}

async function requireAuth(sb: any, req: Request): Promise<any> {
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!jwt) throw mkErr('Unauthorized', 401);
  const { data: { user }, error } = await sb.auth.getUser(jwt);
  if (error || !user) throw mkErr('Unauthorized', 401);
  return user;
}

function requireAdmin(user: any): void {
  if (resolveRole(user) !== 'admin') throw mkErr('Forbidden. Admin only.', 403);
}

function requireAdminOrOfficer(user: any): void {
  const role = resolveRole(user);
  if (role !== 'admin' && role !== 'officer' && role !== 'admission_officer') {
    throw mkErr('Forbidden.', 403);
  }
}

// ---------------------------------------------------------------------------
// Coordinator batch access guard
// ---------------------------------------------------------------------------
async function assertCoordinatorBatchAccess(sb: any, userId: string, programId: string, batchName: string): Promise<any> {
  const pid = cleanString(programId);
  const bname = cleanString(batchName);
  if (!pid || !bname) throw mkErr('programId and batchName are required', 400);
  if (!userId) throw mkErr('Unauthorized', 401);

  const { data: pb, error } = await sb
    .from('program_batches')
    .select('id, program_id, batch_name, coordinator_user_id, is_active')
    .eq('program_id', pid)
    .eq('batch_name', bname)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!pb) throw mkErr('Batch not found', 404);
  if (String(pb.coordinator_user_id || '') !== String(userId)) {
    throw mkErr('Forbidden. Coordinator access required.', 403);
  }
  return pb;
}

async function assertCoordinatorPaymentAccess(sb: any, userId: string, paymentId: string): Promise<any> {
  const id = cleanString(paymentId);
  if (!id) throw mkErr('Missing payment id', 400);

  const { data: payment, error } = await sb
    .from('payments')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;

  await assertCoordinatorBatchAccess(sb, userId, payment.program_id, payment.batch_name);
  return payment;
}

// ---------------------------------------------------------------------------
// Summary computation (shared between /admin/summary and /coordinator/summary)
// ---------------------------------------------------------------------------
async function buildPaymentSummary(sb: any, { programId = '', batchName = '', statusFilter = 'all', typeFilter = '', limit = 200 }: any): Promise<any[]> {
  const today = startOfDayISO();

  let q = sb.from('payments').select('*');
  if (programId) q = q.eq('program_id', programId);
  if (batchName) q = q.eq('batch_name', batchName);

  const { data: payments, error } = await q
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;

  const byReg = new Map<string, any[]>();
  for (const p of (payments || [])) {
    if (!p.registration_id) continue;
    const arr = byReg.get(p.registration_id) || [];
    arr.push(p);
    byReg.set(p.registration_id, arr);
  }

  const regIds = Array.from(byReg.keys());
  let regCreatedMap = new Map<string, string>();
  if (regIds.length) {
    const { data: regs, error: rErr } = await sb
      .from('registrations')
      .select('id,created_at')
      .in('id', regIds);
    if (rErr) throw rErr;
    regCreatedMap = new Map((regs || []).map((r: any) => [r.id, String(r.created_at || '').slice(0, 10)]));
  }

  const summary: any[] = [];
  for (const [registrationId, rows] of byReg.entries()) {
    const sorted = [...rows].sort((a: any, b: any) => {
      const ia = Number(a.installment_no || 0);
      const ib = Number(b.installment_no || 0);
      if (ia !== ib) return ia - ib;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

    let current: any = null;
    if (typeFilter === 'reg_fee') {
      current = sorted.find((r: any) => r.installment_no !== null && r.installment_no !== undefined && Number(r.installment_no) === 0) || null;
    } else if (typeFilter && typeFilter.startsWith('installment_')) {
      const nWanted = parseInt(typeFilter.split('_')[1], 10);
      if (Number.isFinite(nWanted)) {
        current = sorted.find((r: any) => Number(r.installment_no) === nWanted) || null;
      }
    } else if (typeFilter === 'full_payment') {
      current = sorted.find((r: any) => String(r.payment_plan || '').toLowerCase().includes('full payment')) || null;
    }
    if (!current) current = sorted.find((r: any) => !r.is_confirmed) || sorted[0];
    if (!current) continue;

    const n = Number(current.installment_no ?? 1);
    const endDate = current.installment_due_date || current.payment_date || null;
    const startDate = n <= 1
      ? (regCreatedMap.get(registrationId) || null)
      : (sorted.find((r: any) => Number(r.installment_no) === (n - 1))?.installment_due_date || null);

    const computedStatus = computeStatus(today, startDate, endDate, !!current.is_confirmed);
    if (statusFilter !== 'all' && computedStatus !== statusFilter) continue;

    summary.push({ ...current, window_start_date: startDate, window_end_date: endDate, computed_status: computedStatus });
  }

  // Enrich with registration details
  const sumRegIds = Array.from(new Set(summary.map((r: any) => r.registration_id).filter(Boolean)));
  let regById = new Map<string, any>();
  if (sumRegIds.length) {
    const { data: regs, error: rErr } = await sb
      .from('registrations')
      .select('id,name,email,phone_number,wa_number,student_id,assigned_to,payload')
      .in('id', sumRegIds);
    if (rErr) throw rErr;
    regById = new Map((regs || []).map((r: any) => [String(r.id), r]));
  }

  for (const row of summary) {
    const reg = regById.get(String(row.registration_id || ''));
    const payload = reg?.payload && typeof reg.payload === 'object' ? reg.payload : {};
    row.registration_name = row.registration_name || reg?.name || payload?.name || null;
    row.registration_email = row.registration_email || reg?.email || payload?.email || null;
    row.registration_phone_number = row.registration_phone_number || reg?.phone_number || payload?.phone_number || null;
    row.registration_wa_number = row.registration_wa_number || reg?.wa_number || payload?.wa_number || null;
    row.student_id = row.student_id || reg?.student_id || payload?.student_id || null;
    row.assigned_to = row.assigned_to || reg?.assigned_to || payload?.assigned_to || null;
  }

  const order: Record<string, number> = { overdue: 0, due: 1, upcoming: 2, completed: 3 };
  summary.sort((a: any, b: any) => {
    const oa = order[a.computed_status] ?? 99;
    const ob = order[b.computed_status] ?? 99;
    if (oa !== ob) return oa - ob;
    return String(a.window_end_date || '').localeCompare(String(b.window_end_date || ''));
  });

  return summary.slice(0, limit);
}

// ---------------------------------------------------------------------------
// XP award (inlined from xp edge function)
// ---------------------------------------------------------------------------
async function awardXPOnce(sb: any, opts: any): Promise<void> {
  const { userId, eventType, referenceId, xp, referenceType, programId, batchName, note } = opts;
  if (!userId || !eventType || !referenceId) return;

  // Deduplication check
  const { data: existing } = await sb
    .from('officer_xp_events')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .eq('reference_id', String(referenceId))
    .limit(1)
    .maybeSingle();
  if (existing) return;

  // Insert event
  const { data: event, error: evErr } = await sb
    .from('officer_xp_events')
    .insert({
      user_id: userId,
      event_type: eventType,
      xp: Number(xp || 0),
      reference_id: String(referenceId),
      reference_type: referenceType || null,
      program_id: programId || null,
      batch_name: batchName || null,
      note: note || null,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (evErr) throw evErr;

  // Upsert summary
  const { data: existing2 } = await sb
    .from('officer_xp_summary')
    .select('total_xp')
    .eq('user_id', userId)
    .maybeSingle();
  const currentXP = Number(existing2?.total_xp || 0);
  const newXP = Math.max(0, currentXP + Number(xp || 0));
  await sb
    .from('officer_xp_summary')
    .upsert({ user_id: userId, total_xp: newXP, last_updated: new Date().toISOString() }, { onConflict: 'user_id' });
}

// ---------------------------------------------------------------------------
// Lead status sync (inlined from crmLeadsService)
// ---------------------------------------------------------------------------
async function updateLeadStatusByPhoneAndBatch(sb: any, canonicalPhone: string, batchName: string, nextStatus: string): Promise<void> {
  const phone = cleanString(canonicalPhone);
  const batch = cleanString(batchName);
  const status = cleanString(nextStatus);
  if (!phone || !batch || !status) return;

  const last9 = String(phone).replace(/\D/g, '').slice(-9);
  if (!last9) return;

  try {
    await sb
      .from('crm_leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('batch_name', batch)
      .ilike('phone', `%${last9}`);
  } catch (_) { /* best-effort, never fail the caller */ }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const url = new URL(req.url);
    // Strip function name prefix: /functions/v1/payments/admin/summary → /admin/summary
    const pathParts = url.pathname.split('/');
    const fnIdx = pathParts.indexOf('payments');
    const afterFn = fnIdx >= 0 ? pathParts.slice(fnIdx + 1).join('/') : '';
    const rawPath = '/' + afterFn;
    const method = req.method.toUpperCase();

    const user = await requireAuth(sb, req);

    // ── GET /admin/summary ──────────────────────────────────────────────────
    if (method === 'GET' && rawPath === '/admin/summary') {
      requireAdmin(user);
      const programId = url.searchParams.get('programId') || '';
      const batchName = url.searchParams.get('batchName') || '';
      const statusFilter = (url.searchParams.get('status') || 'all').toLowerCase();
      const typeFilter = url.searchParams.get('type') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1000);
      const today = startOfDayISO();

      const payments = await buildPaymentSummary(sb, { programId, batchName, statusFilter, typeFilter, limit });
      return jsonResp({ success: true, today, payments });
    }

    // ── GET /admin ──────────────────────────────────────────────────────────
    if (method === 'GET' && rawPath === '/admin') {
      requireAdmin(user);
      const programId = url.searchParams.get('programId') || '';
      const batchName = url.searchParams.get('batchName') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1000);

      let q = sb.from('payments').select('*');
      if (programId) q = q.eq('program_id', programId);
      if (batchName) q = q.eq('batch_name', batchName);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;

      const rows = data || [];
      const regIds = Array.from(new Set(rows.map((r: any) => r.registration_id).filter(Boolean)));
      let regById = new Map<string, any>();
      if (regIds.length) {
        const { data: regs, error: rErr } = await sb
          .from('registrations')
          .select('id, student_id, payload')
          .in('id', regIds);
        if (!rErr) {
          regById = new Map((regs || []).map((r: any) => {
            const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
            return [String(r.id), r?.student_id || payload?.student_id || null];
          }));
        }
      }

      const enriched = rows.map((p: any) => ({ ...p, student_id: regById.get(String(p.registration_id)) || null }));
      return jsonResp({ success: true, payments: enriched });
    }

    // ── GET /admin/registration/:id ─────────────────────────────────────────
    const adminRegMatch = rawPath.match(/^\/admin\/registration\/([^/]+)$/);
    if (method === 'GET' && adminRegMatch) {
      requireAdmin(user);
      const registrationId = decodeURIComponent(adminRegMatch[1]).trim();
      if (!registrationId) return jsonResp({ success: false, error: 'Missing registration id' }, 400);

      const { data, error } = await sb
        .from('payments')
        .select('*')
        .eq('registration_id', registrationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResp({ success: true, payments: data || [] });
    }

    // ── PUT /admin/:id ──────────────────────────────────────────────────────
    const adminIdMatch = rawPath.match(/^\/admin\/([^/]+)$/);
    if (method === 'PUT' && adminIdMatch) {
      requireAdmin(user);
      const id = decodeURIComponent(adminIdMatch[1]).trim();
      if (!id) return jsonResp({ success: false, error: 'Missing payment id' }, 400);

      const body = await req.json();
      const patch: any = {};
      if ('email_sent' in body) patch.email_sent = !!body.email_sent;
      if ('whatsapp_sent' in body) patch.whatsapp_sent = !!body.whatsapp_sent;
      if ('payment_method' in body) patch.payment_method = cleanString(body.payment_method);
      if ('payment_plan' in body) patch.payment_plan = cleanString(body.payment_plan);
      if ('payment_date' in body) patch.payment_date = body.payment_date ? String(body.payment_date).trim() : null;
      if ('amount' in body) { const n = Number(body.amount); if (Number.isFinite(n)) patch.amount = n; }
      if ('slip_received' in body) patch.slip_received = !!body.slip_received;
      if ('receipt_no' in body) patch.receipt_no = cleanString(body.receipt_no);
      if ('receipt_received' in body) patch.receipt_received = !!body.receipt_received;

      const { data, error } = await sb.from('payments').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return jsonResp({ success: true, payment: data });
    }

    // ── POST /admin/:id/confirm ─────────────────────────────────────────────
    const confirmMatch = rawPath.match(/^\/admin\/([^/]+)\/confirm$/);
    if (method === 'POST' && confirmMatch) {
      requireAdmin(user);
      const id = decodeURIComponent(confirmMatch[1]).trim();
      if (!id) return jsonResp({ success: false, error: 'Missing payment id' }, 400);

      const confirmedBy = cleanString(user.user_metadata?.name) || cleanString(user.email) || null;
      const nowIso = new Date().toISOString();

      const { data: existing, error: exErr } = await sb.from('payments').select('*').eq('id', id).single();
      if (exErr) throw exErr;

      const { data: confirmed, error: confirmErr } = await sb
        .from('payments')
        .update({ is_confirmed: true, confirmed_at: nowIso, confirmed_by: confirmedBy })
        .eq('id', id)
        .select('*')
        .single();
      if (confirmErr) throw confirmErr;

      if (confirmed.receipt_no) {
        return jsonResp({ success: true, payment: confirmed, receipt_no: confirmed.receipt_no });
      }

      // Create receipt
      let receiptNo: string | null = null;
      try {
        const { data: receipt, error: rErr } = await sb
          .from('receipts')
          .insert({ payment_id: confirmed.id, registration_id: confirmed.registration_id })
          .select('*')
          .single();
        if (rErr) throw rErr;
        receiptNo = receipt.receipt_no;
      } catch (e2: any) {
        const msg = String(e2.message || '').toLowerCase();
        if (msg.includes('relation') && msg.includes('does not exist')) {
          return jsonResp({ success: true, payment: confirmed, receipt_no: null, warning: 'Receipts table missing' });
        }
        throw e2;
      }

      // Save receipt_no on payment
      const { data: withReceipt, error: uErr } = await sb
        .from('payments')
        .update({ receipt_no: receiptNo })
        .eq('id', confirmed.id)
        .select('*')
        .single();
      if (uErr) throw uErr;

      // XP: +100 for assigned officer
      try {
        if (confirmed?.registration_id) {
          const { data: regRow } = await sb
            .from('registrations')
            .select('assigned_to, program_id, batch_name')
            .eq('id', confirmed.registration_id)
            .maybeSingle();
          const assignedOfficerName = cleanString(regRow?.assigned_to);
          if (assignedOfficerName) {
            const { data: { users } } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
            const officerUser = (users || []).find((u: any) => {
              const nm = String(u.user_metadata?.name || '').trim().toLowerCase();
              return nm === assignedOfficerName.toLowerCase();
            });
            if (officerUser?.id) {
              await awardXPOnce(sb, {
                userId: officerUser.id,
                eventType: 'payment_received',
                xp: 100,
                referenceId: confirmed.id,
                referenceType: 'payment',
                programId: regRow?.program_id || confirmed.program_id || null,
                batchName: regRow?.batch_name || confirmed.batch_name || null,
                note: `Payment confirmed for registration ${confirmed.registration_id}`,
              });
            }
          }
        }
      } catch (xpErr: any) {
        console.warn('[XP] payment_received hook error:', xpErr.message);
      }

      return jsonResp({ success: true, payment: withReceipt, receipt_no: receiptNo });
    }

    // ── POST /admin/:id/unconfirm ───────────────────────────────────────────
    const unconfirmMatch = rawPath.match(/^\/admin\/([^/]+)\/unconfirm$/);
    if (method === 'POST' && unconfirmMatch) {
      requireAdmin(user);
      const id = decodeURIComponent(unconfirmMatch[1]).trim();
      if (!id) return jsonResp({ success: false, error: 'Missing payment id' }, 400);

      const { data: existing, error: exErr } = await sb.from('payments').select('*').eq('id', id).single();
      if (exErr) throw exErr;

      const { data, error } = await sb
        .from('payments')
        .update({ is_confirmed: false, confirmed_at: null, confirmed_by: null, receipt_no: null })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;

      // Delete receipt row
      try {
        await sb.from('receipts').delete().eq('payment_id', id);
      } catch (_) { /* ignore if table missing */ }

      // Revert enrolled flag if no other confirmed payments
      let registrationUpdated = false;
      try {
        if (existing?.registration_id) {
          const { data: stillConfirmed } = await sb
            .from('payments')
            .select('id')
            .eq('registration_id', existing.registration_id)
            .eq('is_confirmed', true)
            .limit(1);

          if (!(stillConfirmed || []).length) {
            const nowIso = new Date().toISOString();

            // Load registration info for phone-based lead sync
            let regPhone: string | null = existing?.registration_phone_number || null;
            let regBatch: string | null = existing?.batch_name || null;
            try {
              const { data: regInfo } = await sb
                .from('registrations')
                .select('phone_number,batch_name,payload')
                .eq('id', existing.registration_id)
                .single();
              if (regInfo) {
                const payload = regInfo?.payload && typeof regInfo.payload === 'object' ? regInfo.payload : {};
                regPhone = regInfo.phone_number || payload.phone_number || payload.phone || regPhone;
                regBatch = regInfo.batch_name || payload.batch_name || regBatch;
              }
            } catch (_) { /* ignore */ }

            const tryUpdate = async (patch: any) => {
              const { error: uErr } = await sb.from('registrations').update(patch).eq('id', existing.registration_id);
              if (uErr) throw uErr;
              registrationUpdated = true;
            };

            try {
              await tryUpdate({ enrolled: false, enrolled_at: null, unenrolled_at: nowIso });
            } catch (_) {
              try {
                await tryUpdate({ is_enrolled: false, enrolled_at: null, unenrolled_at: nowIso });
              } catch (_) {
                // Fallback: patch payload JSON
                const { data: reg } = await sb.from('registrations').select('id,payload').eq('id', existing.registration_id).single();
                const payload = reg?.payload && typeof reg.payload === 'object' ? reg.payload : {};
                await tryUpdate({ payload: { ...payload, enrolled: false, enrolled_at: null, unenrolled_at: nowIso } });
              }
            }

            // Sync lead status back to 'Registered'
            if (regPhone && regBatch) {
              await updateLeadStatusByPhoneAndBatch(sb, regPhone, regBatch, 'Registered');
            }
          }
        }
      } catch (e4: any) {
        console.warn('Unconfirm: failed to revert registration enrolled flag:', e4.message || e4);
      }

      return jsonResp({ success: true, payment: data, registrationUpdated });
    }

    // ── GET /coordinator/summary ────────────────────────────────────────────
    if (method === 'GET' && rawPath === '/coordinator/summary') {
      requireAdminOrOfficer(user);
      const userId = user.id;
      const programId = url.searchParams.get('programId') || '';
      const batchName = url.searchParams.get('batchName') || '';
      const statusFilter = (url.searchParams.get('status') || 'all').toLowerCase();
      const typeFilter = url.searchParams.get('type') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1000);

      await assertCoordinatorBatchAccess(sb, userId, programId, batchName);

      const today = startOfDayISO();
      const payments = await buildPaymentSummary(sb, { programId, batchName, statusFilter, typeFilter, limit });
      return jsonResp({ success: true, today, payments });
    }

    // ── GET /coordinator/registration/:id ───────────────────────────────────
    const coordRegMatch = rawPath.match(/^\/coordinator\/registration\/([^/]+)$/);
    if (method === 'GET' && coordRegMatch) {
      requireAdminOrOfficer(user);
      const registrationId = decodeURIComponent(coordRegMatch[1]).trim();
      if (!registrationId) return jsonResp({ success: false, error: 'Missing registration id' }, 400);

      const { data: reg, error: rErr } = await sb
        .from('registrations').select('*').eq('id', registrationId).single();
      if (rErr) throw rErr;

      await assertCoordinatorBatchAccess(sb, user.id, reg.program_id, reg.batch_name);

      const { data, error } = await sb
        .from('payments').select('*').eq('registration_id', registrationId).order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResp({ success: true, payments: data || [] });
    }

    // ── PUT /coordinator/:id ────────────────────────────────────────────────
    const coordIdMatch = rawPath.match(/^\/coordinator\/([^/]+)$/);
    if (method === 'PUT' && coordIdMatch) {
      requireAdminOrOfficer(user);
      const id = decodeURIComponent(coordIdMatch[1]).trim();

      await assertCoordinatorPaymentAccess(sb, user.id, id);

      const body = await req.json();
      const patch: any = {};
      if ('email_sent' in body) patch.email_sent = !!body.email_sent;
      if ('whatsapp_sent' in body) patch.whatsapp_sent = !!body.whatsapp_sent;
      if ('payment_method' in body) patch.payment_method = cleanString(body.payment_method);
      if ('payment_plan' in body) patch.payment_plan = cleanString(body.payment_plan);
      if ('payment_date' in body) patch.payment_date = body.payment_date ? String(body.payment_date).trim() : null;
      if ('amount' in body) { const n = Number(body.amount); if (Number.isFinite(n)) patch.amount = n; }
      if ('slip_received' in body) patch.slip_received = !!body.slip_received;
      // Coordinators cannot set receipt_no or confirm

      const { data, error } = await sb.from('payments').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return jsonResp({ success: true, payment: data });
    }

    return jsonResp({ success: false, error: `Not found: ${method} ${rawPath}` }, 404);

  } catch (e: any) {
    return errResp(e);
  }
});
