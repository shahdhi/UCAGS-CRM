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

// Admin: delete batch
router.delete('/:programId/batches/:batchId', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const programId = String(req.params.programId || '').trim();
    const batchId = String(req.params.batchId || '').trim();

    const { data, error } = await sb
      .from('program_batches')
      .delete()
      .eq('id', batchId)
      .eq('program_id', programId)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, batch: data || null });
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
