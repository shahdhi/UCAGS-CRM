/**
 * Dashboard Module
 * Provides dashboard data and statistics
 */

const express = require('express');
const router = express.Router();
const leadsService = require('../leads/leadsService');

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin } = require('../../../server/middleware/auth');

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

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const leadsStats = await leadsService.getLeadsStats();
    
    res.json({
      success: true,
      stats: {
        leads: leadsStats
      }
    });
  } catch (error) {
    console.error('Error in GET /api/dashboard/stats:', error);

    const msg = String(error?.message || error || '');
    const isQuota = error?.statusCode === 429 || msg.includes('Quota exceeded');
    if (isQuota) {
      res.set('Retry-After', '10');
      return res.status(429).json({ success: false, error: msg, code: 'SHEETS_QUOTA' });
    }

    res.status(500).json({
      success: false,
      error: msg || 'Failed to fetch dashboard statistics'
    });
  }
});

/**
 * GET /api/dashboard/enrollment-rankings
 * Admin-only: rank officers by number of enrollments for current batch(es)
 */
router.get('/enrollment-rankings', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const currentBatches = await getCurrentBatchNames(sb);

    // If no current batches configured, return empty list (don't accidentally count all-time)
    if (!currentBatches.length) {
      return res.json({ success: true, batchNames: [], rankings: [] });
    }

    // Query registrations in current batches; include assigned_to + enrolled fields.
    // Some deployments store enrollment status in payload only, so we select payload as well.
    const { data, error } = await sb
      .from('registrations')
      .select('id, assigned_to, batch_name, enrolled, enrolled_at, payload')
      .in('batch_name', currentBatches)
      .limit(5000);

    if (error) throw error;

    const map = new Map(); // officerName -> count

    for (const r of (data || [])) {
      const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
      const isEnrolled = !!(
        r?.enrolled === true ||
        r?.enrolled_at ||
        payload?.enrolled === true ||
        payload?.enrolled_at
      );
      if (!isEnrolled) continue;

      const officer = String(r?.assigned_to || payload?.assigned_to || payload?.assignedTo || 'Unassigned').trim() || 'Unassigned';
      map.set(officer, (map.get(officer) || 0) + 1);
    }

    const rankings = Array.from(map.entries())
      .map(([officer, count]) => ({ officer, count }))
      .sort((a, b) => b.count - a.count || a.officer.localeCompare(b.officer));

    res.json({ success: true, batchNames: currentBatches, rankings });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
