-- RLS policies for Demo Sessions feature
-- Generated: 2026-02-26

-- demo_sessions
alter table if exists public.demo_sessions enable row level security;

drop policy if exists "demo_sessions_read" on public.demo_sessions;
create policy "demo_sessions_read"
on public.demo_sessions
for select
to authenticated
using (true);

-- Only admin/officers via backend should write. If you want client-side writes, add policies.
-- For safety, do not allow direct inserts/updates/deletes from client.

-- demo_session_invites
alter table if exists public.demo_session_invites enable row level security;

drop policy if exists "demo_invites_read" on public.demo_session_invites;
create policy "demo_invites_read"
on public.demo_session_invites
for select
to authenticated
using (true);

-- demo_invite_reminders
alter table if exists public.demo_invite_reminders enable row level security;

drop policy if exists "demo_reminders_read" on public.demo_invite_reminders;
create policy "demo_reminders_read"
on public.demo_invite_reminders
for select
to authenticated
using (true);

-- NOTE: write operations are intended to be performed by your Node backend using service role.
