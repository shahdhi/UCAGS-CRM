const express = require('express');
const router = express.Router();

const { isAdmin } = require('../../../server/middleware/auth');
const svc = require('./batchSetupService');

// GET /api/batch-setup?programId=...&batchId=...&batchName=...
router.get('/', isAdmin, async (req, res) => {
  try {
    const { programId, batchId, batchName } = req.query || {};
    const out = await svc.getBatchSetup({ programId, batchId, batchName });
    res.json({ success: true, ...out });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// PUT /api/batch-setup
router.put('/', isAdmin, async (req, res) => {
  try {
    const { programId, batchId, batchName, general, payments, demo } = req.body || {};
    const actorUserId = req.user?.id;
    const out = await svc.saveBatchSetup({ programId, batchId, batchName, general, payments, demo, actorUserId });
    res.json({ success: true, ...out });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
