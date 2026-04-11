-- Payments table for registrations/leads
-- Run in Supabase SQL editor

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid null,

  payment_plan text not null,
  payment_date date null,
  amount numeric(12,2) not null,
  receipt_received boolean not null default false,

  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists payments_registration_id_idx
  on public.payments(registration_id);

create index if not exists payments_created_at_idx
  on public.payments(created_at desc);

-- Foreign key is optional (kept off by default to avoid breaking if registrations id type differs)
-- alter table public.payments
--   add constraint payments_registration_id_fkey
--   foreign key (registration_id) references public.registrations(id) on delete set null;
