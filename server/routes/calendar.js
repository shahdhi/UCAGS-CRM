const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const calendarService = require('../integrations/calendar');
const sheetsService = require('../integrations/sheets');

// Create follow-up event
router.post('/follow-up', isAuthenticated, async (req, res) => {
  try {
    const { enquiryId, followUpDate, notes } = req.body;
    
    if (!followUpDate) {
      return res.status(400).json({ error: 'Follow-up date is required' });
    }

    const enquiry = await sheetsService.getEnquiryById(enquiryId);
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    // Update enquiry with follow-up date
    await sheetsService.updateEnquiry(enquiryId, { followUpDate });

    // Create calendar event
    const result = await calendarService.createFollowUpEvent(enquiry, followUpDate, notes);
    
    res.json({
      success: true,
      message: 'Follow-up scheduled successfully',
      eventId: result.eventId,
      eventLink: result.eventLink
    });
  } catch (error) {
    console.error('Error creating follow-up:', error);
    res.status(500).json({ error: 'Failed to create follow-up event' });
  }
});

// Get upcoming follow-ups
router.get('/upcoming', isAuthenticated, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const events = await calendarService.getUpcomingFollowUps(days);
    
    res.json({ events });
  } catch (error) {
    console.error('Error fetching upcoming follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming follow-ups' });
  }
});

module.exports = router;
