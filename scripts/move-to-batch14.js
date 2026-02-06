/**
 * Script to copy all leads to Batch14 sheet
 * Run: node scripts/move-to-batch14.js
 */

require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SHEET_ID || '1EiXzCR5-bu9J7t2yk-nKv62Qih4QHswkIMbSoSZ0VE8';
const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || './ucags-crm-d8465dffdfea.json';
const SOURCE_SHEET = process.env.SHEET_NAME || 'Sheet1';

async function moveLeadsToBatch14() {
  try {
    console.log('🔧 Moving all leads to Batch14...');
    
    // Authenticate
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Check if Batch14 exists
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });

    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
    
    if (!existingSheets.includes('Batch14')) {
      console.log('Creating Batch14 sheet...');
      
      // Create Batch14 sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: 'Batch14',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 10
                }
              }
            }
          }]
        }
      });

      // Add headers
      const headers = ['ID', 'Name', 'Email', 'Phone', 'Course', 'Source', 'Status', 'Assigned To', 'Created Date', 'Notes'];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Batch14!A1:J1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      });

      console.log('✓ Created Batch14 sheet with headers');
    }

    // Read all data from source sheet
    console.log(`Reading data from ${SOURCE_SHEET}...`);
    const sourceData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SOURCE_SHEET}!A1:J1000`
    });

    const rows = sourceData.data.values || [];
    
    if (rows.length === 0) {
      console.log('❌ No data found in source sheet');
      return;
    }

    console.log(`Found ${rows.length} rows (including header)`);

    // Copy all data to Batch14
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Batch14!A1:J' + rows.length,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows
      }
    });

    console.log(`✓ Copied ${rows.length - 1} leads to Batch14`);
    console.log('\n✅ All leads moved to Batch14!');
    console.log('\n🔗 View your spreadsheet:');
    console.log(`   https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=0`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

moveLeadsToBatch14();
