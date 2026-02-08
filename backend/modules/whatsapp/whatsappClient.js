/**
 * WhatsApp Cloud API client (Meta)
 * Uses fetch to call Graph API.
 */

const { config } = require('../../core/config/environment');

function getFetch() {
  if (typeof fetch === 'function') return fetch;
  throw new Error('Global fetch() is not available in this Node.js runtime. Please run on Node 18+ or add a fetch polyfill.');
}

function normalizePhoneToE164(raw, defaultCountryCode = '94') {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  // Already has country code
  if (digits.startsWith(defaultCountryCode) && digits.length >= defaultCountryCode.length + 7) {
    return digits;
  }

  // Sri Lanka local mobile format: 0XXXXXXXXX (10 digits)
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }

  // If it looks like an international number without +
  if (digits.length >= 11) {
    return digits;
  }

  return digits;
}

async function sendTextMessage({ to, body }) {
  const { phoneNumberId, accessToken, graphApiVersion, defaultCountryCode } = config.whatsapp;
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp configuration missing (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)');
  }

  const toE164 = normalizePhoneToE164(to, defaultCountryCode);
  const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'text',
    text: { body }
  };

  const res = await getFetch()(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || res.statusText;
    throw new Error(`WhatsApp send failed: ${msg}`);
  }
  return json;
}

async function sendDocumentMessage({ to, link, filename }) {
  const { phoneNumberId, accessToken, graphApiVersion, defaultCountryCode } = config.whatsapp;
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp configuration missing (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)');
  }
  if (!link) {
    throw new Error('Document link is required');
  }

  const toE164 = normalizePhoneToE164(to, defaultCountryCode);
  const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'document',
    document: {
      link,
      ...(filename ? { filename } : {})
    }
  };

  const res = await getFetch()(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || res.statusText;
    throw new Error(`WhatsApp document send failed: ${msg}`);
  }
  return json;
}

module.exports = {
  normalizePhoneToE164,
  sendTextMessage,
  sendDocumentMessage
};
