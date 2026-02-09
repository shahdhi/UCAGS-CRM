/**
 * Persistence for WhatsApp Firefox container mappings.
 *
 * Prefers Supabase (service role) if configured.
 * Falls back to an in-memory map (non-persistent; useful for dev).
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

// In-memory fallback
const mem = new Map(); // advisorKey -> containerName

function normalizeAdvisorKey(key) {
  return String(key || '').trim();
}

async function isSupabaseAvailable() {
  return !!getSupabaseAdmin();
}

async function getAllMappings() {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('whatsapp_container_mappings')
      .select('advisor_key, container_name');

    if (error) {
      // Don’t hard-fail if table isn’t created yet.
      // Fall back to memory so UI still works.
      console.warn('WhatsApp container mapping: Supabase select failed:', error.message);
    } else {
      const out = {};
      (data || []).forEach(r => {
        if (r && r.advisor_key) out[r.advisor_key] = r.container_name;
      });
      return { source: 'supabase', mappings: out };
    }
  }

  const out = {};
  for (const [k, v] of mem.entries()) out[k] = v;
  return { source: 'memory', mappings: out };
}

async function upsertMappings(pairs) {
  // pairs: [{advisorKey, containerName}]
  const normalized = (pairs || [])
    .map(p => ({
      advisor_key: normalizeAdvisorKey(p.advisorKey),
      container_name: String(p.containerName || '').trim()
    }))
    .filter(p => p.advisor_key && p.container_name);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase
      .from('whatsapp_container_mappings')
      .upsert(
        normalized.map(r => ({
          ...r,
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'advisor_key' }
      );

    if (error) {
      console.warn('WhatsApp container mapping: Supabase upsert failed:', error.message);
    } else {
      return { source: 'supabase', saved: normalized.length };
    }
  }

  // Fallback
  normalized.forEach(r => mem.set(r.advisor_key, r.container_name));
  return { source: 'memory', saved: normalized.length };
}

module.exports = {
  isSupabaseAvailable,
  getAllMappings,
  upsertMappings
};
