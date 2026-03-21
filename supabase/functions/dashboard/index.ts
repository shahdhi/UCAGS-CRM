/**
 * dashboard Edge Function
 * Maps to: /api/dashboard/*
 * All dashboard stats, analytics, and rankings are computed via Supabase queries.
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse, jsonResponse } from '../_shared/response.ts';
import { isAuthenticated, isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /stats - basic dashboard counters
router.get('/stats', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();

  const [leadsRes, regsRes, studentsRes] = await Promise.all([
    sb.from('crm_leads').select('id', { count: 'exact', head: true }),
    sb.from('registrations').select('id', { count: 'exact', head: true }),
    sb.from('students').select('id', { count: 'exact', head: true }),
  ]);

  return successResponse({
    leads: leadsRes.count ?? 0,
    registrations: regsRes.count ?? 0,
    students: studentsRes.count ?? 0,
  });
});

// GET /officer-stats - stats for the currently logged-in officer
router.get('/officer-stats', async (req) => {
  const user = await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const officerName = user.name;

  const [leadsRes, regsRes] = await Promise.all([
    sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('assigned_to', officerName),
    sb.from('registrations').select('id', { count: 'exact', head: true }).eq('assigned_to', officerName),
  ]);

  // Lead status breakdown
  const { data: statusRows } = await sb
    .from('crm_leads')
    .select('status')
    .eq('assigned_to', officerName);

  const statusCounts: Record<string, number> = {};
  for (const row of statusRows ?? []) {
    const s = row.status || 'New';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  return successResponse({
    leads: leadsRes.count ?? 0,
    registrations: regsRes.count ?? 0,
    leadsByStatus: statusCounts,
  });
});

// GET /rankings - leaderboard of officers by registrations
router.get('/rankings', async (req) => {
  await isAuthenticated(req);
  const sb = getSupabaseAdmin();

  const { data: regs, error } = await sb
    .from('registrations')
    .select('assigned_to')
    .not('assigned_to', 'is', null);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const r of regs ?? []) {
    const name = String(r.assigned_to || '').trim();
    if (name) counts[name] = (counts[name] ?? 0) + 1;
  }

  const rankings = Object.entries(counts)
    .map(([name, count]) => ({ name, registrations: count }))
    .sort((a, b) => b.registrations - a.registrations);

  return successResponse({ rankings });
});

// GET /analytics - time-series data for registrations and leads
router.get('/analytics', async (req) => {
  await isAuthenticated(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 365);
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [leadsRes, regsRes] = await Promise.all([
    sb.from('crm_leads').select('created_at').gte('created_at', since).order('created_at'),
    sb.from('registrations').select('created_at').gte('created_at', since).order('created_at'),
  ]);

  const bucket = (rows: any[]) => {
    const map: Record<string, number> = {};
    for (const r of rows ?? []) {
      const d = String(r.created_at ?? '').slice(0, 10);
      if (d) map[d] = (map[d] ?? 0) + 1;
    }
    return map;
  };

  return successResponse({
    leads: bucket(leadsRes.data ?? []),
    registrations: bucket(regsRes.data ?? []),
    days,
  });
});

// GET /admin-stats - full stats for admins
router.get('/admin-stats', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();

  const [leadsRes, regsRes, studentsRes, usersRes] = await Promise.all([
    sb.from('crm_leads').select('id,status,assigned_to,batch_name'),
    sb.from('registrations').select('id,assigned_to,batch_name,program_name,created_at'),
    sb.from('students').select('id', { count: 'exact', head: true }),
    sb.auth.admin.listUsers(),
  ]);

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  for (const l of leadsRes.data ?? []) {
    const s = l.status || 'New';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  // Batch breakdown
  const batchCounts: Record<string, number> = {};
  for (const l of leadsRes.data ?? []) {
    const b = l.batch_name || 'Unknown';
    batchCounts[b] = (batchCounts[b] ?? 0) + 1;
  }

  // Officer registration counts
  const officerCounts: Record<string, number> = {};
  for (const r of regsRes.data ?? []) {
    const name = r.assigned_to || 'Unassigned';
    officerCounts[name] = (officerCounts[name] ?? 0) + 1;
  }

  const officerCount = (usersRes.data?.users ?? []).filter(
    (u: any) => u.user_metadata?.role === 'officer' || u.user_metadata?.role === 'admission_officer'
  ).length;

  return successResponse({
    totalLeads: leadsRes.data?.length ?? 0,
    totalRegistrations: regsRes.data?.length ?? 0,
    totalStudents: studentsRes.count ?? 0,
    totalOfficers: officerCount,
    leadsByStatus: statusCounts,
    leadsByBatch: batchCounts,
    registrationsByOfficer: officerCounts,
  });
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const res = await router.handle(req);
    if (res) return res;
    return errorResponse('Not found', 404);
  } catch (e: any) {
    return errorResponse(e.message ?? 'Internal server error', e.status ?? 500);
  }
});
