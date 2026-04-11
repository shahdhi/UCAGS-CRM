/**
 * Inline notification helper — replaces notificationsService.js
 * Writes directly to Supabase via admin client. No external HTTP calls.
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

function cleanString(v) {
  if (v == null) return '';
  return String(v).trim();
}

async function createNotification({ userId, category = 'general', title, message, type = 'info' }) {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const row = {
    user_id: userId,
    category: cleanString(category) || 'general',
    title: cleanString(title) || 'Notification',
    message: cleanString(message) || '',
    type: cleanString(type) || 'info',
    created_at: new Date().toISOString(),
  };

  // Dedupe guard for lead_assignment
  if (row.category === 'lead_assignment') {
    try {
      const cutoff = new Date(Date.now() - 10 * 1000).toISOString();
      const { data: existing, error: exErr } = await sb
        .from('user_notifications')
        .select('*')
        .eq('user_id', row.user_id)
        .eq('category', row.category)
        .is('read_at', null)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!exErr && existing) return existing;
    } catch (_) {}
  }

  const { data, error } = await sb.from('user_notifications').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

// Cache admin ids for 60s to avoid repeated auth.admin.listUsers calls
let __adminCache = { ids: [], expiresAt: 0 };

async function listAdminUserIds() {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  if (__adminCache.expiresAt > Date.now()) return __adminCache.ids;

  const { data: { users }, error } = await sb.auth.admin.listUsers();
  if (error) return [];

  const ids = (users || [])
    .filter(u => ADMIN_EMAILS.includes(String(u.email || '').toLowerCase()))
    .map(u => u.id);

  __adminCache = { ids, expiresAt: Date.now() + 60 * 1000 };
  return ids;
}

async function getNotificationSettings(userId) {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('user_notification_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

module.exports = { createNotification, listAdminUserIds, getNotificationSettings };
