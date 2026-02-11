/**
 * Follow-up Calendar Service
 *
 * Builds a calendar feed from officer sheet follow-up schedule dates.
 *
 * We treat a follow-up as PENDING when:
 *  - followupN_schedule is set AND followupN_date (actual) is empty
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { getSpreadsheetInfo, readSheet } = require('../../core/sheets/sheetsClient');
const { listBatches, getBatch } = require('../../core/batches/batchesStore');

function normalizeHeader(h) {
  return String(h || '').trim();
}

function buildHeaderInfo(headers) {
  const lowerToIndex = new Map();
  headers.forEach((h, i) => {
    if (h) lowerToIndex.set(h.toLowerCase(), i);
  });
  const idx = (name) => lowerToIndex.get(String(name).toLowerCase());
  return { headers, idx };
}

function getCell(row, i) {
  if (i == null || i < 0) return '';
  return row[i] != null ? row[i] : '';
}

function parseLead(row, headerInfo) {
  const id = getCell(row, headerInfo.idx('ID'));
  return {
    id,
    full_name: getCell(row, headerInfo.idx('full_name')),
    phone: getCell(row, headerInfo.idx('phone')),
    email: getCell(row, headerInfo.idx('email')),
    assigned_to: getCell(row, headerInfo.idx('assigned_to')),
    status: getCell(row, headerInfo.idx('status')),
    next_follow_up: getCell(row, headerInfo.idx('next_follow_up')),
    followup1_schedule: getCell(row, headerInfo.idx('followup1_schedule')),
    followup1_date: getCell(row, headerInfo.idx('followup1_date')),
    followup1_comment: getCell(row, headerInfo.idx('followup1_comment')),
    followup2_schedule: getCell(row, headerInfo.idx('followup2_schedule')),
    followup2_date: getCell(row, headerInfo.idx('followup2_date')),
    followup2_comment: getCell(row, headerInfo.idx('followup2_comment')),
    followup3_schedule: getCell(row, headerInfo.idx('followup3_schedule')),
    followup3_date: getCell(row, headerInfo.idx('followup3_date')),
    followup3_comment: getCell(row, headerInfo.idx('followup3_comment'))
  };
}

function getPendingFollowups(lead) {
  const items = [];
  for (const n of [1, 2, 3]) {
    const schedule = lead[`followup${n}_schedule`];
    const actual = lead[`followup${n}_date`];
    if (schedule && !actual) {
      items.push({ n, date: schedule, comment: lead[`followup${n}_comment`] || '' });
    }
  }
  return items;
}

async function listOfficerSpreadsheetIdsForBatch(batchName) {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin not configured');

  const { data, error } = await sb
    .from('batch_officer_sheets')
    .select('officer_name, spreadsheet_id')
    .eq('batch_name', batchName);

  if (error) throw error;
  return (data || []).filter(r => r.spreadsheet_id);
}

async function listSheetTitles(spreadsheetId) {
  const info = await getSpreadsheetInfo(spreadsheetId);
  return (info.sheets || []).map(s => s.properties.title).filter(Boolean);
}

async function buildEventsForOfficerSpreadsheet({ batchName, officerName, spreadsheetId, sheetTitle }) {
  const headerRow = await readSheet(spreadsheetId, `${sheetTitle}!A1:AZ1`);
  const headers = (headerRow && headerRow[0]) ? headerRow[0].map(normalizeHeader) : [];
  if (!headers.length) return [];
  const headerInfo = buildHeaderInfo(headers);

  const rows = await readSheet(spreadsheetId, `${sheetTitle}!A2:AZ`);
  const events = [];

  (rows || []).forEach((row) => {
    if (!row || row.length === 0) return;
    const lead = parseLead(row, headerInfo);
    if (!lead.id && !lead.phone && !lead.email) return;

    const pending = getPendingFollowups(lead);
    for (const p of pending) {
      events.push({
        date: p.date,
        batchName,
        sheetName: sheetTitle,
        officerName,
        leadId: lead.id,
        full_name: lead.full_name,
        phone: lead.phone,
        followUpNo: p.n,
        comment: p.comment
      });
    }
  });

  return events;
}

async function getCalendarEvents({ userRole, officerName, officerFilter }) {
  const batches = await listBatches();
  const all = [];

  for (const batchName of batches) {
    const officerSheets = await listOfficerSpreadsheetIdsForBatch(batchName);

    for (const os of officerSheets) {
      if (userRole !== 'admin' && os.officer_name !== officerName) continue;
      if (userRole === 'admin') {
        // By default admin sees only own follow-ups unless officerFilter is provided
        if (!officerFilter && os.officer_name !== officerName) continue;
        if (officerFilter && officerFilter !== 'all' && os.officer_name !== officerFilter) continue;
      }

      const spreadsheetId = os.spreadsheet_id;
      const titles = await listSheetTitles(spreadsheetId);
      const usableTitles = titles.filter(t => t !== 'Sheet1');

      for (const sheetTitle of usableTitles) {
        const events = await buildEventsForOfficerSpreadsheet({
          batchName,
          officerName: os.officer_name,
          spreadsheetId,
          sheetTitle
        });
        all.push(...events);
      }
    }
  }

  // Split overdue/upcoming (compare datetime-local or date strings lexically)
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const nowStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const normalizeForCompare = (v) => {
    const s = String(v || '').trim();
    // If only date is provided, treat as end-of-day so it stays upcoming until the day ends.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59`;
    // If datetime-local without seconds, OK. If has seconds, still OK.
    return s;
  };

  const overdue = all
    .filter(e => normalizeForCompare(e.date) < nowStr)
    .sort((a, b) => normalizeForCompare(a.date).localeCompare(normalizeForCompare(b.date)));
  const upcoming = all
    .filter(e => normalizeForCompare(e.date) >= nowStr)
    .sort((a, b) => normalizeForCompare(a.date).localeCompare(normalizeForCompare(b.date)));

  return { now: nowStr, overdue, upcoming, count: all.length };
}

module.exports = {
  getCalendarEvents
};
