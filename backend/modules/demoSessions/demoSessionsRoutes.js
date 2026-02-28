const express = require('express');
const router = express.Router();

const { isAdminOrOfficer } = require('../../../server/middleware/auth');
const svc = require('./demoSessionsService');

// GET /api/demo-sessions/sessions?batch=Batch%201
router.get('/sessions', isAdminOrOfficer, async (req, res) => {
  try {
    const batchName = req.query?.batch;
    const sessions = await svc.listSessions({ batchName });
    res.json({ success: true, sessions });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/demo-sessions/sessions
// Body: { batchName, demoNumber, patch }
router.post('/sessions', isAdminOrOfficer, async (req, res) => {
  try {
    const { batchName, demoNumber, patch } = req.body || {};
    const actorUserId = req.user?.id;
    const session = await svc.ensureSession({ batchName, demoNumber, patch: patch || {}, actorUserId });
    res.json({ success: true, session });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/demo-sessions/leads/:crmLeadId
router.get('/leads/:crmLeadId', isAdminOrOfficer, async (req, res) => {
  try {
    const crmLeadId = req.params.crmLeadId;
    const items = await svc.listLeadDemoInvites({ crmLeadId });
    res.json({ success: true, items });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/demo-sessions/invites?sessionId=...
router.get('/invites', isAdminOrOfficer, async (req, res) => {
  try {
    const demoSessionId = req.query?.sessionId;

    // Admin can optionally filter by officerId; officers are always forced to themselves
    const isAdmin = req.user?.role === 'admin';
    const officerId = isAdmin ? (req.query?.officerId || '') : (req.user?.id || '');

    const invites = await svc.listInvites({ demoSessionId, officerId });
    res.json({ success: true, invites });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/demo-sessions/invite
// Body: { batchName, demoNumber, lead, link }
router.post('/invite', isAdminOrOfficer, async (req, res) => {
  try {
    const { batchName, demoNumber, lead, link } = req.body || {};
    const actorUserId = req.user?.id;
    const out = await svc.inviteLeadToDemo({ batchName, demoNumber, lead, actorUserId, link });
    res.status(201).json({ success: true, ...out });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// PATCH /api/demo-sessions/invites/:id
router.patch('/invites/:id', isAdminOrOfficer, async (req, res) => {
  try {
    const inviteId = req.params.id;
    const actorUserId = req.user?.id;
    const invite = await svc.updateInvite({ inviteId, patch: req.body || {}, actorUserId });
    res.json({ success: true, invite });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// DELETE /api/demo-sessions/invites/:id
router.delete('/invites/:id', isAdminOrOfficer, async (req, res) => {
  try {
    const inviteId = req.params.id;
    const invite = await svc.deleteInvite({ inviteId });
    res.json({ success: true, invite });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/demo-sessions/invites/:id/reminders
router.get('/invites/:id/reminders', isAdminOrOfficer, async (req, res) => {
  try {
    const inviteId = req.params.id;
    const reminders = await svc.listReminders({ inviteId });
    res.json({ success: true, reminders });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/demo-sessions/invites/:id/reminders
// Body: { remindAt, note }
router.post('/invites/:id/reminders', isAdminOrOfficer, async (req, res) => {
  try {
    const inviteId = req.params.id;
    const actorUserId = req.user?.id;
    const reminder = await svc.addReminder({
      inviteId,
      // Backward-compatible: if old client calls without remindAt, default to now
      remindAt: req.body?.remindAt || new Date().toISOString(),
      note: req.body?.note,
      actorUserId
    });
    res.status(201).json({ success: true, reminder });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
