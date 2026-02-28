-- Daily Checklist: manual call recording receipt status

create table if not exists public.daily_call_recordings (
  id bigserial primary key,
  report_date date not null,
  officer_user_id uuid not null,
  status text not null default 'na', -- received | not_received | na
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (report_date, officer_user_id)
);

create index if not exists idx_daily_call_recordings_date on public.daily_call_recordings(report_date);
create index if not exists idx_daily_call_recordings_officer on public.daily_call_recordings(officer_user_id);

alter table public.daily_call_recordings enable row level security;

-- Admin-only policies (optional; depends on how you configure RLS in your project)
-- NOTE: This project typically uses the service role (supabase admin) from the backend,
-- so these policies are mainly for safety if accessed directly from clients.

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'daily_call_recordings'
  ) then
    execute 'create policy "daily_call_recordings_select_admin" on public.daily_call_recordings for select using (auth.jwt() ->> ''role'' = ''service_role'')';
    execute 'create policy "daily_call_recordings_write_admin" on public.daily_call_recordings for all using (auth.jwt() ->> ''role'' = ''service_role'') with check (auth.jwt() ->> ''role'' = ''service_role'')';
  end if;
end$$;

-- Keep updated_at fresh
create or replace function public.set_updated_at_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_daily_call_recordings_set_updated_at on public.daily_call_recordings;
create trigger trg_daily_call_recordings_set_updated_at
before update on public.daily_call_recordings
for each row execute procedure public.set_updated_at_timestamp();
