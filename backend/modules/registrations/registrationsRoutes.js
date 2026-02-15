const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin } = require('../../../server/middleware/auth');

function cleanString(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// Public intake endpoint for /Register page
// POST /api/registrations/intake
router.post('/intake', async (req, res) => {
  try {
    const sb = getSupabaseAdmin();

    const payload = req.body || {};

    // Extract common fields (we also store full payload as JSON)
    const row = {
      name: cleanString(payload.name),
      gender: cleanString(payload.gender),
      date_of_birth: cleanString(payload.date_of_birth),
      address: cleanString(payload.address),
      country: cleanString(payload.country),
      phone_number: cleanString(payload.phone_number),
      wa_number: cleanString(payload.wa_number),
      email: cleanString(payload.email),
      working_status: cleanString(payload.working_status),
      source: 'crm-register-page',
      payload
    };

    if (!row.name || !row.phone_number) {
      return res.status(400).json({ success: false, error: 'Name and Phone Number are required' });
    }

    const { data, error } = await sb
      .from('registrations')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      // Helpful message if table is missing
      if (String(error.message || '').toLowerCase().includes('relation') || String(error.message || '').toLowerCase().includes('does not exist')) {
        return res.status(500).json({
          success: false,
          error: 'Supabase table "registrations" not found. Create it first.'
        });
      }
      throw error;
    }

    res.json({ success: true, registration: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin list endpoint (for future admin tab)
// GET /api/registrations/admin?limit=100
router.get('/admin', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);

    const { data, error } = await sb
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ success: true, registrations: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
