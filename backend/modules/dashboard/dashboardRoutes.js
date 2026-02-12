/**
 * Dashboard Module
 * Provides dashboard data and statistics
 */

const express = require('express');
const router = express.Router();
const leadsService = require('../leads/leadsService');

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

module.exports = router;
