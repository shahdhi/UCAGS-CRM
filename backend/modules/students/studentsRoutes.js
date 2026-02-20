/**
 * Students Module
 * Admin-only listing of enrolled students.
 */

const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin } = require('../../../server/middleware/auth');

// GET /api/students/admin?limit=200&search=
router.get('/admin', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 500);
    const search = String(req.query.search || '').trim();

    let q = sb
      .from('students')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Simple search by name/phone/email/student_id
    if (search) {
      // PostgREST "or" syntax
      const s = search.replace(/"/g, '');
      q = q.or(
        `student_id.ilike.%${s}%,name.ilike.%${s}%,phone_number.ilike.%${s}%,email.ilike.%${s}%`
      );
    }

    const { data, error } = await q;
    if (error) throw error;

    res.json({ success: true, students: data || [] });
  } catch (e) {
    const msg = String(e.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) {
      return res.status(501).json({ success: false, error: 'Students table not found in database.' });
    }
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
