-- Batch Setup schema (coordinator, payments, demo sessions archive)
-- Generated: 2026-02-27

-- 1) Add coordinator to program_batches (program-specific batch row)
alter table if exists public.program_batches
  add column if not exists coordinator_user_id uuid;

-- 2) Add demo sessions count to program_batches
alter table if exists public.program_batches
  add column if not exists demo_sessions_count int not null default 4;

-- 3) Demo sessions: archived flag
alter table if exists public.demo_sessions
  add column if not exists archived boolean not null default false;

create index if not exists demo_sessions_archived_idx on public.demo_sessions(batch_name, archived);

-- 4) Payment setup tables (normalized)
create table if not exists public.batch_payment_plans (
  id uuid primary key default gen_random_uuid(),
  program_id text,
  batch_name text not null,
  registration_fee numeric,
  full_payment_amount numeric,
  currency text default 'LKR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_name)
);

create table if not exists public.batch_payment_installments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.batch_payment_plans(id) on delete cascade,
  title text not null,
  amount numeric not null,
  due_date date,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists batch_payment_installments_plan_idx on public.batch_payment_installments(plan_id);
