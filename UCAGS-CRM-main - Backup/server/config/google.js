const { google } = require('googleapis');
require('dotenv').config();

// Create JWT client for Google APIs
function getJWTClient(scopes) {
  // Handle the private key - remove extra quotes and handle newlines
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const client = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    scopes
  );

  return client;
}

// Get authenticated Google Sheets client
async function getSheetsClient() {
  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];
  const client = getJWTClient(scopes);
  await client.authorize();
  return google.sheets({ version: 'v4', auth: client });
}

// Get authenticated Gmail client with domain-wide delegation
async function getGmailClient() {
  const scopes = ['https://www.googleapis.com/auth/gmail.send'];
  const client = getJWTClient(scopes);
  
  // Set subject for domain-wide delegation
  if (process.env.GMAIL_DELEGATED_USER) {
    client.subject = process.env.GMAIL_DELEGATED_USER;
  }
  
  await client.authorize();
  return google.gmail({ version: 'v1', auth: client });
}

// Get authenticated Google Calendar client
async function getCalendarClient() {
  const scopes = ['https://www.googleapis.com/auth/calendar'];
  const client = getJWTClient(scopes);
  
  // Set subject for domain-wide delegation if needed
  if (process.env.GMAIL_DELEGATED_USER) {
    client.subject = process.env.GMAIL_DELEGATED_USER;
  }
  
  await client.authorize();
  return google.calendar({ version: 'v3', auth: client });
}

module.exports = {
  getSheetsClient,
  getGmailClient,
  getCalendarClient,
  getJWTClient
};
