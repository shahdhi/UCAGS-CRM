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
    // Verify auth token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const sb = getSupabaseAdmin();
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    // Only admins can post release notes
    const { data: userData } = await sb.auth.admin.getUserById(user.id);
    const role = userData?.user?.user_metadata?.role || '';
    const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];
    const isAdmin = role === 'admin' || ADMIN_EMAILS.includes((user.email || '').toLowerCase());
    if (!isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });

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
