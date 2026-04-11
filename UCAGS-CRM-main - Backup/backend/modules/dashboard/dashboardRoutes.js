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

// Simple in-memory caches to speed up Home (Action Center + Leaderboard)
// Note: per-process cache (resets on deploy). Keeps UI snappy without adding infra.
const __analyticsCache = new Map();
const __officerNamesCache = { at: 0, ttlMs: 5 * 60 * 1000, value: [] };
const __leaveCache = { at: 0, ttlMs: 60 * 1000, value: 0 }; // 60s cache for pending leave count

function cacheGet(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(map, key, value, ttlMs) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

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
        // Fail-soft: user logged in but no sheet access configured
        return res.json({
          stats: { total: 0, new: 0, contacted: 0, followUp: 0, registered: 0, closed: 0 },
          officerStats: null,
          warning: 'Access denied'
        });
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

    // Short-lived cache: dramatically speeds up repeated dashboard loads
    const cacheKey = JSON.stringify({
      v: 5, // bumped: officer funnel no longer date-filtered by created_at
      role: isAdminUser ? 'admin' : 'officer',
      officerName: isAdminUser ? '' : officerName,
      from: String(req.query.from || ''),
      to: String(req.query.to || '')
    });
    const cached = cacheGet(__analyticsCache, cacheKey);
    if (cached) return res.json(cached);

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

    // Follow-ups due — sourced from crm_leads.management_json (same as Follow-up Calendar)
    // Counts pending followUp1–5 schedules where schedule is set but actual date is not.
    let followUpsDue = 0;
    let followUpsOverdue = 0;

    try {
      const now = new Date();
      const pad2 = (n) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

      let leadsQuery = sb
        .from('crm_leads')
        .select('id, assigned_to, management_json')
        .limit(20000);

      // Officers only see their own leads
      if (!isAdminUser && officerName) {
        leadsQuery = leadsQuery.eq('assigned_to', officerName);
      }

      const { data: leadsData, error: leadsError } = await leadsQuery;
      if (leadsError) throw leadsError;

      (leadsData || []).forEach(lead => {
        const mgmt = lead.management_json || {};
        for (const n of [1, 2, 3, 4, 5]) {
          const schedule = mgmt[`followUp${n}Schedule`];
          const actual   = mgmt[`followUp${n}Date`];
          if (!schedule || actual) continue; // skip if no schedule or already completed

          // Normalize to date portion for comparison (schedule can be datetime or date)
          const scheduleDate = String(schedule).slice(0, 10);
          if (scheduleDate === todayStr) {
            followUpsDue++;
          } else if (scheduleDate < todayStr) {
            followUpsOverdue++;
          }
        }
      });
    } catch (e) {
      // ignore — fallback leaves counts at 0
    }

    // Registrations received within range (created_at)
    // Admins see all; officers see only their own assigned registrations.
    let registrationsReceived = 0;
    let missingAssignedTo = 0;
    try {
      let q = sb
        .from('registrations')
        .select('id, assigned_to, payload, created_at, batch_name')
        .gte('created_at', fromEff.toISOString())
        .lte('created_at', toEff.toISOString())
        .limit(20000);
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      if (!isAdminUser && officerName) q = q.eq('assigned_to', officerName);
      const { data, error } = await q;
      if (error) throw error;
      registrationsReceived = (data || []).length;
      if (isAdminUser) {
        (data || []).forEach(r => {
          const payload = r?.payload && typeof r.payload === 'object' ? r.payload : {};
          const a = r?.assigned_to || payload?.assigned_to || payload?.assignedTo;
          if (!a) missingAssignedTo++;
        });
      }
    } catch (e) {
      // ignore
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

    // Conversion rate: confirmed payments out of TOTAL leads assigned in current batch
    // NOTE: No date range filter on leads — leads may have been imported before the selected window.
    // We count all leads in the current batch(es) for the officer, regardless of created_at.
    // Also compute activeLeads = New + Contacted + Follow-up (all current batch leads, no date filter)
    let leadsCount = 0;
    let activeLeads = 0;
    try {
      let q = sb
        .from('crm_leads')
        .select('status');
      if (currentBatches.length) q = q.in('batch_name', currentBatches);
      if (!isAdminUser && officerName) q = q.eq('assigned_to', officerName);
      const { data: leadsData, error } = await q;
      if (error) throw error;
      leadsCount = (leadsData || []).length;
      activeLeads = (leadsData || []).filter(r => {
        const s = String(r.status || '').toLowerCase();
        return s === 'new' || s === 'contacted' || s === 'follow-up' || s === 'followup';
      }).length;
    } catch (e) {
      console.warn('Analytics: failed to count crm_leads for conversion rate:', e.message || e);
      leadsCount = 0;
      activeLeads = 0;
    }

    const conversionRate = leadsCount > 0 ? (confirmedPayments / leadsCount) : 0;

    // Status (previously Funnel): New -> Contacted -> Follow-up -> Registered -> Enrollments
    // Officers: show current status of ALL leads in current batch (no date filter on created_at).
    //   The date filter would hide leads created before the selected window, making the pipeline
    //   look empty even though those leads are still active. Officers need a live snapshot.
    // Admins: apply the date filter so they see trends within the selected window.
    let funnel = { new: 0, contacted: 0, followUp: 0, registered: 0, confirmedPayments };
    try {
      let q = sb
        .from('crm_leads')
        .select('status')
        .limit(20000);

      // Only apply date range filter for admin users (trend analysis).
      // Officers always see their full current-batch pipeline regardless of date.
      if (isAdminUser) {
        q = q
          .gte('created_at', fromEff.toISOString())
          .lte('created_at', toEff.toISOString());
      }

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
      if (Date.now() < (__officerNamesCache.at + __officerNamesCache.ttlMs) && Array.isArray(__officerNamesCache.value)) {
        officerNames.push(...__officerNamesCache.value);
      } else {
        const { data: uData, error: uErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
        if (uErr) throw uErr;
        const names = [];
        (uData?.users || []).forEach(u => {
          const role = u.user_metadata?.role || 'officer';
          const isOfficer = role === 'officer' || role === 'admission_officer';
          if (!isOfficer) return;
          if (role === 'admin') return;
          const name = u.user_metadata?.name || u.email?.split('@')?.[0] || '';
          if (name) names.push(String(name));
        });
        __officerNamesCache.value = names;
        __officerNamesCache.at = Date.now();
        officerNames.push(...names);
      }
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

    // Action center (admin only)
    let paymentsToBeConfirmed = 0;
    let toBeEnrolled = 0;

    if (isAdminUser) {
      // Payments to be confirmed = payment received saved, but is_confirmed=false
      try {
        const { data, error } = await sb
          .from('payments')
          .select('id, is_confirmed, installment_no, amount, payment_date, slip_received, receipt_received')
          .eq('installment_no', 1)
          .limit(20000);
        if (error) throw error;

        paymentsToBeConfirmed = (data || []).filter(p => {
          const amt = Number(p.amount || 0);
          if (!Number.isFinite(amt) || amt <= 0) return false;
          const hasReceipt = !!(p.slip_received || p.receipt_received);
          const hasDate = !!p.payment_date;
          if (!(hasDate || hasReceipt)) return false;
          return p.is_confirmed === false;
        }).length;
      } catch (e1) {
        const msg = String(e1.message || '').toLowerCase();
        const missingCol = (msg.includes('column') && msg.includes('is_confirmed') && msg.includes('does not exist')) ||
          (msg.includes('schema cache') && msg.includes('is_confirmed') && msg.includes('could not find'));
        if (!missingCol) {
          console.warn('ActionCenter: failed paymentsToBeConfirmed:', e1.message || e1);
        }
        paymentsToBeConfirmed = 0;
      }

      // To be enrolled = payment received saved (current batch) but no student record yet
      try {
        const paymentReceivedIds = await getPaymentReceivedRegistrationIds(sb);
        if (paymentReceivedIds.length) {
          const { data: regs, error: rErr } = await sb
            .from('registrations')
            .select('id, batch_name')
            .in('id', paymentReceivedIds)
            .in('batch_name', currentBatches)
            .limit(20000);
          if (rErr) throw rErr;

          const regIds = (regs || []).map(r => r.id);
          if (regIds.length) {
            let studentCount = 0;
            try {
              const { count, error: sErr } = await sb
                .from('students')
                .select('id', { count: 'exact', head: true })
                .in('registration_id', regIds);
              if (sErr) throw sErr;
              studentCount = Number(count || 0);
            } catch (e2) {
              // If students table missing, can't compute
              studentCount = 0;
            }

            toBeEnrolled = Math.max(0, regIds.length - studentCount);
          }
        }
      } catch (e) {
        toBeEnrolled = 0;
      }
    }

    const payload = {
      success: true,
      range: { from: toISODate(fromEff), to: toISODate(toEff) },
      currentBatches,
      kpis: {
        followUpsDue,
        followUpsOverdue,
        registrationsReceived,
        confirmedPayments,
        conversionRate,
        activeLeads
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
        paymentsToBeConfirmed,
        toBeEnrolled,
        registrationsMissingAssignedTo: missingAssignedTo
      } : null
    };

    // Cache for 3 minutes — keeps UI snappy without hitting Sheets/Supabase on every load
    cacheSet(__analyticsCache, cacheKey, payload, 3 * 60 * 1000);

    res.json(payload);
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
      // Fail-soft for logged-in users without sheet access
      return res.json({ enquiries: [] });
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
      // Fail-soft for logged-in users without sheet access
      return res.json({ overdue: [], upcoming: [] });
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
