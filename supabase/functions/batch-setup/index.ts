/**
 * batch-setup Edge Function
 * Maps to: /api/batch-setup/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /  — get batch setup config
router.get('/', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const programId = url.searchParams.get('programId');
  const batchId = url.searchParams.get('batchId');
  const batchName = url.searchParams.get('batchName');

  let batchRow: any = null;
  if (batchId) {
    const { data } = await sb.from('program_batches').select('*').eq('id', batchId).maybeSingle();
    batchRow = data;
  } else if (batchName) {
    const { data } = await sb.from('program_batches').select('*').eq('batch_name', batchName).maybeSingle();
    batchRow = data;
  } else if (programId) {
    const { data } = await sb.from('program_batches').select('*').eq('program_id', programId).eq('is_current', true).maybeSingle();
    batchRow = data;
  }

  let payments: any[] = [];
  let demo: any = null;

  if (batchRow?.id) {
    const [plansRes, demoRes] = await Promise.all([
      sb.from('batch_payment_plans').select('*, batch_payment_installments(*)').eq('batch_name', batchRow.batch_name),
      sb.from('batch_demo_config').select('*').eq('batch_name', batchRow.batch_name).maybeSingle(),
    ]);
    payments = plansRes.data ?? [];
    demo = demoRes.data ?? null;
  }

  return successResponse({ batch: batchRow ?? null, payments, demo });
});

// PUT /  — save batch setup config
router.put('/', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { programId, batchId, batchName, general, payments, demo } = body;

  // Resolve batch
  let resolvedBatchName = batchName;
  if (batchId && !resolvedBatchName) {
    const { data: b } = await sb.from('program_batches').select('batch_name').eq('id', batchId).maybeSingle();
    resolvedBatchName = b?.batch_name;
  }

  // Update general batch settings
  if (general && resolvedBatchName) {
    await sb.from('program_batches').update({
      ...general,
      updated_at: new Date().toISOString(),
    }).eq('batch_name', resolvedBatchName);
  }

  // Upsert payment plans
  if (Array.isArray(payments) && resolvedBatchName) {
    for (const plan of payments) {
      const { id, installments, ...planData } = plan;
      let planId = id;
      if (planId) {
        await sb.from('batch_payment_plans').update({ ...planData, updated_at: new Date().toISOString() }).eq('id', planId);
      } else {
        const { data: newPlan } = await sb.from('batch_payment_plans').insert({
          ...planData, batch_name: resolvedBatchName, created_at: new Date().toISOString(),
        }).select('id').single();
        planId = newPlan?.id;
      }
      // Upsert installments
      if (planId && Array.isArray(installments)) {
        for (const inst of installments) {
          const { id: instId, ...instData } = inst;
          if (instId) {
            await sb.from('batch_payment_installments').update({ ...instData, updated_at: new Date().toISOString() }).eq('id', instId);
          } else {
            await sb.from('batch_payment_installments').insert({ ...instData, plan_id: planId, created_at: new Date().toISOString() });
          }
        }
      }
    }
  }

  // Upsert demo config
  if (demo && resolvedBatchName) {
    await sb.from('batch_demo_config').upsert({
      ...demo, batch_name: resolvedBatchName, updated_at: new Date().toISOString(),
    }, { onConflict: 'batch_name' });
  }

  return successResponse({ saved: true, batchName: resolvedBatchName });
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
