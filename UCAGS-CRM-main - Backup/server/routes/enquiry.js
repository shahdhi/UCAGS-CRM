const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin, isAdminOrOfficer } = require('../middleware/auth');
const sheetsService = require('../integrations/sheets');
const assignmentService = require('../services/assignment');
const emailService = require('../integrations/email');

// Get all enquiries (Admin) or officer's enquiries (Officer)
router.get('/', isAuthenticated, async (req, res) => {
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

    // Apply filters if provided
    const { status, search, dateFrom, dateTo } = req.query;
    
    let filtered = enquiries;

    if (status) {
      filtered = filtered.filter(e => e.status === status);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(e => 
        e.fullName.toLowerCase().includes(searchLower) ||
        e.email.toLowerCase().includes(searchLower) ||
        e.phone.includes(searchLower) ||
        e.course.toLowerCase().includes(searchLower)
      );
    }

    if (dateFrom) {
      filtered = filtered.filter(e => new Date(e.createdDate) >= new Date(dateFrom));
    }

    if (dateTo) {
      filtered = filtered.filter(e => new Date(e.createdDate) <= new Date(dateTo));
    }

    res.json({ enquiries: filtered });
  } catch (error) {
    console.error('Error fetching enquiries:', error);
    res.status(500).json({ error: 'Failed to fetch enquiries' });
  }
});

// Get single enquiry by ID
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const enquiry = await sheetsService.getEnquiryById(req.params.id);
    
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    // Check if officer is authorized to view this enquiry
    if (req.session.user.role === 'officer' && 
        enquiry.assignedOfficer !== req.session.user.username) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ enquiry });
  } catch (error) {
    console.error('Error fetching enquiry:', error);
    res.status(500).json({ error: 'Failed to fetch enquiry' });
  }
});

// Create new enquiry (Public endpoint for form submissions)
router.post('/', async (req, res) => {
  try {
    const { fullName, phone, email, course, source, notes } = req.body;

    // Validation
    if (!fullName || !email) {
      return res.status(400).json({ error: 'Full name and email are required' });
    }

    // Create enquiry
    const enquiryData = {
      fullName,
      phone,
      email,
      course,
      source: source || 'Website',
      status: 'New',
      notes
    };

    const newEnquiry = await sheetsService.addEnquiry(enquiryData);

    // Auto-assign to officer
    const assignment = await assignmentService.assignEnquiry(newEnquiry);

    // Send acknowledgement email
    try {
      await emailService.sendAcknowledgement(email, fullName);
    } catch (emailError) {
      console.error('Failed to send acknowledgement email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      enquiry: {
        ...newEnquiry,
        assignedOfficer: assignment.assignedOfficer
      },
      message: 'Enquiry submitted successfully'
    });
  } catch (error) {
    console.error('Error creating enquiry:', error);
    res.status(500).json({ error: 'Failed to create enquiry' });
  }
});

// Update enquiry
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const enquiryId = req.params.id;
    const updates = req.body;

    // Check authorization
    const existingEnquiry = await sheetsService.getEnquiryById(enquiryId);
    if (!existingEnquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    if (req.session.user.role === 'officer' && 
        existingEnquiry.assignedOfficer !== req.session.user.username) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update enquiry
    await sheetsService.updateEnquiry(enquiryId, updates);

    res.json({
      success: true,
      message: 'Enquiry updated successfully'
    });
  } catch (error) {
    console.error('Error updating enquiry:', error);
    res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

// Add note to enquiry
router.post('/:id/notes', isAuthenticated, async (req, res) => {
  try {
    const enquiryId = req.params.id;
    const { note } = req.body;

    if (!note) {
      return res.status(400).json({ error: 'Note is required' });
    }

    const existingEnquiry = await sheetsService.getEnquiryById(enquiryId);
    if (!existingEnquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    // Check authorization
    if (req.session.user.role === 'officer' && 
        existingEnquiry.assignedOfficer !== req.session.user.username) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const timestamp = new Date().toISOString();
    const newNote = `[${timestamp}] ${req.session.user.name}: ${note}`;
    const updatedNotes = existingEnquiry.notes ? 
      `${existingEnquiry.notes}\n${newNote}` : newNote;

    await sheetsService.updateEnquiry(enquiryId, { notes: updatedNotes });

    res.json({
      success: true,
      message: 'Note added successfully'
    });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

module.exports = router;
