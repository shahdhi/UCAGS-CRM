const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAuthenticated, isAdmin } = require('../../../server/middleware/auth');

function clean(s) {
  return String(s || '').trim();
}

let _officerUserCache = null;
let _officerUserCacheAt = 0;

async function listSupabaseUsersCached(maxAgeMs = 60_000) {
  const now = Date.now();
  if (_officerUserCache && (now - _officerUserCacheAt) < maxAgeMs) return _officerUserCache;

  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data: { users } = {}, error } = await sb.auth.admin.listUsers();
  if (error) throw error;

  _officerUserCache = users || [];
  _officerUserCacheAt = now;
  return _officerUserCache;
}

async function resolveOfficerUserIdByName(officerName) {
  const name = clean(officerName);
  if (!name) return null;

  const users = await listSupabaseUsersCached();
  if (!users) return null;

  const nLow = name.toLowerCase();

  // 1) Exact match on metadata name
  let match = users.find(u => clean(u?.user_metadata?.name).toLowerCase() === nLow);

  // 2) Exact match on email prefix
  if (!match) match = users.find(u => clean(u?.email).split('@')[0].toLowerCase() === nLow);

  // 3) Loose match: contains (handles cases like "Mr. John" vs "John")
  if (!match) {
    match = users.find(u => {
      const metaName = clean(u?.user_metadata?.name).toLowerCase();
      return metaName && (metaName.includes(nLow) || nLow.includes(metaName));
    });
  }

  return match?.id || null;
}

function programShort(programName) {
  const raw = clean(programName);
  if (!raw) return 'P';
  const p = raw.toLowerCase();

  // Keyword-based mappings — order matters (more specific first)
  const keywordMap = [
    // Psychology
    { keywords: ['psychology', 'psycho', 'psych'],        letter: 'P' },
    // English
    { keywords: ['english'],                               letter: 'E' },
    // IT & AI / Information Technology / Artificial Intelligence
    { keywords: ['it & ai', 'it and ai', 'information technology', 'it &', '& ai'], letter: 'I' },
    // Business Management
    { keywords: ['business management'],                   letter: 'B' },
    // Human Resource Management / HRM
    { keywords: ['human resource', 'hrm'],                 letter: 'H' },
    // Accounting / Finance
    { keywords: ['accounting', 'finance'],                 letter: 'A' },
    // Marketing
    { keywords: ['marketing'],                             letter: 'M' },
    // Law
    { keywords: ['law'],                                   letter: 'L' },
    // Science
    { keywords: ['science'],                               letter: 'S' },
    // Education / Teaching
    { keywords: ['education', 'teaching'],                 letter: 'D' },
    // Computer Science / Computing
    { keywords: ['computer', 'computing'],                 letter: 'C' },
    // Nursing / Health
    { keywords: ['nursing', 'health'],                     letter: 'N' },
    // Engineering
    { keywords: ['engineering'],                           letter: 'G' },
    // Tourism / Hospitality
    { keywords: ['tourism', 'hospitality'],                letter: 'T' },
    // Media / Journalism
    { keywords: ['media', 'journalism'],                   letter: 'J' },
    // Art / Design
    { keywords: ['art', 'design'],                         letter: 'R' },
    // Early Childhood
    { keywords: ['early childhood', 'childhood'],          letter: 'K' },
  ];

  for (const { keywords, letter } of keywordMap) {
    if (keywords.some(kw => p.includes(kw))) return letter;
  }

  // Fallback: skip common prefix words (diploma, in, of, the, a) and use first letter of the first meaningful word
  const skipWords = new Set(['diploma', 'certificate', 'degree', 'bachelor', 'master', 'in', 'of', 'the', 'a', 'an', 'and', '&']);
  const parts = raw.split(/\s+/).filter(Boolean);
  const meaningful = parts.find(w => !skipWords.has(w.toLowerCase()));
  if (meaningful) return meaningful[0].toUpperCase();

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

    const assignedOfficerName = clean(lead?.assigned_to) || clean(user?.name);

    // Resolve officer user id from assigned officer name (important when admin saves contacts)
    let assignedOfficerUserId = null;
    try {
      assignedOfficerUserId = await resolveOfficerUserIdByName(assignedOfficerName);
    } catch (err) {
      console.warn('Failed resolving officer user id for assigned_to:', assignedOfficerName, err?.message || err);
    }

    const officerLetter = officerFirstLetter(assignedOfficerName);

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
      // Assign to the *officer* (not the saver). This ensures officer-only filtering works.
      assigned_user_id: assignedOfficerUserId || null,
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

  // Prefer user_id match if present
  if (user?.id && contact?.assigned_user_id) {
    return String(contact.assigned_user_id) === String(user.id);
  }

  // Fall back to name-based assignment
  return clean(contact?.assigned_to) && clean(contact.assigned_to) === clean(user.name);
}

/**
 * GET /api/contacts/by-source
 * Query: source_type, source_id
 * Returns the contact saved for a given source.
 */
router.get('/by-source', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const user = req.user || req.session?.user || {};

    const sourceType = clean(req.query.source_type);
    const sourceId = clean(req.query.source_id);
    if (!sourceType || !sourceId) {
      return res.status(400).json({ success: false, error: 'Missing source_type or source_id' });
    }

    const { data, error } = await sb
      .from('contacts')
      .select('*')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .maybeSingle();
    if (error) throw error;

    // Authorization (officers only see their assigned contacts)
    if (data) {
      if ((user?.role || 'user') !== 'admin') {
        const assignedUserId = data?.assigned_user_id ? String(data.assigned_user_id) : null;
        const assignedTo = clean(data?.assigned_to);
        if (user?.id) {
          if (!assignedUserId || assignedUserId !== String(user.id)) {
            return res.status(404).json({ success: true, contact: null });
          }
        } else {
          if (!assignedTo || assignedTo !== clean(user?.name)) {
            return res.status(404).json({ success: true, contact: null });
          }
        }
      }
    }

    res.json({ success: true, contact: data || null });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

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
    // Prefer assigned_user_id (stable) and fall back to assigned_to (legacy name-based)
    if ((user?.role || 'user') !== 'admin') {
      if (user?.id) {
        query = query.eq('assigned_user_id', String(user.id));
      } else {
        query = query.eq('assigned_to', clean(user?.name));
      }
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
