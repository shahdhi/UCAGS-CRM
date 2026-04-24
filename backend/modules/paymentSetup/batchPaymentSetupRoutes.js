const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin } = require('../../../server/middleware/auth');

function clean(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function normalizeSheetLikeName(name) {
  return clean(name).replace(/\s+/g, ' ');
}

function validateName(label, value) {
  const v = normalizeSheetLikeName(value);
  if (!v) throw Object.assign(new Error(`${label} is required`), { status: 400 });
  if (!/^[a-zA-Z0-9 _-]+$/.test(v)) {
    throw Object.assign(new Error(`${label} can only contain letters, numbers, spaces, hyphen (-) and underscore (_)`), { status: 400 });
  }
  return v;
}

// GET /api/payment-setup/batches/:batchName
// Officers can read to populate dropdowns
router.get('/batches/:batchName', require('../../../server/middleware/auth').isAdminOrOfficer, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const batchName = validateName('Batch name', req.params.batchName);

    const { data: methods, error: mErr } = await sb
      .from('batch_payment_methods')
      .select('*')
      .eq('batch_name', batchName)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (mErr) throw mErr;

    const { data: plans, error: pErr } = await sb
      .from('batch_payment_plans')
      .select('*')
      .eq('batch_name', batchName)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (pErr) throw pErr;

    const planIds = (plans || []).map(p => p.id);
    let installments = [];
    if (planIds.length) {
      const { data: inst, error: iErr } = await sb
        .from('batch_payment_installments')
        .select('*')
        .in('plan_id', planIds)
        .order('installment_no', { ascending: true });
      if (iErr) throw iErr;
      installments = inst || [];
    }

    res.json({
      success: true,
      batchName,
      methods: methods || [],
      plans: plans || [],
      installments,
      earlyBird: !!(plans || []).find(p => p.early_bird),          // derive from first plan OR store separately
      reg_fee_amount: (plans || [])[0]?.reg_fee_amount ?? null,
      reg_fee_date: (plans || [])[0]?.reg_fee_date ?? null
    });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// PUT /api/payment-setup/batches/:batchName
// Body: { methods: string[], plans: [{ plan_name, installment_count, due_dates: [YYYY-MM-DD...] }] }
router.put('/batches/:batchName', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const batchName = validateName('Batch name', req.params.batchName);

    const methods = Array.isArray(req.body?.methods) ? req.body.methods : [];
    const plans = Array.isArray(req.body?.plans) ? req.body.plans : [];
    const earlyBird = !!req.body?.earlyBird;  // kept for backward compat but overridden per-plan below
    const regFeeAmount = Number.isFinite(Number(req.body?.reg_fee_amount)) ? Number(req.body.reg_fee_amount) : 0;
    const regFeeDate = req.body?.reg_fee_date ? String(req.body.reg_fee_date).trim() : null;

    // Validate methods
    const methodRows = methods
      .map(m => validateName('Payment method', m))
      .filter(Boolean)
      .map(m => ({ batch_name: batchName, method_name: m, is_active: true }));

    // Validate plans
    const planRows = plans.map(p => {
      const planName = validateName('Payment plan', p.plan_name);
      const count = Math.max(parseInt(p.installment_count || '1', 10) || 1, 1);
      const dueDates = Array.isArray(p.due_dates) ? p.due_dates : [];
      if (count > 1 && dueDates.length !== count) {
        throw Object.assign(new Error(`Plan "${planName}" must have exactly ${count} due dates`), { status: 400 });
      }
      const planType = String(p.plan_type || '').trim();
      const regFee = Number.isFinite(Number(p.registration_fee)) ? Number(p.registration_fee) : 0;
      const courseFee = Number.isFinite(Number(p.course_fee)) ? Number(p.course_fee) : 0;
      const planEarlyBird = p.earlyBird === true || p.earlyBird === 'true';
      return { planName, count, dueDates, planType, regFee, courseFee, planEarlyBird };
    });

    // Clear old setup for this batch
    await sb.from('batch_payment_methods').delete().eq('batch_name', batchName);

    // For plans/installments, delete by batch_name via plans list
    const { data: oldPlans } = await sb.from('batch_payment_plans').select('id').eq('batch_name', batchName);
    const oldPlanIds = (oldPlans || []).map(p => p.id);
    if (oldPlanIds.length) {
      await sb.from('batch_payment_installments').delete().in('plan_id', oldPlanIds);
    }
    await sb.from('batch_payment_plans').delete().eq('batch_name', batchName);

    // Insert new
    if (methodRows.length) {
      const { error } = await sb.from('batch_payment_methods').insert(methodRows);
      if (error) throw error;
    }

    let insertedPlans = [];
    if (planRows.length) {
      const { data, error } = await sb
        .from('batch_payment_plans')
        .insert(planRows.map(p => ({
          batch_name: batchName,
          plan_name: p.planName,
          installment_count: p.count,
          is_active: true,
          plan_type: p.planType || null,
          registration_fee: p.regFee || null,
          course_fee: p.courseFee || null,
          early_bird: p.planEarlyBird,
          reg_fee_amount: regFeeAmount || null,
          reg_fee_date: regFeeDate || null
        })))
        .select('*');
      if (error) throw error;
      insertedPlans = data || [];

      // Installments
      const instRows = [];
      for (const p of planRows) {
        const plan = insertedPlans.find(x => x.plan_name === p.planName);
        if (!plan) continue;
        if (p.count > 1) {
          for (let i = 1; i <= p.count; i++) {
            instRows.push({
              batch_name: batchName,
              plan_id: plan.id,
              installment_no: i,
              due_date: p.dueDates[i - 1]
            });
          }
        }
      }
      if (instRows.length) {
        const { error: iErr } = await sb.from('batch_payment_installments').insert(instRows);
        if (iErr) throw iErr;
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
