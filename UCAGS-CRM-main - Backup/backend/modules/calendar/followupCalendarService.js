/**
 * Follow-up Calendar Service (Supabase)
 *
 * Builds a calendar feed from Supabase crm_leads.management_json follow-up schedules.
 *
 * We treat a follow-up as PENDING when:
 *  - followupN_schedule is set AND followupN_date (actual) is empty
 */

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { listBatches } = require('../../core/batches/batchesStore');

function parsePendingFollowupsFromJson(managementJson = {}) {
  const items = [];
  for (const n of [1, 2, 3, 4, 5]) { // Support up to 5 follow-ups
    const schedule = managementJson[`followUp${n}Schedule`];
    const actual = managementJson[`followUp${n}Date`];
    if (schedule && !actual) {
      items.push({
        n,
        date: schedule,
        comment: managementJson[`followUp${n}Comment`] || ''
      });
    }
  }
  return items;
}

async function getCalendarEvents({ userRole, officerName, officerFilter }) {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return { now: new Date().toISOString(), overdue: [], upcoming: [], count: 0 };
  }

  // Build query for leads with pending follow-ups
  let query = sb
    .from('crm_leads')
    .select('id, sheet_lead_id, batch_name, sheet_name, name, phone, email, assigned_to, management_json, next_follow_up');

  // For non-admin users, filter by assigned officer
  if (userRole !== 'admin') {
    query = query.eq('assigned_to', officerName);
  }

  const { data: leads, error } = await query;
  if (error) {
    console.error('Error fetching leads for calendar:', error);
    return { now: new Date().toISOString(), overdue: [], upcoming: [], count: 0 };
  }

  const events = [];

  (leads || []).forEach(lead => {
    const mgmt = lead.management_json || {};
    const pending = parsePendingFollowupsFromJson(mgmt);

    // Determine officer filter for this lead
    const leadOfficer = lead.assigned_to || '';

    // Skip if filtering and doesn't match
    if (userRole === 'admin') {
      if (officerFilter && officerFilter !== 'all' && leadOfficer !== officerFilter) {
        // But if officerFilter is specified, only show that officer's leads
        // If no officerFilter, show all
        return;
      }
    }

    for (const p of pending) {
      events.push({
        date: p.date,
        batchName: lead.batch_name,
        sheetName: lead.sheet_name,
        officerName: leadOfficer,
        leadId: lead.sheet_lead_id,
        leadSupabaseId: lead.id,
        full_name: lead.name,
        phone: lead.phone,
        followUpNo: p.n,
        comment: p.comment
      });
    }
  });

  // Split overdue/upcoming
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const nowStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const normalizeForCompare = (v) => {
    const s = String(v || '').trim();
    // If only date is provided, treat as end-of-day so it stays upcoming until the day ends.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59`;
    return s;
  };

  const overdue = events
    .filter(e => normalizeForCompare(e.date) < nowStr)
    .sort((a, b) => normalizeForCompare(a.date).localeCompare(normalizeForCompare(b.date)));
  const upcoming = events
    .filter(e => normalizeForCompare(e.date) >= nowStr)
    .sort((a, b) => normalizeForCompare(a.date).localeCompare(normalizeForCompare(b.date)));

  return { now: nowStr, overdue, upcoming, count: events.length };
}

module.exports = {
  getCalendarEvents
};
