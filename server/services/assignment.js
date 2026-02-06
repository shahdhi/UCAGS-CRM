const sheetsService = require('../integrations/sheets');

// Round-robin assignment logic
let lastAssignedIndex = -1;

async function assignEnquiry(enquiry) {
  try {
    // Get list of officers
    const officers = await sheetsService.getOfficers();

    if (officers.length === 0) {
      console.warn('No officers available for assignment');
      return { assignedOfficer: '', success: false };
    }

    // Round-robin: assign to next officer
    lastAssignedIndex = (lastAssignedIndex + 1) % officers.length;
    const assignedOfficer = officers[lastAssignedIndex];

    // Update enquiry with assigned officer
    await sheetsService.updateEnquiry(enquiry.enquiryId, {
      assignedOfficer: assignedOfficer.username
    });

    // Copy to officer's sheet if sheetId exists
    if (assignedOfficer.sheetId) {
      try {
        await sheetsService.copyToOfficerSheet(assignedOfficer.sheetId, {
          ...enquiry,
          assignedOfficer: assignedOfficer.username
        });
      } catch (copyError) {
        console.error('Error copying to officer sheet:', copyError);
        // Continue even if copy fails
      }
    }

    console.log(`Assigned enquiry ${enquiry.enquiryId} to ${assignedOfficer.username}`);

    return {
      success: true,
      assignedOfficer: assignedOfficer.username,
      officerName: assignedOfficer.name
    };
  } catch (error) {
    console.error('Error assigning enquiry:', error);
    throw error;
  }
}

// Manual assignment (admin only)
async function manualAssignEnquiry(enquiryId, officerUsername) {
  try {
    const officers = await sheetsService.getOfficers();
    const officer = officers.find(o => o.username === officerUsername);

    if (!officer) {
      throw new Error('Officer not found');
    }

    const enquiry = await sheetsService.getEnquiryById(enquiryId);
    if (!enquiry) {
      throw new Error('Enquiry not found');
    }

    // Update enquiry
    await sheetsService.updateEnquiry(enquiryId, {
      assignedOfficer: officerUsername
    });

    // Copy to officer's sheet
    if (officer.sheetId) {
      await sheetsService.copyToOfficerSheet(officer.sheetId, {
        ...enquiry,
        assignedOfficer: officerUsername
      });
    }

    return {
      success: true,
      assignedOfficer: officerUsername
    };
  } catch (error) {
    console.error('Error in manual assignment:', error);
    throw error;
  }
}

module.exports = {
  assignEnquiry,
  manualAssignEnquiry
};
