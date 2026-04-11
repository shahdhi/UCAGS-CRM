-- tmp_rovodev_supabase_followups.sql
-- Run in Supabase SQL editor

-- 1) Followups table (officer-owned)
create table if not exists public.crm_lead_followups (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  sheet_name text not null,
  sheet_lead_id text not null,

  officer_user_id uuid not null references auth.users(id) on delete cascade,
  officer_name text null,

  sequence int null,
  channel text null,
  scheduled_at timestamptz null,
  actual_at timestamptz null,
  answered boolean null,
  comment text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_lead_followups_lead_lookup_idx
  on public.crm_lead_followups(batch_name, sheet_name, sheet_lead_id);

create index if not exists crm_lead_followups_officer_idx
  on public.crm_lead_followups(officer_user_id, created_at desc);

create index if not exists crm_lead_followups_lead_officer_idx
  on public.crm_lead_followups(batch_name, sheet_name, sheet_lead_id, officer_user_id, created_at desc);

-- Optional: prevent duplicates per officer+lead+sequence
create unique index if not exists crm_lead_followups_unique_seq
  on public.crm_lead_followups(batch_name, sheet_name, sheet_lead_id, officer_user_id, sequence)
  where sequence is not null;

-- 2) RLS
alter table public.crm_lead_followups enable row level security;

-- Officers can read/write only their own followups
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_lead_followups'
      and policyname = 'followups_select_own'
  ) then
    execute 'create policy "followups_select_own" on public.crm_lead_followups for select using (auth.uid() = officer_user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_lead_followups'
      and policyname = 'followups_insert_own'
  ) then
    execute 'create policy "followups_insert_own" on public.crm_lead_followups for insert with check (auth.uid() = officer_user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_lead_followups'
      and policyname = 'followups_update_own'
  ) then
    execute 'create policy "followups_update_own" on public.crm_lead_followups for update using (auth.uid() = officer_user_id) with check (auth.uid() = officer_user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_lead_followups'
      and policyname = 'followups_delete_own'
  ) then
    execute 'create policy "followups_delete_own" on public.crm_lead_followups for delete using (auth.uid() = officer_user_id)';
  end if;
end $$;

-- 3) updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_followups_set_updated_at on public.crm_lead_followups;
create trigger trg_followups_set_updated_at
before update on public.crm_lead_followups
for each row execute function public.set_updated_at();
