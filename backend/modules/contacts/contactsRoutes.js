const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAuthenticated, isAdmin } = require('../../../server/middleware/auth');

function clean(s) {
  return String(s || '').trim();
}

function programShort(programName) {
  const raw = clean(programName);
  if (!raw) return 'P';
  const p = raw.toLowerCase();

  // Explicit mappings (add more as needed)
  const map = {
    'diploma in psychology': 'P'
  };
  if (map[p]) return map[p];

  // Keyword fallback
  if (p.includes('psychology') || p.includes('psycho') || p.includes('psych')) return 'P';

  // fallback: first letter of last word
  const parts = raw.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'X';
  return String(parts[parts.length - 1][0] || 'X').toUpperCase();
}

function batchNumber(batchName) {
  const m = clean(batchName).match(/(\d+)/);
  return m ? m[1] : 'NA';
}

function officerFirstLetter(officerName) {
  const n = clean(officerName);
  return n ? n[0].toUpperCase() : 'U';
}

/**
 * POST /api/contacts/from-lead/:leadId
 * Save contact from an existing CRM lead
 * Body: { programName, batchName }
 */
router.post('/from-lead/:leadId', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const user = req.user || req.session?.user || {};

    const leadId = clean(req.params.leadId);
    if (!leadId) return res.status(400).json({ success: false, error: 'Missing lead id' });

    // Backend is source-of-truth for course + batch to avoid relying on sidebar state.
    const programName = '';
    const batchName = '';

    const { data: lead, error: lErr } = await sb
      .from('crm_leads')
      .select('*')
      .eq('sheet_lead_id', leadId)
      .single();
    if (lErr) throw lErr;

    const role = user?.role || 'user';
    if (role !== 'admin') {
      const assignedTo = clean(lead?.assigned_to);
      if (!assignedTo || assignedTo !== clean(user?.name)) {
        return res.status(403).json({ success: false, error: 'Only the assigned officer can save this contact.' });
      }
    }

    const name = clean(lead?.name || lead?.full_name || lead?.student_name || lead?.payload?.name || '');
    const phone = clean(lead?.phone_number || lead?.phone || lead?.payload?.phone_number || lead?.payload?.phone || '');
    const email = clean(lead?.email || lead?.payload?.email || '');

    const leadPayload = (lead?.payload && typeof lead.payload === 'object') ? lead.payload : {};
    const leadIntake = (lead?.intake_json && typeof lead.intake_json === 'object') ? lead.intake_json : {};

    const leadCourse = clean(
      leadIntake?.course ||
      lead?.course ||
      lead?.program_name ||
      lead?.program ||
      leadPayload?.course ||
      leadPayload?.program_name ||
      leadPayload?.program ||
      ''
    );
    const leadBatch = clean(lead?.batch_name || '');

    const progShort = programShort(leadCourse);
    const batchNo = batchNumber(leadBatch);
    const officerLetter = officerFirstLetter(user?.name);

    const displayName = `${officerLetter}/${progShort}/B${batchNo} ${name || 'Unknown'}`.trim();

    const upsertRow = {
      source_type: 'crm_leads',
      source_id: String(leadId),
      display_name: displayName,
      name: name || null,
      phone_number: phone || null,
      email: email || null,
      program_name: leadCourse || null,
      program_short: progShort,
      batch_name: leadBatch || null,
      batch_no: batchNo,
      assigned_to: clean(lead?.assigned_to) || null,
      assigned_user_id: user?.id || null,
      created_by: user?.id || null,
      updated_at: new Date().toISOString()
    };

    const { data: saved, error: sErr } = await sb
      .from('contacts')
      .upsert(upsertRow, { onConflict: 'source_type,source_id' })
      .select('*')
      .single();

    if (sErr) throw sErr;
    res.json({ success: true, contact: saved });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/contacts
 * List contacts
 * Query: q, batch
 */
function canEditContact(user, contact) {
  if (!user) return false;
  const role = user.role || 'user';
  if (role === 'admin') return true;
  return clean(contact?.assigned_to) && clean(contact.assigned_to) === clean(user.name);
}

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const user = req.user || req.session?.user || {};

    const q = clean(req.query.q);
    const batch = clean(req.query.batch);

    let query = sb
      .from('contacts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);

    if (batch) query = query.eq('batch_name', batch);

    // Officers: only their assigned contacts
    if ((user?.role || 'user') !== 'admin') {
      query = query.eq('assigned_to', clean(user?.name));
    }

    if (q) {
      // Basic search (Supabase OR)
      query = query.or(`display_name.ilike.%${q}%,name.ilike.%${q}%,phone_number.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, contacts: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * PUT /api/contacts/:id
 * Update contact fields
 */
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const user = req.user || req.session?.user || {};
    const id = clean(req.params.id);

    const { data: existing, error: exErr } = await sb
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();
    if (exErr) throw exErr;

    if (!canEditContact(user, existing)) {
      return res.status(403).json({ success: false, error: 'Not allowed' });
    }

    const patch = {
      display_name: req.body?.display_name != null ? clean(req.body.display_name) : existing.display_name,
      name: req.body?.name != null ? clean(req.body.name) : existing.name,
      phone_number: req.body?.phone_number != null ? clean(req.body.phone_number) : existing.phone_number,
      email: req.body?.email != null ? clean(req.body.email) : existing.email,
      program_name: req.body?.program_name != null ? clean(req.body.program_name) : existing.program_name,
      program_short: req.body?.program_short != null ? clean(req.body.program_short) : existing.program_short,
      batch_name: req.body?.batch_name != null ? clean(req.body.batch_name) : existing.batch_name,
      batch_no: req.body?.batch_no != null ? clean(req.body.batch_no) : existing.batch_no,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
      .from('contacts')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    res.json({ success: true, contact: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * DELETE /api/contacts/:id
 */
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const user = req.user || req.session?.user || {};
    const id = clean(req.params.id);

    const { data: existing, error: exErr } = await sb
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();
    if (exErr) throw exErr;

    if (!canEditContact(user, existing)) {
      return res.status(403).json({ success: false, error: 'Not allowed' });
    }

    const { error } = await sb
      .from('contacts')
      .delete()
      .eq('id', id);
    if (error) throw error;

    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
