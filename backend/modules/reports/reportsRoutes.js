/**
 * Reports Routes
 *
 * Officers: submit daily reports in allowed windows.
 * Admins: view all daily reports for a day; update schedule; edit reports.
 */

const express = require('express');
const router = express.Router();

const { isAdmin, isAdminOrOfficer, isAuthenticated } = require('../../../server/middleware/auth');
const {
  getSchedule,
  updateSchedule,
  submitDailyReport,
  listDailyReports,
  adminUpdateReport
} = require('./dailyReportsService');

// GET /api/reports/daily/schedule
router.get('/daily/schedule', isAuthenticated, async (req, res) => {
  try {
    const result = await getSchedule();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('GET /api/reports/daily/schedule error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// POST /api/reports/daily/submit
router.post('/daily/submit', isAdminOrOfficer, async (req, res) => {
  try {
    const slotKey = req.body?.slotKey;
    const payload = req.body?.payload || req.body;
    const clientNowISO = req.body?.clientNowISO;

    const officerUserId = req.user?.id;
    const officerName = req.user?.name;

    const saved = await submitDailyReport({ officerUserId, officerName, slotKey, clientNowISO, payload });
    res.json({ success: true, report: saved });
  } catch (error) {
    console.error('POST /api/reports/daily/submit error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message, meta: error.meta });
  }
});

// GET /api/reports/daily?date=YYYY-MM-DD (admin)
router.get('/daily', isAdmin, async (req, res) => {
  try {
    const date = req.query?.date;
    const rows = await listDailyReports({ dateISO: date });
    res.json({ success: true, reports: rows });
  } catch (error) {
    console.error('GET /api/reports/daily error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// PUT /api/reports/daily/schedule (admin)
router.put('/daily/schedule', isAdmin, async (req, res) => {
  try {
    const { timezone, graceMinutes, slots } = req.body || {};
    const saved = await updateSchedule({ timezone, graceMinutes, slots });
    res.json({ success: true, config: saved });
  } catch (error) {
    console.error('PUT /api/reports/daily/schedule error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// PUT /api/reports/daily/:id (admin)
router.put('/daily/:id', isAdmin, async (req, res) => {
  try {
    const saved = await adminUpdateReport({ reportId: req.params.id, patch: req.body });
    res.json({ success: true, report: saved });
  } catch (error) {
    console.error('PUT /api/reports/daily/:id error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;
