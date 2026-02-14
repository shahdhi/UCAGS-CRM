/**
 * Batch Leads Routes
 *
 * Admin: manage leads inside a batch's admin spreadsheet.
 * Officer: read leads assigned to them for a batch.
 */

const express = require('express');
const router = express.Router();

const { isAdmin, isAuthenticated } = require('../../../server/middleware/auth');
const svc = require('./batchLeadsService');

// List all batches for both roles (read-only for officers)
const { listBatches } = require('../../core/batches/batchesStore');
const sheetsSvc = require('./batchSheetsService');

router.get('/batches', isAuthenticated, async (req, res) => {
  try {
    const batches = await listBatches();
    res.json({ success: true, batches });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Admin: upgrade officer sheet headers for all batches/sheets
router.post('/upgrade-officer-headers', isAdmin, async (req, res) => {
  try {
    const batches = await listBatches();
    const results = [];
    for (const b of batches) {
      try {
        results.push(await sheetsSvc.upgradeOfficerHeadersForBatch(b));
      } catch (e) {
        results.push({ success: false, batchName: b, error: e.message });
      }
    }
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Admin: get leads in a batch
// List sheets for a batch (admin + officers)
router.get('/:batchName/sheets', isAuthenticated, async (req, res) => {
  try {
    const force = String(req.query.force || '') === '1';
    const sheets = await sheetsSvc.listSheetsForBatch(req.params.batchName, { force });
    res.json({ success: true, sheets, cached: !force });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: list sheets for a specific officer (including officer-created custom tabs)
router.get('/:batchName/officer/:officerName/sheets', isAdmin, async (req, res) => {
  try {
    const { listOfficerSheets } = require('./officerSheetsService');
    const force = String(req.query.force || '') === '1';
    const sheets = await listOfficerSheets(req.params.batchName, req.params.officerName, { force });
    res.json({ success: true, sheets, cached: !force });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Officer: list my own sheets for a batch (officer-only tab additions)
router.get('/:batchName/my-sheets', isAuthenticated, async (req, res) => {
  try {
    const { listOfficerSheets } = require('./officerSheetsService');
    const force = String(req.query.force || '') === '1';
    const officerName = req.user?.name;
    const sheets = await listOfficerSheets(req.params.batchName, officerName, { force });
    res.json({ success: true, sheets, cached: !force });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Officer: list custom sheets I created (for UI permissions)
router.get('/:batchName/my-custom-sheets', isAuthenticated, async (req, res) => {
  try {
    const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
    const sb = getSupabaseAdmin();
    if (!sb) return res.json({ success: true, sheets: [] });

    const { data, error } = await sb
      .from('officer_custom_sheets')
      .select('sheet_name')
      .eq('batch_name', req.params.batchName)
      .eq('officer_name', req.user?.name);

    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('relation') && msg.includes('does not exist')) {
        return res.json({ success: true, sheets: [] });
      }
      throw error;
    }

    res.json({ success: true, sheets: (data || []).map(r => r.sheet_name).filter(Boolean) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Officer: create a sheet/tab for me only (does not affect admin/other officers)
router.post('/:batchName/my-sheets', isAuthenticated, async (req, res) => {
  try {
    const { createOfficerOnlySheet } = require('./officerSheetsService');
    const officerName = req.user?.name;
    const { sheetName } = req.body || {};
    const result = await createOfficerOnlySheet(req.params.batchName, officerName, sheetName);
    res.status(201).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Officer: delete a sheet/tab for me only
router.delete('/:batchName/my-sheets/:sheetName', isAuthenticated, async (req, res) => {
  try {
    const { deleteOfficerOnlySheet } = require('./officerSheetsService');
    const officerName = req.user?.name;
    const result = await deleteOfficerOnlySheet(req.params.batchName, officerName, req.params.sheetName);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: delete a sheet/tab for a batch (propagates to all officer spreadsheets)
router.delete('/:batchName/sheets/:sheetName', isAdmin, async (req, res) => {
  try {
    await sheetsSvc.deleteSheetForBatch(req.params.batchName, req.params.sheetName);
    const sheets = await sheetsSvc.listSheetsForBatch(req.params.batchName, { force: true });
    res.json({ success: true, sheets });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Create a new sheet/tab for a batch (admin only). Propagates to all officer spreadsheets.
router.post('/:batchName/sheets', isAdmin, async (req, res) => {
  try {
    const { sheetName } = req.body || {};
    await sheetsSvc.createSheetForBatch(req.params.batchName, sheetName);
    const sheets = await sheetsSvc.listSheetsForBatch(req.params.batchName);
    res.status(201).json({ success: true, sheets });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

router.get('/:batchName/leads', isAdmin, async (req, res) => {
  try {
    const sheet = req.query.sheet || 'Main Leads';
    const leads = await svc.getBatchLeads(req.params.batchName, sheet);
    res.json({ success: true, count: leads.length, leads });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: update lead in a batch (assignment handled here)
router.put('/:batchName/leads/:leadId', isAdmin, async (req, res) => {
  try {
    const sheet = req.query.sheet || 'Main Leads';
    const lead = await svc.updateBatchLead(req.params.batchName, sheet, req.params.leadId, req.body || {});
    res.json({ success: true, lead });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Officer: get leads for me in a batch
router.get('/:batchName/my-leads', isAuthenticated, async (req, res) => {
  try {
    const officerName = req.user?.name;
    const sheet = req.query.sheet || 'Main Leads';
    const leads = await svc.getOfficerBatchLeads(req.params.batchName, sheet, officerName);
    res.json({ success: true, count: leads.length, leads });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Officer: update my lead management fields for a lead in a batch (writes into officer spreadsheet)
router.put('/:batchName/my-leads/:leadId', isAuthenticated, async (req, res) => {
  try {
    const officerName = req.user?.name;
    const sheet = req.query.sheet || 'Main Leads';

    // Update in officer spreadsheet by reusing updateBatchLead on officer sheet via a small wrapper
    const { getOfficerSpreadsheetId } = require('../../core/batches/batchesStore');
    const { writeSheet, readSheet } = require('../../core/sheets/sheetsClient');

    // Load officer sheet leads and find row
    const spreadsheetId = await require('../../core/batches/batchesStore').getOfficerSpreadsheetId(req.params.batchName, officerName);
    if (!spreadsheetId) {
      return res.status(404).json({ success: false, error: 'Officer sheet not configured for this batch' });
    }

    // We can call service internal helper by updating through svc.updateBatchLead if we expose it; for now, re-use admin update by directly calling svc.getOfficerBatchLeads and then writing row.
    const leads = await svc.getOfficerBatchLeads(req.params.batchName, sheet, officerName);
    const idx = leads.findIndex(l => String(l.id) === String(req.params.leadId));
    if (idx === -1) return res.status(404).json({ success: false, error: 'Lead not found' });

    const updated = { ...leads[idx], ...(req.body || {}) };

    // Compute last_follow_up_comment only if the client did NOT send it.
    // IMPORTANT: empty string is a valid value meaning "cleared".
    if (updated.lastFollowUpComment === undefined) {
      updated.lastFollowUpComment = updated.followUp3Comment || updated.followUp2Comment || updated.followUp1Comment || '';
    }

    // Build row using batchLeadsService header mapping
    const headerInfo = await (async () => {
      const headerRow = await readSheet(spreadsheetId, `${sheet}!A1:AZ1`);
      const headers = (headerRow && headerRow[0]) ? headerRow[0].map(h => String(h || '').trim()) : [];
      const lowerToIndex = new Map();
      headers.forEach((h, i) => { if (h) lowerToIndex.set(h.toLowerCase(), i); });
      const idxFn = (name) => lowerToIndex.get(String(name).toLowerCase());
      return { headers, idx: idxFn, endCol: Math.max(headers.length - 1, 0) };
    })();

    const row = require('./batchLeadsService').__buildRowFromLeadForInternal
      ? require('./batchLeadsService').__buildRowFromLeadForInternal(updated, headerInfo)
      : null;

    // If internal not exposed, rebuild minimal row here
    const rowArr = new Array(headerInfo.headers.length).fill('');
    const set = (h, v) => {
      const i = headerInfo.idx(h);
      if (i == null || i < 0) return;
      rowArr[i] = v != null ? v : '';
    };

    set('platform', updated.platform || '');
    set('are_you_planning_to_start_immediately?', updated.are_you_planning_to_start_immediately || '');
    set('why_are_you_interested_in_this_diploma?', updated.why_are_you_interested_in_this_diploma || '');
    set('full_name', updated.full_name || updated.name || '');
    set('phone', updated.phone || '');
    set('email', updated.email || '');
    set('ID', updated.id || '');
    set('status', updated.status || '');
    set('assigned_to', updated.assignedTo || '');
    set('created_date', updated.createdDate || '');
    set('notes', updated.notes || '');

    set('priority', updated.priority || '');
    set('next_follow_up', updated.nextFollowUp || '');
    set('call_feedback', updated.callFeedback || '');
    set('pdf_sent', updated.pdfSent ?? '');
    set('wa_sent', updated.waSent ?? '');
    set('email_sent', updated.emailSent ?? '');
    set('last_follow_up_comment', updated.lastFollowUpComment ?? '');

    set('followup1_schedule', updated.followUp1Schedule || '');
    set('followup1_date', updated.followUp1Date || '');
    set('followup1_answered', updated.followUp1Answered || '');
    set('followup1_comment', updated.followUp1Comment || '');

    set('followup2_schedule', updated.followUp2Schedule || '');
    set('followup2_date', updated.followUp2Date || '');
    set('followup2_answered', updated.followUp2Answered || '');
    set('followup2_comment', updated.followUp2Comment || '');

    set('followup3_schedule', updated.followUp3Schedule || '');
    set('followup3_date', updated.followUp3Date || '');
    set('followup3_answered', updated.followUp3Answered || '');
    set('followup3_comment', updated.followUp3Comment || '');

    const colToLetter = (col) => {
      let temp = col + 1;
      let letter = '';
      while (temp > 0) {
        let rem = (temp - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        temp = Math.floor((temp - 1) / 26);
      }
      return letter;
    };

    const rowNumber = idx + 2;
    const range = `${sheet}!A${rowNumber}:${colToLetter(headerInfo.endCol)}${rowNumber}`;
    await writeSheet(spreadsheetId, range, [rowArr]);

    res.json({ success: true, lead: updated });
  } catch (e) {
    console.error('PUT /my-leads error', e);
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
