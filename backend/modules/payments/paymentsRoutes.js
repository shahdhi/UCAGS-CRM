const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin, isAdminOrOfficer } = require('../../../server/middleware/auth');
const { updateLeadStatusByPhoneAndBatch } = require('../crmLeads/crmLeadsService');

function cleanString(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function cmpDateStr(a, b) {
  // YYYY-MM-DD lexical compare
  return String(a || '').localeCompare(String(b || ''));
}

function computeStatus(today, startDate, endDate, isConfirmed) {
  if (isConfirmed) return 'completed';
  if (!startDate || !endDate) return 'due';
  if (cmpDateStr(today, startDate) < 0) return 'upcoming';
  if (cmpDateStr(today, endDate) > 0) return 'overdue';
  return 'due';
}

async function assertCoordinatorBatchAccess({ sb, userId, programId, batchName }) {
  const pid = String(programId || '').trim();
  const bname = String(batchName || '').trim();
  if (!pid || !bname) throw Object.assign(new Error('programId and batchName are required'), { status: 400 });
  if (!userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  const { data: pb, error } = await sb
    .from('program_batches')
    .select('id, program_id, batch_name, coordinator_user_id, is_active')
    .eq('program_id', pid)
    .eq('batch_name', bname)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;

  if (!pb) throw Object.assign(new Error('Batch not found'), { status: 404 });
  if (String(pb.coordinator_user_id || '') !== String(userId)) {
    throw Object.assign(new Error('Forbidden. Coordinator access required.'), { status: 403 });
  }
  return pb;
}

async function assertCoordinatorPaymentAccess({ sb, userId, paymentId }) {
  const id = String(paymentId || '').trim();
  if (!id) throw Object.assign(new Error('Missing payment id'), { status: 400 });

  const { data: payment, error } = await sb
    .from('payments')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;

  await assertCoordinatorBatchAccess({
    sb,
    userId,
    programId: payment.program_id,
    batchName: payment.batch_name
  });

  return payment;
}

// Admin payments summary (one row per registration)
// Default: current unpaid installment
// Optional: type filter can force returning a specific installment row per registration
// GET /api/payments/admin/summary?programId=...&batchName=...&status=due|overdue|upcoming|completed|all&limit=200&type=installment_1|installment_2|installment_3|installment_4|full_payment
router.get('/admin/summary', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 1000);
    const programId = req.query.programId ? String(req.query.programId).trim() : '';
    const batchName = req.query.batchName ? String(req.query.batchName).trim() : '';
    const statusFilter = String(req.query.status || 'all').toLowerCase();
    const typeFilter = String(req.query.type || '').trim();
    const today = startOfDayISO(new Date());

    let q = sb.from('payments').select('*');
    if (programId) q = q.eq('program_id', programId);
    if (batchName) q = q.eq('batch_name', batchName);

    // Pull enough rows to compute current installment per registration
    const { data: payments, error } = await q
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;

    const byReg = new Map();
    for (const p of (payments || [])) {
      if (!p.registration_id) continue;
      const arr = byReg.get(p.registration_id) || [];
      arr.push(p);
      byReg.set(p.registration_id, arr);
    }

    const regIds = Array.from(byReg.keys());
    let regCreatedMap = new Map();
    if (regIds.length) {
      const { data: regs, error: rErr } = await sb
        .from('registrations')
        .select('id,created_at')
        .in('id', regIds);
      if (rErr) throw rErr;
      regCreatedMap = new Map((regs || []).map(r => [r.id, (r.created_at || '').slice(0, 10)]));
    }

    const summary = [];
    for (const [registrationId, rows] of byReg.entries()) {
      // sort by installment_no asc, then created_at asc
      const sorted = [...rows].sort((a, b) => {
        const ia = Number(a.installment_no || 0);
        const ib = Number(b.installment_no || 0);
        if (ia !== ib) return ia - ib;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });

      // Choose which payment row to represent this registration
      // Default: current unpaid installment (or first row if none)
      // If typeFilter is set, pick that installment row even if already confirmed,
      // so filtering "1st installment" shows all leads' 1st installment.
      let current = null;

      if (typeFilter && typeFilter === 'reg_fee') {
        current = sorted.find(r => r.installment_no !== null && r.installment_no !== undefined && Number(r.installment_no) === 0) || null;
      } else if (typeFilter && typeFilter.startsWith('installment_')) {
        const nWanted = parseInt(typeFilter.split('_')[1], 10);
        if (Number.isFinite(nWanted)) {
          current = sorted.find(r => Number(r.installment_no) === nWanted) || null;
        }
      } else if (typeFilter && typeFilter === 'full_payment') {
        current = sorted.find(r => String(r.payment_plan || '').toLowerCase().includes('full payment')) || null;
      }

      if (!current) {
        current = sorted.find(r => !r.is_confirmed) || sorted[0];
      }

      if (!current) continue;

      const n = Number(current.installment_no ?? 1);
      const endDate = current.installment_due_date || current.payment_date || null;
      const startDate = (n <= 1)
        ? (regCreatedMap.get(registrationId) || null)
        : (sorted.find(r => Number(r.installment_no) === (n - 1))?.installment_due_date || null);

      const computedStatus = computeStatus(today, startDate, endDate, !!current.is_confirmed);
      if (statusFilter !== 'all' && computedStatus !== statusFilter) continue;

      summary.push({
        ...current,
        window_start_date: startDate,
        window_end_date: endDate,
        computed_status: computedStatus
      });
    }

    // Enrich with registration details (needed by Payments UI modal)
    const sumRegIds = Array.from(new Set(summary.map(r => r.registration_id).filter(Boolean)));
    let regById = new Map();
    if (sumRegIds.length) {
      const { data: regs, error: rErr } = await sb
        .from('registrations')
        .select('id,name,email,phone_number,wa_number,student_id,assigned_to,payload')
        .in('id', sumRegIds);
      if (rErr) throw rErr;

      regById = new Map((regs || []).map(r => [String(r.id), r]));
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

    // Sort: overdue first, then due, then upcoming, then completed, by end date
    const order = { overdue: 0, due: 1, upcoming: 2, completed: 3 };
    summary.sort((a, b) => {
      const oa = order[a.computed_status] ?? 99;
      const ob = order[b.computed_status] ?? 99;
      if (oa !== ob) return oa - ob;
      return String(a.window_end_date || '').localeCompare(String(b.window_end_date || ''));
    });

    res.json({ success: true, today, payments: summary.slice(0, limit) });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Coordinator payments summary (batch coordinator only)
// GET /api/payments/coordinator/summary?programId=...&batchName=...&status=due|overdue|upcoming|completed|all&limit=200&type=installment_1|installment_2|installment_3|installment_4|full_payment
router.get('/coordinator/summary', isAdminOrOfficer, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const userId = req.user?.id;
    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 1000);
    const programId = req.query.programId ? String(req.query.programId).trim() : '';
    const batchName = req.query.batchName ? String(req.query.batchName).trim() : '';
    const statusFilter = String(req.query.status || 'all').toLowerCase();
    const typeFilter = String(req.query.type || '').trim();
    const today = startOfDayISO(new Date());

    // Coordinator can only access their assigned batch
    await assertCoordinatorBatchAccess({ sb, userId, programId, batchName });

    // Reuse summary algorithm but restricted to the batch
    let q = sb.from('payments').select('*').eq('program_id', programId).eq('batch_name', batchName);

    const { data: payments, error } = await q
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;

    const byReg = new Map();
    for (const p of (payments || [])) {
      if (!p.registration_id) continue;
      const arr = byReg.get(p.registration_id) || [];
      arr.push(p);
      byReg.set(p.registration_id, arr);
    }

    const regIds = Array.from(byReg.keys());
    let regCreatedMap = new Map();
    if (regIds.length) {
      const { data: regs, error: rErr } = await sb
        .from('registrations')
        .select('id,created_at')
        .in('id', regIds);
      if (rErr) throw rErr;
      regCreatedMap = new Map((regs || []).map(r => [r.id, (r.created_at || '').slice(0, 10)]));
    }

    const summary = [];
    for (const [registrationId, rows] of byReg.entries()) {
      const sorted = [...rows].sort((a, b) => {
        const ia = Number(a.installment_no || 0);
        const ib = Number(b.installment_no || 0);
        if (ia !== ib) return ia - ib;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });

      let current = null;
      if (typeFilter && typeFilter === 'reg_fee') {
        current = sorted.find(r => r.installment_no !== null && r.installment_no !== undefined && Number(r.installment_no) === 0) || null;
      } else if (typeFilter && typeFilter.startsWith('installment_')) {
        const nWanted = parseInt(typeFilter.split('_')[1], 10);
        if (Number.isFinite(nWanted)) {
          current = sorted.find(r => Number(r.installment_no) === nWanted) || null;
        }
      } else if (typeFilter && typeFilter === 'full_payment') {
        current = sorted.find(r => String(r.payment_plan || '').toLowerCase().includes('full payment')) || null;
      }
      if (!current) current = sorted.find(r => !r.is_confirmed) || sorted[0];
      if (!current) continue;

      const n = Number(current.installment_no ?? 1);
      const endDate = current.installment_due_date || current.payment_date || null;
      const startDate = (n <= 1)
        ? (regCreatedMap.get(registrationId) || null)
        : (sorted.find(r => Number(r.installment_no) === (n - 1))?.installment_due_date || null);

      const computedStatus = computeStatus(today, startDate, endDate, !!current.is_confirmed);
      if (statusFilter !== 'all' && computedStatus !== statusFilter) continue;

      summary.push({
        ...current,
        window_start_date: startDate,
        window_end_date: endDate,
        computed_status: computedStatus
      });
    }

    const sumRegIds = Array.from(new Set(summary.map(r => r.registration_id).filter(Boolean)));
    let regById = new Map();
    if (sumRegIds.length) {
      const { data: regs, error: rErr } = await sb
        .from('registrations')
        .select('id,name,email,phone_number,wa_number,student_id,assigned_to,payload')
        .in('id', sumRegIds);
      if (rErr) throw rErr;
      regById = new Map((regs || []).map(r => [String(r.id), r]));
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

    const order = { overdue: 0, due: 1, upcoming: 2, completed: 3 };
    summary.sort((a, b) => {
      const oa = order[a.computed_status] ?? 99;
      const ob = order[b.computed_status] ?? 99;
      if (oa !== ob) return oa - ob;
      return String(a.window_end_date || '').localeCompare(String(b.window_end_date || ''));
    });

    res.json({ success: true, today, payments: summary.slice(0, limit) });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Coordinator: list all payments for a registration (must belong to coordinator batch)
// GET /api/payments/coordinator/registration/:registrationId
router.get('/coordinator/registration/:registrationId', isAdminOrOfficer, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const userId = req.user?.id;
    const registrationId = String(req.params.registrationId || '').trim();
    if (!registrationId) return res.status(400).json({ success: false, error: 'Missing registration id' });

    // Load registration to check program/batch
    const { data: reg, error: rErr } = await sb
      .from('registrations')
      .select('*')
      .eq('id', registrationId)
      .single();
    if (rErr) throw rErr;

    await assertCoordinatorBatchAccess({ sb, userId, programId: reg.program_id, batchName: reg.batch_name });

    const { data, error } = await sb
      .from('payments')
      .select('*')
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ success: true, payments: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Coordinator: update payment fields (no confirm)
// PUT /api/payments/coordinator/:id
router.put('/coordinator/:id', isAdminOrOfficer, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const userId = req.user?.id;
    const id = String(req.params.id || '').trim();

    // Ensure this payment belongs to coordinator batch
    await assertCoordinatorPaymentAccess({ sb, userId, paymentId: id });

    const patch = {};
    if ('email_sent' in req.body) patch.email_sent = !!req.body.email_sent;
    if ('whatsapp_sent' in req.body) patch.whatsapp_sent = !!req.body.whatsapp_sent;
    if ('payment_method' in req.body) patch.payment_method = cleanString(req.body.payment_method);
    if ('payment_plan' in req.body) patch.payment_plan = cleanString(req.body.payment_plan);
    if ('payment_date' in req.body) patch.payment_date = req.body.payment_date ? String(req.body.payment_date).trim() : null;
    if ('amount' in req.body) {
      const n = Number(req.body.amount);
      if (Number.isFinite(n)) patch.amount = n;
    }
    if ('slip_received' in req.body) patch.slip_received = !!req.body.slip_received;
    // Coordinators cannot set receipt_no or confirm

    const { data, error } = await sb
      .from('payments')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ success: true, payment: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin list payments
// GET /api/payments/admin?limit=200

// Admin: list all payments for a registration
// GET /api/payments/admin/registration/:registrationId
router.get('/admin/registration/:registrationId', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const registrationId = String(req.params.registrationId || '').trim();
    if (!registrationId) return res.status(400).json({ success: false, error: 'Missing registration id' });

    const { data, error } = await sb
      .from('payments')
      .select('*')
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, payments: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

router.get('/admin', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 1000);
    const programId = req.query.programId ? String(req.query.programId).trim() : '';
    const batchName = req.query.batchName ? String(req.query.batchName).trim() : '';

    let q = sb.from('payments').select('*');
    if (programId) q = q.eq('program_id', programId);
    if (batchName) q = q.eq('batch_name', batchName);

    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const rows = data || [];

    // Attach student_id from registrations (if available)
    const regIds = Array.from(new Set(rows.map(r => r.registration_id).filter(Boolean)));
    let regById = new Map();
    if (regIds.length) {
      const { data: regs, error: rErr } = await sb
        .from('registrations')
        .select('id, student_id, payload')
        .in('id', regIds);
      if (!rErr) {
        regById = new Map((regs || []).map(r => {
          const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
          const sid = r?.student_id || payload?.student_id || null;
          return [String(r.id), sid];
        }));
      }
    }

    const enriched = rows.map(p => ({
      ...p,
      student_id: regById.get(String(p.registration_id)) || null
    }));

    res.json({ success: true, payments: enriched });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin update payment fields
// PUT /api/payments/admin/:id
router.put('/admin/:id', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing payment id' });

    const patch = {};
    if ('email_sent' in req.body) patch.email_sent = !!req.body.email_sent;
    if ('whatsapp_sent' in req.body) patch.whatsapp_sent = !!req.body.whatsapp_sent;
    if ('payment_method' in req.body) patch.payment_method = cleanString(req.body.payment_method);
    if ('payment_plan' in req.body) patch.payment_plan = cleanString(req.body.payment_plan);
    if ('payment_date' in req.body) patch.payment_date = req.body.payment_date ? String(req.body.payment_date).trim() : null;
    if ('amount' in req.body) {
      const n = Number(req.body.amount);
      if (Number.isFinite(n)) patch.amount = n;
    }
    if ('slip_received' in req.body) patch.slip_received = !!req.body.slip_received;
    if ('receipt_no' in req.body) patch.receipt_no = cleanString(req.body.receipt_no);

    const { data, error } = await sb
      .from('payments')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ success: true, payment: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin confirm payment
// POST /api/payments/admin/:id/confirm
// Also auto-creates a sequential receipt_no (UC0001) using receipts table trigger.
router.post('/admin/:id/confirm', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing payment id' });

    const confirmedBy = cleanString(req.user?.name) || cleanString(req.user?.email) || null;
    const nowIso = new Date().toISOString();

    // Load payment first (need registration_id, and detect idempotency)
    const { data: existing, error: exErr } = await sb
      .from('payments')
      .select('*')
      .eq('id', id)
      .single();
    if (exErr) throw exErr;

    // Confirm payment
    const { data: confirmed, error } = await sb
      .from('payments')
      .update({
        is_confirmed: true,
        confirmed_at: nowIso,
        confirmed_by: confirmedBy
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    // If receipt already exists, return it
    if (confirmed.receipt_no) {
      return res.json({ success: true, payment: confirmed, receipt_no: confirmed.receipt_no });
    }

    // Create receipt row (receipt_no generated by DB trigger)
    let receiptNo = null;
    try {
      const { data: receipt, error: rErr } = await sb
        .from('receipts')
        .insert({
          payment_id: confirmed.id,
          registration_id: confirmed.registration_id
        })
        .select('*')
        .single();
      if (rErr) throw rErr;
      receiptNo = receipt.receipt_no;
    } catch (e) {
      const msg = String(e.message || '').toLowerCase();
      if (msg.includes('relation') && msg.includes('does not exist')) {
        // receipts table missing: still allow confirm
        return res.json({ success: true, payment: confirmed, receipt_no: null, warning: 'Receipts table missing' });
      }
      throw e;
    }

    // Store receipt_no on payment record
    const { data: withReceipt, error: uErr } = await sb
      .from('payments')
      .update({ receipt_no: receiptNo })
      .eq('id', confirmed.id)
      .select('*')
      .single();
    if (uErr) throw uErr;

    // XP: +100 for the assigned officer when payment is confirmed
    try {
      const { awardXPOnce } = require('../xp/xpService');
      const sb2 = getSupabaseAdmin();
      // Look up registration to find assigned officer + program context
      if (confirmed?.registration_id) {
        const { data: regRow } = await sb2
          .from('registrations')
          .select('assigned_to, program_id, batch_name')
          .eq('id', confirmed.registration_id)
          .maybeSingle();
        const assignedOfficerName = cleanString(regRow?.assigned_to);
        if (assignedOfficerName) {
          const { data: { users } } = await sb2.auth.admin.listUsers();
          const officerUser = (users || []).find(u => {
            const nm = String(u.user_metadata?.name || '').trim().toLowerCase();
            return nm === assignedOfficerName.toLowerCase();
          });
          if (officerUser?.id) {
            await awardXPOnce({
              userId: officerUser.id,
              eventType: 'payment_received',
              xp: 100,
              referenceId: confirmed.id,
              referenceType: 'payment',
              programId: regRow?.program_id || confirmed.program_id || null,
              batchName: regRow?.batch_name || confirmed.batch_name || null,
              note: `Payment confirmed for registration ${confirmed.registration_id}`
            });
          }
        }
      }
    } catch (xpErr) {
      console.warn('[XP] payment_received hook error:', xpErr.message);
    }

    res.json({ success: true, payment: withReceipt, receipt_no: receiptNo });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin undo confirm
// POST /api/payments/admin/:id/unconfirm
router.post('/admin/:id/unconfirm', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing payment id' });

    // Load payment first (need receipt_no)
    const { data: existing, error: exErr } = await sb
      .from('payments')
      .select('*')
      .eq('id', id)
      .single();
    if (exErr) throw exErr;

    // Undo confirm and clear receipt_no so it can't be downloaded
    const { data, error } = await sb
      .from('payments')
      .update({
        is_confirmed: false,
        confirmed_at: null,
        confirmed_by: null,
        receipt_no: null
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    // Also delete receipt row (if receipts table exists)
    try {
      const { error: rErr } = await sb
        .from('receipts')
        .delete()
        .eq('payment_id', id);
      if (rErr) throw rErr;
    } catch (e2) {
      const msg = String(e2.message || '').toLowerCase();
      if (msg.includes('relation') && msg.includes('does not exist')) {
        // ignore
      } else {
        // don't fail unconfirm because of receipts cleanup
        console.warn('Unconfirm: failed to delete receipt row:', e2.message || e2);
      }
    }

    // If this registration has no other confirmed payments, revert enrolled flag
    let registrationUpdated = false;
    try {
      if (existing?.registration_id) {
        const { data: stillConfirmed, error: cErr } = await sb
          .from('payments')
          .select('id')
          .eq('registration_id', existing.registration_id)
          .eq('is_confirmed', true)
          .limit(1);
        if (cErr) throw cErr;

        const hasAnyConfirmed = (stillConfirmed || []).length > 0;
        if (!hasAnyConfirmed) {
          // Try common dedicated columns first
          const nowIso = new Date().toISOString();
          const tryUpdate = async (patch) => {
            const { data: u, error: uErr } = await sb
              .from('registrations')
              .update(patch)
              .eq('id', existing.registration_id)
              .select('*')
              .single();
            if (uErr) throw uErr;
            registrationUpdated = true;
            return u;
          };

          // Load registration info for syncing lead status
          let regPhone = existing?.registration_phone_number || null;
          let regBatch = existing?.batch_name || null;
          try {
            const { data: regInfo, error: iErr } = await sb
              .from('registrations')
              .select('phone_number,batch_name,payload')
              .eq('id', existing.registration_id)
              .single();
            if (!iErr && regInfo) {
              const payload = regInfo?.payload && typeof regInfo.payload === 'object' ? regInfo.payload : {};
              regPhone = regInfo.phone_number || payload.phone_number || payload.phone || regPhone;
              regBatch = regInfo.batch_name || payload.batch_name || regBatch;
            }
          } catch (_) {}

          try {
            await tryUpdate({ enrolled: false, enrolled_at: null, unenrolled_at: nowIso });
          } catch (_) {
            try {
              await tryUpdate({ is_enrolled: false, enrolled_at: null, unenrolled_at: nowIso });
            } catch (e3) {
              // Fallback: patch payload
              const { data: reg, error: rErr } = await sb
                .from('registrations')
                .select('id,payload')
                .eq('id', existing.registration_id)
                .single();
              if (rErr) throw rErr;
              const payload = reg?.payload && typeof reg.payload === 'object' ? reg.payload : {};
              const nextPayload = { ...payload, enrolled: false, enrolled_at: null, unenrolled_at: nowIso };
              await tryUpdate({ payload: nextPayload });
            }
          }

          // Ensure Lead Management reflects the rollback
          try {
            await updateLeadStatusByPhoneAndBatch({
              canonicalPhone: regPhone,
              batchName: regBatch,
              nextStatus: 'Registered'
            });
          } catch (_) {}
        }
      }
    } catch (e4) {
      console.warn('Unconfirm: failed to revert registration enrolled flag:', e4.message || e4);
    }

    res.json({ success: true, payment: data, registrationUpdated });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
