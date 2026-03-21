/**
 * google Edge Function
 * Maps to: /api/google/*
 * Handles Google integrations (Sheets info, Drive, OAuth status).
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { getSpreadsheetInfo, readSheet } from '../_shared/sheets.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /status  — check Google service account configuration
router.get('/status', async (req) => {
  await isAdmin(req);
  const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const hasKey = !!(Deno.env.get('GOOGLE_PRIVATE_KEY'));
  return successResponse({
    configured: !!(email && hasKey),
    serviceAccountEmail: email ?? null,
  });
});

// GET /spreadsheet/:id  — get spreadsheet metadata
router.get('/spreadsheet/:id', async (req, params) => {
  await isAuthenticated(req);
  const info = await getSpreadsheetInfo(params.id);
  return successResponse({
    spreadsheetId: info.spreadsheetId,
    title: info.properties?.title,
    sheets: (info.sheets ?? []).map((s: any) => ({
      id: s.properties?.sheetId,
      title: s.properties?.title,
      index: s.properties?.index,
    })),
  });
});

// GET /spreadsheet/:id/read  — read a range from a spreadsheet
router.get('/spreadsheet/:id/read', async (req, params) => {
  await isAuthenticated(req);
  const url = new URL(req.url);
  const range = url.searchParams.get('range');
  if (!range) return errorResponse('range query param is required', 400);
  const data = await readSheet(params.id, range);
  return successResponse({ values: data });
});

// GET /integrations  — list Google integrations stored in Supabase
router.get('/integrations', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('google_integrations').select('*').order('created_at', { ascending: false });
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return successResponse({ integrations: [] });
    throw error;
  }
  return successResponse({ integrations: data ?? [] });
});

// POST /integrations  — save a Google integration record (admin)
router.post('/integrations', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb.from('google_integrations').upsert({
    ...body,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' }).select('*').single();
  if (error) throw error;
  return successResponse({ integration: data }, 201);
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
