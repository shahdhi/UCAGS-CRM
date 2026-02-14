/**
 * CRM Leads Routes (Supabase)
 *
 * Fast endpoints for officers to read and update lead management fields.
 */

const express = require('express');
const router = express.Router();

const { isAuthenticated, isAdmin } = require('../../../server/middleware/auth');
const svc = require('./crmLeadsService');

// Admin meta: list batches for an officer
// GET /api/crm-leads/admin/meta/batches?assignedTo=OfficerName
router.get('/admin/meta/batches', isAdmin, async (req, res) => {
  try {
    const assignedTo = req.query.assignedTo || req.query.officer;
    const batches = await svc.listAdminBatches({ assignedTo });
    res.json({ success: true, batches });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin meta: list sheets for an officer (optionally filtered by batch)
// GET /api/crm-leads/admin/meta/sheets?assignedTo=OfficerName&batch=Batch-14
router.get('/admin/meta/sheets', isAdmin, async (req, res) => {
  try {
    const assignedTo = req.query.assignedTo || req.query.officer;
    const batchName = req.query.batch;
    const sheets = await svc.listAdminSheets({ assignedTo, batchName });
    res.json({ success: true, sheets });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/crm-leads/admin?batch=...&sheet=...&search=...&status=...
// Lists all leads for admin (supports officer filter via assignedTo)
// SECURITY: Must be admin-only; otherwise officers can see all leads.
router.get('/admin', isAdmin, async (req, res) => {
  try {
    const batchName = req.query.batch;
    const sheetName = req.query.sheet;
    const search = req.query.search;
    const status = req.query.status;
    const assignedTo = req.query.assignedTo || req.query.officer;

    const leads = await svc.listAdminLeads({ batchName, sheetName, search, status, assignedTo });
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
      officerUserId: req.user?.id,
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

// POST /api/crm-leads/admin/create
// Body: { batchName, sheetName, lead: { name,email,phone,course,source,status,priority,assignedTo,notes } }
router.post('/admin/create', isAdmin, async (req, res) => {
  try {
    const { batchName, sheetName, lead } = req.body || {};
    const created = await svc.createAdminLead({ batchName, sheetName, lead: lead || {} });
    res.status(201).json({ success: true, lead: created });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/crm-leads/my/create
// Officer can create a lead into a batch/sheet, assigned to themselves.
// Body: { batchName, sheetName, lead: { name,email,phone,course,source,status,priority,notes } }
router.post('/my/create', isAuthenticated, async (req, res) => {
  try {
    const officerName = req.user?.name;
    const { batchName, sheetName, lead } = req.body || {};
    const created = await svc.createOfficerLead({ officerName, batchName, sheetName, lead: lead || {} });
    res.status(201).json({ success: true, lead: created });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/crm-leads/admin/distribute-unassigned
// Body: { batchName, sheetName, officers:[] }
router.post('/admin/distribute-unassigned', isAdmin, async (req, res) => {
  try {
    const { batchName, sheetName, officers } = req.body || {};
    const result = await svc.distributeUnassignedAdmin({ batchName, sheetName, officers });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/crm-leads/admin/bulk-assign
// Body: { batchName, sheetName, leadIds:[], assignedTo }
router.post('/admin/bulk-assign', isAdmin, async (req, res) => {
  try {
    const { batchName, sheetName, leadIds, assignedTo } = req.body || {};
    const result = await svc.bulkAssignAdmin({ batchName, sheetName, leadIds, assignedTo });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/crm-leads/admin/bulk-distribute
// Body: { batchName, sheetName, leadIds:[], officers:[] }
router.post('/admin/bulk-distribute', isAdmin, async (req, res) => {
  try {
    const { batchName, sheetName, leadIds, officers } = req.body || {};
    const result = await svc.bulkDistributeAdmin({ batchName, sheetName, leadIds, officers });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/crm-leads/admin/bulk-delete
// Body: { batchName, sheetName, leadIds:[] }
router.post('/admin/bulk-delete', isAdmin, async (req, res) => {
  try {
    const { batchName, sheetName, leadIds } = req.body || {};
    const result = await svc.bulkDeleteAdmin({ batchName, sheetName, leadIds });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// GET /api/crm-leads/admin/export.csv?batch=...&sheet=...&status=...&search=...
router.get('/admin/export.csv', isAdmin, async (req, res) => {
  try {
    const batchName = req.query.batch;
    const sheetName = req.query.sheet;
    const search = req.query.search;
    const status = req.query.status;

    const csv = await svc.exportAdminCsv({ batchName, sheetName, search, status });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
    res.send(csv);
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/crm-leads/admin/import
// Body: { batchName, sheetName, csvText }
router.post('/admin/import', isAdmin, async (req, res) => {
  try {
    const { batchName, sheetName, csvText } = req.body || {};
    const result = await svc.importAdminCsv({ batchName, sheetName, csvText });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
