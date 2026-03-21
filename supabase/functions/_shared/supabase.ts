/**
 * Supabase admin client factory for Edge Functions
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase env vars not set');
  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _adminClient;
}
