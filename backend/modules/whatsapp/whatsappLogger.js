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

function normalizeDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function phoneLooselyMatches(a, b) {
  const da = normalizeDigits(a);
  const db = normalizeDigits(b);
  if (!da || !db) return false;
  return da.endsWith(db) || db.endsWith(da);
}

async function listAllMessages() {
  const spreadsheetId = getLogsSpreadsheetId();
  if (!spreadsheetId) throw new Error('WhatsApp logs spreadsheet not configured');
  const sheetName = await ensureLogsSheetExists();

  const rows = await readSheet(spreadsheetId, `${sheetName}!A2:M`);
  return (rows || []).map(r => ({
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

/**
 * List inbox-style conversations grouped by lead phone.
 * @param {Object} opts
 * @param {string[]} [opts.allowedLeadPhones] - If provided, only include conversations whose lead phone matches any allowed phone.
 * @param {string} [opts.search] - Optional search by name or phone.
 */
async function listConversations({ allowedLeadPhones, search } = {}) {
  const msgs = await listAllMessages();

  const allowed = Array.isArray(allowedLeadPhones) && allowedLeadPhones.length > 0
    ? allowedLeadPhones
    : null;

  // Filter out pure status rows from conversation list (keep inbound/outbound)
  let filtered = msgs.filter(m => m.direction !== 'status');

  if (allowed) {
    filtered = filtered.filter(m => {
      const p = m.leadPhoneRaw || m.leadPhoneE164 || '';
      return allowed.some(a => phoneLooselyMatches(a, p));
    });
  }

  const q = String(search || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(m => {
      const phone = `${m.leadPhoneRaw || ''} ${m.leadPhoneE164 || ''}`.toLowerCase();
      const name = (m.leadName || '').toLowerCase();
      return phone.includes(q) || name.includes(q);
    });
  }

  // Group by lead phone digits (use raw if present, else e164)
  const by = new Map();
  for (const m of filtered) {
    const key = normalizeDigits(m.leadPhoneRaw || m.leadPhoneE164);
    if (!key) continue;

    const existing = by.get(key);
    if (!existing) {
      by.set(key, { key, messages: [m] });
    } else {
      existing.messages.push(m);
    }
  }

  const conversations = [];
  for (const v of by.values()) {
    v.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const last = v.messages[v.messages.length - 1];
    const leadName = [...v.messages].reverse().find(x => x.leadName)?.leadName || '';

    const lastPreview = last.messageType === 'document'
      ? '📎 Document'
      : (last.text || '').slice(0, 120);

    conversations.push({
      leadPhoneKey: v.key,
      leadPhoneRaw: last.leadPhoneRaw || '',
      leadPhoneE164: last.leadPhoneE164 || '',
      leadName,
      lastTimestamp: last.timestamp,
      lastDirection: last.direction,
      lastAdvisor: last.advisor || '',
      lastMessageType: last.messageType,
      lastPreview,
      messageCount: v.messages.length
    });
  }

  // Most recent first
  conversations.sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));
  return conversations;
}

/**
 * Get thread messages for a lead phone, optionally restricted by allowedLeadPhones.
 */
async function getThread({ leadPhone, allowedLeadPhones } = {}) {
  if (!leadPhone) return [];

  if (Array.isArray(allowedLeadPhones) && allowedLeadPhones.length > 0) {
    const ok = allowedLeadPhones.some(a => phoneLooselyMatches(a, leadPhone));
    if (!ok) {
      const err = new Error('Forbidden: lead not assigned to you');
      err.status = 403;
      throw err;
    }
  }

  const messages = await getMessagesForLeadPhone(leadPhone);
  messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return messages;
}

module.exports = {
  logMessage,
  getMessagesForLeadPhone,
  searchChats,
  listConversations,
  getThread,
  normalizeDigits,
  phoneLooselyMatches
};
