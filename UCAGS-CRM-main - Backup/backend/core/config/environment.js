/**
 * Environment Configuration
 * Central configuration management for the application
 */

const path = require('path');

// Load .env for local development only.
// On Vercel, environment variables are provided by the platform and should not be overridden.
const envPath = path.resolve(__dirname, '../../../.env');
const isVercel = !!process.env.VERCEL;

if (!isVercel) {
  require('dotenv').config({ path: envPath });
  console.log('🔧 Loaded .env from:', envPath);
} else {
  console.log('🔧 Running on Vercel - using platform environment variables');
}

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    sessionSecret: process.env.SESSION_SECRET || 'ucags-crm-secret-change-this',
    appUrl: process.env.APP_URL || 'http://localhost:3000'
  },

  // Google Service Account Configuration
  // IMPORTANT: Never rely on a default JSON key file in the repo.
  // In production (Vercel), prefer GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY.
  google: {
    // Optional: only if you explicitly provide a path via env var AND the file exists on disk.
    serviceAccountFile: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? path.resolve(__dirname, '../../../', process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : null,
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
    userLeadsTemplateSheet: process.env.USER_LEADS_TEMPLATE_SHEET || 'Shahdhi', // Template to copy

    // Attendance spreadsheet (daily check-in/out)
    attendanceSheetId: process.env.ATTENDANCE_SHEET_ID,

    // Calendar tasks spreadsheet (custom tasks)
    calendarTasksSheetId: process.env.CALENDAR_TASKS_SHEET_ID
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
  },

  // WhatsApp Cloud API (Meta)
  whatsapp: {
    // App Secret (optional) - used for webhook signature verification
    appSecret: process.env.WHATSAPP_APP_SECRET || ''
    ,
    // Graph API
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v19.0',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,

    // Webhook
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,

    // Logging (Google Sheets)
    // Default is the spreadsheet shared by the customer
    logsSheetId: process.env.WHATSAPP_LOGS_SHEET_ID || '19NkSoDX3sBCNcrvpC0zkvXG89_cuIq2qo9agXaHfqSY',

    // Sending helpers
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '94',
    displayPhoneNumber: process.env.WHATSAPP_DISPLAY_PHONE_NUMBER || '',

    // Brochure
    brochurePdfUrl: process.env.WHATSAPP_BROCHURE_PDF_URL || '',
    brochureFilename: process.env.WHATSAPP_BROCHURE_FILENAME || 'UCAGS_Brochure.pdf'
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
