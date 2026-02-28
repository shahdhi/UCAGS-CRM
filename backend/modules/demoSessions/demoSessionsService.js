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

function clean(v) {
  if (v == null) return '';
  return String(v).trim();
}

function safeEnum(v, allowed, fallback) {
  const s = clean(v);
  return allowed.includes(s) ? s : fallback;
}

const INVITE_STATUSES = ['Invited', 'Confirmed', 'Cancelled', 'Not reachable'];
const ATTENDANCE = ['Unknown', 'Attended', 'Not attended'];
const RESPONSES = ['Pending', 'Positive', 'Negative', 'Neutral'];

async function ensureSession({ batchName, demoNumber, patch = {}, actorUserId }) {
  const sb = requireSupabase();
  const b = clean(batchName);
  const n = Number(demoNumber);
  if (!b) throw Object.assign(new Error('batchName is required'), { status: 400 });
  if (!Number.isFinite(n) || n < 1) throw Object.assign(new Error('demoNumber is invalid'), { status: 400 });

  const payload = {
    batch_name: b,
    demo_number: n,
    title: patch.title != null ? clean(patch.title) : null,
    scheduled_at: patch.scheduled_at || patch.scheduledAt || null,
    meeting_link: patch.meeting_link != null ? clean(patch.meeting_link) : (patch.meetingLink != null ? clean(patch.meetingLink) : null),
    notes: patch.notes != null ? clean(patch.notes) : null,
    updated_at: new Date().toISOString()
  };

  // only set created_by on insert
  if (actorUserId) payload.created_by = actorUserId;

  const { data, error } = await sb
    .from('demo_sessions')
    .upsert(payload, { onConflict: 'batch_name,demo_number', ignoreDuplicates: false })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listSessions({ batchName }) {
  const sb = requireSupabase();
  const b = clean(batchName);
  if (!b) throw Object.assign(new Error('batchName is required'), { status: 400 });

  const { data, error } = await sb
    .from('demo_sessions')
    .select('*')
    .eq('batch_name', b)
    .eq('archived', false)
    .order('demo_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listInvites({ demoSessionId, officerId }) {
  const sb = requireSupabase();
  const id = clean(demoSessionId);
  if (!id) throw Object.assign(new Error('demoSessionId is required'), { status: 400 });

  let q = sb
    .from('demo_session_invites')
    .select('*')
    .eq('demo_session_id', id);

  const oid = clean(officerId);
  if (oid) q = q.eq('created_by', oid);

  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function inviteLeadToDemo({ batchName, demoNumber, lead, actorUserId, link }) {
  const sb = requireSupabase();
  const id = clean(demoSessionId);
  if (!id) throw Object.assign(new Error('demoSessionId is required'), { status: 400 });

  const { data, error } = await sb
    .from('demo_session_invites')
    .select('*')
    .eq('demo_session_id', id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function inviteLeadToDemo({ batchName, demoNumber, lead, actorUserId, link }) {
  const sb = requireSupabase();
  const session = await ensureSession({ batchName, demoNumber, patch: {}, actorUserId });

  const crmLeadId = clean(lead?.crm_lead_id || lead?.crmLeadId || lead?.supabaseId || lead?.id);
  if (!crmLeadId) throw Object.assign(new Error('lead.supabaseId (crm lead id) is required'), { status: 400 });

  const row = {
    demo_session_id: session.id,
    crm_lead_id: crmLeadId,
    batch_name: clean(lead?.batch_name || lead?.batch || batchName),
    sheet_name: clean(lead?.sheet_name || lead?.sheet || ''),
    sheet_lead_id: clean(lead?.sheet_lead_id || lead?.sheetLeadId || ''),
    name: clean(lead?.name || ''),
    contact_number: clean(lead?.contact_number || lead?.phone || lead?.contactNumber || ''),
    invite_status: 'Invited',
    attendance: 'Unknown',
    response: 'Pending',
    link: link != null ? clean(link) : null,
    created_by: actorUserId || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from('demo_session_invites')
    .upsert(row, { onConflict: 'demo_session_id,crm_lead_id', ignoreDuplicates: false })
    .select('*')
    .single();
  if (error) throw error;
  return { session, invite: data };
}

async function updateInvite({ inviteId, patch, actorUserId }) {
  const sb = requireSupabase();
  const id = clean(inviteId);
  if (!id) throw Object.assign(new Error('inviteId is required'), { status: 400 });

  const upd = { updated_at: new Date().toISOString() };
  if (patch.invite_status !== undefined || patch.inviteStatus !== undefined) {
    upd.invite_status = safeEnum(patch.invite_status || patch.inviteStatus, INVITE_STATUSES, 'Invited');
  }
  if (patch.attendance !== undefined) {
    upd.attendance = safeEnum(patch.attendance, ATTENDANCE, 'Unknown');
  }
  if (patch.response !== undefined) {
    upd.response = safeEnum(patch.response, RESPONSES, 'Pending');
  }
  if (patch.comments_after_inauguration !== undefined || patch.commentsAfterInauguration !== undefined) {
    upd.comments_after_inauguration = clean(patch.comments_after_inauguration || patch.commentsAfterInauguration);
  }
  if (patch.link !== undefined) {
    upd.link = clean(patch.link);
  }

  const { data, error } = await sb
    .from('demo_session_invites')
    .update(upd)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function addReminder({ inviteId, remindAt, note, actorUserId }) {
  const sb = requireSupabase();
  const id = clean(inviteId);
  if (!id) throw Object.assign(new Error('inviteId is required'), { status: 400 });

  const { count } = await sb
    .from('demo_invite_reminders')
    .select('id', { count: 'exact', head: true })
    .eq('invite_id', id);

  const n = (count || 0) + 1;

  const parsed = clean(remindAt);
  const d = parsed ? new Date(parsed) : null;
  if (!d || Number.isNaN(d.getTime())) {
    throw Object.assign(new Error('remindAt is required'), { status: 400 });
  }
  const remindAtIso = d.toISOString();

  const row = {
    invite_id: id,
    reminder_number: n,
    note: clean(note),
    // Reuse existing column as the scheduled reminder time
    sent_at: remindAtIso,
    created_by: actorUserId || null
  };

  const { data, error } = await sb
    .from('demo_invite_reminders')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function deleteInvite({ inviteId }) {
  const sb = requireSupabase();
  const id = clean(inviteId);
  if (!id) throw Object.assign(new Error('inviteId is required'), { status: 400 });

  // Remove reminders first (in case FK cascade is not configured)
  const { error: rerr } = await sb
    .from('demo_invite_reminders')
    .delete()
    .eq('invite_id', id);
  if (rerr) throw rerr;

  const { data, error } = await sb
    .from('demo_session_invites')
    .delete()
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listReminders({ inviteId }) {
  const sb = requireSupabase();
  const id = clean(inviteId);
  if (!id) throw Object.assign(new Error('inviteId is required'), { status: 400 });

  const { data, error } = await sb
    .from('demo_invite_reminders')
    .select('*')
    .eq('invite_id', id)
    .order('reminder_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listLeadDemoInvites({ crmLeadId }) {
  const sb = requireSupabase();
  const id = clean(crmLeadId);
  if (!id) throw Object.assign(new Error('crmLeadId is required'), { status: 400 });

  // Fetch invites + session details
  const { data: invites, error } = await sb
    .from('demo_session_invites')
    .select('*, demo_sessions (*)')
    .eq('crm_lead_id', id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = invites || [];
  if (!rows.length) return [];

  // Fetch reminders for all invite ids in one query
  const inviteIds = rows.map(r => r.id);
  const { data: rems, error: rerr } = await sb
    .from('demo_invite_reminders')
    .select('*')
    .in('invite_id', inviteIds)
    .order('reminder_number', { ascending: true });
  if (rerr) throw rerr;

  const byInvite = new Map();
  (rems || []).forEach(r => {
    const arr = byInvite.get(r.invite_id) || [];
    arr.push(r);
    byInvite.set(r.invite_id, arr);
  });

  return rows.map(inv => ({
    invite: inv,
    session: inv.demo_sessions || null,
    reminders: byInvite.get(inv.id) || []
  }));
}

module.exports = {
  ensureSession,
  listSessions,
  listInvites,
  inviteLeadToDemo,
  updateInvite,
  addReminder,
  listReminders,
  listLeadDemoInvites,
  deleteInvite
};
