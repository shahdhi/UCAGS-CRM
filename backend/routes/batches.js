/**
 * Batches Routes
 * API endpoints for creating new batch sheets
 */

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

/**
 * POST /api/leads/create-batch
 * Create a new batch sheet in Google Spreadsheet
 */
router.post('/create-batch', async (req, res) => {
  try {
    const { batchName } = req.body;
    
    if (!batchName) {
      return res.status(400).json({
        success: false,
        error: 'Batch name is required'
      });
    }
    
    // Validate batch name - no spaces allowed
    if (batchName.includes(' ')) {
      return res.status(400).json({
        success: false,
        error: 'Batch name cannot contain spaces. Use hyphens or underscores instead (e.g., "Batch-16", "Spring-2026")'
      });
    }
    
    // Validate batch name - only alphanumeric, hyphens, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(batchName)) {
      return res.status(400).json({
        success: false,
        error: 'Batch name can only contain letters, numbers, hyphens, and underscores'
      });
    }

    const SPREADSHEET_ID = process.env.SHEET_ID;
    const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || './ucags-crm-d8465dffdfea.json';

    // Authenticate
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(SERVICE_ACCOUNT_FILE),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Check if sheet already exists
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });

    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
    
    if (existingSheets.includes(batchName)) {
      return res.status(400).json({
        success: false,
        error: `Batch "${batchName}" already exists`
      });
    }

    // Create new sheet
    console.log(`📋 Creating sheet: ${batchName}...`);
    const createResult = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: batchName,
              gridProperties: {
                rowCount: 1000,
                columnCount: 10
              }
            }
          }
        }]
      }
    });
    console.log(`✓ Sheet created: ${batchName}`);

    // Add headers - wait a bit for sheet to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`📋 Adding headers to ${batchName}...`);
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Course', 'Source', 'Status', 'Assigned To', 'Created Date', 'Notes'];
    const headerResult = await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${batchName}!A1:J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers]
      }
    });
    
    console.log(`✓ Headers added successfully`);
    console.log(`✓ Created batch sheet: ${batchName} with ${headerResult.data.updatedCells} cells`);

    res.json({
      success: true,
      message: `Batch "${batchName}" created successfully`,
      batchName
    });

  } catch (error) {
    console.error('Error creating batch:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create batch'
    });
  }
});

module.exports = router;
