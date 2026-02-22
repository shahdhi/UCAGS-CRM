/**
 * Dashboard Module
 * Provides dashboard data and statistics
 */

const express = require('express');
const router = express.Router();
const leadsService = require('../leads/leadsService');

const { getSupabaseAdmin } = require('../../core/supabase/supabaseAdmin');
const { isAdmin, isAuthenticated } = require('../../../server/middleware/auth');
const sheetsService = require('../../../server/integrations/sheets');

async function getCurrentBatchNames(sb) {
  const { data, error } = await sb
    .from('program_batches')
    .select('batch_name')
    .eq('is_current', true);

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return [];
    throw error;
  }

  return Array.from(new Set((data || []).map(r => r.batch_name).filter(Boolean)));
}

/**
 * GET /api/dashboard/stats
 * Legacy-compatible dashboard stats (used by public/js/app.js)
 */
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const user = req.user || req.session?.user;
    let enquiries = [];

    try {
      if (user?.role === 'admin') {
        enquiries = await sheetsService.getAllEnquiries();
      } else if ((user?.role === 'officer' || user?.role === 'user') && user?.sheetId) {
        enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    } catch (e) {
      // Fail-soft: allow dashboard to load even if Sheets is unavailable/misconfigured
      console.warn('Dashboard stats: failed to load enquiries from Sheets:', e.message || e);
      enquiries = [];
    }

    const stats = {
      total: enquiries.length,
      new: enquiries.filter(e => e.status === 'New').length,
      contacted: enquiries.filter(e => e.status === 'Contacted').length,
      followUp: enquiries.filter(e => e.status === 'Follow-up').length,
      registered: enquiries.filter(e => e.status === 'Registered').length,
      closed: enquiries.filter(e => e.status === 'Closed').length
    };

    let officerStats = null;
    if (user?.role === 'admin') {
      officerStats = {};
      enquiries.forEach(e => {
        const officer = e.assignedOfficer || 'Unassigned';
        if (!officerStats[officer]) {
          officerStats[officer] = {
            total: 0,
            new: 0,
            contacted: 0,
            followUp: 0,
            registered: 0,
            closed: 0
          };
        }
        officerStats[officer].total++;
        const key = String(e.status || '').toLowerCase().replace('-', '');
        officerStats[officer][key] = (officerStats[officer][key] || 0) + 1;
      });
    }

    res.json({
      stats,
      officerStats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);

    // Fail-soft for UI: return zeros instead of 500 so Home can still render.
    return res.json({
      stats: { total: 0, new: 0, contacted: 0, followUp: 0, registered: 0, closed: 0 },
      officerStats: null,
      warning: 'Failed to fetch dashboard statistics'
    });
  }
});

function parseISODateOnly(s) {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isFinite(d.getTime()) ? d : null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toISODate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

async function getPaymentReceivedRegistrationIds(sb, { from = null, to = null } = {}) {
  // Returns distinct registration_ids where payment-received was saved (not necessarily confirmed).
  // We treat it as: installment_no=1, amount>0, and (payment_date set OR slip/receipt received).
  const baseSelect = 'registration_id, payment_date, created_at, amount, slip_received, receipt_received, installment_no';

  let q = sb
    .from('payments')
    .select(baseSelect)
    .eq('installment_no', 1)
    .not('registration_id', 'is', null)
    .limit(20000);

  const { data, error } = await q;
  if (error) throw error;

  let rows = (data || []).filter(r => {
    const amt = Number(r.amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) return false;
    const hasReceipt = !!(r.slip_received || r.receipt_received);
    const hasDate = !!r.payment_date;
    return hasDate || hasReceipt;
  });

  if (from || to) {
    const fromMs = from ? startOfDay(from).getTime() : null;
    const toMs = to ? endOfDay(to).getTime() : null;
    rows = rows.filter(r => {
      const t = new Date(r.payment_date || r.created_at || 0).getTime();
      if (!Number.isFinite(t)) return false;
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t > toMs) return false;
      return true;
    });
  }

  return Array.from(new Set(rows.map(r => r.registration_id).filter(Boolean)));
}

// Backward compatibility wrapper (older parts of the codebase still refer to "confirmed")
// We now define "enrollment" by payment received save.
async function getConfirmedPaymentsRegistrationIds(sb, opts) {
  return getPaymentReceivedRegistrationIds(sb, opts);
}

/**
 * GET /api/dashboard/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Admin analytics for Home page
 */
router.get('/analytics', isAuthenticated, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();

    const user = req.user || req.session?.user || {};
    const isAdminUser = user?.role === 'admin';
    const officerName = String(user?.name || '').trim();

    const from = parseISODateOnly(req.query.from) || null;
    const to = parseISODateOnly(req.query.to) || null;

    const currentBatches = await getCurrentBatchNames(sb);

    // Default window: current batch start date -> today (fallback: last 30 days)
    const toDefault = endOfDay(new Date());
    const fromFallback = startOfDay(new Date(Date.now() - 29 * 24 * 3600 * 1000));

    let batchStart = null;
    try {
      if (currentBatches.length) {
        const { data, error } = await sb
          .from('batches')
          .select('created_at')
          .in('name', currentBatches)
          .order('created_at', { ascending: true })
          .limit(1);
        if (!error) {
          const first = (data || [])[0];
          if (first?.created_at) batchStart = startOfDay(new Date(first.created_at));
        }
      }
    } catch (e) {
      // ignore
    }

    const fromDefault = batchStart || fromFallback;
    const fromEff = from ? startOfDay(from) : fromDefault;
    const toEff = to ? endOfDay(to) : toDefault;

    // Follow-ups due
    // Admin: best-effort using legacy followups table if available
    // Officer: use crm_lead_followups (officer-owned) if available
    let followUpsDue = 0;
    let followUpsOverdue = 0;

    if (!isAdminUser && user?.id) {
      try {
        const todayMs0 = startOfDay(new Date()).getTime();
        const todayMs1 = endOfDay(new Date()).getTime();

        const { data, error } = await sb
          .from('crm_lead_followups')
          .select('id, scheduled_at, actual_at')
          .eq('officer_user_id', user.id)
          .limit(20000);
        if (error) throw error;

        (data || []).forEach(f => {
          if (f.actual_at) return; // completed
          const dt = new Date(f.scheduled_at || 0).getTime();
          if (!Number.isFinite(dt)) return;
          if (dt >= todayMs0 && dt <= todayMs1) followUpsDue++;
          if (dt < todayMs0) followUpsOverdue++;
        });
      } catch (e) {
        // ignore
      }
    } else {
      try {
        const { data, error } = await sb
          .from('followups')
          .select('id, follow_up_date, status')
          .gte('follow_up_date', toISODate(fromEff))
          .lte('follow_up_date', toISODate(toEff))
          .limit(20000);
        if (error) throw error;

        const todayStr = toISODate(new Date());
        const todayMs0 = startOfDay(new Date()).getTime();
        const todayMs1 = endOfDay(new Date()).getTime();

        (data || []).forEach(f => {
          const dt = new Date(f.follow_up_date).getTime();
          const done = String(f.status || '').toLowerCase().includes('done') || String(f.status || '').toLowerCase().includes('completed');
          if (done) return;
          if (Number.isFinite(dt) && dt >= todayMs0 && dt <= todayMs1) followUpsDue++;
          if (Number.isFinite(dt) && dt < todayMs0) followUpsOverdue++;
        });

        const { data: oData } = await sb
          .from('followups')
          .select('id, follow_up_date, status')
          .lt('follow_up_date', todayStr)
          .limit(20000);
        (oData || []).forEach(f => {
          const done = String(f.status || '').toLowerCase().includes('done') || String(f.status || '').toLowerCase().includes('completed');
          if (!done) followUpsOverdue++;
        });
      } catch (e) {
        // ignore
      }
    }

    // Registrations received within range (created_at)
    // Currently used only for Action Center (admin). Officers don't need it.
    let registrationsReceived = 0;
    let missingAssignedTo = 0;
    if (isAdminUser) {
      try {
        let q = sb
          .from('registrations')
          .select('id, assigned_to, payload, created_at, batch_name')
          .gte('created_at', fromEff.toISOString())
          .lte('created_at', toEff.toISOString())
          .limit(20000);
        if (currentBatches.length) q = q.in('batch_name', currentBatches);
        const { data, error } = await q;
        if (error) throw error;
        registrationsReceived = (data || []).length;
        (data || []).forEach(r => {
          const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
          const a = r?.assigned_to || payload?.assigned_to || payload?.assignedTo;
          if (!a) missingAssignedTo++;
        });
      } catch (e) {
        // ignore
      }
    }

    // Enrollments (payment received saved) within range
    const confirmedRegIds = await getPaymentReceivedRegistrationIds(sb, { from: fromEff, to: toEff });
    let confirmedPayments = confirmedRegIds.length;

    // Officers should see only their own enrollments
    if (!isAdminUser && officerName && confirmedRegIds.length) {
      try {
        let q = sb
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .in('id', confirmedRegIds)
          .eq('assigned_to', officerName);
        if (currentBatches.length) q = q.in('batch_name', currentBatches);
        const { count, error } = await q;
        if (error) throw error;
        confirmedPayments = Number(count || 0);
      } catch (e) {
        confirmedPayments = 0;
      }
    }

    // Conversion rate: confirmed payments out of TOTAL leads (Main Leads + Extra Leads + etc.)
    // Source of truth: Supabase crm_leads table (contains sheet_name = Main Leads / Extra Leads ...)
    let leadsCount = 0;
    try {
      let q = sb
        .from('crm_leads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', fromEff.toISOString())
        .lte('created_at', toEff.toISOString());
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      if (!isAdminUser && officerName) q = q.eq('assigned_to', officerName);
      const { count, error } = await q;
      if (error) throw error;
      leadsCount = Number(count || 0);
    } catch (e) {
      console.warn('Analytics: failed to count crm_leads for conversion rate:', e.message || e);
      leadsCount = 0;
    }

    const conversionRate = leadsCount > 0 ? (confirmedPayments / leadsCount) : 0;

    // Status (previously Funnel): New -> Contacted -> Follow-up -> Registered -> Enrollments
    // Officers should see only their own statuses.
    let funnel = { new: 0, contacted: 0, followUp: 0, registered: 0, confirmedPayments };
    try {
      let q = sb
        .from('crm_leads')
        .select('status')
        .gte('created_at', fromEff.toISOString())
        .lte('created_at', toEff.toISOString())
        .limit(20000);
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      if (!isAdminUser && officerName) q = q.eq('assigned_to', officerName);

      const { data, error } = await q;
      if (error) throw error;

      for (const r of (data || [])) {
        const s = String(r.status || '').toLowerCase();
        if (s === 'new') funnel.new++;
        else if (s === 'contacted') funnel.contacted++;
        else if (s === 'follow-up' || s === 'followup') funnel.followUp++;
        else if (s === 'registered') funnel.registered++;
      }
    } catch (e) {
      // keep defaults
    }

    // Time series: confirmed payments per day (last 30 days window)
    // We'll compute by scanning payments rows within range.
    const seriesDays = [];
    {
      const days = [];
      const d0 = startOfDay(fromEff);
      const d1 = startOfDay(toEff);
      for (let d = new Date(d0); d <= d1; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
        days.push(toISODate(d));
      }
      const counts = new Map(days.map(x => [x, 0]));

      // Load payment-received rows for time series (need dates)
      try {
        let payRows = [];
        const { data, error } = await sb
          .from('payments')
          .select('registration_id, payment_date, created_at, amount, slip_received, receipt_received, installment_no')
          .eq('installment_no', 1)
          .not('registration_id', 'is', null)
          .gte('created_at', fromEff.toISOString())
          .lte('created_at', toEff.toISOString())
          .limit(20000);
        if (error) throw error;

        payRows = (data || []).filter(r => {
          const amt = Number(r.amount || 0);
          if (!Number.isFinite(amt) || amt <= 0) return false;
          const hasReceipt = !!(r.slip_received || r.receipt_received);
          const hasDate = !!r.payment_date;
          return hasDate || hasReceipt;
        });

        // Officers should see only their own enrollments in the time series
        if (!isAdminUser && officerName && payRows.length) {
          try {
            let rq = sb
              .from('registrations')
              .select('id')
              .eq('assigned_to', officerName)
              .limit(20000);
            if (currentBatches.length) rq = rq.in('batch_name', currentBatches);
            const { data: rData, error: rErr } = await rq;
            if (rErr) throw rErr;
            const allowed = new Set((rData || []).map(x => x.id));
            payRows = payRows.filter(p => allowed.has(p.registration_id));
          } catch (e) {
            payRows = [];
          }
        }

        // Count distinct registration_id per day (so multiple installments don't double count)
        const seenByDay = new Map();
        for (const r of payRows) {
          const day = toISODate(new Date(r.payment_date || r.created_at));
          if (!counts.has(day)) continue;
          if (!seenByDay.has(day)) seenByDay.set(day, new Set());
          seenByDay.get(day).add(r.registration_id);
        }
        for (const [day, set] of seenByDay.entries()) {
          counts.set(day, set.size);
        }
      } catch (e) {
        // ignore
      }

      seriesDays.push(...days.map(day => ({ day, count: counts.get(day) || 0 })));
    }

    // Leaderboard: enrollments (confirmed payments) per officer for ENTIRE current batch
    // Always include all officers, even if 0.
    const officerNames = [];
    try {
      const { data: uData, error: uErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
      if (uErr) throw uErr;
      (uData?.users || []).forEach(u => {
        const role = u.user_metadata?.role || 'officer';
        const isOfficer = role === 'officer' || role === 'admission_officer';
        if (!isOfficer) return;
        if (role === 'admin') return;
        const name = u.user_metadata?.name || u.email?.split('@')?.[0] || '';
        if (name) officerNames.push(String(name));
      });
    } catch (e) {
      // If auth admin not available, just fall back to officers discovered from data
    }

    // enrollments map: officer -> confirmed-payment registrations count
    const enrollmentsMap = new Map();
    for (const n of officerNames) enrollmentsMap.set(n, 0);

    const batchConfirmedIds = await getPaymentReceivedRegistrationIds(sb);
    if (batchConfirmedIds.length) {
      let q = sb
        .from('registrations')
        .select('id, assigned_to, payload, batch_name')
        .in('id', batchConfirmedIds)
        .limit(20000);
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      const { data, error } = await q;
      if (!error) {
        for (const r of (data || [])) {
          const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
          const officer = String(r?.assigned_to || payload?.assigned_to || payload?.assignedTo || 'Unassigned').trim() || 'Unassigned';
          enrollmentsMap.set(officer, (enrollmentsMap.get(officer) || 0) + 1);
        }
      }
    }

    // leads map: officer -> leads assigned count (current batch)
    const leadsMap = new Map();
    for (const n of officerNames) leadsMap.set(n, 0);
    try {
      let q = sb
        .from('crm_leads')
        .select('assigned_to, batch_name')
        .limit(20000);
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      const { data, error } = await q;
      if (error) throw error;

      for (const r of (data || [])) {
        const officer = String(r?.assigned_to || 'Unassigned').trim() || 'Unassigned';
        leadsMap.set(officer, (leadsMap.get(officer) || 0) + 1);
      }
    } catch (e) {
      // ignore; conversion will be 0 if leads unknown
    }

    const leaderboard = Array.from(new Set([...enrollmentsMap.keys(), ...leadsMap.keys()]))
      .map((officer) => {
        const count = enrollmentsMap.get(officer) || 0;
        const leadsAssigned = leadsMap.get(officer) || 0;
        const conversionRate = leadsAssigned > 0 ? (count / leadsAssigned) : 0;
        return { officer, count, leadsAssigned, conversionRate };
      })
      .filter(r => String(r.officer || '').toLowerCase() !== 'admin')
      .sort((a, b) => b.count - a.count || b.conversionRate - a.conversionRate || a.officer.localeCompare(b.officer));

    // Action center: payments pending confirmation (admin only)
    let paymentsPendingConfirmation = 0;
    if (isAdminUser) {
      try {
        let { data, error } = await sb
          .from('payments')
          .select('id')
          .eq('is_confirmed', false)
          .limit(20000);
        if (error) throw error;
        paymentsPendingConfirmation = (data || []).length;
      } catch (e1) {
        const msg = String(e1.message || '').toLowerCase();
        const missingCol = (msg.includes('column') && msg.includes('is_confirmed') && msg.includes('does not exist')) ||
          (msg.includes('schema cache') && msg.includes('is_confirmed') && msg.includes('could not find'));
        if (!missingCol) {
          // ignore
        } else {
          // fallback: treat receipt_received=false as pending
          try {
            const { data } = await sb
              .from('payments')
              .select('id')
              .eq('receipt_received', false)
              .limit(20000);
            paymentsPendingConfirmation = (data || []).length;
          } catch (e2) {}
        }
      }
    }

    res.json({
      success: true,
      range: { from: toISODate(fromEff), to: toISODate(toEff) },
      currentBatches,
      kpis: {
        followUpsDue,
        registrationsReceived,
        confirmedPayments,
        conversionRate
      },
      funnel,
      series: {
        confirmedPaymentsPerDay: seriesDays
      },
      leaderboard: {
        enrollmentsCurrentBatch: leaderboard
      },
      actionCenter: isAdminUser ? {
        overdueFollowUps: followUpsOverdue,
        paymentsPendingConfirmation,
        registrationsMissingAssignedTo: missingAssignedTo
      } : null
    });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/dashboard/enrollment-rankings
 * Admin-only: rank officers by number of enrollments for current batch(es)
 */
router.get('/enrollment-rankings', isAdmin, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const currentBatches = await getCurrentBatchNames(sb);

    // If no current batches configured, return empty list (don't accidentally count all-time)
    if (!currentBatches.length) {
      return res.json({ success: true, batchNames: [], rankings: [] });
    }

    // Count "enrollments" based on confirmed payments:
    // If a payment is confirmed (is_confirmed=true) for a registration in the current batch,
    // count it as 1 for that registration's assigned officer.

    // 1) Get confirmed payments registration_ids
    let payRows = [];
    try {
      const { data, error: payErr } = await sb
        .from('payments')
        .select('registration_id')
        .eq('is_confirmed', true)
        .not('registration_id', 'is', null)
        .limit(10000);
      if (payErr) throw payErr;
      payRows = data || [];
    } catch (e1) {
      const msg = String(e1.message || '').toLowerCase();
      const missingCol = (msg.includes('column') && msg.includes('is_confirmed') && msg.includes('does not exist')) ||
        (msg.includes('schema cache') && msg.includes('is_confirmed') && msg.includes('could not find'));
      if (!missingCol) throw e1;

      // Backward compatibility: older payments schema used receipt_received boolean
      const { data, error: payErr } = await sb
        .from('payments')
        .select('registration_id')
        .eq('receipt_received', true)
        .not('registration_id', 'is', null)
        .limit(10000);
      if (payErr) throw payErr;
      payRows = data || [];
    }

    const paidRegIds = Array.from(new Set((payRows || []).map(r => r.registration_id).filter(Boolean)));
    if (!paidRegIds.length) {
      return res.json({ success: true, batchNames: currentBatches, rankings: [] });
    }

    // 2) Load registrations for those ids, restricted to current batches
    const { data: regs, error: regErr } = await sb
      .from('registrations')
      .select('id, assigned_to, batch_name, payload')
      .in('id', paidRegIds)
      .in('batch_name', currentBatches)
      .limit(10000);
    if (regErr) throw regErr;

    const map = new Map(); // officerName -> count

    for (const r of (regs || [])) {
      const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
      const officer = String(r?.assigned_to || payload?.assigned_to || payload?.assignedTo || 'Unassigned').trim() || 'Unassigned';
      map.set(officer, (map.get(officer) || 0) + 1);
    }

    const rankings = Array.from(map.entries())
      .map(([officer, count]) => ({ officer, count }))
      .sort((a, b) => b.count - a.count || a.officer.localeCompare(b.officer));

    res.json({ success: true, batchNames: currentBatches, rankings });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/dashboard/recent
 * Legacy-compatible recent enquiries
 */
router.get('/recent', isAuthenticated, async (req, res) => {
  try {
    const user = req.user || req.session?.user;
    const limit = parseInt(req.query.limit, 10) || 10;
    let enquiries;

    if (user?.role === 'admin') {
      enquiries = await sheetsService.getAllEnquiries();
    } else if ((user?.role === 'officer' || user?.role === 'user') && user?.sheetId) {
      enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    enquiries.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));
    res.json({ enquiries: enquiries.slice(0, limit) });
  } catch (error) {
    console.error('Error fetching recent enquiries:', error);
    res.status(500).json({ error: 'Failed to fetch recent enquiries' });
  }
});

/**
 * GET /api/dashboard/follow-ups
 * Legacy-compatible follow-ups response
 */
router.get('/follow-ups', isAuthenticated, async (req, res) => {
  try {
    const user = req.user || req.session?.user;
    let enquiries;

    if (user?.role === 'admin') {
      enquiries = await sheetsService.getAllEnquiries();
    } else if ((user?.role === 'officer' || user?.role === 'user') && user?.sheetId) {
      enquiries = await sheetsService.getOfficerEnquiries(user.sheetId);
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const now = new Date();
    const followUps = enquiries
      .filter(e => e.followUpDate)
      .map(e => ({ ...e, followUpDate: new Date(e.followUpDate) }))
      .sort((a, b) => a.followUpDate - b.followUpDate);

    const overdue = followUps.filter(e => e.followUpDate < now);
    const upcoming = followUps.filter(e => e.followUpDate >= now);

    res.json({ overdue, upcoming });
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

module.exports = router;
