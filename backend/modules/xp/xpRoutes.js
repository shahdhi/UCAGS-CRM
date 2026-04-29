/**
 * XP Routes
 *
 * Routes below are the remaining Vercel-hosted endpoints.
 * Read-only routes (me, leaderboard, trend, global-trend, archives) have been
 * moved to the Supabase Edge Function: supabase/functions/xp/index.ts
 *
 * POST /api/xp/cron/overdue       — trigger overdue followup penalty (admin / cron)
 * POST /api/xp/admin/reset        — manually trigger XP archive+reset for a program/batch (admin)
 * GET  /api/xp/admin/overrides    — list XP overrides for a batch (admin)
 * PUT  /api/xp/admin/overrides    — upsert XP override (admin)
 * DELETE /api/xp/admin/overrides/:id — delete XP override (admin)
 */

const express = require('express');
const router = express.Router();

const { isAdmin } = require('../../../server/middleware/auth');
const xpArchiveSvc = require('./xpArchiveService');

// POST /api/xp/cron/overdue  — manually trigger or called by cron
router.post('/cron/overdue', isAdmin, async (req, res) => {
  try {
    const result = await xpSvc.penaliseOverdueFollowups();
    res.json({ success: true, ...result });
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

// ─── XP Overrides (admin-editable XP per officer per batch) ──────────────────

// GET /api/xp/admin/overrides?batchName=Batch14
router.get('/admin/overrides', isAdmin, async (req, res) => {
  try {
    const sb = require('../../core/supabase/supabaseAdmin').getSupabaseAdmin();
    const { batchName } = req.query;
    let query = sb.from('officer_xp_overrides').select('*').order('user_name', { ascending: true });
    if (batchName) query = query.eq('batch_name', batchName);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, overrides: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// PUT /api/xp/admin/overrides
// Body: { userId, userName, batchName, programId, xp, note }
router.put('/admin/overrides', isAdmin, async (req, res) => {
  try {
    const sb = require('../../core/supabase/supabaseAdmin').getSupabaseAdmin();
    const { userId, userName, batchName, programId, xp, note } = req.body || {};
    if (!userId || !batchName || xp === undefined) {
      return res.status(400).json({ success: false, error: 'userId, batchName, and xp are required' });
    }
    const { data, error } = await sb
      .from('officer_xp_overrides')
      .upsert({
        user_id: userId,
        user_name: userName || '',
        batch_name: batchName,
        program_id: programId || null,
        xp: Number(xp),
        note: note || null,
        updated_by: req.user?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,batch_name' })
      .select('*')
      .single();
    if (error) throw error;
    res.json({ success: true, override: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// DELETE /api/xp/admin/overrides/:id
router.delete('/admin/overrides/:id', isAdmin, async (req, res) => {
  try {
    const sb = require('../../core/supabase/supabaseAdmin').getSupabaseAdmin();
    const { error } = await sb.from('officer_xp_overrides').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
