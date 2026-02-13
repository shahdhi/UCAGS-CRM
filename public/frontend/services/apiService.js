/**
 * API Service
 * Centralized service for making API calls
 */

const API_BASE = '/api';

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
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers
      },
      ...options
    });

    const data = await response.json();

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
    
    // Use new Supabase-backed endpoint for admin
    if (batch && batch !== 'all' && batch !== 'myLeads') {
      const params = new URLSearchParams();
      params.append('batch', batch);
      if (filters.sheet) params.append('sheet', filters.sheet);
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      
      console.log('📊 Loading leads from Supabase:', `/crm-leads/admin?${params.toString()}`);
      return fetchAPI(`/crm-leads/admin?${params.toString()}`);
    }
    
    // Aggregate all batches using Supabase
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    
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
   * Get leads statistics
   */
  getStats: async () => {
    return fetchAPI('/leads/stats');
  }
};

/**
 * Dashboard API
 */
const dashboardAPI = {
  /**
   * Get dashboard statistics
   */
  getStats: async () => {
    return fetchAPI('/dashboard/stats');
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
  submitLeaveRequest: async ({ date, reason }) => {
    return fetchAPI('/attendance/me/leave-requests', {
      method: 'POST',
      body: JSON.stringify({ date, reason })
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
const healthAPI = {
  check: async () => {
    return fetchAPI('/health');
  }
};

// Export all APIs - compatible with existing code
window.API = {
  auth: authAPI,
  enquiries: enquiriesAPI,
  leads: leadsAPI,
  dashboard: dashboardAPI,
  officers: officersAPI,
  email: emailAPI,
  calendar: calendarAPI,
  attendance: attendanceAPI,
  call: callAPI,
  health: healthAPI
};
