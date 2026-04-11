#!/usr/bin/env node

/**
 * Automated Google Sheets Setup for UCAGS CRM
 * 
 * This script creates the required sheet structure automatically
 * 
 * Usage: node scripts/setup-sheets.js
 */

require('dotenv').config();
const { getSheetsClient } = require('../server/config/google');

const ADMIN_HEADERS = [
  'Enquiry ID',
  'Full Name',
  'Phone',
  'Email',
  'Course Interested',
  'Source',
  'Assigned Officer',
  'Status',
  'Follow-up Date',
  'Notes',
  'Created Date'
];

const OFFICERS_HEADERS = [
  'Username',
  'Password',
  'Name',
  'Email',
  'SheetID'
];

async function setupSheets() {
  console.log('\n=================================');
  console.log('UCAGS CRM - Sheet Setup');
  console.log('=================================\n');

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = process.env.ADMIN_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error('ADMIN_SHEET_ID not found in .env file');
    }

    console.log('Accessing spreadsheet...');
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    console.log('✓ Spreadsheet found:', spreadsheet.data.properties.title);

    // Check if Admin sheet exists
    const adminSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === 'Admin'
    );

    if (!adminSheet) {
      console.log('\nCreating Admin sheet...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: { title: 'Admin' }
            }
          }]
        }
      });
      console.log('✓ Admin sheet created');
    } else {
      console.log('✓ Admin sheet already exists');
    }

    // Add headers to Admin sheet
    console.log('\nSetting up Admin sheet headers...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Admin!A1:K1',
      valueInputOption: 'RAW',
      resource: {
        values: [ADMIN_HEADERS]
      }
    });
    console.log('✓ Admin headers added');

    // Format Admin headers
    const adminSheetId = (await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: ['Admin']
    })).data.sheets[0].properties.sheetId;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: adminSheetId,
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.8, green: 0.9, blue: 1 },
                  textFormat: { bold: true }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: adminSheetId,
                gridProperties: { frozenRowCount: 1 }
              },
              fields: 'gridProperties.frozenRowCount'
            }
          }
        ]
      }
    });
    console.log('✓ Admin sheet formatted');

    // Check if Officers sheet exists
    const officersSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === 'Officers'
    );

    if (!officersSheet) {
      console.log('\nCreating Officers sheet...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: { title: 'Officers' }
            }
          }]
        }
      });
      console.log('✓ Officers sheet created');
    } else {
      console.log('✓ Officers sheet already exists');
    }

    // Add headers to Officers sheet
    console.log('\nSetting up Officers sheet headers...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Officers!A1:E1',
      valueInputOption: 'RAW',
      resource: {
        values: [OFFICERS_HEADERS]
      }
    });
    console.log('✓ Officers headers added');

    // Format Officers headers
    const officersSheetId = (await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: ['Officers']
    })).data.sheets[0].properties.sheetId;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: officersSheetId,
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.8, green: 0.9, blue: 1 },
                  textFormat: { bold: true }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId: officersSheetId,
                gridProperties: { frozenRowCount: 1 }
              },
              fields: 'gridProperties.frozenRowCount'
            }
          }
        ]
      }
    });
    console.log('✓ Officers sheet formatted');

    console.log('\n=================================');
    console.log('Sheet Setup Complete!');
    console.log('=================================');
    console.log('\nNext steps:');
    console.log('1. Add officers to the Officers sheet');
    console.log('2. Use scripts/generate-password.js to create hashed passwords');
    console.log('3. Start the application with: npm start');
    console.log('\n');

  } catch (error) {
    console.error('\n✗ Setup failed:', error.message);
    console.error('\nPlease check:');
    console.error('- ADMIN_SHEET_ID is correct in .env');
    console.error('- Service account has Editor access to the sheet');
    console.error('- Google Sheets API is enabled');
    process.exit(1);
  }
}

// Run setup
setupSheets();
