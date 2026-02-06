/**
 * Script to create batch sheets in Google Spreadsheet
 * Run: node scripts/setup-batch-sheets.js
 */

require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SHEET_ID || '1EiXzCR5-bu9J7t2yk-nKv62Qih4QHswkIMbSoSZ0VE8';
const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || './ucags-crm-d8465dffdfea.json';

const BATCH_NAMES = ['Batch10', 'Batch12', 'Batch13', 'Batch14'];

async function setupBatchSheets() {
  try {
    console.log('🔧 Setting up batch sheets...');
    console.log(`📄 Spreadsheet ID: ${SPREADSHEET_ID}`);
    
    // Authenticate
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get existing sheets
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });

    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
    console.log('📋 Existing sheets:', existingSheets.join(', '));

    // Header row for all batch sheets
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Course', 'Source', 'Status', 'Assigned To', 'Created Date', 'Notes'];

    for (const batchName of BATCH_NAMES) {
      if (existingSheets.includes(batchName)) {
        console.log(`✓ Sheet "${batchName}" already exists`);
        continue;
      }

      // Create new sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: batchName,
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 10
                  }
                }
              }
            }
          ]
        }
      });

      console.log(`✓ Created sheet "${batchName}"`);

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${batchName}!A1:J1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      });

      console.log(`✓ Added headers to "${batchName}"`);

      // Format headers (bold, background color)
      const sheetId = (await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
      })).data.sheets.find(s => s.properties.title === batchName).properties.sheetId;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 10
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.4,
                      green: 0.5,
                      blue: 0.9
                    },
                    textFormat: {
                      bold: true,
                      foregroundColor: {
                        red: 1,
                        green: 1,
                        blue: 1
                      }
                    }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }
          ]
        }
      });

      console.log(`✓ Formatted headers in "${batchName}"`);
    }

    console.log('\n✅ All batch sheets are ready!');
    console.log('\n📌 Sheet Names:');
    BATCH_NAMES.forEach(name => console.log(`   - ${name}`));
    console.log('\n🔗 View your spreadsheet:');
    console.log(`   https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupBatchSheets();
