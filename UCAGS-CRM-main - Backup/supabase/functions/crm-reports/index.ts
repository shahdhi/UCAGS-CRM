// @ts-nocheck
/**
 * CRM Reports — Supabase Edge Function (Deno)
 *
 * Handles all /reports/* routes previously served by the Vercel Express backend.
 * Mirrors: backend/modules/reports/reportsRoutes.js
 *           backend/modules/reports/dailyReportsService.js
 *           backend/modules/reports/dailyChecklistService.js
 *
 * Auth: expects a Supabase JWT in Authorization header.
 * Service-role ops use SUPABASE_SERVICE_ROLE_KEY (available natively in edge runtime).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function toInt(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

function mkErr(msg: string, status = 500, meta?: unknown): Error {
  const e: any = new Error(msg);
  e.status = status;
  if (meta !== undefined) e.meta = meta;
  return e;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errResp(e: any): Response {
  const status = e?.status && e.status >= 100 && e.status < 600 ? e.status : 500;
  return jsonResp({ success: false, error: e?.message ?? String(e), meta: e?.meta }, status);
}

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

function adminSb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

const ADMIN_EMAILS = ['admin@ucags.edu.lk', 'mohamedunais2018@gmail.com'];

async function getUser(req: Request): Promise<any | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: { user }, error } = await adminSb().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

function isAdmin(user: any): boolean {
  const role = cleanStr(user?.user_metadata?.role ?? user?.role);
  if (role === 'admin') return true;
  return ADMIN_EMAILS.includes(cleanStr(user?.email).toLowerCase());
}

function isAdminAccount(user: any): boolean {
  const email = cleanStr(user?.email).toLowerCase();
  const role = cleanStr(user?.user_metadata?.role ?? '');
  return role === 'admin' || ADMIN_EMAILS.includes(email) || email.includes('admin');
}

function isOfficer(user: any): boolean {
  const role = cleanStr(user?.user_metadata?.role ?? user?.role);
  return role === 'officer' || role === 'admission_officer';
}

function isAdminOrOfficer(user: any): boolean {
  return isAdmin(user) || isOfficer(user);
}

function requireAuth(user: any | null): asserts user is NonNullable<typeof user> {
  if (!user) throw mkErr('Unauthorized', 401);
}

function requireAdmin(user: any | null) {
  requireAuth(user);
  if (!isAdmin(user)) throw mkErr('Forbidden: admin only', 403);
}

function requireAdminOrOfficer(user: any | null) {
  requireAuth(user);
  if (!isAdminOrOfficer(user)) throw mkErr('Forbidden', 403);
}

// ---------------------------------------------------------------------------
// Timezone / date helpers (Sri Lanka UTC+5:30, no DST)
// ---------------------------------------------------------------------------

const SL_OFFSET_MINUTES = 330;

function getDateISOInOffset(date: Date, offsetMinutes: number): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseTimeHHMM(t: unknown): { hh: number; mm: number; hhmm: string } | null {
  const s = cleanStr(t);
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm, hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

function computeWindowUTC({ dateISO, timeHHMM, graceMinutes, offsetMinutes }: {
  dateISO: string; timeHHMM: string; graceMinutes: number; offsetMinutes: number;
}): { start: Date; end: Date } | null {
  const parts = dateISO.split('-').map(Number);
  const [y, m, d] = parts;
  const tm = parseTimeHHMM(timeHHMM);
  if (!y || !m || !d || !tm) return null;
  const startUTCms = Date.UTC(y, m - 1, d, tm.hh, tm.mm, 0) - offsetMinutes * 60 * 1000;
  const endUTCms = startUTCms + graceMinutes * 60 * 1000;
  return { start: new Date(startUTCms), end: new Date(endUTCms) };
}

function addDaysISO(dateISO: string, delta: number): string {
  const parts = dateISO.split('-').map(Number);
  const [y, mo, d] = parts;
  const utc = Date.UTC(y, mo - 1, d, 0, 0, 0) + delta * 86400000;
  return getDateISOInOffset(new Date(utc), 0);
}

function buildDateList(startISO: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(addDaysISO(startISO, i));
  return out;
}

// ---------------------------------------------------------------------------
// Default schedule config
// ---------------------------------------------------------------------------

const DEFAULT_SCHEDULE = {
  timezone: 'Asia/Colombo',
  graceMinutes: 20,
  slots: [
    { key: 'slot1', label: '10:30 AM', time: '10:30' },
    { key: 'slot2', label: '02:30 PM', time: '14:30' },
    { key: 'slot3', label: '06:00 PM', time: '18:00' },
  ],
};

// ---------------------------------------------------------------------------
// Notifications helper
// ---------------------------------------------------------------------------

async function createNotification(sb: any, {
  userId, category, title, message, type = 'info',
}: { userId: string; category: string; title: string; message: string; type?: string }) {
  await sb.from('user_notifications').insert({
    user_id: userId,
    category,
    title,
    message,
    type,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

async function listAdminUserIds(sb: any): Promise<string[]> {
  const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
  if (error || !users) return [];
  return (users as any[]).filter(u => isAdminAccount(u)).map(u => u.id);
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

async function getSchedule(sb: any) {
  const { data, error } = await sb.from('daily_report_config').select('*').eq('id', 1).maybeSingle();
  if (error || !data) return { source: 'default', config: DEFAULT_SCHEDULE };

  const slots = [
    { key: 'slot1', label: data.slot1_label || '10:30 AM', time: data.slot1_time || '10:30' },
    { key: 'slot2', label: data.slot2_label || '02:30 PM', time: data.slot2_time || '14:30' },
    { key: 'slot3', label: data.slot3_label || '06:00 PM', time: data.slot3_time || '18:00' },
  ];
  return {
    source: 'supabase',
    config: {
      timezone: data.timezone || DEFAULT_SCHEDULE.timezone,
      graceMinutes: Number.isFinite(Number(data.grace_minutes)) ? Number(data.grace_minutes) : DEFAULT_SCHEDULE.graceMinutes,
      slots,
    },
  };
}

async function updateSchedule(sb: any, { timezone, graceMinutes, slots }: any) {
  const s1 = slots?.[0] || {};
  const s2 = slots?.[1] || {};
  const s3 = slots?.[2] || {};

  const slot1 = parseTimeHHMM(s1.time) ?? parseTimeHHMM(DEFAULT_SCHEDULE.slots[0].time)!;
  const slot2 = parseTimeHHMM(s2.time) ?? parseTimeHHMM(DEFAULT_SCHEDULE.slots[1].time)!;
  const slot3 = parseTimeHHMM(s3.time) ?? parseTimeHHMM(DEFAULT_SCHEDULE.slots[2].time)!;

  const fmt = (hhmm: string) => {
    const t = parseTimeHHMM(hhmm);
    if (!t) return hhmm;
    const h12 = ((t.hh + 11) % 12) + 1;
    const ampm = t.hh >= 12 ? 'PM' : 'AM';
    return `${String(h12).padStart(2, '0')}:${String(t.mm).padStart(2, '0')} ${ampm}`;
  };

  const row = {
    id: 1,
    timezone: cleanStr(timezone) || DEFAULT_SCHEDULE.timezone,
    grace_minutes: Number.isFinite(Number(graceMinutes)) ? Math.max(0, Math.trunc(Number(graceMinutes))) : DEFAULT_SCHEDULE.graceMinutes,
    slot1_time: slot1.hhmm, slot1_label: cleanStr(s1.label) || fmt(slot1.hhmm),
    slot2_time: slot2.hhmm, slot2_label: cleanStr(s2.label) || fmt(slot2.hhmm),
    slot3_time: slot3.hhmm, slot3_label: cleanStr(s3.label) || fmt(slot3.hhmm),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from('daily_report_config').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Daily reports service
// ---------------------------------------------------------------------------

function normalizePayload(p: any) {
  return {
    fresh_calls_made: toInt(p?.freshCallsMade ?? p?.fresh_calls_made),
    fresh_messages_reached: toInt(p?.freshMessagesReached ?? p?.fresh_messages_reached),
    interested_leads: toInt(p?.interestedLeads ?? p?.interested_leads),
    followup_calls: toInt(p?.followUpCalls ?? p?.followup_calls ?? p?.followupCalls),
    followup_messages: toInt(p?.followUpMessages ?? p?.followup_messages ?? p?.followupMessages),
    followup_scheduled: toInt(p?.followUpScheduled ?? p?.followup_scheduled ?? p?.followupScheduled),
    closures: toInt(p?.closures),
    notes: cleanStr(p?.notes || ''),
  };
}

async function submitDailyReport(sb: any, { officerUserId, officerName, slotKey, clientNowISO, payload }: any) {
  const { config } = await getSchedule(sb);
  const slot = (config.slots || []).find((s: any) => s.key === slotKey);
  if (!slot) throw mkErr('Invalid slot', 400);

  const time = parseTimeHHMM(slot.time);
  if (!time) throw mkErr('Invalid slot time configuration', 500);

  const now = clientNowISO ? new Date(clientNowISO) : new Date();
  if (isNaN(now.getTime())) throw mkErr('Invalid client time', 400);

  const dateISO = getDateISOInOffset(now, SL_OFFSET_MINUTES);
  const windowUTC = computeWindowUTC({ dateISO, timeHHMM: time.hhmm, graceMinutes: config.graceMinutes, offsetMinutes: SL_OFFSET_MINUTES });
  if (!windowUTC) throw mkErr('Invalid slot window configuration', 500);

  const { start, end } = windowUTC;
  if (now < start || now > end) {
    throw mkErr('Submission window closed', 403, {
      start: start.toISOString(), end: end.toISOString(), now: now.toISOString(), report_date: dateISO,
    });
  }

  const normalized = normalizePayload(payload || {});
  const row = {
    report_date: dateISO,
    slot_key: slotKey,
    officer_user_id: officerUserId,
    officer_name: cleanStr(officerName) || null,
    ...normalized,
    submitted_at: now.toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('daily_officer_reports')
    .upsert(row, { onConflict: 'report_date,slot_key,officer_user_id' })
    .select('*').single();
  if (error) throw error;

  // Award 2 XP (best-effort, non-fatal)
  try {
    await sb.from('xp_events').insert({
      user_id: officerUserId,
      event_type: 'report_submitted',
      xp: 2,
      reference_id: `${officerUserId}:${dateISO}:${slotKey}`,
      reference_type: 'report',
      note: `Daily report submitted — ${slotKey} (${dateISO})`,
      created_at: new Date().toISOString(),
    });
  } catch (_) { /* non-fatal */ }

  return data;
}

async function listDailyReports(sb: any, dateISO: string) {
  const date = cleanStr(dateISO);
  if (!date) throw mkErr('date is required', 400);
  const { data, error } = await sb
    .from('daily_officer_reports').select('*').eq('report_date', date)
    .order('slot_key', { ascending: true })
    .order('officer_name', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

async function adminUpdateReport(sb: any, reportId: unknown, patch: any) {
  const id = Number(reportId);
  if (!Number.isFinite(id)) throw mkErr('Invalid reportId', 400);
  const row = { ...normalizePayload(patch), updated_at: new Date().toISOString() };
  const { data, error } = await sb.from('daily_officer_reports').update(row).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

async function sendSlotReminders(sb: any, nowISO?: string) {
  const { config } = await getSchedule(sb);
  const now = nowISO ? new Date(nowISO) : new Date();
  if (isNaN(now.getTime())) throw mkErr('Invalid nowISO', 400);

  const graceMinutes = config.graceMinutes ?? 20;
  const dateISO = getDateISOInOffset(now, SL_OFFSET_MINUTES);

  let activeSlot: any = null;
  let activeWindow: { start: Date; end: Date } | null = null;
  for (const slot of (config.slots || [])) {
    const t = parseTimeHHMM(slot.time);
    if (!t) continue;
    const w = computeWindowUTC({ dateISO, timeHHMM: t.hhmm, graceMinutes, offsetMinutes: SL_OFFSET_MINUTES });
    if (!w) continue;
    if (now >= w.start && now <= w.end) { activeSlot = slot; activeWindow = w; break; }
  }

  if (!activeSlot || !activeWindow) return { sent: 0, skipped: 0, slot: null, reason: 'no_open_window' };

  const { data: { users }, error: usersErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
  if (usersErr) throw usersErr;

  const officers = (users || []).filter((u: any) => {
    if (isAdminAccount(u)) return false;
    return isOfficer(u);
  });

  if (!officers.length) return { sent: 0, skipped: 0, slot: activeSlot.key, reason: 'no_officers' };

  const { data: submitted } = await sb
    .from('daily_officer_reports').select('officer_user_id')
    .eq('report_date', dateISO).eq('slot_key', activeSlot.key);
  const submittedIds = new Set((submitted || []).map((r: any) => r.officer_user_id));

  const dedupeCategory = `daily_report_reminder_${activeSlot.key}`;
  const { data: recentReminders } = await sb
    .from('user_notifications').select('user_id')
    .eq('category', dedupeCategory)
    .gte('created_at', activeWindow.start.toISOString());
  const alreadyRemindedIds = new Set((recentReminders || []).map((r: any) => r.user_id));

  let sent = 0, skipped = 0;
  for (const officer of officers) {
    if (submittedIds.has(officer.id) || alreadyRemindedIds.has(officer.id)) { skipped++; continue; }

    const endTime = activeWindow.end.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo',
    });
    try {
      await createNotification(sb, {
        userId: officer.id,
        category: dedupeCategory,
        title: `Daily report due — ${activeSlot.label || activeSlot.time}`,
        message: `Please submit your daily report for the ${activeSlot.label || activeSlot.time} slot. Window closes at ${endTime} (SL time).`,
        type: 'warning',
      });
      sent++;
    } catch (_) { /* non-fatal */ }
  }

  return { sent, skipped, slot: activeSlot.key, date: dateISO };
}

// ---------------------------------------------------------------------------
// Daily checklist service
// ---------------------------------------------------------------------------

function toUTCBoundaryFromSLDate(dateISO: string): Date | null {
  const parts = dateISO.split('-').map(Number);
  const [y, mo, d] = parts;
  if (!y || !mo || !d) return null;
  const slStartUTCms = Date.UTC(y, mo - 1, d, 0, 0, 0) - SL_OFFSET_MINUTES * 60 * 1000;
  return new Date(slStartUTCms);
}

async function getOfficerList(sb: any): Promise<{ id: string; name: string }[]> {
  const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2000 });
  if (error) throw error;
  return (users || [])
    .filter((u: any) => !isAdminAccount(u) && isOfficer(u))
    .map((u: any) => ({
      id: u.id,
      name: cleanStr(u.user_metadata?.name || u.email?.split('@')?.[0] || 'Officer'),
    }));
}

async function computeNewLeadsCountsCurrent(sb: any, officers: { id: string; name: string }[]): Promise<Map<string, number>> {
  // Exclude officer-created personal sheets
  let officerCreatedSheetKeys = new Set<string>();
  try {
    const { data: customSheets } = await sb.from('officer_custom_sheets').select('batch_name, sheet_name');
    for (const row of (customSheets || [])) {
      if (row.batch_name && row.sheet_name)
        officerCreatedSheetKeys.add(`${cleanStr(row.batch_name)}|${cleanStr(row.sheet_name)}`);
    }
  } catch (_) { /* table may not exist */ }

  const { data, error } = await sb.from('crm_leads').select('id, batch_name, sheet_name, sheet_lead_id, assigned_to, status').eq('status', 'New');
  if (error) throw error;

  const officerNameToId = new Map(officers.map(o => [cleanStr(o.name), o.id]));
  const counts = new Map<string, Set<string>>();

  for (const l of (data || [])) {
    const sheetKey = `${cleanStr(l.batch_name)}|${cleanStr(l.sheet_name)}`;
    if (officerCreatedSheetKeys.has(sheetKey)) continue;
    const assignee = cleanStr(l.assigned_to);
    const officerId = officerNameToId.get(assignee);
    if (!officerId) continue;
    const leadKey = [l.batch_name, l.sheet_name, l.sheet_lead_id].join('|');
    if (!counts.has(officerId)) counts.set(officerId, new Set());
    counts.get(officerId)!.add(leadKey);
  }

  const out = new Map<string, number>();
  for (const [id, set] of counts.entries()) out.set(id, set.size);
  return out;
}

async function getDailyChecklist(sb: any, { startISO, days, officers }: {
  startISO: string; days: number; officers: { id: string; name: string }[];
}) {
  const start = cleanStr(startISO);
  if (!start) throw mkErr('start is required (YYYY-MM-DD)', 400);
  if (!Number.isFinite(days) || days <= 0 || days > 31) throw mkErr('days must be 1..31', 400);

  const dates = buildDateList(start, days);
  const end = dates[dates.length - 1];

  // Fetch reports
  const { data: reportRows, error: rErr } = await sb
    .from('daily_officer_reports').select('report_date, slot_key, officer_user_id')
    .gte('report_date', start).lte('report_date', end);
  if (rErr) throw rErr;

  // Fetch followups
  const startUTC = toUTCBoundaryFromSLDate(start);
  const endPlus1UTC = toUTCBoundaryFromSLDate(addDaysISO(end, 1));
  const { data: followups } = startUTC && endPlus1UTC
    ? await sb.from('crm_lead_followups')
        .select('officer_user_id, batch_name, sheet_name, sheet_lead_id, actual_at')
        .gte('actual_at', startUTC.toISOString())
        .lt('actual_at', endPlus1UTC.toISOString())
    : { data: [] };

  // Fetch call recordings
  const { data: recordings } = await sb
    .from('daily_call_recordings').select('report_date, officer_user_id, status')
    .gte('report_date', start).lte('report_date', end);

  // Fetch snapshots
  const { data: snapshots } = await sb
    .from('daily_officer_leads_snapshot').select('snapshot_date, officer_user_id, new_leads_count')
    .gte('snapshot_date', start).lte('snapshot_date', end);

  // Live new lead counts
  const liveNewLeadCounts = await computeNewLeadsCountsCurrent(sb, officers);

  // Build snapshot map
  const snapshotMap: Record<string, Record<string, number>> = {};
  for (const s of (snapshots || [])) {
    if (!snapshotMap[s.snapshot_date]) snapshotMap[s.snapshot_date] = {};
    snapshotMap[s.snapshot_date][s.officer_user_id] = Number(s.new_leads_count || 0);
  }

  // Build matrix
  const byDate: Record<string, Record<string, any>> = {};
  for (const d of dates) {
    byDate[d] = {};
    for (const o of officers) {
      byDate[d][o.id] = {
        officerUserId: o.id, officerName: o.name,
        slot1: false, slot2: false, slot3: false,
        leadsContacted: 0, leadsToBeContacted: 0, callRecording: 'na',
      };
    }
  }

  // Fill reports
  for (const r of (reportRows || [])) {
    const cell = byDate[r.report_date]?.[r.officer_user_id];
    if (!cell) continue;
    if (r.slot_key === 'slot1') cell.slot1 = true;
    if (r.slot_key === 'slot2') cell.slot2 = true;
    if (r.slot_key === 'slot3') cell.slot3 = true;
  }

  // Leads contacted
  const contactedByDayOfficer = new Map<string, Set<string>>();
  for (const f of (followups || [])) {
    if (!f.officer_user_id || !f.actual_at) continue;
    const leadKey = [f.batch_name, f.sheet_name, f.sheet_lead_id].join('|');
    const d = getDateISOInOffset(new Date(f.actual_at), SL_OFFSET_MINUTES);
    const k = `${d}|${f.officer_user_id}`;
    if (!contactedByDayOfficer.has(k)) contactedByDayOfficer.set(k, new Set());
    contactedByDayOfficer.get(k)!.add(leadKey);
  }

  // Fill contacted + to-be-contacted
  for (const d of dates) {
    for (const o of officers) {
      const k = `${d}|${o.id}`;
      const cell = byDate[d][o.id];
      cell.leadsContacted = contactedByDayOfficer.get(k)?.size || 0;
      const frozen = snapshotMap[d]?.[o.id];
      cell.leadsToBeContacted = frozen !== undefined ? frozen : (liveNewLeadCounts.get(o.id) || 0);
      cell.hasSnapshot = snapshotMap[d] !== undefined;
    }
  }

  // Fill call recordings
  for (const r of (recordings || [])) {
    const cell = byDate[r.report_date]?.[r.officer_user_id];
    if (!cell) continue;
    cell.callRecording = r.status || 'na';
  }

  return { startISO: start, endISO: end, days: dates, officers, byDate };
}

async function upsertCallRecordingStatus(sb: any, { dateISO, officerUserId, status }: any) {
  const date = cleanStr(dateISO), officer = cleanStr(officerUserId), st = cleanStr(status);
  if (!date || !officer) throw mkErr('dateISO and officerUserId are required', 400);
  const allowed = new Set(['received', 'not_received', 'na', '']);
  if (!allowed.has(st)) throw mkErr('Invalid status', 400);
  const row = { report_date: date, officer_user_id: officer, status: st || 'na', updated_at: new Date().toISOString() };
  const { data, error } = await sb.from('daily_call_recordings').upsert(row, { onConflict: 'report_date,officer_user_id' }).select('*').single();
  if (error) throw error;
  return data;
}

async function upsertLeadsSnapshot(sb: any, { dateISO, officers }: { dateISO: string; officers: { id: string; name: string }[] }) {
  const date = cleanStr(dateISO);
  if (!date) throw mkErr('dateISO is required', 400);
  const counts = await computeNewLeadsCountsCurrent(sb, officers);
  const rows = officers.map(o => ({
    snapshot_date: date,
    officer_user_id: o.id,
    new_leads_count: counts.get(o.id) || 0,
    meta: { source: 'crm_leads_status_new', generated_at: new Date().toISOString() },
  }));
  const { data, error } = await sb.from('daily_officer_leads_snapshot')
    .upsert(rows, { onConflict: 'snapshot_date,officer_user_id' })
    .select('snapshot_date, officer_user_id, new_leads_count');
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Main request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url = new URL(req.url);
  // Strip function prefix: /functions/v1/crm-reports/<sub-path>
  const fullPath = url.pathname;
  const fnIdx = fullPath.indexOf('crm-reports');
  const afterFn = fnIdx !== -1
    ? fullPath.slice(fnIdx + 'crm-reports'.length).replace(/^\//, '')
    : fullPath.replace(/^\/+/, '');
  // afterFn examples: "daily/schedule", "daily/submit", "daily/overview", "daily-checklist", etc.

  const method = req.method.toUpperCase();
  const sb = adminSb();

  try {
    // -------------------------------------------------------------------------
    // GET /daily/schedule  — any authenticated user
    // -------------------------------------------------------------------------
    if (afterFn === 'daily/schedule' && method === 'GET') {
      const user = await getUser(req);
      requireAuth(user);
      const result = await getSchedule(sb);
      return jsonResp({ success: true, ...result });
    }

    // -------------------------------------------------------------------------
    // PUT /daily/schedule  — admin only
    // -------------------------------------------------------------------------
    if (afterFn === 'daily/schedule' && method === 'PUT') {
      const user = await getUser(req);
      requireAdmin(user);
      const body = await req.json().catch(() => ({}));
      const { timezone, graceMinutes, slots } = body;
      const saved = await updateSchedule(sb, { timezone, graceMinutes, slots });
      return jsonResp({ success: true, config: saved });
    }

    // -------------------------------------------------------------------------
    // POST /daily/submit  — admin or officer
    // -------------------------------------------------------------------------
    if (afterFn === 'daily/submit' && method === 'POST') {
      const user = await getUser(req);
      requireAdminOrOfficer(user);
      const body = await req.json().catch(() => ({}));
      const { slotKey, clientNowISO } = body;
      const payload = body.payload || body;

      const officerUserId = user.id;
      const officerName = cleanStr(user.user_metadata?.name || user.email?.split('@')?.[0] || '');

      const saved = await submitDailyReport(sb, { officerUserId, officerName, slotKey, clientNowISO, payload });

      // Notify admins (best-effort)
      try {
        const adminIds = await listAdminUserIds(sb);
        const { config } = await getSchedule(sb);
        const slotLabel = (config.slots || []).find((s: any) => s.key === slotKey)?.label || slotKey;
        for (const adminId of adminIds) {
          await createNotification(sb, {
            userId: adminId,
            category: 'admin_daily_reports',
            title: 'Daily report received',
            message: `${officerName} submitted daily report (${slotLabel}) for ${saved.report_date}.`,
            type: 'info',
          });
        }
      } catch (_) { /* non-fatal */ }

      return jsonResp({ success: true, report: saved });
    }

    // -------------------------------------------------------------------------
    // GET /daily/overview?date=YYYY-MM-DD  — admin or officer
    // -------------------------------------------------------------------------
    if (afterFn === 'daily/overview' && method === 'GET') {
      const user = await getUser(req);
      requireAdminOrOfficer(user);
      const date = url.searchParams.get('date') || '';
      const rows = await listDailyReports(sb, date);
      const officers = await getOfficerList(sb);
      return jsonResp({ success: true, reports: rows, officers });
    }

    // -------------------------------------------------------------------------
    // GET /daily?date=YYYY-MM-DD  — admin only
    // -------------------------------------------------------------------------
    if (afterFn === 'daily' && method === 'GET') {
      const user = await getUser(req);
      requireAdmin(user);
      const date = url.searchParams.get('date') || '';
      const rows = await listDailyReports(sb, date);
      return jsonResp({ success: true, reports: rows });
    }

    // -------------------------------------------------------------------------
    // POST /daily/remind  — cron secret OR any authenticated user
    // -------------------------------------------------------------------------
    if (afterFn === 'daily/remind' && method === 'POST') {
      const cronSecret = Deno.env.get('CRON_SECRET');
      const providedSecret = req.headers.get('x-cron-secret');
      const isCron = cronSecret && providedSecret === cronSecret;

      if (!isCron) {
        const user = await getUser(req);
        requireAuth(user);
      }

      const body = await req.json().catch(() => ({}));
      const result = await sendSlotReminders(sb, body?.nowISO || undefined);
      return jsonResp({ success: true, ...result });
    }

    // -------------------------------------------------------------------------
    // PUT /daily/:id  — admin only
    // -------------------------------------------------------------------------
    const dailyIdMatch = afterFn.match(/^daily\/(\d+)$/);
    if (dailyIdMatch && method === 'PUT') {
      const user = await getUser(req);
      requireAdmin(user);
      const patch = await req.json().catch(() => ({}));
      const saved = await adminUpdateReport(sb, dailyIdMatch[1], patch);
      return jsonResp({ success: true, report: saved });
    }

    // -------------------------------------------------------------------------
    // GET /daily-checklist?start=YYYY-MM-DD&days=7  — admin or officer
    // -------------------------------------------------------------------------
    if (afterFn === 'daily-checklist' && method === 'GET') {
      const user = await getUser(req);
      requireAdminOrOfficer(user);
      const startISO = url.searchParams.get('start') || '';
      const days = Number(url.searchParams.get('days') || '7');
      const officers = await getOfficerList(sb);
      const data = await getDailyChecklist(sb, { startISO, days, officers });
      return jsonResp({ success: true, ...data });
    }

    // -------------------------------------------------------------------------
    // POST /daily-checklist/snapshot  — admin only
    // -------------------------------------------------------------------------
    if (afterFn === 'daily-checklist/snapshot' && method === 'POST') {
      const user = await getUser(req);
      requireAdmin(user);
      const body = await req.json().catch(() => ({}));
      const { dateISO, startISO, days } = body;
      const officers = await getOfficerList(sb);

      const targets: string[] = [];
      if (dateISO) {
        targets.push(cleanStr(dateISO).slice(0, 10));
      } else if (startISO) {
        const n = Number(days || 7);
        for (let i = 0; i < n; i++) targets.push(addDaysISO(cleanStr(startISO), i));
      } else {
        return jsonResp({ success: false, error: 'Provide dateISO or startISO (+days)' }, 400);
      }

      const all = [];
      for (const d of targets) {
        const rows = await upsertLeadsSnapshot(sb, { dateISO: d, officers });
        all.push({ dateISO: d, rows });
      }
      return jsonResp({ success: true, result: all });
    }

    // -------------------------------------------------------------------------
    // PUT /daily-checklist/call-recording  — admin only
    // -------------------------------------------------------------------------
    if (afterFn === 'daily-checklist/call-recording' && method === 'PUT') {
      const user = await getUser(req);
      requireAdmin(user);
      const body = await req.json().catch(() => ({}));
      const { dateISO, officerUserId, status } = body;
      const saved = await upsertCallRecordingStatus(sb, { dateISO, officerUserId, status });
      return jsonResp({ success: true, row: saved });
    }

    // -------------------------------------------------------------------------
    // 404 fallthrough
    // -------------------------------------------------------------------------
    return jsonResp({ success: false, error: `crm-reports: unknown route ${method} /${afterFn}` }, 404);

  } catch (e: any) {
    console.error('[crm-reports] error:', e?.message, e?.status);
    return errResp(e);
  }
});
