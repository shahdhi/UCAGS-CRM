const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');

// Check if Twilio is configured
const twilioConfigured = process.env.TWILIO_ACCOUNT_SID && 
                         process.env.TWILIO_AUTH_TOKEN && 
                         process.env.TWILIO_PHONE_NUMBER &&
                         process.env.TWILIO_ACCOUNT_SID.startsWith('AC');

let twilioClient = null;

if (twilioConfigured) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log('Twilio client initialized successfully');
  } catch (error) {
    console.warn('Twilio initialization failed:', error.message);
  }
} else {
  console.log('Twilio not configured - call features will be limited');
}

// Get Twilio status
router.get('/status', isAuthenticated, (req, res) => {
  res.json({
    configured: twilioConfigured,
    enabled: twilioConfigured
  });
});

// Initiate call
router.post('/initiate', isAuthenticated, async (req, res) => {
  try {
    if (!twilioConfigured) {
      return res.status(503).json({ 
        error: 'Twilio integration is not configured' 
      });
    }

    const { to, enquiryId } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // This would initiate a call via Twilio
    // For now, we'll return a placeholder response
    // In production, you would use Twilio's API to make the call

    res.json({
      success: true,
      message: 'Call feature is available. Use tel: links for direct calling.',
      telLink: `tel:${to}`
    });
  } catch (error) {
    console.error('Error initiating call:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// Log call
router.post('/log', isAuthenticated, async (req, res) => {
  try {
    const { enquiryId, duration, notes } = req.body;

    // This would log the call details
    // For now, we'll just return success
    // In production, you might want to store this in a separate sheet

    res.json({
      success: true,
      message: 'Call logged successfully'
    });
  } catch (error) {
    console.error('Error logging call:', error);
    res.status(500).json({ error: 'Failed to log call' });
  }
});

module.exports = router;
