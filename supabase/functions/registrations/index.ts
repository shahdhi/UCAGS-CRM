/**
 * registrations Edge Function
 * Maps to: /api/registrations/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin, isAdminOrOfficer } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

function cleanStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function normalizePhone(phone: string): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.startsWith('94')) return d;
  if (d.length === 10 && d.startsWith('0')) return `94${d.slice(1)}`;
  if (d.length === 9) return `94${d}`;
  if (d.length > 11) return `94${d.slice(-9)}`;
  return d;
}

async function getCurrentBatchNames(sb: any): Promise<string[]> {
  const { data, error } = await sb.from('program_batches').select('batch_name').eq('is_current', true);
  if (error) return [];
  return [...new Set((data ?? []).map((r: any) => r.batch_name).filter(Boolean))] as string[];
}

// POST /intake  — public registration submission
router.post('/intake', async (req) => {
  const sb = getSupabaseAdmin();
  const payload = await req.json();

  const programId = cleanStr(payload.program_id);
  if (!programId) return errorResponse('Program is required', 400);

  const { data: programRow, error: pErr } = await sb.from('programs').select('id,name').eq('id', programId).maybeSingle();
  if (pErr) throw pErr;
  if (!programRow) return errorResponse('Invalid program selected', 400);

  // Find current batch for program
  let { data: currentBatch } = await sb.from('program_batches').select('batch_name').eq('program_id', programId).eq('is_current', true).maybeSingle();
  if (!currentBatch?.batch_name) {
    const { data: latest } = await sb.from('program_batches').select('batch_name').eq('program_id', programId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    currentBatch = latest;
  }
  if (!currentBatch?.batch_name) return errorResponse('No batch configured for this program', 400);

  const batchName = String(currentBatch.batch_name);
  const canonicalPhone = normalizePhone(String(payload.phone_number ?? ''));

  // Find assignee by phone in crm_leads
  let inferredAssignee: string | null = null;
  if (canonicalPhone) {
    const last9 = canonicalPhone.slice(-9);
    const { data: leads } = await sb.from('crm_leads').select('assigned_to').eq('batch_name', batchName)
      .ilike('phone', `%${last9}`).not('assigned_to', 'is', null).limit(5);
    inferredAssignee = (leads ?? [])[0]?.assigned_to ?? null;
  }

  const row = {
    name: cleanStr(payload.name),
    gender: cleanStr(payload.gender),
    date_of_birth: cleanStr(payload.date_of_birth),
    address: cleanStr(payload.address),
    country: cleanStr(payload.country),
    phone_number: cleanStr(canonicalPhone || payload.phone_number),
    wa_number: cleanStr(normalizePhone(String(payload.wa_number || payload.phone_number || ''))),
    email: cleanStr(payload.email),
    working_status: cleanStr(payload.working_status),
    program_id: programRow.id,
    program_name: cleanStr(programRow.name),
    batch_name: batchName,
    course_program: cleanStr(programRow.name),
    assigned_to: cleanStr(payload.assigned_to) ?? inferredAssignee,
    source: 'crm-register-page',
    payload,
  };

  if (!row.name || !row.phone_number) return errorResponse('Name and Phone Number are required', 400);

  const { data, error } = await sb.from('registrations').insert(row).select('*').single();
  if (error) throw error;
  return successResponse({ registration: data });
});

// GET /my  — officer's own registrations
router.get('/my', async (req) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);
  const programId = url.searchParams.get('programId') ?? '';
  const batchName = url.searchParams.get('batchName') ?? '';
  const showAll = url.searchParams.get('all') === '1';

  const currentBatches = showAll ? [] : await getCurrentBatchNames(sb);
  let q = sb.from('registrations').select('*').eq('assigned_to', user.name);
  if (programId) q = q.eq('program_id', programId);
  if (batchName) q = q.eq('batch_name', batchName);
  else if (currentBatches.length) q = q.in('batch_name', currentBatches);

  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return successResponse({ registrations: data ?? [] });
});

// GET /admin  — all registrations (admin)
router.get('/admin', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);
  const programId = url.searchParams.get('programId') ?? '';
  const batchName = url.searchParams.get('batchName') ?? '';
  const showAll = url.searchParams.get('all') === '1';

  const currentBatches = showAll ? [] : await getCurrentBatchNames(sb);
  let q = sb.from('registrations').select('*');
  if (programId) q = q.eq('program_id', programId);
  if (batchName) q = q.eq('batch_name', batchName);
  else if (currentBatches.length) q = q.in('batch_name', currentBatches);

  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return successResponse({ registrations: data ?? [] });
});

// PUT /admin/:id/assign
router.put('/admin/:id/assign', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('registrations')
    .update({ assigned_to: cleanStr(body.assigned_to) })
    .eq('id', params.id).select('*').single();
  if (error) throw error;
  return successResponse({ registration: data });
});

// POST /admin/:id/enroll  — enroll a registration as a student
router.post('/admin/:id/enroll', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: reg, error: rErr } = await sb.from('registrations').select('*').eq('id', params.id).single();
  if (rErr) throw rErr;

  // Check if already enrolled
  const payload = reg?.payload && typeof reg.payload === 'object' ? reg.payload : {};
  if (reg?.enrolled || reg?.enrolled_at || payload?.enrolled) {
    const { data: student } = await sb.from('students').select('*').eq('registration_id', params.id).maybeSingle();
    const { data: updated } = await sb.from('registrations').update({ enrolled: true, enrolled_at: now }).eq('id', params.id).select('*').single();
    return successResponse({ registration: updated, student: student ?? null });
  }

  // Create student record
  const assignedTo = reg?.assigned_to ?? payload?.assigned_to ?? null;
  const studentData = {
    registration_id: params.id,
    program_id: reg?.program_id ?? null,
    program_name: reg?.program_name ?? payload?.program_name ?? null,
    batch_name: reg?.batch_name ?? null,
    name: reg?.name ?? null,
    phone_number: reg?.phone_number ?? null,
    email: reg?.email ?? null,
    assigned_to: assignedTo,
    payload: { ...payload, assigned_to: assignedTo },
  };

  const { data: student, error: sErr } = await sb.from('students').insert(studentData).select('*').single();
  if (sErr) throw sErr;

  const { data: updated, error: uErr } = await sb.from('registrations')
    .update({ enrolled: true, enrolled_at: now, student_id: student?.student_id ?? null })
    .eq('id', params.id).select('*').single();
  if (uErr) throw uErr;

  return successResponse({ registration: updated, student });
});

// GET /:id/payments
router.get('/:id/payments', async (req, params) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('payments').select('*').eq('registration_id', params.id).order('created_at', { ascending: false });
  if (error) throw error;
  return successResponse({ payments: data ?? [] });
});

// POST /:id/payments
router.post('/:id/payments', async (req, params) => {
  const user = await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();

  const { payment_method, payment_plan, payment_date, amount, slip_received, receipt_received } = body;
  if (!payment_plan) return errorResponse('payment_plan is required', 400);
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return errorResponse('Amount must be > 0', 400);

  const { data: reg } = await sb.from('registrations').select('name,phone_number,batch_name,program_id,program_name').eq('id', params.id).maybeSingle();

  const firstRow = {
    registration_id: params.id,
    registration_name: cleanStr(reg?.name),
    batch_name: cleanStr(reg?.batch_name),
    program_id: reg?.program_id ?? null,
    program_name: cleanStr(reg?.program_name),
    installment_no: 1,
    payment_method: cleanStr(payment_method),
    payment_plan,
    payment_date: cleanStr(payment_date),
    amount: Number(amount),
    slip_received: !!(slip_received || receipt_received),
    receipt_received: !!receipt_received,
    created_by: user.name || null,
  };

  // Check for existing first payment
  const { data: existing } = await sb.from('payments').select('id').eq('registration_id', params.id).eq('installment_no', 1).maybeSingle();

  let saved: any;
  if (existing?.id) {
    const { data, error } = await sb.from('payments').update(firstRow).eq('id', existing.id).select('*').single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await sb.from('payments').insert(firstRow).select('*').single();
    if (error) throw error;
    saved = data;
  }

  return successResponse({ payments: [saved] });
});

// DELETE /:id/payments
router.delete('/:id/payments', async (req, params) => {
  await isAdminOrOfficer(req);
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('payments').delete().eq('registration_id', params.id);
  if (error) throw error;
  return successResponse({ deleted: true });
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const res = await router.handle(req);
    if (res) return res;
    return errorResponse('Not found', 404);
  } catch (e: any) {
    return errorResponse(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
