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

    // Count "enrollments" based on confirmed payments:
    // If a payment is confirmed (is_confirmed=true) for a registration in the current batch,
    // count it as 1 for that registration's assigned officer.

    // 1) Get confirmed payments registration_ids
    let payRows = [];
    try {
      const { data, error: payErr } = await sb
        .from('payments')
        .select('registration_id')
        .eq('is_confirmed', true)
        .not('registration_id', 'is', null)
        .limit(10000);
      if (payErr) throw payErr;
      payRows = data || [];
    } catch (e1) {
      const msg = String(e1.message || '').toLowerCase();
      const missingCol = (msg.includes('column') && msg.includes('is_confirmed') && msg.includes('does not exist')) ||
        (msg.includes('schema cache') && msg.includes('is_confirmed') && msg.includes('could not find'));
      if (!missingCol) throw e1;

      // Backward compatibility: older payments schema used receipt_received boolean
      const { data, error: payErr } = await sb
        .from('payments')
        .select('registration_id')
        .eq('receipt_received', true)
        .not('registration_id', 'is', null)
        .limit(10000);
      if (payErr) throw payErr;
      payRows = data || [];
    }

    const paidRegIds = Array.from(new Set((payRows || []).map(r => r.registration_id).filter(Boolean)));
    if (!paidRegIds.length) {
      return res.json({ success: true, batchNames: currentBatches, rankings: [] });
    }

    // 2) Load registrations for those ids, restricted to current batches
    const { data: regs, error: regErr } = await sb
      .from('registrations')
      .select('id, assigned_to, batch_name, payload')
      .in('id', paidRegIds)
      .in('batch_name', currentBatches)
      .limit(10000);
    if (regErr) throw regErr;

    const map = new Map(); // officerName -> count

    for (const r of (regs || [])) {
      const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
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
