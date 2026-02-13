/**
 * CRM Leads Service (Supabase)
 *
 * This service is the fast operational data layer for leads.
 * Leads are synced from Google Sheets into Supabase table `crm_leads`.
 *
 * NOTE: Follow-ups are currently stored inline in officer sheets in the legacy system.
 * For now, we support writing management fields back into `crm_leads` as JSON to avoid
 * breaking the UI while migrating to normalized follow-up tables.
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

function toBool(v) {
  if (v === true || v === false) return v;
  const s = String(v || '').trim().toLowerCase();
  if (!s) return false;
  return ['true', '1', 'yes', 'y', 'checked'].includes(s);
}

function pickManagementFields(input = {}) {
  // Keep compatibility with existing frontend model (followUp1Schedule etc.)
  // Store them inside management_json for now.
  const mgmt = {};

  const direct = [
    'priority',
    'callFeedback',
    'nextFollowUp',
    'lastFollowUpComment',
    'pdfSent',
    'waSent',
    'emailSent'
  ];

  direct.forEach(k => {
    if (input[k] !== undefined) mgmt[k] = input[k];
  });

  // copy followUpN* keys
  Object.keys(input || {}).forEach(k => {
    if (/^followUp\d+(Schedule|Date|Answered|Comment)$/.test(k)) {
      mgmt[k] = input[k];
    }
  });

  return mgmt;
}

async function listMyLeads({ officerName, batchName, sheetName, search, status }) {
  const sb = requireSupabase();
  if (!officerName) {
    const err = new Error('Missing officerName');
    err.status = 400;
    throw err;
  }

  let q = sb
    .from('crm_leads')
    .select('*')
    .eq('assigned_to', officerName);

  if (batchName && batchName !== 'all') q = q.eq('batch_name', batchName);
  if (sheetName) q = q.eq('sheet_name', sheetName);
  if (status) q = q.eq('status', status);

  if (search) {
    // simple ilike across name/email/phone
    const s = `%${search}%`;
    q = q.or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
  }

  const { data, error } = await q.order('synced_at', { ascending: false, nullsFirst: false });
  if (error) throw error;

  return (data || []).map(rowToLead);
}

// Admin: list all leads (no officer filter)
async function listAdminLeads({ batchName, sheetName, search, status }) {
  const sb = requireSupabase();

  console.log('🔍 Querying Supabase for admin leads:', { batchName, sheetName, status, search });

  let q = sb.from('crm_leads').select('*');

  if (batchName && batchName !== 'all') q = q.eq('batch_name', batchName);
  if (sheetName) q = q.eq('sheet_name', sheetName);
  if (status) q = q.eq('status', status);

  if (search) {
    const s = `%${search}%`;
    q = q.or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
  }

  const { data, error } = await q.order('synced_at', { ascending: false, nullsFirst: false });
  if (error) throw error;

  return (data || []).map(rowToLead);
}

function rowToLead(r) {
  const mgmt = r.management_json || {};
  const intake = r.intake_json || {};

  return {
    // existing UI expects id + batch + some fields
    id: r.sheet_lead_id,
    sheetLeadId: r.sheet_lead_id,
    supabaseId: r.id,

    batch: r.batch_name,
    sheet: r.sheet_name,

    name: r.name || '',
    email: r.email || '',
    phone: r.phone || '',
    platform: r.platform || '',
    status: r.status || 'New',
    assignedTo: r.assigned_to || '',
    createdDate: r.created_date || '',
    notes: r.notes || '',
    source: r.source || '',

    // Full intake data from Google Sheets
    intake_json: intake,

    // management fields (compat)
    priority: mgmt.priority || r.priority || '',
    callFeedback: mgmt.callFeedback || r.call_feedback || '',
    nextFollowUp: mgmt.nextFollowUp || r.next_follow_up || '',
    lastFollowUpComment: mgmt.lastFollowUpComment || r.last_follow_up_comment || '',
    pdfSent: mgmt.pdfSent ?? r.pdf_sent ?? false,
    waSent: mgmt.waSent ?? r.wa_sent ?? false,
    emailSent: mgmt.emailSent ?? r.email_sent ?? false,

    // followUpN fields (stored in management_json for now)
    ...mgmt
  };
}

async function updateMyLeadManagement({ officerName, batchName, sheetName, sheetLeadId, updates }) {
  const sb = requireSupabase();

  if (!officerName) {
    const err = new Error('Missing officerName');
    err.status = 400;
    throw err;
  }
  if (!batchName || !sheetName || !sheetLeadId) {
    const err = new Error('Missing batchName/sheetName/leadId');
    err.status = 400;
    throw err;
  }

  // ensure officer can only update their own assigned lead
  const { data: existing, error: exErr } = await sb
    .from('crm_leads')
    .select('id, assigned_to, management_json')
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('sheet_lead_id', sheetLeadId)
    .maybeSingle();

  if (exErr) throw exErr;
  if (!existing) {
    const err = new Error('Lead not found');
    err.status = 404;
    throw err;
  }

  if (String(existing.assigned_to || '') !== String(officerName)) {
    const err = new Error('Forbidden: lead not assigned to you');
    err.status = 403;
    throw err;
  }

  const mgmtUpdates = pickManagementFields(updates || {});
  const mergedMgmt = { ...(existing.management_json || {}), ...mgmtUpdates };

  const patch = {
    management_json: mergedMgmt,
    updated_at: new Date().toISOString()
  };

  // Also denormalize a few commonly displayed fields for easier querying
  if (mgmtUpdates.priority !== undefined) patch.priority = cleanString(mgmtUpdates.priority);
  if (mgmtUpdates.callFeedback !== undefined) patch.call_feedback = cleanString(mgmtUpdates.callFeedback);
  if (mgmtUpdates.nextFollowUp !== undefined) patch.next_follow_up = cleanString(mgmtUpdates.nextFollowUp);
  if (mgmtUpdates.lastFollowUpComment !== undefined) patch.last_follow_up_comment = cleanString(mgmtUpdates.lastFollowUpComment);

  if (mgmtUpdates.pdfSent !== undefined) patch.pdf_sent = toBool(mgmtUpdates.pdfSent);
  if (mgmtUpdates.waSent !== undefined) patch.wa_sent = toBool(mgmtUpdates.waSent);
  if (mgmtUpdates.emailSent !== undefined) patch.email_sent = toBool(mgmtUpdates.emailSent);

  const { data: updated, error } = await sb
    .from('crm_leads')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) throw error;

  return rowToLead(updated);
}

// Admin: update any lead (no officer restriction)
async function updateAdminLead({ batchName, sheetName, sheetLeadId, updates }) {
  const sb = requireSupabase();

  if (!batchName || !sheetName || !sheetLeadId) {
    const err = new Error('Missing batchName/sheetName/leadId');
    err.status = 400;
    throw err;
  }

  // Find the lead
  const { data: existing, error: exErr } = await sb
    .from('crm_leads')
    .select('id, management_json')
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('sheet_lead_id', sheetLeadId)
    .maybeSingle();

  if (exErr) throw exErr;
  if (!existing) {
    const err = new Error('Lead not found');
    err.status = 404;
    throw err;
  }

  const mgmtUpdates = pickManagementFields(updates || {});
  const mergedMgmt = { ...(existing.management_json || {}), ...mgmtUpdates };

  const patch = {
    management_json: mergedMgmt,
    updated_at: new Date().toISOString()
  };

  // Handle assignment updates specially
  if (updates.assignedTo !== undefined) {
    patch.assigned_to = cleanString(updates.assignedTo);
  }

  // Denormalize management fields
  if (mgmtUpdates.priority !== undefined) patch.priority = cleanString(mgmtUpdates.priority);
  if (mgmtUpdates.callFeedback !== undefined) patch.call_feedback = cleanString(mgmtUpdates.callFeedback);
  if (mgmtUpdates.nextFollowUp !== undefined) patch.next_follow_up = cleanString(mgmtUpdates.nextFollowUp);
  if (mgmtUpdates.lastFollowUpComment !== undefined) patch.last_follow_up_comment = cleanString(mgmtUpdates.lastFollowUpComment);

  if (mgmtUpdates.pdfSent !== undefined) patch.pdf_sent = toBool(mgmtUpdates.pdfSent);
  if (mgmtUpdates.waSent !== undefined) patch.wa_sent = toBool(mgmtUpdates.waSent);
  if (mgmtUpdates.emailSent !== undefined) patch.email_sent = toBool(mgmtUpdates.emailSent);

  const { data: updated, error } = await sb
    .from('crm_leads')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) throw error;

  return rowToLead(updated);
}

module.exports = {
  listMyLeads,
  listAdminLeads,
  updateMyLeadManagement,
  updateAdminLead
};
