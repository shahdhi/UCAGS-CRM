// UI Helper Functions
const UI = {
    // Show/hide elements
    show(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.classList.add('active');
    },

    hide(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.classList.remove('active');
    },

    // Toast notifications
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 10px;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}" style="margin-top: 2px; flex-shrink: 0;"></i>
                <span style="flex: 1; line-height: 1.5;">${message}</span>
            </div>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    // Format date
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    // Format datetime
    formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Get status badge HTML
    getStatusBadge(status) {
        const statusClass = status.toLowerCase().replace('-', '-');
        return `<span class="status-badge status-${statusClass}">${status}</span>`;
    },

    // Render recent enquiries
    renderRecentEnquiries(enquiries) {
        const container = document.getElementById('recentEnquiries');
        
        if (enquiries.length === 0) {
            container.innerHTML = '<p class="loading">No recent enquiries</p>';
            return;
        }

        container.innerHTML = enquiries.map(e => `
            <div class="recent-item">
                <h4>${e.fullName}</h4>
                <p><i class="fas fa-envelope"></i> ${e.email}</p>
                <p><i class="fas fa-phone"></i> ${e.phone || 'N/A'}</p>
                <p><i class="fas fa-book"></i> ${e.course || 'N/A'}</p>
                <p><i class="fas fa-calendar"></i> ${this.formatDate(e.createdDate)}</p>
                ${this.getStatusBadge(e.status)}
            </div>
        `).join('');
    },

    // Render upcoming follow-ups
    renderUpcomingFollowUps(followUps) {
        const container = document.getElementById('upcomingFollowUps');
        
        if (followUps.length === 0) {
            container.innerHTML = '<p class="loading">No upcoming follow-ups</p>';
            return;
        }

        container.innerHTML = followUps.map(e => `
            <div class="followup-item">
                <h4>${e.fullName}</h4>
                <p><i class="fas fa-clock"></i> ${this.formatDate(e.followUpDate)}</p>
                <p><i class="fas fa-envelope"></i> ${e.email}</p>
                <p><i class="fas fa-phone"></i> ${e.phone || 'N/A'}</p>
                ${this.getStatusBadge(e.status)}
            </div>
        `).join('');
    },

    // Render enquiries table
    renderEnquiriesTable(enquiries) {
        const tbody = document.getElementById('enquiriesTableBody');
        
        if (enquiries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">No enquiries found</td></tr>';
            return;
        }

        tbody.innerHTML = enquiries.map(e => `
            <tr>
                <td>${e.enquiryId}</td>
                <td>${e.fullName}</td>
                <td>${e.email}</td>
                <td>
                    ${e.phone ? `<a href="tel:${e.phone}">${e.phone}</a>` : 'N/A'}
                </td>
                <td>${e.course || 'N/A'}</td>
                <td>${this.getStatusBadge(e.status)}</td>
                <td>${e.assignedOfficer || 'Unassigned'}</td>
                <td>${this.formatDate(e.createdDate)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-primary" onclick="viewEnquiry('${e.enquiryId}')" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn btn-success" onclick="sendEmail('${e.enquiryId}')" title="Send Email">
                            <i class="fas fa-envelope"></i>
                        </button>
                        ${e.phone ? `<button class="action-btn btn-warning" onclick="makeCall('${e.phone}')" title="Call">
                            <i class="fas fa-phone"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    },

    // Render calendar lists
    // Legacy enquiry follow-up list renderer
    renderCalendarLists(overdue, upcoming) {
        const overdueList = document.getElementById('overdueList');
        const upcomingList = document.getElementById('upcomingList');

        if (overdue.length === 0) {
            overdueList.innerHTML = '<p class="loading">No overdue follow-ups</p>';
        } else {
            overdueList.innerHTML = overdue.map(e => `
                <div class="followup-item" style="border-left-color: #dc3545;">
                    <h4>${e.fullName}</h4>
                    <p><i class="fas fa-clock"></i> ${this.formatDate(e.followUpDate)} (Overdue)</p>
                    <p><i class="fas fa-envelope"></i> ${e.email}</p>
                    <p><i class="fas fa-phone"></i> ${e.phone || 'N/A'}</p>
                    ${this.getStatusBadge(e.status)}
                    <div style="margin-top: 10px;">
                        <button class="btn btn-primary" onclick="viewEnquiry('${e.enquiryId}')" style="padding: 6px 12px; font-size: 12px;">
                            <i class="fas fa-eye"></i> View
                        </button>
                    </div>
                </div>
            `).join('');
        }

        if (upcoming.length === 0) {
            upcomingList.innerHTML = '<p class="loading">No upcoming follow-ups</p>';
        } else {
            upcomingList.innerHTML = upcoming.map(e => `
                <div class="followup-item">
                    <h4>${e.fullName}</h4>
                    <p><i class="fas fa-clock"></i> ${this.formatDate(e.followUpDate)}</p>
                    <p><i class="fas fa-envelope"></i> ${e.email}</p>
                    <p><i class="fas fa-phone"></i> ${e.phone || 'N/A'}</p>
                    ${this.getStatusBadge(e.status)}
                    <div style="margin-top: 10px;">
                        <button class="btn btn-primary" onclick="viewEnquiry('${e.enquiryId}')" style="padding: 6px 12px; font-size: 12px;">
                            <i class="fas fa-eye"></i> View
                        </button>
                    </div>
                </div>
            `).join('');
        }
    },

    // Render lead follow-up calendar (new batch/officer leads system)
    renderFollowUpCalendar(overdue, upcoming) {
        // Store events for month grid + day view
        const all = [...(overdue || []), ...(upcoming || [])];
        window.__followupCalendarState = window.__followupCalendarState || {};
        window.__followupCalendarState.events = { overdue: overdue || [], upcoming: upcoming || [], all };

        // Setup collapsible headers
        const setupCollapse = (headerId, listId, chevronId) => {
            const header = document.getElementById(headerId);
            const list = document.getElementById(listId);
            const chev = document.getElementById(chevronId);
            if (!header || !list) return;

            if (!header.__bound) {
                header.addEventListener('click', () => {
                    const open = list.style.display !== 'none';
                    list.style.display = open ? 'none' : 'block';
                    if (chev) chev.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
                });
                header.__bound = true;
            }
        };
        setupCollapse('overdueHeader', 'overdueList', 'overdueChevron');
        setupCollapse('upcomingHeader', 'upcomingList', 'upcomingChevron');

        const escape = (s) => {
            const div = document.createElement('div');
            div.textContent = String(s || '');
            return div.innerHTML;
        };

        const renderItem = (e, isOverdue) => {
            const title = `${e.full_name || '-'} ${e.phone ? '(' + e.phone + ')' : ''}`;
            const subtitle = `${e.batchName} / ${e.sheetName} / ${e.officerName} / FU${e.followUpNo}`;
            const comment = e.comment ? `<div style="color:#555; margin-top:6px; font-size:12px;">${escape(e.comment)}</div>` : '';

            return `
              <div class="followup-item" style="border-left-color: ${isOverdue ? '#dc3545' : '#1976d2'};">
                <h4>${escape(title)}</h4>
                <p><i class="fas fa-clock"></i> ${this.formatDateTime(e.date)} ${isOverdue ? '(Overdue)' : ''}</p>
                <p style="font-size:12px; color:#666;"><i class="fas fa-layer-group"></i> ${escape(subtitle)}</p>
                ${comment}
              </div>
            `;
        };

        // Group by date (Today/Tomorrow/others)
        const groupByDay = (arr) => {
            const groups = new Map();
            (arr || []).forEach(e => {
                const key = String(e.date || '').slice(0, 10);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(e);
            });
            const keys = Array.from(groups.keys()).sort();
            return { groups, keys };
        };

        const now = new Date();
        const pad2 = (n) => String(n).padStart(2, '0');
        const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
        const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const tomorrow = `${tomorrowDate.getFullYear()}-${pad2(tomorrowDate.getMonth() + 1)}-${pad2(tomorrowDate.getDate())}`;

        const buildGroupedHtml = (arr, isOverdue) => {
            const { groups, keys } = groupByDay(arr);
            if (keys.length === 0) {
                return `<p class="loading">No ${isOverdue ? 'overdue' : 'upcoming'} follow-ups</p>`;
            }

            const labelFor = (k) => (k === today ? 'Today' : (k === tomorrow ? 'Tomorrow' : k));

            return keys.map(k => {
                const items = groups.get(k) || [];
                return `
                  <div style="margin-bottom: 14px;">
                    <div style="font-weight: 700; color:#444; margin: 10px 0 6px;">${escape(labelFor(k))}</div>
                    ${items.map(e => renderItem(e, isOverdue)).join('')}
                  </div>
                `;
            }).join('');
        };

        const overdueList = document.getElementById('overdueList');
        const upcomingList = document.getElementById('upcomingList');
        if (overdueList) overdueList.innerHTML = buildGroupedHtml(overdue, true);
        if (upcomingList) upcomingList.innerHTML = buildGroupedHtml(upcoming, false);

        // Month grid rendering
        this.renderFollowUpMonthGrid();

        // Default selected day: today
        this.renderFollowUpDay(today);
    },

    renderFollowUpMonthGrid() {
        const grid = document.getElementById('calendarGrid');
        const label = document.getElementById('calendarMonthLabel');
        if (!grid || !label) return;

        window.__followupCalendarState = window.__followupCalendarState || {};
        const state = window.__followupCalendarState;
        const base = state.currentMonth ? new Date(state.currentMonth) : new Date();
        const y = base.getFullYear();
        const m = base.getMonth();

        label.textContent = base.toLocaleString(undefined, { month: 'long', year: 'numeric' });

        const events = state.events?.all || [];
        const countByDay = new Map();
        const overdueByDay = new Map();
        const upcomingByDay = new Map();
        for (const e of events) {
            const day = String(e.date || '').slice(0, 10);
            countByDay.set(day, (countByDay.get(day) || 0) + 1);
            // Determine overdue/upcoming based on original arrays
            // (not perfect but sufficient): presence in overdue/upcoming arrays
        }
        for (const e of (state.events?.overdue || [])) {
            const day = String(e.date || '').slice(0, 10);
            overdueByDay.set(day, (overdueByDay.get(day) || 0) + 1);
        }
        for (const e of (state.events?.upcoming || [])) {
            const day = String(e.date || '').slice(0, 10);
            upcomingByDay.set(day, (upcomingByDay.get(day) || 0) + 1);
        }

        const pad2 = (n) => String(n).padStart(2, '0');
        const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        const first = new Date(y, m, 1);
        const startDow = (first.getDay() + 6) % 7; // make Monday=0
        const start = new Date(y, m, 1 - startDow);

        const dows = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        grid.innerHTML = dows.map(d => `<div class="followup-calendar-dow">${d}</div>`).join('');

        const now = new Date();
        const todayYMD = toYMD(now);

        for (let i = 0; i < 42; i++) {
            const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const ymd = toYMD(day);
            const inMonth = day.getMonth() === m;
            const selected = state.selectedDay === ymd;

            const overdueCount = overdueByDay.get(ymd) || 0;
            const upcomingCount = upcomingByDay.get(ymd) || 0;

            const badges = `
              <div class="followup-calendar-badges">
                ${overdueCount ? `<span class="followup-calendar-badge overdue">${overdueCount}</span>` : ''}
                ${upcomingCount ? `<span class="followup-calendar-badge upcoming">${upcomingCount}</span>` : ''}
              </div>
            `;

            const cell = document.createElement('div');
            cell.className = `followup-calendar-cell ${inMonth ? '' : 'muted'} ${selected ? 'selected' : ''}`;
            cell.innerHTML = `
              <div class="followup-calendar-daynum">${day.getDate()}</div>
              ${badges}
              ${ymd === todayYMD ? `<div style="margin-top: 8px; font-size:11px; color:#7C3AED; font-weight:700;">Today</div>` : ''}
            `;

            cell.addEventListener('click', () => {
                state.selectedDay = ymd;
                this.renderFollowUpMonthGrid();
                this.renderFollowUpDay(ymd);
            });

            grid.appendChild(cell);
        }

        // Bind month nav buttons once
        const prev = document.getElementById('calendarPrevMonthBtn');
        const next = document.getElementById('calendarNextMonthBtn');
        const todayBtn = document.getElementById('calendarTodayBtn');

        if (prev && !prev.__bound) {
            prev.addEventListener('click', () => {
                state.currentMonth = new Date(y, m - 1, 1).toISOString();
                this.renderFollowUpMonthGrid();
            });
            prev.__bound = true;
        }
        if (next && !next.__bound) {
            next.addEventListener('click', () => {
                state.currentMonth = new Date(y, m + 1, 1).toISOString();
                this.renderFollowUpMonthGrid();
            });
            next.__bound = true;
        }
        if (todayBtn && !todayBtn.__bound) {
            todayBtn.addEventListener('click', () => {
                state.currentMonth = new Date().toISOString();
                state.selectedDay = todayYMD;
                this.renderFollowUpMonthGrid();
                this.renderFollowUpDay(todayYMD);
            });
            todayBtn.__bound = true;
        }
    },

    renderFollowUpDay(ymd) {
        const titleEl = document.getElementById('calendarSelectedDayTitle');
        const listEl = document.getElementById('calendarSelectedDayEvents');
        if (!titleEl || !listEl) return;

        window.__followupCalendarState = window.__followupCalendarState || {};
        const state = window.__followupCalendarState;
        state.selectedDay = ymd;

        titleEl.textContent = `Follow-ups for ${ymd}`;

        const events = state.events?.all || [];
        const dayEvents = events.filter(e => String(e.date || '').slice(0, 10) === ymd)
          .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

        if (dayEvents.length === 0) {
            listEl.innerHTML = '<p class="loading">No follow-ups for this day.</p>';
            return;
        }

        const escape = (s) => {
            const div = document.createElement('div');
            div.textContent = String(s || '');
            return div.innerHTML;
        };

        listEl.innerHTML = dayEvents.map(e => {
            const title = `${e.full_name || '-'} ${e.phone ? '(' + e.phone + ')' : ''}`;
            const subtitle = `${e.batchName} / ${e.sheetName} / ${e.officerName} / FU${e.followUpNo}`;
            const comment = e.comment ? `<div style="color:#555; margin-top:6px; font-size:12px;">${escape(e.comment)}</div>` : '';
            return `
              <div class="followup-item">
                <h4>${escape(title)}</h4>
                <p><i class="fas fa-clock"></i> ${this.formatDateTime(e.date)}</p>
                <p style="font-size:12px; color:#666;"><i class="fas fa-layer-group"></i> ${escape(subtitle)}</p>
                ${comment}
              </div>
            `;
        }).join('');
    },

    formatDateTime(dateString) {
        if (!dateString) return '-';
        // Accept both YYYY-MM-DD and datetime-local YYYY-MM-DDTHH:mm
        const d = new Date(dateString);
        if (!isNaN(d)) return d.toLocaleString();
        return dateString;
    },

    // Render officer stats
    renderOfficerStats(officerStats) {
        const container = document.getElementById('officersStats');
        
        if (!officerStats || officerStats.length === 0) {
            container.innerHTML = '<p class="loading">No officer data available</p>';
            return;
        }

        container.innerHTML = officerStats.map(officer => `
            <div class="officer-card">
                <h3>${officer.name}</h3>
                <p><i class="fas fa-user"></i> ${officer.username}</p>
                <p><i class="fas fa-envelope"></i> ${officer.email || 'N/A'}</p>
                <div class="officer-stats-grid">
                    <div class="officer-stat">
                        <h4>${officer.totalEnquiries}</h4>
                        <p>Total</p>
                    </div>
                    <div class="officer-stat">
                        <h4>${officer.new}</h4>
                        <p>New</p>
                    </div>
                    <div class="officer-stat">
                        <h4>${officer.contacted}</h4>
                        <p>Contacted</p>
                    </div>
                    <div class="officer-stat">
                        <h4>${officer.followUp}</h4>
                        <p>Follow-up</p>
                    </div>
                    <div class="officer-stat">
                        <h4>${officer.registered}</h4>
                        <p>Registered</p>
                    </div>
                    <div class="officer-stat">
                        <h4>${officer.closed}</h4>
                        <p>Closed</p>
                    </div>
                </div>
            </div>
        `).join('');
    },

    // Render officer performance on dashboard
    renderOfficerPerformance(officerStats) {
        const container = document.getElementById('officerPerformance');
        
        if (!officerStats) {
            container.innerHTML = '<p class="loading">Officer performance data not available</p>';
            return;
        }

        const officers = Object.entries(officerStats);
        
        if (officers.length === 0) {
            container.innerHTML = '<p class="loading">No officers assigned yet</p>';
            return;
        }

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Officer</th>
                        <th>Total</th>
                        <th>New</th>
                        <th>Contacted</th>
                        <th>Follow-up</th>
                        <th>Registered</th>
                        <th>Closed</th>
                    </tr>
                </thead>
                <tbody>
                    ${officers.map(([name, stats]) => `
                        <tr>
                            <td><strong>${name}</strong></td>
                            <td>${stats.total}</td>
                            <td>${stats.new || 0}</td>
                            <td>${stats.contacted || 0}</td>
                            <td>${stats.followup || stats.followUp || 0}</td>
                            <td>${stats.registered || 0}</td>
                            <td>${stats.closed || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    // Render leads table
    renderLeadsTable(leads) {
        const tbody = document.getElementById('leadsTableBody');
        
        if (leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading">No leads found</td></tr>';
            return;
        }

        tbody.innerHTML = leads.map(lead => `
            <tr>
                <td>${lead.enquiryId}</td>
                <td>${lead.fullName}</td>
                <td>${lead.email}</td>
                <td>
                    ${lead.phone ? `<a href="tel:${lead.phone}">${lead.phone}</a>` : 'N/A'}
                </td>
                <td>${lead.course || 'N/A'}</td>
                <td>${lead.source || 'N/A'}</td>
                <td>${this.getStatusBadge(lead.status)}</td>
                <td>${lead.assignedOfficer || 'Unassigned'}</td>
                <td>${this.formatDate(lead.createdDate)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-primary" onclick="viewEnquiry('${lead.enquiryId}')" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn btn-success" onclick="sendEmail('${lead.enquiryId}')" title="Send Email">
                            <i class="fas fa-envelope"></i>
                        </button>
                        ${lead.phone ? `<button class="action-btn btn-warning" onclick="makeCall('${lead.phone}')" title="Call">
                            <i class="fas fa-phone"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }
};

// Modal functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Make modal functions globally accessible
window.openModal = openModal;
window.closeModal = closeModal;

// Action functions (to be implemented in app.js)
function viewEnquiry(enquiryId) {
    window.viewEnquiryDetails(enquiryId);
}

function sendEmail(enquiryId) {
    window.showEmailOptions(enquiryId);
}

function makeCall(phone) {
    window.location.href = `tel:${phone}`;
}
