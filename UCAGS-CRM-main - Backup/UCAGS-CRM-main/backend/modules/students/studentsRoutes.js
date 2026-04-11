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

// DELETE /api/students/admin/:id
// Deletes student enrollment and marks linked registration back to not enrolled.
router.delete('/admin/:id', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const studentId = String(req.params.id || '').trim();
    if (!studentId) return res.status(400).json({ success: false, error: 'Missing student id' });

    // Load student to get registration_id
    const { data: student, error: sErr } = await sb
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();
    if (sErr) throw sErr;

    const registrationId = student?.registration_id ? String(student.registration_id) : '';

    // Delete student record
    const { error: dErr } = await sb
      .from('students')
      .delete()
      .eq('id', studentId);
    if (dErr) throw dErr;

    // If there's a linked registration, mark it not enrolled.
    if (registrationId) {
      const clearEnrollment = async () => {
        const { data, error } = await sb
          .from('registrations')
          .update({ enrolled: false, enrolled_at: null, student_id: null })
          .eq('id', registrationId)
          .select('*')
          .single();
        if (error) throw error;
        return data;
      };

      let updatedReg = null;
      try {
        updatedReg = await clearEnrollment();
      } catch (e1) {
        const msg = String(e1.message || '').toLowerCase();
        const missingCol = msg.includes('column') && msg.includes('does not exist');
        if (!missingCol) throw e1;

        // Payload fallback
        const { data: existing, error: fErr } = await sb
          .from('registrations')
          .select('payload')
          .eq('id', registrationId)
          .single();
        if (fErr) throw fErr;

        const payload = existing?.payload && typeof existing.payload === 'object' ? existing.payload : {};
        payload.enrolled = false;
        payload.enrolled_at = null;
        payload.student_id = null;

        const { data, error } = await sb
          .from('registrations')
          .update({ payload })
          .eq('id', registrationId)
          .select('*')
          .single();
        if (error) throw error;
        updatedReg = data;
      }

      return res.json({ success: true, deleted: true, registration: updatedReg });
    }

    res.json({ success: true, deleted: true });
  } catch (e) {
    const msg = String(e.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) {
      return res.status(501).json({ success: false, error: 'Students table not found in database.' });
    }
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
