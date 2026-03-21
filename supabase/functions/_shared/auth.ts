/**
 * Auth guard helpers for Supabase Edge Functions
 * Validates Supabase JWT and checks user roles.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

function getSupabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') ?? '';
}

function getAnonKey(): string {
  return Deno.env.get('SUPABASE_ANON_KEY') ?? '';
}

function getServiceKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

/**
 * Extract and verify the JWT from the Authorization header.
 * Returns the authenticated user or throws with status 401/403.
 */
export async function getAuthUser(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header');
    (err as any).status = 401;
    throw err;
  }
  const token = authHeader.replace('Bearer ', '');

  // Use anon client to verify the user token
  const supabase = createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    const err = new Error('Unauthorized');
    (err as any).status = 401;
    throw err;
  }

  const role = (user.user_metadata?.role || 'officer') as string;
  const name = (user.user_metadata?.name || user.email?.split('@')[0] || '') as string;

  return { id: user.id, email: user.email ?? '', role, name };
}

export async function isAuthenticated(req: Request): Promise<AuthUser> {
  return getAuthUser(req);
}

export async function isAdmin(req: Request): Promise<AuthUser> {
  const user = await getAuthUser(req);
  if (user.role !== 'admin') {
    const err = new Error('Forbidden: admin access required');
    (err as any).status = 403;
    throw err;
  }
  return user;
}

export async function isAdminOrOfficer(req: Request): Promise<AuthUser> {
  const user = await getAuthUser(req);
  if (!['admin', 'officer', 'admission_officer'].includes(user.role)) {
    const err = new Error('Forbidden');
    (err as any).status = 403;
    throw err;
  }
  return user;
}
