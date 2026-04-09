/**
 * API Service
 * Centralized service for making API calls
 */

const API_BASE = '/api';

// Supabase Edge Function base URL for crm-leads routes
// All /crm-leads/* calls go directly to the edge function, bypassing Vercel.
const EDGE_BASE = 'https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/crm-leads';

// Supabase Edge Function base URL for crm-notifications routes
const EDGE_BASE_NOTIFICATIONS = 'https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/crm-notifications';

// Supabase Edge Function base URL for crm-registrations routes
const EDGE_BASE_REGISTRATIONS = 'https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/crm-registrations';

// Supabase Edge Function base URL for crm-reports routes
const EDGE_BASE_REPORTS = 'https://xddaxiwyszynjyrizkmc.supabase.co/functions/v1/crm-reports';

const EDGE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkZGF4aXd5c3p5bmp5cml6a21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDA3OTUsImV4cCI6MjA4NTE3Njc5NX0.imH4CCqt1fBwGek3ku1LTsq99YCfW4ZJQDwhw-0BD_Q';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchAPI(endpoint, options = {}) {
  try {
    // Get Supabase session token
    let authHeaders = {};
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session && session.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }
    }

    // Route /crm-leads/* directly to the Supabase Edge Function
    let fullUrl;
    let extraHeaders = {};
    if (endpoint.startsWith('/crm-leads/') || endpoint === '/crm-leads') {
      const suffix = endpoint.replace(/^\/crm-leads\/?/, '');
      fullUrl = suffix ? `${EDGE_BASE}/${suffix}` : EDGE_BASE;
      // Supabase gateway requires the anon key as the apikey header
      extraHeaders['apikey'] = EDGE_ANON_KEY;
    } else if (endpoint.startsWith('/notifications/') || endpoint === '/notifications') {
      // Route all /notifications/* directly to the Supabase Edge Function
      const suffix = endpoint.replace(/^\/notifications\/?/, '');
      fullUrl = suffix ? `${EDGE_BASE_NOTIFICATIONS}/${suffix}` : EDGE_BASE_NOTIFICATIONS;
      extraHeaders['apikey'] = EDGE_ANON_KEY;
    } else if (endpoint.startsWith('/registrations/') || endpoint === '/registrations') {
      // Route all /registrations/* directly to the Supabase Edge Function
      // Exception: /registrations/admin/export-sheet stays on Express (needs Google Sheets)
      const suffix = endpoint.replace(/^\/registrations\/?/, '');
      if (suffix === 'admin/export-sheet') {
        // Keep on Express backend — requires Google Sheets API
        fullUrl = `${API_BASE}${endpoint}`;
      } else {
        fullUrl = suffix ? `${EDGE_BASE_REGISTRATIONS}/${suffix}` : EDGE_BASE_REGISTRATIONS;
        extraHeaders['apikey'] = EDGE_ANON_KEY;
      }
    } else if (endpoint.startsWith('/reports/') || endpoint === '/reports') {
      // Route all /reports/* directly to the Supabase Edge Function (crm-reports)
      const suffix = endpoint.replace(/^\/reports\/?/, '');
      fullUrl = suffix ? `${EDGE_BASE_REPORTS}/${suffix}` : EDGE_BASE_REPORTS;
      extraHeaders['apikey'] = EDGE_ANON_KEY;
    } else {
      fullUrl = `${API_BASE}${endpoint}`;
    }

    const response = await fetch(fullUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...extraHeaders,
        ...options.headers
      },
      ...options
    });

    const contentType = response.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // If the backend returned HTML (often means API route not reached), throw a clearer error
      const text = await response.text();
      throw new Error(`API returned non-JSON response for ${fullUrl} (status ${response.status}). Check API routing/auth. Body starts: ${text.slice(0, 60)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Leads API
 */
const leadsAPI = {
  /**
   * Get all leads (Supabase-backed)
   * @param {Object} filters - Optional filters (status, search, batch)
   */
  getAll: async (filters = {}) => {
    const batch = filters.batch;

    // If logged-in user is an officer (not admin), default to "my leads"
    if (window.currentUser && window.currentUser.role && window.currentUser.role !== 'admin') {
      return leadsAPI.getMyLeads(filters);
    }

    // Admin impersonating officer - use admin endpoint with assignedTo filter
    const viewingAsName = window.currentUser?.viewingAs?.name || null;
    
    // Use new Supabase-backed endpoint for admin
    if (batch && batch !== 'all' && batch !== 'myLeads') {
      const params = new URLSearchParams();
      params.append('batch', batch);
      if (filters.sheet) params.append('sheet', filters.sheet);
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      // Pass programId to scope batch_name to the correct program
      if (filters.programId) params.append('programId', filters.programId);
      // When impersonating an officer, filter to that officer's leads
      if (viewingAsName) params.append('assignedTo', viewingAsName);
      
      console.log('📊 Loading leads from Supabase:', `/crm-leads/admin?${params.toString()}`);
      return fetchAPI(`/crm-leads/admin?${params.toString()}`);
    }
    
    // Aggregate all batches using Supabase
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    if (filters.programId) params.append('programId', filters.programId);
    // When impersonating an officer, filter to that officer's leads
    if (viewingAsName) params.append('assignedTo', viewingAsName);
    
    console.log('📊 Loading all leads from Supabase:', `/crm-leads/admin?${params.toString()}`);
    return fetchAPI(`/crm-leads/admin?${params.toString()}`);
  },

  /**
   * Get my leads (officer leads from Supabase)
   * @param {Object} filters - Optional filters (batch, sheet, status, search)
   */
  getMyLeads: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.batch) params.append('batch', filters.batch);
    if (filters.sheet) params.append('sheet', filters.sheet);
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    // Pass programId to scope batch_name to the correct program
    if (filters.programId) params.append('programId', filters.programId);
    
    // If admin is impersonating an officer, they need the officer endpoint with their name
    const viewingAsName = window.currentUser?.viewingAs?.name;
    if (viewingAsName) {
      // Pass the viewing-as officer name so backend can filter to their leads
      params.append('viewingAs', viewingAsName);
    }
    
    return fetchAPI(`/crm-leads/my?${params.toString()}`);
  },

  /**
   * Update my lead management (officer)
   * @param {string} batchName - Batch name
   * @param {string} sheetName - Sheet name
   * @param {string} leadId - Lead ID
   * @param {Object} updates - Management updates
   */
  updateMyLead: async (batchName, sheetName, leadId, updates) => {
    return fetchAPI(`/crm-leads/my/${encodeURIComponent(batchName)}/${encodeURIComponent(sheetName)}/${encodeURIComponent(leadId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Update lead (admin)
   * @param {string} batchName - Batch name
   * @param {string} sheetName - Sheet name
   * @param {string} leadId - Lead ID
   * @param {Object} updates - Fields to update
   */
  update: async (batchName, sheetName, leadId, updates) => {
    // Handle legacy format: update(leadId, updates, batch) - detect by argument count/type
    if (typeof batchName === 'number' || typeof batchName === 'string') {
      // Legacy format: update(leadId, updates, batch)
      const id = batchName;
      const upd = sheetName; // actually updates
      const batch = leadId; // actually batch
      // For legacy format, we need to infer sheet from window.adminSheetFilter
      const sheet = window.adminSheetFilter || 'Main Leads';
      return fetchAPI(`/crm-leads/admin/${encodeURIComponent(batch)}/${encodeURIComponent(sheet)}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(upd)
      });
    }
    
    // New format: update(batchName, sheetName, leadId, updates)
    return fetchAPI(`/crm-leads/admin/${encodeURIComponent(batchName)}/${encodeURIComponent(sheetName)}/${encodeURIComponent(leadId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Delete lead
   * @param {number} id - Lead ID
   */
  delete: async (id) => {
    return fetchAPI(`/leads/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * Update admin lead (Supabase)
   */
  updateAdminLead: async (batchName, sheetName, leadId, updates) => {
    return fetchAPI(`/crm-leads/admin/${encodeURIComponent(batchName)}/${encodeURIComponent(sheetName)}/${encodeURIComponent(leadId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Get all available batches
   */
  getBatches: async () => {
    return fetchAPI('/batch-leads/batches');
  },

  /**
   * Create new lead (admin)
   */
  create: async ({ batchName, sheetName, lead }) => {
    return fetchAPI('/crm-leads/admin/create', {
      method: 'POST',
      body: JSON.stringify({ batchName, sheetName, lead })
    });
  },

  /**
   * Create new lead (officer - My Leads)
   */
  createMy: async ({ batchName, sheetName, lead }) => {
    return fetchAPI('/crm-leads/my/create', {
      method: 'POST',
      body: JSON.stringify({ batchName, sheetName, lead })
    });
  },

  /**
   * Copy lead to another batch/sheet (admin)
   */
  copyAdmin: async ({ source, target }) => {
    return fetchAPI('/crm-leads/admin/copy', {
      method: 'POST',
      body: JSON.stringify({ source, target })
    });
  },

  /**
   * Copy lead to another batch/sheet (officer)
   */
  copyMy: async ({ source, target }) => {
    return fetchAPI('/crm-leads/my/copy', {
      method: 'POST',
      body: JSON.stringify({ source, target })
    });
  },

  /**
   * Bulk copy leads (admin)
   */
  copyAdminBulk: async ({ sources, target }) => {
    return fetchAPI('/crm-leads/admin/copy-bulk', {
      method: 'POST',
      body: JSON.stringify({ sources, target })
    });
  },

  /**
   * Bulk copy leads (officer)
   */
  copyMyBulk: async ({ sources, target }) => {
    return fetchAPI('/crm-leads/my/copy-bulk', {
      method: 'POST',
      body: JSON.stringify({ sources, target })
    });
  },

  /**
   * Distribute all unassigned leads (admin)
   */
  distributeUnassigned: async ({ batchName, sheetName, officers }) => {
    return fetchAPI('/crm-leads/admin/distribute-unassigned', {
      method: 'POST',
      body: JSON.stringify({ batchName, sheetName, officers })
    });
  },

  /**
   * Bulk assign selected leads (admin)
   */
  bulkAssign: async ({ batchName, sheetName, leadIds, assignedTo }) => {
    return fetchAPI('/crm-leads/admin/bulk-assign', {
      method: 'POST',
      body: JSON.stringify({ batchName, sheetName, leadIds, assignedTo })
    });
  },

  /**
   * Bulk distribute selected leads (admin)
   */
  bulkDistribute: async ({ batchName, sheetName, leadIds, officers }) => {
    return fetchAPI('/crm-leads/admin/bulk-distribute', {
      method: 'POST',
      body: JSON.stringify({ batchName, sheetName, leadIds, officers })
    });
  },

  /**
   * Bulk delete selected leads (admin)
   */
  bulkDelete: async ({ batchName, sheetName, leadIds }) => {
    const isAdmin = (window.currentUser && window.currentUser.role === 'admin');
    const path = isAdmin ? '/crm-leads/admin/bulk-delete' : '/crm-leads/my/bulk-delete';
    return fetchAPI(path, {
      method: 'POST',
      body: JSON.stringify({ batchName, sheetName, leadIds })
    });
  },

  /**
   * Export leads as CSV (admin)
   * Points directly at the Supabase Edge Function so the download works without Vercel.
   */
  exportCsvUrl: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.batch) params.append('batch', filters.batch);
    if (filters.sheet) params.append('sheet', filters.sheet);
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    return `${EDGE_BASE}/admin/export.csv?${params.toString()}`;
  },

  /**
   * Import leads from CSV text (admin)
   */
  importCsv: async ({ batchName, sheetName, csvText }) => {
    return fetchAPI('/crm-leads/admin/import', {
      method: 'POST',
      body: JSON.stringify({ batchName, sheetName, csvText })
    });
  },

  /**
   * Get leads statistics
   */
  getStats: async () => {
    return fetchAPI('/leads/stats');
  }
};

/**
 * Dashboard API
 */
/**
 * Registrations API (admin)
 */
const paymentsAPI = {
  coordinatorBatches: async () => {
    return fetchAPI('/programs/coordinator-batches');
  },
  coordinatorSummary: async (limit, { programId = '', batchName = '', status = 'all', type = '' } = {}) => {
    const qs = new URLSearchParams();
    qs.set('limit', String(limit || 200));
    if (programId) qs.set('programId', programId);
    if (batchName) qs.set('batchName', batchName);
    if (status) qs.set('status', status);
    if (type) qs.set('type', type);
    return fetchAPI(`/payments/coordinator/summary?${qs.toString()}`);
  },
  coordinatorListForRegistration: async (registrationId) => {
    return fetchAPI(`/payments/coordinator/registration/${encodeURIComponent(registrationId)}`);
  },
  coordinatorUpdate: async (paymentId, payload) => {
    return fetchAPI(`/payments/coordinator/${encodeURIComponent(paymentId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload || {})
    });
  },

  adminList: async (limit = 200, { programId = '', batchName = '' } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (programId) params.set('programId', String(programId));
    if (batchName) params.set('batchName', String(batchName));
    return fetchAPI(`/payments/admin?${params.toString()}`);
  },
  adminSummary: async (limit = 200, { programId = '', batchName = '', status = 'all', type = '' } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (programId) params.set('programId', String(programId));
    if (batchName) params.set('batchName', String(batchName));
    if (status) params.set('status', String(status));
    if (type) params.set('type', String(type));
    return fetchAPI(`/payments/admin/summary?${params.toString()}`);
  },
  adminUpdate: async (id, patch) => {
    return fetchAPI(`/payments/admin/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
  },
  adminConfirm: async (id) => {
    return fetchAPI(`/payments/admin/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  adminUnconfirm: async (id) => {
    return fetchAPI(`/payments/admin/${encodeURIComponent(id)}/unconfirm`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  adminListForRegistration: async (registrationId) => {
    return fetchAPI(`/payments/admin/registration/${encodeURIComponent(registrationId)}`);
  }
};

const registrationsAPI = {
  adminList: async (limit = 200, { programId = '', batchName = '' } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (programId) params.set('programId', String(programId));
    if (batchName) params.set('batchName', String(batchName));
    return fetchAPI(`/registrations/admin?${params.toString()}`);
  },
  adminDelete: async (id) => {
    if (!id) throw new Error('Missing registration id');
    return fetchAPI(`/registrations/admin/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },
  myList: async (limit = 200, { programId = '', batchName = '' } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (programId) params.set('programId', String(programId));
    if (batchName) params.set('batchName', String(batchName));
    
    // When admin is impersonating an officer, use admin endpoint with assignedTo filter
    const viewingAsName = window.currentUser?.viewingAs?.name;
    if (viewingAsName) {
      params.set('assignedTo', viewingAsName);
      return fetchAPI(`/registrations/admin?${params.toString()}`);
    }
    
    return fetchAPI(`/registrations/my?${params.toString()}`);
  },
  adminAssign: async (id, assignedTo) => {
    if (!id) throw new Error('Missing registration id');
    return fetchAPI(`/registrations/admin/${encodeURIComponent(id)}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ assigned_to: assignedTo })
    });
  },
  addPayment: async (id, payment) => {
    if (!id) throw new Error('Missing registration id');
    return fetchAPI(`/registrations/${encodeURIComponent(id)}/payments`, {
      method: 'POST',
      body: JSON.stringify(payment)
    });
  },
  listPayments: async (id) => {
    if (!id) throw new Error('Missing registration id');
    return fetchAPI(`/registrations/${encodeURIComponent(id)}/payments`);
  },

  deletePayments: async (id) => {
    if (!id) throw new Error('Missing registration id');
    return fetchAPI(`/registrations/${encodeURIComponent(id)}/payments`, {
      method: 'DELETE'
    });
  },

  // Admin: mark registration as enrolled
  adminEnroll: async (id) => {
    if (!id) throw new Error('Missing registration id');
    return fetchAPI(`/registrations/admin/${encodeURIComponent(id)}/enroll`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }
};

const studentsAPI = {
  adminList: async (limit = 200, { search = '' } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (search) params.set('search', String(search));
    return fetchAPI(`/students/admin?${params.toString()}`);
  },

  adminDelete: async (id) => {
    if (!id) throw new Error('Missing student id');
    return fetchAPI(`/students/admin/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }
};

const contactsAPI = {
  bySource: async (sourceType, sourceId) => {
    const params = new URLSearchParams();
    params.set('source_type', String(sourceType || ''));
    params.set('source_id', String(sourceId || ''));
    return fetchAPI(`/contacts/by-source?${params.toString()}`);
  },

  list: async ({ q = '' } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set('q', String(q));
    const qs = params.toString();
    return fetchAPI(`/contacts${qs ? `?${qs}` : ''}`);
  },

  saveFromLead: async (leadId, { programName = '', batchName = '' } = {}) => {
    if (!leadId) throw new Error('Missing lead id');
    return fetchAPI(`/contacts/from-lead/${encodeURIComponent(leadId)}`, {
      method: 'POST',
      body: JSON.stringify({ programName, batchName })
    });
  },

  update: async (id, patch) => {
    if (!id) throw new Error('Missing contact id');
    return fetchAPI(`/contacts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch || {})
    });
  },

  remove: async (id) => {
    if (!id) throw new Error('Missing contact id');
    return fetchAPI(`/contacts/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }
};

const dashboardAPI = {
  /**
   * Get dashboard statistics
   */
  getStats: async () => {
    return fetchAPI('/dashboard/stats');
  },

  /**
   * Admin analytics for Home page
   */
  getAnalytics: async ({ from = '', to = '' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', String(from));
    if (to) params.set('to', String(to));
    const qs = params.toString();
    return fetchAPI(`/dashboard/analytics${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get recent enquiries
   * @param {number} limit - Number of recent items
   */
  getRecent: async (limit = 10) => {
    return fetchAPI(`/dashboard/recent?limit=${limit}`);
  },

  /**
   * Get follow-ups
   */
  getFollowUps: async () => {
    return fetchAPI('/dashboard/follow-ups');
  }
};

/**
 * Authentication API
 */
const usersAPI = {
  officers: async () => {
    return fetchAPI('/users/officers');
  }
};

const authAPI = {
  /**
   * Login user
   * @param {string} username - Username
   * @param {string} password - Password
   */
  login: async (username, password) => {
    return fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  /**
   * Logout user
   */
  logout: async () => {
    return fetchAPI('/auth/logout', {
      method: 'POST'
    });
  },

  /**
   * Get current user
   */
  getCurrentUser: async () => {
    return fetchAPI('/auth/me');
  }
};

/**
 * Enquiries API
 */
const enquiriesAPI = {
  /**
   * Get all enquiries
   * @param {Object} filters - Optional filters (status, search)
   */
  getAll: async (filters = {}) => {
    const params = new URLSearchParams(filters);
    return fetchAPI(`/enquiries?${params}`);
  },

  /**
   * Get enquiry by ID
   * @param {string} id - Enquiry ID
   */
  getById: async (id) => {
    return fetchAPI(`/enquiries/${id}`);
  },

  /**
   * Create new enquiry
   * @param {Object} enquiryData - Enquiry data
   */
  create: async (enquiryData) => {
    return fetchAPI('/enquiries', {
      method: 'POST',
      body: JSON.stringify(enquiryData)
    });
  },

  /**
   * Update enquiry
   * @param {string} id - Enquiry ID
   * @param {Object} updates - Update data
   */
  update: async (id, updates) => {
    return fetchAPI(`/enquiries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Add note to enquiry
   * @param {string} id - Enquiry ID
   * @param {string} note - Note text
   */
  addNote: async (id, note) => {
    return fetchAPI(`/enquiries/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note })
    });
  }
};

/**
 * Officers API
 */
const officersAPI = {
  /**
   * Get all officers
   */
  getAll: async () => {
    return fetchAPI('/officers');
  },

  /**
   * Get officer statistics
   */
  getStats: async () => {
    return fetchAPI('/officers/stats');
  }
};

/**
 * Email API
 */
const emailAPI = {
  /**
   * Send acknowledgement email
   * @param {string} enquiryId - Enquiry ID
   */
  sendAcknowledgement: async (enquiryId) => {
    return fetchAPI('/email/acknowledgement', {
      method: 'POST',
      body: JSON.stringify({ enquiryId })
    });
  },

  /**
   * Send follow-up email
   * @param {string} enquiryId - Enquiry ID
   */
  sendFollowUp: async (enquiryId) => {
    return fetchAPI('/email/follow-up', {
      method: 'POST',
      body: JSON.stringify({ enquiryId })
    });
  },

  /**
   * Send registration email
   * @param {string} enquiryId - Enquiry ID
   */
  sendRegistration: async (enquiryId) => {
    return fetchAPI('/email/registration', {
      method: 'POST',
      body: JSON.stringify({ enquiryId })
    });
  },

  /**
   * Send custom email
   * @param {string} enquiryId - Enquiry ID
   * @param {string} subject - Email subject
   * @param {string} message - Email message
   */
  sendCustom: async (enquiryId, subject, message) => {
    return fetchAPI('/email/custom', {
      method: 'POST',
      body: JSON.stringify({ enquiryId, subject, message })
    });
  }
};

/**
 * Calendar API
 */
/**
 * Attendance API
 */
const attendanceAPI = {
  getMyToday: async () => fetchAPI('/attendance/me/today'),
  getMyCalendar: async (month) => {
    const qs = month ? `?month=${encodeURIComponent(month)}` : '';
    return fetchAPI(`/attendance/me/calendar${qs}`);
  },
  submitLeaveRequest: async ({ date, reason, leaveType }) => {
    return fetchAPI('/attendance/me/leave-requests', {
      method: 'POST',
      body: JSON.stringify({ date, reason, leaveType })
    });
  },
  getMyLeaveRequests: async (params = {}) => {
    const sp = new URLSearchParams(params);
    const qs = sp.toString();
    return fetchAPI(`/attendance/me/leave-requests${qs ? `?${qs}` : ''}`);
  },
  // Admin
  getLeaveRequests: async (params = {}) => {
    const sp = new URLSearchParams(params);
    const qs = sp.toString();
    return fetchAPI(`/attendance/leave-requests${qs ? `?${qs}` : ''}`);
  },
  approveLeaveRequest: async (id, comment) => {
    return fetchAPI(`/attendance/leave-requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    });
  },
  rejectLeaveRequest: async (id, comment) => {
    return fetchAPI(`/attendance/leave-requests/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    });
  },
  // Admin attendance records table
  getRecords: async (params = {}) => {
    const sp = new URLSearchParams(params);
    const qs = sp.toString();
    return fetchAPI(`/attendance/records${qs ? `?${qs}` : ''}`);
  },

  // Admin calendar grid
  adminListOfficers: async () => {
    return fetchAPI('/attendance/admin/officers');
  },
  adminGetOfficerCalendar: async ({ officerName, month }) => {
    const sp = new URLSearchParams();
    if (officerName) sp.set('officerName', String(officerName));
    if (month) sp.set('month', String(month));
    return fetchAPI(`/attendance/admin/calendar?${sp.toString()}`);
  },
  adminSetDayStatus: async ({ officerName, date, status }) => {
    return fetchAPI('/attendance/admin/calendar', {
      method: 'PUT',
      body: JSON.stringify({ officerName, date, status })
    });
  }
};

const calendarAPI = {
  /**
   * Create follow-up event
   * @param {string} enquiryId - Enquiry ID
   * @param {string} followUpDate - Follow-up date
   * @param {string} notes - Notes
   */
  createFollowUp: async (enquiryId, followUpDate, notes) => {
    return fetchAPI('/calendar/follow-up', {
      method: 'POST',
      body: JSON.stringify({ enquiryId, followUpDate, notes })
    });
  },

  /**
   * Get upcoming follow-ups
   * @param {number} days - Number of days
   */
  getUpcoming: async (days = 7) => {
    return fetchAPI(`/calendar/upcoming?days=${days}`);
  },

  // New: follow-up calendar derived from officer lead sheets
  getFollowUpCalendar: async () => {
    return fetchAPI('/calendar/followups');
  },

  // Custom tasks
  getTasks: async () => {
    return fetchAPI('/calendar/tasks');
  },
  createTask: async ({ title, dueAt, notes }) => {
    return fetchAPI('/calendar/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, dueAt, notes })
    });
  },
  deleteTask: async (id) => {
    return fetchAPI(`/calendar/tasks/${id}`, {
      method: 'DELETE'
    });
  }
};

/**
 * Call API
 */
const callAPI = {
  /**
   * Get call status
   */
  getStatus: async () => {
    return fetchAPI('/call/status');
  },

  /**
   * Initiate call
   * @param {string} to - Phone number
   * @param {string} enquiryId - Enquiry ID
   */
  initiate: async (to, enquiryId) => {
    return fetchAPI('/call/initiate', {
      method: 'POST',
      body: JSON.stringify({ to, enquiryId })
    });
  },

  /**
   * Log call
   * @param {string} enquiryId - Enquiry ID
   * @param {number} duration - Call duration
   * @param {string} notes - Notes
   */
  log: async (enquiryId, duration, notes) => {
    return fetchAPI('/call/log', {
      method: 'POST',
      body: JSON.stringify({ enquiryId, duration, notes })
    });
  }
};

/**
 * Health Check API
 */
const googleAPI = {
  status: async () => {
    return fetchAPI('/google/status');
  },
  getConnectUrl: async (returnTo = '/#contacts') => {
    const qs = new URLSearchParams({ returnTo });
    const r = await fetchAPI(`/google/oauth/connect-url?${qs}`);
    if (!r?.url) throw new Error('Missing Google connect url');
    return r.url;
  },
  disconnect: async () => {
    return fetchAPI('/google/disconnect', { method: 'POST' });
  },
  syncContact: async (contactId) => {
    return fetchAPI(`/google/contacts/sync/${encodeURIComponent(contactId)}`, { method: 'POST' });
  },
  syncContacts: async (ids = null) => {
    return fetchAPI('/google/contacts/sync', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {})
    });
  }
};

const healthAPI = {
  check: async () => {
    return fetchAPI('/health');
  }
};

// Export all APIs - compatible with existing code
window.API = {
  users: usersAPI,
  auth: authAPI,
  enquiries: enquiriesAPI,
  leads: leadsAPI,
  registrations: registrationsAPI,
  students: studentsAPI,
  payments: paymentsAPI,
  dashboard: dashboardAPI,
  contacts: contactsAPI,
  google: googleAPI,
  officers: officersAPI,  
  email: emailAPI,
  calendar: calendarAPI,
  attendance: attendanceAPI,
  call: callAPI,
  health: healthAPI
};
