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

    // Admin and supervisors can filter by officerId; regular officers are forced to themselves
    const isAdmin = req.user?.role === 'admin';
    const staffRoles = req.user?.user_metadata?.staff_roles || [];
    const isSupervisor = staffRoles.includes('supervisor');
    const canFilterByOfficer = isAdmin || isSupervisor;
    const officerId = canFilterByOfficer ? (req.query?.officerId || '') : (req.user?.id || '');

    const invites = await svc.listInvites({ demoSessionId, officerId });
    res.json({ success: true, invites });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/demo-sessions/invite
// Body: { batchName, demoNumber, lead, link, officerUserId? }
router.post('/invite', isAdminOrOfficer, async (req, res) => {
  try {
    const { batchName, demoNumber, lead, link, officerUserId } = req.body || {};
    const actorUserId = req.user?.id;
    const out = await svc.inviteLeadToDemo({ batchName, demoNumber, lead, actorUserId, link, officerUserId });
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

    // Capture previous attendance for XP dedupe
    let prevAttendance = null;
    try {
      const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
      const sb = getSupabaseAdmin();
      const { data: existing } = await sb
        .from('demo_session_invites')
        .select('attendance, officer_user_id')
        .eq('id', inviteId)
        .maybeSingle();
      prevAttendance = existing?.attendance || null;
    } catch (_) {}

    const invite = await svc.updateInvite({ inviteId, patch: req.body || {}, actorUserId });

    // XP: +30 when lead attendance is marked as 'Attended' (once per invite)
    try {
      const { awardXPOnce } = require('../xp/xpService');
      const newAttendance = invite?.attendance || req.body?.attendance;
      if (newAttendance === 'Attended' && prevAttendance !== 'Attended') {
        // Award XP to the officer who owns this invite
        const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
        const sb = getSupabaseAdmin();
        const { data: inviteRow } = await sb
          .from('demo_session_invites')
          .select('officer_user_id, crm_lead_id, batch_name')
          .eq('id', inviteId)
          .maybeSingle();
        const officerUserId = inviteRow?.officer_user_id || actorUserId;
        const inviteBatchName = inviteRow?.batch_name || null;

        // Resolve program_id from batch_name
        let xpProgramId = null;
        if (inviteBatchName) {
          try {
            const { data: pb } = await sb
              .from('program_batches')
              .select('program_id')
              .eq('batch_name', inviteBatchName)
              .limit(1)
              .maybeSingle();
            xpProgramId = pb?.program_id || null;
          } catch (_) {}
        }

        if (officerUserId) {
          await awardXPOnce({
            userId: officerUserId,
            eventType: 'demo_attended',
            xp: 30,
            referenceId: inviteId,
            referenceType: 'demo_invite',
            programId: xpProgramId,
            batchName: inviteBatchName,
            note: `Demo session attended (invite ${inviteId})`
          });
        }
      }
    } catch (xpErr) {
      console.warn('[XP] demo_attended hook error:', xpErr.message);
    }

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
