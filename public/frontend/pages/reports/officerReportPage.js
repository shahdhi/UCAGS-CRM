/**
 * Officer Detail Report Page
 * Admin-only. Calls the crm-detail-report Supabase edge function.
 */
(function () {
  const EDGE_BASE = 'https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/crm-detail-report';
  const ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkZGF4aXd5c3p5bmp5cml6a21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDA3OTUsImV4cCI6MjA4NTE3Njc5NX0.imH4CCqt1fBwGek3ku1LTsq99YCfW4ZJQDwhw-0BD_Q';

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async function authHeaders() {
    const headers = { apikey: ANON_KEY };
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  async function edgeFetch(path, opts = {}) {
    const hdrs = await authHeaders();
    if (opts.headers) Object.assign(hdrs, opts.headers);
    const res = await fetch(`${EDGE_BASE}/${path}`, { ...opts, headers: hdrs });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json;
  }

  function esc(v) {
    if (v == null || v === '') return '—';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtDT(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'short' }); }
    catch { return iso; }
  }

  function xpBadge(xp) {
    if (xp == null) return '<span style="color:#9ca3af;">—</span>';
    const color = xp > 0 ? '#16a34a' : xp < 0 ? '#dc2626' : '#9ca3af';
    return `<span style="font-weight:700;color:${color};">${xp > 0 ? '+' : ''}${xp} XP</span>`;
  }

  function table(headers, rows, emptyMsg = 'No records') {
    if (!rows.length) return `<p style="color:#9ca3af;padding:8px 0;">${emptyMsg}</p>`;
    const ths = headers.map(h => `<th>${h}</th>`).join('');
    const trs = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `<div class="table-container" style="overflow-x:auto;"><table class="data-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
  }

  function section(id, icon, title, countBadge, contentHtml) {
    const badge = countBadge > 0
      ? `<span style="background:#7c3aed;color:#fff;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:700;margin-left:8px;">${countBadge}</span>`
      : '';
    return `
      <div class="dashboard-card" style="margin-bottom:16px;" id="rptSection_${id}">
        <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;"
             onclick="document.getElementById('rptBody_${id}').style.display=document.getElementById('rptBody_${id}').style.display==='none'?'block':'none'">
          <h3 style="margin:0;font-size:15px;display:flex;align-items:center;gap:8px;">
            <i class="${icon}" style="color:#7c3aed;"></i> ${title}${badge}
          </h3>
          <i class="fas fa-chevron-down" style="color:#9ca3af;font-size:12px;"></i>
        </div>
        <div id="rptBody_${id}" style="margin-top:14px;">${contentHtml}</div>
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Render helpers per section
  // -------------------------------------------------------------------------

  function renderAttendance(rows) {
    return table(
      ['Date', 'Check-in', 'Check-out'],
      rows.map(r => [esc(r.date), esc(r.check_in || r.check_in_iso ? fmtDT(r.check_in_iso || r.check_in) : '—'), esc(r.check_out || r.check_out_iso ? fmtDT(r.check_out_iso || r.check_out) : '—')])
    );
  }

  function renderLeadsAssigned(rows) {
    return table(
      ['Name', 'Phone', 'Email', 'Status', 'Program', 'Batch', 'Assigned At'],
      rows.map(r => [esc(r.name), esc(r.phone), esc(r.email), esc(r.status), esc(r.program_name), esc(r.batch_name), fmtDT(r.created_at)])
    );
  }

  function renderLeadsContacted(rows) {
    return table(
      ['Lead Name', 'Phone', 'Email', 'Status', 'XP', 'Contacted At'],
      rows.map(r => [
        esc(r.lead?.name), esc(r.lead?.phone), esc(r.lead?.email),
        esc(r.lead?.status), xpBadge(r.xp), fmtDT(r.created_at)
      ])
    );
  }

  function renderFollowups(rows) {
    return table(
      ['Channel', 'Scheduled', 'Completed', 'Answered', 'Comment', 'Created'],
      rows.map(r => [
        esc(r.channel), fmtDT(r.scheduled_at), fmtDT(r.actual_at),
        r.answered ? '✓' : r.answered === false ? '✗' : '—',
        esc(r.comment), fmtDT(r.created_at)
      ])
    );
  }

  function renderOverdueFollowups(rows) {
    if (!rows.length) return '<p style="color:#16a34a;padding:8px 0;font-weight:600;"><i class="fas fa-check-circle"></i> No overdue follow-ups</p>';
    return table(
      ['Channel', 'Scheduled', 'Comment', 'Created'],
      rows.map(r => [esc(r.channel), `<span style="color:#dc2626;font-weight:600;">${fmtDT(r.scheduled_at)}</span>`, esc(r.comment), fmtDT(r.created_at)])
    );
  }

  function renderContacts(rows) {
    return table(
      ['Name', 'Phone', 'Email', 'Saved At'],
      rows.map(r => [esc(r.display_name), esc(r.phone_number), esc(r.email), fmtDT(r.created_at)])
    );
  }

  function renderDailyReports(rows) {
    return table(
      ['Date', 'Slot', 'Fresh Calls', 'Messages', 'Interested', 'Closures', 'Submitted'],
      rows.map(r => [
        esc(r.report_date), esc(r.slot_key),
        esc(r.fresh_calls_made), esc(r.fresh_messages_reached),
        esc(r.interested_leads), esc(r.closures),
        fmtDT(r.submitted_at)
      ])
    );
  }

  function renderRegistrations(rows) {
    return table(
      ['Name', 'Phone', 'Email', 'Payment', 'Program', 'Batch', 'XP', 'Submitted At'],
      rows.map(r => [
        esc(r.full_name), esc(r.phone_number), esc(r.email),
        esc(r.payment_status), esc(r.program_name), esc(r.batch_name),
        xpBadge(r.xp), fmtDT(r.created_at)
      ])
    );
  }

  function renderEnrollments(rows) {
    return table(
      ['Name', 'Phone', 'Email', 'XP', 'Enrolled At'],
      rows.map(r => [esc(r.user_full_name), esc(r.phone), esc(r.email), xpBadge(r.xp), fmtDT(r.created_at)])
    );
  }

  function renderDemoSessions(rows) {
    return table(
      ['Topic', 'Program', 'Session Date', 'Invite Status', 'Attendance', 'XP', 'Added At'],
      rows.map(r => [
        esc(r.demo_sessions?.topic), esc(r.demo_sessions?.program_name),
        fmtDate(r.demo_sessions?.session_date),
        esc(r.invite_status), esc(r.attendance),
        xpBadge(r.xp), fmtDT(r.created_at)
      ])
    );
  }

  // -------------------------------------------------------------------------
  // Summary cards row
  // -------------------------------------------------------------------------

  function renderSummaryCards(summary) {
    const cards = [
      { icon: 'fas fa-calendar-check', label: 'Attendance Days', value: summary.attendanceDays, color: '#2563eb' },
      { icon: 'fas fa-users',          label: 'Leads Assigned',  value: summary.leadsAssigned,  color: '#7c3aed' },
      { icon: 'fas fa-phone',          label: 'Leads Contacted', value: summary.leadsContacted, color: '#0891b2' },
      { icon: 'fas fa-tasks',          label: 'Follow-ups',      value: summary.followups,      color: '#059669' },
      { icon: 'fas fa-exclamation-circle', label: 'Overdue',     value: summary.overdueFollowups, color: summary.overdueFollowups > 0 ? '#dc2626' : '#059669' },
      { icon: 'fas fa-address-book',   label: 'Contacts Saved',  value: summary.contactsSaved,  color: '#0891b2' },
      { icon: 'fas fa-clipboard-list', label: 'Daily Reports',   value: summary.dailyReports,   color: '#6d28d9' },
      { icon: 'fas fa-clipboard-check', label: 'Registrations',  value: summary.registrations,  color: '#16a34a' },
      { icon: 'fas fa-user-graduate',  label: 'Enrollments',     value: summary.enrollments,    color: '#7c3aed' },
      { icon: 'fas fa-chalkboard-teacher', label: 'Demo Sessions', value: summary.demoSessions, color: '#b45309' },
      { icon: 'fas fa-star',           label: 'Total XP Earned', value: summary.totalXp,        color: '#ea580c' },
    ];
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:20px;">
      ${cards.map(c => `
        <div class="dashboard-card" style="padding:14px 12px;text-align:center;margin:0;">
          <i class="${c.icon}" style="color:${c.color};font-size:22px;margin-bottom:6px;display:block;"></i>
          <div style="font-size:22px;font-weight:800;color:${c.color};">${c.value}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">${c.label}</div>
        </div>`).join('')}
    </div>`;
  }

  // -------------------------------------------------------------------------
  // Print / PDF
  // -------------------------------------------------------------------------

  function injectPrintStyle() {
    if (document.getElementById('officerReportPrintStyle')) return;
    const style = document.createElement('style');
    style.id = 'officerReportPrintStyle';
    style.textContent = `
      @media print {
        /* ── Reset layout constraints that clip print output ── */
        html, body {
          height: auto !important;
          overflow: visible !important;
        }
        .main-wrapper,
        .main-content {
          height: auto !important;
          overflow: visible !important;
          max-height: none !important;
        }

        /* ── Hide everything except the report view ── */
        .sidebar,
        .sidebar-overlay,
        .top-bar,
        .no-print,
        #rptFilterBar,
        #wa-drawer,
        #waDrawer,
        #waDrawerOverlay {
          display: none !important;
        }

        /* ── Force the report view visible ── */
        #officer-reportView {
          display: block !important;
        }

        /* ── Force ALL collapsible section bodies open ── */
        [id^="rptBody_"] {
          display: block !important;
        }

        /* ── Tables: remove scroll containers, let content flow ── */
        .table-container {
          overflow: visible !important;
          max-height: none !important;
        }

        /* ── Cards: flatten for print ── */
        .dashboard-card {
          box-shadow: none !important;
          border: 1px solid #d1d5db !important;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* ── Tables: keep rows together where possible ── */
        .data-table tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* ── Misc ── */
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
    document.head.appendChild(style);
  }

  // -------------------------------------------------------------------------
  // Main init
  // -------------------------------------------------------------------------

  window.initOfficerReportPage = async function (currentUser) {
    const view = document.getElementById('officer-reportView');
    if (!view) return;

    document.getElementById('pageTitle').textContent = 'Officer Reports';
    injectPrintStyle();

    // Scaffold the page structure
    view.innerHTML = `
      <div class="page-header no-print">
        <h1><i class="fas fa-file-alt"></i> Officer Detail Report</h1>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="rptPrintBtn" class="btn btn-primary no-print" type="button">
            <i class="fas fa-file-pdf"></i> Download PDF
          </button>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="dashboard-card no-print" id="rptFilterBar" style="margin-bottom:16px;">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
          <div>
            <label style="display:block;font-size:12px;color:#667085;margin-bottom:4px;">Officer</label>
            <select id="rptOfficerSelect" class="form-control" style="min-width:220px;">
              <option value="">Loading officers…</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:12px;color:#667085;margin-bottom:4px;">From</label>
            <input type="date" id="rptFromDate" class="form-control" style="width:160px;" />
          </div>
          <div>
            <label style="display:block;font-size:12px;color:#667085;margin-bottom:4px;">To</label>
            <input type="date" id="rptToDate" class="form-control" style="width:160px;" />
          </div>
          <button id="rptGenerateBtn" class="btn btn-primary" type="button">
            <i class="fas fa-chart-bar"></i> Generate Report
          </button>
        </div>
        <div id="rptError" style="color:#dc2626;margin-top:8px;font-size:13px;display:none;"></div>
      </div>

      <!-- Report output -->
      <div id="rptOutput"></div>
    `;

    // Default dates: first of this month → today
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const fmt = d => d.toISOString().slice(0, 10);
    document.getElementById('rptFromDate').value = fmt(firstOfMonth);
    document.getElementById('rptToDate').value   = fmt(today);

    // Load officer list
    try {
      const { officers } = await edgeFetch('officers');
      const sel = document.getElementById('rptOfficerSelect');
      sel.innerHTML = '<option value="">— Select officer —</option>' +
        officers.map(o => `<option value="${o.id}">${esc(o.name)} (${esc(o.role || o.email)})</option>`).join('');
    } catch (err) {
      const sel = document.getElementById('rptOfficerSelect');
      sel.innerHTML = '<option value="">Failed to load officers</option>';
      console.error('[OfficerReport] officer list error:', err);
    }

    // Wire Generate button
    document.getElementById('rptGenerateBtn').onclick = generateReport;
    document.getElementById('rptPrintBtn').onclick = async () => {
      const output = document.getElementById('rptOutput');
      if (!output || !output.innerHTML.trim()) {
        alert('Please generate a report first.');
        return;
      }

      // Expand all collapsed sections so they appear in the PDF
      document.querySelectorAll('[id^="rptBody_"]').forEach(el => {
        el.style.display = 'block';
      });

      const btn = document.getElementById('rptPrintBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating…';

      try {
        const canvas = await html2canvas(output, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#f9fafb',
          logging: false,
          windowWidth: output.scrollWidth,
          scrollX: 0,
          scrollY: 0
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageWidth  = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const contentWidth = pageWidth - margin * 2;
        const imgHeight = (canvas.height * contentWidth) / canvas.width;

        let y = margin;
        let heightLeft = imgHeight;
        let firstPage = true;

        while (heightLeft > 0) {
          if (!firstPage) { pdf.addPage(); y = margin; }
          pdf.addImage(imgData, 'JPEG', margin, y, contentWidth, imgHeight);
          heightLeft -= (pageHeight - margin * 2);
          y -= (pageHeight - margin * 2);
          firstPage = false;
        }

        const officerText = document.getElementById('rptOfficerSelect').selectedOptions[0]?.text || 'officer';
        const safeName = officerText.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').toLowerCase();
        const from = document.getElementById('rptFromDate').value;
        const to   = document.getElementById('rptToDate').value;
        pdf.save(`officer-report_${safeName}_${from}_to_${to}.pdf`);
      } catch (err) {
        console.error('[OfficerReport] PDF generation error:', err);
        alert('Failed to generate PDF: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-file-pdf"></i> Download PDF';
      }
    };
  };

  async function generateReport() {
    const officerId = document.getElementById('rptOfficerSelect').value;
    const from      = document.getElementById('rptFromDate').value;
    const to        = document.getElementById('rptToDate').value;
    const errEl     = document.getElementById('rptError');
    const output    = document.getElementById('rptOutput');

    errEl.style.display = 'none';

    if (!officerId) { showErr('Please select an officer.'); return; }
    if (!from || !to) { showErr('Please set both From and To dates.'); return; }
    if (from > to)    { showErr('"From" must not be after "To".'); return; }

    // Loading state
    const btn = document.getElementById('rptGenerateBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating…';
    output.innerHTML = '<div class="dashboard-card" style="padding:24px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><p style="margin-top:12px;">Loading report…</p></div>';

    try {
      const data = await edgeFetch(`report?officerId=${encodeURIComponent(officerId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      renderReport(data, from, to);
    } catch (err) {
      showErr(err.message || 'Failed to load report.');
      output.innerHTML = '';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-chart-bar"></i> Generate Report';
    }
  }

  function showErr(msg) {
    const el = document.getElementById('rptError');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function renderReport(data, from, to) {
    const output = document.getElementById('rptOutput');
    const s = data.summary;

    const officerNameDisplay = esc(data.officerName || '—');
    const dateRange = `${fmtDate(from)} – ${fmtDate(to)}`;

    output.innerHTML = `
      <!-- Report header (visible in print) -->
      <div class="dashboard-card" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:20px;font-weight:800;color:#1f2937;">${officerNameDisplay}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;"><i class="fas fa-calendar-alt"></i> ${dateRange}</div>
        </div>
        <div style="font-size:28px;font-weight:900;color:#7c3aed;">${s.totalXp} XP</div>
      </div>

      <!-- Summary cards -->
      ${renderSummaryCards(s)}

      <!-- Sections -->
      ${section('attendance',    'fas fa-calendar-check',       `Attendance (${s.attendanceDays} days)`,          s.attendanceDays,    renderAttendance(data.attendance))}
      ${section('leadsAssigned', 'fas fa-users',                `Leads Assigned (${s.leadsAssigned})`,            s.leadsAssigned,     renderLeadsAssigned(data.leadsAssigned))}
      ${section('contacted',     'fas fa-phone',                `Leads Contacted (${s.leadsContacted})`,          s.leadsContacted,    renderLeadsContacted(data.leadsContacted))}
      ${section('followups',     'fas fa-tasks',                `Follow-ups (${s.followups})`,                    s.followups,         renderFollowups(data.followups))}
      ${section('overdue',       'fas fa-exclamation-circle',   `Overdue Follow-ups (${s.overdueFollowups})`,     s.overdueFollowups,  renderOverdueFollowups(data.overdueFollowups))}
      ${section('contacts',      'fas fa-address-book',         `Contacts Saved (${s.contactsSaved})`,            s.contactsSaved,     renderContacts(data.contactsSaved))}
      ${section('dailyReports',  'fas fa-clipboard-list',       `Daily Reports (${s.dailyReports})`,              s.dailyReports,      renderDailyReports(data.dailyReports))}
      ${section('registrations', 'fas fa-clipboard-check',      `Registrations (${s.registrations})`,             s.registrations,     renderRegistrations(data.registrations))}
      ${section('enrollments',   'fas fa-user-graduate',        `Enrollments (${s.enrollments})`,                 s.enrollments,       renderEnrollments(data.enrollments))}
      ${section('demoSessions',  'fas fa-chalkboard-teacher',   `Demo Sessions (${s.demoSessions})`,              s.demoSessions,      renderDemoSessions(data.demoSessions))}
    `;
  }

})();
