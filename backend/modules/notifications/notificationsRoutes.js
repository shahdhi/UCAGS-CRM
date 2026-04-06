/**
 * Notifications Routes
 * POST /api/notifications/update-release  — send a release note to selected users
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { createNotification } = require('./notificationsHelper');

/**
 * POST /api/notifications/update-release
 * Body: { message: string, recipients: [{ id, name, email }] }
 * Auth: admin only (verified via Supabase JWT)
 */
router.post('/update-release', async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

    // Auth: accept either a Supabase Bearer token (CRM admin) or the dev portal header
    const authHeader = req.headers.authorization || '';
    const devHeader  = req.headers['x-dev-portal'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    let senderName = 'Developer';
    let authorized = false;

    if (devHeader === 'shadev123') {
      // Developer portal — trusted internal key
      authorized = true;
      senderName = 'Developer Portal';
    } else if (token) {
      const { data: { user }, error: authErr } = await sb.auth.getUser(token);
      if (!authErr && user) {
        const isAdmin = ADMIN_EMAILS.includes((user.email || '').toLowerCase()) ||
                        user.user_metadata?.role === 'admin';
        if (isAdmin) {
          authorized = true;
          senderName = user.user_metadata?.name || user.email?.split('@')[0] || 'Admin';
        }
      }
    }

    if (!authorized) return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { message, recipients } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one recipient is required' });
    }

    const senderName = user.user_metadata?.name || user.email?.split('@')[0] || 'Admin';
    const title = '📣 Update Release';
    const now = new Date().toISOString();

    // Insert one notification per recipient
    const rows = recipients.map(r => ({
      user_id: r.id,
      category: 'update_release',
      title,
      message: message.trim(),
      type: 'info',
      created_at: now,
      // store sender info in metadata if column exists, else ignore
    }));

    const { data: inserted, error: insertErr } = await sb
      .from('user_notifications')
      .insert(rows)
      .select('id');

    if (insertErr) {
      console.error('[update-release] insert error:', insertErr);
      return res.status(500).json({ success: false, error: insertErr.message });
    }

    console.log(`[update-release] Sent by ${senderName} to ${recipients.length} recipients`);
    return res.json({ success: true, sent: inserted?.length || recipients.length });
  } catch (err) {
    console.error('[update-release] error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
