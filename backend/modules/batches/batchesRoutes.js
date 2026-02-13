/**
 * Batch Provisioning Routes (Simplified for Supabase-first Architecture)
 *
 * When a new batch is created:
 * - User provides existing main Google Sheet URL
 * - Initialize headers on default tabs
 * - Store mapping in Supabase
 * - Sync leads from main sheet to Supabase
 *
 * NOTE: Officer spreadsheets are no longer created. Officers work from Supabase directly.
 */

const express = require('express');
const router = express.Router();

const { isAdmin } = require('../../../server/middleware/auth');
const { writeSheet, createSheet, sheetExists, getSpreadsheetInfo } = require('../../core/sheets/sheetsClient');
const { listBatches, upsertBatch } = require('../../core/batches/batchesStore');
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

const ADMIN_HEADERS_CORE = [
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

// Admin sheets: core only
const ADMIN_HEADERS = [...ADMIN_HEADERS_CORE];

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

function colToLetter(col) {
  let temp = col;
  let letter = '';
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
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
    const { batchName, mainSpreadsheetUrl } = req.body || {};
    validateBatchName(batchName);

    if (!mainSpreadsheetUrl) {
      return res.status(400).json({ success: false, error: 'Main spreadsheet URL is required' });
    }

    const spreadsheetId = extractSpreadsheetId(mainSpreadsheetUrl);
    if (!spreadsheetId) {
      return res.status(400).json({ success: false, error: 'Invalid main spreadsheet URL' });
    }

    // Validate access to main spreadsheet
    await validateSpreadsheetAccess(spreadsheetId);

    // Ensure default tabs exist on main spreadsheet
    for (const tab of ['Main Leads', 'Extra Leads']) {
      const existing = await sheetExists(spreadsheetId, tab);
      if (!existing) await createSheet(spreadsheetId, tab);
      await writeSheet(spreadsheetId, `${tab}!A1:${colToLetter(ADMIN_HEADERS.length)}1`, [ADMIN_HEADERS]);
    }

    // Store batch in Supabase
    await upsertBatch({ name: batchName, drive_folder_id: null, admin_spreadsheet_id: spreadsheetId });

    // Run initial sync to pull leads into Supabase
    try {
      const syncService = require('./batchSyncService');
      await syncService.syncBatchToSupabase(batchName);
    } catch (syncErr) {
      console.warn(`Initial sync failed for batch ${batchName}:`, syncErr.message);
      // Don't fail batch creation if sync fails - leads can be synced manually later
    }

    res.status(201).json({
      success: true,
      batchName,
      mainSpreadsheet: { id: spreadsheetId, url: mainSpreadsheetUrl },
      note: 'Officer spreadsheets are no longer created. Officers work from Supabase directly.'
    });
  } catch (e) {
    console.error('Batch create error:', e);
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// List officers for batch setup UI (still useful for reference)
router.get('/officers', isAdmin, async (req, res) => {
  try {
    const officers = await listOfficers();
    res.json({ success: true, officers });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
