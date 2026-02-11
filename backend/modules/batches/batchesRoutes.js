/**
 * New Batch Provisioning Routes
 *
 * When a new batch is created:
 * - Create Drive folder under a configured parent folder
 * - Create Admin spreadsheet for the batch
 * - Create one spreadsheet per officer
 * - Initialize headers
 * - Store mapping in Supabase
 */

const express = require('express');
const router = express.Router();

const { isAdmin } = require('../../../server/middleware/auth');
const { writeSheet, createSheet, sheetExists, getSpreadsheetInfo } = require('../../core/sheets/sheetsClient');
const { listBatches, upsertBatch, upsertOfficerSheet } = require('../../core/batches/batchesStore');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

function extractSpreadsheetId(input) {
  if (!input) return '';
  const s = String(input).trim();
  // Accept raw id or full URL
  // Typical: https://docs.google.com/spreadsheets/d/<ID>/edit
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

async function validateSpreadsheetAccess(spreadsheetId) {
  // throws if not accessible
  await getSpreadsheetInfo(spreadsheetId);
}


const ADMIN_HEADERS = [
  'platform',
  'are_you_planning_to_start_immediately?',
  'why_are_you_interested_in_this_diploma?',
  'full_name',
  'phone',
  'email',
  'ID',
  'status',
  'assigned_to',
  'created_date',
  'notes'
];

// Officer spreadsheets use the SAME structure as admin for that batch
const OFFICER_HEADERS = [...ADMIN_HEADERS];

async function listOfficers() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin not configured');
  const { data: { users }, error } = await sb.auth.admin.listUsers();
  if (error) throw error;

  // Keep in sync with frontend admin email list
  const adminEmails = new Set([
    'admin@ucags.edu.lk',
    'mohamedunais2018@gmail.com'
  ]);

  return (users || [])
    .filter(u => {
      const email = (u.email || '').toLowerCase();
      const role = (u.user_metadata?.role || '').toLowerCase();
      // Exclude admins even if role metadata isn't set
      if (role === 'admin') return false;
      if (adminEmails.has(email)) return false;
      return true;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(u => (u.user_metadata?.name || u.email.split('@')[0]));
}

function validateBatchName(batchName) {
  if (!batchName) throw Object.assign(new Error('Batch name is required'), { status: 400 });
  if (batchName.includes(' ')) throw Object.assign(new Error('Batch name cannot contain spaces'), { status: 400 });
  if (!/^[a-zA-Z0-9_-]+$/.test(batchName)) throw Object.assign(new Error('Batch name can only contain letters, numbers, hyphens, and underscores'), { status: 400 });
}

router.get('/', isAdmin, async (req, res) => {
  try {
    const batches = await listBatches();
    res.json({ success: true, batches });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/create', isAdmin, async (req, res) => {
  try {
    const { batchName, adminSpreadsheetUrl, officerSheets } = req.body || {};
    validateBatchName(batchName);

    if (!adminSpreadsheetUrl) {
      return res.status(400).json({ success: false, error: 'Admin spreadsheet URL is required' });
    }

    const adminSpreadsheetId = extractSpreadsheetId(adminSpreadsheetUrl);
    if (!adminSpreadsheetId) {
      return res.status(400).json({ success: false, error: 'Invalid admin spreadsheet URL' });
    }

    // List officers and require a URL for each
    const officers = await listOfficers();
    if (!officerSheets || typeof officerSheets !== 'object') {
      return res.status(400).json({ success: false, error: 'Officer spreadsheet URLs are required' });
    }

    const missing = officers.filter(name => !officerSheets[name]);
    if (missing.length) {
      return res.status(400).json({ success: false, error: `Missing spreadsheet URL for officers: ${missing.join(', ')}` });
    }

    // Validate access to admin spreadsheet
    await validateSpreadsheetAccess(adminSpreadsheetId);

    // Ensure default tabs exist on admin spreadsheet
    for (const tab of ['Main Leads', 'Extra Leads']) {
      const existing = await sheetExists(adminSpreadsheetId, tab);
      if (!existing) await createSheet(adminSpreadsheetId, tab);
      await writeSheet(adminSpreadsheetId, `${tab}!A1:${String.fromCharCode(64 + ADMIN_HEADERS.length)}1`, [ADMIN_HEADERS]);
    }

    // Store batch first (required due to FK constraint on batch_officer_sheets)
    await upsertBatch({ name: batchName, drive_folder_id: null, admin_spreadsheet_id: adminSpreadsheetId });

    // Validate and initialize officer spreadsheets
    const officerResults = [];
    for (const officerName of officers) {
      const officerSpreadsheetId = extractSpreadsheetId(officerSheets[officerName]);
      if (!officerSpreadsheetId) {
        return res.status(400).json({ success: false, error: `Invalid spreadsheet URL for officer: ${officerName}` });
      }

      await validateSpreadsheetAccess(officerSpreadsheetId);

      for (const tab of ['Main Leads', 'Extra Leads']) {
        const existing = await sheetExists(officerSpreadsheetId, tab);
        if (!existing) await createSheet(officerSpreadsheetId, tab);
        await writeSheet(officerSpreadsheetId, `${tab}!A1:${String.fromCharCode(64 + OFFICER_HEADERS.length)}1`, [OFFICER_HEADERS]);
      }

      await upsertOfficerSheet({ batch_name: batchName, officer_name: officerName, spreadsheet_id: officerSpreadsheetId });
      officerResults.push({ officerName, spreadsheetId: officerSpreadsheetId });
    }

    res.status(201).json({
      success: true,
      batchName,
      adminSpreadsheet: { id: adminSpreadsheetId, url: adminSpreadsheetUrl },
      officerSpreadsheets: officerResults
    });
  } catch (e) {
    console.error('Batch create error:', e);
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// List officers for batch setup UI
router.get('/officers', isAdmin, async (req, res) => {
  try {
    const officers = await listOfficers();
    res.json({ success: true, officers });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
