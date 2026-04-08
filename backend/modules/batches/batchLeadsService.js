/**
 * Batch Leads Service
 * Uses per-batch spreadsheets created in Google Drive.
 *
 * Admin leads: stored in the batch's admin spreadsheet (Sheet1)
 * Officer leads: stored in the officer's spreadsheet for that batch (Sheet1)
 */

const { readSheet, writeSheet, appendSheet } = require('../../core/sheets/sheetsClient');
const { getBatch, getOfficerSpreadsheetId } = require('../../core/batches/batchesStore');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { getAssigneeForDuplicatePhone } = require('./duplicatePhoneResolver');

const DEFAULT_SHEET = 'Main Leads';

function normalizePhoneToSL(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';

  // Common forms:
  //  - 777533241 (9 digits)
  //  - 0777533241 (10 digits starting 0)
  //  - 94777533241 (11 digits starting 94)
  //  - +94777533241
  if (digits.length === 11 && digits.startsWith('94')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return `94${digits.slice(1)}`;
  if (digits.length === 9) return `94${digits}`;

  // fallback: if it ends with 9 digits, treat those as local
  if (digits.length > 11) {
    const last9 = digits.slice(-9);
    return `94${last9}`;
  }

  return digits;
}

async function findDuplicateAssigneeInBatch({ batchName, phone, excludeLeadId }) {
  const canonical = normalizePhoneToSL(phone);
  if (!canonical || canonical.length < 9) return '';

  const sb = getSupabaseAdmin();
  if (!sb) return '';

  const last9 = canonical.slice(-9);

  // Query a small set of candidates by suffix match then confirm canonical match.
  // (phone values in sheets may contain +, spaces, or may miss country code)
  const { data, error } = await sb
    .from('crm_leads')
    .select('sheet_lead_id, phone, assigned_to, sheet_name')
    .eq('batch_name', batchName)
    .ilike('phone', `%${last9}`)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('Duplicate check query failed:', error.message || error);
    return '';
  }

  for (const r of data || []) {
    if (excludeLeadId && String(r.sheet_lead_id) === String(excludeLeadId)) continue;
    const rCanon = normalizePhoneToSL(r.phone);
    if (!rCanon) continue;
    if (rCanon === canonical && r.assigned_to && String(r.assigned_to).trim()) {
      return String(r.assigned_to).trim();
    }
  }

  return '';
}

function colToLetter(col) {
  let temp = col + 1;
  let letter = '';
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

function buildA1Range(sheetName, startRow, startCol, endRow, endCol) {
  const start = `${colToLetter(startCol)}${startRow}`;
  const end = `${colToLetter(endCol)}${endRow}`;
  return `${sheetName}!${start}:${end}`;
}

function normalizeHeader(h) {
  return String(h || '').trim();
}

async function getHeaderInfo(spreadsheetId, sheetName) {
  const headerRow = await readSheet(spreadsheetId, `${sheetName}!A1:AZ1`);
  const headers = (headerRow && headerRow[0]) ? headerRow[0].map(normalizeHeader) : [];

  const lowerToIndex = new Map();
  headers.forEach((h, i) => {
    if (h) lowerToIndex.set(h.toLowerCase(), i);
  });

  const idx = (name) => lowerToIndex.get(String(name).toLowerCase());

  return {
    headers,
    idx,
    endCol: Math.max(headers.length - 1, 0)
  };
}

function getCell(row, i) {
  if (i == null || i < 0) return '';
  return row[i] != null ? row[i] : '';
}

function parseLeadRow(row, index, headerInfo) {
  const idIdx = headerInfo.idx('ID');
  const fullNameIdx = headerInfo.idx('full_name');

  const id = getCell(row, idIdx) || (index + 1);
  const fullName = getCell(row, fullNameIdx);

  return {
    id,
    full_name: fullName,
    name: fullName || '',
    phone: getCell(row, headerInfo.idx('phone')),
    email: getCell(row, headerInfo.idx('email')),
    platform: getCell(row, headerInfo.idx('platform')),
    are_you_planning_to_start_immediately: getCell(row, headerInfo.idx('are_you_planning_to_start_immediately?')),
    why_are_you_interested_in_this_diploma: getCell(row, headerInfo.idx('why_are_you_interested_in_this_diploma?')),
    status: getCell(row, headerInfo.idx('status')) || 'New',
    assignedTo: getCell(row, headerInfo.idx('assigned_to')),
    createdDate: getCell(row, headerInfo.idx('created_date')),
    notes: getCell(row, headerInfo.idx('notes')),

    // Lead Management fields
    priority: getCell(row, headerInfo.idx('priority')),
    nextFollowUp: getCell(row, headerInfo.idx('next_follow_up')),
    callFeedback: getCell(row, headerInfo.idx('call_feedback')),
    pdfSent: getCell(row, headerInfo.idx('pdf_sent')),
    waSent: getCell(row, headerInfo.idx('wa_sent')),
    emailSent: getCell(row, headerInfo.idx('email_sent')),
    lastFollowUpComment: getCell(row, headerInfo.idx('last_follow_up_comment')),
    followUp1Schedule: getCell(row, headerInfo.idx('followup1_schedule')),
    followUp1Date: getCell(row, headerInfo.idx('followup1_date')),
    followUp1Answered: getCell(row, headerInfo.idx('followup1_answered')),
    followUp1Comment: getCell(row, headerInfo.idx('followup1_comment')),
    followUp2Schedule: getCell(row, headerInfo.idx('followup2_schedule')),
    followUp2Date: getCell(row, headerInfo.idx('followup2_date')),
    followUp2Answered: getCell(row, headerInfo.idx('followup2_answered')),
    followUp2Comment: getCell(row, headerInfo.idx('followup2_comment')),
    followUp3Schedule: getCell(row, headerInfo.idx('followup3_schedule')),
    followUp3Date: getCell(row, headerInfo.idx('followup3_date')),
    followUp3Answered: getCell(row, headerInfo.idx('followup3_answered')),
    followUp3Comment: getCell(row, headerInfo.idx('followup3_comment')),

    // For officer-side filtering UX
    batch: ''
  };
}

function buildRowFromLead(lead, headerInfo) {
  const row = new Array(headerInfo.headers.length).fill('');

  const set = (h, v) => {
    const i = headerInfo.idx(h);
    if (i == null || i < 0) return;
    row[i] = v != null ? v : '';
  };

  set('platform', lead.platform || '');
  set('are_you_planning_to_start_immediately?', lead.are_you_planning_to_start_immediately || '');
  set('why_are_you_interested_in_this_diploma?', lead.why_are_you_interested_in_this_diploma || '');
  set('full_name', lead.full_name || lead.name || '');
  set('phone', lead.phone || '');
  set('email', lead.email || '');
  set('ID', lead.id || '');
  set('status', lead.status || 'New');
  set('assigned_to', lead.assignedTo || '');
  set('created_date', lead.createdDate || '');
  set('notes', lead.notes || '');

  // Lead Management fields
  set('priority', lead.priority || '');
  set('next_follow_up', lead.nextFollowUp || lead.next_follow_up || '');
  set('call_feedback', lead.callFeedback || lead.call_feedback || '');
  set('pdf_sent', lead.pdfSent ?? lead.pdf_sent ?? '');
  set('wa_sent', lead.waSent ?? lead.wa_sent ?? '');
  set('email_sent', lead.emailSent ?? lead.email_sent ?? '');
  // IMPORTANT: use ?? not || so intentionally-cleared empty string does not fall back
  // to older values.
  set('last_follow_up_comment', lead.lastFollowUpComment ?? lead.last_follow_up_comment ?? '');

  set('followup1_schedule', lead.followUp1Schedule || '');
  set('followup1_date', lead.followUp1Date || '');
  set('followup1_answered', lead.followUp1Answered || '');
  set('followup1_comment', lead.followUp1Comment || '');

  set('followup2_schedule', lead.followUp2Schedule || '');
  set('followup2_date', lead.followUp2Date || '');
  set('followup2_answered', lead.followUp2Answered || '');
  set('followup2_comment', lead.followUp2Comment || '');

  set('followup3_schedule', lead.followUp3Schedule || '');
  set('followup3_date', lead.followUp3Date || '');
  set('followup3_answered', lead.followUp3Answered || '');
  set('followup3_comment', lead.followUp3Comment || '');

  return row;
}

async function getAdminSpreadsheetIdForBatch(batchName) {
  const batch = await getBatch(batchName);
  if (!batch?.admin_spreadsheet_id) {
    const err = new Error(`Batch not found or admin spreadsheet not provisioned: ${batchName}`);
    err.status = 404;
    throw err;
  }
  return batch.admin_spreadsheet_id;
}

async function getOfficerSpreadsheetIdForBatch(batchName, officerName) {
  const id = await getOfficerSpreadsheetId(batchName, officerName);
  if (!id) {
    const err = new Error(`Officer spreadsheet not provisioned for ${officerName} in ${batchName}`);
    err.status = 404;
    throw err;
  }
  return id;
}

async function listLeadsFromSpreadsheet(spreadsheetId, sheetName, batchName) {
  const headerInfo = await getHeaderInfo(spreadsheetId, sheetName);
  const rows = await readSheet(spreadsheetId, `${sheetName}!A2:AZ`);
  const leads = (rows || [])
    .filter(r => r && r.length)
    .map((r, i) => {
      const lead = parseLeadRow(r, i, headerInfo);
      lead.batch = batchName;
      return lead;
    })
    .filter(l => l.full_name || l.email || l.phone);
  return { leads, headerInfo };
}

async function getBatchLeads(batchName, sheetName = DEFAULT_SHEET) {
  const spreadsheetId = await getAdminSpreadsheetIdForBatch(batchName);
  return (await listLeadsFromSpreadsheet(spreadsheetId, sheetName, batchName)).leads;
}

async function updateBatchLead(batchName, sheetName = DEFAULT_SHEET, leadId, updates) {
  const spreadsheetId = await getAdminSpreadsheetIdForBatch(batchName);
  const { leads, headerInfo } = await listLeadsFromSpreadsheet(spreadsheetId, sheetName, batchName);

  const idx = leads.findIndex(l => String(l.id) === String(leadId));
  if (idx === -1) {
    const err = new Error('Lead not found');
    err.status = 404;
    throw err;
  }

  const existing = leads[idx];
  const oldAssignedTo = existing.assignedTo;

  // Duplicate-by-phone pre-check (batch-only):
  // Check across ALL batch sheets (admin + all officer sheets + custom tabs).
  // If phone already exists and is assigned, force assignment to that same officer.
  if (updates.assignedTo !== undefined && updates.assignedTo) {
    try {
      const dupAssignedTo = await getAssigneeForDuplicatePhone(batchName, existing.phone || updates.phone);
      if (dupAssignedTo) {
        // Do not auto-assign to the same officer again. Mark as Duplicate.
        updates.assignedTo = 'Duplicate';
      }
    } catch (e) {
      // ignore duplicate-check failures
    }
  }

  const updated = { ...existing, ...updates };

  const rowNumber = idx + 2;
  const row = buildRowFromLead(updated, headerInfo);
  const range = buildA1Range(sheetName, rowNumber, 0, rowNumber, headerInfo.endCol);
  await writeSheet(spreadsheetId, range, [row]);

  // Handle assignment copy/remove
  if (updates.assignedTo !== undefined && updates.assignedTo !== oldAssignedTo) {
    if (oldAssignedTo) {
      await removeLeadFromOfficerBatchSheet(batchName, sheetName, oldAssignedTo, existing);
    }
    if (updates.assignedTo) {
      await copyLeadToOfficerBatchSheet(batchName, sheetName, updates.assignedTo, updated);
    }
  }

  return { ...updated, batch: batchName };
}

async function copyLeadToOfficerBatchSheet(batchName, sheetName, officerName, lead) {
  const spreadsheetId = await getOfficerSpreadsheetIdForBatch(batchName, officerName);
  const { leads, headerInfo } = await listLeadsFromSpreadsheet(spreadsheetId, sheetName, batchName);

  const exists = leads.some(l => String(l.id) === String(lead.id) || (l.email && lead.email && l.email === lead.email));
  if (exists) return { success: true, skipped: true };

  const row = buildRowFromLead({ ...lead, assignedTo: officerName }, headerInfo);
  const range = `${sheetName}!A:${colToLetter(headerInfo.endCol)}`;
  await appendSheet(spreadsheetId, range, [row]);
  return { success: true, copied: true };
}

async function removeLeadFromOfficerBatchSheet(batchName, sheetName, officerName, lead) {
  const spreadsheetId = await getOfficerSpreadsheetIdForBatch(batchName, officerName);
  const { leads, headerInfo } = await listLeadsFromSpreadsheet(spreadsheetId, sheetName, batchName);

  const idx = leads.findIndex(l => String(l.id) === String(lead.id) || (l.email && lead.email && l.email === lead.email));
  if (idx === -1) return { success: true, skipped: true };

  const rowNumber = idx + 2;
  const empty = new Array(headerInfo.headers.length).fill('');
  const range = buildA1Range(sheetName, rowNumber, 0, rowNumber, headerInfo.endCol);
  await writeSheet(spreadsheetId, range, [empty]);
  return { success: true, removed: true };
}

async function getOfficerBatchLeads(batchName, sheetName = DEFAULT_SHEET, officerName) {
  const spreadsheetId = await getOfficerSpreadsheetIdForBatch(batchName, officerName);
  return (await listLeadsFromSpreadsheet(spreadsheetId, sheetName, batchName)).leads;
}

module.exports = {
  getBatchLeads,
  updateBatchLead,
  getOfficerBatchLeads
};
