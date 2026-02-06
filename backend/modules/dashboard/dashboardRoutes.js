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
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard statistics'
    });
  }
});

module.exports = router;
