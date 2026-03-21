/**
 * Leads Routes
 * API endpoints for leads management
 */

const express = require('express');
const router = express.Router();
const leadsService = require('./leadsService');
const { getSpreadsheetInfo } = require('../../core/sheets/sheetsClient');
const { config } = require('../../core/config/environment');
const { isAdmin, isAuthenticated } = require('../../../server/middleware/auth');

/**
 * GET /api/leads
 * Get all leads with optional filters
 * ADMIN ONLY - Officers should use /api/user-leads
 */
router.get('/', isAdmin, async (req, res) => {
  try {
    const { status, search, batch } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (search) filters.search = search;
    if (batch) filters.batch = batch;

    const leads = await leadsService.getAllLeads(filters);
    
    res.json({
      success: true,
      count: leads.length,
      leads
    });
  } catch (error) {
    console.error('Error in GET /api/leads:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch leads'
    });
  }
});

/**
 * GET /api/leads/batches
 * Get all available batch sheets
 * ADMIN ONLY
 */
router.get('/batches', isAdmin, async (req, res) => {
  try {
    const spreadsheetId = config.sheets.sheetId || config.sheets.leadsSheetId;
    
    if (!spreadsheetId) {
      return res.json({
        success: true,
        batches: []
      });
    }

    const spreadsheetInfo = await getSpreadsheetInfo(spreadsheetId);
    const sheets = spreadsheetInfo.sheets || [];
    
    // Filter sheets that look like batches
    const batches = sheets
      .map(sheet => sheet.properties.title)
      .filter(title => title.startsWith('Batch') || title.toLowerCase().includes('batch'))
      .sort();
    
    res.json({
      success: true,
      batches
    });
  } catch (error) {
    console.error('Error in GET /api/leads/batches:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch batches'
    });
  }
});

/**
 * GET /api/leads/batches-all
 * Get all available batch sheets (read-only)
 * Admins + Officers (authenticated)
 */
router.get('/batches-all', isAuthenticated, async (req, res) => {
  try {
    const spreadsheetId = config.sheets.sheetId || config.sheets.leadsSheetId;

    if (!spreadsheetId) {
      return res.json({
        success: true,
        batches: []
      });
    }

    const spreadsheetInfo = await getSpreadsheetInfo(spreadsheetId);
    const sheets = spreadsheetInfo.sheets || [];

    const batches = sheets
      .map(sheet => sheet.properties.title)
      .filter(title => title && (title.startsWith('Batch') || title.toLowerCase().includes('batch')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    res.json({ success: true, batches });
  } catch (error) {
    console.error('Error in GET /api/leads/batches-all:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch batches'
    });
  }
});

/**
 * GET /api/leads/stats
 * Get leads statistics
 * ADMIN ONLY
 */
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const stats = await leadsService.getLeadsStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error in GET /api/leads/stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch leads statistics'
    });
  }
});

/**
 * GET /api/leads/:id
 * Get a specific lead by ID
 * ADMIN ONLY
 */
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const leadId = req.params.id;
    const lead = await leadsService.getLeadById(leadId);
    
    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      lead
    });
  } catch (error) {
    console.error('Error in GET /api/leads/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch lead'
    });
  }
});

/**
 * POST /api/leads
 * Create a new lead
 * ADMIN ONLY
 */
router.post('/', isAdmin, async (req, res) => {
  try {
    const leadData = req.body;
    
    console.log('Creating new lead:', leadData);
    
    const newLead = await leadsService.addLead(leadData);
    
    res.json({
      success: true,
      message: 'Lead created successfully',
      lead: newLead
    });
  } catch (error) {
    console.error('Error in POST /api/leads:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create lead'
    });
  }
});

/**
 * PUT /api/leads/:id
 * Update a specific lead
 * ADMIN ONLY
 */
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const leadId = req.params.id;
    const updates = req.body;
    const batch = req.query.batch; // Get batch from query params
    
    console.log(`Updating lead ${leadId} with:`, updates);
    console.log(`Batch context:`, batch);
    
    const updatedLead = await leadsService.updateLead(leadId, updates, batch);
    
    res.json({
      success: true,
      message: 'Lead updated successfully',
      lead: updatedLead
    });
  } catch (error) {
    console.error('Error in PUT /api/leads/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update lead'
    });
  }
});

/**
 * DELETE /api/leads/:id
 * Delete a specific lead
 * ADMIN ONLY
 */
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const leadId = req.params.id;
    
    console.log(`Deleting lead ${leadId}`);
    
    const result = await leadsService.deleteLead(leadId);
    
    res.json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /api/leads/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete lead'
    });
  }
});

module.exports = router;
