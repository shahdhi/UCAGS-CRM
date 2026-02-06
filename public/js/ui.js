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
