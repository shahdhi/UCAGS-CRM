/**
 * Leave Requests Service
 *
 * Stores leave requests in Supabase (leave_requests table).
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');

const VALID_LEAVE_TYPES = ['full_day', 'morning', 'afternoon'];

function requireSb() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin client not available');
  return sb;
}

function isYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function rowToObj(row) {
  return {
    id: row.id,
    officer_name: row.officer_name,
    leave_date: row.leave_date,
    leave_type: row.leave_type || 'full_day',
    reason: row.reason || '',
    status: row.status || 'pending',
    admin_name: row.admin_name || '',
    admin_comment: row.admin_comment || '',
    created_at: row.created_at || '',
    decided_at: row.decided_at || ''
  };
}

async function listLeaveRequests({ officerName, status, fromDate, toDate } = {}) {
  const sb = requireSb();
  let query = sb
    .from('leave_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (officerName) query = query.eq('officer_name', officerName);
  if (status)      query = query.eq('status', status);
  if (fromDate)    query = query.gte('leave_date', fromDate);
  if (toDate)      query = query.lte('leave_date', toDate);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToObj);
}

async function submitLeaveRequest({ officerName, leaveDate, leaveType, reason }) {
  if (!officerName) throw new Error('officerName is required');
  if (!isYmd(leaveDate)) throw new Error('leaveDate must be YYYY-MM-DD');
  if (!reason || !String(reason).trim()) throw new Error('reason is required');

  const normalizedLeaveType = VALID_LEAVE_TYPES.includes(leaveType) ? leaveType : 'full_day';
  const sb = requireSb();

  // Prevent duplicate pending/approved request for same date + overlapping type
  const { data: existing } = await sb
    .from('leave_requests')
    .select('id, leave_type, status')
    .eq('officer_name', officerName)
    .eq('leave_date', leaveDate)
    .in('status', ['pending', 'approved']);

  const dup = (existing || []).find(r =>
    r.leave_type === normalizedLeaveType || r.leave_type === 'full_day' || normalizedLeaveType === 'full_day'
  );
  if (dup) {
    throw Object.assign(new Error('Leave request already exists for that date/period'), { status: 409 });
  }

  const nowIso = new Date().toISOString();

  // Look up user_id
  let userId = null;
  try {
    const { data: { users } } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
    const match = (users || []).find(u =>
      String(u.user_metadata?.name || '').trim().toLowerCase() === String(officerName || '').trim().toLowerCase()
    );
    userId = match?.id || null;
  } catch (_) {}

  const { data, error } = await sb
    .from('leave_requests')
    .insert({
      user_id: userId,
      officer_name: officerName,
      leave_date: leaveDate,
      leave_type: normalizedLeaveType,
      reason: String(reason).trim(),
      status: 'pending',
      created_at: nowIso
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToObj(data);
}

async function decideLeaveRequest({ id, adminName, status, adminComment }) {
  if (!id) throw new Error('id is required');
  if (!adminName) throw new Error('adminName is required');
  if (!['approved', 'rejected'].includes(status)) throw new Error('status must be approved or rejected');

  const sb = requireSb();
  const { data: existing, error: fetchErr } = await sb
    .from('leave_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) throw Object.assign(new Error('Leave request not found'), { status: 404 });
  if (existing.status !== 'pending') throw Object.assign(new Error('Leave request already decided'), { status: 409 });

  const decidedAt = new Date().toISOString();
  const { data, error } = await sb
    .from('leave_requests')
    .update({
      status,
      admin_name: adminName,
      admin_comment: adminComment ? String(adminComment).trim() : '',
      decided_at: decidedAt
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return rowToObj(data);
}

module.exports = {
  listLeaveRequests,
  submitLeaveRequest,
  decideLeaveRequest
};
