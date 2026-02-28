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

// Resolve officer display name -> Supabase Auth user id (best effort)
// We keep a short-lived cache because listUsers can be expensive.
let __officerIdCache = { map: new Map(), expiresAt: 0 };

async function resolveOfficerUserIdByName(officerName) {
  const name = cleanString(officerName);
  if (!name) return null;

  const sb = requireSupabase();

  // cache for 60s
  if (__officerIdCache.expiresAt > Date.now()) {
    return __officerIdCache.map.get(name.toLowerCase()) || null;
  }

  try {
    const { data: { users } = {}, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
    if (error) throw error;

    const map = new Map();
    (users || []).forEach(u => {
      const role = u?.user_metadata?.role;
      const display = cleanString(u?.user_metadata?.name) || cleanString(u?.email?.split('@')?.[0]);
      if (!display) return;
      // Only cache staff-like accounts
      if (role && !['officer', 'admission_officer', 'admin'].includes(role)) return;
      map.set(display.toLowerCase(), u.id);
    });

    __officerIdCache = { map, expiresAt: Date.now() + 60 * 1000 };
    return map.get(name.toLowerCase()) || null;
  } catch (e) {
    console.warn('resolveOfficerUserIdByName failed:', e.message);
    return null;
  }
}

async function notifyLeadAssignment({ officerName, leadCount = 1, batchName, sheetName }) {
  const userId = await resolveOfficerUserIdByName(officerName);
  if (!userId) return;

  try {
    const { createNotification } = require('../notifications/notificationsService');
    const title = 'New leads assigned';
    const msg = `${Number(leadCount) || 1} lead(s) assigned — ${cleanString(batchName)}${sheetName ? ' / ' + cleanString(sheetName) : ''}`;
    await createNotification({
      userId,
      category: 'lead_assignment',
      title,
      message: msg,
      type: 'info'
    });
  } catch (e) {
    // non-fatal
    console.warn('notifyLeadAssignment failed:', e.message);
  }
}

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

  // Default order: lead added order (stable)
  // Prefer created_at (when available), then sheet_lead_id.
  const { data, error } = await q
    .order('created_at', { ascending: true, nullsFirst: false })
    .order('sheet_lead_id', { ascending: true });
  if (error) throw error;

  return (data || []).map(rowToLead);
}

// Admin: list all leads (no officer filter)
async function listAdminLeads({ batchName, sheetName, search, status, assignedTo }) {
  const sb = requireSupabase();

  console.log('🔍 Querying Supabase for admin leads:', { batchName, sheetName, status, search });

  let q = sb.from('crm_leads').select('*');

  if (batchName && batchName !== 'all') q = q.eq('batch_name', batchName);
  if (sheetName) q = q.eq('sheet_name', sheetName);
  if (status) q = q.eq('status', status);
  if (assignedTo) q = q.eq('assigned_to', cleanString(assignedTo));

  if (search) {
    const s = `%${search}%`;
    q = q.or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
  }

  // Default order: lead added order (stable)
  // Prefer created_at (when available), then sheet_lead_id.
  const { data, error } = await q
    .order('created_at', { ascending: true, nullsFirst: false })
    .order('sheet_lead_id', { ascending: true });
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
    createdDate: r.created_date || r.created_at || '',
    notes: r.notes || '',
    source: r.source || '',

    // Full intake data from Google Sheets
    intake_json: intake,

    // management fields (compat)
    // Use nullish coalescing (??) instead of || so that intentionally-cleared
    // empty strings do NOT fall back to older denormalized DB columns.
    priority: (mgmt.priority ?? r.priority ?? ''),
    callFeedback: (mgmt.callFeedback ?? r.call_feedback ?? ''),
    nextFollowUp: (mgmt.nextFollowUp ?? r.next_follow_up ?? ''),
    lastFollowUpComment: (mgmt.lastFollowUpComment ?? r.last_follow_up_comment ?? ''),
    pdfSent: mgmt.pdfSent ?? r.pdf_sent ?? false,
    waSent: mgmt.waSent ?? r.wa_sent ?? false,
    emailSent: mgmt.emailSent ?? r.email_sent ?? false,

    // followUpN fields (stored in management_json for now)
    ...mgmt
  };
}

async function updateMyLeadManagement({ officerName, batchName, sheetName, sheetLeadId, updates, officerUserId }) {
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

  // Also persist follow-ups in normalized table (officer-owned)
  // Best-effort: does not block saving management_json.
  try {
    const followupsSvc = require('./followupsService');
    if (officerUserId) {
      await followupsSvc.syncLegacyFollowupsFromManagement({
        officerUserId,
        officerName,
        batchName,
        sheetName,
        sheetLeadId,
        management: mergedMgmt
      });
    }
  } catch (e) {
    console.warn('⚠️ Followups sync skipped/failed:', e.message);
  }

  const patch = {
    management_json: mergedMgmt,
    updated_at: new Date().toISOString()
  };

  // Persist core lead fields
  if (updates.status !== undefined) {
    patch.status = cleanString(updates.status) || 'New';
  }

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
    .select('id, management_json, assigned_to')
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

  // Persist core lead fields
  if (updates.status !== undefined) {
    patch.status = cleanString(updates.status) || 'New';
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

  // Notify on assignment change (best effort)
  try {
    const prevAssigned = cleanString(existing?.assigned_to);
    const nextAssigned = cleanString(updated?.assigned_to);
    if (updates?.assignedTo !== undefined && prevAssigned !== nextAssigned && nextAssigned) {
      await notifyLeadAssignment({ officerName: nextAssigned, leadCount: 1, batchName, sheetName });
    }
  } catch (_) {}

  return rowToLead(updated);
}

function normalizeLeadIds(leadIds) {
  if (!Array.isArray(leadIds)) return [];
  return leadIds.map(x => String(x)).filter(Boolean);
}

async function createAdminLead({ batchName, sheetName, lead }) {
  const sb = requireSupabase();
  if (!batchName || !sheetName) {
    const err = new Error('Missing batchName/sheetName');
    err.status = 400;
    throw err;
  }

  // Sheet lead id: use timestamp-like unique string if not provided
  const sheetLeadId = cleanString(lead?.id) || String(Date.now());
  const row = {
    batch_name: batchName,
    sheet_name: sheetName,
    sheet_lead_id: sheetLeadId,
    name: cleanString(lead?.name),
    email: cleanString(lead?.email),
    phone: cleanString(lead?.phone),
    source: cleanString(lead?.source),
    status: cleanString(lead?.status) || 'New',
    priority: cleanString(lead?.priority),
    notes: cleanString(lead?.notes),
    assigned_to: cleanString(lead?.assignedTo),
    created_at: new Date().toISOString(),
    // Keep legacy-compatible created_date (used by UI)
    created_date: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Optional course inside intake_json
  const course = cleanString(lead?.course);
  if (course) row.intake_json = { course };

  const { data, error } = await sb
    .from('crm_leads')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;

  // Map to API shape
  return mapLeadRowToApi(data);
}

async function distributeUnassignedAdmin({ batchName, sheetName, officers }) {
  const sb = requireSupabase();
  const offs = Array.isArray(officers) ? officers.map(cleanString).filter(Boolean) : [];
  if (!batchName || !sheetName) {
    const err = new Error('Missing batchName/sheetName');
    err.status = 400;
    throw err;
  }
  if (!offs.length) {
    const err = new Error('Missing officers list');
    err.status = 400;
    throw err;
  }

  // Find unassigned leads
  const { data: unassigned, error } = await sb
    .from('crm_leads')
    .select('*')
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .or('assigned_to.is.null,assigned_to.eq.')
    // Deterministic order so round-robin is predictable
    .order('sheet_lead_id', { ascending: true });

  if (error) throw error;
  const ids = (unassigned || []).map(r => String(r.sheet_lead_id)).filter(Boolean);
  if (!ids.length) return { updatedCount: 0 };

  return bulkDistributeAdmin({ batchName, sheetName, leadIds: ids, officers: offs });
}

async function bulkAssignAdmin({ batchName, sheetName, leadIds, assignedTo }) {
  const sb = requireSupabase();
  const ids = normalizeLeadIds(leadIds);
  if (!batchName || !sheetName) {
    const err = new Error('Missing batchName/sheetName');
    err.status = 400;
    throw err;
  }
  if (!ids.length) return { updatedCount: 0 };

  const { data, error } = await sb
    .from('crm_leads')
    .update({ assigned_to: cleanString(assignedTo), updated_at: new Date().toISOString() })
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .in('sheet_lead_id', ids)
    .select('id');

  if (error) throw error;

  // Notify new assignee once (best effort)
  try {
    const officerName = cleanString(assignedTo);
    if (officerName) {
      await notifyLeadAssignment({ officerName, leadCount: (data || []).length, batchName, sheetName });
    }
  } catch (_) {}

  return { updatedCount: (data || []).length };
}

async function bulkDistributeAdmin({ batchName, sheetName, leadIds, officers }) {
  const sb = requireSupabase();
  // Sort ids so distribution is deterministic
  const ids = normalizeLeadIds(leadIds).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
  const offs = Array.isArray(officers) ? officers.map(cleanString).filter(Boolean) : [];
  if (!batchName || !sheetName) {
    const err = new Error('Missing batchName/sheetName');
    err.status = 400;
    throw err;
  }
  if (!ids.length) return { updatedCount: 0 };
  if (!offs.length) {
    const err = new Error('Missing officers list');
    err.status = 400;
    throw err;
  }

  // round-robin distribution
  const patches = ids.map((id, idx) => ({
    batch_name: batchName,
    sheet_name: sheetName,
    sheet_lead_id: id,
    assigned_to: offs[idx % offs.length]
  }));

  // Upsert updates by (batch_name, sheet_name, sheet_lead_id)
  // NOTE: requires unique constraint in DB; if not present, fall back to per-row updates
  const { error: upsertErr } = await sb
    .from('crm_leads')
    .upsert(patches, { onConflict: 'batch_name,sheet_name,sheet_lead_id', ignoreDuplicates: false });

  if (upsertErr) {
    // fallback: sequential updates
    let updatedCount = 0;
    for (const p of patches) {
      const { data, error } = await sb
        .from('crm_leads')
        .update({ assigned_to: p.assigned_to, updated_at: new Date().toISOString() })
        .eq('batch_name', p.batch_name)
        .eq('sheet_name', p.sheet_name)
        .eq('sheet_lead_id', p.sheet_lead_id)
        .select('id');
      if (error) throw error;
      updatedCount += (data || []).length;
    }
    return { updatedCount, fallback: true };
  }

  return { updatedCount: ids.length };
}

async function bulkDeleteAdmin({ batchName, sheetName, leadIds }) {
  const sb = requireSupabase();
  const ids = normalizeLeadIds(leadIds);
  if (!batchName || !sheetName) {
    const err = new Error('Missing batchName/sheetName');
    err.status = 400;
    throw err;
  }
  if (!ids.length) return { deletedCount: 0 };

  const { data, error } = await sb
    .from('crm_leads')
    .delete()
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .in('sheet_lead_id', ids)
    .select('id');

  if (error) throw error;
  return { deletedCount: (data || []).length };
}

function toCsvValue(v) {
  const s = String(v ?? '');
  if (/[\n\r,\"]/g.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportAdminCsv({ batchName, sheetName, search, status }) {
  const leads = await listAdminLeads({ batchName, sheetName, search, status, assignedTo: null });
  const headers = ['batch', 'sheet', 'id', 'name', 'email', 'phone', 'source', 'status', 'priority', 'assignedTo', 'notes'];
  const lines = [headers.join(',')];
  for (const l of leads) {
    const row = [
      l.batch,
      l.sheet,
      l.id,
      l.name,
      l.email,
      l.phone,
      l.source,
      l.status,
      l.priority,
      l.assignedTo,
      l.notes
    ].map(toCsvValue);
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function parseCsv(csvText) {
  // Minimal CSV parser (supports quotes)
  const rows = [];
  let i = 0;
  let cur = '';
  let inQuotes = false;
  let row = [];
  const text = String(csvText || '');
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(cur);
      cur = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  // last
  row.push(cur);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

async function importAdminCsv({ batchName, sheetName, csvText }) {
  const sb = requireSupabase();
  if (!batchName || !sheetName) {
    const err = new Error('Missing batchName/sheetName');
    err.status = 400;
    throw err;
  }
  const rows = parseCsv(csvText);
  if (!rows.length) return { importedCount: 0 };
  const headers = rows[0].map(h => String(h || '').trim());
  const idx = (h) => headers.findIndex(x => x.toLowerCase() === String(h).toLowerCase());

  const idIdx = idx('id');
  if (idIdx === -1) {
    const err = new Error('CSV must include id column');
    err.status = 400;
    throw err;
  }

  const patches = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = String(row[idIdx] || '').trim();
    if (!id) continue;
    const patch = {
      batch_name: batchName,
      sheet_name: sheetName,
      sheet_lead_id: id,
      name: String(row[idx('name')] ?? ''),
      email: String(row[idx('email')] ?? ''),
      phone: String(row[idx('phone')] ?? ''),
      source: String(row[idx('source')] ?? ''),
      status: String(row[idx('status')] ?? ''),
      notes: String(row[idx('notes')] ?? ''),
      assigned_to: String(row[idx('assignedTo')] ?? row[idx('assigned_to')] ?? ''),
      priority: String(row[idx('priority')] ?? ''),
      updated_at: new Date().toISOString()
    };
    patches.push(patch);
  }

  if (!patches.length) return { importedCount: 0 };

  const { error } = await sb
    .from('crm_leads')
    .upsert(patches, { onConflict: 'batch_name,sheet_name,sheet_lead_id', ignoreDuplicates: false });

  if (error) throw error;
  return { importedCount: patches.length };
}

async function copyLeadRowForNew({ sb, sourceRow, targetBatchName, targetSheetName, assignedToOverride = undefined }) {
  const now = new Date().toISOString();
  const newSheetLeadId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  const row = {
    batch_name: cleanString(targetBatchName),
    sheet_name: normalizeSheetName(targetSheetName),
    sheet_lead_id: newSheetLeadId,

    // Copy core lead fields
    name: cleanString(sourceRow?.name),
    email: cleanString(sourceRow?.email),
    phone: cleanString(sourceRow?.phone),
    source: cleanString(sourceRow?.source),
    status: cleanString(sourceRow?.status) || 'New',
    priority: cleanString(sourceRow?.priority),
    notes: cleanString(sourceRow?.notes),

    // Treat as new: reset tracking/management json
    management_json: null,

    // Keep intake_json if present
    intake_json: sourceRow?.intake_json && typeof sourceRow.intake_json === 'object' ? sourceRow.intake_json : null,

    assigned_to: assignedToOverride !== undefined ? cleanString(assignedToOverride) : cleanString(sourceRow?.assigned_to),

    created_at: now,
    created_date: now,
    updated_at: now
  };

  const { data, error } = await sb
    .from('crm_leads')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return mapLeadRowToApi(data);
}

async function copyMyLead({ officerName, sourceBatchName, sourceSheetName, sourceLeadId, targetBatchName, targetSheetName }) {
  const sb = requireSupabase();
  const off = cleanString(officerName);
  if (!off) throw Object.assign(new Error('Missing officerName'), { status: 400 });

  const srcBatch = cleanString(sourceBatchName);
  const srcSheet = normalizeSheetName(sourceSheetName);
  const srcId = cleanString(sourceLeadId);
  if (!srcBatch || !srcSheet || !srcId) throw Object.assign(new Error('Missing source lead'), { status: 400 });

  const { data: src, error } = await sb
    .from('crm_leads')
    .select('*')
    .eq('batch_name', srcBatch)
    .eq('sheet_name', srcSheet)
    .eq('sheet_lead_id', srcId)
    .single();
  if (error) throw error;

  if (String(src.assigned_to || '') !== String(off)) {
    throw Object.assign(new Error('Forbidden: lead not assigned to you'), { status: 403 });
  }

  // Officer copy: keep assigned_to as officer
  return copyLeadRowForNew({
    sb,
    sourceRow: src,
    targetBatchName,
    targetSheetName,
    assignedToOverride: off
  });
}

async function copyAdminLead({ sourceBatchName, sourceSheetName, sourceLeadId, targetBatchName, targetSheetName }) {
  const sb = requireSupabase();
  const srcBatch = cleanString(sourceBatchName);
  const srcSheet = normalizeSheetName(sourceSheetName);
  const srcId = cleanString(sourceLeadId);
  if (!srcBatch || !srcSheet || !srcId) throw Object.assign(new Error('Missing source lead'), { status: 400 });

  const { data: src, error } = await sb
    .from('crm_leads')
    .select('*')
    .eq('batch_name', srcBatch)
    .eq('sheet_name', srcSheet)
    .eq('sheet_lead_id', srcId)
    .single();
  if (error) throw error;

  return copyLeadRowForNew({ sb, sourceRow: src, targetBatchName, targetSheetName });
}

async function createOfficerLead({ officerName, batchName, sheetName, lead }) {
  const sb = requireSupabase();
  if (!officerName) {
    const err = new Error('Missing officerName');
    err.status = 400;
    throw err;
  }
  if (!batchName || batchName === 'all' || !sheetName) {
    const err = new Error('Missing batchName/sheetName');
    err.status = 400;
    throw err;
  }

  const sheetLeadId = cleanString(lead?.id) || String(Date.now());
  const row = {
    batch_name: batchName,
    sheet_name: sheetName,
    sheet_lead_id: sheetLeadId,
    name: cleanString(lead?.name),
    email: cleanString(lead?.email),
    phone: cleanString(lead?.phone),
    source: cleanString(lead?.source),
    status: cleanString(lead?.status) || 'New',
    priority: cleanString(lead?.priority),
    notes: cleanString(lead?.notes),
    assigned_to: officerName,
    created_at: new Date().toISOString(),
    created_date: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const course = cleanString(lead?.course);
  if (course) row.intake_json = { course };

  const { data, error } = await sb
    .from('crm_leads')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return mapLeadRowToApi(data);
}

async function listAdminBatches({ assignedTo }) {
  const sb = requireSupabase();
  let q = sb.from('crm_leads').select('batch_name');
  if (assignedTo) q = q.eq('assigned_to', cleanString(assignedTo));

  const { data, error } = await q;
  if (error) throw error;

  const set = new Set((data || []).map(r => r.batch_name).filter(Boolean));
  return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
}

async function listAdminSheets({ assignedTo, batchName }) {
  const sb = requireSupabase();
  let q = sb.from('crm_leads').select('sheet_name');
  if (assignedTo) q = q.eq('assigned_to', cleanString(assignedTo));
  if (batchName) q = q.eq('batch_name', cleanString(batchName));

  const { data, error } = await q;
  if (error) throw error;

  const set = new Set((data || []).map(r => r.sheet_name).filter(Boolean));
  return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
}

function normalizeSheetName(name) {
  const raw = String(name || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const low = raw.toLowerCase();
  if (low === 'main leads') return 'Main Leads';
  if (low === 'extra leads') return 'Extra Leads';
  // Title-case-ish: keep user casing, but collapse spaces
  return raw;
}

function validateSheetName(name) {
  const n = normalizeSheetName(name);
  if (!n) throw Object.assign(new Error('Sheet name is required'), { status: 400 });
  if (!/^[a-zA-Z0-9 _-]+$/.test(n)) {
    throw Object.assign(new Error('Sheet name can only contain letters, numbers, spaces, hyphen (-) and underscore (_)'), { status: 400 });
  }
  const key = n.toLowerCase();
  if (['main leads','extra leads'].includes(key)) {
    throw Object.assign(new Error('This sheet name is reserved'), { status: 400 });
  }
  return n;
}

async function listSheetsForBatch({ batchName, user }) {
  const sb = requireSupabase();
  const b = cleanString(batchName);
  if (!b) throw Object.assign(new Error('batch is required'), { status: 400 });

  const defaults = ['Main Leads', 'Extra Leads'];

  // existing sheets from leads
  const { data: leadSheets, error: lErr } = await sb
    .from('crm_leads')
    .select('sheet_name')
    .eq('batch_name', b);
  if (lErr) throw lErr;

  const set = new Set(defaults);
  (leadSheets || []).map(r => normalizeSheetName(r.sheet_name)).filter(Boolean).forEach(s => set.add(s));

  // shared sheets (admin-created)
  try {
    const { data: shared } = await sb
      .from('batch_shared_sheets')
      .select('sheet_name')
      .eq('batch_name', b);
    (shared || []).map(r => normalizeSheetName(r.sheet_name)).filter(Boolean).forEach(s => set.add(s));
  } catch (_) {}

  // officer personal sheets
  if (String(user?.role || '') !== 'admin') {
    const officerName = cleanString(user?.name);
    if (officerName) {
      try {
        const { data: mine } = await sb
          .from('officer_custom_sheets')
          .select('sheet_name')
          .eq('batch_name', b)
          .eq('officer_name', officerName);
        (mine || []).map(r => normalizeSheetName(r.sheet_name)).filter(Boolean).forEach(s => set.add(s));
      } catch (_) {}
    }
  }

  return Array.from(set).sort((a, c) => String(a).localeCompare(String(c)));
}

async function deleteSheetForBatch({ batchName, sheetName, scope, user }) {
  const sb = requireSupabase();
  const b = cleanString(batchName);
  const sheet = normalizeSheetName(sheetName);
  if (!b) throw Object.assign(new Error('batch is required'), { status: 400 });
  if (!sheet) throw Object.assign(new Error('sheet is required'), { status: 400 });

  // Don't allow deleting defaults
  const low = sheet.toLowerCase();
  if (['main leads', 'extra leads'].includes(low)) {
    throw Object.assign(new Error('Cannot delete default sheets'), { status: 400 });
  }

  const sc = String(scope || '').toLowerCase();

  if (String(user?.role || '') === 'admin' && sc === 'admin') {
    await sb.from('batch_shared_sheets')
      .delete()
      .eq('batch_name', b)
      .eq('sheet_name', sheet);
    return { deleted: true, scope: 'admin', sheetName: sheet };
  }

  const officerName = cleanString(user?.name);
  if (!officerName) throw Object.assign(new Error('Missing officer name'), { status: 400 });

  // Only allow deletion if it's the officer's own sheet
  await sb.from('officer_custom_sheets')
    .delete()
    .eq('batch_name', b)
    .eq('officer_name', officerName)
    .eq('sheet_name', sheet);

  return { deleted: true, scope: 'officer', sheetName: sheet };
}

async function createSheetForBatch({ batchName, sheetName, scope, user }) {
  const sb = requireSupabase();
  const b = cleanString(batchName);
  if (!b) throw Object.assign(new Error('batchName is required'), { status: 400 });

  const s = validateSheetName(sheetName);
  const sc = String(scope || '').toLowerCase();

  if (String(user?.role || '') === 'admin' && sc === 'admin') {
    // Persist metadata in Supabase
    await sb.from('batch_shared_sheets').upsert({
      batch_name: b,
      sheet_name: s,
      created_by: cleanString(user?.name) || cleanString(user?.email) || null
    }, { onConflict: 'batch_name,sheet_name' });

    // Also create the tab in the batch's MAIN Google Spreadsheet so batch sync will pull it.
    // (Pushes structure only; leads are still managed in Supabase.)
    try {
      const batchSheetsSvc = require('../batches/batchSheetsService');
      await batchSheetsSvc.createSheetForBatch(b, s);
    } catch (e) {
      // Don't fail sheet creation in Supabase if Google creation fails, but do warn.
      console.warn('Failed to create Google Sheet tab for admin sheet:', b, s, e?.message || e);
    }

    return { sheetName: s, scope: 'admin', googleTabCreated: true };
  }

  // officer scope (or default)
  const officerName = cleanString(user?.name);
  if (!officerName) throw Object.assign(new Error('Missing officer name'), { status: 400 });

  await sb.from('officer_custom_sheets').upsert({
    batch_name: b,
    officer_name: officerName,
    sheet_name: s,
    created_at: new Date().toISOString()
  }, { onConflict: 'batch_name,officer_name,sheet_name' });

  return { sheetName: s, scope: 'officer' };
}

module.exports = {
  listMyLeads,
  listAdminLeads,
  updateMyLeadManagement,
  updateAdminLead,
  createAdminLead,
  createOfficerLead,
  distributeUnassignedAdmin,
  bulkAssignAdmin,
  bulkDistributeAdmin,
  bulkDeleteAdmin,
  exportAdminCsv,
  importAdminCsv,
  listAdminBatches,
  listAdminSheets,
  listSheetsForBatch,
  createSheetForBatch,
  deleteSheetForBatch,
  copyMyLead,
  copyAdminLead
};
