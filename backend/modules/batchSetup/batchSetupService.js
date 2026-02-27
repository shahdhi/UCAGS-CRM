const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

function requireSupabase() {
  const sb = getSupabaseAdmin();
  if (!sb) throw Object.assign(new Error('Supabase admin not configured'), { status: 500 });
  return sb;
}

const clean = (v) => (v == null ? '' : String(v).trim());

async function getBatchSetup({ programId, batchId, batchName }) {
  const sb = requireSupabase();
  if (!programId || !batchId || !batchName) throw Object.assign(new Error('Missing programId/batchId/batchName'), { status: 400 });

  const { data: pb, error: pbErr } = await sb
    .from('program_batches')
    .select('id, program_id, batch_name, is_current, coordinator_user_id, demo_sessions_count')
    .eq('id', batchId)
    .maybeSingle();
  if (pbErr) throw pbErr;

  // payment plan
  const { data: plan, error: planErr } = await sb
    .from('batch_payment_plans')
    .select('*')
    .eq('batch_name', batchName)
    .maybeSingle();
  if (planErr) throw planErr;

  let installments = [];
  if (plan?.id) {
    const { data, error } = await sb
      .from('batch_payment_installments')
      .select('*')
      .eq('plan_id', plan.id)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    installments = data || [];
  }

  // demo sessions (non-archived only)
  const { data: sessions, error: sErr } = await sb
    .from('demo_sessions')
    .select('*')
    .eq('batch_name', batchName)
    .eq('archived', false)
    .order('demo_number', { ascending: true });
  if (sErr) throw sErr;

  return { programBatch: pb, paymentPlan: plan, installments, demoSessions: sessions || [] };
}

async function saveBatchSetup({ programId, batchId, batchName, general = {}, payments = {}, demo = {}, actorUserId }) {
  const sb = requireSupabase();
  if (!programId || !batchId || !batchName) throw Object.assign(new Error('Missing programId/batchId/batchName'), { status: 400 });

  // 1) General: set current + coordinator + demo count
  const isCurrent = general.is_current ?? general.isCurrent;
  const coordinatorUserId = general.coordinator_user_id ?? general.coordinatorUserId ?? null;
  const demoSessionsCount = Number(demo.demo_sessions_count ?? demo.demoSessionsCount ?? general.demo_sessions_count ?? general.demoSessionsCount ?? 4);

  if (Number.isNaN(demoSessionsCount) || demoSessionsCount < 1) {
    throw Object.assign(new Error('demoSessionsCount invalid'), { status: 400 });
  }

  // Set current: ensure only one current batch per program
  if (isCurrent === true) {
    await sb.from('program_batches').update({ is_current: false }).eq('program_id', programId);
  }

  const { data: updatedPb, error: upErr } = await sb
    .from('program_batches')
    .update({
      is_current: isCurrent === true,
      coordinator_user_id: coordinatorUserId,
      demo_sessions_count: demoSessionsCount
    })
    .eq('id', batchId)
    .select('*')
    .single();
  if (upErr) throw upErr;

  // 2) Demo sessions: ensure 1..count exist and unarchived; archive > count
  // unarchive 1..count
  for (let i = 1; i <= demoSessionsCount; i++) {
    const { error } = await sb
      .from('demo_sessions')
      .upsert({
        batch_name: batchName,
        demo_number: i,
        title: clean(demo.sessions?.[i]?.title || `Demo ${i}`) || `Demo ${i}`,
        scheduled_at: demo.sessions?.[i]?.scheduled_at || demo.sessions?.[i]?.scheduledAt || null,
        notes: demo.sessions?.[i]?.notes || null,
        archived: false,
        updated_at: new Date().toISOString(),
        created_by: actorUserId || null
      }, { onConflict: 'batch_name,demo_number' });
    if (error) throw error;
  }

  // archive extra
  await sb
    .from('demo_sessions')
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq('batch_name', batchName)
    .gt('demo_number', demoSessionsCount);

  // 3) Payments: upsert plan + replace installments
  const planPatch = {
    program_id: String(programId),
    batch_name: batchName,
    registration_fee: payments.registration_fee ?? payments.registrationFee ?? null,
    full_payment_amount: payments.full_payment_amount ?? payments.fullPaymentAmount ?? null,
    currency: clean(payments.currency || 'LKR') || 'LKR',
    updated_at: new Date().toISOString()
  };

  const { data: plan, error: pErr } = await sb
    .from('batch_payment_plans')
    .upsert(planPatch, { onConflict: 'batch_name' })
    .select('*')
    .single();
  if (pErr) throw pErr;

  const incoming = Array.isArray(payments.installments) ? payments.installments : [];

  // delete old installments
  await sb.from('batch_payment_installments').delete().eq('plan_id', plan.id);

  if (incoming.length) {
    const rows = incoming.map((it, idx) => ({
      plan_id: plan.id,
      title: clean(it.title) || `Installment ${idx + 1}`,
      amount: Number(it.amount || 0) || 0,
      due_date: it.due_date || it.dueDate || null,
      notes: it.notes || null,
      sort_order: Number(it.sort_order ?? it.sortOrder ?? idx) || idx,
      updated_at: new Date().toISOString()
    }));

    const { error } = await sb.from('batch_payment_installments').insert(rows);
    if (error) throw error;
  }

  return { programBatch: updatedPb, paymentPlan: plan };
}

module.exports = { getBatchSetup, saveBatchSetup };
