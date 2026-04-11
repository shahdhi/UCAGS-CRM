/**
 * Leads Service
 * Business logic for managing leads from Google Sheets
 */

const { readSheet, writeSheet, appendSheet } = require('../../core/sheets/sheetsClient');

function colToLetter(col) {
  let temp = col + 1;
  let letter = '';
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

function buildA1Range(sheetName, startRow, startCol, endRow, endCol) {
  const start = `${colToLetter(startCol)}${startRow}`;
  const end = `${colToLetter(endCol)}${endRow}`;
  return `${sheetName}!${start}:${end}`;
}

const { config } = require('../../core/config/environment');

/**
 * Leads sheet schema
 *
 * IMPORTANT: We must not rely on fixed column indexes because the sheet column order can change.
 * We therefore read header row (row 1) and build a dynamic header -> index mapping.
 */

// Requested header order (first columns)
const REQUESTED_HEADER_ORDER = [
  'platform',
  'are_you_planning_to_start_immediately?',
  'why_are_you_interested_in_this_diploma?',
  'full_name',
  'phone',
  'email',
  'ID'
];

// Common header aliases we may see in existing sheets
const HEADER_ALIASES = {
  id: ['id', 'ID', 'enquiry_id', 'enquiryId', 'lead_id'],
  full_name: ['full_name', 'Full Name', 'name', 'Name', 'fullName', 'FULL_NAME'],
  phone: ['phone', 'Phone', 'mobile', 'Mobile', 'contact', 'Contact'],
  email: ['email', 'Email', 'e-mail', 'E-mail'],
  platform: ['platform', 'Platform', 'source', 'Source'],
  assigned_to: ['assigned to', 'assigned_to', 'Assigned To', 'assignedTo'],
  status: ['status', 'Status'],
  notes: ['notes', 'Notes', 'remarks', 'Remarks'],
  created_date: ['created', 'created_date', 'Created Date', 'createdDate', 'date']
};

let ensuredOrderCache = new Set();

async function ensureLeadsHeaderOrder(spreadsheetId, sheetName) {
  const key = `${spreadsheetId}:${sheetName}`;
  if (ensuredOrderCache.has(key)) return;

  const headerRow = await readSheet(spreadsheetId, `${sheetName}!A1:Z1`);
  const headers = (headerRow && headerRow[0]) ? headerRow[0].map(normalizeHeader).filter(Boolean) : [];
  if (headers.length === 0) {
    // Nothing to reorder
    ensuredOrderCache.add(key);
    return;
  }

  const requested = REQUESTED_HEADER_ORDER;
  const requestedSet = new Set(requested.map(h => h.toLowerCase()));

  // Build new header order: requested headers first (if they exist in current sheet), then the rest
  const existingLowerToOriginal = new Map(headers.map(h => [h.toLowerCase(), h]));

  const newHeaders = [];
  for (const h of requested) {
    const existing = existingLowerToOriginal.get(h.toLowerCase());
    if (existing) newHeaders.push(existing);
    else newHeaders.push(h); // if missing, we still create the column
  }

  for (const h of headers) {
    if (!requestedSet.has(h.toLowerCase())) {
      newHeaders.push(h);
    }
  }

  // If header row already matches (case-insensitive) and no new columns added, skip
  const currentNorm = headers.map(h => h.toLowerCase());
  const desiredNorm = newHeaders.map(h => h.toLowerCase());
  const same = currentNorm.length === desiredNorm.length && currentNorm.every((v, i) => v === desiredNorm[i]);

  if (same) {
    ensuredOrderCache.add(key);
    return;
  }

  // Read all existing rows (including header)
  const allRows = await readSheet(spreadsheetId, `${sheetName}!A1:Z`);
  const dataRows = allRows.slice(1);

  // Create mapping oldHeaderLower -> oldIndex
  const oldIndexByLower = new Map();
  headers.forEach((h, i) => oldIndexByLower.set(h.toLowerCase(), i));

  // Rebuild rows according to new header order
  const rebuilt = [newHeaders];
  for (const r of dataRows) {
    const newRow = new Array(newHeaders.length).fill('');
    for (let j = 0; j < newHeaders.length; j++) {
      const hLower = newHeaders[j].toLowerCase();
      const oldIdx = oldIndexByLower.get(hLower);
      if (oldIdx != null && oldIdx >= 0) {
        newRow[j] = r[oldIdx] != null ? r[oldIdx] : '';
      }
    }
    // Keep trailing empty rows out
    if (newRow.some(v => String(v || '').trim() !== '')) {
      rebuilt.push(newRow);
    }
  }

  const endCol = newHeaders.length - 1;
  const endRow = rebuilt.length;
  const range = buildA1Range(sheetName, 1, 0, endRow, endCol);
  await writeSheet(spreadsheetId, range, rebuilt);

  ensuredOrderCache.add(key);
}


function normalizeHeader(h) {
  return String(h || '').trim();
}

function findHeaderIndex(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  for (const c of candidates) {
    const idx = normalized.findIndex(h => h.toLowerCase() === String(c).toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

async function getHeaderMap(spreadsheetId, sheetName) {
  const headerRow = await readSheet(spreadsheetId, `${sheetName}!A1:Z1`);
  const headers = (headerRow && headerRow[0]) ? headerRow[0].map(normalizeHeader) : [];

  const map = {};
  // direct exact mapping
  headers.forEach((h, idx) => {
    if (h) map[h] = idx;
  });

  // canonical mapping
  const canonical = {
    platform: findHeaderIndex(headers, [...HEADER_ALIASES.platform, 'platform']),
    planning: findHeaderIndex(headers, ['are_you_planning_to_start_immediately?']),
    interest: findHeaderIndex(headers, ['why_are_you_interested_in_this_diploma?']),
    full_name: findHeaderIndex(headers, [...HEADER_ALIASES.full_name, 'full_name']),
    phone: findHeaderIndex(headers, [...HEADER_ALIASES.phone, 'phone']),
    email: findHeaderIndex(headers, [...HEADER_ALIASES.email, 'email']),
    id: findHeaderIndex(headers, [...HEADER_ALIASES.id, 'ID']),
    assigned_to: findHeaderIndex(headers, [...HEADER_ALIASES.assigned_to, 'assigned_to']),
    status: findHeaderIndex(headers, [...HEADER_ALIASES.status, 'status']),
    created_date: findHeaderIndex(headers, [...HEADER_ALIASES.created_date, 'created_date']),
    notes: findHeaderIndex(headers, [...HEADER_ALIASES.notes, 'notes'])
  };

  return { headers, map, canonical };
}

function getCell(row, idx) {
  if (idx == null || idx < 0) return '';
  return row[idx] != null ? row[idx] : '';
}

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
function parseLeadRow(row, index, headerInfo) {
  const c = headerInfo?.canonical || {};

  const id = getCell(row, c.id) || (index + 1);
  const fullName = getCell(row, c.full_name);

  // Keep backward compatibility with existing UI fields
  return {
    id,

    // New fields requested
    platform: getCell(row, c.platform),
    are_you_planning_to_start_immediately: getCell(row, c.planning),
    why_are_you_interested_in_this_diploma: getCell(row, c.interest),
    full_name: fullName,

    // Existing CRM fields
    name: fullName || '',
    email: getCell(row, c.email) || '',
    phone: getCell(row, c.phone) || '',
    status: getCell(row, c.status) || 'New',
    assignedTo: getCell(row, c.assigned_to) || '',
    createdDate: getCell(row, c.created_date) || '',
    notes: getCell(row, c.notes) || ''
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

    // Ensure the spreadsheet columns are in the requested order (spreadsheet-only change)
    await ensureLeadsHeaderOrder(spreadsheetId, sheetName);

    const headerInfo = await getHeaderMap(spreadsheetId, sheetName);

    // Read data starting from row 2 (skip header)
    const range = `${sheetName}!A2:Z`;
    console.log(`Reading from sheet: ${sheetName}, range: ${range}`);
    const rows = await readSheet(spreadsheetId, range);
    
    console.log(`📊 Raw data from sheet: ${rows.length} rows`);
    if (rows.length > 0) {
      console.log('First row sample:', rows[0]);
      console.log('First row length:', rows[0].length);
    }

    // Parse rows into lead objects (header-based)
    let leads = rows
      .filter(row => row && row.length > 0)
      .map((row, index) => parseLeadRow(row, index, headerInfo))
      .filter(l => l && (l.full_name || l.name || l.email || l.phone));
    
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
function setCell(rowArr, idx, value) {
  if (idx == null || idx < 0) return;
  rowArr[idx] = value != null ? value : '';
}

function buildRowFromLead(leadObj, headerInfo) {
  const headers = headerInfo.headers || [];
  const c = headerInfo.canonical || {};
  const row = new Array(headers.length).fill('');

  // Requested/new fields
  setCell(row, c.platform, leadObj.platform || leadObj.source || '');
  setCell(row, c.planning, leadObj.are_you_planning_to_start_immediately || '');
  setCell(row, c.interest, leadObj.why_are_you_interested_in_this_diploma || '');
  setCell(row, c.full_name, leadObj.full_name || leadObj.name || '');
  setCell(row, c.phone, leadObj.phone || '');
  setCell(row, c.email, leadObj.email || '');
  setCell(row, c.id, leadObj.id || '');

  // Common CRM fields
  setCell(row, c.assigned_to, leadObj.assignedTo || '');
  setCell(row, c.status, leadObj.status || '');
  setCell(row, c.created_date, leadObj.createdDate || '');
  setCell(row, c.notes, leadObj.notes || '');

  return row;
}

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

    // Ensure order + header map
    await ensureLeadsHeaderOrder(spreadsheetId, sheetName);
    const headerInfo = await getHeaderMap(spreadsheetId, sheetName);

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
    
    // Build row aligned to current headers
    const row = buildRowFromLead(updatedLead, headerInfo);

    // Calculate actual row number (leadIndex + 2: +1 for 0-based index, +1 for header row)
    const rowNumber = leadIndex + 2;
    const endCol = Math.max((headerInfo.headers || []).length - 1, 0);
    const range = buildA1Range(sheetName, rowNumber, 0, rowNumber, endCol);
    
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
        const copyResult = await copyLeadToOfficerSheet(updates.assignedTo, updatedLead, { batchName: batch || currentBatch || updatedLead.batch });
        
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

    // Ensure order + header map
    await ensureLeadsHeaderOrder(spreadsheetId, sheetName);
    const headerInfo = await getHeaderMap(spreadsheetId, sheetName);

    // Get all leads to determine next ID
    const leads = await getAllLeads();
    const nextId = leads.length > 0 ? Math.max(...leads.map(l => parseInt(l.id) || 0)) + 1 : 1;

    const leadObj = {
      ...leadData,
      id: nextId,
      createdDate: leadData.createdDate || new Date().toISOString().split('T')[0]
    };

    const row = buildRowFromLead(leadObj, headerInfo);

    // Append to sheet (entire width)
    const endCol = Math.max((headerInfo.headers || []).length - 1, 0);
    const range = `${sheetName}!A:${colToLetter(endCol)}`;
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
    
    // Ensure order + header map
    await ensureLeadsHeaderOrder(spreadsheetId, sheetName);
    const headerInfo = await getHeaderMap(spreadsheetId, sheetName);

    // Clear the row by writing empty values across the header width
    const emptyRow = new Array((headerInfo.headers || []).length).fill('');
    const endCol = Math.max((headerInfo.headers || []).length - 1, 0);
    const range = buildA1Range(sheetName, rowNumber, 0, rowNumber, endCol);
    
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
