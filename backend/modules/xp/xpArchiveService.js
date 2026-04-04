/**
 * XP Archive Service
 *
 * Handles archiving and resetting officer XP when a program transitions
 * to a new current batch. Each program manages its own XP cycle independently.
 *
 * Flow:
 *  1. Called by batchSetupService.saveBatchSetup() before is_current flip
 *  2. Sums all XP events tagged with program_id + batch_name for each officer
 *  3. Saves snapshot to officer_xp_archives
 *  4. Subtracts that amount from officer_xp_summary (floors at 0)
 *  5. Inserts an audit event (xp_batch_reset) for traceability
 *
 * NOTE: XP events from before this feature (no program_id) are unaffected
 * and remain in officer_xp_summary total. Only going-forward tagged XP is reset.
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

function requireSupabase() {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const err = new Error('Supabase admin not configured');
    err.status = 500;
    throw err;
  }
  return sb;
}

/**
 * Archives and resets XP for all officers who earned XP in the outgoing batch
 * of a specific program.
 *
 * @param {string} programId - UUID of the program whose batch is transitioning
 * @param {string} outgoingBatchName - the batch_name that was is_current = true
 * @returns {Promise<{ archived: number, officers: Array }>}
 */
async function archiveAndResetXPForBatch(programId, outgoingBatchName) {
  if (!programId || !outgoingBatchName) {
    console.warn('[XP Archive] Skipping: missing programId or outgoingBatchName');
    return { archived: 0, officers: [] };
  }

  const sb = requireSupabase();

  // 1) Find all officers who have XP events for this program+batch
  const { data: events, error: evErr } = await sb
    .from('officer_xp_events')
    .select('user_id, xp')
    .eq('program_id', programId)
    .eq('batch_name', outgoingBatchName);

  if (evErr) {
    console.error('[XP Archive] Failed to fetch XP events:', evErr.message);
    throw evErr;
  }

  if (!events || events.length === 0) {
    console.log(`[XP Archive] No XP events found for program=${programId} batch=${outgoingBatchName}. Nothing to archive.`);
    return { archived: 0, officers: [] };
  }

  // 2) Sum XP per officer
  const xpByOfficer = new Map();
  for (const ev of events) {
    if (!ev.user_id) continue;
    xpByOfficer.set(ev.user_id, (xpByOfficer.get(ev.user_id) || 0) + Number(ev.xp || 0));
  }

  const now = new Date().toISOString();
  const results = [];

  for (const [userId, batchXP] of xpByOfficer.entries()) {
    try {
      // 3) Insert archive snapshot (even if batchXP = 0, for clean audit trail)
      const { error: archErr } = await sb
        .from('officer_xp_archives')
        .insert({
          user_id: userId,
          program_id: programId,
          batch_name: outgoingBatchName,
          total_xp: batchXP,
          archived_at: now
        });

      if (archErr) {
        console.warn(`[XP Archive] Failed to insert archive for user ${userId}:`, archErr.message);
        results.push({ userId, status: 'archive_failed', error: archErr.message });
        continue;
      }

      if (batchXP <= 0) {
        // Nothing to subtract
        results.push({ userId, batchXP, status: 'archived_no_reset' });
        continue;
      }

      // 4) Read current summary and subtract batch XP (floor at 0)
      const { data: summary } = await sb
        .from('officer_xp_summary')
        .select('total_xp')
        .eq('user_id', userId)
        .maybeSingle();

      const currentTotal = Number(summary?.total_xp || 0);
      const newTotal = Math.max(0, currentTotal - batchXP);

      await sb
        .from('officer_xp_summary')
        .upsert({
          user_id: userId,
          total_xp: newTotal,
          last_updated: now
        }, { onConflict: 'user_id' });

      // 5) Insert audit event for the reset
      await sb
        .from('officer_xp_events')
        .insert({
          user_id: userId,
          event_type: 'xp_batch_reset',
          xp: -batchXP,
          reference_id: `${programId}:${outgoingBatchName}`,
          reference_type: 'batch',
          program_id: programId,
          batch_name: outgoingBatchName,
          note: `Batch ended: ${outgoingBatchName} (archived ${batchXP} XP)`,
          created_at: now
        });

      results.push({ userId, batchXP, previousTotal: currentTotal, newTotal, status: 'reset' });
    } catch (e) {
      console.warn(`[XP Archive] Error processing user ${userId}:`, e.message);
      results.push({ userId, status: 'error', error: e.message });
    }
  }

  const archived = results.filter(r => r.status === 'reset' || r.status === 'archived_no_reset').length;
  console.log(`[XP Archive] Done for program=${programId} batch=${outgoingBatchName}: archived=${archived} officers=${results.length}`);

  return { archived, officers: results };
}

/**
 * Get past XP archives, optionally filtered by programId and/or batchName.
 * @param {object} opts
 * @param {string} [opts.programId]
 * @param {string} [opts.batchName]
 * @returns {Promise<Array>}
 */
async function getXPArchives({ programId, batchName } = {}) {
  const sb = requireSupabase();

  let q = sb
    .from('officer_xp_archives')
    .select('*')
    .order('archived_at', { ascending: false });

  if (programId) q = q.eq('program_id', programId);
  if (batchName) q = q.eq('batch_name', batchName);

  const { data, error } = await q.limit(500);
  if (error) throw error;

  // Enrich with user names
  const { data: { users }, error: uErr } = await sb.auth.admin.listUsers();
  if (uErr) throw uErr;

  const userMap = new Map((users || []).map(u => [u.id, u]));

  return (data || []).map(row => {
    const u = userMap.get(row.user_id);
    return {
      ...row,
      name: u?.user_metadata?.name || u?.email?.split('@')[0] || 'Unknown',
      email: u?.email || ''
    };
  });
}

module.exports = {
  archiveAndResetXPForBatch,
  getXPArchives
};
