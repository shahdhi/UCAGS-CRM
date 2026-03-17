/**
 * XP Cron Job — Overdue Follow-up Penalty
 *
 * Runs once per day (at midnight Sri Lanka time ≈ 18:30 UTC).
 * Deducts -2 XP for each followup that is still open 1+ day past its scheduled date.
 *
 * This module exports `startXPCron()` which sets up the interval when called from index.js.
 * It uses a simple setInterval (no external cron lib needed).
 */

const { penaliseOverdueFollowups } = require('./xpService');

const SL_OFFSET_MS = 330 * 60 * 1000; // UTC+05:30

/**
 * Returns milliseconds until the next midnight in Sri Lanka time.
 */
function msUntilSLMidnight() {
  const now = Date.now();
  // Current SL time
  const slNow = new Date(now + SL_OFFSET_MS);
  // Next SL midnight
  const slMidnight = new Date(Date.UTC(
    slNow.getUTCFullYear(),
    slNow.getUTCMonth(),
    slNow.getUTCDate() + 1,
    0, 0, 0, 0
  ) - SL_OFFSET_MS); // convert back to UTC

  return slMidnight.getTime() - now;
}

function startXPCron() {
  const runPenalty = async () => {
    console.log('[XP cron] Running overdue follow-up penalty...');
    try {
      const result = await penaliseOverdueFollowups();
      console.log('[XP cron] Done:', result);
    } catch (e) {
      console.error('[XP cron] Error:', e.message || e);
    }
  };

  // Schedule first run at next SL midnight, then every 24h
  const delay = msUntilSLMidnight();
  console.log(`[XP cron] Scheduled overdue penalty in ${Math.round(delay / 1000 / 60)} minutes`);

  setTimeout(() => {
    runPenalty();
    // Then repeat every 24 hours
    setInterval(runPenalty, 24 * 60 * 60 * 1000);
  }, delay);
}

module.exports = { startXPCron };
