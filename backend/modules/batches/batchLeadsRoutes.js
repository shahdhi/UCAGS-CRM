/**
 * Batch Leads Routes
 *
 * Admin: manage leads inside a batch's admin spreadsheet.
 * Officer: read leads assigned to them for a batch.
 */

const express = require('express');
const router = express.Router();

const { isAdmin, isAuthenticated } = require('../../../server/middleware/auth');
const svc = require('./batchLeadsService');

// List all batches for both roles (read-only for officers)
const { listBatches } = require('../../core/batches/batchesStore');
const sheetsSvc = require('./batchSheetsService');

router.get('/batches', isAuthenticated, async (req, res) => {
  try {
    const batches = await listBatches();
    res.json({ success: true, batches });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Admin: get leads in a batch
// List sheets for a batch (admin + officers)
router.get('/:batchName/sheets', isAuthenticated, async (req, res) => {
  try {
    const sheets = await sheetsSvc.listSheetsForBatch(req.params.batchName);
    res.json({ success: true, sheets });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Create a new sheet/tab for a batch (admin only). Propagates to all officer spreadsheets.
router.post('/:batchName/sheets', isAdmin, async (req, res) => {
  try {
    const { sheetName } = req.body || {};
    await sheetsSvc.createSheetForBatch(req.params.batchName, sheetName);
    const sheets = await sheetsSvc.listSheetsForBatch(req.params.batchName);
    res.status(201).json({ success: true, sheets });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

router.get('/:batchName/leads', isAdmin, async (req, res) => {
  try {
    const sheet = req.query.sheet || 'Main Leads';
    const leads = await svc.getBatchLeads(req.params.batchName, sheet);
    res.json({ success: true, count: leads.length, leads });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: update lead in a batch (assignment handled here)
router.put('/:batchName/leads/:leadId', isAdmin, async (req, res) => {
  try {
    const sheet = req.query.sheet || 'Main Leads';
    const lead = await svc.updateBatchLead(req.params.batchName, sheet, req.params.leadId, req.body || {});
    res.json({ success: true, lead });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Officer: get leads for me in a batch
router.get('/:batchName/my-leads', isAuthenticated, async (req, res) => {
  try {
    const officerName = req.user?.name;
    const sheet = req.query.sheet || 'Main Leads';
    const leads = await svc.getOfficerBatchLeads(req.params.batchName, sheet, officerName);
    res.json({ success: true, count: leads.length, leads });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
