/**
 * Supabase Client Configuration
 * Handles authentication using Supabase
 */

// Supabase configuration
const SUPABASE_URL = 'https://xddaxiwyszynjyrizkmc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkZGF4aXd5c3p5bmp5cml6a21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDA3OTUsImV4cCI6MjA4NTE3Njc5NX0.imH4CCqt1fBwGek3ku1LTsq99YCfW4ZJQDwhw-0BD_Q';

// Initialize Supabase client
const supabaseClientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Supabase Authentication Service
 */
const SupabaseAuth = {
  /**
   * Sign up new user - DISABLED
   * Only admins can create accounts through user management
   */
  signUp: async (email, password, userData = {}) => {
    throw new Error('Public signup is disabled. Please contact an administrator to create an account.');
  },

  /**
   * Sign in user
   */
  signIn: async (email, password) => {
    try {
      const { data, error } = await supabaseClientInstance.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  },

  /**
   * Sign out user
   */
  signOut: async () => {
    try {
      const { error } = await supabaseClientInstance.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  },

  /**
   * Get current user
   */
  getCurrentUser: async () => {
    try {
      const { data: { user }, error } = await supabaseClientInstance.auth.getUser();
      if (error) throw error;
      return user;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  },

  /**
   * Get current session
   */
  getSession: async () => {
    try {
      const { data: { session }, error } = await supabaseClientInstance.auth.getSession();
      if (error) throw error;
      return session;
    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange: (callback) => {
    return supabaseClientInstance.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },

  /**
   * Reset password
   */
  resetPassword: async (email) => {
    try {
      const { error } = await supabaseClientInstance.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  },

  /**
   * Update password
   */
  updatePassword: async (newPassword) => {
    try {
      const { error } = await supabaseClientInstance.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Update password error:', error);
      throw error;
    }
  }
};

// Export for global access
window.SupabaseAuth = SupabaseAuth;
window.supabaseClient = supabaseClientInstance;

console.log('✓ Supabase client initialized');
