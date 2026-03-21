/**
 * Google Sheets REST API client for Deno Edge Functions.
 * Uses service account JWT + fetch (no googleapis npm).
 */

// ── JWT signing ────────────────────────────────────────────────────────────────

async function signJwt(email: string, privateKeyPem: string, scopes: string[]): Promise<string> {
  // Parse PEM key
  const pemBody = privateKeyPem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${signingInput}.${sigB64}`;
}

// ── Token cache ────────────────────────────────────────────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) return _cachedToken;

  const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const rawKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
  if (!email || !rawKey) throw new Error('Google service account env vars not set');

  // Support both \\n (escaped) and real newlines
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const jwt = await signJwt(email, privateKey, [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ]);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google token exchange failed: ${txt}`);
  }

  const json = await resp.json();
  _cachedToken = json.access_token;
  _tokenExpiry = Date.now() + (json.expires_in ?? 3600) * 1000;
  return _cachedToken!;
}

// ── Sheets helpers ─────────────────────────────────────────────────────────────

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsGet(path: string): Promise<any> {
  const token = await getAccessToken();
  const resp = await fetch(`${SHEETS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Sheets GET ${path} failed (${resp.status}): ${txt}`);
  }
  return resp.json();
}

async function sheetsPost(path: string, body: unknown): Promise<any> {
  const token = await getAccessToken();
  const resp = await fetch(`${SHEETS_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Sheets POST ${path} failed (${resp.status}): ${txt}`);
  }
  return resp.json();
}

async function sheetsPut(path: string, body: unknown): Promise<any> {
  const token = await getAccessToken();
  const resp = await fetch(`${SHEETS_BASE}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Sheets PUT ${path} failed (${resp.status}): ${txt}`);
  }
  return resp.json();
}

export async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  const enc = encodeURIComponent(range);
  const data = await sheetsGet(`/${spreadsheetId}/values/${enc}`);
  return (data.values as string[][]) ?? [];
}

export async function writeSheet(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
  const enc = encodeURIComponent(range);
  await sheetsPut(
    `/${spreadsheetId}/values/${enc}?valueInputOption=USER_ENTERED`,
    { range, majorDimension: 'ROWS', values },
  );
}

export async function appendSheet(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
  const enc = encodeURIComponent(range);
  await sheetsPost(
    `/${spreadsheetId}/values/${enc}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { range, majorDimension: 'ROWS', values },
  );
}

export async function getSpreadsheetInfo(spreadsheetId: string): Promise<any> {
  return sheetsGet(`/${spreadsheetId}?fields=spreadsheetId,properties,sheets.properties`);
}

export async function sheetExists(spreadsheetId: string, sheetName: string): Promise<boolean> {
  const info = await getSpreadsheetInfo(spreadsheetId);
  return (info.sheets ?? []).some((s: any) => s.properties?.title === sheetName);
}

export async function createSheet(spreadsheetId: string, sheetName: string): Promise<void> {
  await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
    requests: [{ addSheet: { properties: { title: sheetName } } }],
  });
}
