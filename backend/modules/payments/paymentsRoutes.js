const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin } = require('../../../server/middleware/auth');

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

      if (typeFilter && typeFilter.startsWith('installment_')) {
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

      const n = Number(current.installment_no || 1);
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

    res.json({ success: true, payment: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
