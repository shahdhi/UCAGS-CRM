/**
 * XP Dashboard
 * Renders the XP leaderboard, personal XP card, and XP trend chart on the Home view.
 * Called by app.js after analytics loads.
 */

(function () {
  let __xpTrendChart = null;
  let __xpTrendDays = 30;
  let __xpLoaded = false;

  // ─── Medal helper ────────────────────────────────────────────────────────────
  function medal(i) {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return `<span style="color:#6b7280; font-size:12px;">#${i + 1}</span>`;
  }

  // ─── Leaderboard (Admin) ──────────────────────────────────────────────────────
  async function renderXPLeaderboard() {
    const el = document.getElementById('xpLeaderboardList');
    if (!el) return;

    try {
      const headers = await (window.getAuthHeadersWithRetry ? window.getAuthHeadersWithRetry() : {});
      const r = await fetch('/api/xp/leaderboard', { headers });
      const j = await r.json();
      const list = j.leaderboard || [];

      if (!list.length) {
        el.innerHTML = '<p style="color:#9ca3af; font-size:13px;">No XP recorded yet.</p>';
        return;
      }

      el.innerHTML = list.map((entry, i) => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:7px 4px; border-bottom:1px solid #f3f4f6; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
            <span style="flex:0 0 auto; min-width:24px; text-align:center;">${medal(i)}</span>
            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:13px; font-weight:${i < 3 ? 600 : 400};">${entry.name}</span>
          </div>
          <span style="font-weight:700; color:#7c3aed; white-space:nowrap; font-size:14px;">⚡ ${entry.totalXp} XP</span>
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = '<p style="color:#ef4444; font-size:13px;">Failed to load XP leaderboard.</p>';
    }
  }

  // ─── Personal XP card (Officer) ───────────────────────────────────────────────
  async function renderPersonalXP() {
    const el = document.getElementById('xpPersonalContent');
    if (!el) return;

    try {
      const headers = await (window.getAuthHeadersWithRetry ? window.getAuthHeadersWithRetry() : {});
      const r = await fetch('/api/xp/me', { headers });
      const j = await r.json();

      const totalXp = j.totalXp || 0;
      const rank = j.rank;
      const totalOfficers = j.totalOfficers || 0;
      const recent = j.recentEvents || [];

      const EVENT_LABELS = {
        lead_contacted:       { label: 'Lead contacted',          icon: '📞' },
        followup_completed:   { label: 'Follow-up completed',     icon: '✅' },
        registration_received:{ label: 'Registration received',   icon: '📝' },
        payment_received:     { label: 'Payment received',        icon: '💰' },
        demo_attended:        { label: 'Demo attended',           icon: '🎓' },
        attendance_on_time:   { label: 'On-time check-in',        icon: '⏰' },
        checklist_completed:  { label: 'Checklist completed',     icon: '☑️' },
        report_submitted:     { label: 'Report submitted',        icon: '📊' },
        lead_responded_fast:  { label: 'Speed bonus (1h)',        icon: '⚡' },
        followup_overdue:     { label: 'Overdue follow-up',       icon: '⚠️' },
      };

      const rankText = rank ? `Ranked #${rank} of ${totalOfficers}` : '';

      el.innerHTML = `
        <div style="text-align:center; padding:12px 0 8px;">
          <div style="font-size:40px; font-weight:800; color:#7c3aed;">⚡ ${totalXp}</div>
          <div style="font-size:14px; color:#6b7280; margin-top:4px;">${rankText}</div>
        </div>
        ${recent.length ? `
        <div style="margin-top:12px;">
          <div style="font-size:12px; font-weight:600; color:#374151; margin-bottom:6px;">Recent Activity</div>
          ${recent.slice(0, 8).map(ev => {
            const meta = EVENT_LABELS[ev.event_type] || { label: ev.event_type, icon: '•' };
            const xpColor = ev.xp >= 0 ? '#059669' : '#dc2626';
            const xpText = ev.xp >= 0 ? `+${ev.xp}` : `${ev.xp}`;
            const date = ev.created_at ? new Date(ev.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '';
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 2px; border-bottom:1px solid #f3f4f6; font-size:12px;">
                <span>${meta.icon} ${meta.label}</span>
                <span style="display:flex; gap:8px; align-items:center; white-space:nowrap;">
                  <span style="color:#9ca3af;">${date}</span>
                  <span style="font-weight:700; color:${xpColor};">${xpText} XP</span>
                </span>
              </div>`;
          }).join('')}
        </div>` : ''}
      `;
    } catch (e) {
      el.innerHTML = '<p style="color:#ef4444; font-size:13px;">Failed to load XP data.</p>';
    }
  }

  // ─── XP Trend Chart ───────────────────────────────────────────────────────────
  async function renderXPTrend(days) {
    const canvas = document.getElementById('xpTrendChart');
    if (!canvas) return;

    try {
      const isAdmin = window.currentUser?.role === 'admin';
      const headers = await (window.getAuthHeadersWithRetry ? window.getAuthHeadersWithRetry() : {});

      let trend = [];
      if (isAdmin) {
        const r = await fetch(`/api/xp/global-trend?days=${days}`, { headers });
        const j = await r.json();
        trend = j.trend || [];
      } else {
        const r = await fetch(`/api/xp/trend?days=${days}`, { headers });
        const j = await r.json();
        trend = j.trend || [];
      }

      const labels = trend.map(t => {
        const d = new Date(t.date);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      });
      const data = trend.map(t => t.xp);

      if (__xpTrendChart) {
        __xpTrendChart.destroy();
        __xpTrendChart = null;
      }

      __xpTrendChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: isAdmin ? 'Total XP (all officers)' : 'My XP',
            data,
            borderColor: '#7c3aed',
            backgroundColor: 'rgba(124,58,237,0.08)',
            borderWidth: 2,
            pointRadius: days <= 7 ? 4 : 2,
            pointBackgroundColor: '#7c3aed',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.parsed.y} XP`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 8, font: { size: 11 } }
            },
            y: {
              beginAtZero: true,
              ticks: { font: { size: 11 } }
            }
          }
        }
      });
    } catch (e) {
      console.warn('[XP] Trend chart error:', e.message);
    }
  }

  // ─── Toggle trend period ──────────────────────────────────────────────────────
  function setupTrendButtons() {
    const btn7  = document.getElementById('xpTrend7Btn');
    const btn30 = document.getElementById('xpTrend30Btn');
    if (!btn7 || !btn30) return;

    btn7.addEventListener('click', () => {
      __xpTrendDays = 7;
      btn7.className  = 'btn btn-primary btn-sm';
      btn30.className = 'btn btn-secondary btn-sm';
      renderXPTrend(7);
    });

    btn30.addEventListener('click', () => {
      __xpTrendDays = 30;
      btn30.className = 'btn btn-primary btn-sm';
      btn7.className  = 'btn btn-secondary btn-sm';
      renderXPTrend(30);
    });
  }

  // ─── Public entry point ───────────────────────────────────────────────────────
  /**
   * Call this from app.js after the home view loads.
   * Safe to call multiple times — will reload fresh data each time.
   */
  window.loadXPDashboard = async function () {
    const isAdmin = window.currentUser?.role === 'admin';

    // Setup trend buttons once
    if (!__xpLoaded) {
      setupTrendButtons();
      __xpLoaded = true;
    }

    // Run in parallel
    await Promise.allSettled([
      isAdmin ? renderXPLeaderboard() : renderPersonalXP(),
      renderXPTrend(__xpTrendDays)
    ]);
  };
})();
