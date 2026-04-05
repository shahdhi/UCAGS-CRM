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

  // Payment setup is handled by existing payment-setup module (/api/payment-setup)
  // and should not be loaded via batch-setup.

  // demo sessions (non-archived only)
  const { data: sessions, error: sErr } = await sb
    .from('demo_sessions')
    .select('*')
    .eq('batch_name', batchName)
    .eq('archived', false)
    .order('demo_number', { ascending: true });
  if (sErr) throw sErr;

  return { programBatch: pb, demoSessions: sessions || [] };
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
    // XP Archive: before flipping is_current, archive + reset XP for the outgoing batch
    // ONLY if the outgoing batch is different from the one being saved (i.e. a real transition)
    try {
      const { data: outgoing } = await sb
        .from('program_batches')
        .select('batch_name')
        .eq('program_id', programId)
        .eq('is_current', true)
        .maybeSingle();

      if (outgoing?.batch_name && outgoing.batch_name !== batchName) {
        const xpArchiveSvc = require('../xp/xpArchiveService');
        await xpArchiveSvc.archiveAndResetXPForBatch(programId, outgoing.batch_name);
        console.log(`[Batch Setup] XP archived for program=${programId} batch=${outgoing.batch_name}`);
      }
    } catch (xpErr) {
      // XP archive failure must never block batch transition
      console.warn('[Batch Setup] XP archive failed (non-fatal):', xpErr.message || xpErr);
    }

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

  // 3) Payments are handled by /api/payment-setup and saved separately from the UI.

  return { programBatch: updatedPb };
}

module.exports = { getBatchSetup, saveBatchSetup };
