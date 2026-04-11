/**
 * Followups Routes (Supabase)
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated, isAdmin, isAdminOrOfficer } = require('../../../server/middleware/auth');
const followupsSvc = require('./followupsService');

// Admin: view followups for a given officer_user_id
// GET /api/crm-followups/admin/:officerUserId/:batchName/:sheetName/:leadId
router.get('/admin/:officerUserId/:batchName/:sheetName/:leadId', isAdminOrOfficer, async (req, res) => {
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
    let prevRow = null;
    try {
      const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
      const sb = getSupabaseAdmin();
      if (sequence) {
        const { data: existing } = await sb
          .from('crm_lead_followups')
          .select('actual_at, answered, created_at')
          .eq('officer_user_id', officerUserId)
          .eq('batch_name', batchName)
          .eq('sheet_name', sheetName)
          .eq('sheet_lead_id', String(leadId))
          .eq('sequence', Number(sequence))
          .maybeSingle();
        prevRow = existing || null;
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
      const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

      // Resolve program_id for per-program XP tracking
      let xpProgramId = null;
      try {
        const sb = getSupabaseAdmin();
        const { data: pb } = await sb
          .from('program_batches')
          .select('program_id')
          .eq('batch_name', batchName)
          .limit(1)
          .maybeSingle();
        xpProgramId = pb?.program_id || null;
        console.log(`[XP] Followup XP hook: batchName=${batchName}, xpProgramId=${xpProgramId}, pb=`, pb);
      } catch (progErr) {
        console.warn('[XP] Failed to resolve program_id for batch:', batchName, progErr.message);
      }

      // +1 or +2 XP: followup completed when actual_at newly set
      // +2 if answered = Yes, +1 if answered = No / not set
      const prevActualAt = prevRow?.actual_at || null;
      const newActualAt = row?.actual_at || null;
      const answeredYes = row?.answered === true;
      const xpAmount = answeredYes ? 2 : 1;
      if (officerUserId && newActualAt && !prevActualAt && row?.id) {
        await awardXPOnce({
          userId: officerUserId,
          eventType: 'followup_completed',
          xp: xpAmount,
          referenceId: row?.id,
          referenceType: 'followup',
          programId: xpProgramId,
          batchName,
          note: `Follow-up #${row?.sequence ?? sequence} completed (${answeredYes ? 'answered' : 'no answer'})`
        });
      }

      // +2 XP: speed bonus — first followup within 1h of lead being assigned
      if (officerUserId && row?.actual_at && Number(sequence) === 1 && row?.id) {
        try {
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
                programId: xpProgramId,
                batchName,
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
