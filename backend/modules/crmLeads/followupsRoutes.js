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

    // Capture previous state for XP dedupe
    let prevActualAt = null;
    try {
      const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
      const sb = getSupabaseAdmin();
      if (sequence) {
        const { data: existing } = await sb
          .from('crm_lead_followups')
          .select('actual_at, created_at')
          .eq('officer_user_id', officerUserId)
          .eq('batch_name', batchName)
          .eq('sheet_name', sheetName)
          .eq('sheet_lead_id', String(leadId))
          .eq('sequence', Number(sequence))
          .maybeSingle();
        prevActualAt = existing?.actual_at || null;
      }
    } catch (_) {}

    const row = await followupsSvc.upsertFollowupBySequence({
      officerUserId,
      officerName,
      batchName,
      sheetName,
      sheetLeadId: leadId,
      sequence: Number(sequence) || null,
      payload
    });

    // XP hooks (best-effort)
    try {
      const { awardXPOnce, awardXPSafe } = require('../xp/xpService');

      // +2 XP: followup completed (actual_at newly set AND answered = yes)
      const newActualAt = row?.actual_at || payload?.actualAt || payload?.actual_at;
      const answeredYes = row?.answered === true;
      if (officerUserId && newActualAt && !prevActualAt && answeredYes) {
        await awardXPOnce({
          userId: officerUserId,
          eventType: 'followup_completed',
          xp: 2,
          referenceId: row?.id,
          referenceType: 'followup',
          note: `Follow-up #${row?.sequence ?? sequence} completed (answered)`
        });
      }

      // +2 XP: speed bonus — first followup within 1h of lead being assigned
      if (officerUserId && newActualAt && Number(sequence) === 1 && row?.id) {
        try {
          const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
          const sb = getSupabaseAdmin();
          const { data: leadRow } = await sb
            .from('crm_leads')
            .select('assigned_at, created_at')
            .eq('batch_name', batchName)
            .eq('sheet_name', sheetName)
            .eq('sheet_lead_id', String(leadId))
            .maybeSingle();

          const assignedAt = leadRow?.assigned_at || leadRow?.created_at;
          if (assignedAt) {
            const diffMs = new Date(row.created_at || Date.now()) - new Date(assignedAt);
            if (diffMs >= 0 && diffMs <= 60 * 60 * 1000) {
              await awardXPOnce({
                userId: officerUserId,
                eventType: 'lead_responded_fast',
                xp: 2,
                referenceId: `${batchName}|${sheetName}|${leadId}`,
                referenceType: 'lead',
                note: 'Responded within 1h of lead assignment'
              });
            }
          }
        } catch (_) {}
      }
    } catch (xpErr) {
      console.warn('[XP] followup hook error:', xpErr.message);
    }

    res.status(201).json({ success: true, followup: row });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
