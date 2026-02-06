/**
 * User Leads Routes
 * API endpoints for user-specific leads
 */

const express = require('express');
const router = express.Router();
const { getUserLeads, addUserLead, getAllUsersLeads } = require('./userLeadsService');
const { isAuthenticated } = require('../../../server/middleware/auth');

/**
 * GET /api/user-leads/:userName
 * Get leads for a specific user
 * User can only access their own leads
 */
router.get('/:userName', isAuthenticated, async (req, res) => {
  try {
    const { userName } = req.params;
    
    if (!userName) {
      return res.status(400).json({
        success: false,
        error: 'User name is required'
      });
    }

    const leads = await getUserLeads(userName);

    res.json({
      success: true,
      leads: leads,
      count: leads.length,
      user: userName
    });
  } catch (error) {
    console.error('Error fetching user leads:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch user leads'
    });
  }
});

/**
 * POST /api/user-leads/:userName
 * Add a lead to a user's sheet
 * User can only add to their own leads
 */
router.post('/:userName', isAuthenticated, async (req, res) => {
  try {
    const { userName } = req.params;
    const leadData = req.body;

    if (!userName) {
      return res.status(400).json({
        success: false,
        error: 'User name is required'
      });
    }

    const lead = await addUserLead(userName, leadData);

    res.status(201).json({
      success: true,
      message: 'Lead added successfully',
      lead: lead
    });
  } catch (error) {
    console.error('Error adding user lead:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add user lead'
    });
  }
});

/**
 * GET /api/user-leads
 * Get all users' leads (admin only)
 */
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const usersLeads = await getAllUsersLeads();

    res.json({
      success: true,
      data: usersLeads
    });
  } catch (error) {
    console.error('Error fetching all users leads:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch all users leads'
    });
  }
});

module.exports = router;
