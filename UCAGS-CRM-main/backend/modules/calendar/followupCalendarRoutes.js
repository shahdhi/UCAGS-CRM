/**
 * Follow-up Calendar Routes
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated } = require('../../../server/middleware/auth');
const { getCalendarEvents } = require('./followupCalendarService');

router.get('/followups', isAuthenticated, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const officerName = req.user?.name;
    const officerFilter = req.query.officer;
    const data = await getCalendarEvents({ userRole, officerName, officerFilter });
    res.json({ success: true, ...data });
  } catch (e) {
    console.error('GET /api/calendar/followups error:', e);

    const msg = String(e?.message || e || '');
    const isQuota = e?.statusCode === 429 || msg.includes('Quota exceeded');
    if (isQuota) {
      res.set('Retry-After', '10');
      return res.status(429).json({ success: false, error: msg, code: 'SHEETS_QUOTA' });
    }

    res.status(500).json({ success: false, error: msg });
  }
});

module.exports = router;
