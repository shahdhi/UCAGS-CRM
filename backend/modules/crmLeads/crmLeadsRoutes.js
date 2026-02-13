/**
 * CRM Leads Routes (Supabase)
 *
 * Fast endpoints for officers to read and update lead management fields.
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated, isAdmin } = require('../../../server/middleware/auth');
const svc = require('./crmLeadsService');

// GET /api/crm-leads/admin?batch=...&sheet=...&search=...&status=...
// Lists all leads for admin (no officer filter)
// SECURITY: Must be admin-only; otherwise officers can see all leads.
router.get('/admin', isAdmin, async (req, res) => {
  try {
    const batchName = req.query.batch;
    const sheetName = req.query.sheet;
    const search = req.query.search;
    const status = req.query.status;

    const leads = await svc.listAdminLeads({ batchName, sheetName, search, status });
    res.json({ success: true, count: leads.length, leads });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/crm-leads/my?batch=...&sheet=...&search=...&status=...
router.get('/my', isAuthenticated, async (req, res) => {
  try {
    const officerName = req.user?.name;
    const batchName = req.query.batch;
    const sheetName = req.query.sheet;
    const search = req.query.search;
    const status = req.query.status;

    const leads = await svc.listMyLeads({ officerName, batchName, sheetName, search, status });
    res.json({ success: true, count: leads.length, leads });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// PUT /api/crm-leads/my/:batchName/:sheetName/:leadId
router.put('/my/:batchName/:sheetName/:leadId', isAuthenticated, async (req, res) => {
  try {
    const officerName = req.user?.name;
    const { batchName, sheetName, leadId } = req.params;
    const lead = await svc.updateMyLeadManagement({
      officerName,
      batchName,
      sheetName,
      sheetLeadId: leadId,
      updates: req.body || {}
    });

    res.json({ success: true, lead });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// PUT /api/crm-leads/admin/:batchName/:sheetName/:leadId (Admin can update any lead)
// SECURITY: Must be admin-only; otherwise officers can update any lead.
router.put('/admin/:batchName/:sheetName/:leadId', isAdmin, async (req, res) => {
  try {
    const { batchName, sheetName, leadId } = req.params;
    const lead = await svc.updateAdminLead({
      batchName,
      sheetName,
      sheetLeadId: leadId,
      updates: req.body || {}
    });

    res.json({ success: true, lead });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
