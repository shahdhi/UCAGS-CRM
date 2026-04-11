-- Programs + Program Batches
-- Run in Supabase SQL editor

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.program_batches (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  batch_name text not null,
  is_current boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(program_id, batch_name)
);

create index if not exists program_batches_program_id_idx on public.program_batches(program_id);
create index if not exists program_batches_current_idx on public.program_batches(program_id, is_current);

-- Ensure only one current batch per program (partial unique index)
create unique index if not exists program_batches_one_current_per_program
  on public.program_batches(program_id)
  where is_current;

-- Foreign key (optional)
-- alter table public.program_batches
--   add constraint program_batches_program_id_fkey
--   foreign key (program_id) references public.programs(id) on delete cascade;
