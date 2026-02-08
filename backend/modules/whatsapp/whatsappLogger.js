/**
 * WhatsApp message logger backed by Google Sheets.
 */

const { appendSheet, readSheet, sheetExists, createSheet } = require('../../core/sheets/sheetsClient');
const { config } = require('../../core/config/environment');

const DEFAULT_SHEET_TITLE = 'whatsapp_message_logs';

function getLogsSpreadsheetId() {
  // Default to the spreadsheet shared by the customer (can be overridden by env)
  return config.whatsapp.logsSheetId;
}

async function ensureLogsSheetExists() {
  const spreadsheetId = getLogsSpreadsheetId();
  if (!spreadsheetId) throw new Error('WhatsApp logs spreadsheet not configured');

  const exists = await sheetExists(spreadsheetId, DEFAULT_SHEET_TITLE);
  if (!exists) {
    await createSheet(spreadsheetId, DEFAULT_SHEET_TITLE);
    // Add headers
    const headers = [[
      'timestamp',
      'direction',
      'advisor',
      'lead_name',
      'lead_phone_raw',
      'lead_phone_e164',
      'wa_from',
      'wa_to',
      'message_type',
      'text',
      'document_url',
      'wa_message_id',
      'status'
    ]];
    await appendSheet(spreadsheetId, `${DEFAULT_SHEET_TITLE}!A1:M1`, headers);
  }
  return DEFAULT_SHEET_TITLE;
}

async function logMessage(entry) {
  const spreadsheetId = getLogsSpreadsheetId();
  if (!spreadsheetId) throw new Error('WhatsApp logs spreadsheet not configured');

  const sheetName = await ensureLogsSheetExists();
  const ts = entry.timestamp || new Date().toISOString();

  const row = [
    ts,
    entry.direction || '',
    entry.advisor || '',
    entry.leadName || '',
    entry.leadPhoneRaw || '',
    entry.leadPhoneE164 || '',
    entry.waFrom || '',
    entry.waTo || '',
    entry.messageType || '',
    entry.text || '',
    entry.documentUrl || '',
    entry.waMessageId || '',
    entry.status || ''
  ];

  await appendSheet(spreadsheetId, `${sheetName}!A:M`, [row]);
}

async function getMessagesForLeadPhone(leadPhoneRaw) {
  const spreadsheetId = getLogsSpreadsheetId();
  if (!spreadsheetId) throw new Error('WhatsApp logs spreadsheet not configured');
  const sheetName = await ensureLogsSheetExists();

  const rows = await readSheet(spreadsheetId, `${sheetName}!A2:M`);
  const q = String(leadPhoneRaw || '').replace(/\D/g, '');

  // columns:
  // 3 lead_name, 4 lead_phone_raw, 5 lead_phone_e164
  const filtered = (rows || []).filter(r => {
    const raw = String(r[4] || '').replace(/\D/g, '');
    const e164 = String(r[5] || '').replace(/\D/g, '');
    return q && (raw.endsWith(q) || q.endsWith(raw) || e164.endsWith(q) || q.endsWith(e164));
  });

  return filtered.map(r => ({
    timestamp: r[0],
    direction: r[1],
    advisor: r[2],
    leadName: r[3],
    leadPhoneRaw: r[4],
    leadPhoneE164: r[5],
    waFrom: r[6],
    waTo: r[7],
    messageType: r[8],
    text: r[9],
    documentUrl: r[10],
    waMessageId: r[11],
    status: r[12]
  }));
}

async function searchChats({ search }) {
  const spreadsheetId = getLogsSpreadsheetId();
  if (!spreadsheetId) throw new Error('WhatsApp logs spreadsheet not configured');
  const sheetName = await ensureLogsSheetExists();

  const rows = await readSheet(spreadsheetId, `${sheetName}!A2:M`);
  const q = String(search || '').trim().toLowerCase();

  const mapped = (rows || []).map(r => ({
    timestamp: r[0],
    direction: r[1],
    advisor: r[2],
    leadName: r[3],
    leadPhoneRaw: r[4],
    leadPhoneE164: r[5],
    waFrom: r[6],
    waTo: r[7],
    messageType: r[8],
    text: r[9],
    documentUrl: r[10],
    waMessageId: r[11],
    status: r[12]
  }));

  if (!q) return mapped;

  return mapped.filter(m => {
    const phone = `${m.leadPhoneRaw || ''} ${m.leadPhoneE164 || ''}`.toLowerCase();
    const name = (m.leadName || '').toLowerCase();
    return name.includes(q) || phone.includes(q);
  });
}

module.exports = {
  logMessage,
  getMessagesForLeadPhone,
  searchChats
};
