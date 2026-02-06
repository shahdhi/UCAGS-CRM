/**
 * Google Sheets Client
 * Reusable helper module for Google Sheets API integration
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/environment');

let cachedAuth = null;

/**
 * Get authenticated Google Sheets client using service account
 * @returns {Promise<sheets_v4.Sheets>} Authenticated Sheets client
 */
async function getSheetsClient() {
  if (!cachedAuth) {
    cachedAuth = await authenticate();
  }

  return google.sheets({ version: 'v4', auth: cachedAuth });
}

/**
 * Authenticate using service account
 * @returns {Promise<JWT>} Authenticated JWT client
 */
async function authenticate() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

  let auth;

  // Option 1: Use service account JSON file
  if (config.google.serviceAccountFile) {
    const keyFilePath = path.resolve(config.google.serviceAccountFile);
    
    if (fs.existsSync(keyFilePath)) {
      const credentials = require(keyFilePath);
      auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        scopes
      );
      
      await auth.authorize();
      console.log(`✓ Authenticated using service account file: ${keyFilePath}`);
      return auth;
    } else {
      console.warn(`Service account file not found: ${keyFilePath}`);
    }
  }

  // Option 2: Use environment variables
  if (config.google.serviceAccountEmail && config.google.privateKey) {
    let privateKey = config.google.privateKey;
    
    // Handle escaped newlines
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    auth = new google.auth.JWT(
      config.google.serviceAccountEmail,
      null,
      privateKey,
      scopes
    );

    await auth.authorize();
    console.log('✓ Authenticated using service account credentials from environment');
    return auth;
  }

  throw new Error('No valid Google Service Account configuration found. Please set GOOGLE_APPLICATION_CREDENTIALS or provide service account credentials.');
}

/**
 * Read data from a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - The A1 notation range to read
 * @returns {Promise<Array<Array<any>>>} The values from the sheet
 */
async function readSheet(spreadsheetId, range) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    return response.data.values || [];
  } catch (error) {
    // If range parsing fails, it might be an empty sheet
    if (error.message.includes('Unable to parse range')) {
      console.log(`⚠️  Sheet appears to be empty or range is invalid: ${range}`);
      console.log(`Returning empty array for range: ${range}`);
      return []; // Return empty array instead of throwing
    }
    
    console.error('Error reading sheet:', error.message);
    throw new Error(`Failed to read sheet: ${error.message}`);
  }
}

/**
 * Write data to a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - The A1 notation range to write
 * @param {Array<Array<any>>} values - The values to write
 * @returns {Promise<Object>} Update response
 */
async function writeSheet(spreadsheetId, range, values) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values }
    });

    return response.data;
  } catch (error) {
    console.error('Error writing to sheet:', error.message);
    throw new Error(`Failed to write to sheet: ${error.message}`);
  }
}

/**
 * Append data to a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - The A1 notation range
 * @param {Array<Array<any>>} values - The values to append
 * @returns {Promise<Object>} Append response
 */
async function appendSheet(spreadsheetId, range, values) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values }
    });

    return response.data;
  } catch (error) {
    console.error('Error appending to sheet:', error.message);
    throw new Error(`Failed to append to sheet: ${error.message}`);
  }
}

/**
 * Get spreadsheet metadata
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @returns {Promise<Object>} Spreadsheet metadata
 */
async function getSpreadsheetInfo(spreadsheetId) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });

    return response.data;
  } catch (error) {
    console.error('Error getting spreadsheet info:', error.message);
    throw new Error(`Failed to get spreadsheet info: ${error.message}`);
  }
}

/**
 * Create a new sheet in a spreadsheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} sheetTitle - The title for the new sheet
 * @returns {Promise<Object>} Created sheet info
 */
async function createSheet(spreadsheetId, sheetTitle) {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetTitle,
              gridProperties: {
                rowCount: 1000,
                columnCount: 26
              }
            }
          }
        }]
      }
    });

    return response.data.replies[0].addSheet.properties;
  } catch (error) {
    console.error('Error creating sheet:', error.message);
    throw new Error(`Failed to create sheet: ${error.message}`);
  }
}

/**
 * Copy a sheet with data to create a template for a new user
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} templateSheetName - The name of the template sheet to copy
 * @param {string} newSheetName - The name for the new sheet
 * @returns {Promise<Object>} Created sheet info
 */
async function copySheetTemplate(spreadsheetId, templateSheetName, newSheetName) {
  try {
    console.log(`📋 Copying template "${templateSheetName}" to create "${newSheetName}"`);
    
    // Read the template headers (first row)
    const headers = await readSheet(spreadsheetId, `${templateSheetName}!A1:Z1`);
    
    if (!headers || headers.length === 0) {
      throw new Error('Template sheet has no headers');
    }

    // Create new sheet
    const newSheet = await createSheet(spreadsheetId, newSheetName);
    console.log(`✓ Created new sheet: ${newSheetName}`);

    // Write headers to new sheet
    await writeSheet(spreadsheetId, `${newSheetName}!A1:Z1`, headers);
    console.log(`✓ Added headers to ${newSheetName}`);

    return newSheet;
  } catch (error) {
    console.error('Error copying sheet template:', error.message);
    throw new Error(`Failed to copy sheet template: ${error.message}`);
  }
}

/**
 * Check if a sheet exists in a spreadsheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} sheetName - The name of the sheet to check
 * @returns {Promise<boolean>} True if sheet exists
 */
async function sheetExists(spreadsheetId, sheetName) {
  try {
    console.log(`🔍 Checking if sheet "${sheetName}" exists in spreadsheet ${spreadsheetId}`);
    const spreadsheet = await getSpreadsheetInfo(spreadsheetId);
    
    // Log all sheet names for debugging
    const allSheetNames = spreadsheet.sheets.map(s => s.properties.title);
    console.log(`📋 All sheets in spreadsheet:`, allSheetNames);
    
    // Case-insensitive comparison (Google Sheets is case-insensitive for sheet names)
    const sheet = spreadsheet.sheets.find(s => 
      s.properties.title.toLowerCase() === sheetName.toLowerCase()
    );
    const exists = !!sheet;
    
    console.log(`✓ Sheet "${sheetName}" exists: ${exists}`);
    return exists ? sheet.properties.title : null; // Return actual sheet name if found
  } catch (error) {
    console.error('Error checking if sheet exists:', error.message);
    return false;
  }
}

/**
 * Delete a row from a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} sheetName - The name of the sheet
 * @param {number} rowNumber - The row number to delete (1-based index)
 * @returns {Promise<Object>} Delete response
 */
async function deleteSheetRow(spreadsheetId, sheetName, rowNumber) {
  try {
    console.log(`🗑️  Deleting row ${rowNumber} from sheet "${sheetName}"`);
    
    // Get sheet ID
    const spreadsheet = await getSpreadsheetInfo(spreadsheetId);
    const sheet = spreadsheet.sheets.find(s => 
      s.properties.title.toLowerCase() === sheetName.toLowerCase()
    );
    
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Delete the row using batchUpdate
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1, // 0-based index
              endIndex: rowNumber // Exclusive end
            }
          }
        }]
      }
    });
    
    console.log(`✓ Row ${rowNumber} deleted successfully`);
    return response.data;
  } catch (error) {
    console.error('Error deleting row:', error.message);
    throw new Error(`Failed to delete row: ${error.message}`);
  }
}

/**
 * Clear authentication cache (useful for testing)
 */
function clearAuthCache() {
  cachedAuth = null;
}

module.exports = {
  getSheetsClient,
  readSheet,
  writeSheet,
  appendSheet,
  getSpreadsheetInfo,
  createSheet,
  copySheetTemplate,
  sheetExists,
  deleteSheetRow,
  clearAuthCache
};
