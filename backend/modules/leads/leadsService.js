/**
 * Leads Service
 * Business logic for managing leads from Google Sheets
 */

const { readSheet, writeSheet, appendSheet } = require('../../core/sheets/sheetsClient');
const { config } = require('../../core/config/environment');

/**
 * Column mapping for leads spreadsheet
 * Adjusted based on actual sheet structure: a, j columns
 */
const COLUMN_MAP = {
  ID: 0,           // Column A - ID
  NAME: 1,         // Column B - Name  
  EMAIL: 2,        // Column C - Email
  PHONE: 3,        // Column D - Phone
  COURSE: 4,       // Column E - Course
  SOURCE: 5,       // Column F - Source
  STATUS: 6,       // Column G - Status
  ASSIGNED_TO: 7,  // Column H - Assigned To
  CREATED_DATE: 8, // Column I - Created Date
  NOTES: 9         // Column J - Notes
};

/**
 * Get the spreadsheet ID for leads
 * Priority: SHEET_ID > LEADS_SHEET_ID > ADMIN_SHEET_ID
 */
function getLeadsSheetId() {
  return config.sheets.sheetId || config.sheets.leadsSheetId || config.sheets.adminSheetId;
}

/**
 * Get the sheet name for leads
 * @param {string} batch - Optional batch name (e.g., 'Batch10')
 */
function getLeadsSheetName(batch) {
  if (batch && batch !== 'all') {
    return batch; // Use batch name as sheet name
  }
  return config.sheets.sheetName || config.sheets.leadsSheetName;
}

/**
 * Parse a row from the spreadsheet into a lead object
 * @param {Array} row - Raw row data from sheet
 * @param {number} index - Row index (for ID generation)
 * @returns {Object} Parsed lead object
 */
function parseLeadRow(row, index) {
  return {
    id: row[COLUMN_MAP.ID] || (index + 1),
    name: row[COLUMN_MAP.NAME] || '',
    email: row[COLUMN_MAP.EMAIL] || '',
    phone: row[COLUMN_MAP.PHONE] || '',
    course: row[COLUMN_MAP.COURSE] || '',
    source: row[COLUMN_MAP.SOURCE] || '',
    status: row[COLUMN_MAP.STATUS] || 'New',
    assignedTo: row[COLUMN_MAP.ASSIGNED_TO] || '',
    createdDate: row[COLUMN_MAP.CREATED_DATE] || '',
    notes: row[COLUMN_MAP.NOTES] || ''
  };
}

/**
 * Get all leads from Google Sheets
 * @param {Object} filters - Optional filters (status, search, batch)
 * @returns {Promise<Array>} Array of lead objects
 */
async function getAllLeads(filters = {}) {
  try {
    const spreadsheetId = getLeadsSheetId();
    const sheetName = getLeadsSheetName(filters.batch);

    // Debug logging
    console.log('===== Leads Service Debug =====');
    console.log('Config values:', {
      sheetId: config.sheets.sheetId,
      sheetName: config.sheets.sheetName,
      leadsSheetId: config.sheets.leadsSheetId,
      leadsSheetName: config.sheets.leadsSheetName
    });
    console.log('Resolved values:', {
      spreadsheetId: spreadsheetId,
      sheetName: sheetName,
      filterBatch: filters.batch
    });
    console.log('==============================');

    if (!spreadsheetId) {
      throw new Error('No spreadsheet ID configured. Please set SHEET_ID in environment variables.');
    }

    // Read data starting from row 2 (skip header)
    // Try without row limit first to avoid parse errors
    const range = `${sheetName}!A2:Z`;
    console.log(`Reading from sheet: ${sheetName}, range: ${range}`);
    const rows = await readSheet(spreadsheetId, range);
    
    console.log(`📊 Raw data from sheet: ${rows.length} rows`);
    if (rows.length > 0) {
      console.log('First row sample:', rows[0]);
      console.log('First row length:', rows[0].length);
    }

    // Parse rows into lead objects
    let leads = rows
      .filter(row => row && row.length > 0 && row[COLUMN_MAP.NAME]) // Filter out empty rows
      .map((row, index) => parseLeadRow(row, index));
    
    console.log(`✓ Parsed ${leads.length} leads after filtering empty rows`);

    // Apply filters
    if (filters.status) {
      leads = leads.filter(lead => 
        lead.status.toLowerCase() === filters.status.toLowerCase()
      );
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      leads = leads.filter(lead =>
        (lead.name && lead.name.toLowerCase().includes(searchLower)) ||
        (lead.email && lead.email.toLowerCase().includes(searchLower)) ||
        (lead.phone && lead.phone.includes(searchLower)) ||
        (lead.course && lead.course.toLowerCase().includes(searchLower))
      );
    }

    return leads;
  } catch (error) {
    console.error('Error in getAllLeads:', error);
    throw error;
  }
}

/**
 * Get a single lead by ID
 * @param {number} leadId - The lead ID
 * @returns {Promise<Object|null>} Lead object or null if not found
 */
async function getLeadById(leadId) {
  try {
    const leads = await getAllLeads();
    return leads.find(lead => lead.id === parseInt(leadId)) || null;
  } catch (error) {
    console.error('Error in getLeadById:', error);
    throw error;
  }
}

/**
 * Get leads statistics
 * @returns {Promise<Object>} Statistics object
 */
async function getLeadsStats() {
  try {
    const leads = await getAllLeads();

    const stats = {
      total: leads.length,
      byStatus: {},
      recent: leads.slice(-10).reverse() // Last 10 leads
    };

    // Count by status
    leads.forEach(lead => {
      const status = lead.status || 'Unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error('Error in getLeadsStats:', error);
    throw error;
  }
}

/**
 * Update a lead in Google Sheets
 * @param {string} leadId - The lead ID
 * @param {Object} updates - Fields to update
 * @param {string} batch - Optional batch name to specify which sheet to update
 * @returns {Promise<Object>} Updated lead
 */
async function updateLead(leadId, updates, batch) {
  try {
    console.log('\n\n🔥🔥🔥 UPDATE LEAD CALLED 🔥🔥🔥');
    console.log('Lead ID:', leadId);
    console.log('Updates:', JSON.stringify(updates, null, 2));
    console.log('Batch:', batch);
    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥\n');
    
    const spreadsheetId = getLeadsSheetId();
    const sheetName = getLeadsSheetName(batch);

    if (!spreadsheetId) {
      throw new Error('No spreadsheet ID configured.');
    }
    
    console.log(`📋 Looking for lead ${leadId} in sheet: ${sheetName}`);

    // Get all leads to find the row (filter by batch if provided)
    const leads = await getAllLeads(batch ? { batch } : {});
    console.log(`Found ${leads.length} leads in sheet`);
    const leadIndex = leads.findIndex(l => l.id == leadId);
    
    if (leadIndex === -1) {
      throw new Error('Lead not found');
    }

    const lead = leads[leadIndex];
    const oldAssignedTo = lead.assignedTo;
    
    // Merge updates with existing data
    // Also persist the batch context on the lead object so officer personal sheets
    // can display leads grouped by batch (stored in officer sheet column H).
    const updatedLead = { ...lead, ...updates };
    if (batch && batch !== 'all') {
      updatedLead.batch = batch;
    }
    
    // Convert to row array (columns A-J)
    const row = [
      updatedLead.id || '',
      updatedLead.name || '',
      updatedLead.email || '',
      updatedLead.phone || '',
      updatedLead.course || '',
      updatedLead.source || '',
      updatedLead.status || '',
      updatedLead.assignedTo || '',
      updatedLead.createdDate || '',
      updatedLead.notes || ''
    ];

    // Calculate actual row number (leadIndex + 2: +1 for 0-based index, +1 for header row)
    const rowNumber = leadIndex + 2;
    const range = `${sheetName}!A${rowNumber}:J${rowNumber}`;
    
    await writeSheet(spreadsheetId, range, [row]);

    console.log(`✓ Updated lead ${leadId} in row ${rowNumber}`);
    
    // If assigned to an officer (and it's a new assignment or changed assignment)
    if (updates.assignedTo !== oldAssignedTo) {
      const { copyLeadToOfficerSheet, removeLeadFromOfficerSheet } = require('./userLeadsService');
      
      // Remove from old officer's sheet (if there was an old assignment)
      if (oldAssignedTo && oldAssignedTo !== '') {
        console.log(`📋 Removing lead from old officer: ${oldAssignedTo}`);
        const removeResult = await removeLeadFromOfficerSheet(oldAssignedTo, lead);
        
        if (removeResult.success) {
          if (removeResult.removed) {
            console.log(`✓ Lead removed from ${oldAssignedTo}'s personal sheet`);
          } else if (removeResult.skipped) {
            console.log(`ℹ️  Lead removal skipped (not found in ${oldAssignedTo}'s sheet)`);
          }
        } else {
          console.warn(`⚠️  Failed to remove lead from ${oldAssignedTo}'s sheet: ${removeResult.error}`);
        }
      }
      
      // Copy to new officer's sheet (if there's a new assignment)
      if (updates.assignedTo && updates.assignedTo !== '') {
        console.log(`📋 Lead assigned to: ${updates.assignedTo} (was: ${oldAssignedTo || 'unassigned'})`);
        // Ensure batch context is carried into the officer sheet (column H there)
        if (batch && batch !== 'all') {
          updatedLead.batch = batch;
        }
        const copyResult = await copyLeadToOfficerSheet(updates.assignedTo, updatedLead);
        
        if (copyResult.success) {
          if (copyResult.copied) {
            console.log(`✓ Lead copied to ${updates.assignedTo}'s personal sheet`);
          } else if (copyResult.skipped) {
            console.log(`ℹ️  Lead copy skipped: ${copyResult.reason || 'already exists'}`);
          }
        } else {
          console.warn(`⚠️  Failed to copy lead to officer sheet: ${copyResult.error}`);
          // Don't throw error - the main update succeeded
        }
      }
    }
    
    return updatedLead;
  } catch (error) {
    console.error('Error in updateLead:', error);
    throw error;
  }
}

/**
 * Add a new lead to Google Sheets
 * @param {Object} leadData - New lead data
 * @returns {Promise<Object>} Created lead
 */
async function addLead(leadData) {
  try {
    const spreadsheetId = getLeadsSheetId();
    const sheetName = getLeadsSheetName();

    if (!spreadsheetId) {
      throw new Error('No spreadsheet ID configured.');
    }

    // Get all leads to determine next ID
    const leads = await getAllLeads();
    const nextId = leads.length > 0 ? Math.max(...leads.map(l => parseInt(l.id) || 0)) + 1 : 1;
    
    // Create row array (columns A-J)
    const row = [
      nextId,
      leadData.name || '',
      leadData.email || '',
      leadData.phone || '',
      leadData.course || '',
      leadData.source || '',
      leadData.status || 'New',
      leadData.assignedTo || '',
      leadData.createdDate || new Date().toISOString().split('T')[0],
      leadData.notes || ''
    ];

    // Append to sheet
    const range = `${sheetName}!A:J`;
    await appendSheet(spreadsheetId, range, [row]);

    console.log(`✓ Added new lead with ID ${nextId}`);
    
    return {
      id: nextId,
      ...leadData
    };
  } catch (error) {
    console.error('Error in addLead:', error);
    throw error;
  }
}

/**
 * Delete a lead from Google Sheets
 * @param {string} leadId - The lead ID
 * @returns {Promise<Object>} Deletion result
 */
async function deleteLead(leadId) {
  try {
    const spreadsheetId = getLeadsSheetId();
    const sheetName = getLeadsSheetName();

    if (!spreadsheetId) {
      throw new Error('No spreadsheet ID configured.');
    }

    // Get all leads to find the row
    const leads = await getAllLeads();
    const leadIndex = leads.findIndex(l => l.id == leadId);
    
    if (leadIndex === -1) {
      throw new Error('Lead not found');
    }

    // Calculate actual row number
    const rowNumber = leadIndex + 2;
    
    // Clear the row (delete by setting all cells to empty)
    const emptyRow = ['', '', '', '', '', '', '', '', '', ''];
    const range = `${sheetName}!A${rowNumber}:J${rowNumber}`;
    
    await writeSheet(spreadsheetId, range, [emptyRow]);

    console.log(`✓ Deleted lead ${leadId} from row ${rowNumber}`);
    
    return {
      success: true,
      message: 'Lead deleted successfully'
    };
  } catch (error) {
    console.error('Error in deleteLead:', error);
    throw error;
  }
}

module.exports = {
  getAllLeads,
  getLeadById,
  addLead,
  updateLead,
  deleteLead,
  getLeadsStats
};
