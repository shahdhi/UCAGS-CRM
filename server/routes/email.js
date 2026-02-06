const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const emailService = require('../integrations/email');
const sheetsService = require('../integrations/sheets');

// Send acknowledgement email
router.post('/acknowledgement', isAuthenticated, async (req, res) => {
  try {
    const { enquiryId } = req.body;
    
    const enquiry = await sheetsService.getEnquiryById(enquiryId);
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    await emailService.sendAcknowledgement(enquiry.email, enquiry.fullName);
    
    res.json({
      success: true,
      message: 'Acknowledgement email sent successfully'
    });
  } catch (error) {
    console.error('Error sending acknowledgement:', error);
    res.status(500).json({ error: 'Failed to send acknowledgement email' });
  }
});

// Send follow-up email
router.post('/follow-up', isAuthenticated, async (req, res) => {
  try {
    const { enquiryId } = req.body;
    
    const enquiry = await sheetsService.getEnquiryById(enquiryId);
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    const officerName = req.session.user.name;
    await emailService.sendFollowUp(
      enquiry.email,
      enquiry.fullName,
      enquiry.course,
      officerName
    );
    
    res.json({
      success: true,
      message: 'Follow-up email sent successfully'
    });
  } catch (error) {
    console.error('Error sending follow-up:', error);
    res.status(500).json({ error: 'Failed to send follow-up email' });
  }
});

// Send registration email
router.post('/registration', isAuthenticated, async (req, res) => {
  try {
    const { enquiryId } = req.body;
    
    const enquiry = await sheetsService.getEnquiryById(enquiryId);
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    await emailService.sendRegistrationInfo(
      enquiry.email,
      enquiry.fullName,
      enquiry.course
    );
    
    res.json({
      success: true,
      message: 'Registration email sent successfully'
    });
  } catch (error) {
    console.error('Error sending registration email:', error);
    res.status(500).json({ error: 'Failed to send registration email' });
  }
});

// Send custom email
router.post('/custom', isAuthenticated, async (req, res) => {
  try {
    const { enquiryId, subject, message } = req.body;
    
    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    const enquiry = await sheetsService.getEnquiryById(enquiryId);
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    await emailService.sendCustomEmail(enquiry.email, subject, message);
    
    res.json({
      success: true,
      message: 'Email sent successfully'
    });
  } catch (error) {
    console.error('Error sending custom email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
