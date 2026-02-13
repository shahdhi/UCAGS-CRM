/**
 * Batch Sync Routes
 * Manual sync: Google Sheets (per-batch main spreadsheet) → Supabase
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated, isAdmin } = require('../../../server/middleware/auth');
const { syncBatchToSupabase } = require('./batchSyncService');
const { syncAssignmentsToSheets } = require('./batchAssignmentSyncService');

// POST /api/batches/:batchName/sync
// One-click sync:
//  1) Google Sheets → Supabase (intake fields only; does NOT overwrite operational fields)
//  2) Supabase → Google Sheets (assigned_to only)
router.post('/:batchName/sync', isAdmin, async (req, res) => {
  try {
    const sheetNames = Array.isArray(req.body?.sheetNames) ? req.body.sheetNames : undefined;

    const pull = await syncBatchToSupabase(req.params.batchName, { sheetNames });
    const push = await syncAssignmentsToSheets(req.params.batchName, { sheetNames });

    res.json({
      success: true,
      batchName: req.params.batchName,
      sheetsToSupabase: pull,
      supabaseToSheets: push
    });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/batches/:batchName/sync-assignments
// Push assignment from Supabase → Google Sheets (clears cell if Supabase has blank)
router.post('/:batchName/sync-assignments', isAdmin, async (req, res) => {
  try {
    const sheetNames = Array.isArray(req.body?.sheetNames) ? req.body.sheetNames : undefined;
    const result = await syncAssignmentsToSheets(req.params.batchName, { sheetNames });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// DELETE /api/batches/:batchName/leads - Delete all leads for a batch from Supabase
router.delete('/:batchName/leads', isAdmin, async (req, res) => {
  try {
    const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
    const sb = getSupabaseAdmin();
    
    const { count, error } = await sb
      .from('crm_leads')
      .delete()
      .eq('batch_name', req.params.batchName)
      .select('id');
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: `Deleted ${count?.length || 0} leads from Supabase for batch "${req.params.batchName}"`,
      deletedCount: count?.length || 0
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
