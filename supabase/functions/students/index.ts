/**
 * students Edge Function
 * Maps to: /api/students/*
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/response.ts';
import { isAdmin } from '../_shared/auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';
import { Router } from '../_shared/router.ts';

const router = new Router();

// GET /admin  — list all students (admin)
router.get('/admin', async (req) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 500);
  const search = (url.searchParams.get('search') ?? '').trim();

  let q = sb.from('students').select('*').order('created_at', { ascending: false }).limit(limit);
  if (search) {
    const s = search.replace(/"/g, '');
    q = q.or(`student_id.ilike.%${s}%,name.ilike.%${s}%,phone_number.ilike.%${s}%,email.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('relation') || msg.includes('does not exist')) return errorResponse('Students table not found', 501);
    throw error;
  }
  return successResponse({ students: data ?? [] });
});

// DELETE /admin/:id  — remove a student (admin, reverts enrollment)
router.delete('/admin/:id', async (req, params) => {
  await isAdmin(req);
  const sb = getSupabaseAdmin();

  const { data: student, error: sErr } = await sb.from('students').select('*').eq('id', params.id).single();
  if (sErr) throw sErr;

  const { error: dErr } = await sb.from('students').delete().eq('id', params.id);
  if (dErr) throw dErr;

  // Revert enrollment on registration if linked
  if (student?.registration_id) {
    await sb.from('registrations')
      .update({ enrolled: false, enrolled_at: null, student_id: null })
      .eq('id', student.registration_id);
  }

  return successResponse({ deleted: true });
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
