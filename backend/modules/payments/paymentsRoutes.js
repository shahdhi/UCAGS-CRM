const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin } = require('../../../server/middleware/auth');

function cleanString(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// Admin list payments
// GET /api/payments/admin?limit=200

// Admin: list all payments for a registration
// GET /api/payments/admin/registration/:registrationId
router.get('/admin/registration/:registrationId', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const registrationId = String(req.params.registrationId || '').trim();
    if (!registrationId) return res.status(400).json({ success: false, error: 'Missing registration id' });

    const { data, error } = await sb
      .from('payments')
      .select('*')
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, payments: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

router.get('/admin', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 1000);

    const { data, error } = await sb
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ success: true, payments: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin update payment fields
// PUT /api/payments/admin/:id
router.put('/admin/:id', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing payment id' });

    const patch = {};
    if ('email_sent' in req.body) patch.email_sent = !!req.body.email_sent;
    if ('whatsapp_sent' in req.body) patch.whatsapp_sent = !!req.body.whatsapp_sent;
    if ('payment_method' in req.body) patch.payment_method = cleanString(req.body.payment_method);
    if ('payment_plan' in req.body) patch.payment_plan = cleanString(req.body.payment_plan);
    if ('payment_date' in req.body) patch.payment_date = req.body.payment_date ? String(req.body.payment_date).trim() : null;
    if ('amount' in req.body) patch.amount = Number(req.body.amount);
    if ('slip_received' in req.body) patch.slip_received = !!req.body.slip_received;
    if ('receipt_no' in req.body) patch.receipt_no = cleanString(req.body.receipt_no);

    const { data, error } = await sb
      .from('payments')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ success: true, payment: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin confirm payment
// POST /api/payments/admin/:id/confirm
router.post('/admin/:id/confirm', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing payment id' });

    const confirmedBy = cleanString(req.user?.name) || cleanString(req.user?.email) || null;

    const { data, error } = await sb
      .from('payments')
      .update({
        is_confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: confirmedBy
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ success: true, payment: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
