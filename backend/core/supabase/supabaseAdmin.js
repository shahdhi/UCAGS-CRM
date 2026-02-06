/**
 * Supabase Admin Client
 * Uses service role key for admin operations
 */

const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/environment');

let supabaseAdmin = null;

/**
 * Initialize Supabase Admin client with service role key
 */
function initializeSupabaseAdmin() {
  const supabaseUrl = config.supabase.url || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = config.supabase.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('⚠️  Supabase admin not configured - service role key missing');
    console.warn('   URL:', supabaseUrl ? '✓' : '✗');
    console.warn('   Service Role Key:', serviceRoleKey ? '✓' : '✗');
    return null;
  }

  try {
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('✓ Supabase Admin client initialized');
    return supabaseAdmin;
  } catch (error) {
    console.error('❌ Failed to initialize Supabase Admin:', error);
    return null;
  }
}

/**
 * Get Supabase Admin client instance
 */
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = initializeSupabaseAdmin();
  }
  return supabaseAdmin;
}

module.exports = {
  initializeSupabaseAdmin,
  getSupabaseAdmin
};
