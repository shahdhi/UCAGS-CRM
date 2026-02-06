/**
 * User Leads Service
 * Handles user-specific leads from the LEADS-STAFF spreadsheet
 */

const { readSheet, appendSheet, writeSheet } = require('../../core/sheets/sheetsClient');
const { config } = require('../../core/config/environment');

/**
 * Get leads for a specific user
 * @param {string} userName - The name of the user (matches sheet name)
 * @returns {Promise<Array>} Array of leads
 */
async function getUserLeads(userName) {
  try {
    const spreadsheetId = config.sheets.userLeadsSheetId;
    
    if (!spreadsheetId) {
      throw new Error('User leads spreadsheet not configured');
    }

    const sheetName = userName;
    const range = `${sheetName}!A2:Z`; // Skip header row
    
    console.log(`📊 Fetching leads for user: ${userName}`);
    const rows = await readSheet(spreadsheetId, range);

    if (!rows || rows.length === 0) {
      return [];
    }

    // Transform rows to lead objects
    const leads = rows.map((row, index) => ({
      id: row[0] || `lead-${index + 1}`,
      name: row[1] || '',
      email: row[2] || '',
      phone: row[3] || '',
      course: row[4] || '',
      source: row[5] || '',
      status: row[6] || 'New',
      batch: row[7] || '',
      created: row[8] || new Date().toISOString(),
      actions: row[9] || ''
    }));

    console.log(`✓ Found ${leads.length} leads for ${userName}`);
    return leads;
  } catch (error) {
    console.error(`Error fetching leads for user ${userName}:`, error);
    throw new Error(`Failed to fetch user leads: ${error.message}`);
  }
}

/**
 * Add a lead to a user's sheet
 * @param {string} userName - The name of the user (matches sheet name)
 * @param {Object} lead - The lead data to add
 * @returns {Promise<Object>} The added lead
 */
async function addUserLead(userName, lead) {
  try {
    const spreadsheetId = config.sheets.userLeadsSheetId;
    
    if (!spreadsheetId) {
      throw new Error('User leads spreadsheet not configured');
    }

    const sheetName = userName;
    const range = `${sheetName}!A2:J`; // Append to columns A-J
    
    // Create row data
    const rowData = [
      lead.id || `LEAD-${Date.now()}`,
      lead.name || '',
      lead.email || '',
      lead.phone || '',
      lead.course || '',
      lead.source || '',
      lead.status || 'New',
      lead.batch || '',
      lead.created || new Date().toISOString(),
      lead.actions || ''
    ];

    console.log(`📝 Adding lead to ${userName}'s sheet`);
    await appendSheet(spreadsheetId, range, [rowData]);
    
    console.log(`✓ Lead added successfully`);
    return {
      id: rowData[0],
      name: rowData[1],
      email: rowData[2],
      phone: rowData[3],
      course: rowData[4],
      source: rowData[5],
      status: rowData[6],
      batch: rowData[7],
      created: rowData[8],
      actions: rowData[9]
    };
  } catch (error) {
    console.error(`Error adding lead for user ${userName}:`, error);
    throw new Error(`Failed to add user lead: ${error.message}`);
  }
}

/**
 * Get all users' leads (admin only)
 * @returns {Promise<Object>} Object with leads grouped by user
 */
async function getAllUsersLeads() {
  try {
    const spreadsheetId = config.sheets.userLeadsSheetId;
    
    if (!spreadsheetId) {
      throw new Error('User leads spreadsheet not configured');
    }

    const { getSpreadsheetInfo } = require('../../core/sheets/sheetsClient');
    const spreadsheet = await getSpreadsheetInfo(spreadsheetId);
    
    const usersLeads = {};
    
    // Get leads from each sheet (each sheet = one user)
    for (const sheet of spreadsheet.sheets) {
      const userName = sheet.properties.title;
      
      try {
        const leads = await getUserLeads(userName);
        usersLeads[userName] = leads;
      } catch (err) {
        console.error(`Error fetching leads for ${userName}:`, err);
        usersLeads[userName] = [];
      }
    }

    return usersLeads;
  } catch (error) {
    console.error('Error fetching all users leads:', error);
    throw new Error(`Failed to fetch all users leads: ${error.message}`);
  }
}

/**
 * Copy a lead from batch sheet to officer's personal sheet
 * @param {string} officerName - The name of the officer
 * @param {Object} lead - The lead data to copy
 * @returns {Promise<Object>} Result of the operation
 */
async function copyLeadToOfficerSheet(officerName, lead) {
  try {
    console.log('\n========== COPY LEAD TO OFFICER SHEET ==========');
    console.log('Officer Name:', officerName);
    console.log('Lead ID:', lead.id);
    console.log('Lead Name:', lead.name);
    
    if (!officerName || officerName === '') {
      console.log('❌ No officer assigned, skipping copy');
      return { success: true, skipped: true };
    }

    const spreadsheetId = config.sheets.userLeadsSheetId;
    console.log('User Leads Spreadsheet ID:', spreadsheetId);
    
    if (!spreadsheetId) {
      console.warn('❌ User leads spreadsheet not configured');
      return { success: false, error: 'User leads spreadsheet not configured' };
    }

    // Check if officer's sheet exists
    const { sheetExists, copySheetTemplate } = require('../../core/sheets/sheetsClient');
    console.log(`📋 Checking if sheet exists: "${officerName}"`);
    const sheetResult = await sheetExists(spreadsheetId, officerName);
    console.log(`Sheet exists result:`, sheetResult);
    
    // If sheetExists returns a string, it's the actual sheet name (case-corrected)
    const exists = !!sheetResult;
    const actualSheetName = (typeof sheetResult === 'string') ? sheetResult : officerName;
    
    if (!exists) {
      console.log(`❌ Officer sheet "${officerName}" does not exist. Creating from template...`);
      console.log(`Template sheet:`, config.sheets.userLeadsTemplateSheet);
      
      // Try to create sheet from template
      if (config.sheets.userLeadsTemplateSheet) {
        try {
          await copySheetTemplate(
            spreadsheetId,
            config.sheets.userLeadsTemplateSheet,
            officerName
          );
          console.log(`✓ Created sheet for officer: ${officerName}`);
        } catch (error) {
          console.error(`Failed to create sheet from template:`, error);
          return { success: false, error: `Failed to create officer sheet: ${error.message}` };
        }
      } else {
        console.warn(`Cannot create sheet - template not configured`);
        return { success: false, error: 'Officer sheet does not exist and template not configured' };
      }
    }

    // Check if lead already exists in officer's sheet (to avoid duplicates)
    console.log(`📋 Checking for duplicates in ${actualSheetName}'s sheet...`);
    const existingLeads = await getUserLeads(actualSheetName);
    console.log(`Found ${existingLeads.length} existing leads in officer's sheet`);
    
    const leadExists = existingLeads.some(l => 
      l.id === lead.id || 
      (l.email === lead.email && l.email !== '') ||
      (l.phone === lead.phone && l.phone !== '')
    );

    if (leadExists) {
      console.log(`⚠️  Lead already exists in ${actualSheetName}'s sheet, skipping copy`);
      return { success: true, skipped: true, reason: 'duplicate' };
    }

    // Add lead to officer's sheet
    console.log(`📝 Preparing lead data for copy...`);
    const leadData = {
      id: lead.id || `LEAD-${Date.now()}`,
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      course: lead.course || '',
      source: lead.source || '',
      status: lead.status || 'New',
      batch: lead.batch || '',
      created: lead.createdDate || lead.created || new Date().toISOString().split('T')[0],
      actions: lead.notes || ''
    };
    console.log('Lead data to copy:', JSON.stringify(leadData, null, 2));

    console.log(`📤 Adding lead to ${actualSheetName}'s sheet...`);
    await addUserLead(actualSheetName, leadData);
    
    console.log(`✅ Lead copied to ${actualSheetName}'s sheet successfully`);
    console.log('================================================\n');
    return { success: true, copied: true };
  } catch (error) {
    console.error(`Error copying lead to officer sheet:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a lead from an officer's personal sheet
 * @param {string} officerName - The name of the officer
 * @param {Object} lead - The lead data (needs id, email, or phone to identify)
 * @returns {Promise<Object>} Result of the operation
 */
async function removeLeadFromOfficerSheet(officerName, lead) {
  try {
    console.log(`\n========== REMOVE LEAD FROM OFFICER SHEET ==========`);
    console.log('Officer Name:', officerName);
    console.log('Lead ID:', lead.id);
    
    if (!officerName || officerName === '') {
      console.log('❌ No officer name provided, skipping removal');
      return { success: true, skipped: true };
    }

    const spreadsheetId = config.sheets.userLeadsSheetId;
    
    if (!spreadsheetId) {
      console.warn('❌ User leads spreadsheet not configured');
      return { success: false, error: 'User leads spreadsheet not configured' };
    }

    // Check if officer's sheet exists
    const { sheetExists } = require('../../core/sheets/sheetsClient');
    const sheetResult = await sheetExists(spreadsheetId, officerName);
    
    if (!sheetResult) {
      console.log(`ℹ️  Officer sheet "${officerName}" doesn't exist, nothing to remove`);
      return { success: true, skipped: true };
    }
    
    const actualSheetName = (typeof sheetResult === 'string') ? sheetResult : officerName;
    console.log(`📋 Removing lead from sheet: "${actualSheetName}"`);

    // Get all leads from officer's sheet
    const existingLeads = await getUserLeads(actualSheetName);
    console.log(`Found ${existingLeads.length} leads in officer's sheet`);
    
    // Find the lead to remove (by ID, email, or phone)
    const leadIndex = existingLeads.findIndex(l => 
      l.id === lead.id || 
      (l.email === lead.email && l.email !== '' && lead.email !== '') ||
      (l.phone === lead.phone && l.phone !== '' && lead.phone !== '')
    );

    if (leadIndex === -1) {
      console.log(`ℹ️  Lead not found in ${actualSheetName}'s sheet, nothing to remove`);
      return { success: true, skipped: true };
    }

    console.log(`📍 Found lead at row ${leadIndex + 2} (including header)`);

    // Delete the row from the sheet
    const { deleteSheetRow } = require('../../core/sheets/sheetsClient');
    const rowNumber = leadIndex + 2; // +1 for 0-based index, +1 for header row
    
    await deleteSheetRow(spreadsheetId, actualSheetName, rowNumber);
    
    console.log(`✅ Lead removed from ${actualSheetName}'s sheet successfully`);
    console.log('====================================================\n');
    return { success: true, removed: true };
    
  } catch (error) {
    console.error(`Error removing lead from officer sheet:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getUserLeads,
  addUserLead,
  getAllUsersLeads,
  copyLeadToOfficerSheet,
  removeLeadFromOfficerSheet
};
