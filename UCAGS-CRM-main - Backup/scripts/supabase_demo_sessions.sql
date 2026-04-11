-- Demo Sessions feature tables
-- Generated: 2026-02-26

-- Enable required extensions (usually already enabled in Supabase)
-- create extension if not exists "uuid-ossp";

-- =========================
-- demo_sessions
-- One row per demo session per batch (Demo 1..n)
-- =========================
create table if not exists public.demo_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  demo_number int not null,
  title text,
  scheduled_at timestamptz,
  meeting_link text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_name, demo_number)
);

create index if not exists demo_sessions_batch_idx on public.demo_sessions(batch_name);

-- =========================
-- demo_session_invites
-- One row per (session, lead)
-- =========================
create table if not exists public.demo_session_invites (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid not null references public.demo_sessions(id) on delete cascade,

  -- Assigned officer (so admin/officer filtering works like leads)
  officer_user_id uuid,

  -- Reference crm_leads row (Supabase internal id)
  crm_lead_id uuid,

  -- Denormalized lead identifiers for resilience
  batch_name text,
  sheet_name text,
  sheet_lead_id text,

  -- Denormalized contact snapshot
  name text,
  contact_number text,

  invite_status text not null default 'Invited',
  attendance text not null default 'Unknown',
  response text not null default 'Pending',

  comments_after_inauguration text,
  link text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (demo_session_id, crm_lead_id)
);

-- If the table already existed from a previous deployment, ensure new columns exist
alter table public.demo_session_invites add column if not exists officer_user_id uuid;

create index if not exists demo_invites_session_idx on public.demo_session_invites(demo_session_id);
create index if not exists demo_invites_officer_idx on public.demo_session_invites(officer_user_id);
create index if not exists demo_invites_batch_idx on public.demo_session_invites(batch_name);

-- =========================
-- demo_invite_reminders
-- Variable number of reminders per invite
-- =========================
create table if not exists public.demo_invite_reminders (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.demo_session_invites(id) on delete cascade,
  reminder_number int,
  note text,
  sent_at timestamptz default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists demo_reminders_invite_idx on public.demo_invite_reminders(invite_id);

-- Helpful trigger-like convention: apps should set updated_at manually on updates.
