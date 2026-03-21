-- Shared sheet tabs per batch (admin-created, visible to all)
-- Run in Supabase SQL editor

create table if not exists public.batch_shared_sheets (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  sheet_name text not null,
  created_by text null,
  created_at timestamptz not null default now(),
  unique(batch_name, sheet_name)
);

create index if not exists batch_shared_sheets_batch_idx
  on public.batch_shared_sheets(batch_name);
