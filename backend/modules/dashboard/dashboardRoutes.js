/**
 * Dashboard Module
 * Provides dashboard data and statistics
 */

const express = require('express');
const router = express.Router();
const leadsService = require('../leads/leadsService');

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin, isAuthenticated } = require('../../../server/middleware/auth');
const sheetsService = require('../../../server/integrations/sheets');

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
 * Legacy-compatible dashboard stats (used by public/js/app.js)
 */
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const user = req.user || req.session?.user;
    let enquiries;

    if (user?.role === 'admin') {
      enquiries = await sheetsService.getAllEnquiries();
    } else if ((user?.role === 'officer' || user?.role === 'user') && user?.sheetId) {
      enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = {
      total: enquiries.length,
      new: enquiries.filter(e => e.status === 'New').length,
      contacted: enquiries.filter(e => e.status === 'Contacted').length,
      followUp: enquiries.filter(e => e.status === 'Follow-up').length,
      registered: enquiries.filter(e => e.status === 'Registered').length,
      closed: enquiries.filter(e => e.status === 'Closed').length
    };

    let officerStats = null;
    if (user?.role === 'admin') {
      officerStats = {};
      enquiries.forEach(e => {
        const officer = e.assignedOfficer || 'Unassigned';
        if (!officerStats[officer]) {
          officerStats[officer] = {
            total: 0,
            new: 0,
            contacted: 0,
            followUp: 0,
            registered: 0,
            closed: 0
          };
        }
        officerStats[officer].total++;
        const key = String(e.status || '').toLowerCase().replace('-', '');
        officerStats[officer][key] = (officerStats[officer][key] || 0) + 1;
      });
    }

    res.json({
      stats,
      officerStats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
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

/**
 * GET /api/dashboard/recent
 * Legacy-compatible recent enquiries
 */
router.get('/recent', isAuthenticated, async (req, res) => {
  try {
    const user = req.user || req.session?.user;
    const limit = parseInt(req.query.limit, 10) || 10;
    let enquiries;

    if (user?.role === 'admin') {
      enquiries = await sheetsService.getAllEnquiries();
    } else if ((user?.role === 'officer' || user?.role === 'user') && user?.sheetId) {
      enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    enquiries.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));
    res.json({ enquiries: enquiries.slice(0, limit) });
  } catch (error) {
    console.error('Error fetching recent enquiries:', error);
    res.status(500).json({ error: 'Failed to fetch recent enquiries' });
  }
});

/**
 * GET /api/dashboard/follow-ups
 * Legacy-compatible follow-ups response
 */
router.get('/follow-ups', isAuthenticated, async (req, res) => {
  try {
    const user = req.user || req.session?.user;
    let enquiries;

    if (user?.role === 'admin') {
      enquiries = await sheetsService.getAllEnquiries();
    } else if ((user?.role === 'officer' || user?.role === 'user') && user?.sheetId) {
      enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const now = new Date();
    const followUps = enquiries
      .filter(e => e.followUpDate)
      .map(e => ({ ...e, followUpDate: new Date(e.followUpDate) }))
      .sort((a, b) => a.followUpDate - b.followUpDate);

    const overdue = followUps.filter(e => e.followUpDate < now);
    const upcoming = followUps.filter(e => e.followUpDate >= now);

    res.json({ overdue, upcoming });
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

module.exports = router;
