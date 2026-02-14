/**
 * Followups Service (Supabase)
 * Officer-owned followups for leads.
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

function requireSupabase() {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const err = new Error('Supabase admin not configured');
    err.status = 500;
    throw err;
  }
  return sb;
}

function cleanString(v) {
  if (v == null) return '';
  return String(v).trim();
}

function toNull(v) {
  const s = cleanString(v);
  return s ? s : null;
}

function parseDateTimeLocal(v) {
  // accepts ISO, or datetime-local "YYYY-MM-DDTHH:mm"
  const s = cleanString(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d)) return null;
  return d.toISOString();
}

async function listOfficerFollowups({ officerUserId, batchName, sheetName, sheetLeadId }) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('crm_lead_followups')
    .select('*')
    .eq('officer_user_id', officerUserId)
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('sheet_lead_id', sheetLeadId)
    .order('sequence', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function upsertFollowupBySequence({ officerUserId, officerName, batchName, sheetName, sheetLeadId, sequence, payload }) {
  const sb = requireSupabase();

  const row = {
    officer_user_id: officerUserId,
    officer_name: cleanString(officerName) || null,
    batch_name: batchName,
    sheet_name: sheetName,
    sheet_lead_id: String(sheetLeadId),
    sequence,
    channel: toNull(payload.channel),
    scheduled_at: parseDateTimeLocal(payload.scheduledAt || payload.scheduled_at || payload.schedule),
    actual_at: parseDateTimeLocal(payload.actualAt || payload.actual_at || payload.date),
    answered: payload.answered === '' || payload.answered == null ? null : (String(payload.answered).toLowerCase() === 'yes' || payload.answered === true),
    comment: toNull(payload.comment)
  };

  const { data, error } = await sb
    .from('crm_lead_followups')
    .upsert(row, { onConflict: 'batch_name,sheet_name,sheet_lead_id,officer_user_id,sequence' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Compatibility helper: convert legacy followUpN* fields to followup upserts.
 */
async function syncLegacyFollowupsFromManagement({ officerUserId, officerName, batchName, sheetName, sheetLeadId, management }) {
  // Find all followUpNSchedule keys
  const keys = Object.keys(management || {});
  const sequences = new Set();
  for (const k of keys) {
    const m = k.match(/^followUp(\d+)(Schedule|Date|Answered|Comment)$/);
    if (m) sequences.add(parseInt(m[1], 10));
  }

  const seqs = Array.from(sequences).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const results = [];

  for (const n of seqs) {
    const payload = {
      channel: 'call',
      scheduledAt: management[`followUp${n}Schedule`],
      actualAt: management[`followUp${n}Date`],
      answered: management[`followUp${n}Answered`],
      comment: management[`followUp${n}Comment`]
    };

    // Only persist if any field has a value
    const hasAny = Object.values(payload).some(v => cleanString(v));
    if (!hasAny) continue;

    results.push(
      await upsertFollowupBySequence({
        officerUserId,
        officerName,
        batchName,
        sheetName,
        sheetLeadId,
        sequence: n,
        payload
      })
    );
  }

  return results;
}

module.exports = {
  listOfficerFollowups,
  upsertFollowupBySequence,
  syncLegacyFollowupsFromManagement
};
