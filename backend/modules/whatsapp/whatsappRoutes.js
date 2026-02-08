/**
 * WhatsApp Routes
 * - Send text
 * - Send brochure PDF
 * - View chat history (from logs)
 * - Admin monitoring/search
 * - Webhook (verify + receive)
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { isAuthenticated, isAdmin } = require('../../../server/middleware/auth');
const { assertLeadAccess } = require('./whatsappAccess');
const { normalizePhoneToE164, sendTextMessage, sendDocumentMessage } = require('./whatsappClient');
const { logMessage, getMessagesForLeadPhone, searchChats } = require('./whatsappLogger');
const { config } = require('../../core/config/environment');

function safeCompare(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// --- Advisor endpoints ---

// GET /api/whatsapp/leads/:leadPhone/history
router.get('/leads/:leadPhone/history', isAuthenticated, async (req, res) => {
  try {
    const { leadPhone } = req.params;
    await assertLeadAccess(req, leadPhone);

    const messages = await getMessagesForLeadPhone(leadPhone);
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({ success: true, messages });
  } catch (error) {
    console.error('WhatsApp history error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// POST /api/whatsapp/leads/:leadPhone/messages
router.post('/leads/:leadPhone/messages', isAuthenticated, async (req, res) => {
  try {
    const { leadPhone } = req.params;
    const { text, leadName } = req.body || {};

    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    await assertLeadAccess(req, leadPhone);

    const toE164 = normalizePhoneToE164(leadPhone, config.whatsapp.defaultCountryCode);
    const result = await sendTextMessage({ to: leadPhone, body: text });

    const waMessageId = result?.messages?.[0]?.id || '';

    await logMessage({
      direction: 'outbound',
      advisor: req.user?.name || req.user?.email || '',
      leadName: leadName || '',
      leadPhoneRaw: leadPhone,
      leadPhoneE164: toE164,
      waFrom: config.whatsapp.displayPhoneNumber || '',
      waTo: toE164,
      messageType: 'text',
      text,
      waMessageId,
      status: 'sent'
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('WhatsApp send text error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// POST /api/whatsapp/leads/:leadPhone/brochure
router.post('/leads/:leadPhone/brochure', isAuthenticated, async (req, res) => {
  try {
    const { leadPhone } = req.params;
    const { leadName } = req.body || {};

    await assertLeadAccess(req, leadPhone);

    const brochureUrl = config.whatsapp.brochurePdfUrl;
    if (!brochureUrl) {
      return res.status(500).json({ success: false, error: 'Brochure PDF URL not configured (WHATSAPP_BROCHURE_PDF_URL)' });
    }

    const toE164 = normalizePhoneToE164(leadPhone, config.whatsapp.defaultCountryCode);
    const result = await sendDocumentMessage({
      to: leadPhone,
      link: brochureUrl,
      filename: config.whatsapp.brochureFilename || 'UCAGS_Brochure.pdf'
    });

    const waMessageId = result?.messages?.[0]?.id || '';

    await logMessage({
      direction: 'outbound',
      advisor: req.user?.name || req.user?.email || '',
      leadName: leadName || '',
      leadPhoneRaw: leadPhone,
      leadPhoneE164: toE164,
      waFrom: config.whatsapp.displayPhoneNumber || '',
      waTo: toE164,
      messageType: 'document',
      documentUrl: brochureUrl,
      waMessageId,
      status: 'sent'
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('WhatsApp send brochure error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// --- Admin monitoring ---

// GET /api/whatsapp/admin/chats?search=
router.get('/admin/chats', isAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    const items = await searchChats({ search });
    // Most recent first
    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ success: true, items, count: items.length });
  } catch (error) {
    console.error('WhatsApp admin search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Webhook ---

// GET /api/whatsapp/webhook
router.get('/webhook', (req, res) => {
  // Meta verification
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && safeCompare(token, config.whatsapp.webhookVerifyToken)) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// POST /api/whatsapp/webhook
router.post('/webhook', async (req, res) => {
  try {
    // NOTE: Signature verification requires raw body. This app uses express.json() globally,
    // so we are not verifying X-Hub-Signature-256 here.

    const body = req.body;

    // Handle messages
    const changes = body?.entry?.[0]?.changes || [];
    for (const ch of changes) {
      const value = ch.value || {};

      // Inbound messages
      const messages = value.messages || [];
      const contacts = value.contacts || [];
      const contactName = contacts?.[0]?.profile?.name || '';

      for (const m of messages) {
        const from = m.from; // wa_id (phone)
        const to = value.metadata?.display_phone_number || '';
        const ts = m.timestamp ? new Date(parseInt(m.timestamp, 10) * 1000).toISOString() : new Date().toISOString();
        const type = m.type;

        await logMessage({
          timestamp: ts,
          direction: 'inbound',
          advisor: '',
          leadName: contactName,
          leadPhoneRaw: from,
          leadPhoneE164: from,
          waFrom: from,
          waTo: to,
          messageType: type,
          text: type === 'text' ? (m.text?.body || '') : '',
          documentUrl: type === 'document' ? (m.document?.link || '') : '',
          waMessageId: m.id,
          status: 'received'
        });
      }

      // Status updates (sent/delivered/read)
      const statuses = value.statuses || [];
      for (const s of statuses) {
        const ts = s.timestamp ? new Date(parseInt(s.timestamp, 10) * 1000).toISOString() : new Date().toISOString();
        await logMessage({
          timestamp: ts,
          direction: 'status',
          advisor: '',
          leadName: '',
          leadPhoneRaw: s.recipient_id || '',
          leadPhoneE164: s.recipient_id || '',
          waFrom: '',
          waTo: s.recipient_id || '',
          messageType: 'status',
          text: '',
          documentUrl: '',
          waMessageId: s.id || '',
          status: s.status || ''
        });
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.sendStatus(200); // always 200 to stop retries; errors are logged
  }
});

module.exports = router;
