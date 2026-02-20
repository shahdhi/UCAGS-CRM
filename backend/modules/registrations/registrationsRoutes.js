const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin, isAdminOrOfficer } = require('../../../server/middleware/auth');
const { findAssigneeByPhoneAcrossAllSheets, normalizePhoneToSL } = require('./registrationAssignmentService');

function cleanString(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// Public intake endpoint for /Register page
// POST /api/registrations/intake
router.post('/intake', async (req, res) => {
  try {
    const sb = getSupabaseAdmin();

    const payload = req.body || {};

    // Normalize phone numbers (Sri Lanka)
    const canonicalPhone = normalizePhoneToSL(payload.phone_number);

    // program_id is required (selected from Programs list)
    const programId = cleanString(payload.program_id);
    if (!programId) {
      return res.status(400).json({ success: false, error: 'Program is required' });
    }

    // Lookup program + its current batch
    const { data: programRow, error: programErr } = await sb
      .from('programs')
      .select('id,name')
      .eq('id', programId)
      .maybeSingle();
    if (programErr) throw programErr;
    if (!programRow) {
      return res.status(400).json({ success: false, error: 'Invalid program selected' });
    }

    const { data: currentBatch, error: batchErr } = await sb
      .from('program_batches')
      .select('batch_name')
      .eq('program_id', programId)
      .eq('is_current', true)
      .maybeSingle();
    if (batchErr) throw batchErr;
    if (!currentBatch?.batch_name) {
      return res.status(400).json({ success: false, error: 'No current batch configured for this program' });
    }

    const registrationBatchName = String(currentBatch.batch_name);

    // Determine assignee (search leads ONLY within current batch)
    const inferredAssignee = await findAssigneeByPhoneAcrossAllSheets(canonicalPhone, { batchName: registrationBatchName });

    // Extract common fields (we also store full payload as JSON)
    const row = {
      name: cleanString(payload.name),
      gender: cleanString(payload.gender),
      date_of_birth: cleanString(payload.date_of_birth),
      address: cleanString(payload.address),
      country: cleanString(payload.country),
      phone_number: cleanString(canonicalPhone || payload.phone_number),
      wa_number: cleanString(normalizePhoneToSL(payload.wa_number || payload.phone_number) || payload.wa_number),
      email: cleanString(payload.email),
      working_status: cleanString(payload.working_status),
      program_id: programRow.id,
      program_name: cleanString(programRow.name),
      batch_name: cleanString(registrationBatchName),
      course_program: cleanString(programRow.name),
      assigned_to: cleanString(payload.assigned_to) || cleanString(inferredAssignee),
      source: 'crm-register-page',
      payload
    };

    if (!row.name || !row.phone_number) {
      return res.status(400).json({ success: false, error: 'Name and Phone Number are required' });
    }

    async function insertWithMissingColumnFallback(insertRow) {
      const first = await sb
        .from('registrations')
        .insert(insertRow)
        .select('*')
        .single();

      if (!first.error) return first.data;

      const msg = String(first.error.message || '').toLowerCase();

      // Helpful message if table is missing
      if (msg.includes('relation') || msg.includes('does not exist')) {
        const err = new Error('Supabase table "registrations" not found. Create it first.');
        err.status = 500;
        throw err;
      }

      // If schema cache/table is missing newer columns, retry without them.
      // Example error: "Could not find the 'course_program' column of 'registrations' in the schema cache"
      if (msg.includes('schema cache') && msg.includes("could not find")) {
        const retryRow = { ...insertRow };
        // remove optional columns that may not exist yet
        ['course_program', 'working_status', 'assigned_to', 'wa_number', 'email', 'gender', 'date_of_birth', 'address', 'country', 'source']
          .forEach((c) => { delete retryRow[c]; });

        const retry = await sb
          .from('registrations')
          .insert(retryRow)
          .select('*')
          .single();

        if (!retry.error) return retry.data;
      }

      throw first.error;
    }

    const data = await insertWithMissingColumnFallback(row);
    res.json({ success: true, registration: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

async function attachPaymentFlags(sb, registrations) {
  const ids = (registrations || []).map(r => r.id).filter(Boolean);
  if (!ids.length) return registrations || [];

  const { data, error } = await sb
    .from('payments')
    .select('registration_id')
    .in('registration_id', ids);

  if (error) {
    // If payments table doesn't exist yet, ignore.
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return registrations || [];
    throw error;
  }

  const paidSet = new Set((data || []).map(r => r.registration_id));
  return (registrations || []).map(r => ({
    ...r,
    payment_received: paidSet.has(r.id)
  }));
}

async function getCurrentBatchNames(sb) {
  const { data, error } = await sb
    .from('program_batches')
    .select('batch_name')
    .eq('is_current', true);

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return [];
    throw error;
  }

  return Array.from(new Set((data || []).map(r => r.batch_name).filter(Boolean)));
}

// Officer list endpoint (assigned to the logged-in officer)
// GET /api/registrations/my?limit=100
router.get('/my', isAdminOrOfficer, async (req, res) => {
  try {
    // Officers see only their assigned registrations; admins can also use this endpoint.
    const officerName = String(req.user?.name || '').trim();
    if (!officerName) return res.status(400).json({ success: false, error: 'Missing officer name' });

    const sb = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);

    // By default, show only current batches (one per program). Use ?all=1 to disable.
    const showAll = String(req.query.all || '').trim() === '1';
    const currentBatches = showAll ? [] : await getCurrentBatchNames(sb);

    let q = sb
      .from('registrations')
      .select('*')
      .eq('assigned_to', officerName);

    if (currentBatches.length) q = q.in('batch_name', currentBatches);

    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    const withPayments = await attachPaymentFlags(sb, data || []);
    res.json({ success: true, registrations: withPayments });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin list endpoint
// GET /api/registrations/admin?limit=100
router.get('/admin', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);

    // By default, show only current batches (one per program). Use ?all=1 to disable.
    const showAll = String(req.query.all || '').trim() === '1';
    const currentBatches = showAll ? [] : await getCurrentBatchNames(sb);

    let q = sb
      .from('registrations')
      .select('*');

    if (currentBatches.length) q = q.in('batch_name', currentBatches);

    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    const withPayments = await attachPaymentFlags(sb, data || []);
    res.json({ success: true, registrations: withPayments });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Update assignment (admin)
// PUT /api/registrations/admin/:id/assign { assigned_to }
router.put('/admin/:id/assign', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    const assignedTo = String(req.body?.assigned_to || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });

    const { data, error } = await sb
      .from('registrations')
      .update({ assigned_to: assignedTo || null })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ success: true, registration: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Add payment for a registration (admin/officer)
// POST /api/registrations/:id/payments
router.post('/:id/payments', isAdminOrOfficer, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing registration id' });

    const paymentPlan = String(req.body?.payment_plan || '').trim();
    const paymentDate = req.body?.payment_date ? String(req.body.payment_date).trim() : null;
    const amount = Number(req.body?.amount);
    const receiptReceived = !!req.body?.receipt_received;

    if (!paymentPlan) return res.status(400).json({ success: false, error: 'Payment plan is required' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });

    const createdBy = String(req.user?.name || req.user?.email || '').trim() || null;

    // Snapshot registration name for easier admin payments listing
    const { data: regRow } = await sb
      .from('registrations')
      .select('name')
      .eq('id', id)
      .maybeSingle();

    const registrationName = cleanString(regRow?.name);

    // If installment plan, create 4 installment rows in a group
    const isInstallment = paymentPlan.toLowerCase().includes('installment');
    const groupId = isInstallment ? require('crypto').randomUUID() : null;

    const rows = isInstallment
      ? [1, 2, 3, 4].map((n) => ({
          registration_id: id,
          registration_name: registrationName,
          installment_group_id: groupId,
          installment_no: n,
          payment_plan: paymentPlan,
          payment_date: n === 1 ? (paymentDate || null) : null,
          amount: n === 1 ? amount : 0,
          receipt_received: n === 1 ? receiptReceived : false,
          created_by: createdBy
        }))
      : [{
          registration_id: id,
          registration_name: registrationName,
          payment_plan: paymentPlan,
          payment_date: paymentDate || null,
          amount,
          receipt_received: receiptReceived,
          created_by: createdBy
        }];

    const { data, error } = await sb
      .from('payments')
      .insert(rows)
      .select('*');

    if (error) throw error;
    res.json({ success: true, payments: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Delete a registration (admin)
// DELETE /api/registrations/admin/:id
router.delete('/admin/:id', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });

    const { error } = await sb
      .from('registrations')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
