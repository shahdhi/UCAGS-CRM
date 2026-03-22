const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { getBatch } = require('../../core/batches/batchesStore');
const { sheetExists, createSheet, writeSheet, appendSheet, readSheet } = require('../../core/sheets/sheetsClient');
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

    let { data: currentBatch, error: batchErr } = await sb
      .from('program_batches')
      .select('batch_name')
      .eq('program_id', programId)
      .eq('is_current', true)
      .maybeSingle();
    if (batchErr) throw batchErr;

    // Fallback: if no current batch is set, use the most recently created batch.
    if (!currentBatch?.batch_name) {
      const { data: latest, error: latestErr } = await sb
        .from('program_batches')
        .select('batch_name')
        .eq('program_id', programId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestErr) throw latestErr;
      currentBatch = latest;
    }

    if (!currentBatch?.batch_name) {
      return res.status(400).json({ success: false, error: 'No batch configured for this program' });
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

    // Check if there's an existing registration for same phone + batch (before inserting new one)
    // Used later to decide XP and whether to delete the old one.
    let existingRegistrationForPhone = null;
    try {
      const { data: existingRegs } = await sb
        .from('registrations')
        .select('id, enrolled, enrolled_at, payload')
        .eq('phone_number', cleanString(canonicalPhone || payload.phone_number))
        .eq('batch_name', registrationBatchName)
        .order('created_at', { ascending: false })
        .limit(5);
      // Pick the most recent one that isn't this new submission
      existingRegistrationForPhone = (existingRegs || [])[0] || null;
    } catch (_) {}

    const data = await insertWithMissingColumnFallback(row);

    // After insert, resolve the "previous" registration (must be different from the newly inserted one)
    let previousRegistration = null;
    if (existingRegistrationForPhone && existingRegistrationForPhone.id !== data?.id) {
      previousRegistration = existingRegistrationForPhone;
    }

    // Determine if the previous registration is eligible for replacement:
    // eligible = not enrolled AND no payment received
    let previousIsReplaceable = false;
    if (previousRegistration) {
      const prevPayload = (previousRegistration.payload && typeof previousRegistration.payload === 'object')
        ? previousRegistration.payload : {};
      const isEnrolled = !!(
        previousRegistration.enrolled === true ||
        previousRegistration.is_enrolled === true ||
        previousRegistration.enrolled_at ||
        prevPayload?.enrolled === true ||
        prevPayload?.enrolled_at
      );

      if (!isEnrolled) {
        // Check if payment exists for this registration
        try {
          const { data: prevPayments } = await sb
            .from('payments')
            .select('id, amount, payment_date, slip_received, receipt_received')
            .eq('registration_id', previousRegistration.id)
            .limit(10);
          const hasPayment = (prevPayments || []).some(p => {
            const amt = Number(p.amount || 0);
            return (amt > 0 && !!(p.payment_date || p.slip_received || p.receipt_received));
          });
          previousIsReplaceable = !hasPayment;
        } catch (_) {
          previousIsReplaceable = true; // if payments table doesn't exist, assume replaceable
        }
      }
    }

    // If old registration is replaceable (not enrolled, no payment) → delete it and its payments
    if (previousRegistration && previousIsReplaceable) {
      try {
        await sb.from('payments').delete().eq('registration_id', previousRegistration.id);
        await sb.from('registrations').delete().eq('id', previousRegistration.id);
        console.log(`[Registrations] Replaced old registration ${previousRegistration.id} with new ${data?.id} for phone ${row.phone_number} in batch ${registrationBatchName}`);
      } catch (replaceErr) {
        console.warn('[Registrations] Failed to delete old registration:', replaceErr.message);
      }
    }

    // Notifications: registration received
    try {
      const { createNotification, listAdminUserIds, getNotificationSettings } = require('../notifications/notificationsService');

      const assignedToName = cleanString(data?.assigned_to || row.assigned_to);
      const sb2 = getSupabaseAdmin();

      // Notify assigned officer (if we can resolve to a user id)
      if (assignedToName && sb2) {
        const { data: { users }, error } = await sb2.auth.admin.listUsers();
        if (!error && Array.isArray(users)) {
          const target = (users || []).find(u => {
            const nm = String(u.user_metadata?.name || '').trim().toLowerCase();
            const em = String(u.email || '').trim().toLowerCase();
            const role = u.user_metadata?.role;
            if (role === 'admin') return false;
            if (role !== 'officer' && role !== 'admission_officer') return false;
            if (nm && nm === assignedToName.toLowerCase()) return true;
            // fallback: match email prefix
            const prefix = em.split('@')[0];
            return prefix && prefix === assignedToName.toLowerCase().replace(/\s+/g, '.');
          });

          if (target?.id) {
            await createNotification({
              userId: target.id,
              category: 'registrations',
              title: 'New registration received',
              message: `${data.name || 'A student'} submitted a registration for ${data.program_name || 'a program'}.`,
              type: 'info'
            });
          }
        }
      }

      // Notify admins (optional; controlled via notification settings if present)
      const adminIds = await listAdminUserIds();
      for (const adminId of adminIds) {
        const s = await getNotificationSettings(adminId);
        if (s && s.admin_registrations === false) continue;
        await createNotification({
          userId: adminId,
          category: 'admin_registrations',
          title: 'Registration received',
          message: `${data.name || 'A student'} registered for ${data.program_name || 'a program'}${data.assigned_to ? ` (Assigned to: ${data.assigned_to})` : ''}.`,
          type: 'info'
        });
      }
    } catch (e) {
      // ignore notification failures
    }

    // Best-effort: sync lead status in crm_leads
    try {
      const { updateLeadStatusByPhoneAndBatch } = require('../crmLeads/crmLeadsService');
      await updateLeadStatusByPhoneAndBatch({
        canonicalPhone: row.phone_number,
        batchName: registrationBatchName,
        nextStatus: 'Registered'
      });
    } catch (_) {}

    // XP: +40 for the assigned officer when a registration is received
    // Skip XP if this phone number already had a previous registration in the same batch
    // (i.e. it's a re-submission, not a genuinely new registration)
    try {
      const isResubmission = !!previousRegistration; // previousRegistration set if phone+batch already existed
      if (!isResubmission) {
        const { awardXPOnce } = require('../xp/xpService');
        const assignedOfficerName = cleanString(data?.assigned_to || row.assigned_to);
        if (assignedOfficerName && data?.id) {
          const sb2 = getSupabaseAdmin();
          const { data: { users } } = await sb2.auth.admin.listUsers();
          const officerUser = (users || []).find(u => {
            const nm = String(u.user_metadata?.name || '').trim().toLowerCase();
            return nm === assignedOfficerName.toLowerCase();
          });
          if (officerUser?.id) {
            await awardXPOnce({
              userId: officerUser.id,
              eventType: 'registration_received',
              xp: 40,
              referenceId: data.id,
              referenceType: 'registration',
              note: `Registration received: ${data.name || 'student'}`
            });
          }
        }
      } else {
        console.log(`[XP] Skipping registration_received XP for ${row.phone_number} in batch ${registrationBatchName} — re-submission of existing registration`);
      }
    } catch (xpErr) {
      console.warn('[XP] registration_received hook error:', xpErr.message);
    }

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
    .select('registration_id, installment_no, amount, payment_date, slip_received, receipt_received')
    .in('registration_id', ids);

  if (error) {
    // If payments table doesn't exist yet, ignore.
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return registrations || [];
    throw error;
  }

  const paidSet = new Set(
    (data || [])
      .filter(r => {
        const n = Number(r.installment_no || 1);
        if (n !== 1) return false;
        const amt = Number(r.amount || 0);
        if (!Number.isFinite(amt) || amt <= 0) return false;
        const hasReceipt = !!(r.slip_received || r.receipt_received);
        const hasDate = !!r.payment_date;
        return hasDate || hasReceipt;
      })
      .map(r => r.registration_id)
  );
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
    const programId = req.query.programId ? String(req.query.programId).trim() : '';
    const batchName = req.query.batchName ? String(req.query.batchName).trim() : '';

    // By default, show only current batches (one per program). Use ?all=1 to disable.
    const showAll = String(req.query.all || '').trim() === '1';
    const currentBatches = showAll ? [] : await getCurrentBatchNames(sb);

    let q = sb
      .from('registrations')
      .select('*')
      .eq('assigned_to', officerName);

    if (programId) q = q.eq('program_id', programId);
    if (batchName) q = q.eq('batch_name', batchName);
    else if (currentBatches.length) q = q.in('batch_name', currentBatches);

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
    const programId = req.query.programId ? String(req.query.programId).trim() : '';
    const batchName = req.query.batchName ? String(req.query.batchName).trim() : '';

    // By default, show only current batches (one per program). Use ?all=1 to disable.
    const showAll = String(req.query.all || '').trim() === '1';
    const currentBatches = showAll ? [] : await getCurrentBatchNames(sb);

    let q = sb
      .from('registrations')
      .select('*');

    if (programId) q = q.eq('program_id', programId);
    if (batchName) q = q.eq('batch_name', batchName);
    else if (currentBatches.length) q = q.in('batch_name', currentBatches);

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

    const paymentMethod = String(req.body?.payment_method || '').trim();
    const paymentPlan = String(req.body?.payment_plan || '').trim();
    const paymentDate = req.body?.payment_date ? String(req.body.payment_date).trim() : null;
    const amount = Number(req.body?.amount);
    const slipReceived = !!(req.body?.slip_received || req.body?.receipt_received);
    const receiptReceived = !!req.body?.receipt_received;

    if (!paymentPlan) return res.status(400).json({ success: false, error: 'Payment plan is required' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });

    const createdBy = String(req.user?.name || req.user?.email || '').trim() || null;

    // Snapshot registration info for payments
    const { data: regRow, error: regErr } = await sb
      .from('registrations')
      .select('name,phone_number,batch_name,program_id,program_name')
      .eq('id', id)
      .maybeSingle();
    if (regErr) throw regErr;

    const registrationName = cleanString(regRow?.name);
    const batchName = cleanString(regRow?.batch_name);
    const programId = regRow?.program_id || null;
    const programName = cleanString(regRow?.program_name);

    // Load plan config (batch-specific)
    let installmentCount = 1;
    let planId = null;
    let dueDates = [];

    if (batchName) {
      const { data: planRow } = await sb
        .from('batch_payment_plans')
        .select('id,installment_count')
        .eq('batch_name', batchName)
        .eq('plan_name', paymentPlan)
        .maybeSingle();

      if (planRow) {
        planId = planRow.id;
        installmentCount = Math.max(Number(planRow.installment_count || 1), 1);

        if (installmentCount > 1) {
          const { data: instRows } = await sb
            .from('batch_payment_installments')
            .select('installment_no,due_date')
            .eq('plan_id', planId)
            .order('installment_no', { ascending: true });
          dueDates = (instRows || []).map(r => r.due_date);
        }
      }
    }

    // IMPORTANT: Registrations page "Payment received" should only record the FIRST payment.
    // Do NOT generate all installments here (that causes duplicates each time user saves).

    // If a first-payment row already exists for this registration, update it (idempotent).
    const { data: existingRows, error: exErr } = await sb
      .from('payments')
      .select('*')
      .eq('registration_id', id)
      .order('created_at', { ascending: true })
      .limit(50);
    if (exErr) throw exErr;

    const existingFirst = (existingRows || []).find(r => Number(r.installment_no || 1) === 1) || (existingRows || [])[0] || null;

    const firstRow = {
      registration_id: id,
      registration_name: registrationName,
      batch_name: batchName,
      program_id: programId,
      program_name: programName,
      payment_plan_id: planId,
      installment_group_id: null,
      installment_no: 1,
      installment_due_date: dueDates[0] || null,
      payment_method: paymentMethod || null,
      payment_plan: paymentPlan,
      payment_date: paymentDate || null,
      amount,
      slip_received: slipReceived,
      receipt_received: receiptReceived,
      created_by: createdBy
    };

    let saved = null;
    if (existingFirst?.id) {
      const { data, error } = await sb
        .from('payments')
        .update(firstRow)
        .eq('id', existingFirst.id)
        .select('*')
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await sb
        .from('payments')
        .insert(firstRow)
        .select('*')
        .single();
      if (error) throw error;
      saved = data;
    }

    // If this is an installment plan, ensure placeholder rows (2..N) exist exactly once.
    if (planId && installmentCount > 1) {
      const existingForPlan = (existingRows || []).filter(r => String(r.payment_plan_id || '') === String(planId));
      const have = new Set(existingForPlan.map(r => Number(r.installment_no || 0)).filter(n => n > 0));

      const toInsert = [];
      for (let n = 2; n <= installmentCount; n++) {
        if (have.has(n)) continue;
        toInsert.push({
          registration_id: id,
          registration_name: registrationName,
          batch_name: batchName,
          program_id: programId,
          program_name: programName,
          payment_plan_id: planId,
          installment_group_id: null,
          installment_no: n,
          installment_due_date: dueDates[n - 1] || null,
          payment_method: null,
          payment_plan: paymentPlan,
          payment_date: null,
          amount: 0,
          slip_received: false,
          receipt_received: false,
          created_by: createdBy
        });
      }

      if (toInsert.length) {
        const { error: iErr } = await sb.from('payments').insert(toInsert);
        if (iErr) throw iErr;
      }
    }

    // Best-effort: sync lead status in crm_leads when payment is saved
    try {
      const { updateLeadStatusByPhoneAndBatch } = require('../crmLeads/crmLeadsService');
      await updateLeadStatusByPhoneAndBatch({
        canonicalPhone: regRow?.phone_number,
        batchName: batchName,
        nextStatus: 'Enrolled'
      });
    } catch (_) {}

    res.json({ success: true, payments: saved ? [saved] : [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Delete payments for a registration (admin/officer)
// DELETE /api/registrations/:id/payments
router.delete('/:id/payments', isAdminOrOfficer, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing registration id' });

    const { error } = await sb
      .from('payments')
      .delete()
      .eq('registration_id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Get payments for a registration (admin/officer)
// GET /api/registrations/:id/payments
router.get('/:id/payments', isAdminOrOfficer, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing registration id' });

    const { data, error } = await sb
      .from('payments')
      .select('*')
      .eq('registration_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, payments: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Enroll a registration (admin)
// Creates a student record + generates student_id (UCAGS0001) + marks registration enrolled
// POST /api/registrations/admin/:id/enroll
router.post('/admin/:id/enroll', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });

    const nowIso = new Date().toISOString();

    const { data: reg, error: regErr } = await sb
      .from('registrations')
      .select('*')
      .eq('id', id)
      .single();
    if (regErr) throw regErr;

    const payload = reg?.payload && typeof reg.payload === 'object' ? reg.payload : {};

    // If already enrolled, return success (idempotent)
    const alreadyEnrolled = !!(
      reg?.enrolled === true ||
      reg?.is_enrolled === true ||
      reg?.enrolled_at ||
      payload?.enrolled === true ||
      payload?.enrolled_at
    );

    // Helper: update registration with enrolled info (tries dedicated cols, falls back to payload)
    const updateRegistrationEnrolled = async ({ studentId } = {}) => {
      const tryUpdate = async (patch) => {
        const { data, error } = await sb
          .from('registrations')
          .update(patch)
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      };

      // First attempt: enrolled + enrolled_at + student_id
      try {
        return await tryUpdate({ enrolled: true, enrolled_at: nowIso, student_id: studentId || null });
      } catch (e1) {
        const msg = String(e1.message || '').toLowerCase();
        const missingCol = msg.includes('column') && msg.includes('does not exist');
        if (!missingCol) throw e1;
      }

      // Second: enrolled + enrolled_at
      try {
        return await tryUpdate({ enrolled: true, enrolled_at: nowIso });
      } catch (e2) {
        const msg = String(e2.message || '').toLowerCase();
        const missingCol = msg.includes('column') && msg.includes('does not exist');
        if (!missingCol) throw e2;
      }

      // Third: payload fallback
      const nextPayload = { ...(payload || {}) };
      nextPayload.enrolled = true;
      nextPayload.enrolled_at = nowIso;
      if (studentId) nextPayload.student_id = studentId;
      return await tryUpdate({ payload: nextPayload });
    };

    // If already enrolled, we still try to look up student by registration_id
    if (alreadyEnrolled) {
      let student = null;
      try {
        const { data } = await sb
          .from('students')
          .select('*')
          .eq('registration_id', id)
          .order('created_at', { ascending: false })
          .limit(1);
        student = (data || [])[0] || null;
      } catch (e) {
        // students table might not exist in some deployments
      }

      // Sync assigned_to to student record too (if student exists)
      try {
        const assignedTo = reg?.assigned_to || payload?.assigned_to || payload?.assignedTo || null;
        if (student?.id && assignedTo != null) {
          // Prefer dedicated students.assigned_to if available, but always keep payload.assigned_to updated.
          const nextStudentPayload = {
            ...((student.payload && typeof student.payload === 'object') ? student.payload : {}),
            assigned_to: assignedTo
          };

          try {
            const { data: s2, error: uErr } = await sb
              .from('students')
              .update({ assigned_to: assignedTo, payload: nextStudentPayload })
              .eq('id', student.id)
              .select('*')
              .single();
            if (uErr) throw uErr;
            student = s2;
          } catch (e1) {
            const msg = String(e1.message || '').toLowerCase();
            const missingCol = (
              (msg.includes('column') && msg.includes('assigned_to') && msg.includes('does not exist')) ||
              (msg.includes('schema cache') && msg.includes('assigned_to') && msg.includes('could not find'))
            );
            if (!missingCol) throw e1;

            // Fallback: update payload only
            const { data: s2, error: uErr } = await sb
              .from('students')
              .update({ payload: nextStudentPayload })
              .eq('id', student.id)
              .select('*')
              .single();
            if (uErr) throw uErr;
            student = s2;
          }
        }
      } catch (e) {
        // Don't fail enrollment on student sync problems; just log
        console.warn('Failed to sync student assigned_to:', e.message || e);
      }

      const updated = await updateRegistrationEnrolled({ studentId: student?.student_id || payload?.student_id || null });
      return res.json({ success: true, registration: updated, student });
    }

    const assignedTo = reg?.assigned_to || payload?.assigned_to || payload?.assignedTo || null;

    const studentBase = {
      registration_id: id,
      program_id: reg?.program_id || null,
      program_name: reg?.program_name || payload?.program_name || payload?.course_program || null,
      batch_name: reg?.batch_name || payload?.batch_name || null,
      name: reg?.name || payload?.name || null,
      phone_number: reg?.phone_number || payload?.phone_number || null,
      email: reg?.email || payload?.email || null,
      // Always store assigned_to inside payload for backward compatibility,
      // even if the students table doesn't have a dedicated assigned_to column.
      payload: { ...(payload || {}), assigned_to: assignedTo }
    };

    // Prefer dedicated column if it exists
    const studentInsert = assignedTo ? { ...studentBase, assigned_to: assignedTo } : studentBase;

    // Insert student; student_id is generated by DB trigger/sequence (see scripts/supabase_students.sql)
    let student = null;
    try {
      const { data, error } = await sb
        .from('students')
        .insert(studentInsert)
        .select('*')
        .single();
      if (error) throw error;
      student = data;
    } catch (e) {
      const msg = String(e.message || '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist')) {
        return res.status(501).json({ success: false, error: 'Students module not configured in database (students table missing).' });
      }

      // Backward compatibility: older deployments might not have students.assigned_to
      const missingCol = (
        (msg.includes('column') && msg.includes('assigned_to') && msg.includes('does not exist')) ||
        (msg.includes('schema cache') && msg.includes('assigned_to') && msg.includes('could not find'))
      );
      if (missingCol) {
        const { data, error } = await sb
          .from('students')
          .insert(studentBase)
          .select('*')
          .single();
        if (error) throw error;
        student = data;
      } else {
        throw e;
      }
    }

    const updated = await updateRegistrationEnrolled({ studentId: student?.student_id || null });
    res.json({ success: true, registration: updated, student });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Delete a registration (admin)
// DELETE /api/registrations/admin/:id
// Note: payments.registration_id is not enforced by a DB FK by default (see scripts/supabase_payments.sql),
// so we must manually delete related payments to avoid orphan rows.
router.delete('/admin/:id', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });

    // Ensure the registration exists first (prevents accidentally deleting payments for a wrong id)
    const { data: reg, error: regErr } = await sb
      .from('registrations')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (regErr) throw regErr;
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found' });

    // 1) Delete related payments
    const { error: payErr } = await sb
      .from('payments')
      .delete()
      .eq('registration_id', id);
    if (payErr) throw payErr;

    // 2) Delete the registration
    const { error: delErr } = await sb
      .from('registrations')
      .delete()
      .eq('id', id);

    if (delErr) throw delErr;
    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// ==========================
// Export registrations -> Google Sheet tab (push-only)
// POST /api/registrations/admin/export-sheet
// Body: { batchName }
// - Ensures "registrations" sheet exists in the batch admin spreadsheet
// - Appends only new registrations (dedupe by registrations.id)
// ==========================

const REG_SHEET_NAME = 'registrations';
// Export columns are dynamic:
//  - Always start with registration_id (Supabase registrations.id)
//  - Include all DB columns
//  - Include all payload.* keys (prefixed to avoid collisions)
const REG_HEADERS_BASE = [
  'registration_id'
];

function cleanCell(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function colToLetter(col) {
  let temp = col;
  let letter = '';
  while (temp > 0) {
    const rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

function toSafeHeaderKey(k) {
  // keep it simple: stringify + trim
  return String(k || '').trim();
}

function buildDynamicHeaders(regs) {
  const dbKeys = new Set();
  const payloadKeys = new Set();

  // Payload keys we do NOT want to export as separate columns (they are already exported via DB cols)
  const EXCLUDE_PAYLOAD_KEYS = new Set([
    'address',
    'confirm_interest',
    'country',
    'date_of_birth',
    'email',
    'gender',
    'name',
    'phone_number',
    'program_id',
    'wa_number',
    'working_status'
  ]);

  for (const r of (regs || [])) {
    if (r && typeof r === 'object') {
      Object.keys(r).forEach(k => {
        if (k === 'payload') return;
        dbKeys.add(k);
      });

      const p = (r.payload && typeof r.payload === 'object') ? r.payload : null;
      if (p) {
        Object.keys(p).forEach(k => {
          // exclude redundant payload keys
          if (EXCLUDE_PAYLOAD_KEYS.has(String(k))) return;
          payloadKeys.add(k);
        });
      }
    }
  }

  // Stable ordering: id column first, then common columns, then remaining db keys, then payload keys
  const common = ['created_at', 'batch_name', 'program_id', 'program_name', 'assigned_to', 'name', 'phone_number', 'wa_number', 'email'];

  const dbSorted = Array.from(dbKeys)
    .filter(k => k !== 'id')
    .sort((a, b) => String(a).localeCompare(String(b)));

  // ensure common columns come early (if present)
  const dbFinal = [];
  for (const k of common) {
    if (dbKeys.has(k) && k !== 'id') dbFinal.push(k);
  }
  for (const k of dbSorted) {
    if (dbFinal.includes(k)) continue;
    dbFinal.push(k);
  }

  const payloadFinal = Array.from(payloadKeys)
    .map(k => `payload.${toSafeHeaderKey(k)}`)
    .sort((a, b) => String(a).localeCompare(String(b)));

  return [
    ...REG_HEADERS_BASE,
    ...dbFinal,
    ...payloadFinal
  ];
}

async function ensureRegistrationsTab(spreadsheetId, headers) {
  const exists = await sheetExists(spreadsheetId, REG_SHEET_NAME);
  if (!exists) {
    await createSheet(spreadsheetId, REG_SHEET_NAME);
  }

  const maxCol = colToLetter(headers.length);
  await writeSheet(spreadsheetId, `${REG_SHEET_NAME}!A1:${maxCol}1`, [headers]);
}

async function readExistingRegistrationIds(spreadsheetId) {
  // Column A: registration_id, starting row 2
  const rows = await readSheet(spreadsheetId, `${REG_SHEET_NAME}!A2:A`, { force: true });
  const ids = new Set();
  for (const r of (rows || [])) {
    const id = String(r?.[0] || '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

router.post('/admin/export-sheet', isAdmin, async (req, res) => {
  try {
    const batchName = String(req.body?.batchName || '').trim();
    if (!batchName) return res.status(400).json({ success: false, error: 'batchName is required' });

    const batch = await getBatch(batchName);
    if (!batch?.admin_spreadsheet_id) {
      return res.status(404).json({ success: false, error: 'Batch spreadsheet not found' });
    }

    const spreadsheetId = batch.admin_spreadsheet_id;

    // 1) Load registrations for the batch
    const sb = getSupabaseAdmin();
    const { data: regs, error } = await sb
      .from('registrations')
      .select('*')
      .eq('batch_name', batchName)
      .order('created_at', { ascending: true })
      .limit(5000);

    if (error) throw error;

    // 2) Determine headers (expand if new fields appear)
    // Read existing headers first (if sheet exists)
    let existingHeaders = [];
    try {
      const h = await readSheet(spreadsheetId, `${REG_SHEET_NAME}!A1:ZZ1`, { force: true });
      existingHeaders = (h && h[0]) ? h[0].map(x => String(x || '').trim()).filter(Boolean) : [];
    } catch (_) {}

    const dynamicHeaders = buildDynamicHeaders(regs || []);

    // Merge headers but preserve order:
    // - keep existing headers first
    // - append any new headers in dynamicHeaders order
    const mergedHeaders = [...existingHeaders];
    const seen = new Set(existingHeaders);
    for (const h of dynamicHeaders) {
      if (!seen.has(h)) {
        mergedHeaders.push(h);
        seen.add(h);
      }
    }

    // Ensure at least base header exists
    if (!mergedHeaders.length) mergedHeaders.push(...dynamicHeaders);

    await ensureRegistrationsTab(spreadsheetId, mergedHeaders);
    const existingIds = await readExistingRegistrationIds(spreadsheetId);

    const toAppend = [];
    for (const r of (regs || [])) {
      const id = String(r.id || '').trim();
      if (!id) continue;
      if (existingIds.has(id)) continue;

      const payload = (r.payload && typeof r.payload === 'object') ? r.payload : {};

      // Build row aligned with mergedHeaders
      const rowMap = {};
      rowMap.registration_id = r.id;

      // DB columns
      for (const [k, v] of Object.entries(r || {})) {
        if (k === 'payload') continue;
        if (k === 'id') continue; // already mapped to registration_id
        rowMap[k] = v;
      }

      // payload.* columns
      for (const [k, v] of Object.entries(payload || {})) {
        rowMap[`payload.${toSafeHeaderKey(k)}`] = v;
      }

      const row = mergedHeaders.map(h => cleanCell(rowMap[h]));
      toAppend.push(row);
    }

    if (toAppend.length) {
      const maxCol = colToLetter(mergedHeaders.length);
      await appendSheet(spreadsheetId, `${REG_SHEET_NAME}!A:${maxCol}`, toAppend);
    }

    res.json({
      success: true,
      batchName,
      spreadsheetId,
      sheetName: REG_SHEET_NAME,
      appended: toAppend.length,
      total: (regs || []).length
    });
  } catch (error) {
    console.error('POST /api/registrations/admin/export-sheet error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
