/**
 * App Settings (Supabase)
 *
 * Allows storing environment-like settings in Supabase so they can be changed
 * without redeploying.
 *
 * Table: app_settings
 *  - key text primary key
 *  - value text not null
 *  - updated_at timestamptz not null default now()
 */

const { getSupabaseAdmin } = require('../supabase/supabaseAdmin');

const SETTINGS_TTL_MS = Number(process.env.APP_SETTINGS_CACHE_TTL_MS || 60000); // 1 min
const __settingsCache = new Map(); // key -> { value, expiresAt }
const __settingsInflight = new Map(); // key -> Promise

function isMissingTableError(error) {
  const msg = String(error?.message || error || '');
  return msg.includes('relation') && msg.includes('does not exist');
}

async function getSetting(key, opts = {}) {
  if (!key) throw new Error('Setting key is required');

  const force = Boolean(opts.force);
  const now = Date.now();

  if (!force) {
    const cached = __settingsCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const inflight = __settingsInflight.get(key);
    if (inflight) return await inflight;
  }

  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const p = (async () => {
    const { data, error } = await sb
      .from('app_settings')
      .select('value, updated_at')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }

    const value = data?.value ?? null;
    __settingsCache.set(key, { value, expiresAt: Date.now() + SETTINGS_TTL_MS });
    return value;
  })();

  __settingsInflight.set(key, p);
  try {
    return await p;
  } finally {
    __settingsInflight.delete(key);
  }
}

async function setSetting(key, value) {
  if (!key) throw new Error('Setting key is required');

  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin is not configured');

  const payload = {
    key,
    value: String(value ?? ''),
    updated_at: new Date().toISOString()
  };

  const { error } = await sb
    .from('app_settings')
    .upsert(payload, { onConflict: 'key' });

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error('Supabase table app_settings does not exist');
    }
    throw error;
  }

  __settingsCache.set(key, { value: payload.value, expiresAt: Date.now() + SETTINGS_TTL_MS });
  return true;
}

function clearSettingsCache(key) {
  if (key) {
    __settingsCache.delete(key);
    __settingsInflight.delete(key);
    return;
  }
  __settingsCache.clear();
  __settingsInflight.clear();
}

// Convenience helper for attendance
async function getAttendanceSheetId() {
  // Prefer Supabase setting, fallback to env/config.
  const fromDb = await getSetting('attendance_sheet_id');
  return fromDb || process.env.ATTENDANCE_SHEET_ID || null;
}

module.exports = {
  getSetting,
  setSetting,
  clearSettingsCache,
  getAttendanceSheetId
};
