const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');

const router = express.Router();

const { isAuthenticated } = require('../../../server/middleware/auth');
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { config } = require('../../core/config/environment');

function clean(s) {
  return String(s || '').trim();
}

function mustGetGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [
      !clientId ? 'GOOGLE_CLIENT_ID' : null,
      !clientSecret ? 'GOOGLE_CLIENT_SECRET' : null,
      !redirectUri ? 'GOOGLE_OAUTH_REDIRECT_URI' : null
    ].filter(Boolean);
    const err = new Error(`Google OAuth not configured. Missing: ${missing.join(', ')}`);
    err.status = 500;
    throw err;
  }

  return { clientId, clientSecret, redirectUri };
}

function getOAuthClient() {
  const { clientId, clientSecret, redirectUri } = mustGetGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function userKey(user) {
  // Prefer Supabase auth UUID when available, fall back to legacy session username.
  if (user?.id) return { kind: 'user_id', value: String(user.id) };
  if (user?.username) return { kind: 'username', value: String(user.username) };
  // last resort (shouldn't happen with isAuthenticated)
  return { kind: 'username', value: String(user?.email || user?.name || 'unknown') };
}

function signState(payloadObj) {
  const secret = config.server.sessionSecret || process.env.SESSION_SECRET || 'ucags-crm-secret-change-this';
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyState(state) {
  const secret = config.server.sessionSecret || process.env.SESSION_SECRET || 'ucags-crm-secret-change-this';
  const [payloadB64, sig] = String(state || '').split('.');
  if (!payloadB64 || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function getIntegrationRow(sb, key) {
  let q = sb.from('google_integrations').select('*').eq('provider', 'google').limit(1);
  if (key.kind === 'user_id') q = q.eq('user_id', key.value);
  else q = q.eq('username', key.value);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertIntegrationRow(sb, key, patch) {
  const row = {
    provider: 'google',
    user_id: key.kind === 'user_id' ? key.value : null,
    username: key.kind === 'username' ? key.value : null,
    updated_at: new Date().toISOString(),
    ...patch
  };

  // We rely on unique indexes in DB; for safety, do a read-then-upsert by id when available.
  const existing = await getIntegrationRow(sb, key);
  if (existing?.id) {
    const { data, error } = await sb
      .from('google_integrations')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await sb
    .from('google_integrations')
    .insert({
      ...row,
      created_at: new Date().toISOString()
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * GET /api/google/oauth/connect-url
 * Returns the Google OAuth consent URL as JSON.
 * This exists because browser redirects to /oauth/connect do NOT include Bearer tokens.
 */
router.get('/oauth/connect-url', isAuthenticated, async (req, res) => {
  try {
    const oauth2 = getOAuthClient();
    const user = req.user || req.session?.user || {};
    const key = userKey(user);

    // Build an absolute returnTo URL so the callback redirect always goes to the
    // correct domain (e.g. ucags.online) regardless of where the API is hosted.
    const appOrigin = (process.env.APP_URL || '').replace(/\/$/, '');
    const rawReturnTo = clean(req.query.returnTo) || '/#contacts';
    // If the client already sent an absolute URL, use it; otherwise prefix with APP_URL.
    const returnTo = rawReturnTo.startsWith('http') ? rawReturnTo : `${appOrigin}${rawReturnTo}`;

    const state = signState({
      k: key,
      ts: Date.now(),
      returnTo
    });

    const scopes = [
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      include_granted_scopes: true,
      state
    });

    return res.json({ success: true, url });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/google/oauth/connect
 * Legacy redirect endpoint (works for cookie-based sessions). For Bearer-token auth,
 * use /oauth/connect-url then redirect client-side.
 */
router.get('/oauth/connect', isAuthenticated, async (req, res) => {
  try {
    const oauth2 = getOAuthClient();
    const user = req.user || req.session?.user || {};
    const key = userKey(user);

    // Build an absolute returnTo URL so the callback redirect always goes to the
    // correct domain (e.g. ucags.online) regardless of where the API is hosted.
    const appOrigin = (process.env.APP_URL || '').replace(/\/$/, '');
    const rawReturnTo = clean(req.query.returnTo) || '/#contacts';
    const returnTo = rawReturnTo.startsWith('http') ? rawReturnTo : `${appOrigin}${rawReturnTo}`;

    const state = signState({
      k: key,
      ts: Date.now(),
      returnTo
    });

    const scopes = [
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      include_granted_scopes: true,
      state
    });

    return res.redirect(url);
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/google/oauth/callback
 * Exchanges code -> tokens, stores refresh token.
 */
router.get('/oauth/callback', async (req, res) => {
  try {
    const code = clean(req.query.code);
    const stateRaw = clean(req.query.state);
    const state = verifyState(stateRaw);

    if (!code) return res.status(400).send('Missing code');
    if (!state?.k?.kind || !state?.k?.value) return res.status(400).send('Invalid state');

    // Basic expiry (10 minutes)
    if (state.ts && Date.now() - Number(state.ts) > 10 * 60 * 1000) {
      return res.status(400).send('State expired. Please try again.');
    }

    const oauth2 = getOAuthClient();
    const { tokens } = await oauth2.getToken(code);

    const sb = getSupabaseAdmin();
    if (!sb) throw new Error('Supabase admin not configured');

    // fetch email for display
    let googleEmail = null;
    try {
      if (tokens.access_token) {
        oauth2.setCredentials({ access_token: tokens.access_token });
        const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
        const me = await oauth2Api.userinfo.get();
        googleEmail = me?.data?.email || null;
      }
    } catch (err) {
      console.warn('Google userinfo fetch failed:', err?.message || err);
    }

    const key = state.k;
    const existing = await getIntegrationRow(sb, key);

    // refresh_token is only returned on first consent (or when prompt=consent)
    const refreshTokenToStore = tokens.refresh_token || existing?.refresh_token || null;

    await upsertIntegrationRow(sb, key, {
      refresh_token: refreshTokenToStore,
      access_token: tokens.access_token || null,
      scope: tokens.scope || null,
      token_type: tokens.token_type || null,
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      google_email: googleEmail
    });

    // Redirect back to UI
    const returnTo = state.returnTo || '/#contacts';
    return res.redirect(returnTo);
  } catch (e) {
    console.error('OAuth callback error:', e);
    // Keep it simple (human readable) because it's a browser redirect
    res.status(e.status || 500).send(e.message || 'OAuth callback failed');
  }
});

/**
 * GET /api/google/status
 */
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error('Supabase admin not configured');

    const user = req.user || req.session?.user || {};
    const key = userKey(user);
    const row = await getIntegrationRow(sb, key);

    res.json({
      success: true,
      connected: !!row?.refresh_token,
      googleEmail: row?.google_email || null
    });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/google/disconnect
 */
router.post('/disconnect', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error('Supabase admin not configured');

    const user = req.user || req.session?.user || {};
    const key = userKey(user);
    const existing = await getIntegrationRow(sb, key);
    if (!existing?.id) {
      return res.json({ success: true, disconnected: true });
    }

    const { error } = await sb
      .from('google_integrations')
      .update({ refresh_token: null, access_token: null, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;

    res.json({ success: true, disconnected: true });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

async function getAuthedPeopleClientForUser(req) {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin not configured');

  const user = req.user || req.session?.user || {};
  const key = userKey(user);
  const row = await getIntegrationRow(sb, key);
  if (!row?.refresh_token) {
    const err = new Error('Google not connected. Please connect Google Contacts first.');
    err.status = 400;
    throw err;
  }

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({ refresh_token: row.refresh_token });
  return google.people({ version: 'v1', auth: oauth2 });
}

/**
 * POST /api/google/contacts/sync
 * Bulk sync contacts to Google (push-only).
 * Body: { ids?: string[] }
 * If ids not provided, syncs all contacts accessible to the current user.
 */
router.post('/contacts/sync', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error('Supabase admin not configured');

    const user = req.user || req.session?.user || {};
    const role = user?.role || 'user';

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(clean).filter(Boolean) : null;

    // Build contact query with the same authorization rules used by /api/contacts
    let q = sb.from('contacts').select('*').order('updated_at', { ascending: false }).limit(500);

    if (ids && ids.length) {
      q = q.in('id', ids);
    }

    if (role !== 'admin') {
      if (user?.id) q = q.eq('assigned_user_id', String(user.id));
      else q = q.eq('assigned_to', clean(user?.name));
    }

    const { data: contacts, error } = await q;
    if (error) throw error;

    const people = await getAuthedPeopleClientForUser(req);

    const results = [];
    for (const contact of (contacts || [])) {
      try {
        // Prefer the CRM formatted contact name
        const name = clean(contact?.display_name || contact?.name || '');
        const phone = clean(contact?.phone_number || '');
        const email = clean(contact?.email || '');

        const person = {
          names: name ? [{ givenName: name }] : undefined,
          phoneNumbers: phone ? [{ value: phone }] : undefined,
          emailAddresses: email ? [{ value: email }] : undefined
        };

        const resourceName = clean(contact?.google_resource_name);
        const etag = clean(contact?.google_etag);

        let apiRes;
        if (resourceName) {
          apiRes = await people.people.updateContact({
            resourceName,
            updatePersonFields: 'names,phoneNumbers,emailAddresses',
            requestBody: { ...person, etag: etag || undefined }
          });
        } else {
          apiRes = await people.people.createContact({ requestBody: person });
        }

        const savedResourceName = apiRes?.data?.resourceName || null;
        const savedEtag = apiRes?.data?.etag || null;

        if (savedResourceName) {
          await sb
            .from('contacts')
            .update({ google_resource_name: savedResourceName, google_etag: savedEtag, updated_at: new Date().toISOString() })
            .eq('id', contact.id);
        }

        results.push({ id: contact.id, ok: true, created: !resourceName, resourceName: savedResourceName });
      } catch (err) {
        results.push({ id: contact.id, ok: false, error: err?.message || String(err) });
      }
    }

    const okCount = results.filter(r => r.ok).length;
    res.json({ success: true, total: results.length, ok: okCount, failed: results.length - okCount, results });
  } catch (e) {
    console.error('Google bulk sync error:', e);
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/google/contacts/sync/:contactId
 * Creates or updates a Google Contact from a CRM contact.
 */
router.post('/contacts/sync/:contactId', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error('Supabase admin not configured');

    const id = clean(req.params.contactId);
    if (!id) return res.status(400).json({ success: false, error: 'Missing contact id' });

    const { data: contact, error: cErr } = await sb
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();
    if (cErr) throw cErr;

    // Authorization: officers can only sync contacts assigned to them.
    const user = req.user || req.session?.user || {};
    const role = user?.role || 'user';
    if (role !== 'admin') {
      const assignedUserId = contact?.assigned_user_id ? String(contact.assigned_user_id) : null;
      const assignedTo = clean(contact?.assigned_to);

      if (user?.id) {
        if (!assignedUserId || assignedUserId !== String(user.id)) {
          return res.status(403).json({ success: false, error: 'Not allowed to sync this contact' });
        }
      } else {
        if (!assignedTo || assignedTo !== clean(user?.name)) {
          return res.status(403).json({ success: false, error: 'Not allowed to sync this contact' });
        }
      }
    }

    const people = await getAuthedPeopleClientForUser(req);

    // Prefer the CRM formatted contact name
    const name = clean(contact?.display_name || contact?.name || '');
    const phone = clean(contact?.phone_number || '');
    const email = clean(contact?.email || '');

    const person = {
      names: name ? [{ givenName: name }] : undefined,
      phoneNumbers: phone ? [{ value: phone }] : undefined,
      emailAddresses: email ? [{ value: email }] : undefined
    };

    let result;

    const resourceName = clean(contact?.google_resource_name);
    const etag = clean(contact?.google_etag);

    if (resourceName) {
      // Update
      result = await people.people.updateContact({
        resourceName,
        updatePersonFields: 'names,phoneNumbers,emailAddresses',
        requestBody: {
          ...person,
          etag: etag || undefined
        }
      });
    } else {
      // Create
      result = await people.people.createContact({ requestBody: person });
    }

    const savedResourceName = result?.data?.resourceName || null;
    const savedEtag = result?.data?.etag || null;

    if (savedResourceName) {
      const { error: uErr } = await sb
        .from('contacts')
        .update({
          google_resource_name: savedResourceName,
          google_etag: savedEtag,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (uErr) throw uErr;
    }

    res.json({
      success: true,
      resourceName: savedResourceName,
      etag: savedEtag,
      created: !resourceName
    });
  } catch (e) {
    console.error('Google sync error:', e);
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
