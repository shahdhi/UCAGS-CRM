/**
 * XP Service
 *
 * Central service for awarding / deducting XP and querying leaderboard / trends.
 *
 * XP Events:
 *  lead_contacted          +2   Lead status changed from 'New'
 *  followup_completed      +1/+2 A followup actual_at newly set (+2 if answered=yes, +1 if no/unset)
 *  registration_received   +40  New registration submission
 *  payment_received        +100 Payment confirmed / received
 *  demo_attended           +30  Demo session invite marked as 'Attended'
 *  attendance_on_time      +1   Check-in recorded before 10:00 AM (SL time)
 *  checklist_completed     +2   Daily checklist snapshot saved for the day
 *  report_submitted        +2   Daily report slot submitted (1 per slot)
 *  lead_responded_fast     +2   First followup created within 1h of lead assignment
 *  followup_overdue        -5   A followup is still open 1+ day past scheduled date (daily cron)
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

// ─── Core award/deduct ────────────────────────────────────────────────────────

/**
 * Award or deduct XP for a user.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.eventType
 * @param {number} opts.xp  (positive = award, negative = deduct)
 * @param {string} [opts.referenceId]
 * @param {string} [opts.referenceType]
 * @param {string} [opts.note]
 * @returns {Promise<object>} the saved event row
 */
async function awardXP({ userId, eventType, xp, referenceId, referenceType, note, programId, batchName }) {
  if (!userId || !eventType || typeof xp !== 'number' || xp === 0) return null;

  const sb = requireSupabase();

  // Insert event
  const { data: event, error: evErr } = await sb
    .from('officer_xp_events')
    .insert({
      user_id: userId,
      event_type: eventType,
      xp,
      reference_id: referenceId || null,
      reference_type: referenceType || null,
      note: note || null,
      program_id: programId || null,
      batch_name: batchName || null
    })
    .select('*')
    .single();

  if (evErr) {
    console.error(`[XP] Failed to insert xp event for user ${userId}:`, evErr.message);
    throw evErr;
  }

  // Upsert summary (atomic increment via RPC if available, otherwise fetch+update)
  const { data: existing } = await sb
    .from('officer_xp_summary')
    .select('total_xp')
    .eq('user_id', userId)
    .maybeSingle();

  const currentXP = Number(existing?.total_xp || 0);
  const newXP = Math.max(0, currentXP + xp); // floor at 0 — XP never goes negative

  await sb
    .from('officer_xp_summary')
    .upsert({
      user_id: userId,
      total_xp: newXP,
      last_updated: new Date().toISOString()
    }, { onConflict: 'user_id' });

  return event;
}

/**
 * Safe wrapper — logs errors but never throws (so XP failures don't break main flows).
 */
async function awardXPSafe(opts) {
  try {
    return await awardXP(opts);
  } catch (e) {
    console.warn('[XP] awardXPSafe suppressed error:', e.message || e);
    return null;
  }
}

// ─── Deduplication helpers ────────────────────────────────────────────────────

/**
 * Returns true if an XP event with the same eventType + referenceId already exists for this user.
 * Used to prevent awarding XP twice for the same action.
 */
async function alreadyAwarded({ userId, eventType, referenceId }) {
  if (!userId || !eventType || !referenceId) return false;
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('officer_xp_events')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .eq('reference_id', String(referenceId))
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

/**
 * Deduped XP award — only awards if this (user, eventType, referenceId) combo hasn't been awarded yet.
 */
async function awardXPOnce(opts) {
  try {
    const already = await alreadyAwarded({
      userId: opts.userId,
      eventType: opts.eventType,
      referenceId: opts.referenceId
    });
    if (already) return null;
    return await awardXP(opts);
  } catch (e) {
    console.warn('[XP] awardXPOnce suppressed error:', e.message || e);
    return null;
  }
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

/**
 * Returns all officers ranked by total XP descending.
 * @returns {Promise<Array<{userId, name, email, totalXp, rank}>>}
 */
async function getLeaderboard() {
  const sb = requireSupabase();

  const { data: summaries, error } = await sb
    .from('officer_xp_summary')
    .select('user_id, total_xp, last_updated')
    .order('total_xp', { ascending: false });

  if (error) throw error;

  // Fetch user metadata to get names
  const { data: { users }, error: uErr } = await sb.auth.admin.listUsers();
  if (uErr) throw uErr;

  const userMap = new Map((users || []).map(u => [u.id, u]));

  let rank = 1;
  return (summaries || []).map(s => {
    const u = userMap.get(s.user_id);
    return {
      userId: s.user_id,
      name: u?.user_metadata?.name || u?.email?.split('@')[0] || 'Unknown',
      email: u?.email || '',
      role: u?.user_metadata?.role || '',
      totalXp: s.total_xp || 0,
      rank: rank++,
      lastUpdated: s.last_updated
    };
  });
}

// ─── My XP ───────────────────────────────────────────────────────────────────

/**
 * Returns a user's XP summary + recent events.
 */
async function getMyXP(userId) {
  const sb = requireSupabase();

  const [summaryResult, eventsResult, leaderboardResult] = await Promise.all([
    sb.from('officer_xp_summary').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('officer_xp_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    getLeaderboard()
  ]);

  const summary = summaryResult.data;
  const events = eventsResult.data || [];
  const rank = (leaderboardResult || []).find(r => r.userId === userId)?.rank || null;
  const totalOfficers = (leaderboardResult || []).length;

  return {
    userId,
    totalXp: summary?.total_xp || 0,
    rank,
    totalOfficers,
    recentEvents: events
  };
}

// ─── XP Trend ────────────────────────────────────────────────────────────────

/**
 * Returns daily XP totals for a user over the last N days (default 30).
 */
async function getXPTrend({ userId, days = 30 } = {}) {
  const sb = requireSupabase();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from('officer_xp_events')
    .select('xp, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Group by Sri Lanka date
  const SL_OFFSET = 330;
  const byDate = {};
  for (const row of (data || [])) {
    const d = new Date(new Date(row.created_at).getTime() + SL_OFFSET * 60 * 1000);
    const dateKey = d.toISOString().slice(0, 10);
    byDate[dateKey] = (byDate[dateKey] || 0) + row.xp;
  }

  // Fill in zero days
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const shifted = new Date(d.getTime() + SL_OFFSET * 60 * 1000);
    const dateKey = shifted.toISOString().slice(0, 10);
    result.push({ date: dateKey, xp: byDate[dateKey] || 0 });
  }

  return result;
}

/**
 * Returns global XP trend (all officers combined) for admin dashboard.
 */
async function getGlobalXPTrend({ days = 30 } = {}) {
  const sb = requireSupabase();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from('officer_xp_events')
    .select('xp, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  const SL_OFFSET = 330;
  const byDate = {};
  for (const row of (data || [])) {
    const d = new Date(new Date(row.created_at).getTime() + SL_OFFSET * 60 * 1000);
    const dateKey = d.toISOString().slice(0, 10);
    byDate[dateKey] = (byDate[dateKey] || 0) + row.xp;
  }

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const shifted = new Date(d.getTime() + SL_OFFSET * 60 * 1000);
    const dateKey = shifted.toISOString().slice(0, 10);
    result.push({ date: dateKey, xp: byDate[dateKey] || 0 });
  }

  return result;
}

// ─── Daily cron: penalise overdue followups ───────────────────────────────────

/**
 * Called by the daily cron job. Finds followups that are overdue (scheduled_at
 * is more than 1 day in the past, actual_at is null) and deducts XP once per
 * overdue followup per day.
 *
 * The referenceId for the penalty is `{followup_id}:{YYYY-MM-DD}` so it is
 * idempotent — running this multiple times on the same day won't double-penalise.
 */
async function penaliseOverdueFollowups() {
  const sb = requireSupabase();

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Find open followups past their scheduled date
  const { data: overdue, error } = await sb
    .from('crm_lead_followups')
    .select('id, officer_user_id, scheduled_at')
    .is('actual_at', null)
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', oneDayAgo.toISOString());

  if (error) {
    console.error('[XP cron] Failed to fetch overdue followups:', error.message);
    return { penalised: 0, skipped: 0 };
  }

  const SL_OFFSET = 330;
  const todayShifted = new Date(now.getTime() + SL_OFFSET * 60 * 1000);
  const todayKey = todayShifted.toISOString().slice(0, 10);

  let penalised = 0;
  let skipped = 0;

  for (const f of (overdue || [])) {
    if (!f.officer_user_id) { skipped++; continue; }

    const refId = `${f.id}:${todayKey}`;
    const result = await awardXPOnce({
      userId: f.officer_user_id,
      eventType: 'followup_overdue',
      xp: -5,
      referenceId: refId,
      referenceType: 'followup',
      note: `Overdue followup penalty (${todayKey})`
    });

    if (result) penalised++;
    else skipped++;
  }

  console.log(`[XP cron] Overdue penalty: penalised=${penalised}, skipped=${skipped}`);
  return { penalised, skipped };
}

module.exports = {
  awardXP,
  awardXPSafe,
  awardXPOnce,
  alreadyAwarded,
  getLeaderboard,
  getMyXP,
  getXPTrend,
  getGlobalXPTrend,
  penaliseOverdueFollowups
};
