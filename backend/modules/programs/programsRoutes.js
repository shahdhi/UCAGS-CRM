const express = require('express');
const router = express.Router();

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin } = require('../../../server/middleware/auth');

function clean(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function validateBatchName(name) {
  if (!name) throw Object.assign(new Error('Batch name is required'), { status: 400 });
  if (String(name).includes(' ')) throw Object.assign(new Error('Batch name cannot contain spaces'), { status: 400 });
  if (!/^[a-zA-Z0-9_-]+$/.test(String(name))) {
    throw Object.assign(new Error('Batch name can only contain letters, numbers, hyphens, and underscores'), { status: 400 });
  }
}

// Public: list active programs (id + name)
router.get('/public', async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('programs')
      .select('id,name')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    res.json({ success: true, programs: data || [] });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Sidebar/CRM: list programs + batches (admin/officer)
router.get('/sidebar', require('../../../server/middleware/auth').isAdminOrOfficer, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { data: programs, error: pErr } = await sb
      .from('programs')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (pErr) throw pErr;

    const programIds = (programs || []).map(p => p.id);
    let batches = [];
    if (programIds.length) {
      const { data: b, error: bErr } = await sb
        .from('program_batches')
        .select('*')
        .in('program_id', programIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (bErr) throw bErr;
      batches = b || [];
    }

    res.json({ success: true, programs: programs || [], batches });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: list programs + batches
router.get('/', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { data: programs, error: pErr } = await sb
      .from('programs')
      .select('*')
      .order('created_at', { ascending: false });
    if (pErr) throw pErr;

    const programIds = (programs || []).map(p => p.id);
    let batches = [];
    if (programIds.length) {
      const { data: b, error: bErr } = await sb
        .from('program_batches')
        .select('*')
        .in('program_id', programIds)
        .order('created_at', { ascending: false });
      if (bErr) throw bErr;
      batches = b || [];
    }

    res.json({ success: true, programs: programs || [], batches });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: delete program (HARD delete)
// - removes program + program_batches
// - deletes Supabase leads for all batches in this program (crm_leads)
// - removes batch -> Google Sheet mapping from batchesStore (batches + batch_officer_sheets tables)
router.delete('/:programId', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const programId = String(req.params.programId || '').trim();

    // Fetch batches first
    const { data: pb, error: pbErr } = await sb
      .from('program_batches')
      .select('id,batch_name')
      .eq('program_id', programId);
    if (pbErr) throw pbErr;

    const batchNames = (pb || []).map(r => r.batch_name).filter(Boolean);

    // Delete leads + batch mappings for each batch
    for (const batchName of batchNames) {
      // Remove leads in Supabase
      const { error: leadsErr } = await sb
        .from('crm_leads')
        .delete()
        .eq('batch_name', batchName);
      if (leadsErr) throw leadsErr;

      // Remove batch officer sheet mappings (if table exists)
      try {
        await sb.from('batch_officer_sheets').delete().eq('batch_name', batchName);
      } catch (_) {}

      // Remove batch -> sheet mapping
      try {
        await sb.from('batches').delete().eq('name', batchName);
      } catch (_) {}
    }

    // Delete program_batches rows
    const { error: bErr } = await sb
      .from('program_batches')
      .delete()
      .eq('program_id', programId);
    if (bErr) throw bErr;

    // Delete program
    const { data, error } = await sb
      .from('programs')
      .delete()
      .eq('id', programId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    res.json({ success: true, program: data || null, deleted_batches: batchNames, deleted_leads_batches: batchNames });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: create program
router.post('/', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const name = clean(req.body?.name);
    if (!name) return res.status(400).json({ success: false, error: 'Program name is required' });

    const { data, error } = await sb
      .from('programs')
      .insert({ name, is_active: true })
      .select('*')
      .single();
    if (error) throw error;

    res.status(201).json({ success: true, program: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: add batch (becomes current)
router.post('/:programId/batches', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const programId = String(req.params.programId || '').trim();
    const batchName = clean(req.body?.batch_name);
    validateBatchName(batchName);

    // Unset current batch for this program
    const { error: unsetErr } = await sb
      .from('program_batches')
      .update({ is_current: false })
      .eq('program_id', programId)
      .eq('is_current', true);
    if (unsetErr) throw unsetErr;

    const { data, error } = await sb
      .from('program_batches')
      .insert({ program_id: programId, batch_name: batchName, is_current: true, is_active: true })
      .select('*')
      .single();
    if (error) throw error;

    res.status(201).json({ success: true, batch: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: delete batch (HARD delete)
// - deletes leads in Supabase for that batch
// - removes batch -> Google Sheet mapping from batchesStore
// - removes the program_batches mapping
router.delete('/:programId/batches/:batchId', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const programId = String(req.params.programId || '').trim();
    const batchId = String(req.params.batchId || '').trim();

    // Get batch info first
    const { data: existing, error: getErr } = await sb
      .from('program_batches')
      .select('*')
      .eq('id', batchId)
      .eq('program_id', programId)
      .maybeSingle();
    if (getErr) throw getErr;

    const batchName = existing?.batch_name;
    if (!batchName) return res.status(404).json({ success: false, error: 'Batch not found' });

    // Delete leads
    const { error: leadsErr } = await sb
      .from('crm_leads')
      .delete()
      .eq('batch_name', batchName);
    if (leadsErr) throw leadsErr;

    // Remove batch mappings
    try { await sb.from('batch_officer_sheets').delete().eq('batch_name', batchName); } catch (_) {}
    try { await sb.from('batches').delete().eq('name', batchName); } catch (_) {}

    // Remove mapping
    const { data, error } = await sb
      .from('program_batches')
      .delete()
      .eq('id', batchId)
      .eq('program_id', programId)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, batch: data || null, deleted_leads_batch: batchName });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: set current batch
router.put('/:programId/batches/:batchId/current', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const programId = String(req.params.programId || '').trim();
    const batchId = String(req.params.batchId || '').trim();

    const { error: unsetErr } = await sb
      .from('program_batches')
      .update({ is_current: false })
      .eq('program_id', programId)
      .eq('is_current', true);
    if (unsetErr) throw unsetErr;

    const { data, error } = await sb
      .from('program_batches')
      .update({ is_current: true })
      .eq('id', batchId)
      .eq('program_id', programId)
      .select('*')
      .single();
    if (error) throw error;

    res.json({ success: true, batch: data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Admin: get current batch for program
router.get('/:programId/current-batch', async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const programId = String(req.params.programId || '').trim();

    const { data, error } = await sb
      .from('program_batches')
      .select('*')
      .eq('program_id', programId)
      .eq('is_current', true)
      .maybeSingle();

    if (error) throw error;
    res.json({ success: true, batch: data || null });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
