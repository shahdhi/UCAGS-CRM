/**
 * Environment Configuration
 * Central configuration management for the application
 */

const path = require('path');

// Load .env from parent directory (root of project)
// Force override=true to ensure our .env takes precedence
const envPath = path.resolve(__dirname, '../../../.env');
require('dotenv').config({ path: envPath, override: true });
console.log('🔧 Loaded .env from:', envPath);

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    sessionSecret: process.env.SESSION_SECRET || 'ucags-crm-secret-change-this',
    appUrl: process.env.APP_URL || 'http://localhost:3000'
  },

  // Google Service Account Configuration
  google: {
    serviceAccountFile: process.env.GOOGLE_APPLICATION_CREDENTIALS 
      ? path.resolve(__dirname, '../../../', process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : path.resolve(__dirname, '../../../ucags-crm-d8465dffdfea.json'),
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY
  },

  // Google Sheets Configuration
  sheets: {
    sheetId: process.env.SHEET_ID,
    sheetName: process.env.SHEET_NAME || 'Batch14', // Default to current batch
    // Legacy support
    adminSheetId: process.env.ADMIN_SHEET_ID,
    adminSheetName: process.env.ADMIN_SHEET_NAME || 'Admin',
    leadsSheetId: process.env.LEADS_SHEET_ID,
    leadsSheetName: process.env.LEADS_SHEET_NAME || 'Batch14', // Default to current batch
    // User-specific leads sheets
    userLeadsSheetId: process.env.USER_LEADS_SHEET_ID,
    userLeadsTemplateSheet: process.env.USER_LEADS_TEMPLATE_SHEET || 'Shahdhi' // Template to copy
  },

  // Gmail Configuration (for future modules)
  gmail: {
    user: process.env.GMAIL_USER,
    delegatedUser: process.env.GMAIL_DELEGATED_USER
  },

  // Calendar Configuration (for future modules)
  calendar: {
    calendarId: process.env.CALENDAR_ID || 'primary'
  },

  // Twilio Configuration (for future modules)
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
  },

  // Admin Credentials
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  },

  // Supabase Configuration
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  }
};

// Validation
function validateConfig() {
  const errors = [];

  // Check for service account configuration
  if (!config.google.serviceAccountFile && !config.google.serviceAccountEmail) {
    errors.push('Google Service Account configuration missing. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_EMAIL');
  }

  // Check for sheet ID
  if (!config.sheets.sheetId && !config.sheets.leadsSheetId) {
    errors.push('Google Sheet ID not configured. Set SHEET_ID or LEADS_SHEET_ID');
  }

  if (errors.length > 0) {
    console.warn('Configuration warnings:');
    errors.forEach(err => console.warn(`  - ${err}`));
  }

  return errors.length === 0;
}

module.exports = {
  config,
  validateConfig
};
