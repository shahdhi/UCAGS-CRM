/**
 * Followups Routes (Supabase)
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated, isAdmin } = require('../../../server/middleware/auth');
const followupsSvc = require('./followupsService');

// Admin: view followups for a given officer_user_id
// GET /api/crm-followups/admin/:officerUserId/:batchName/:sheetName/:leadId
router.get('/admin/:officerUserId/:batchName/:sheetName/:leadId', isAdmin, async (req, res) => {
  try {
    const { officerUserId, batchName, sheetName, leadId } = req.params;

    const followups = await followupsSvc.listOfficerFollowups({
      officerUserId,
      batchName,
      sheetName,
      sheetLeadId: leadId
    });

    res.json({ success: true, followups });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/crm-followups/my/:batchName/:sheetName/:leadId
router.get('/my/:batchName/:sheetName/:leadId', isAuthenticated, async (req, res) => {
  try {
    const { batchName, sheetName, leadId } = req.params;
    const officerUserId = req.user?.id;

    const followups = await followupsSvc.listOfficerFollowups({
      officerUserId,
      batchName,
      sheetName,
      sheetLeadId: leadId
    });

    res.json({ success: true, followups });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/crm-followups/my/:batchName/:sheetName/:leadId
// Body: { sequence, channel, scheduledAt, actualAt, answered, comment }
router.post('/my/:batchName/:sheetName/:leadId', isAuthenticated, async (req, res) => {
  try {
    const { batchName, sheetName, leadId } = req.params;
    const officerUserId = req.user?.id;
    const officerName = req.user?.name;
    const { sequence, ...payload } = req.body || {};

    const row = await followupsSvc.upsertFollowupBySequence({
      officerUserId,
      officerName,
      batchName,
      sheetName,
      sheetLeadId: leadId,
      sequence: Number(sequence) || null,
      payload
    });

    res.status(201).json({ success: true, followup: row });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
