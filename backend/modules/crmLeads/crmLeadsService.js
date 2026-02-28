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
const { normalizePhoneToSL } = require('../batches/duplicatePhoneResolver');

// Duplicate-by-phone cache (per batch)
// IMPORTANT: Business rule: when phone duplicates exist, only the *newer* leads are marked Duplicate.
// The earliest/primary lead for each phone remains normal/assignable.
const DUP_TTL_MS = 5 * 60 * 1000;
let __dupPhoneCache = new Map(); // batchName -> { expiresAt, duplicateLeadIds: Set<string> }

async function buildDuplicateLeadIdSetForBatch(sb, batchName) {
  const batch = cleanString(batchName);
  if (!batch) return new Set();

  // canonicalPhone -> { primaryId, primaryCreatedAt, primarySheetLeadId }
  const primary = new Map();
  const duplicateLeadIds = new Set();

  // Supabase selects are paginated; use range() to fetch all
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('crm_leads')
      .select('sheet_lead_id, phone, created_at')
      .eq('batch_name', batch)
      .range(from, from + PAGE - 1);
    if (error) throw error;

    (data || []).forEach(r => {
      const canon = normalizePhoneToSL(r?.phone);
      const id = String(r?.sheet_lead_id || '');
      if (!canon || !id) return;

      const createdAt = r?.created_at ? new Date(r.created_at).getTime() : 0;
      const sheetId = String(r?.sheet_lead_id || '');

      const prev = primary.get(canon);
      if (!prev) {
        primary.set(canon, { id, createdAt, sheetId });
        return;
      }

      // Compare which one is earlier (primary)
      const prevCreatedAt = prev.createdAt || 0;
      const earlier = (createdAt && prevCreatedAt)
        ? (createdAt < prevCreatedAt)
        : (createdAt ? true : false); // if prev has no createdAt but current does, prefer current as earlier

      let currentIsEarlier = earlier;
      if (createdAt === prevCreatedAt) {
        // tie-breaker: smaller sheet_lead_id is earlier (deterministic)
        currentIsEarlier = sheetId.localeCompare(prev.sheetId, undefined, { numeric: true, sensitivity: 'base' }) < 0;
      }

      if (currentIsEarlier) {
        // Previous primary becomes duplicate (newer), current becomes primary
        duplicateLeadIds.add(String(prev.id));
        primary.set(canon, { id, createdAt, sheetId });
      } else {
        // Current is newer -> duplicate
        duplicateLeadIds.add(id);
      }
    });

    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  return duplicateLeadIds;
}

async function getDuplicateLeadIdSetForBatch(sb, batchName) {
  const batch = cleanString(batchName);
  if (!batch) return new Set();

  const cached = __dupPhoneCache.get(batch);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.duplicateLeadIds;
  }

  const dupIds = await buildDuplicateLeadIdSetForBatch(sb, batch);
  __dupPhoneCache.set(batch, { duplicateLeadIds: dupIds, expiresAt: Date.now() + DUP_TTL_MS });
  return dupIds;
}

function clearDuplicatePhoneCache(batchName) {
  if (batchName) __dupPhoneCache.delete(cleanString(batchName));
  else __dupPhoneCache = new Map();
}

async function isDuplicateLeadInBatch(sb, batchName, sheetLeadId) {
  const batch = cleanString(batchName);
  const id = String(sheetLeadId || '');
  if (!batch || !id) return false;
  const dupIds = await getDuplicateLeadIdSetForBatch(sb, batch);
  return dupIds.has(id);
}

function applyDuplicateDisplay({ lead, dupLeadIdSet }) {
  if (!lead || !dupLeadIdSet || !(dupLeadIdSet instanceof Set)) return lead;
  const id = String(lead.id || lead.sheetLeadId || '');
  if (!id) return lead;
  if (!dupLeadIdSet.has(id)) return lead;
  return { ...lead, isDuplicate: true, assignedTo: 'Duplicate' };
}

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

  const leads = (data || []).map(rowToLead);

  // Duplicate marking is batch-scoped; only apply when batch is specified.
  if (batchName && batchName !== 'all') {
    try {
      const dupLeadIdSet = await getDuplicateLeadIdSetForBatch(sb, batchName);
      return leads.map(l => applyDuplicateDisplay({ lead: l, dupLeadIdSet }));
    } catch (_) {
      // ignore
    }
  }

  return leads;
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

  const leads = (data || []).map(rowToLead);

  // Duplicate marking is batch-scoped; only apply when batch is specified.
  if (batchName && batchName !== 'all') {
    try {
      const dupLeadIdSet = await getDuplicateLeadIdSetForBatch(sb, batchName);
      return leads.map(l => applyDuplicateDisplay({ lead: l, dupLeadIdSet }));
    } catch (_) {
      // ignore
    }
  }

  return leads;
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
    .select('id, management_json, assigned_to, phone')
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
    const next = cleanString(updates.assignedTo);

    // Prevent assigning duplicates to an officer (or any non-empty assignee).
    // Duplicates should stay unassigned and be surfaced as "Duplicate" in UI.
    if (next) {
      const phoneForCheck = (updates.phone !== undefined) ? updates.phone : existing?.phone;
      const isDup = await isDuplicateLeadInBatch(sb, batchName, sheetLeadId);
      if (isDup) {
        const err = new Error('Cannot assign this lead because the phone number is duplicated in this batch');
        err.status = 409;
        throw err;
      }
    }

    patch.assigned_to = next;
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

  // Assignment/phone changes can affect dup status; clear cache
  clearDuplicatePhoneCache(batchName);

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

  // Invalidate duplicate cache for this batch (phone set may have changed)
  clearDuplicatePhoneCache(batchName);

  // Map to API shape
  const apiLead = mapLeadRowToApi(data);
  try {
    const dupLeadIdSet = await getDuplicateLeadIdSetForBatch(sb, batchName);
    return applyDuplicateDisplay({ lead: apiLead, dupLeadIdSet });
  } catch (_) {
    return apiLead;
  }
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
  if (!ids.length) return { updatedCount: 0, skippedDuplicateCount: 0, skippedDuplicateLeadIds: [] };

  // Prevent assigning duplicates: skip any lead whose phone is duplicated within the batch
  const { data: phones, error: phErr } = await sb
    .from('crm_leads')
    .select('sheet_lead_id, phone')
    .eq('batch_name', batchName)
    .in('sheet_lead_id', ids);
  if (phErr) throw phErr;

  const dupLeadIdSet = await getDuplicateLeadIdSetForBatch(sb, batchName);
  const assignable = [];
  const skipped = [];
  (phones || []).forEach(r => {
    const id = String(r.sheet_lead_id);
    if (dupLeadIdSet.has(id)) skipped.push(id);
    else assignable.push(id);
  });

  if (!assignable.length) {
    return { updatedCount: 0, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };
  }

  const { data, error } = await sb
    .from('crm_leads')
    .update({ assigned_to: cleanString(assignedTo), updated_at: new Date().toISOString() })
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .in('sheet_lead_id', assignable)
    .select('id');

  if (error) throw error;

  clearDuplicatePhoneCache(batchName);

  // Notify new assignee once (best effort)
  try {
    const officerName = cleanString(assignedTo);
    if (officerName) {
      await notifyLeadAssignment({ officerName, leadCount: (data || []).length, batchName, sheetName });
    }
  } catch (_) {}

  return { updatedCount: (data || []).length, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };
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
  if (!ids.length) return { updatedCount: 0, skippedDuplicateCount: 0, skippedDuplicateLeadIds: [] };
  if (!offs.length) {
    const err = new Error('Missing officers list');
    err.status = 400;
    throw err;
  }

  // Skip duplicates during distribution
  const { data: phones, error: phErr } = await sb
    .from('crm_leads')
    .select('sheet_lead_id, phone')
    .eq('batch_name', batchName)
    .in('sheet_lead_id', ids);
  if (phErr) throw phErr;

  const dupLeadIdSet = await getDuplicateLeadIdSetForBatch(sb, batchName);
  const distributable = [];
  const skipped = [];
  (phones || []).forEach(r => {
    const id = String(r.sheet_lead_id);
    if (dupLeadIdSet.has(id)) skipped.push(id);
    else distributable.push(id);
  });

  if (!distributable.length) {
    return { updatedCount: 0, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };
  }

  // round-robin distribution
  const patches = distributable.map((id, idx) => ({
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

  clearDuplicatePhoneCache(batchName);

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

  return { updatedCount: distributable.length, skippedDuplicateCount: skipped.length, skippedDuplicateLeadIds: skipped };
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

  clearDuplicatePhoneCache(batchName);

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

  clearDuplicatePhoneCache(targetBatchName);

  const apiLead = mapLeadRowToApi(data);
  try {
    const dupLeadIdSet = await getDuplicateLeadIdSetForBatch(sb, targetBatchName);
    return applyDuplicateDisplay({ lead: apiLead, dupLeadIdSet });
  } catch (_) {
    return apiLead;
  }
}

async function assertOfficerCanUseSheet({ sb, batchName, sheetName, officerName }) {
  const b = cleanString(batchName);
  const s = normalizeSheetName(sheetName);
  const off = cleanString(officerName);
  if (!b || !s) throw Object.assign(new Error('Missing batch/sheet'), { status: 400 });

  // New rule: officers can only add/delete/copy leads to sheets they created.
  // "Main Leads" and "Extra Leads" are reserved (read-only for officers).
  const low = String(s).toLowerCase();
  if (['main leads', 'extra leads'].includes(low)) {
    throw Object.assign(new Error('Officers cannot add/delete leads in Main Leads / Extra Leads'), { status: 403 });
  }

  if (!off) {
    throw Object.assign(new Error('Missing officer name'), { status: 400 });
  }

  // Must be an officer-owned custom sheet
  const { data: mine, error: mineErr } = await sb
    .from('officer_custom_sheets')
    .select('sheet_name')
    .eq('batch_name', b)
    .eq('officer_name', off)
    .eq('sheet_name', s)
    .maybeSingle();

  if (mineErr) {
    const msg = String(mineErr.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) {
      throw Object.assign(new Error('Officer custom sheets table not found'), { status: 500 });
    }
    throw mineErr;
  }

  if (!mine) {
    throw Object.assign(new Error('Officers can only add/delete leads in sheets they created'), { status: 403 });
  }

  return true;
}

async function copyMyLead({ officerName, sourceBatchName, sourceSheetName, sourceLeadId, targetBatchName, targetSheetName }) {
  const sb = requireSupabase();
  const off = cleanString(officerName);
  if (!off) throw Object.assign(new Error('Missing officerName'), { status: 400 });

  const srcBatch = cleanString(sourceBatchName);
  const srcSheet = normalizeSheetName(sourceSheetName);
  const srcId = cleanString(sourceLeadId);
  if (!srcBatch || !srcSheet || !srcId) throw Object.assign(new Error('Missing source lead'), { status: 400 });

  const tgtBatch = cleanString(targetBatchName);
  if (tgtBatch && tgtBatch === srcBatch) throw Object.assign(new Error('Cannot copy to the same batch'), { status: 400 });

  await assertOfficerCanUseSheet({ sb, batchName: tgtBatch, sheetName: targetSheetName, officerName: off });

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
  const tgtBatch = cleanString(targetBatchName);
  if (tgtBatch && tgtBatch === srcBatch) throw Object.assign(new Error('Cannot copy to the same batch'), { status: 400 });
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

function normalizeCopySources(sources) {
  const arr = Array.isArray(sources) ? sources : [];
  return arr
    .map(s => ({
      batchName: cleanString(s?.batchName),
      sheetName: normalizeSheetName(s?.sheetName || 'Main Leads'),
      leadId: cleanString(s?.leadId)
    }))
    .filter(s => s.batchName && s.sheetName && s.leadId);
}

async function copyMyLeadsBulk({ officerName, sources, targetBatchName, targetSheetName }) {
  const sb = requireSupabase();
  const off = cleanString(officerName);
  if (!off) throw Object.assign(new Error('Missing officerName'), { status: 400 });

  const tgtBatch = cleanString(targetBatchName);
  await assertOfficerCanUseSheet({ sb, batchName: tgtBatch, sheetName: targetSheetName, officerName: off });

  const srcs = normalizeCopySources(sources);
  if (!srcs.length) throw Object.assign(new Error('No leads selected'), { status: 400 });

  if (srcs.some(s => String(s.batchName) === String(tgtBatch))) {
    throw Object.assign(new Error('Cannot copy to the same batch'), { status: 400 });
  }

  // Fetch all source rows
  const leadIds = srcs.map(s => s.leadId);
  const batches = Array.from(new Set(srcs.map(s => s.batchName)));

  // We can't do a composite IN easily; load by lead id and then filter
  const { data: rows, error } = await sb
    .from('crm_leads')
    .select('*')
    .in('sheet_lead_id', leadIds)
    .in('batch_name', batches);
  if (error) throw error;

  const rowKey = (r) => `${r.batch_name}||${normalizeSheetName(r.sheet_name)}||${String(r.sheet_lead_id)}`;
  const map = new Map((rows || []).map(r => [rowKey(r), r]));

  const created = [];
  for (const s of srcs) {
    const key = `${s.batchName}||${s.sheetName}||${s.leadId}`;
    const src = map.get(key);
    if (!src) continue;
    if (String(src.assigned_to || '') !== String(off)) {
      throw Object.assign(new Error('Forbidden: one or more leads are not assigned to you'), { status: 403 });
    }
    const newLead = await copyLeadRowForNew({
      sb,
      sourceRow: src,
      targetBatchName,
      targetSheetName,
      assignedToOverride: off
    });
    created.push(newLead);
  }

  return { createdCount: created.length, leads: created };
}

async function copyAdminLeadsBulk({ sources, targetBatchName, targetSheetName }) {
  const sb = requireSupabase();
  const tgtBatch = cleanString(targetBatchName);
  const srcs = normalizeCopySources(sources);
  if (!srcs.length) throw Object.assign(new Error('No leads selected'), { status: 400 });

  if (srcs.some(s => String(s.batchName) === String(tgtBatch))) {
    throw Object.assign(new Error('Cannot copy to the same batch'), { status: 400 });
  }

  const leadIds = srcs.map(s => s.leadId);
  const batches = Array.from(new Set(srcs.map(s => s.batchName)));

  const { data: rows, error } = await sb
    .from('crm_leads')
    .select('*')
    .in('sheet_lead_id', leadIds)
    .in('batch_name', batches);
  if (error) throw error;

  const rowKey = (r) => `${r.batch_name}||${normalizeSheetName(r.sheet_name)}||${String(r.sheet_lead_id)}`;
  const map = new Map((rows || []).map(r => [rowKey(r), r]));

  const created = [];
  for (const s of srcs) {
    const key = `${s.batchName}||${s.sheetName}||${s.leadId}`;
    const src = map.get(key);
    if (!src) continue;
    const newLead = await copyLeadRowForNew({ sb, sourceRow: src, targetBatchName, targetSheetName });
    created.push(newLead);
  }

  return { createdCount: created.length, leads: created };
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

  await assertOfficerCanUseSheet({ sb, batchName, sheetName, officerName });

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

  clearDuplicatePhoneCache(batchName);

  const apiLead = mapLeadRowToApi(data);
  try {
    const dupLeadIdSet = await getDuplicateLeadIdSetForBatch(sb, batchName);
    return applyDuplicateDisplay({ lead: apiLead, dupLeadIdSet });
  } catch (_) {
    return apiLead;
  }
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
  const excluded = new Set(['registrations', 'registration']);

  let q = sb.from('crm_leads').select('sheet_name, batch_name, assigned_to');
  if (assignedTo) q = q.eq('assigned_to', cleanString(assignedTo));
  if (batchName) q = q.eq('batch_name', cleanString(batchName));

  const { data, error } = await q;
  if (error) throw error;

  const set = new Set(
    (data || [])
      .map(r => normalizeSheetName(r.sheet_name))
      .filter(Boolean)
      .filter(s => !excluded.has(String(s).toLowerCase()))
  );

  // Include officer-created personal sheets too (admins can access them via lead management dropdown)
  // If batchName is provided, include for that batch only. If assignedTo is provided, try to include only
  // that officer’s personal sheets in the batch; otherwise include all officer personal sheets for the batch.
  try {
    let oq = sb.from('officer_custom_sheets').select('sheet_name, officer_name, batch_name');
    if (batchName) oq = oq.eq('batch_name', cleanString(batchName));
    if (assignedTo) oq = oq.eq('officer_name', cleanString(assignedTo));
    const { data: oSheets, error: oErr } = await oq;
    if (oErr) throw oErr;
    (oSheets || [])
      .map(r => normalizeSheetName(r.sheet_name))
      .filter(Boolean)
      .filter(s => !excluded.has(String(s).toLowerCase()))
      .forEach(s => set.add(s));
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (!(msg.includes('relation') || msg.includes('does not exist'))) {
      console.warn('listAdminSheets officer_custom_sheets load failed:', e?.message || e);
    }
  }

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

  // Exclude exported registrations sheet (comes from Registrations page export)
  const excluded = new Set(['registrations', 'registration']);
  const filtered = Array.from(set).filter(s => !excluded.has(String(normalizeSheetName(s)).toLowerCase()));

  return filtered.sort((a, c) => String(a).localeCompare(String(c)));
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

async function updateLeadStatusByPhoneAndBatch({ canonicalPhone, batchName, nextStatus }) {
  const sb = requireSupabase();
  const phone = cleanString(canonicalPhone);
  const batch = cleanString(batchName);
  const status = cleanString(nextStatus);
  if (!phone || !batch || !status) return { updatedCount: 0 };

  // Match by last 9 digits (fast), then update by batch + phone ilike
  const last9 = String(phone).replace(/\D/g, '').slice(-9);
  if (!last9) return { updatedCount: 0 };

  try {
    // Update any leads in this batch where phone ends with last9
    const { data, error } = await sb
      .from('crm_leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('batch_name', batch)
      .ilike('phone', `%${last9}`)
      .select('id');

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist')) return { updatedCount: 0 };
      throw error;
    }

    return { updatedCount: (data || []).length };
  } catch (e) {
    console.warn('Lead status sync failed:', e.message || e);
    return { updatedCount: 0, error: e.message || String(e) };
  }
}

async function bulkDeleteMy({ officerName, batchName, sheetName, leadIds }) {
  const sb = requireSupabase();
  const off = cleanString(officerName);
  const ids = normalizeLeadIds(leadIds);
  if (!off) throw Object.assign(new Error('Missing officerName'), { status: 400 });
  if (!batchName || !sheetName) throw Object.assign(new Error('Missing batchName/sheetName'), { status: 400 });

  // Only allow deleting leads from officer-created sheets
  await assertOfficerCanUseSheet({ sb, batchName, sheetName, officerName: off });

  if (!ids.length) return { deletedCount: 0 };

  // Extra safety: only delete rows assigned to this officer
  const { data, error } = await sb
    .from('crm_leads')
    .delete()
    .eq('batch_name', batchName)
    .eq('sheet_name', sheetName)
    .eq('assigned_to', off)
    .in('sheet_lead_id', ids)
    .select('id');

  if (error) throw error;

  clearDuplicatePhoneCache(batchName);

  return { deletedCount: (data || []).length };
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
  bulkDeleteMy,
  exportAdminCsv,
  importAdminCsv,
  listAdminBatches,
  listAdminSheets,
  listSheetsForBatch,
  createSheetForBatch,
  deleteSheetForBatch,
  copyMyLead,
  copyAdminLead,
  copyMyLeadsBulk,
  copyAdminLeadsBulk,
  updateLeadStatusByPhoneAndBatch
};
