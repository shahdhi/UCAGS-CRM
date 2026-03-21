-- Supabase RLS Policies (recommended baseline)
-- Generated: 2026-02-26
--
-- IMPORTANT:
-- 1) Review before running in production.
-- 2) These policies assume you use Supabase Auth and want users to only access their own notifications.
-- 3) For crm_leads we recommend SERVER-ONLY access (no client policies) unless you add assigned_user_id.

-- =========================
-- user_notifications
-- =========================

alter table if exists public.user_notifications enable row level security;

-- Users can read only their own notifications
drop policy if exists "read own notifications" on public.user_notifications;
create policy "read own notifications"
on public.user_notifications
for select
to authenticated
using (user_id = auth.uid());

-- Users can update only their own notifications (e.g., mark read)
drop policy if exists "update own notifications" on public.user_notifications;
create policy "update own notifications"
on public.user_notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Optional: allow users to delete their own notifications
-- (If you don't need delete, keep this commented out)
-- drop policy if exists "delete own notifications" on public.user_notifications;
-- create policy "delete own notifications"
-- on public.user_notifications
-- for delete
-- to authenticated
-- using (user_id = auth.uid());

-- NOTE: We intentionally do NOT add an INSERT policy.
-- Notifications should be created via backend using the service role key.


-- =========================
-- user_notification_settings
-- =========================

alter table if exists public.user_notification_settings enable row level security;

drop policy if exists "read own notification settings" on public.user_notification_settings;
create policy "read own notification settings"
on public.user_notification_settings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "upsert own notification settings" on public.user_notification_settings;
create policy "upsert own notification settings"
on public.user_notification_settings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "update own notification settings" on public.user_notification_settings;
create policy "update own notification settings"
on public.user_notification_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Optional: prevent deletes (default) or allow deletes:
-- drop policy if exists "delete own notification settings" on public.user_notification_settings;
-- create policy "delete own notification settings"
-- on public.user_notification_settings
-- for delete
-- to authenticated
-- using (user_id = auth.uid());


-- =========================
-- crm_leads (recommendation)
-- =========================
-- If your frontend uses the Node API (service role) to access crm_leads, you can lock this table down.
-- Enabling RLS without policies will block client access by default.
--
-- If you DO want client access, you should add an assigned_user_id UUID column and write policies using auth.uid().

alter table if exists public.crm_leads enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies are created for crm_leads in this baseline.
-- This makes it server-only when accessed from the browser.

