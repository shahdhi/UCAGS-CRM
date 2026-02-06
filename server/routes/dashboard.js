const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const sheetsService = require('../integrations/sheets');

// Get dashboard statistics
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    let enquiries;

    if (user.role === 'admin') {
      enquiries = await sheetsService.getAllEnquiries();
    } else if (user.role === 'officer' && user.sheetId) {
      enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate statistics
    const stats = {
      total: enquiries.length,
      new: enquiries.filter(e => e.status === 'New').length,
      contacted: enquiries.filter(e => e.status === 'Contacted').length,
      followUp: enquiries.filter(e => e.status === 'Follow-up').length,
      registered: enquiries.filter(e => e.status === 'Registered').length,
      closed: enquiries.filter(e => e.status === 'Closed').length
    };

    // Status distribution
    const statusDistribution = {
      'New': stats.new,
      'Contacted': stats.contacted,
      'Follow-up': stats.followUp,
      'Registered': stats.registered,
      'Closed': stats.closed
    };

    // Source distribution
    const sourceDistribution = {};
    enquiries.forEach(e => {
      const source = e.source || 'Unknown';
      sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
    });

    // Recent enquiries (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentEnquiries = enquiries.filter(e => 
      new Date(e.createdDate) >= sevenDaysAgo
    );

    // Upcoming follow-ups (next 7 days)
    const now = new Date();
    const sevenDaysAhead = new Date();
    sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
    const upcomingFollowUps = enquiries.filter(e => {
      if (!e.followUpDate) return false;
      const followUpDate = new Date(e.followUpDate);
      return followUpDate >= now && followUpDate <= sevenDaysAhead;
    });

    // Officer distribution (admin only)
    let officerStats = null;
    if (user.role === 'admin') {
      officerStats = {};
      enquiries.forEach(e => {
        const officer = e.assignedOfficer || 'Unassigned';
        if (!officerStats[officer]) {
          officerStats[officer] = {
            total: 0,
            new: 0,
            contacted: 0,
            followUp: 0,
            registered: 0,
            closed: 0
          };
        }
        officerStats[officer].total++;
        officerStats[officer][e.status.toLowerCase().replace('-', '')] = 
          (officerStats[officer][e.status.toLowerCase().replace('-', '')] || 0) + 1;
      });
    }

    res.json({
      stats,
      statusDistribution,
      sourceDistribution,
      recentCount: recentEnquiries.length,
      upcomingFollowUps: upcomingFollowUps.length,
      officerStats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Get recent enquiries
router.get('/recent', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    const limit = parseInt(req.query.limit) || 10;
    let enquiries;

    if (user.role === 'admin') {
      enquiries = await sheetsService.getAllEnquiries();
    } else if (user.role === 'officer' && user.sheetId) {
      enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Sort by creation date (most recent first)
    enquiries.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

    res.json({
      enquiries: enquiries.slice(0, limit)
    });
  } catch (error) {
    console.error('Error fetching recent enquiries:', error);
    res.status(500).json({ error: 'Failed to fetch recent enquiries' });
  }
});

// Get upcoming follow-ups
router.get('/follow-ups', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    let enquiries;

    if (user.role === 'admin') {
      enquiries = await sheetsService.getAllEnquiries();
    } else if (user.role === 'officer' && user.sheetId) {
      enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Filter enquiries with follow-up dates
    const now = new Date();
    const followUps = enquiries
      .filter(e => e.followUpDate)
      .map(e => ({
        ...e,
        followUpDate: new Date(e.followUpDate)
      }))
      .sort((a, b) => a.followUpDate - b.followUpDate);

    // Separate overdue and upcoming
    const overdue = followUps.filter(e => e.followUpDate < now);
    const upcoming = followUps.filter(e => e.followUpDate >= now);

    res.json({
      overdue,
      upcoming
    });
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

module.exports = router;
