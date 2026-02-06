const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const sheetsService = require('../integrations/sheets');

// Get all leads from spreadsheet
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    let leads;

    // Get leads from dedicated leads spreadsheet
    // Both admin and officers see the same leads from the central leads sheet
    if (user.role === 'admin' || user.role === 'officer') {
      leads = await sheetsService.getAllLeads();
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Apply filters if provided
    const { status, search } = req.query;
    
    let filtered = leads;

    if (status) {
      filtered = filtered.filter(lead => lead.status === status);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(lead => 
        (lead.fullName && lead.fullName.toLowerCase().includes(searchLower)) ||
        (lead.email && lead.email.toLowerCase().includes(searchLower)) ||
        (lead.phone && lead.phone.includes(searchLower)) ||
        (lead.course && lead.course.toLowerCase().includes(searchLower))
      );
    }

    res.json({ leads: filtered });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

module.exports = router;
