/**
 * XP Routes
 *
 * GET /api/xp/leaderboard         — all officers ranked by XP (admin + officer)
 * GET /api/xp/me                  — personal XP summary + recent events
 * GET /api/xp/trend               — XP trend over time (personal)
 * GET /api/xp/global-trend        — XP trend for all officers combined (admin)
 * POST /api/xp/cron/overdue       — trigger overdue followup penalty (admin / cron)
 * GET /api/xp/archives            — list past batch XP archives (admin)
 * POST /api/xp/admin/reset        — manually trigger XP archive+reset for a program/batch (admin)
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated, isAdmin, isAdminOrOfficer } = require('../../../server/middleware/auth');
const xpSvc = require('./xpService');
const xpArchiveSvc = require('./xpArchiveService');

// GET /api/xp/leaderboard
router.get('/leaderboard', isAdminOrOfficer, async (req, res) => {
  try {
    const leaderboard = await xpSvc.getLeaderboard();
    res.json({ success: true, leaderboard });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/xp/me
router.get('/me', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await xpSvc.getMyXP(userId);
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/xp/trend?days=30
router.get('/trend', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const days = Math.min(parseInt(req.query.days || '30', 10) || 30, 90);
    const trend = await xpSvc.getXPTrend({ userId, days });
    res.json({ success: true, trend });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/xp/global-trend?days=30  (admin only)
router.get('/global-trend', isAdmin, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || '30', 10) || 30, 90);
    const trend = await xpSvc.getGlobalXPTrend({ days });
    res.json({ success: true, trend });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/xp/cron/overdue  — manually trigger or called by cron
router.post('/cron/overdue', isAdmin, async (req, res) => {
  try {
    const result = await xpSvc.penaliseOverdueFollowups();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/xp/archives?programId=&batchName=  — list past batch XP archives (admin)
router.get('/archives', isAdmin, async (req, res) => {
  try {
    const programId = req.query.programId || null;
    const batchName = req.query.batchName || null;
    const archives = await xpArchiveSvc.getXPArchives({ programId, batchName });
    res.json({ success: true, archives });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/xp/admin/reset  — manually trigger archive+reset for a program's current batch (admin)
// Body: { programId, batchName }
router.post('/admin/reset', isAdmin, async (req, res) => {
  try {
    const { programId, batchName } = req.body || {};
    if (!programId || !batchName) {
      return res.status(400).json({ success: false, error: 'programId and batchName are required' });
    }
    const result = await xpArchiveSvc.archiveAndResetXPForBatch(programId, batchName);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
