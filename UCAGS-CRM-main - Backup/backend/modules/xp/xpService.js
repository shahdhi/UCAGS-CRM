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

// ─── Current-batch XP helpers ─────────────────────────────────────────────────

/**
 * Returns the current batch name(s) per program (all programs with is_current = true).
 * Returns a flat array of { program_id, batch_name } objects.
 */
async function getCurrentBatches(sb) {
  const { data, error } = await sb
    .from('program_batches')
    .select('program_id, batch_name')
    .eq('is_current', true);
  if (error) throw error;
  return data || [];
}

/**
 * Sums XP per user_id from officer_xp_events for all current batches.
 * Returns a Map<userId, totalXp>.
 */
async function getCurrentBatchXPMap(sb) {
  const currentBatches = await getCurrentBatches(sb);
  if (!currentBatches.length) return new Map();

  // Build OR filter: (program_id = X AND batch_name = Y) OR ...
  // Supabase JS doesn't support OR across multiple columns natively,
  // so we fetch each batch's events and aggregate in JS.
  const xpMap = new Map();

  for (const { program_id, batch_name } of currentBatches) {
    const { data: events, error } = await sb
      .from('officer_xp_events')
      .select('user_id, xp')
      .eq('program_id', program_id)
      .eq('batch_name', batch_name);

    if (error) throw error;

    for (const ev of (events || [])) {
      if (!ev.user_id) continue;
      xpMap.set(ev.user_id, (xpMap.get(ev.user_id) || 0) + Number(ev.xp || 0));
    }
  }

  return xpMap;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

/**
 * Returns all officers ranked by current-batch XP descending.
 * @returns {Promise<Array<{userId, name, email, totalXp, rank}>>}
 */
async function getLeaderboard() {
  const sb = requireSupabase();

  // Get XP for current active batches only
  const xpMap = await getCurrentBatchXPMap(sb);

  // Fetch user metadata to get names
  const { data: { users }, error: uErr } = await sb.auth.admin.listUsers();
  if (uErr) throw uErr;

  // Only include officers and admins
  const officers = (users || []).filter(u =>
    u.user_metadata?.role === 'officer' || u.user_metadata?.role === 'admin'
  );

  // Build ranked list — include all officers, defaulting to 0 XP if none this batch
  const list = officers.map(u => ({
    userId: u.id,
    name: u.user_metadata?.name || u.email?.split('@')[0] || 'Unknown',
    email: u.email || '',
    role: u.user_metadata?.role || '',
    totalXp: xpMap.get(u.id) || 0,
    lastUpdated: null
  }));

  // Sort by XP descending
  list.sort((a, b) => b.totalXp - a.totalXp);

  let rank = 1;
  return list.map(entry => ({ ...entry, rank: rank++ }));
}

// ─── My XP ───────────────────────────────────────────────────────────────────

/**
 * Returns a user's current-batch XP + recent events.
 */
async function getMyXP(userId) {
  const sb = requireSupabase();

  const [xpMap, eventsResult, leaderboardResult] = await Promise.all([
    getCurrentBatchXPMap(sb),
    sb.from('officer_xp_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    getLeaderboard()
  ]);

  const events = eventsResult.data || [];
  const totalXp = xpMap.get(userId) || 0;
  const rank = (leaderboardResult || []).find(r => r.userId === userId)?.rank || null;
  const totalOfficers = (leaderboardResult || []).length;

  return {
    userId,
    totalXp,
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
