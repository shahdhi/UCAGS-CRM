const { getSheetsClient } = require('../config/google');
const { v4: uuidv4 } = require('uuid');

// Admin Sheet columns
const ADMIN_COLUMNS = {
  ENQUIRY_ID: 0,
  FULL_NAME: 1,
  PHONE: 2,
  EMAIL: 3,
  COURSE: 4,
  SOURCE: 5,
  ASSIGNED_OFFICER: 6,
  STATUS: 7,
  FOLLOW_UP_DATE: 8,
  NOTES: 9,
  CREATED_DATE: 10
};

// Get all enquiries from Admin sheet
async function getAllEnquiries() {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.ADMIN_SHEET_ID,
      range: `${process.env.ADMIN_SHEET_NAME || 'Admin'}!A2:K10000`,
    });

    const rows = response.data.values || [];
    return rows.map(row => ({
      enquiryId: row[ADMIN_COLUMNS.ENQUIRY_ID] || '',
      fullName: row[ADMIN_COLUMNS.FULL_NAME] || '',
      phone: row[ADMIN_COLUMNS.PHONE] || '',
      email: row[ADMIN_COLUMNS.EMAIL] || '',
      course: row[ADMIN_COLUMNS.COURSE] || '',
      source: row[ADMIN_COLUMNS.SOURCE] || '',
      assignedOfficer: row[ADMIN_COLUMNS.ASSIGNED_OFFICER] || '',
      status: row[ADMIN_COLUMNS.STATUS] || 'New',
      followUpDate: row[ADMIN_COLUMNS.FOLLOW_UP_DATE] || '',
      notes: row[ADMIN_COLUMNS.NOTES] || '',
      createdDate: row[ADMIN_COLUMNS.CREATED_DATE] || ''
    }));
  } catch (error) {
    console.error('Error getting enquiries:', error);
    throw error;
  }
}

// Get enquiry by ID
async function getEnquiryById(enquiryId) {
  const enquiries = await getAllEnquiries();
  return enquiries.find(e => e.enquiryId === enquiryId);
}

// Add new enquiry to Admin sheet
async function addEnquiry(enquiryData) {
  try {
    const sheets = await getSheetsClient();
    const enquiryId = uuidv4().split('-')[0]; // Short UUID
    const createdDate = new Date().toISOString();

    const row = [
      enquiryId,
      enquiryData.fullName || '',
      enquiryData.phone || '',
      enquiryData.email || '',
      enquiryData.course || '',
      enquiryData.source || 'Website',
      enquiryData.assignedOfficer || '',
      enquiryData.status || 'New',
      enquiryData.followUpDate || '',
      enquiryData.notes || '',
      createdDate
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.ADMIN_SHEET_ID,
      range: `${process.env.ADMIN_SHEET_NAME || 'Admin'}!A:K`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [row]
      }
    });

    return {
      enquiryId,
      ...enquiryData,
      createdDate
    };
  } catch (error) {
    console.error('Error adding enquiry:', error);
    throw error;
  }
}

// Update enquiry in Admin sheet
async function updateEnquiry(enquiryId, updates) {
  try {
    const sheets = await getSheetsClient();
    
    // Find the row with this enquiry ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.ADMIN_SHEET_ID,
      range: `${process.env.ADMIN_SHEET_NAME || 'Admin'}!A2:K10000`,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[ADMIN_COLUMNS.ENQUIRY_ID] === enquiryId);

    if (rowIndex === -1) {
      throw new Error('Enquiry not found');
    }

    const actualRowNumber = rowIndex + 2; // +2 because array is 0-indexed and sheet has header
    const currentRow = rows[rowIndex];

    // Build updated row
    const updatedRow = [
      currentRow[ADMIN_COLUMNS.ENQUIRY_ID],
      updates.fullName !== undefined ? updates.fullName : currentRow[ADMIN_COLUMNS.FULL_NAME],
      updates.phone !== undefined ? updates.phone : currentRow[ADMIN_COLUMNS.PHONE],
      updates.email !== undefined ? updates.email : currentRow[ADMIN_COLUMNS.EMAIL],
      updates.course !== undefined ? updates.course : currentRow[ADMIN_COLUMNS.COURSE],
      updates.source !== undefined ? updates.source : currentRow[ADMIN_COLUMNS.SOURCE],
      updates.assignedOfficer !== undefined ? updates.assignedOfficer : currentRow[ADMIN_COLUMNS.ASSIGNED_OFFICER],
      updates.status !== undefined ? updates.status : currentRow[ADMIN_COLUMNS.STATUS],
      updates.followUpDate !== undefined ? updates.followUpDate : currentRow[ADMIN_COLUMNS.FOLLOW_UP_DATE],
      updates.notes !== undefined ? updates.notes : currentRow[ADMIN_COLUMNS.NOTES],
      currentRow[ADMIN_COLUMNS.CREATED_DATE]
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.ADMIN_SHEET_ID,
      range: `${process.env.ADMIN_SHEET_NAME || 'Admin'}!A${actualRowNumber}:K${actualRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [updatedRow]
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating enquiry:', error);
    throw error;
  }
}

// Copy enquiry to officer's sheet
async function copyToOfficerSheet(officerSheetId, enquiryData) {
  try {
    const sheets = await getSheetsClient();
    
    const row = [
      enquiryData.enquiryId || '',
      enquiryData.fullName || '',
      enquiryData.phone || '',
      enquiryData.email || '',
      enquiryData.course || '',
      enquiryData.source || '',
      enquiryData.assignedOfficer || '',
      enquiryData.status || 'New',
      enquiryData.followUpDate || '',
      enquiryData.notes || '',
      enquiryData.createdDate || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: officerSheetId,
      range: 'A:K',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [row]
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Error copying to officer sheet:', error);
    throw error;
  }
}

// Get officers list from Officers sheet
async function getOfficers() {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.ADMIN_SHEET_ID,
      range: 'Officers!A2:E100',
    });

    const rows = response.data.values || [];
    return rows.map(row => ({
      username: row[0] || '',
      name: row[2] || row[0] || '',
      email: row[3] || '',
      sheetId: row[4] || ''
    }));
  } catch (error) {
    console.error('Error getting officers:', error);
    throw error;
  }
}

// Get enquiries for specific officer
async function getOfficerEnquiries(officerSheetId) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: officerSheetId,
      range: 'A2:K10000',
    });

    const rows = response.data.values || [];
    return rows.map(row => ({
      enquiryId: row[ADMIN_COLUMNS.ENQUIRY_ID] || '',
      fullName: row[ADMIN_COLUMNS.FULL_NAME] || '',
      phone: row[ADMIN_COLUMNS.PHONE] || '',
      email: row[ADMIN_COLUMNS.EMAIL] || '',
      course: row[ADMIN_COLUMNS.COURSE] || '',
      source: row[ADMIN_COLUMNS.SOURCE] || '',
      assignedOfficer: row[ADMIN_COLUMNS.ASSIGNED_OFFICER] || '',
      status: row[ADMIN_COLUMNS.STATUS] || 'New',
      followUpDate: row[ADMIN_COLUMNS.FOLLOW_UP_DATE] || '',
      notes: row[ADMIN_COLUMNS.NOTES] || '',
      createdDate: row[ADMIN_COLUMNS.CREATED_DATE] || ''
    }));
  } catch (error) {
    console.error('Error getting officer enquiries:', error);
    throw error;
  }
}

// Get all leads from dedicated Leads spreadsheet
async function getAllLeads() {
  try {
    const sheets = await getSheetsClient();
    const leadsSheetId = process.env.LEADS_SHEET_ID;
    const leadsSheetName = process.env.LEADS_SHEET_NAME || 'Sheet1';
    
    if (!leadsSheetId) {
      console.warn('LEADS_SHEET_ID not configured, falling back to admin enquiries');
      return await getAllEnquiries();
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: leadsSheetId,
      range: `${leadsSheetName}!A2:K10000`,
    });

    const rows = response.data.values || [];
    return rows.map(row => ({
      enquiryId: row[ADMIN_COLUMNS.ENQUIRY_ID] || '',
      fullName: row[ADMIN_COLUMNS.FULL_NAME] || '',
      phone: row[ADMIN_COLUMNS.PHONE] || '',
      email: row[ADMIN_COLUMNS.EMAIL] || '',
      course: row[ADMIN_COLUMNS.COURSE] || '',
      source: row[ADMIN_COLUMNS.SOURCE] || '',
      assignedOfficer: row[ADMIN_COLUMNS.ASSIGNED_OFFICER] || '',
      status: row[ADMIN_COLUMNS.STATUS] || 'New',
      followUpDate: row[ADMIN_COLUMNS.FOLLOW_UP_DATE] || '',
      notes: row[ADMIN_COLUMNS.NOTES] || '',
      createdDate: row[ADMIN_COLUMNS.CREATED_DATE] || ''
    }));
  } catch (error) {
    console.error('Error getting leads from dedicated sheet:', error);
    throw error;
  }
}

module.exports = {
  getAllEnquiries,
  getEnquiryById,
  addEnquiry,
  updateEnquiry,
  copyToOfficerSheet,
  getOfficers,
  getOfficerEnquiries,
  getAllLeads
};
