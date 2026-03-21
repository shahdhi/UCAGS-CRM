/**
 * whatsapp Edge Function
 * Maps to: /api/whatsapp/*
 * Handles WhatsApp Cloud API webhooks and messaging.
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

function getWAConfig() {
  return {
    accessToken: Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '',
    phoneNumberId: Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
    appSecret: Deno.env.get('WHATSAPP_APP_SECRET') ?? '',
    verifyToken: Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? '',
  };
}

// GET /webhook  — webhook verification (public)
router.get('/webhook', async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const { verifyToken } = getWAConfig();

  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return errorResponse('Webhook verification failed', 403);
});

// POST /webhook  — receive incoming messages (public)
router.post('/webhook', async (req) => {
  const sb = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));

  // Log incoming webhook
  try {
    await sb.from('whatsapp_logs').insert({
      direction: 'inbound',
      payload: body,
      created_at: new Date().toISOString(),
    });
  } catch (_) {}

  // Process messages
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const messages = changes?.value?.messages ?? [];

  for (const msg of messages) {
    try {
      const from = msg.from;
      const text = msg.text?.body ?? '';
      const msgId = msg.id;
      const timestamp = msg.timestamp;

      await sb.from('whatsapp_messages').upsert({
        wa_message_id: msgId,
        direction: 'inbound',
        from_number: from,
        body: text,
        message_type: msg.type ?? 'text',
        raw: msg,
        received_at: new Date(Number(timestamp) * 1000).toISOString(),
        created_at: new Date().toISOString(),
      }, { onConflict: 'wa_message_id', ignoreDuplicates: true });
    } catch (_) {}
  }

  return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

// POST /send  — send a WhatsApp message (authenticated)
router.post('/send', async (req) => {
  await isAuthenticated(req);
  const { accessToken, phoneNumberId } = getWAConfig();
  if (!accessToken || !phoneNumberId) return errorResponse('WhatsApp not configured', 500);

  const body = await req.json();
  const { to, message, templateName, templateParams } = body;
  if (!to) return errorResponse('to is required', 400);

  let payload: any;
  if (templateName) {
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: templateParams ? [{ type: 'body', parameters: templateParams.map((p: string) => ({ type: 'text', text: p })) }] : [],
      },
    };
  } else {
    if (!message) return errorResponse('message is required', 400);
    payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: message } };
  }

  const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    return errorResponse(`WhatsApp API error: ${txt}`, resp.status);
  }

  const result = await resp.json();

  // Log outbound
  const sb = getSupabaseAdmin();
  try {
    await sb.from('whatsapp_messages').insert({
      wa_message_id: result?.messages?.[0]?.id ?? null,
      direction: 'outbound',
      to_number: to,
      body: message ?? templateName ?? '',
      message_type: templateName ? 'template' : 'text',
      raw: result,
      created_at: new Date().toISOString(),
    });
  } catch (_) {}

  return successResponse({ result });
});

// GET /messages  — list recent messages (admin)
router.get('/messages', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
  const phone = url.searchParams.get('phone');

  let q = sb.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(limit);
  if (phone) q = q.or(`from_number.eq.${phone},to_number.eq.${phone}`);

  const { data, error } = await q;
  if (error) throw error;
  return successResponse({ messages: data ?? [] });
});

// GET /status  — WhatsApp connection status (admin)
router.get('/status', async (req) => {
  await isAdmin(req);
  const { accessToken, phoneNumberId } = getWAConfig();
  const configured = !!(accessToken && phoneNumberId);
  return successResponse({ configured, phoneNumberId: phoneNumberId || null });
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const res = await router.handle(req);
    if (res) return res;
    return errorResponse('Not found', 404);
  } catch (e: any) {
    return errorResponse(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
