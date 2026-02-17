-- Supabase table for public website registrations
-- Run in Supabase SQL editor

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  gender text null,
  date_of_birth text null,
  address text null,
  country text null,
  phone_number text not null,
  wa_number text null,
  email text null,
  working_status text null,
  course_program text null,

  source text null,
  payload jsonb null,

  created_at timestamptz not null default now()
);

create index if not exists registrations_created_at_idx
  on public.registrations(created_at desc);

create index if not exists registrations_phone_idx
  on public.registrations(phone_number);

create index if not exists registrations_email_idx
  on public.registrations(email);

-- Optional: allow public insert via anon if you ever switch from server-side insert to client-side.
-- For current architecture, inserts are done via backend using service-role, so RLS isn't strictly required.
-- If you enable RLS, ensure backend uses service role or add appropriate policies.
-- alter table public.registrations enable row level security;
