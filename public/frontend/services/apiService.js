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
   * Get all leads
   * @param {Object} filters - Optional filters (status, search, batch)
   */
  getAll: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    if (filters.batch) params.append('batch', filters.batch);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchAPI(`/leads${query}`);
  },

  /**
   * Get lead by ID
   * @param {number} id - Lead ID
   */
  getById: async (id) => {
    return fetchAPI(`/leads/${id}`);
  },

  /**
   * Create new lead
   * @param {Object} leadData - Lead data
   */
  create: async (leadData) => {
    return fetchAPI('/leads', {
      method: 'POST',
      body: JSON.stringify(leadData)
    });
  },

  /**
   * Update lead
   * @param {number} id - Lead ID
   * @param {Object} updates - Fields to update
   */
  update: async (id, updates, batch) => {
    const url = batch ? `/leads/${id}?batch=${encodeURIComponent(batch)}` : `/leads/${id}`;
    return fetchAPI(url, {
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
   * Get all available batches
   */
  getBatches: async () => {
    return fetchAPI('/leads/batches');
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
  call: callAPI,
  health: healthAPI
};
