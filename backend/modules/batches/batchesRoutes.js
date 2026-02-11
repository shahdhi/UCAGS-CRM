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
const { createFolder, createSpreadsheetFile } = require('../../core/drive/driveClient');
const { writeSheet } = require('../../core/sheets/sheetsClient');
const { listBatches, upsertBatch, upsertOfficerSheet } = require('../../core/batches/batchesStore');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

const PARENT_FOLDER_ID = process.env.BATCHES_PARENT_FOLDER_ID || '1z1GmTk7JYVNZxRU0sQ6tEC_qGBY9DDEo';

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
  return (users || [])
    .filter(u => (u.user_metadata?.role || 'officer') !== 'admin')
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
    const { batchName } = req.body;
    validateBatchName(batchName);

    // Create folder
    const folder = await createFolder({ name: batchName, parentFolderId: PARENT_FOLDER_ID });

    // Create admin spreadsheet
    const adminFile = await createSpreadsheetFile({ name: `${batchName}-Admin`, parentFolderId: folder.id });

    // Initialize default sheets: Main Leads + Extra Leads
    const { createSheet, sheetExists } = require('../../core/sheets/sheetsClient');

    // Ensure default tabs exist on admin spreadsheet
    for (const tab of ['Main Leads', 'Extra Leads']) {
      const existing = await sheetExists(adminFile.id, tab);
      if (!existing) {
        await createSheet(adminFile.id, tab);
      }
      await writeSheet(adminFile.id, `${tab}!A1:${String.fromCharCode(64 + ADMIN_HEADERS.length)}1`, [ADMIN_HEADERS]);
    }

    // Create officer spreadsheets
    const officers = await listOfficers();
    const officerFiles = [];
    for (const officerName of officers) {
      const file = await createSpreadsheetFile({ name: officerName, parentFolderId: folder.id });

      const { createSheet, sheetExists } = require('../../core/sheets/sheetsClient');
      for (const tab of ['Main Leads', 'Extra Leads']) {
        const existing = await sheetExists(file.id, tab);
        if (!existing) {
          await createSheet(file.id, tab);
        }
        await writeSheet(file.id, `${tab}!A1:${String.fromCharCode(64 + OFFICER_HEADERS.length)}1`, [OFFICER_HEADERS]);
      }
      officerFiles.push({ officerName, spreadsheetId: file.id, url: file.webViewLink });
      await upsertOfficerSheet({ batch_name: batchName, officer_name: officerName, spreadsheet_id: file.id });
    }

    // Store batch
    await upsertBatch({ name: batchName, drive_folder_id: folder.id, admin_spreadsheet_id: adminFile.id });

    res.status(201).json({
      success: true,
      batchName,
      folder,
      adminSpreadsheet: { id: adminFile.id, url: adminFile.webViewLink },
      officerSpreadsheets: officerFiles
    });
  } catch (e) {
    console.error('Batch create error:', e);
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
