const express = require('express');
const router = express.Router();

const { isAuthenticated } = require('../../../server/middleware/auth');
const {
  createNotification,
  listNotifications,
  markAllRead,
  getNotificationSettings,
  upsertNotificationSettings,
  purgeOldNotifications
} = require('./notificationsService');

// GET /api/notifications?limit=50
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const limit = req.query?.limit;
    const rows = await listNotifications({ userId: req.user.id, limit });
    res.json({ success: true, notifications: rows });
  } catch (error) {
    console.error('GET /api/notifications error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// POST /api/notifications (internal use; authenticated user creates for self)
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { title, message, type } = req.body || {};
    const saved = await createNotification({ userId: req.user.id, title, message, type });
    res.json({ success: true, notification: saved });
  } catch (error) {
    console.error('POST /api/notifications error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// POST /api/notifications/mark-all-read
router.post('/mark-all-read', isAuthenticated, async (req, res) => {
  try {
    const result = await markAllRead({ userId: req.user.id });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('POST /api/notifications/mark-all-read error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// GET /api/notifications/settings
router.get('/settings', isAuthenticated, async (req, res) => {
  try {
    const settings = await getNotificationSettings(req.user.id);
    res.json({ success: true, settings: settings || null });
  } catch (error) {
    console.error('GET /api/notifications/settings error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// PUT /api/notifications/settings
router.put('/settings', isAuthenticated, async (req, res) => {
  try {
    const patch = req.body || {};
    const saved = await upsertNotificationSettings(req.user.id, patch);
    res.json({ success: true, settings: saved });
  } catch (error) {
    console.error('PUT /api/notifications/settings error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// POST /api/notifications/purge (admin only via shared secret)
// Call this from a cron job. Provide header: x-cron-secret: <value>
router.post('/purge', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers['x-cron-secret'];
    if (!secret || provided !== secret) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const days = req.body?.olderThanDays ?? 7;
    const result = await purgeOldNotifications({ olderThanDays: days });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('POST /api/notifications/purge error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;
