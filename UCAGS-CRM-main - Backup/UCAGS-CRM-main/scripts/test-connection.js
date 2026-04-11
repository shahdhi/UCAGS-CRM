#!/usr/bin/env node

/**
 * Test Google API Connections for UCAGS CRM
 * 
 * Usage: node scripts/test-connection.js
 */

require('dotenv').config();
const { getSheetsClient, getGmailClient, getCalendarClient } = require('../server/config/google');

async function testConnection() {
  console.log('\n=================================');
  console.log('UCAGS CRM - Connection Test');
  console.log('=================================\n');

  // Test Google Sheets API
  console.log('Testing Google Sheets API...');
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: process.env.ADMIN_SHEET_ID
    });
    console.log('✓ Google Sheets API: Connected');
    console.log('  Sheet Name:', response.data.properties.title);
  } catch (error) {
    console.log('✗ Google Sheets API: Failed');
    console.log('  Error:', error.message);
  }

  // Test Gmail API
  console.log('\nTesting Gmail API...');
  try {
    const gmail = await getGmailClient();
    const response = await gmail.users.getProfile({
      userId: 'me'
    });
    console.log('✓ Gmail API: Connected');
    console.log('  Email:', response.data.emailAddress);
  } catch (error) {
    console.log('✗ Gmail API: Failed');
    console.log('  Error:', error.message);
  }

  // Test Calendar API
  console.log('\nTesting Google Calendar API...');
  try {
    const calendar = await getCalendarClient();
    const response = await calendar.calendarList.list({
      maxResults: 1
    });
    console.log('✓ Calendar API: Connected');
    console.log('  Calendars found:', response.data.items.length);
  } catch (error) {
    console.log('✗ Calendar API: Failed');
    console.log('  Error:', error.message);
  }

  console.log('\n=================================');
  console.log('Connection Test Complete');
  console.log('=================================\n');
}

// Run test
testConnection().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
