/**
 * UCAGS CRM - Main Server Entry Point
 * Modular architecture with support for future CRM features
 */

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { config, validateConfig } = require('./core/config/environment');

// Validate configuration on startup
console.log('🔧 Validating configuration...');
console.log('📊 Sheet Configuration:');
console.log('   SHEET_ID:', config.sheets.sheetId);
console.log('   SHEET_NAME:', config.sheets.sheetName);
console.log('   LEADS_SHEET_NAME:', config.sheets.leadsSheetName);
validateConfig();

// Initialize Supabase Admin
const { initializeSupabaseAdmin } = require('./core/supabase/supabaseAdmin');
initializeSupabaseAdmin();

const app = express();

// Trust proxy when running behind Vercel/other reverse proxies (needed for secure cookies)
if (process.env.VERCEL) {
  app.set('trust proxy', 1);
}

// Middleware
app.use(cors());
// Capture raw request body for webhook signature verification (e.g., WhatsApp)
app.use(express.json({
  verify: (req, res, buf) => {
    // Store raw body for signature verification (Buffer)
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Session middleware (required for authentication)
app.use(session({
  secret: config.server.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: config.server.nodeEnv === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
console.log('📡 Loading API routes...');

// Import old server routes for backward compatibility
const authRoutes = require('../server/routes/auth');
const enquiryRoutes = require('../server/routes/enquiry');
const dashboardRoutesOld = require('../server/routes/dashboard');
const officerRoutes = require('../server/routes/officer');
const emailRoutes = require('../server/routes/email');
const calendarRoutes = require('../server/routes/calendar');
const callRoutes = require('../server/routes/call');
const leadsRoutesOld = require('../server/routes/leads');

// Use old routes for existing functionality
app.use('/api/auth', authRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/officers', officerRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/calendar', require('./modules/calendar/followupCalendarRoutes'));
app.use('/api/calendar', require('./modules/calendar/calendarTasksRoutes'));
app.use('/api/call', callRoutes);

// New modular routes (will override old routes if same path)
app.use('/api/leads', require('./modules/leads/leadsRoutes'));
app.use('/api/leads', require('./routes/batches')); // Legacy batch sheet creation
app.use('/api/batches', require('./modules/batches/batchesRoutes')); // New batch provisioning (Drive + per-batch spreadsheets)
app.use('/api/batch-leads', require('./modules/batches/batchLeadsRoutes')); // Per-batch lead CRUD
app.use('/api/user-leads', require('./modules/leads/userLeadsRoutes')); // User-specific leads
app.use('/api/dashboard', require('./modules/dashboard/dashboardRoutes'));

// Placeholder modules (for future implementation)
app.use('/api/users', require('./modules/users/usersRoutes'));
app.use('/api/admissions', require('./modules/admissions/admissionsRoutes'));
app.use('/api/students', require('./modules/students/studentsRoutes'));
app.use('/api/analytics', require('./modules/analytics/analyticsRoutes'));

// Attendance (check-in / check-out)
app.use('/api/attendance', require('./modules/attendance/attendanceRoutes'));

// Receipt generation (Admin only)
// Use renamed module to force complete reload (bypass Node cache)
app.use('/api/receipts', require('./modules/receipts/receiptsRoutes_v10'));

// WhatsApp (disabled): previously used Meta Cloud API routes.
// Replaced with simple WhatsApp Web popup panel in the frontend.
//
// Firefox Containers mapping (Admin helper)
app.use('/api/whatsapp/containers', require('./modules/whatsappContainers/whatsappContainersRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'UCAGS CRM API is running',
    version: '2.0.0',
    modules: {
      leads: 'active',
      dashboard: 'active',
      users: 'placeholder',
      admissions: 'placeholder',
      students: 'placeholder',
      analytics: 'placeholder'
    }
  });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start server (only when running directly; Vercel imports the app as a handler)
const PORT = config.server.port;
if (require.main === module) {
  app.listen(PORT, () => {
  console.log('');
  console.log('=================================================');
  console.log('🚀 UCAGS CRM Server Started');
  console.log('=================================================');
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${config.server.nodeEnv}`);
  console.log(`📊 Google Sheets: ${config.sheets.sheetId ? '✓ Configured' : '⚠ Not configured'}`);
  console.log('=================================================');
  console.log('');
  console.log('Available modules:');
  console.log('  ✓ Leads (Active)');
  console.log('  ✓ Dashboard (Active)');
  console.log('  ⊙ Users (Placeholder)');
  console.log('  ⊙ Admissions (Placeholder)');
  console.log('  ⊙ Students (Placeholder)');
  console.log('  ⊙ Analytics (Placeholder)');
  console.log('');
  });
}

module.exports = app;
