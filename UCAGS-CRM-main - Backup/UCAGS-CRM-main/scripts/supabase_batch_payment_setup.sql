-- Batch-specific payment setup
-- Run in Supabase SQL editor

create table if not exists public.batch_payment_methods (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  method_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(batch_name, method_name)
);

create table if not exists public.batch_payment_plans (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  plan_name text not null,
  installment_count int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(batch_name, plan_name)
);

create table if not exists public.batch_payment_installments (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  plan_id uuid not null,
  installment_no int not null,
  due_date date not null,
  created_at timestamptz not null default now(),
  unique(plan_id, installment_no)
);

create index if not exists batch_payment_methods_batch_idx on public.batch_payment_methods(batch_name);
create index if not exists batch_payment_plans_batch_idx on public.batch_payment_plans(batch_name);
create index if not exists batch_payment_installments_plan_idx on public.batch_payment_installments(plan_id);
