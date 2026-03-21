/**
 * Google Drive Client
 * Creates folders and Google Sheets files in Drive.
 */

const { google } = require('googleapis');
const { config } = require('../config/environment');

let cachedDriveAuth = null;

function normalizeEnv(v) {
  if (v == null) return v;
  let s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

async function getDriveAuth() {
  if (cachedDriveAuth) return cachedDriveAuth;
  const serviceAccountEmail = normalizeEnv(config.google.serviceAccountEmail);
  let privateKey = normalizeEnv(config.google.privateKey);
  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY');
  }
  privateKey = privateKey.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
  ];

  const auth = new google.auth.JWT(serviceAccountEmail, null, privateKey, scopes);
  await auth.authorize();
  cachedDriveAuth = auth;
  return auth;
}

async function getDriveClient() {
  const auth = await getDriveAuth();
  return google.drive({ version: 'v3', auth });
}

async function createFolder({ name, parentFolderId }) {
  const drive = await getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : undefined
    },
    fields: 'id, name, webViewLink'
  });
  return res.data;
}

async function createSpreadsheetFile({ name, parentFolderId }) {
  const drive = await getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: parentFolderId ? [parentFolderId] : undefined
    },
    fields: 'id, name, webViewLink'
  });
  return res.data;
}

module.exports = {
  createFolder,
  createSpreadsheetFile
};
