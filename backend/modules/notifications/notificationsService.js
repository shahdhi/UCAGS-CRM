const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

function requireSupabase() {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const err = new Error('Supabase admin not configured');
    err.status = 500;
    throw err;
  }
  return sb;
}

function cleanString(v) {
  if (v == null) return '';
  return String(v).trim();
}

async function createNotification({ userId, category = 'general', title, message, type = 'info' }) {
  const sb = requireSupabase();
  const row = {
    user_id: userId,
    category: cleanString(category) || 'general',
    title: cleanString(title) || 'Notification',
    message: cleanString(message) || '',
    type: cleanString(type) || 'info',
    created_at: new Date().toISOString()
  };

  const { data, error } = await sb.from('user_notifications').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function listNotifications({ userId, limit = 50 }) {
  const sb = requireSupabase();
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));

  const { data, error } = await sb
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(lim);

  if (error) throw error;
  return data || [];
}

async function markAllRead({ userId }) {
  const sb = requireSupabase();
  const ts = new Date().toISOString();
  const { data, error } = await sb
    .from('user_notifications')
    .update({ read_at: ts })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id');
  if (error) throw error;
  return { updated: (data || []).length, read_at: ts };
}

async function purgeOldNotifications({ olderThanDays = 7 }) {
  const sb = requireSupabase();
  const days = Math.max(1, Math.trunc(Number(olderThanDays) || 7));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from('user_notifications')
    .delete()
    .lt('created_at', cutoff)
    .select('id');

  if (error) throw error;
  return { deleted: (data || []).length, cutoff };
}

const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];
let __adminCache = { ids: [], expiresAt: 0 };

async function listAdminUserIds() {
  const sb = requireSupabase();
  if (__adminCache.expiresAt > Date.now()) return __adminCache.ids;

  const { data: { users }, error } = await sb.auth.admin.listUsers();
  if (error) throw error;

  const ids = (users || [])
    .filter(u => ADMIN_EMAILS.includes(String(u.email || '').toLowerCase()))
    .map(u => u.id);

  __adminCache = { ids, expiresAt: Date.now() + 60 * 1000 };
  return ids;
}

async function getNotificationSettings(userId) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('user_notification_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // table might not exist yet
    return null;
  }

  return data || null;
}

async function upsertNotificationSettings(userId, patch) {
  const sb = requireSupabase();
  const row = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from('user_notification_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  createNotification,
  listNotifications,
  markAllRead,
  listAdminUserIds,
  getNotificationSettings,
  upsertNotificationSettings,
  purgeOldNotifications
};
