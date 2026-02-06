const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const sheetsService = require('../integrations/sheets');

// Get all officers (admin only)
router.get('/', isAdmin, async (req, res) => {
  try {
    const officers = await sheetsService.getOfficers();
    res.json({ officers });
  } catch (error) {
    console.error('Error fetching officers:', error);
    res.status(500).json({ error: 'Failed to fetch officers' });
  }
});

// Get officer statistics (admin only)
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const officers = await sheetsService.getOfficers();
    const allEnquiries = await sheetsService.getAllEnquiries();

    const officerStats = officers.map(officer => {
      const officerEnquiries = allEnquiries.filter(
        e => e.assignedOfficer === officer.username
      );

      return {
        username: officer.username,
        name: officer.name,
        email: officer.email,
        totalEnquiries: officerEnquiries.length,
        new: officerEnquiries.filter(e => e.status === 'New').length,
        contacted: officerEnquiries.filter(e => e.status === 'Contacted').length,
        followUp: officerEnquiries.filter(e => e.status === 'Follow-up').length,
        registered: officerEnquiries.filter(e => e.status === 'Registered').length,
        closed: officerEnquiries.filter(e => e.status === 'Closed').length
      };
    });

    res.json({ officerStats });
  } catch (error) {
    console.error('Error fetching officer stats:', error);
    res.status(500).json({ error: 'Failed to fetch officer statistics' });
  }
});

module.exports = router;
