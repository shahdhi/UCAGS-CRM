/**
 * Registration Assignment Service
 *
 * When a public registration submission arrives, we try to determine who it's
 * already assigned to by searching existing Google Sheets leads.
 *
 * Logic:
 *  - Normalize phone to canonical LK format (94XXXXXXXXX digits)
 *  - Search Supabase leads tables (source of truth)
 *  - If phone exists and has an assigned_to value, return that officer name.
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { normalizePhoneToSL } = require('../batches/duplicatePhoneResolver');

const TTL_MS = 5 * 60 * 1000;
let globalCache = new Map(); // canonicalPhone -> { assignee, expiresAt }

async function findAssigneeByPhoneInSupabase(canonicalPhone, { batchName } = {}) {
  const sb = getSupabaseAdmin();
  if (!sb) return '';

  const last9 = String(canonicalPhone || '').replace(/\D/g, '').slice(-9);
  if (!last9) return '';

  // Candidate search by suffix (fast), then confirm by canonical normalization.
  // Use a broader ILIKE search that accounts for phones with spaces or dashes.
  // This searches for any phone containing the last 7+ digits (accommodating various formats)
  const searchDigits = last9.slice(-7);
  let q = sb
    .from('crm_leads')
    .select('phone, assigned_to, updated_at, created_at, batch_name')
    .ilike('phone', `%${searchDigits}%`);

  if (batchName) q = q.eq('batch_name', String(batchName));

  const { data, error } = await q
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    // If table missing, ignore (older deployments)
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return '';
    throw error;
  }

  for (const r of (data || [])) {
    // Normalize the phone from the database before comparison
    const rCanon = normalizePhoneToSL(r.phone);
    if (rCanon === canonicalPhone && r.assigned_to && String(r.assigned_to).trim()) {
      return String(r.assigned_to).trim();
    }
  }

  return '';
}

async function findAssigneeByPhoneAcrossAllSheets(rawPhone, opts = {}) {
  const canonical = normalizePhoneToSL(rawPhone);
  if (!canonical) return '';

  const cached = globalCache.get(canonical);
  if (cached && cached.expiresAt > Date.now()) return cached.assignee || '';

  // Supabase is source of truth: check leads DB only
  try {
    const dbAssignee = await findAssigneeByPhoneInSupabase(canonical, opts);
    if (dbAssignee) {
      globalCache.set(canonical, { assignee: dbAssignee, expiresAt: Date.now() + TTL_MS });
      return dbAssignee;
    }
  } catch (e) {
    console.warn('Supabase assignee lookup failed:', e.message || e);
  }

  globalCache.set(canonical, { assignee: '', expiresAt: Date.now() + TTL_MS });
  return '';
}

function clearAssignmentCache(phone) {
  if (!phone) globalCache = new Map();
  else globalCache.delete(normalizePhoneToSL(phone));
}

module.exports = {
  findAssigneeByPhoneAcrossAllSheets,
  normalizePhoneToSL,
  clearAssignmentCache
};
