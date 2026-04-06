/**
 * XP Routes
 *
 * GET /api/xp/leaderboard         — all officers ranked by XP (admin + officer)
 * GET /api/xp/me                  — personal XP summary + recent events
 * GET /api/xp/trend               — XP trend over time (personal)
 * GET /api/xp/global-trend        — XP trend for all officers combined (admin)
 * POST /api/xp/cron/overdue       — trigger overdue followup penalty (admin / cron)
 * GET /api/xp/archives            — list past batch XP archives (admin)
 * POST /api/xp/admin/reset        — manually trigger XP archive+reset for a program/batch (admin)
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated, isAdmin, isAdminOrOfficer } = require('../../../server/middleware/auth');
const xpSvc = require('./xpService');
const xpArchiveSvc = require('./xpArchiveService');

// GET /api/xp/leaderboard — migrated to Supabase Edge Function (crm-xp/leaderboard)
// Kept here as a redirect/fallback for any non-updated clients.
router.get('/leaderboard', isAdminOrOfficer, async (req, res) => {
  res.json({
    success: true,
    leaderboard: [],
    _note: 'Migrated to Supabase Edge Function: /functions/v1/crm-xp/leaderboard'
  });
});

// GET /api/xp/me — migrated to Supabase Edge Function (crm-xp/me)
// Kept here as a redirect/fallback for any non-updated clients.
router.get('/me', isAuthenticated, async (req, res) => {
  res.json({
    success: true,
    totalXp: 0,
    rank: null,
    totalOfficers: 0,
    leaderboard: [],
    recentEvents: [],
    _note: 'Migrated to Supabase Edge Function: /functions/v1/crm-xp/me'
  });
});

// GET /api/xp/trend — migrated to Supabase Edge Function (crm-xp/trend)
router.get('/trend', isAuthenticated, (req, res) => {
  res.json({ success: true, trend: [], _note: 'Migrated to Supabase Edge Function: /functions/v1/crm-xp/trend' });
});

// GET /api/xp/global-trend — migrated to Supabase Edge Function (crm-xp/global-trend)
router.get('/global-trend', isAdmin, (req, res) => {
  res.json({ success: true, trend: [], _note: 'Migrated to Supabase Edge Function: /functions/v1/crm-xp/global-trend' });
});

// POST /api/xp/cron/overdue  — manually trigger or called by cron
router.post('/cron/overdue', isAdmin, async (req, res) => {
  try {
    const result = await xpSvc.penaliseOverdueFollowups();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/xp/archives?programId=&batchName=  — list past batch XP archives (admin)
router.get('/archives', isAdmin, async (req, res) => {
  try {
    const programId = req.query.programId || null;
    const batchName = req.query.batchName || null;
    const archives = await xpArchiveSvc.getXPArchives({ programId, batchName });
    res.json({ success: true, archives });
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
// Returns all override rows for a given batch
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
// Upsert XP for a single officer+batch. Body: { userId, userName, batchName, programId, xp, note }
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
