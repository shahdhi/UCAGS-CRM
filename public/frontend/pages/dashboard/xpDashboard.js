/**
 * New Dashboard — xpDashboard.js
 * Phase 2: Profile, KPI Metrics, XP Trend Chart + Stats Strip, Achievements/Badges
 *
 * Renders all nd- dashboard sections.
 * Called via window.loadNewDashboard() from app.js loadDashboard().
 */

(function () {
  // ─── Module State ─────────────────────────────────────────────────────────────
  let __xpTrendChart = null;
  let __xpTrendDays = 30;
  let __listenersSetUp = false;

  // Cached data from last load (reused across functions in same load cycle)
  let __xpData = null;       // from /api/xp/me
  let __analyticsData = null; // from /api/dashboard/analytics

  // ─── Constants ────────────────────────────────────────────────────────────────
  const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 4000, 8000];
  const LEVEL_NAMES = ['Rookie', 'Explorer', 'Achiever', 'Pro', 'Expert', 'Elite', 'Master', 'Legend'];

  const EVENT_LABELS = {
    lead_contacted:        { label: 'Lead contacted',        icon: '📞' },
    followup_completed:    { label: 'Follow-up completed',   icon: '✅' },
    registration_received: { label: 'Registration received', icon: '📝' },
    payment_received:      { label: 'Payment received',      icon: '💰' },
    demo_attended:         { label: 'Demo attended',         icon: '🎓' },
    attendance_on_time:    { label: 'On-time check-in',      icon: '⏰' },
    checklist_completed:   { label: 'Checklist completed',   icon: '☑️' },
    report_submitted:      { label: 'Report submitted',      icon: '📊' },
    lead_responded_fast:   { label: 'Speed bonus (1h)',      icon: '⚡' },
    followup_overdue:      { label: 'Overdue follow-up',     icon: '⚠️' },
  };

  // Badge definitions: earned when at least one event of that type exists in recentEvents
  const BADGE_DEFS = [
    { id: 'first_lead',      icon: '📞', label: 'First Contact',  xp: 10,  desc: 'Contact your first lead',        eventType: 'lead_contacted'        },
    { id: 'first_followup',  icon: '✅', label: 'Follower',       xp: 15,  desc: 'Complete a follow-up',           eventType: 'followup_completed'    },
    { id: 'first_reg',       icon: '📝', label: 'Registrar',      xp: 50,  desc: 'Receive a registration',         eventType: 'registration_received' },
    { id: 'speed_bonus',     icon: '⚡', label: 'Speed Demon',    xp: 20,  desc: 'Respond within 1 hour',          eventType: 'lead_responded_fast'   },
    { id: 'first_payment',   icon: '💰', label: 'Closer',         xp: 100, desc: 'Receive a payment',              eventType: 'payment_received'      },
    { id: 'first_checklist', icon: '☑️', label: 'Diligent',       xp: 10,  desc: 'Complete your daily checklist',  eventType: 'checklist_completed'   },
  ];

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  function levelFor(xp) {
    let lvl = 0;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_THRESHOLDS[i]) { lvl = i; break; }
    }
    return lvl;
  }

  function nextLevelXp(xp) {
    const lvl = levelFor(xp);
    return LEVEL_THRESHOLDS[lvl + 1] ?? LEVEL_THRESHOLDS[lvl];
  }

  function prevLevelXp(xp) {
    const lvl = levelFor(xp);
    return LEVEL_THRESHOLDS[lvl] ?? 0;
  }

  function xpProgress(xp) {
    const lvl = levelFor(xp);
    const next = LEVEL_THRESHOLDS[lvl + 1];
    if (next == null) return 100; // maxed out
    const prev = LEVEL_THRESHOLDS[lvl];
    return Math.round(((xp - prev) / (next - prev)) * 100);
  }

  function medal(i) {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return `<span style="color:#6b7280;font-size:12px;">#${i + 1}</span>`;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  async function authHeaders() {
    try {
      return window.getAuthHeadersWithRetry ? await window.getAuthHeadersWithRetry() : {};
    } catch (e) {
      return {};
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function setHtml(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = val;
  }

  // ─── Date Range Helpers ───────────────────────────────────────────────────────
  function getDateRange() {
    const from = document.getElementById('homeFromDate')?.value || '';
    const to   = document.getElementById('homeToDate')?.value   || '';
    return { from, to };
  }

  function buildAnalyticsUrl(officerId) {
    const { from, to } = getDateRange();
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    if (officerId) params.set('officerId', officerId);
    const qs = params.toString();
    return `/api/dashboard/analytics${qs ? '?' + qs : ''}`;
  }

  // ─── Data Fetchers ────────────────────────────────────────────────────────────
  async function fetchXPData() {
    const headers = await authHeaders();
    const r = await fetch('/api/xp/me', { headers });
    if (!r.ok) throw new Error('XP fetch failed');
    return r.json();
  }

  async function fetchAnalytics(officerId) {
    const headers = await authHeaders();
    const url = buildAnalyticsUrl(officerId);
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error('Analytics fetch failed');
    return r.json();
  }

  async function fetchXPTrend(days) {
    const headers = await authHeaders();
    const isAdmin = window.currentUser?.role === 'admin';
    const url = isAdmin
      ? `/api/xp/global-trend?days=${days}`
      : `/api/xp/trend?days=${days}`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error('XP trend fetch failed');
    return r.json();
  }

  // ─── Phase 2a: Profile Section ────────────────────────────────────────────────
  async function renderProfileSection(xpData) {
    const user = window.currentUser || {};
    const name = user.name || user.email || 'User';
    const role = user.role === 'admin' ? 'Administrator' : (user.role === 'officer' ? 'Academic Advisor' : (user.role || 'User'));

    // Avatar
    const avatarEl = document.getElementById('ndAvatar');
    const initialsEl = document.getElementById('ndAvatarInitials');
    if (avatarEl && initialsEl) {
      initialsEl.textContent = initials(name);
      // Color avatar based on name hash for visual identity
      const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
      avatarEl.style.background = `linear-gradient(135deg, hsl(${hue},65%,55%), hsl(${(hue + 40) % 360},70%,45%))`;
    }

    setText('ndProfileName', name);
    setText('ndProfileRole', role);

    // Meta: batch info from analytics if available
    const meta = document.getElementById('ndProfileMeta');
    if (meta && __analyticsData?.currentBatches?.length) {
      meta.textContent = __analyticsData.currentBatches.join(', ');
    } else if (meta) {
      meta.textContent = '';
    }

    // XP bar + rank (officer only; admin skips XP section)
    if (user.role !== 'admin' && xpData) {
      const totalXp = xpData.totalXp || 0;
      const lvl = levelFor(totalXp);
      const pct = xpProgress(totalXp);
      const next = nextLevelXp(totalXp);
      const rank = xpData.rank;
      const totalOfficers = xpData.totalOfficers || 0;

      // Rank badge
      const rankBadge = document.getElementById('ndRankBadge');
      const rankText = document.getElementById('ndRankText');
      if (rankBadge && rank) {
        rankBadge.style.display = '';
        if (rankText) rankText.textContent = `#${rank} of ${totalOfficers}`;
      } else if (rankBadge) {
        rankBadge.style.display = 'none';
      }

      setText('ndXpNumbers', `${totalXp.toLocaleString()} / ${next.toLocaleString()} XP`);
      setText('ndLevelLabel', `Level ${lvl + 1}`);

      const barFill = document.getElementById('ndXpBarFill');
      if (barFill) {
        barFill.style.width = '0%';
        // Animate bar fill on next frame
        requestAnimationFrame(() => {
          setTimeout(() => { barFill.style.width = `${pct}%`; }, 50);
        });
      }
    } else {
      // Admin: hide rank badge and XP bar area gracefully
      const rankBadge = document.getElementById('ndRankBadge');
      if (rankBadge) rankBadge.style.display = 'none';
      setText('ndXpNumbers', '');
      setText('ndLevelLabel', 'Administrator');
    }
  }

  // ─── Phase 2b: KPI Metrics ────────────────────────────────────────────────────
  function renderKPIMetrics(analyticsData) {
    const kpis = analyticsData?.kpis || {};
    const funnel = analyticsData?.funnel || {};

    // Enrollments (confirmed payments)
    const enrollments = kpis.confirmedPayments ?? 0;
    setText('kpiConfirmedPayments', enrollments.toLocaleString());
    setHtml('kpiEnrollmentsTrend', '');

    // Conversion Rate
    const convRate = kpis.conversionRate ?? 0;
    const convPct = (convRate * 100).toFixed(1) + '%';
    setText('kpiConversionRate', convPct);
    setHtml('kpiConversionTrend', '');

    // Follow-ups Today
    const followUpsDue  = kpis.followUpsDue  ?? 0;
    const followUpsOverdue = kpis.followUpsOverdue ?? 0;
    setText('kpiFollowUpsDue', followUpsDue.toLocaleString());
    setHtml('kpiFollowupsTrend', followUpsDue > 0
      ? `<span style="color:#f59e0b;">⚠ ${followUpsDue} remaining today${followUpsOverdue > 0 ? ` · <span style="color:#ef4444;">${followUpsOverdue} overdue</span>` : ''}</span>`
      : `<span style="color:#10b981;">✓ All done for today</span>`);

    // Active Leads (new + contacted + follow-up from funnel)
    const activeLeads = (funnel.new || 0) + (funnel.contacted || 0) + (funnel.followUp || 0);
    setText('kpiActiveLeads', activeLeads.toLocaleString());
    setHtml('kpiLeadsTrend', '');

    // Registrations
    const regs = kpis.registrationsReceived ?? funnel.registered ?? 0;
    setText('kpiRegistrations', regs.toLocaleString());
    setHtml('kpiRegistrationsTrend', '');

    // Total XP (from xp data cached, or hide)
    const totalXp = __xpData?.totalXp ?? 0;
    setText('kpiXpTotal', totalXp > 0 ? `⚡ ${totalXp.toLocaleString()}` : '—');
    setHtml('kpiXpTrend', __xpData?.rank
      ? `<span style="color:#7c3aed;">#${__xpData.rank}</span>`
      : '');
  }

  // ─── Phase 2c: XP Trend Chart + Stats Strip ────────────────────────────────────
  async function renderXPTrendChart(days) {
    const canvas = document.getElementById('xpTrendChart');
    if (!canvas) return;

    // Update toggle button states
    const btn7  = document.getElementById('xpTrend7Btn');
    const btn30 = document.getElementById('xpTrend30Btn');
    if (btn7 && btn30) {
      btn7.classList.toggle('active', days === 7);
      btn30.classList.toggle('active', days === 30);
    }

    try {
      const j = await fetchXPTrend(days);
      const trend = j.trend || [];

      const labels = trend.map(t => {
        const d = new Date(t.date);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      });
      const data = trend.map(t => Number(t.xp || 0));

      // Stats strip
      const currentXp = __xpData?.totalXp ?? (data.length ? data[data.length - 1] : 0);
      const highestDay = data.length ? Math.max(...data) : 0;
      const avgXp = data.length ? Math.round(data.reduce((s, v) => s + v, 0) / data.length) : 0;

      setText('statCurrentXp', currentXp > 0 ? `⚡ ${currentXp.toLocaleString()}` : '—');
      setText('statHighestXp', highestDay > 0 ? `${highestDay.toLocaleString()} XP` : '—');
      setText('statAvgXp', avgXp > 0 ? `${avgXp.toLocaleString()} XP/day` : '—');

      // Destroy existing chart
      if (__xpTrendChart) {
        __xpTrendChart.destroy();
        __xpTrendChart = null;
      }

      const isAdmin = window.currentUser?.role === 'admin';

      __xpTrendChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: isAdmin ? 'Team XP' : 'My XP',
            data,
            borderColor: '#7c3aed',
            backgroundColor: 'rgba(124,58,237,0.08)',
            borderWidth: 2.5,
            pointRadius: days <= 7 ? 5 : 2,
            pointHoverRadius: 6,
            pointBackgroundColor: '#7c3aed',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            fill: true,
            tension: 0.35,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(17,24,39,0.85)',
              titleColor: '#e5e7eb',
              bodyColor: '#f9fafb',
              padding: 10,
              callbacks: {
                label: ctx => `⚡ ${ctx.parsed.y} XP`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 8, font: { size: 11 }, color: '#9ca3af' }
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(139,92,246,0.07)' },
              ticks: { font: { size: 11 }, color: '#9ca3af' }
            }
          }
        }
      });
    } catch (e) {
      console.warn('[Dashboard] XP trend chart error:', e.message);
      setText('statCurrentXp', '—');
      setText('statHighestXp', '—');
      setText('statAvgXp', '—');
    }
  }

  // ─── Phase 2d: Achievements / Badges ──────────────────────────────────────────
  function renderAchievements(xpData) {
    const achievementsEl = document.getElementById('ndAchievements');
    const summaryEl      = document.getElementById('ndBadgesSummary');

    // Only show for officers; admin has no personal XP
    const isAdmin = window.currentUser?.role === 'admin';
    if (isAdmin) {
      if (achievementsEl) achievementsEl.innerHTML = '<p style="color:#9ca3af;font-size:13px;text-align:center;padding:16px 0;">Badges are for officers.</p>';
      if (summaryEl) summaryEl.innerHTML = '';
      return;
    }

    if (!xpData) {
      if (achievementsEl) achievementsEl.innerHTML = '<p style="color:#9ca3af;font-size:13px;text-align:center;padding:16px 0;">Loading...</p>';
      return;
    }

    // Build set of earned event types from recent events
    const recentEvents = xpData.recentEvents || [];
    const earnedTypes = new Set(recentEvents.map(e => e.event_type));

    let earned = 0;

    if (achievementsEl) {
      achievementsEl.innerHTML = BADGE_DEFS.map(badge => {
        const isEarned = earnedTypes.has(badge.eventType);
        if (isEarned) earned++;
        return `
          <div class="nd-badge-item ${isEarned ? 'earned' : 'locked'}" title="${escHtml(badge.desc)}">
            <div class="nd-badge-icon" style="opacity:${isEarned ? '1' : '0.35'}">${badge.icon}</div>
            <div class="nd-badge-label" style="color:${isEarned ? '#1f2937' : '#9ca3af'}">${escHtml(badge.label)}</div>
            <div class="nd-badge-xp" style="color:${isEarned ? '#7c3aed' : '#d1d5db'}">+${badge.xp} XP</div>
            ${isEarned ? '<div class="nd-badge-earned-dot"></div>' : ''}
          </div>
        `;
      }).join('');
    }

    if (summaryEl) {
      const total = BADGE_DEFS.length;
      summaryEl.innerHTML = `
        <span style="font-weight:600;color:#7c3aed;">${earned}</span>
        <span style="color:#6b7280;">/ ${total} badges earned</span>
        ${earned === total ? ' 🏆' : ''}
      `;
    }
  }

  // ─── Trend Button Listeners ───────────────────────────────────────────────────
  function setupTrendButtons() {
    const btn7  = document.getElementById('xpTrend7Btn');
    const btn30 = document.getElementById('xpTrend30Btn');
    if (!btn7 || !btn30) return;

    btn7.addEventListener('click', () => {
      __xpTrendDays = 7;
      renderXPTrendChart(7);
    });
    btn30.addEventListener('click', () => {
      __xpTrendDays = 30;
      renderXPTrendChart(30);
    });
  }

  // ─── Date Range Listeners ─────────────────────────────────────────────────────
  // NOTE: homeApplyRangeBtn and homeThisMonthBtn are already wired in app.js
  // loadDashboard() — which calls loadNewDashboard() — so we do NOT re-bind
  // them here to avoid double-firing. This function is intentionally a no-op.
  function setupDateRangeButtons() {
    // No-op: app.js loadDashboard() owns these buttons and calls loadNewDashboard()
    // on change, which re-fetches all data with the updated date range.
  }

  // ─── Reload Analytics-dependent sections ──────────────────────────────────────
  async function reloadAnalyticsSection(officerId) {
    try {
      __analyticsData = await fetchAnalytics(officerId);
      // Phase 2
      renderKPIMetrics(__analyticsData);
      // Phase 3
      renderLeadPipeline(__analyticsData);
      renderTargets(__analyticsData);
      // Phase 5
      renderEnrollmentsChart(__analyticsData, officerId);
      await renderAdminActionCenter(__analyticsData);
      // Refresh selectors
      const leaderboard = __analyticsData?.leaderboard?.enrollmentsCurrentBatch || [];
      setupTargetsOfficerSelector(leaderboard);
    } catch (e) {
      console.warn('[Dashboard] Analytics reload error:', e.message);
    }
  }

  // ─── Phase 3a: Lead Pipeline Funnel ──────────────────────────────────────────
  function renderLeadPipeline(analyticsData) {
    const funnelEl   = document.getElementById('ndFunnelBars');
    const summaryEl  = document.getElementById('ndPipelineSummary');
    const footerEl   = document.getElementById('ndFunnelFooter');
    if (!funnelEl) return;

    const funnel = analyticsData?.funnel || {};
    const stages = [
      { label: 'New',         count: funnel.new              || 0, color: '#3b82f6' },
      { label: 'Contacted',   count: funnel.contacted         || 0, color: '#8b5cf6' },
      { label: 'Follow-up',   count: funnel.followUp          || 0, color: '#f59e0b' },
      { label: 'Registered',  count: funnel.registered        || 0, color: '#10b981' },
      { label: 'Enrolled',    count: funnel.confirmedPayments || 0, color: '#7c3aed' },
    ];

    const total = stages.reduce((s, st) => s + st.count, 0);
    const max   = Math.max(...stages.map(s => s.count), 1);

    // Pipeline summary badge
    if (summaryEl) {
      summaryEl.innerHTML = total > 0
        ? `<span style="font-size:12px;color:#6b7280;">${total.toLocaleString()} total leads</span>`
        : '';
    }

    // Funnel bars
    funnelEl.innerHTML = stages.map(stage => {
      const pct = Math.round((stage.count / max) * 100);
      const stagePct = total > 0 ? ((stage.count / total) * 100).toFixed(1) : '0.0';
      return `
        <div class="nd-funnel-row">
          <div class="nd-funnel-label">${escHtml(stage.label)}</div>
          <div class="nd-funnel-bar-wrap">
            <div class="nd-funnel-bar-fill" style="width:${pct}%;background:${stage.color};"></div>
          </div>
          <div class="nd-funnel-count">${stage.count.toLocaleString()} <span style="color:#9ca3af;font-size:11px;">(${stagePct}%)</span></div>
        </div>
      `;
    }).join('');

    // Footer: conversion rate from new → enrolled
    if (footerEl) {
      const newLeads = funnel.new || 0;
      const enrolled = funnel.confirmedPayments || 0;
      const rate = newLeads > 0 ? ((enrolled / newLeads) * 100).toFixed(1) : '0.0';
      footerEl.innerHTML = `
        <span style="font-size:12px;color:#6b7280;">
          New → Enrolled conversion:
          <strong style="color:#7c3aed;">${rate}%</strong>
          &nbsp;·&nbsp; ${enrolled} of ${newLeads} leads enrolled
        </span>
      `;
    }
  }

  // ─── Phase 3b: XP Leaderboard ─────────────────────────────────────────────────
  async function renderLeaderboard(xpLeaderboard) {
    const listEl  = document.getElementById('xpLeaderboardList');
    const badgeEl = document.getElementById('ndLeaderboardBadge');
    if (!listEl) return;

    try {
      // Use XP leaderboard from /api/xp/leaderboard
      const headers = await authHeaders();
      const r = await fetch('/api/xp/leaderboard', { headers });
      const j = await r.json();
      const list = j.leaderboard || [];

      // Leaderboard badge: show current user rank
      const currentName = window.currentUser?.name || '';
      const myEntry = list.find(e => e.name === currentName);
      if (badgeEl) {
        if (myEntry) {
          const myRank = list.indexOf(myEntry) + 1;
          badgeEl.innerHTML = `<span style="font-size:12px;color:#7c3aed;font-weight:600;">${medal(myRank - 1)} You're #${myRank}</span>`;
        } else {
          badgeEl.innerHTML = '';
        }
      }

      if (!list.length) {
        listEl.innerHTML = '<p style="color:#9ca3af;font-size:13px;padding:12px 0;">No XP recorded yet.</p>';
        return;
      }

      const isAdmin = window.currentUser?.role === 'admin';

      listEl.innerHTML = list.map((entry, i) => {
        const isMe = entry.name === currentName;
        const bg   = isMe ? 'rgba(124,58,237,0.06)' : 'transparent';
        const fw   = i < 3 ? '700' : '500';
        return `
          <div class="nd-leaderboard-row" style="background:${bg}; ${isMe ? 'border-left:3px solid #7c3aed;padding-left:8px;border-radius:4px;' : ''}">
            <span class="nd-lb-rank">${medal(i)}</span>
            <div class="nd-lb-avatar" style="background:hsl(${[...entry.name].reduce((h,c)=>(h*31+c.charCodeAt(0))%360,0)},60%,55%);">
              ${initials(entry.name)}
            </div>
            <span class="nd-lb-name" style="font-weight:${fw};">${escHtml(entry.name)}${isMe ? ' <span style="color:#7c3aed;font-size:11px;">(you)</span>' : ''}</span>
            <span class="nd-lb-xp">⚡ ${(entry.totalXp || 0).toLocaleString()}</span>
          </div>
        `;
      }).join('');
    } catch (e) {
      listEl.innerHTML = '<p style="color:#ef4444;font-size:13px;">Failed to load leaderboard.</p>';
      console.warn('[Dashboard] Leaderboard error:', e.message);
    }
  }

  // ─── Phase 3c: Targets vs Achievements ────────────────────────────────────────
  function renderTargets(analyticsData, officerName) {
    const targetsEl = document.getElementById('ndTargets');
    const overallEl = document.getElementById('ndTargetsOverall');
    if (!targetsEl) return;

    const kpis        = analyticsData?.kpis    || {};
    const leaderboard = analyticsData?.leaderboard?.enrollmentsCurrentBatch || [];

    // Determine whose data to show
    const isAdmin   = window.currentUser?.role === 'admin';
    const targetName = officerName || (isAdmin ? null : window.currentUser?.name);

    // Find officer entry in leaderboard for conversion data
    const officerEntry = targetName
      ? leaderboard.find(e => e.officer === targetName)
      : null;

    // Target thresholds (could be configurable in future)
    const TARGETS = {
      enrollments:  10,
      followups:    20,
      conversion:   0.30, // 30%
    };

    const enrollments  = officerEntry ? officerEntry.count          : (kpis.confirmedPayments ?? 0);
    const followupsDue = kpis.followUpsDue ?? 0;
    const conversion   = officerEntry ? officerEntry.conversionRate : (kpis.conversionRate    ?? 0);

    // Leads assigned (for conversion context)
    const leadsAssigned = officerEntry?.leadsAssigned ?? 0;

    const targets = [
      {
        label:    'Enrollments',
        icon:     '🎓',
        value:    enrollments,
        target:   TARGETS.enrollments,
        format:   v => v.toLocaleString(),
        barClass: 'nd-target-bar-fill nd-target-bar-purple',
      },
      {
        label:    'Follow-ups Due',
        icon:     '📅',
        value:    followupsDue,
        target:   TARGETS.followups,
        format:   v => v.toLocaleString(),
        barClass: 'nd-target-bar-fill nd-target-bar-amber',
        // For follow-ups, lower is better — invert bar
        invert:   true,
      },
      {
        label:    'Conversion Rate',
        icon:     '📈',
        value:    Math.round(conversion * 100),
        target:   Math.round(TARGETS.conversion * 100),
        format:   v => `${v}%`,
        barClass: 'nd-target-bar-fill nd-target-bar-green',
      },
    ];

    targetsEl.innerHTML = targets.map(t => {
      const pct = t.invert
        ? Math.max(0, Math.round((1 - t.value / Math.max(t.target, 1)) * 100))
        : Math.min(100, Math.round((t.value / Math.max(t.target, 1)) * 100));

      const achieved = t.invert ? t.value <= t.target : t.value >= t.target;
      const statusColor = achieved ? '#10b981' : (pct >= 60 ? '#f59e0b' : '#ef4444');

      return `
        <div class="nd-target-row">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:13px;font-weight:500;color:#374151;">${t.icon} ${escHtml(t.label)}</span>
            <span style="font-size:13px;font-weight:700;color:${statusColor};">
              ${t.format(t.value)} <span style="font-weight:400;color:#9ca3af;">/ ${t.format(t.target)}</span>
            </span>
          </div>
          <div class="nd-target-bar-bg">
            <div class="${t.barClass}" style="width:${pct}%;transition:width 0.6s ease;"></div>
          </div>
          <div style="font-size:11px;color:#9ca3af;margin-top:3px;">${pct}% of target${achieved ? ' ✅' : ''}</div>
        </div>
      `;
    }).join('');

    // Overall summary
    if (overallEl) {
      const achievedCount = targets.filter(t => {
        return t.invert ? t.value <= t.target : t.value >= t.target;
      }).length;
      const totalTargets = targets.length;
      const overallPct   = Math.round((achievedCount / totalTargets) * 100);
      const overallColor = overallPct >= 67 ? '#10b981' : (overallPct >= 34 ? '#f59e0b' : '#ef4444');

      overallEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #f3f4f6;margin-top:4px;">
          <span style="font-size:12px;color:#6b7280;">Overall Progress</span>
          <span style="font-size:13px;font-weight:700;color:${overallColor};">${achievedCount}/${totalTargets} targets met</span>
        </div>
        ${targetName ? `<div style="font-size:11px;color:#9ca3af;text-align:right;margin-top:2px;">For: ${escHtml(targetName)}</div>` : ''}
        ${leadsAssigned > 0 ? `<div style="font-size:11px;color:#9ca3af;text-align:right;">Leads assigned: ${leadsAssigned}</div>` : ''}
      `;
    }
  }

  // ─── Targets Officer Selector (Admin) ─────────────────────────────────────────
  function setupTargetsOfficerSelector(leaderboard) {
    const sel = document.getElementById('ndTargetsOfficerSelect');
    if (!sel) return;

    // Populate options from leaderboard
    const currentOptions = new Set([...sel.options].map(o => o.value));
    leaderboard.forEach(entry => {
      if (!currentOptions.has(entry.officer)) {
        const opt = document.createElement('option');
        opt.value = entry.officer;
        opt.textContent = entry.officer;
        sel.appendChild(opt);
      }
    });

    // Wire change handler (once)
    if (!sel.__targetHandlerSet) {
      sel.__targetHandlerSet = true;
      sel.addEventListener('change', () => {
        const officer = sel.value || null;
        renderTargets(__analyticsData, officer);
      });
    }
  }

  // ─── Phase 4a: Activity Feed ──────────────────────────────────────────────────
  async function renderActivityFeed() {
    const feedEl = document.getElementById('ndActivityFeed');
    if (!feedEl) return;

    const isAdmin = window.currentUser?.role === 'admin';

    try {
      const headers = await authHeaders();

      let events = [];

      if (isAdmin) {
        // Admin: show team-wide XP events from leaderboard endpoint
        const r = await fetch('/api/xp/leaderboard', { headers });
        const j = await r.json();
        const leaderboard = j.leaderboard || [];
        // Flatten recent events across all officers (leaderboard has recentEvents per entry)
        leaderboard.forEach(entry => {
          (entry.recentEvents || []).forEach(ev => {
            events.push({ ...ev, officerName: entry.name });
          });
        });
        // Sort by date desc, take latest 12
        events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        events = events.slice(0, 12);
      } else {
        // Officer: personal XP events
        const r = await fetch('/api/xp/me', { headers });
        const j = await r.json();
        events = (j.recentEvents || []).slice(0, 12);
      }

      if (!events.length) {
        feedEl.innerHTML = `
          <div style="text-align:center;padding:24px 0;color:#9ca3af;font-size:13px;">
            <div style="font-size:28px;margin-bottom:8px;">📭</div>
            No recent activity yet.
          </div>`;
        return;
      }

      feedEl.innerHTML = events.map(ev => {
        const meta = EVENT_LABELS[ev.event_type] || { label: ev.event_type || 'Activity', icon: '•' };
        const xpColor = (ev.xp ?? 0) >= 0 ? '#059669' : '#dc2626';
        const xpText  = (ev.xp ?? 0) >= 0 ? `+${ev.xp}` : `${ev.xp}`;
        const when    = timeAgo(ev.created_at);
        const name    = isAdmin && ev.officerName ? `<span style="color:#7c3aed;font-weight:600;">${escHtml(ev.officerName)}</span> · ` : '';
        return `
          <div class="nd-activity-item">
            <div class="nd-activity-icon">${meta.icon}</div>
            <div class="nd-activity-text">${name}${escHtml(meta.label)}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
              <span class="nd-activity-time">${when}</span>
              <span class="nd-activity-xp" style="color:${xpColor};">${xpText} XP</span>
            </div>
          </div>`;
      }).join('');

    } catch (e) {
      feedEl.innerHTML = '<p style="color:#ef4444;font-size:13px;padding:8px 0;">Failed to load activity feed.</p>';
      console.warn('[Dashboard] Activity feed error:', e.message);
    }
  }

  // ─── Phase 4b: Tasks List ─────────────────────────────────────────────────────
  async function renderTasksList() {
    const listEl = document.getElementById('ndTasksList');
    if (!listEl) return;

    try {
      const headers = await authHeaders();
      const isAdmin = window.currentUser?.role === 'admin';
      const mode    = isAdmin ? 'everyone' : 'me';
      const r = await fetch(`/api/calendar/tasks?mode=${mode}`, { headers });
      const j = await r.json();
      const tasks = (j.tasks || []).slice(0, 10);

      if (!tasks.length) {
        listEl.innerHTML = `
          <div style="text-align:center;padding:20px 0;color:#9ca3af;font-size:13px;">
            <div style="font-size:24px;margin-bottom:6px;">✅</div>
            No tasks yet.
          </div>`;
        return;
      }

      const now = Date.now();

      listEl.innerHTML = tasks.map(task => {
        const priority   = task.priority || task.repeat || 'low';
        const dueMs      = task.dueAt ? new Date(task.dueAt).getTime() : null;
        const isOverdue  = dueMs && dueMs < now;
        const dueLabel   = dueMs
          ? new Date(task.dueAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '';

        // Determine priority badge label
        const priMap = { high: 'High', medium: 'Med', low: 'Low', none: 'Low' };
        const priClass = ['high', 'medium', 'low'].includes(priority) ? priority : 'low';
        const priLabel = priMap[priority] || 'Low';

        return `
          <div class="nd-task-item" data-task-id="${escHtml(task.id)}">
            <button class="nd-task-check" title="Complete task" onclick="window.__ndCompleteTask('${escHtml(task.id)}', this)">
              <i class="fas fa-circle" style="font-size:14px;color:#d1d5db;"></i>
            </button>
            <div style="flex:1;min-width:0;">
              <div class="nd-task-title">${escHtml(task.title)}</div>
              ${dueLabel ? `<div class="nd-task-due" style="color:${isOverdue ? '#ef4444' : '#9ca3af'};">
                ${isOverdue ? '⚠ ' : ''}${dueLabel}
              </div>` : ''}
            </div>
            <span class="nd-priority-badge nd-priority-${priClass}">${priLabel}</span>
          </div>`;
      }).join('');

    } catch (e) {
      listEl.innerHTML = '<p style="color:#ef4444;font-size:13px;padding:8px 0;">Failed to load tasks.</p>';
      console.warn('[Dashboard] Tasks list error:', e.message);
    }
  }

  // Global helper for completing tasks (called from inline onclick)
  window.__ndCompleteTask = async function (taskId, btnEl) {
    try {
      const headers = await authHeaders();
      const r = await fetch(`/api/calendar/tasks/${taskId}`, { method: 'DELETE', headers });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Failed');
      // Remove the task row with a fade
      const row = btnEl?.closest('.nd-task-item');
      if (row) {
        row.style.transition = 'opacity 0.3s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 300);
      }
    } catch (e) {
      console.warn('[Dashboard] Complete task error:', e.message);
    }
  };

  // ─── Phase 4c: Quick Actions ──────────────────────────────────────────────────
  function setupQuickActions() {
    const qaAddLead     = document.getElementById('qaAddLead');
    const qaFollowup    = document.getElementById('qaFollowup');
    const qaUpdateStatus = document.getElementById('qaUpdateStatus');

    if (qaAddLead && !qaAddLead.__wired) {
      qaAddLead.__wired = true;
      qaAddLead.addEventListener('click', () => {
        // Navigate to leads page and trigger add-lead modal if available
        if (window.navigateToPage) window.navigateToPage('leads-myLeads');
        setTimeout(() => {
          const addBtn = document.getElementById('addLeadBtn') || document.querySelector('[data-action="add-lead"]');
          if (addBtn) addBtn.click();
        }, 400);
      });
    }

    if (qaFollowup && !qaFollowup.__wired) {
      qaFollowup.__wired = true;
      qaFollowup.addEventListener('click', () => {
        // Navigate to calendar tasks / lead management
        if (window.navigateToPage) window.navigateToPage('calendar');
      });
    }

    if (qaUpdateStatus && !qaUpdateStatus.__wired) {
      qaUpdateStatus.__wired = true;
      qaUpdateStatus.addEventListener('click', () => {
        if (window.navigateToPage) window.navigateToPage('lead-management');
      });
    }
  }

  // ─── Phase 4d: Add Task Form ──────────────────────────────────────────────────
  function setupAddTask() {
    const addBtn  = document.getElementById('ndAddTaskBtn');
    const form    = document.getElementById('ndTaskAddForm');
    const saveBtn = document.getElementById('ndTaskSaveBtn');
    const titleIn = document.getElementById('ndTaskTitle');
    const dueIn   = document.getElementById('ndTaskDue');
    const priIn   = document.getElementById('ndTaskPriority');

    if (!addBtn || !form || addBtn.__wired) return;
    addBtn.__wired = true;

    // Toggle form visibility
    addBtn.addEventListener('click', () => {
      const visible = form.style.display !== 'none';
      form.style.display = visible ? 'none' : 'block';
      if (!visible && titleIn) titleIn.focus();
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const title = titleIn?.value?.trim();
        const dueAt = dueIn?.value;
        const priority = priIn?.value || 'medium';

        if (!title) {
          if (titleIn) { titleIn.style.borderColor = '#ef4444'; setTimeout(() => titleIn.style.borderColor = '', 1500); }
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
          const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
          const r = await fetch('/api/calendar/tasks', {
            method: 'POST',
            headers,
            body: JSON.stringify({ title, dueAt: dueAt || null, priority, visibility: 'personal' })
          });
          const j = await r.json();
          if (!j.success) throw new Error(j.error || 'Failed to save task');

          // Reset form
          if (titleIn)  titleIn.value  = '';
          if (dueIn)    dueIn.value    = '';
          if (priIn)    priIn.value    = 'medium';
          form.style.display = 'none';

          // Reload tasks list
          await renderTasksList();

          if (window.showToast) window.showToast('Task saved!', 'success');
        } catch (e) {
          console.warn('[Dashboard] Save task error:', e.message);
          if (window.showToast) window.showToast(e.message || 'Failed to save task', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Task';
        }
      });
    }
  }

  // ─── Phase 5a: Populate Officer Selectors (Admin) ────────────────────────────
  async function populateOfficerSelectors(leaderboard) {
    // ndOfficerSelect — profile section filter (reload all metrics for officer)
    const mainSel    = document.getElementById('ndOfficerSelect');
    // ndTargetsOfficerSelect — already handled in Phase 3 setupTargetsOfficerSelector
    // Both selectors get the same officer list derived from the analytics leaderboard

    if (mainSel && !mainSel.__populated) {
      mainSel.__populated = true;

      // Clear existing options except the first "All Officers" placeholder
      while (mainSel.options.length > 1) mainSel.remove(1);

      leaderboard.forEach(entry => {
        const opt = document.createElement('option');
        opt.value = entry.officer;
        opt.textContent = entry.officer;
        mainSel.appendChild(opt);
      });

      // Change → reload all analytics-dependent sections for selected officer
      mainSel.addEventListener('change', async () => {
        const officerId = mainSel.value || null;
        await reloadAnalyticsSection(officerId);
        // Also re-render enrollment chart for selected officer
        renderEnrollmentsChart(__analyticsData, officerId);
      });
    }
  }

  // ─── Phase 5b: Admin Action Center ───────────────────────────────────────────
  async function renderAdminActionCenter(analyticsData) {
    const acEl = document.getElementById('homeActionCenter');
    if (!acEl) return;
    if (window.currentUser?.role !== 'admin') return;

    const ac = analyticsData?.actionCenter;
    if (!ac) {
      acEl.innerHTML = '<p style="color:#9ca3af;font-size:13px;">No action center data.</p>';
      return;
    }

    const overdue      = Number(ac.overdueFollowUps             || 0);
    const toConfirm    = Number(ac.paymentsToBeConfirmed        || 0);
    const toEnroll     = Number(ac.toBeEnrolled                 || 0);
    const missingAssign = Number(ac.registrationsMissingAssignedTo || 0);

    // Fetch pending leave count
    let pendingLeave = 0;
    try {
      const h = await authHeaders();
      const r = await fetch('/api/attendance/leave-requests?status=pending', { headers: h, cache: 'no-store' });
      const j = await r.json();
      if (j?.success) pendingLeave = Number(j.count || (j.requests || []).length || 0);
    } catch (e) { /* ignore */ }

    const items = [
      {
        icon: '⚠️',
        iconClass: 'nd-action-amber',
        title: 'Overdue Follow-ups',
        sub: 'Leads with missed follow-up dates',
        count: overdue,
        countColor: '#92400e',
        countBg: '#fffbeb',
        countBorder: '#fde68a',
        nav: 'calendar',
        btnId: 'acOverdueFollowUpsBtn',
      },
      {
        icon: '💳',
        iconClass: 'nd-action-purple',
        title: 'Payments to Confirm',
        sub: 'Payment received but not confirmed',
        count: toConfirm,
        countColor: '#5b21b6',
        countBg: '#f5f3ff',
        countBorder: '#ddd6fe',
        nav: 'payments',
        btnId: 'acConfirmPaymentsBtn',
      },
      {
        icon: '🎓',
        iconClass: 'nd-action-green',
        title: 'To Be Enrolled',
        sub: 'Payment confirmed but not enrolled',
        count: toEnroll,
        countColor: '#155e75',
        countBg: '#ecfeff',
        countBorder: '#a5f3fc',
        nav: 'registrations',
        btnId: 'acToEnrollBtn',
      },
      {
        icon: '📋',
        iconClass: 'nd-action-blue',
        title: 'Missing Assignment',
        sub: 'Registrations without an officer',
        count: missingAssign,
        countColor: '#3730a3',
        countBg: '#eef2ff',
        countBorder: '#c7d2fe',
        nav: 'registrations',
        btnId: 'acMissingAssignBtn',
      },
      {
        icon: '🏖️',
        iconClass: 'nd-action-rose',
        title: 'Leave Requests',
        sub: 'Pending staff leave approvals',
        count: pendingLeave,
        countColor: '#991b1b',
        countBg: '#fef2f2',
        countBorder: '#fecaca',
        nav: 'attendance',
        btnId: 'acLeaveRequestsBtn',
      },
    ];

    acEl.innerHTML = items.map(item => `
      <div class="nd-ac-item">
        <div class="nd-ac-icon ${item.iconClass}">${item.icon}</div>
        <div style="flex:1;min-width:0;">
          <div class="nd-ac-title">${item.title}</div>
          <div class="nd-ac-sub">${item.sub}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span class="nd-ac-count" style="color:${item.countColor};background:${item.countBg};border:1px solid ${item.countBorder};">
            ${item.count}
          </span>
          <button class="nd-btn-ghost" type="button" data-nav="${item.nav}" data-btn-id="${item.btnId}" style="font-size:12px;padding:4px 8px;">
            View
          </button>
        </div>
      </div>
    `).join('');

    // Wire View buttons
    acEl.querySelectorAll('button[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const navTarget = btn.dataset.nav;
        if (navTarget === 'attendance') {
          if (window.navigateToPage) window.navigateToPage('attendance');
          setTimeout(() => {
            try {
              const sel = document.getElementById('attendanceAdminLeaveStatus');
              if (sel) sel.value = 'pending';
              document.getElementById('attendanceAdminLeaveRefreshBtn')?.click();
            } catch (e) {}
          }, 600);
        } else {
          if (window.navigateToPage) window.navigateToPage(navTarget);
        }
      });
    });
  }

  // ─── Phase 5c: Enrollments per Day Chart ──────────────────────────────────────
  function renderEnrollmentsChart(analyticsData, officerFilter) {
    const isAdmin = window.currentUser?.role === 'admin';

    // Admin: use homeConfirmedLineChart; Officer: use homeConfirmedLineChartOfficer
    const canvasId = isAdmin ? 'homeConfirmedLineChart' : 'homeConfirmedLineChartOfficer';
    const canvas   = document.getElementById(canvasId);
    if (!canvas) return;

    // Show the correct row
    const adminRow   = document.getElementById('ndAdminActionRow');
    const officerRow = document.getElementById('ndOfficerActionRow');
    if (isAdmin) {
      if (adminRow)   adminRow.style.display   = '';
      if (officerRow) officerRow.style.display = 'none';
    } else {
      if (adminRow)   adminRow.style.display   = 'none';
      if (officerRow) officerRow.style.display = '';
    }

    const series = analyticsData?.series?.confirmedPaymentsPerDay || [];
    const labels = series.map(r => {
      const d = new Date(r.day);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    });
    const values = series.map(r => r.count);

    // Destroy existing chart stored on canvas element
    if (canvas.__chart) {
      canvas.__chart.destroy();
      canvas.__chart = null;
    }

    // Also destroy app.js-owned chart if it exists (prevent duplicate canvas error)
    if (isAdmin && window.__homeConfirmedLineChart) {
      try { window.__homeConfirmedLineChart.destroy(); } catch (e) {}
      window.__homeConfirmedLineChart = null;
    }

    if (!series.length) {
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = '';

    canvas.__chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Enrollments',
          data: values,
          tension: 0.35,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124,58,237,0.08)',
          fill: true,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2.5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17,24,39,0.85)',
            callbacks: { label: ctx => `${ctx.parsed.y} enrollment${ctx.parsed.y !== 1 ? 's' : ''}` }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 }, color: '#9ca3af' }, grid: { color: 'rgba(139,92,246,0.07)' } },
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 11 }, color: '#9ca3af' }, grid: { display: false } }
        }
      }
    });
  }

  // ─── Skeleton → Content helpers ───────────────────────────────────────────────
  // Replace skeleton placeholders with real content and trigger fade-in animation.
  // Called after each section renders its innerHTML.
  function clearSkeletons(containerIds) {
    containerIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      // Remove any leftover skeleton children
      el.querySelectorAll('.nd-skeleton-row, .nd-skeleton-bar, .nd-skeleton-badge, .nd-loading').forEach(s => s.remove());
      // Trigger fade-in on the container itself
      el.classList.remove('nd-content-ready');
      void el.offsetWidth; // reflow to restart animation
      el.classList.add('nd-content-ready');
    });
  }

  // ─── Admin / Officer row visibility ──────────────────────────────────────────
  function applyRoleVisibility() {
    const isAdmin = window.currentUser?.role === 'admin';
    const adminRow   = document.getElementById('ndAdminActionRow');
    const officerRow = document.getElementById('ndOfficerActionRow');

    if (isAdmin) {
      if (adminRow)   { adminRow.style.display   = ''; adminRow.style.removeProperty('display'); }
      if (officerRow) { officerRow.style.display = 'none'; }
    } else {
      if (adminRow)   { adminRow.style.display   = 'none'; }
      if (officerRow) { officerRow.style.display = ''; officerRow.style.removeProperty('display'); }
    }

    // Officer filter wrap (admin-only in profile section)
    const officerFilterWrap = document.getElementById('ndOfficerFilterWrap');
    if (officerFilterWrap) {
      officerFilterWrap.style.display = isAdmin ? '' : 'none';
    }

    // Targets officer select (admin-only)
    const targetsOfficerSel = document.getElementById('ndTargetsOfficerSelect');
    if (targetsOfficerSel) {
      targetsOfficerSel.style.display = isAdmin ? '' : 'none';
    }

    // Add task button (officer-only)
    const addTaskBtn = document.getElementById('ndAddTaskBtn');
    if (addTaskBtn) {
      addTaskBtn.style.display = isAdmin ? 'none' : '';
    }
  }

  // ─── Public Entry Point ───────────────────────────────────────────────────────
  /**
   * window.loadNewDashboard()
   * Called from app.js loadDashboard() after homeView is shown.
   * Safe to call multiple times — reloads fresh data each time.
   */
  window.loadNewDashboard = async function () {
    const isAdmin = window.currentUser?.role === 'admin';

    // Wire up buttons/forms once
    if (!__listenersSetUp) {
      setupTrendButtons();
      setupDateRangeButtons();
      setupQuickActions();
      setupAddTask();
      __listenersSetUp = true;
    }

    // Apply role-based visibility immediately (before data loads)
    applyRoleVisibility();

    // Fetch data in parallel: XP (officer only) + analytics
    const [xpResult, analyticsResult] = await Promise.allSettled([
      isAdmin ? Promise.resolve(null) : fetchXPData(),
      fetchAnalytics()
    ]);

    __xpData        = xpResult.status === 'fulfilled' ? xpResult.value : null;
    __analyticsData = analyticsResult.status === 'fulfilled' ? analyticsResult.value : null;

    if (xpResult.status === 'rejected') console.warn('[Dashboard] XP data error:', xpResult.reason?.message);
    if (analyticsResult.status === 'rejected') console.warn('[Dashboard] Analytics error:', analyticsResult.reason?.message);

    // Render all Phase 2 + Phase 3 + Phase 4 + Phase 5 sections in parallel
    await Promise.allSettled([
      // Phase 2
      renderProfileSection(__xpData),
      Promise.resolve(renderKPIMetrics(__analyticsData)),
      renderXPTrendChart(__xpTrendDays),
      Promise.resolve(renderAchievements(__xpData)),
      // Phase 3
      Promise.resolve(renderLeadPipeline(__analyticsData)),
      renderLeaderboard(),
      Promise.resolve(renderTargets(__analyticsData)),
      // Phase 4
      renderActivityFeed(),
      renderTasksList(),
      // Phase 5
      renderAdminActionCenter(__analyticsData),
      Promise.resolve(renderEnrollmentsChart(__analyticsData)),
    ]);

    // Post-render: wire selectors (needs leaderboard data)
    const leaderboard = __analyticsData?.leaderboard?.enrollmentsCurrentBatch || [];
    setupTargetsOfficerSelector(leaderboard);
    await populateOfficerSelectors(leaderboard);

    // Phase 7: clear all skeleton placeholders + trigger fade-in animations
    clearSkeletons([
      'ndFunnelBars',
      'xpLeaderboardList',
      'ndTargets',
      'ndActivityFeed',
      'ndTasksList',
      'ndAchievements',
      'homeActionCenter',
    ]);
  };

  // Keep backward-compat alias for any existing app.js calls
  window.loadXPDashboard = window.loadNewDashboard;

})();
