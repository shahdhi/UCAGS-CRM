// API Helper Functions
const API = {
    baseUrl: '/api',

    // Generic request handler
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // Authentication
    auth: {
        async login(username, password) {
            return API.request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
        },

        async logout() {
            return API.request('/auth/logout', {
                method: 'POST'
            });
        },

        async getCurrentUser() {
            return API.request('/auth/me');
        }
    },

    // Enquiries
    enquiries: {
        async getAll(filters = {}) {
            const params = new URLSearchParams(filters);
            return API.request(`/enquiries?${params}`);
        },

        async getById(id) {
            return API.request(`/enquiries/${id}`);
        },

        async create(enquiryData) {
            return API.request('/enquiries', {
                method: 'POST',
                body: JSON.stringify(enquiryData)
            });
        },

        async update(id, updates) {
            return API.request(`/enquiries/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
        },

        async addNote(id, note) {
            return API.request(`/enquiries/${id}/notes`, {
                method: 'POST',
                body: JSON.stringify({ note })
            });
        }
    },

    // Dashboard
    dashboard: {
        async getStats() {
            return API.request('/dashboard/stats');
        },

        async getRecent(limit = 10) {
            return API.request(`/dashboard/recent?limit=${limit}`);
        },

        async getFollowUps() {
            return API.request('/dashboard/follow-ups');
        },

        async getAnalytics({ from = '', to = '' } = {}) {
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            const qs = params.toString();
            // Migrated to Supabase Edge Function — runs close to DB, no Vercel CPU
            const ANALYTICS_EDGE = 'https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/crm-analytics';
            const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkZGF4aXd5c3p5bmp5cml6a21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDA3OTUsImV4cCI6MjA4NTE3Njc5NX0.imH4CCqt1fBwGek3ku1LTsq99YCfW4ZJQDwhw-0BD_Q';
            const session = window._supabaseSession || (await window.supabaseClient?.auth?.getSession())?.data?.session;
            const token = session?.access_token || '';
            const res = await fetch(`${ANALYTICS_EDGE}${qs ? `?${qs}` : ''}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'apikey': ANON_KEY }
            });
            return res.json();
        },

        // Admin-only: enrollments per officer for current batch
        async getEnrollmentRankings() {
            return API.request('/dashboard/enrollment-rankings');
        }
    },

    // Officers
    officers: {
        async getAll() {
            return API.request('/officers');
        },

        async getStats() {
            return API.request('/officers/stats');
        }
    },

    // Email
    email: {
        async sendAcknowledgement(enquiryId) {
            return API.request('/email/acknowledgement', {
                method: 'POST',
                body: JSON.stringify({ enquiryId })
            });
        },

        async sendFollowUp(enquiryId) {
            return API.request('/email/follow-up', {
                method: 'POST',
                body: JSON.stringify({ enquiryId })
            });
        },

        async sendRegistration(enquiryId) {
            return API.request('/email/registration', {
                method: 'POST',
                body: JSON.stringify({ enquiryId })
            });
        },

        async sendCustom(enquiryId, subject, message) {
            return API.request('/email/custom', {
                method: 'POST',
                body: JSON.stringify({ enquiryId, subject, message })
            });
        }
    },

    // Calendar
    calendar: {
        async createFollowUp(enquiryId, followUpDate, notes) {
            return API.request('/calendar/follow-up', {
                method: 'POST',
                body: JSON.stringify({ enquiryId, followUpDate, notes })
            });
        },

        async getUpcoming(days = 7) {
            return API.request(`/calendar/upcoming?days=${days}`);
        }
    },

    // Calls
    call: {
        async getStatus() {
            return API.request('/call/status');
        },

        async initiate(to, enquiryId) {
            return API.request('/call/initiate', {
                method: 'POST',
                body: JSON.stringify({ to, enquiryId })
            });
        },

        async log(enquiryId, duration, notes) {
            return API.request('/call/log', {
                method: 'POST',
                body: JSON.stringify({ enquiryId, duration, notes })
            });
        }
    },

    // Leads
    leads: {
        async getAll(filters = {}) {
            const params = new URLSearchParams(filters);
            return API.request(`/leads?${params}`);
        }
    }
};
